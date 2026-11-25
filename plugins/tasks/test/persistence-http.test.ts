import { issueMcpCredential, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isHuhuError, newId, PlanWriteResultSchema, TaskPatchSchema, TaskWritableSchema, toJsonSchema, type ExecutionBinding, type ExecutionReceipt, type PlanSummary, type PlanWrite, type TaskDto } from "@huhu/contracts";
import { executionReceiptIdentity } from "@huhu/contracts/execution-receipt/engine";
import { importPackage, machineId, VaultFiles, versionOf } from "@huhu/vault";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import type { AgentCliOptions } from "../../agent-cli/src/engine/index.js";
import { SessionsService } from "../../agent-cli/src/engine/sessions.js";
import type { FollowUps } from "../../automations/src/engine/follow-ups.js";
import type { TaskDispatchExecutor } from "../src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord, RuleSource } from "../src/engine/dispatch-store.js";
import type { TaskRuleDispatch } from "../src/engine/index.js";
import { TaskReceiptInbox } from "../src/engine/receipt-inbox.js";
import { externalEntries, externalToolEntry } from "./external-tool-entry.js";
import { TasksService } from "../src/engine/service.js";
import { dispatchSnapshotText } from "../src/engine/dispatch-store.js";
import { githubAuthor, githubCommentEvent, githubIssue, githubIssueEvent, githubRepository } from "./github-fixture.js";

const dirs: string[] = [];
const engines: RunningEngine[] = [];
const fixture: { now?: Date; executor?: TaskDispatchExecutor; rule?: TaskRuleDispatch; errors: unknown[]; checkMs?: number; followUpClock?: boolean; followUps?: FollowUps } = { errors: [] };
let mailOutboxFixture: { submit(input: { draftId: string; expectedRevision: string }): Promise<{ operationId: string; messageId: string }> } | undefined;
let targetProviders: AgentCliOptions["dispatchProviders"];

vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const agent = await original<typeof import("../../agent-cli/src/engine/index.js")>();
  return {
    ...agent,
    apply: ((ctx, api, opts) => agent.apply(ctx, api, { ...opts, ...(targetProviders && { dispatchProviders: targetProviders }) })) satisfies typeof agent.apply,
  };
});

vi.mock("@huhu/plugin-tasks/engine", async (original) => {
  const tasks = await original<typeof import("../src/engine/index.js")>();
  return {
    ...tasks,
    apply: ((ctx, api, opts) =>
      tasks.apply(
        ctx,
        {
          ...api,
          service<T>(name: string) {
            return name === "mail.outbox" && mailOutboxFixture ? mailOutboxFixture as T : api.service<T>(name);
          },
          provide(name, service) {
            api.provide(name, service);
            if (name === "taskDispatch") fixture.rule = service as TaskRuleDispatch;
          },
        },
        {
          ...opts,
          now: () => fixture.now ?? new Date(),
          dispatchExecutor: fixture.executor ?? null,
          dispatchCheckMs: fixture.checkMs ?? 50,
          onError: (error) => fixture.errors.push(error),
        },
      )) satisfies typeof tasks.apply,
  };
});

vi.mock("../../automations/src/engine/index.js", async (original) => {
  const automations = await original<typeof import("../../automations/src/engine/index.js")>();
  return {
    ...automations,
    apply: ((ctx, api, opts) => {
      if (!fixture.followUpClock) return automations.apply(ctx, api, opts);
      return automations.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === "taskFollowUps") fixture.followUps = service as FollowUps;
          },
        },
        { ...opts, schedule: false, now: () => fixture.now! },
      );
    }) satisfies typeof automations.apply,
  };
});

vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(() => {
    throw new Error("保存任务不得启动子进程");
  }),
}));

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  delete fixture.now;
  delete fixture.executor;
  delete fixture.rule;
  delete fixture.checkMs;
  delete fixture.followUpClock;
  delete fixture.followUps;
  mailOutboxFixture = undefined;
  fixture.errors.length = 0;
  targetProviders = undefined;
});

async function start(vaultPath: string, create = false, readOnly = false) {
  const engine = await boot({ vaultPath, create, readOnly });
  engines.push(engine);
  return engine;
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
}

function tempVault() {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-tasks-http-"));
  dirs.push(dir);
  return dir;
}

async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown, token = engine.rendererToken, idempotencyKey = randomUUID()) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey }),
  });
  return (await response.json()) as { ok: boolean; data: T; error?: { code: string; details?: Record<string, unknown> } };
}

test("旧 inputHash 不能覆盖读取后从 Markdown 修改的可写字段", { timeout: 30_000 }, async () => {
  const engine = await start(tempVault(), true);
  const { data: task } = await call<TaskDto>(engine, "tasks.create", { title: "原始标题", body: "原正文" });
  const file = path.join(engine.vault.root, task.path);
  const oldText = readFileSync(file, "utf8");
  const externalText = oldText.replace("title: 原始标题", "title: 外部标题");
  expect(externalText).not.toBe(oldText);
  writeFileSync(file, externalText);
  const { data: external } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(external).toMatchObject({ title: "外部标题", inputHash: task.inputHash });
  expect(external.version).not.toBe(task.version);
  expect(external.editHash).not.toBe(task.editHash);

  for (const baseEditHash of [undefined, task.editHash]) {
    const response = await call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: task.version, baseInputHash: task.inputHash, baseEditHash, patch: { title: "编辑器标题" } });
    const { data: after } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
    expect({ ok: response.ok, code: response.error?.code, title: after.title }).toEqual({ ok: false, code: "VERSION_CONFLICT", title: "外部标题" });
    expect(readFileSync(file, "utf8")).toBe(externalText);
  }
});

test("完整编辑请求合并评论与区段外的 Markdown 字节", { timeout: 30_000 }, async () => {
  const engine = await start(tempVault(), true);
  const { data: task } = await call<TaskDto>(engine, "tasks.create", { title: "待编辑", body: "旧正文" });
  const file = path.join(engine.vault.root, task.path);
  expect(await call(engine, "tasks.comments.add", { taskId: task.id, body: "保存前到达的评论" })).toMatchObject({ ok: true });
  const prefix = "\r\n区段前的内容  \r\n\r\n";
  const suffix = "\r\n区段后的内容\t  \r\n";
  const outside = readFileSync(file, "utf8").replace("\n<task>", `${prefix}<task>`) + suffix;
  writeFileSync(file, outside);

  const { data: latest } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(latest.version).not.toBe(task.version);
  expect(latest.editHash).toBe(task.editHash);
  const result = await call<TaskDto>(engine, "tasks.update", {
    id: task.id,
    expectedVersion: task.version,
    baseEditHash: task.editHash,
    patch: { title: task.title, type: task.type, body: "更新正文", tags: ["已编辑"], due: task.due, project: task.project, execution: task.execution },
  });
  expect(result).toMatchObject({ ok: true, data: { body: "更新正文", tags: ["已编辑"], inputRevision: 2, comments: [{ body: "保存前到达的评论" }] } });
  const saved = readFileSync(file);
  expect(saved.includes(Buffer.from(prefix))).toBe(true);
  const commentsAndSuffix = Buffer.from(outside.slice(outside.indexOf("<comments>")));
  expect(saved.subarray(-commentsAndSuffix.length)).toEqual(commentsAndSuffix);
});

test("同一编辑快照并行提交不同正文时，一次成功且一次冲突", { timeout: 30_000 }, async () => {
  const engine = await start(tempVault(), true);
  const { data: task } = await call<TaskDto>(engine, "tasks.create", { title: "并行编辑", body: "旧正文" });
  const base = { id: task.id, expectedVersion: task.version, baseEditHash: task.editHash };
  const results = await Promise.all(["第一份正文", "第二份正文"].map((body) => call<TaskDto>(engine, "tasks.update", { ...base, patch: { body } })));
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([expect.objectContaining({ error: expect.objectContaining({ code: "VERSION_CONFLICT" }) })]);
  const saved = results.find((result) => result.ok)!.data;
  expect(saved.inputRevision).toBe(task.inputRevision + 1);
  expect(saved.inputHash).not.toBe(task.inputHash);
  expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: saved });
  expect(readFileSync(path.join(engine.vault.root, task.path), "utf8")).toContain(saved.body);
});

test.each(["comment", "edit"])("正文和评论并行提交均持久保存（先发 %s）", { timeout: 30_000 }, async (first) => {
  const engine = await start(tempVault(), true);
  const { data: task } = await call<TaskDto>(engine, "tasks.create", { title: "并行评论", body: "旧正文" });
  const edit = () => call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: task.version, baseEditHash: task.editHash, patch: { body: "并发更新的正文" } });
  const comment = () => call(engine, "tasks.comments.add", { taskId: task.id, body: "并发追加的评论" });
  const results = await Promise.all(first === "comment" ? [comment(), edit()] : [edit(), comment()]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: { body: "并发更新的正文", inputRevision: task.inputRevision + 1, comments: [{ body: "并发追加的评论" }] } });
  const saved = readFileSync(path.join(engine.vault.root, task.path), "utf8");
  expect(saved).toContain("并发更新的正文");
  expect(saved).toContain("并发追加的评论");
});

const invalidBodies = ["\ud800", "\udfff", "\udc00\ud800"];

test("创建时拒绝无效 UTF-16 正文，合法中文、emoji 与 CRLF 可重开", { timeout: 30_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  const { data: seed } = await call<TaskDto>(engine, "tasks.create", { title: "原任务", body: "原正文" });
  const file = path.join(root, seed.path);
  const before = readFileSync(file);
  const files = readdirSync(path.dirname(file));
  const rejected = await Promise.all(invalidBodies.map((invalid) => call(engine, "tasks.create", { title: "无效正文", body: invalid })));
  expect(rejected).toEqual(invalidBodies.map(() => expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "INVALID_INPUT" }) })));
  expect(readdirSync(path.dirname(file))).toEqual(files);
  expect(readFileSync(file)).toEqual(before);
  const body = "中文😀\r\n第二行🌱";
  const created = await call<TaskDto>(engine, "tasks.create", { title: "UTF-8 创建", body });
  expect(created).toMatchObject({ ok: true, data: { body, inputRevision: 1 } });
  expect(readFileSync(path.join(root, created.data.path)).includes(Buffer.from(body))).toBe(true);
  await stop(engine);
  const reopened = await start(root);
  expect(await call(reopened, "tasks.read", { id: created.data.id })).toMatchObject({ ok: true, data: created.data });
  expect(spawn).not.toHaveBeenCalled();
});

test("更新时拒绝无效 UTF-16 正文且保留全部字节和输入身份", { timeout: 30_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  const { data: task } = await call<TaskDto>(engine, "tasks.create", { title: "UTF-8 更新", body: "\ufffd" });
  const file = path.join(root, task.path);
  const before = readFileSync(file);
  const update = (body: string) => call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: task.version, patch: { body } });
  for (const body of invalidBodies) {
    expect(await update(body)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(file)).toEqual(before);
    expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: task });
  }
  const body = "修改😀\r\n保留 CRLF 和中文";
  const changed = await update(body);
  expect(changed).toMatchObject({ ok: true, data: { body, inputRevision: task.inputRevision + 1 } });
  expect(changed.data.inputHash).not.toBe(task.inputHash);
  expect(readFileSync(file).includes(Buffer.from(body))).toBe(true);
  await stop(engine);
  const reopened = await start(root);
  expect(await call(reopened, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: changed.data });
  expect(spawn).not.toHaveBeenCalled();
});

test.each(["", "u"])("创建和更新的正文 JSON Schema 可校验 UTF-16（regex flags %j）", (flags) => {
  for (const schema of [TaskWritableSchema, TaskPatchSchema]) {
    const { pattern } = (toJsonSchema(schema) as { properties: { body: { pattern?: string } } }).properties.body;
    expect(pattern).toEqual(expect.any(String));
    const check = new RegExp(pattern!, flags);
    for (const valid of ["", "中文😀\r\n合法正文", "\ufffd", "\r\n"]) expect(check.test(valid)).toBe(true);
    for (const invalid of invalidBodies) expect(check.test(`${invalid}\r\n`)).toBe(false);
  }
});

test("inputRevision 只随持久化后的任务正文变化", { timeout: 30_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  const { data: original } = await call<TaskDto>(engine, "tasks.create", { title: "任务", body: "原正文" });
  const update = (task: TaskDto, body: string) => call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: task.version, patch: { body } });

  const padded = await update(original, "\r\n\n原正文\n\r\n");
  expect(padded).toMatchObject({ ok: true, data: { body: original.body, inputHash: original.inputHash, inputRevision: original.inputRevision } });

  const changed = await update(padded.data, "\n新正文\n");
  expect(changed).toMatchObject({ ok: true, data: { body: "新正文", inputRevision: original.inputRevision + 1 } });
  expect(changed.data.inputHash).not.toBe(original.inputHash);
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
  const reopened = await start(root);
  expect(await call(reopened, "tasks.read", { id: original.id })).toMatchObject({
    ok: true,
    data: { body: changed.data.body, inputHash: changed.data.inputHash, inputRevision: changed.data.inputRevision },
  });
  expect(spawn).not.toHaveBeenCalled();
});

test("Human、缺配 Agent 和显式已有会话在重启后可读，保存或评论零启动", { timeout: 30_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  mkdirSync(path.join(root, "Notes"), { recursive: true });
  writeFileSync(path.join(root, "Notes/reference.md"), "# 测试引用\n");
  const human = await call<TaskDto>(engine, "tasks.create", { title: "默认人工任务" });
  expect(human).toMatchObject({ ok: true, data: { type: "human", status: "not_started", origin: { kind: "desktop" }, execution: null } });
  const spaces = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
  const spaceId = spaces.data[0]!.id;
  const agent = await call<TaskDto>(engine, "tasks.create", {
    title: "缺工作目录的 Agent",
    type: "agent",
    body: "请查 [[Notes/reference.md]] 和 [[Notes/]]",
    execution: { provider: "codex", model: "fixture-model", effort: "high", fast: true },
  });
  expect(agent).toMatchObject({ ok: true, data: { type: "agent", status: "not_started", execution: { spaceId: null, provider: "codex", model: "fixture-model", effort: "high", fast: true, target: { mode: "new" } } } });
  expect(agent.data.dispatchBlockers).toContain("没有选择工作目录（Space）");
  expect(readFileSync(path.join(root, agent.data.path), "utf8")).toMatch(/target:\n +mode: new/);
  const noConfig = await call<TaskDto>(engine, "tasks.create", { title: "未配置 Agent", type: "agent" });
  expect(noConfig).toMatchObject({ ok: true, data: { execution: { spaceId: null, provider: null, target: { mode: "new" } } } });

  const existingConfig = { spaceId, provider: "codex", target: { mode: "existing", sessionId: "fixture-huhu-session" } };
  const existing = await call<TaskDto>(engine, "tasks.create", { title: "已有会话", type: "agent", body: "一轮任务", execution: existingConfig });
  expect(existing).toMatchObject({ ok: true, data: { execution: existingConfig } });
  expect(existing.data.dispatchBlockers).toEqual([]);
  expect(await call(engine, "tasks.create", { title: "无会话", type: "agent", execution: { target: { mode: "existing" } } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call(engine, "tasks.create", { title: "冲突会话", type: "agent", execution: { target: { mode: "new", sessionId: "fixture-huhu-session" } } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

  const patched = await call<TaskDto>(engine, "tasks.update", { id: existing.data.id, expectedVersion: existing.data.version, patch: { tags: ["合成"] } });
  expect(patched).toMatchObject({ ok: true, data: { execution: existingConfig, inputRevision: 1, inputHash: existing.data.inputHash } });
  const formConfig = { spaceId, provider: "codex", model: null, effort: null, fast: false };
  const formSaved = await call<TaskDto>(engine, "tasks.update", { id: existing.data.id, expectedVersion: patched.data.version, patch: { execution: formConfig } });
  expect(formSaved).toMatchObject({ ok: true, data: { execution: existingConfig, inputRevision: 1, inputHash: existing.data.inputHash } });
  expect(readFileSync(path.join(root, existing.data.path), "utf8")).toMatch(/target:\n +mode: existing\n +sessionId: fixture-huhu-session/);

  const discussion = { taskId: agent.data.id, body: "外部普通讨论" };
  expect(await call(engine, "tasks.comments.add", discussion, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  for (const capability of ["tasks.create", "tasks.comments.add"]) {
    expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
  }
  expect(await call(engine, "tasks.create", { title: "外部 Agent", type: "agent", execution: existingConfig }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await call(engine, "tasks.create", { title: "外部代填运行配置", execution: existingConfig }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  const forged = { id: "fake-result", source: "agent", author: "伪造作者", run: "fake-run", ask: "fake-ask", session: "fake-session", event: "result" };
  const added = await call<{ comment: TaskDto["comments"][number] }>(engine, "tasks.comments.add", { ...discussion, ...forged }, engine.cliToken);
  expect(added).toMatchObject({ ok: true, data: { added: true, comment: { body: discussion.body, source: "external", author: "cli" } } });
  const { comment } = added.data;
  expect(comment.id).not.toBe(forged.id);
  for (const field of ["run", "ask", "session", "event"]) expect(comment).not.toHaveProperty(field);
  expect(await call(engine, "tasks.comments.add", { taskId: human.data.id, body: "外部讨论", source: "agent", run: "fixture-run" }, engine.cliToken)).toMatchObject({ ok: true, data: { comment: { source: "external" } } });

  const completed = await call<TaskDto>(engine, "tasks.setStatus", { id: human.data.id, expectedVersion: (await call<TaskDto>(engine, "tasks.read", { id: human.data.id })).data.version, status: "completed" });
  expect(completed).toMatchObject({ ok: true, data: { status: "completed" } });
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
  const reopened = await start(root);
  expect(await call(reopened, "tasks.read", { id: agent.data.id })).toMatchObject({
    ok: true,
    data: {
      id: agent.data.id,
      type: "agent",
      status: "not_started",
      body: agent.data.body,
      execution: agent.data.execution,
      inputHash: agent.data.inputHash,
      inputRevision: agent.data.inputRevision,
      comments: [comment],
      references: [
        { path: "Notes/reference.md", kind: "file", exists: true, from: "task" },
        { path: "Notes/", kind: "folder", exists: true, from: "task" },
      ],
    },
  });
  expect(await call(reopened, "tasks.read", { id: existing.data.id })).toMatchObject({ ok: true, data: { execution: existingConfig } });
  expect(await call(reopened, "tasks.list", { status: ["completed"] })).toMatchObject({ ok: true, data: [{ id: human.data.id, status: "completed" }] });
  expect(await call(reopened, "tasks.runs", { id: agent.data.id })).toMatchObject({ ok: true, data: [] });
  expect(existsSync(path.join(root, "Task Runs"))).toBe(false);
  expect(spawn).not.toHaveBeenCalled();
});

async function createDispatchable(engine: RunningEngine, title = "派遣夹具") {
  const spaces = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
  const task = await call<TaskDto>(engine, "tasks.create", {
    title,
    type: "agent",
    body: "原输入 [[Notes/]]",
    execution: { spaceId: spaces.data[0]!.id, provider: "codex", model: "fixture-model" },
  });
  expect(task.ok).toBe(true);
  return task.data;
}

function intent(task: TaskDto, dispatchId: string = randomUUID()) {
  return { taskId: task.id, dispatchId, expectedVersion: task.version, inputHash: task.inputHash, inputRevision: task.inputRevision };
}

async function acceptDispatch(engine: RunningEngine, input: ReturnType<typeof intent>) {
  const response = await call<DispatchReceipt>(engine, "tasks.dispatch", input);
  expect(response).toMatchObject({ ok: true, data: { state: "pending", attempt: 1 } });
  return response.data;
}

function rule(ruleId: string): RuleSource {
  return { kind: "automation", ruleId, ruleVersion: "v1", occurrenceId: `${ruleId}-occurrence`, instructions: "合成规则输入" };
}

function recordFile(engine: RunningEngine, eventId: string) {
  return path.join(engine.vault.stateDir, "tasks", "dispatches", `${eventId}.json`);
}

function recordOf(engine: RunningEngine, receipt: DispatchReceipt): DispatchRecord {
  return JSON.parse(readFileSync(recordFile(engine, receipt.eventId), "utf8")) as DispatchRecord;
}

async function waitDispatch(engine: RunningEngine, key: { taskId: string; dispatchId: string }, expected: Partial<DispatchReceipt>) {
  const lookup = { taskId: key.taskId, dispatchId: key.dispatchId };
  await vi.waitFor(
    async () => {
      expect(await call<DispatchReceipt>(engine, "tasks.dispatch.read", lookup)).toMatchObject({ ok: true, data: expected });
    },
    { timeout: 5_000 },
  );
}

function executor(): TaskDispatchExecutor {
  return {
    ready: vi.fn<TaskDispatchExecutor["ready"]>().mockResolvedValue("ready"),
    dispatch: vi.fn<TaskDispatchExecutor["dispatch"]>().mockResolvedValue("accepted"),
    inspect: vi.fn<TaskDispatchExecutor["inspect"]>().mockResolvedValue("unknown"),
  };
}

test("最早派遣按显式时区保存，只有工作台可以提前派遣当前时刻", { timeout: 60_000 }, async () => {
  const root = tempVault();
  fixture.now = new Date("2026-11-20T02:00:00Z");
  const fake = executor();
  const ready = vi.fn<TaskDispatchExecutor["ready"]>().mockResolvedValue("busy");
  fake.ready = ready;
  fixture.executor = fake;
  const first = await start(root, true);
  const [space] = (await call<{ id: string }[]>(first, "agent.spaces.list", {})).data;
  const create = (engine: RunningEngine, availableAt: string) =>
    call<TaskDto>(engine, "tasks.create", { title: "有最早派遣时间", type: "agent", body: "合成任务", due: "2026-11-23", availableAt, execution: { spaceId: space!.id, provider: "codex" } });
  expect(await create(first, "2026-11-21T09:00:00")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const created = await create(first, "2026-11-21T09:00:00+08:00");
  expect(created).toMatchObject({ ok: true, data: { availableAt: "2026-11-21T01:00:00.000Z", due: "2026-11-23" } });
  await stop(first);

  const engine = await start(root);
  const task = (await call<TaskDto>(engine, "tasks.read", { id: created.data.id })).data;
  expect(task).toMatchObject({ availableAt: "2026-11-21T01:00:00.000Z", due: "2026-11-23" });
  const request = intent(task);
  expect(await call(engine, "tasks.dispatch", request)).toMatchObject({ ok: false, error: { details: { reason: "not_due" } } });
  await expect(fixture.rule!.acceptRule({ ...request, allowEarly: true }, rule("scheduled"))).rejects.toMatchObject({ details: { reason: "not_due" } });
  expect(await call(engine, "tasks.dispatch.read", { taskId: task.id, dispatchId: request.dispatchId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

  const early = await call<DispatchReceipt>(engine, "tasks.dispatch", { ...request, allowEarly: true });
  expect(early).toMatchObject({ ok: true, data: { overriddenAvailableAt: task.availableAt, state: "pending" } });
  expect(recordOf(engine, early.data).snapshot.source.kind).toBe("desktop");
  await waitDispatch(engine, early.data, { state: "pending", reason: "waiting_resource" });
  const shifted = await call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: task.version, patch: { availableAt: "2026-11-21T18:00:00+08:00" } });
  expect(shifted).toMatchObject({ ok: true, data: { availableAt: "2026-11-21T10:00:00.000Z", inputHash: task.inputHash, inputRevision: task.inputRevision } });
  ready.mockResolvedValue("ready");
  await waitDispatch(engine, early.data, { state: "stale_input", reason: "waiting_schedule" });
  expect(await call(engine, "plugins.setEnabled", { id: "automations", enabled: false })).toMatchObject({ ok: true });
  expect(fake.dispatch).not.toHaveBeenCalled();
  fixture.now = new Date("2026-11-21T10:00:00Z");
  await waitDispatch(engine, early.data, { state: "stale_input", reason: "waiting_schedule" });
  const immediate = await acceptDispatch(engine, intent(shifted.data));
  await waitDispatch(engine, immediate, { state: "running", reason: null });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);

  const later = await create(engine, "2026-11-23T09:00:00+08:00");
  const next = await call<DispatchReceipt>(engine, "tasks.dispatch", { ...intent(later.data), allowEarly: true });
  expect(next).toMatchObject({ ok: true, data: { overriddenAvailableAt: later.data.availableAt } });
  await waitDispatch(engine, next.data, { state: "running", reason: null });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);

  const clear = await create(engine, "2026-11-23T10:00:00+08:00");
  expect(await call(engine, "tasks.update", { id: clear.data.id, expectedVersion: clear.data.version, patch: { availableAt: null } })).toMatchObject({
    ok: true,
    data: { availableAt: null, due: "2026-11-23" },
  });
});

async function startBoundRun() {
  const root = tempVault();
  const fake = executor();
  fixture.executor = fake;
  const engine = await start(root, true);
  let bound: ExecutionBinding | undefined;
  fake.dispatch = vi.fn<TaskDispatchExecutor["dispatch"]>().mockImplementation(async ({ snapshot, dispatchId, runId, attempt }) => {
    bound = {
      vaultId: engine.vault.id,
      taskId: snapshot.taskId,
      dispatchId,
      runId,
      attempt,
      sessionBinding: { machineId: machineId(), sessionId: "fixture-session", coreId: "fixture-core", coreAddress: "t2", processGeneration: "fixture-generation", provider: "codex", nativeSessionId: "fixture-thread" },
    };
    return { state: "accepted", execution: bound };
  });
  const task = await createDispatchable(engine);
  const run = await acceptDispatch(engine, intent(task));
  await waitDispatch(engine, run, { state: "running" });
  expect(bound).toBeDefined();
  return { root, fake, engine, task, run, execution: bound! };
}

function submitReceipt(engine: RunningEngine, receipt: ExecutionReceipt) {
  return engine.dispatcher.call("plugin:agent-cli", { capability: "tasks.receipts.consume", input: receipt, requestId: randomUUID(), idempotencyKey: receipt.receiptId });
}

test("TW6 明确的新轮次从选中的消息和产物版本继续，保持任务输入修订", async () => {
  const { root, engine, task, fake, run, execution } = await startBoundRun();
  await vi.waitFor(async () => expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ data: { status: "in_progress" } }));
  const active = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(await call(engine, "tasks.dispatch", { ...intent(active.data), newRound: true })).toMatchObject({ ok: false, error: { details: { reason: "task_occupied" } } });
  expect(await submitReceipt(engine, { version: 1, kind: "no_update", receiptId: "tw6-first-ended", execution, payload: {} })).toMatchObject({ ok: true });
  mkdirSync(path.join(root, "Notes"), { recursive: true });
  const artifactPath = "Notes/progress.txt";
  const artifact = path.join(root, artifactPath);
  const saved = "checked fixture output";
  writeFileSync(artifact, saved);
  const { data: summary } = await call<{ comment: { id: string } }>(engine, "tasks.comments.add", { taskId: task.id, body: `已完成首轮，下一步使用 [[${artifactPath}]]。` });
  await call(engine, "tasks.comments.add", { taskId: task.id, body: "这段消息不在选取范围内。" });
  const { data: updated } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(updated).toMatchObject({ body: task.body, inputRevision: task.inputRevision, inputHash: task.inputHash });
  const request = { ...intent(updated), newRound: true, context: { messageIds: [summary.comment.id], artifacts: [{ path: artifactPath, expectedVersion: versionOf(Buffer.from(saved)) }] } };
  expect(await call(engine, "tasks.dispatch", { ...request, context: { ...request.context, artifacts: [{ path: artifactPath, expectedVersion: "stale" }] } })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  vi.mocked(fake.ready).mockResolvedValue("busy");
  const { data: next } = await call<DispatchReceipt>(engine, "tasks.dispatch", request);
  expect(next).toMatchObject({ parentRunId: run.runId, attempt: 1 });
  expect(next.runId).not.toBe(run.runId);
  writeFileSync(artifact, "changed after acceptance");
  await stop(engine);
  const reopened = await start(root);
  expect(await call(reopened, "tasks.dispatch", request)).toMatchObject({ ok: true, data: { runId: next.runId } });
  vi.mocked(fake.dispatch).mockResolvedValue({ state: "accepted", execution: { ...execution, dispatchId: next.dispatchId, runId: next.runId, sessionBinding: { ...execution.sessionBinding, sessionId: "fixture-new-session", nativeSessionId: "fixture-new-thread" } } });
  vi.mocked(fake.ready).mockResolvedValue("ready");
  await waitDispatch(reopened, next, { state: "running" });
  const { snapshot, boundExecution } = recordOf(reopened, next);
  expect(boundExecution?.sessionBinding).toMatchObject({ sessionId: "fixture-new-session", nativeSessionId: "fixture-new-thread" });
  expect(snapshot.context?.artifacts).toEqual([{ path: artifactPath, version: request.context.artifacts[0]!.expectedVersion, expectedVersion: request.context.artifacts[0]!.expectedVersion, text: saved }]);
  expect(dispatchSnapshotText(snapshot)).toContain(saved);
  expect(dispatchSnapshotText(snapshot)).toContain("已完成首轮");
  expect(dispatchSnapshotText(snapshot)).not.toContain("这段消息不在选取范围");
  expect(dispatchSnapshotText(snapshot)).not.toContain("changed after acceptance");
});

test.skipIf(!process.getuid)("TW6 本机名额在两个 Vault 的规则之间共享，原生等待释放活动但未知仍占位", async () => {
  const config = tempVault();
  vi.stubEnv("XDG_CONFIG_HOME", config);
  mkdirSync(path.join(config, "huhu"));
  writeFileSync(path.join(config, "huhu", "dispatch-limits.json"), JSON.stringify({ active: 1, retained: 2 }));
  const fake = executor();
  fixture.executor = fake;
  const first = await start(tempVault(), true);
  const firstRules = fixture.rule!;
  const second = await start(tempVault(), true);
  const secondRules = fixture.rule!;
  const a = await createDispatchable(first, "第一 Vault 的运行");
  const b = await createDispatchable(second, "第二 Vault 的运行");
  const bound = new Map<string, ExecutionBinding & { sessionBinding: { nativeSessionId: string } }>();
  fake.dispatch = vi.fn<TaskDispatchExecutor["dispatch"]>().mockImplementation(async ({ snapshot, dispatchId, runId, attempt }) => {
    if (snapshot.taskId === b.id) return "unknown";
    const execution = { vaultId: first.vault.id, taskId: snapshot.taskId, dispatchId, runId, attempt, sessionBinding: { machineId: machineId(), sessionId: `session-${runId}`, coreId: "fixture-core", coreAddress: "t2", processGeneration: runId, provider: "codex", nativeSessionId: `thread-${runId}` } } satisfies ExecutionBinding;
    bound.set(runId, execution);
    return { state: "accepted", execution };
  });
  const r1 = await firstRules.acceptRule(intent(a), rule("device-first"));
  await waitDispatch(first, r1, { state: "running" });
  const r2 = await secondRules.acceptRule(intent(b), rule("device-second"));
  await waitDispatch(second, r2, { reason: "waiting_resource" });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await submitReceipt(first, { version: 1, receiptId: "device-question", kind: "question", execution: bound.get(r1.runId)!, payload: { mode: "native_deferred", requestId: "device-question", requestVersion: 1, nativeRequestId: "device-native", text: "等待", options: ["一"] } })).toMatchObject({ ok: true });
  await waitDispatch(second, r2, { state: "unknown" });
  const view = (engine: RunningEngine) => call(engine, "tasks.dispatch.resources", {});
  await vi.waitFor(async () => expect(await view(first)).toMatchObject({ ok: true, data: { vault: { active: 0, waitingNative: 1, oldestNativeWaitAt: expect.any(String) }, device: { active: { limit: 1, occupied: 1 } } } }));
  await vi.waitFor(async () => expect(await view(second)).toMatchObject({ ok: true, data: { vault: { active: 1, unknown: 1 } } }));
  const extra = await firstRules.acceptRule(intent(await createDispatchable(first, "第三个待排队运行")), rule("device-third"));
  await waitDispatch(first, extra, { reason: "waiting_resource" });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  const core = vi.spyOn(HerdrCore.prototype, "peek");
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => view(first)));
    expect(results.every(({ ok }) => ok)).toBe(true);
    expect(core).not.toHaveBeenCalled();
    expect(fake.dispatch).toHaveBeenCalledTimes(2);
  } finally {
    core.mockRestore();
  }
});

test("确认失败后用原快照追加 attempt，旧派遣重传保持原身份", async () => {
  const { engine, task, fake, run, execution } = await startBoundRun();
  const retry = { taskId: task.id, dispatchId: run.dispatchId, retryId: randomUUID() };
  const redo = (input = retry) => call<DispatchReceipt>(engine, "tasks.dispatch.retry", input);
  expect(await redo()).toMatchObject({ ok: false, error: { code: "RUN_UNKNOWN" } });
  expect(await submitReceipt(engine, { version: 1, kind: "failed", receiptId: "retry-confirmed-failure", execution, payload: { code: "fixture", message: "原轮失败" } })).toMatchObject({ ok: true });
  await vi.waitFor(async () => expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ data: { status: "in_progress" } }));
  const { data: current } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  const edited = await call<TaskDto>(engine, "tasks.update", { id: task.id, expectedVersion: current.version, baseEditHash: current.editHash, patch: { body: "编辑后的正文" } });
  expect(edited).toMatchObject({ ok: true });

  const results = await Promise.all([redo(), redo()]);
  const accepted = results[0]!.data;
  expect(results[0]).toMatchObject({ ok: true, data: { runId: run.runId, attempt: 2 } });
  expect(results[1]).toMatchObject({ ok: true, data: { dispatchId: accepted.dispatchId, attempt: 2 } });
  expect(await redo({ ...retry, retryId: randomUUID() })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(accepted.dispatchId).not.toBe(run.dispatchId);
  expect(await call(engine, "tasks.dispatch", intent(task, run.dispatchId))).toMatchObject({ ok: true, data: { runId: run.runId, dispatchId: run.dispatchId, attempt: 1 } });
  await waitDispatch(engine, accepted, { state: "running" });
  const old = recordOf(engine, run);
  const next = recordOf(engine, accepted);
  expect(next.snapshotHash).toBe(old.snapshotHash);
  expect(next.snapshot).toEqual(old.snapshot);
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  expect(fake.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ attempt: 2, snapshotHash: old.snapshotHash, snapshot: old.snapshot }), expect.any(AbortSignal));
  expect(await submitReceipt(engine, { version: 1, kind: "failed", receiptId: "retry-confirmed-failure", execution, payload: { code: "fixture", message: "原轮失败" } })).toMatchObject({ ok: true });
  expect(await submitReceipt(engine, { version: 1, kind: "result", receiptId: "retry-old-late-result", execution, payload: { message: "旧尝试迟到的结果" } })).toMatchObject({ ok: true });
  expect(await submitReceipt(engine, { version: 1, kind: "result", receiptId: "retry-old-late-result", execution, payload: { message: "旧尝试迟到的结果" } })).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, state: "running" }] });
  expect(await submitReceipt(engine, { version: 1, kind: "result", receiptId: "retry-success", execution: next.boundExecution!, payload: { message: "第二轮成功" } })).toMatchObject({ ok: true });
  await vi.waitFor(async () => expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, state: "succeeded", result: { delivery: "delivered" } }] }));

  const { data: running } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(running.comments.filter(({ event }) => event === "failed" || event === "result").map(({ body }) => body)).toEqual(["原轮失败", "第二轮成功"]);
  const reset = await call<TaskDto>(engine, "tasks.setStatus", { id: task.id, expectedVersion: running.version, status: "not_started" });
  expect(reset).toMatchObject({ ok: true });
  const fresh = await acceptDispatch(engine, intent(reset.data));
  expect(fresh.runId).not.toBe(run.runId);
  expect(recordOf(engine, fresh).snapshot.body).toBe("编辑后的正文");
});

test("关闭任务或损坏已失败的派遣时拒绝新重试，保留原记录", async () => {
  const { engine, task, run, execution } = await startBoundRun();
  const retry = { taskId: task.id, dispatchId: run.dispatchId, retryId: randomUUID() };
  expect(await submitReceipt(engine, { version: 1, kind: "failed", receiptId: "retry-invalid-task-failure", execution, payload: { code: "fixture", message: "执行失败" } })).toMatchObject({ ok: true });
  await vi.waitFor(async () => {
    const { data: current } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
    expect(current.comments.some(({ event }) => event === "failed")).toBe(true);
  });
  const stored = recordOf(engine, run);
  const { data: current } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  const closed = await call<TaskDto>(engine, "tasks.setStatus", { id: task.id, expectedVersion: current.version, status: "completed" });
  expect(closed).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.dispatch.retry", retry)).toMatchObject({ ok: false, error: { details: { reason: "task_unavailable" } } });
  expect(recordOf(engine, run)).toEqual(stored);
  const reopened = await call(engine, "tasks.setStatus", { id: task.id, expectedVersion: closed.data.version, status: "not_started" });
  expect(reopened).toMatchObject({ ok: true });
  writeFileSync(recordFile(engine, run.eventId), JSON.stringify({ ...stored, snapshotHash: "corrupt" }));
  expect(await call(engine, "tasks.dispatch.retry", retry)).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
});

test("目标预检明确未发送时可用原快照重试，领取前关联当前任务版本", async () => {
  const fake = executor();
  vi.mocked(fake.ready).mockResolvedValue("unavailable");
  fixture.executor = fake;
  const engine = await start(tempVault(), true);
  const task = await createDispatchable(engine);
  const first = await acceptDispatch(engine, intent(task));
  await waitDispatch(engine, first, { state: "blocked", reason: "target_unavailable" });
  expect(fake.dispatch).not.toHaveBeenCalled();
  expect(await call(engine, "tasks.dispatch.list", { taskId: task.id })).toMatchObject({ ok: true, data: [{ dispatchId: first.dispatchId, canRetry: true }] });
  const edited = await call(engine, "tasks.update", { id: task.id, expectedVersion: task.version, patch: { body: "保存新的正文" } });
  expect(edited).toMatchObject({ ok: true });
  vi.mocked(fake.ready).mockResolvedValue("ready");
  const retry = await call<DispatchReceipt>(engine, "tasks.dispatch.retry", { taskId: task.id, dispatchId: first.dispatchId, retryId: randomUUID() });
  expect(retry).toMatchObject({ ok: true, data: { runId: first.runId, attempt: 2 } });
  await waitDispatch(engine, retry.data, { state: "running" });
  expect(recordOf(engine, retry.data).snapshot.body).toBe(task.body);
  await vi.waitFor(async () => expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ data: { status: "in_progress", body: "保存新的正文" } }));
});

test("命令行分别授权 Agent 任务创建与派遣，不能替换工作区或提前发送", { timeout: 30_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  const {
    data: [space],
  } = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
  const token = engine.cliToken;
  const input = { title: "外部任务工具", body: "只使用测试工作区", execution: { spaceId: space!.id, provider: "codex" }, availableAt: "2099-11-21T09:00:00Z" };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  expect(await call(engine, "tasks.agent.create", input, token)).toMatchObject(denied);
  expect(await call(engine, "gateway.update", { capability: "tasks.create", exposed: true })).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.create", { ...input, type: "agent" }, token)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await call(engine, "gateway.update", { capability: "tasks.agent.create", exposed: true })).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.agent.create", { ...input, execution: { ...input.execution, spaceId: "伪造工作区" } }, token)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const task = await call<TaskDto>(engine, "tasks.agent.create", input, token);
  expect(task).toMatchObject({ ok: true, data: { type: "agent", origin: { kind: "external", caller: "cli" }, body: "" } });
  const generic = await call<TaskDto>(engine, "tasks.create", { ...input, type: "agent" }, token);
  expect(generic).toMatchObject({ ok: true, data: { type: "agent", body: "" } });
  expect(await call(engine, "tasks.read", { id: generic.data.id })).toMatchObject({ ok: true, data: { body: input.body } });
  for (const capability of ["tasks.update", "tasks.duplicate"]) expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
  const update = { id: generic.data.id, expectedVersion: generic.data.version, patch: { execution: { ...input.execution, spaceId: "未知 Space" } } };
  expect(await call(engine, "tasks.update", update, token)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call(engine, "tasks.update", { ...update, patch: { body: "已编辑 Agent 任务" } }, token)).toMatchObject({ ok: true, data: { body: "" } });
  expect(await call(engine, "tasks.duplicate", { id: generic.data.id }, token)).toMatchObject({ ok: true, data: { type: "agent", body: "" } });
  const attempt = intent(task.data);
  expect(await call(engine, "tasks.dispatch", attempt, token)).toMatchObject(denied);
  expect(await call(engine, "gateway.update", { capability: "tasks.dispatch", exposed: true })).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.dispatch", { ...attempt, allowEarly: true }, token)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await call(engine, "tasks.dispatch", attempt, token)).toMatchObject({ ok: false, error: { details: { reason: "not_due" } } });
  expect(await call(engine, "tasks.dispatch.list", { taskId: task.data.id })).toMatchObject({ ok: true, data: [] });
  expect(await call(engine, "agent.runs.dispatch", {}, token)).toMatchObject(denied);
});

test("持久收件后无需扫描定时器即可投递结果，重复收件仅保留原评论", async () => {
  fixture.checkMs = 60_000;
  const { engine, task, run, execution } = await startBoundRun();
  const receipt = { version: 1, receiptId: "immediate-result", kind: "result", execution, payload: { message: "即时收到的结果" } } as const satisfies ExecutionReceipt;
  const ack = { ok: true, data: { stage: "tasks_consumed", receipt: executionReceiptIdentity(receipt) } };
  const delivered = [{ run: run.runId, session: execution.sessionBinding.sessionId, body: receipt.payload.message }];

  const replay = vi.spyOn(TaskReceiptInbox.prototype, "replay");
  try {
    expect(await submitReceipt(engine, receipt)).toMatchObject(ack);
    expect(replay).not.toHaveBeenCalled();
  } finally {
    replay.mockRestore();
  }
  await vi.waitFor(
    async () => {
      expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, result: { delivery: "delivered" } }] });
    },
    { timeout: 2_000 },
  );
  expect(await submitReceipt(engine, receipt)).toMatchObject(ack);
  const { data } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(data.comments.filter(({ event }) => event === "result")).toMatchObject(delivered);
});

test("扫描经过回执检查后到件，先返回 ACK 并合并一次后续投递", async () => {
  fixture.checkMs = 60_000;
  const { engine, task, run, execution, fake } = await startBoundRun();
  let release: ((state: "ready") => void) | undefined;
  const ready = new Promise<"ready">((resolve) => {
    release = resolve;
  });
  const held = vi.fn<TaskDispatchExecutor["ready"]>(() => ready);
  fake.ready = held;
  const other = await createDispatchable(engine, "暂停扫描的另一任务");
  const otherRun = await acceptDispatch(engine, intent(other));
  const receipt = { version: 1, receiptId: "result-during-check", kind: "result", execution, payload: { message: "扫描期间收到的结果" } } as const satisfies ExecutionReceipt;
  const ack = { ok: true, data: { stage: "tasks_consumed", receipt: executionReceiptIdentity(receipt) } };
  try {
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1));
    expect(await submitReceipt(engine, receipt)).toMatchObject(ack);
    expect(await submitReceipt(engine, receipt)).toMatchObject(ack);
    const { data } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
    expect(data.comments.filter(({ event }) => event === "result")).toEqual([]);
  } finally {
    release?.("ready");
  }

  await waitDispatch(engine, otherRun, { state: "running" });
  await vi.waitFor(
    async () => {
      expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, result: { delivery: "delivered" } }] });
    },
    { timeout: 2_000 },
  );
  const { data } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  expect(data.comments.filter(({ event }) => event === "result")).toMatchObject([{ run: run.runId, session: execution.sessionBinding.sessionId, body: receipt.payload.message }]);
});

test("持久验收原回执后才 ACK，重开补送原评论一次且不重新执行", { timeout: 60_000 }, async () => {
  const { root, fake, engine, task, run, execution } = await startBoundRun();
  const dispatches = await call(engine, "tasks.dispatch.list", { taskId: task.id });
  expect(dispatches).toMatchObject({ ok: true, data: [{ runId: run.runId, dispatchId: run.dispatchId, session: { id: execution.sessionBinding.sessionId, spaceId: task.execution?.spaceId } }] });
  expect(JSON.stringify(dispatches)).not.toContain(execution.sessionBinding.nativeSessionId!);
  expect(await call(engine, "tasks.dispatch.list", { taskId: task.id }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  const input = { version: 1, receiptId: "fixture-result", kind: "result", execution, payload: { message: "已完成的合成结果" } } as const satisfies ExecutionReceipt;
  const expected = { ok: true, data: { stage: "tasks_consumed", receipt: executionReceiptIdentity(input) } };
  const consume = (running: RunningEngine, receipt: ExecutionReceipt = input) => submitReceipt(running, receipt);
  const resultComments = async (running: RunningEngine) => (await call<TaskDto>(running, "tasks.read", { id: task.id })).data.comments.filter(({ event }) => event === "result");
  expect(await call(engine, "tasks.receipts.consume", input, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await call(engine, "tasks.receipts.consume", input)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await consume(engine, { ...input, execution: { ...input.execution, runId: "other-run" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

  let fault: "before" | "after-comment" | null = "before";
  const write = VaultFiles.prototype.write;
  const injection = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(function (this: VaultFiles, rel, bytes, options) {
    if (rel.startsWith("tasks/receipts/")) {
      const { status } = JSON.parse(Buffer.from(bytes).toString("utf8")) as { status: string };
      if ((status === "pending" && fault === "before") || (status === "delivered" && fault === "after-comment")) throw new Error("合成落盘中断");
    }
    return write.call(this, rel, bytes, options);
  });
  try {
    expect(await consume(engine)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(await resultComments(engine)).toEqual([]);
    fault = "after-comment";
    const gate = path.join(root, "test-ack-gate");
    mkdirSync(gate);
    writeFileSync(path.join(gate, "dispatch-id"), run.dispatchId);
    vi.stubEnv("HUHU_E2E_TASK_RECEIPT_ACK_GATE", gate);
    expect(await consume(engine)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(JSON.parse(readFileSync(path.join(gate, "held.json"), "utf8"))).toEqual(expected.data);
    const receiptDir = path.join(engine.vault.stateDir, "tasks", "receipts");
    const [file] = readdirSync(receiptDir);
    expect(file).toBeDefined();
    const deliveryFile = path.join(receiptDir, file!);
    const durable = () => JSON.parse(readFileSync(deliveryFile, "utf8")) as { status: string; receipt: ExecutionReceipt; consumption: { delivery: { messageId: string } } };
    expect(durable()).toMatchObject({ receipt: input, status: "pending" });
    const messageId = durable().consumption.delivery.messageId;
    await vi.waitFor(async () => expect(await resultComments(engine)).toMatchObject([{ id: messageId, run: run.runId, body: input.payload.message }]));
    expect(durable().status).toBe("pending");
    expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, result: { kind: "result", delivery: "pending" } }] });
    await stop(engine);
    fault = null;
    const reopened = await start(root);
    writeFileSync(path.join(gate, "release"), "");
    expect(await consume(reopened)).toEqual(expected);
    expect(await consume(reopened, { ...input, payload: { message: "同 ID 异载荷" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await vi.waitFor(() => expect(durable().status).toBe("delivered"));
    expect(await resultComments(reopened)).toMatchObject([{ id: messageId, run: run.runId, body: input.payload.message }]);
    const afterResult = (await call<TaskDto>(reopened, "tasks.read", { id: task.id })).data;
    expect(afterResult.status).toBe("in_progress");
    expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({
      ok: true,
      data: [{ id: run.runId, state: "succeeded", finishedAt: expect.any(String), questions: 0, result: { kind: "result", delivery: "delivered" } }],
    });
    const closed = await call<TaskDto>(reopened, "tasks.setStatus", { id: task.id, expectedVersion: afterResult.version, status: "completed" });
    expect(closed).toMatchObject({ ok: true, data: { status: "completed" } });
    const reopenedTask = await call<TaskDto>(reopened, "tasks.setStatus", { id: task.id, expectedVersion: closed.data.version, status: "not_started" });
    expect(reopenedTask).toMatchObject({ ok: true, data: { status: "not_started", inputRevision: afterResult.inputRevision + 1 } });
    expect(fake.dispatch).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
    injection.mockRestore();
  }
});

test("普通回答重开后只派发一轮到原会话，保留父运行和明确选中的消息", { timeout: 60_000 }, async () => {
  const { engine, task, root, fake, run, execution } = await startBoundRun();
  await call(engine, "tasks.comments.add", { taskId: task.id, body: "选中的讨论" });
  await call(engine, "tasks.comments.add", { taskId: task.id, body: "没有选中的讨论" });
  const { data: before } = await call<TaskDto>(engine, "tasks.read", { id: task.id });
  const selected = before.comments.find(({ body }) => body === "选中的讨论")!;
  const ask = { taskId: task.id, runId: run.runId, sessionId: execution.sessionBinding.sessionId, requestId: "normal-reply", requestVersion: 1 };
  expect(await submitReceipt(engine, { version: 1, kind: "question", receiptId: "normal-reply-question", execution, payload: { mode: "normal", requestId: ask.requestId, requestVersion: 1, text: "等你的答复", options: [] } })).toMatchObject(
    { ok: true },
  );
  const input = { ...ask, replyId: "normal-reply-once", answer: "明确答复", messageIds: [selected.id] };
  const contenders = await Promise.all([input, { ...input, replyId: "normal-reply-contender" }].map((reply) => call<{ followUpRunId: string }>(engine, "tasks.reply", reply)));
  expect(contenders.filter(({ ok }) => ok)).toHaveLength(1);
  expect(contenders.find(({ ok }) => !ok)).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  const accepted = contenders.find(({ ok }) => ok)!;
  const original = contenders[0]!.ok ? input : { ...input, replyId: "normal-reply-contender" };
  const { answer: _answer, messageIds: _messageIds, ...lookup } = original;
  const nextRun = accepted.data.followUpRunId;
  expect(accepted.data).toMatchObject({ status: "pending" });
  expect(await call(engine, "tasks.reply.read", lookup)).toMatchObject({ ok: true, data: { status: "pending", followUpRunId: nextRun } });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  await stop(engine);

  const reopened = await start(root);
  expect(await call(reopened, "tasks.reply", original)).toMatchObject({ ok: true, data: { status: "pending", followUpRunId: nextRun } });
  expect(await call(reopened, "tasks.reply", { ...original, answer: "不同答复" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await submitReceipt(reopened, { version: 1, kind: "no_update", receiptId: "normal-reply-parent-done", execution, payload: {} })).toMatchObject({ ok: true });
  await expect.poll(() => call(reopened, "tasks.reply.read", lookup)).toMatchObject({ ok: true, data: { status: "accepted", followUpRunId: nextRun } });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  expect(fake.dispatch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      runId: nextRun,
      snapshot: expect.objectContaining({ body: "明确答复\n\n附带的任务消息\n\n选中的讨论" }),
      agentTarget: expect.objectContaining({ mode: "existing", binding: execution.sessionBinding }),
    }),
    expect.any(AbortSignal),
  );
  expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: nextRun, parentRunId: run.runId, state: "running" })]) });
  const { data: saved } = await call<TaskDto>(reopened, "tasks.read", { id: task.id });
  expect(saved.comments.filter(({ event }) => event === "answer")).toMatchObject([{ run: run.runId, session: ask.sessionId, body: "明确答复", source: "human", author: "我" }]);
});

test.each(["normal", "native_deferred"] as const)("%s 回答只消费授权主体和当前问题版本，并持久保存认证主体", async (mode) => {
  const { engine, fake } = await startBoundRun();
  const answer = vi.fn<NonNullable<TaskDispatchExecutor["answer"]>>().mockResolvedValue({ status: "accepted" });
  fake.answer = answer;
  const task = await createDispatchable(engine, "受主体约束的回答");
  for (const capability of ["tasks.dispatch", "tasks.reply", "tasks.reply.read", "tasks.questions.list", "tasks.comments.add"]) {
    expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
  }
  const external = (subject: string, capability: string, input: unknown) =>
    engine.dispatcher.call("http", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }, undefined, subject);
  const owner = "fixture-owner";
  const other = "fixture-other-subject";
  const dispatch = await external(owner, "tasks.dispatch", intent(task));
  expect(dispatch).toMatchObject({ ok: true });
  if (!dispatch.ok) throw new Error(dispatch.error.code);
  const run = dispatch.data as DispatchReceipt;
  await waitDispatch(engine, run, { state: "running" });
  const execution = recordOf(engine, run).boundExecution!;
  const envelope = { version: 1, kind: "question", receiptId: "actor-question" } as const;
  const payload = { requestId: "versioned-ask", requestVersion: 2, text: "请确认", options: ["选项"] };
  const question: ExecutionReceipt = mode === "normal"
    ? { ...envelope, execution, payload: { ...payload, mode } }
    : { ...envelope, execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: "fixture-thread" } }, payload: { ...payload, mode, nativeRequestId: "actor-native-route" } };
  expect(await submitReceipt(engine, question)).toMatchObject({ ok: true });
  const list = { taskId: task.id };
  expect(await external(owner, "tasks.questions.list", list)).toMatchObject({ ok: true, data: [{ requestId: "versioned-ask", status: "awaiting" }] });
  expect(await external(other, "tasks.questions.list", list)).toMatchObject({ ok: true, data: [] });
  expect(await external(other, "tasks.comments.add", { ...list, body: "选项" })).toMatchObject({ ok: true });
  const lookup = { ...list, requestId: "versioned-ask", requestVersion: 2, runId: run.runId, sessionId: execution.sessionBinding.sessionId, replyId: "actor-answer" };
  const reply = { ...lookup, answer: "选项" };
  expect(await external(other, "tasks.reply", reply)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await external(owner, "tasks.reply", { ...reply, requestVersion: 1 })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await external(owner, "tasks.reply", { ...reply, actor: other })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(answer).not.toHaveBeenCalled();
  const results = await Promise.all([external(owner, "tasks.reply", reply), external(owner, "tasks.reply", { ...reply, replyId: "other-answer-id" })]);
  expect(results.filter(({ ok }) => ok)).toHaveLength(1);
  const winningReply = results[0]!.ok ? reply : { ...reply, replyId: "other-answer-id" };
  const { answer: _answer, ...winningLookup } = winningReply;
  expect(await external(owner, "tasks.reply", winningReply)).toMatchObject({ ok: true });
  expect(await external(other, "tasks.reply.read", winningLookup)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  if (mode === "normal") {
    expect(await submitReceipt(engine, { version: 1, kind: "no_update", receiptId: "actor-parent-finished", execution, payload: {} })).toMatchObject({ ok: true });
  }
  await expect.poll(() => external(owner, "tasks.reply.read", winningLookup)).toMatchObject({ ok: true, data: { status: "accepted" } });
  const timeline = (await call<TaskDto>(engine, "tasks.read", { id: task.id })).data.comments.filter(({ event }) => event === "answer");
  expect(timeline).toMatchObject([{ body: "选项", source: "external", author: "http", ask: lookup.requestId }]);
  const folder = path.join(engine.vault.stateDir, "tasks", mode === "normal" ? "dispatches" : "replies");
  const saved = readdirSync(folder).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(readFileSync(path.join(folder, file), "utf8")) as { snapshot?: { source: { actor?: unknown } }; entries?: { actor?: unknown }[] });
  const actors = saved.flatMap(({ snapshot, entries }) => entries?.map(({ actor }) => actor) ?? [snapshot?.source.actor]);
  expect(actors).toContainEqual(expect.objectContaining({ caller: "http", subject: owner }));
  expect(answer).toHaveBeenCalledTimes(mode === "normal" ? 0 : 1);
});

test("只派发显式选择的补充，忙时重开仍只发送一次，丢失确认后只核对", { timeout: 60_000 }, async () => {
  const { engine, task, root, fake, run, execution } = await startBoundRun();
  const post = (taskId: string, body: string) => call(engine, "tasks.comments.add", { taskId, body });
  await post(task.id, "未选中的讨论");
  await post(task.id, "这条补充发给原会话");
  const { data: other } = await call<TaskDto>(engine, "tasks.create", { title: "另一任务", body: "另一份正文" });
  await post(other.id, "来自其他任务的讨论");
  const note = async (id: string, body: string) => (await call<TaskDto>(engine, "tasks.read", { id })).data.comments.find((comment) => comment.body === body)!.id;
  const selected = await note(task.id, "这条补充发给原会话");
  const foreign = await note(other.id, "来自其他任务的讨论");
  const lookup = { taskId: task.id, runId: run.runId, sessionId: execution.sessionBinding.sessionId, supplementId: "supplement-once" };
  expect(await call(engine, "tasks.supplement", { ...lookup, messageIds: [foreign] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await submitReceipt(engine, { version: 1, kind: "result", receiptId: "supplement-parent-result", execution, payload: { message: "上轮结果不应随补充发送" } })).toMatchObject({ ok: true });
  vi.mocked(fake.ready).mockResolvedValue("busy");
  const input = { ...lookup, messageIds: [selected] };
  const accepted = await call<{ followUpRunId: string }>(engine, "tasks.supplement", input);
  expect(accepted).toMatchObject({ ok: true, data: { status: "pending", messageIds: [selected] } });
  const followUpRunId = accepted.data.followUpRunId;
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  await stop(engine);

  vi.mocked(fake.dispatch).mockRejectedValueOnce(new Error("合成确认丢失"));
  vi.mocked(fake.inspect).mockResolvedValue("unknown");
  vi.mocked(fake.ready).mockResolvedValue("ready");
  const reopened = await start(root);
  await expect.poll(() => call(reopened, "tasks.supplement.read", lookup)).toMatchObject({ ok: true, data: { status: "unknown", followUpRunId } });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  expect(fake.dispatch).toHaveBeenLastCalledWith(
    expect.objectContaining({ runId: followUpRunId, snapshot: expect.objectContaining({ body: "这条补充发给原会话" }), agentTarget: expect.objectContaining({ binding: execution.sessionBinding }) }),
    expect.any(AbortSignal),
  );
  expect(await call(reopened, "tasks.supplement", input)).toMatchObject({ ok: true, data: { status: "unknown", followUpRunId } });
  expect(await call(reopened, "tasks.supplement", { ...input, text: "重交不同内容" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  vi.mocked(fake.inspect).mockImplementation(async ({ runId, dispatchId, attempt }) => ({ state: "accepted", execution: { ...execution, runId, dispatchId, attempt } }));
  await expect.poll(() => call(reopened, "tasks.supplement.read", lookup)).toMatchObject({ ok: true, data: { status: "accepted", followUpRunId } });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  const { data: saved } = await call<TaskDto>(reopened, "tasks.read", { id: task.id });
  expect(saved.comments.filter(({ event }) => event === "supplement")).toMatchObject([{ run: run.runId, session: lookup.sessionId, body: "这条补充发给原会话" }]);
});

test("跟进改期与过期进程只针对原任务受理一次，关闭任务不会被重开", { timeout: 60_000 }, async () => {
  fixture.followUpClock = true;
  fixture.now = new Date("2026-11-21T10:00:00.000Z");
  const fake = executor();
  fixture.executor = fake;
  const root = tempVault();
  const engine = await start(root, true);
  const task = await createDispatchable(engine, "保留原任务");
  const closed = await createDispatchable(engine, "关闭后无需跟进");
  const first = "2026-11-21T10:01:00.000Z";
  const next = "2026-11-21T10:02:00.000Z";
  const schedule = (taskId: string, scheduledFor: string, expectedRevision: string | null) => call<{ revision: string; followUpId: string; planId: string }>(engine, "automations.followUps.schedule", { taskId, scheduledFor, expectedRevision });
  const original = await schedule(task.id, first, null);
  expect(original).toMatchObject({ ok: true, data: { state: "scheduled", scheduledFor: first } });
  const scheduled = await schedule(task.id, next, original.data.revision);
  expect(scheduled).toMatchObject({ ok: true, data: { state: "scheduled", scheduledFor: next, planId: original.data.planId } });
  expect(await schedule(task.id, first, original.data.revision)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await schedule(closed.id, next, null)).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.setStatus", { id: closed.id, expectedVersion: closed.version, status: "completed" })).toMatchObject({ ok: true });
  fixture.now = new Date("2026-11-21T10:01:01.000Z");
  await fixture.followUps!.tick();
  expect(fake.dispatch).not.toHaveBeenCalled();
  await stop(engine);
  const copy = tempVault();
  cpSync(root, copy, { recursive: true });
  fixture.now = new Date("2026-11-21T10:02:01.000Z");
  const imported = await start(copy);
  await fixture.followUps!.tick();
  expect(await call(imported, "automations.followUps.get", { taskId: task.id })).toMatchObject({ ok: true, data: { state: "needs_confirmation" } });
  expect(fake.dispatch).not.toHaveBeenCalled();
  await stop(imported);
  const reopened = await start(root);
  const action = () => fixture.followUps!.tick();
  await Promise.all([action(), action()]);
  await expect.poll(() => vi.mocked(fake.dispatch).mock.calls.length).toBe(1);
  expect(await call(reopened, "automations.followUps.get", { taskId: task.id })).toMatchObject({ ok: true, data: { state: "accepted", scheduledFor: next, runId: expect.any(String) } });
  expect(await call(reopened, "automations.plans.readOccurrence", { occurrenceId: scheduled.data.followUpId })).toMatchObject({
    ok: true,
    data: {
      plan: { planId: scheduled.data.planId, revision: scheduled.data.revision },
      state: "accepted", acceptedAt: fixture.now.toISOString(),
      timing: { trigger: "scheduled", scheduledFor: next },
      frozenInput: { revision: task.inputRevision, digest: task.inputHash },
    },
  });
  expect(await call(reopened, "automations.followUps.get", { taskId: closed.id })).toMatchObject({ ok: true, data: { state: "skipped", reason: "task_unavailable" } });
  await action();
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect((await call<TaskDto[]>(reopened, "tasks.list", {})).data.map(({ id }) => id).sort()).toEqual([task.id, closed.id].sort());
});

test("统一计划目录通过正式能力管理 Cron 和一次性跟进，重开仍保留原意图", { timeout: 60_000 }, async () => {
  fixture.followUpClock = true;
  fixture.now = new Date("2026-11-21T10:00:00.000Z");
  const fake = executor();
  fixture.executor = fake;
  const root = tempVault();
  let engine = await start(root, true);
  const task = await createDispatchable(engine, "目录中的任务");
  const schedule = await call<{ followUpId: string; revision: string }>(engine, "automations.followUps.schedule", {
    taskId: task.id, scheduledFor: "2026-11-21T10:10:00.000Z", expectedRevision: null,
  });
  expect(schedule.ok).toBe(true);
  const dir = path.join(engine.vault.stateDir, "automations", "follow-ups");
  const file = path.join(dir, readdirSync(dir)[0]!);
  const original = JSON.parse(readFileSync(file, "utf8"));
  delete original.plan; // Simulate the format installed by versions before the directory.
  writeFileSync(file, JSON.stringify(original));
  const rule = await call<{ id: string; version: string }>(engine, "automations.create", {
    title: "Cron fixture", trigger: { preset: "hourly", cron: "0 * * * *", zone: "UTC" },
    action: { kind: "reminder", mode: "notification", text: "目录提醒", taskId: null },
  });
  expect(rule.ok).toBe(true);
  await stop(engine);
  engine = await start(root);

  const list = async (input: unknown = {}) => {
    const response = await call<{ plans: PlanSummary[]; nextCursor: string | null }>(engine, "automations.plans.list", input);
    expect(response.ok).toBe(true);
    return response.data;
  };
  const source = { plugin: "tasks", object: { kind: "task", id: task.id } };
  const followUp = (await list({ source })).plans[0]!;
  expect(followUp).toMatchObject({ source, revision: schedule.data.revision, intent: "enabled", title: task.title });
  expect(followUp.planId).not.toBe(schedule.data.followUpId);
  const page = await list({ limit: 1 });
  expect(page.plans).toHaveLength(1);
  expect((await list({ cursor: page.nextCursor })).plans).toHaveLength(1);
  const cron = (await list()).plans.find(({ planId }) => planId === rule.data.id)!;
  expect(cron).toMatchObject({ revision: rule.data.version, intent: "paused", nextAt: null });
  expect(await list({
    source: { plugin: "automations", object: { kind: "automation-rule", id: "unrelated" } },
  })).toEqual({ plans: [], nextCursor: null });

  const submit = async (change: PlanWrite, intentKey = change.intentId) => {
    const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "automations.plans.submit", input: change, requestId: randomUUID(), intentKey }),
    });
    const reply = await response.json();
    expect(reply).toMatchObject({ ok: true });
    return PlanWriteResultSchema.parse(reply.data);
  };
  const ref = ({ planId, revision }: PlanSummary) => ({ planId, expectedRevision: revision, intentId: randomUUID() });
  const change = async (request: PlanWrite) => {
    const result = await submit(request);
    if (result.outcome !== "completed") throw new Error(JSON.stringify(result));
    return result;
  };
  const enableCron = { ...ref(cron), change: "set-intent", intent: "enabled" } as const;
  expect(await submit(enableCron, randomUUID())).toMatchObject({ outcome: "not-accepted", error: { code: "INVALID_INPUT" } });
  const enabledCron = (await change(enableCron)).plan;
  expect(enabledCron.nextAt).toBe("2026-11-21T11:00:00.000Z");
  const newCron = (await change({ ...ref(enabledCron), change: "reschedule", trigger: { kind: "cron", expression: "15 * * * *", zone: "UTC" } })).plan;
  expect(newCron.nextAt).toBe("2026-11-21T10:15:00.000Z");
  const pausedCron = (await change({ ...ref(newCron), change: "set-intent", intent: "paused" })).plan;
  expect(pausedCron.nextAt).toBeNull();
  expect(await submit({ ...ref(newCron), change: "delete" })).toMatchObject({ outcome: "not-accepted", error: { code: "VERSION_CONFLICT" } });
  expect(await call(engine, "automations.read", { id: cron.planId })).toMatchObject({
    ok: true, data: { version: pausedCron.revision, data: { enabled: false, trigger: { cron: "15 * * * *" } } },
  });
  const onAgain = (await change({ ...ref(pausedCron), change: "set-intent", intent: "enabled" })).plan;
  expect(onAgain.revision).not.toBe(newCron.revision);
  const offAgain = (await change({ ...ref(onAgain), change: "set-intent", intent: "paused" })).plan;
  expect(offAgain.revision).not.toBe(pausedCron.revision);
  const run = await call<{ activationId: string }>(engine, "automations.runNow", { id: cron.planId });
  expect(run.ok).toBe(true);
  expect(await call(engine, "automations.plans.readOccurrence", { occurrenceId: run.data.activationId })).toMatchObject({
    ok: true,
    data: {
      plan: { planId: cron.planId, revision: offAgain.revision }, timing: { trigger: "manual" }, state: "completed",
      effects: [{ kind: "notification", state: "completed" }],
    },
  });

  const paused = (await change({ ...ref(followUp), change: "set-intent", intent: "paused" })).plan;
  fixture.now = new Date("2026-11-21T10:11:00.000Z");
  await fixture.followUps!.tick();
  expect(fake.dispatch).not.toHaveBeenCalled();
  expect(await call(engine, "automations.followUps.get", { taskId: task.id })).toMatchObject({
    ok: true, data: { planId: followUp.planId, revision: paused.revision, state: "paused", followUpId: schedule.data.followUpId },
  });
  expect(await submit({ ...ref(followUp), change: "delete" })).toMatchObject({ outcome: "not-accepted", error: { code: "VERSION_CONFLICT" } });
  const future = "2026-11-21T10:30:00.000Z";
  const rescheduled = (await change({ ...ref(paused), change: "reschedule", trigger: { kind: "once", scheduledFor: future } })).plan;
  expect(rescheduled).toMatchObject({ planId: followUp.planId, intent: "paused", nextAt: null });
  const resumed = (await change({ ...ref(rescheduled), change: "set-intent", intent: "enabled" })).plan;
  expect(resumed.nextAt).toBe(future);
  const current = await call<{ followUpId: string }>(engine, "automations.followUps.get", { taskId: task.id });
  expect(current.data.followUpId).not.toBe(schedule.data.followUpId);
  const sourceUpdate = await call<{ revision: string }>(engine, "automations.followUps.schedule", {
    taskId: task.id, scheduledFor: future, expectedRevision: resumed.revision,
  });
  expect(sourceUpdate.ok).toBe(true);
  const fromSource = (await list({ source })).plans[0]!;
  expect(fromSource).toMatchObject({ planId: followUp.planId, revision: sourceUpdate.data.revision });
  await change({ ...ref(offAgain), change: "delete" });
  const remove = { ...ref(fromSource), change: "delete" } as const;
  const removed = await change(remove);
  expect(removed.plan).toMatchObject({ planId: followUp.planId, intent: "deleted", actions: [], nextAt: null });
  await stop(engine);
  engine = await start(root);
  expect(await list()).toEqual({ plans: [], nextCursor: null });
  expect(await call(engine, "automations.plans.read", { planId: removed.plan.planId })).toMatchObject({ ok: true, data: null });
  expect(await call(engine, "automations.followUps.get", { taskId: task.id })).toMatchObject({ ok: true, data: null });
  expect(await call(engine, "automations.plans.readOccurrence", { occurrenceId: run.data.activationId })).toMatchObject({
    ok: true, data: { plan: { planId: cron.planId, revision: offAgain.revision }, state: "completed" },
  });
  expect(await submit(remove)).toEqual(removed);
  const receipt = await fetch(`http://127.0.0.1:${engine.port}/api/v1/operations?operationId=${removed.operationId}`, {
    headers: { authorization: `Bearer ${engine.rendererToken}` },
  });
  expect(await receipt.json()).toMatchObject({ ok: true, data: { result: { ok: true, data: removed } } });
  fixture.now = new Date("2026-11-21T10:31:00.000Z");
  await fixture.followUps!.tick();
  expect(fake.dispatch).not.toHaveBeenCalled();

  const template = await call<{ ruleId: string }>(engine, "automations.plans.defaultTaskScan", { action: "create" });
  expect(template).toMatchObject({ ok: true, data: { state: "created" } });
  const installed = (await list()).plans.find(({ planId }) => planId === template.data.ruleId)!;
  expect(installed).toMatchObject({ trigger: { kind: "cron", expression: "*/15 * * * *" }, intent: "enabled" });
  await change({ ...ref(installed), change: "delete" });
  await stop(engine);
  engine = await start(root);
  expect(await list()).toEqual({ plans: [], nextCursor: null });
  expect(await call(engine, "automations.plans.defaultTaskScan", { action: "create" })).toMatchObject({ ok: true, data: { state: "deleted" } });
  expect(await call(engine, "automations.plans.defaultTaskScan", { action: "restore" })).toMatchObject({ ok: true, data: { state: "created" } });
  expect((await list()).plans[0]?.planId).toBe(installed.planId);
});

test("取消一次性跟进后无写入，新的跟进等原轮完成并沿用会话", { timeout: 60_000 }, async () => {
  fixture.followUpClock = true;
  fixture.now = new Date("2026-11-21T10:00:00.000Z");
  const { engine, task, fake, run, execution } = await startBoundRun();
  await expect.poll(() => call(engine, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: { status: "in_progress" } });
  const modify = (scheduledFor: string, expectedRevision: string | null) => call<{ revision: string }>(engine, "automations.followUps.schedule", { taskId: task.id, scheduledFor, expectedRevision });
  const first = await modify("2026-11-21T10:01:00.000Z", null);
  expect(first).toMatchObject({ ok: true });
  const cancelled = await call<{ revision: string }>(engine, "automations.followUps.cancel", { taskId: task.id, expectedRevision: first.data.revision });
  expect(cancelled).toMatchObject({ ok: true, data: { state: "cancelled" } });
  fixture.now = new Date("2026-11-21T10:01:01.000Z");
  await fixture.followUps!.tick();
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await modify("2026-11-21T10:02:00.000Z", cancelled.data.revision)).toMatchObject({ ok: true });
  fixture.now = new Date("2026-11-21T10:02:01.000Z");
  await fixture.followUps!.tick();
  const followUp = await call<{ runId: string }>(engine, "automations.followUps.get", { taskId: task.id });
  expect(followUp).toMatchObject({ ok: true, data: { state: "accepted" } });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await submitReceipt(engine, { version: 1, kind: "no_update", receiptId: "scheduled-parent-done", execution, payload: {} })).toMatchObject({ ok: true });
  await expect.poll(() => call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: followUp.data.runId, parentRunId: run.runId, state: "running" })]) });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
  expect(fake.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ agentTarget: expect.objectContaining({ binding: execution.sessionBinding }) }), expect.any(AbortSignal));
});

test("同一轮只显示当代问题，完成后只关闭原生暂停", { timeout: 60_000 }, async () => {
  const { engine, task, run, execution } = await startBoundRun();
  const normal = {
    version: 1,
    receiptId: "normal-question",
    kind: "question",
    execution,
    payload: { mode: "normal", requestId: "normal", requestVersion: 1, text: "普通问题", options: [] },
  } as const satisfies ExecutionReceipt;
  const native = {
    version: 1,
    receiptId: "native-question",
    kind: "question",
    execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: "fixture-thread" } },
    payload: { mode: "native_deferred", requestId: "native", requestVersion: 2, text: "原生暂停", options: ["一", "二"], nativeRequestId: "private-native-route" },
  } as const satisfies ExecutionReceipt;
  const list = () => call(engine, "tasks.questions.list", { taskId: task.id });
  expect(await submitReceipt(engine, normal)).toMatchObject({ ok: true, data: { stage: "tasks_consumed" } });
  const ack = await submitReceipt(engine, native);
  expect(ack).toMatchObject({ ok: true, data: { stage: "tasks_consumed" } });
  expect(await submitReceipt(engine, native)).toEqual(ack);
  expect(await submitReceipt(engine, { ...native, receiptId: "late-native-question", payload: { ...native.payload, requestVersion: 1, text: "过期问题" } })).toMatchObject({ ok: true });
  expect(await submitReceipt(engine, { ...normal, receiptId: "foreign-question", execution: { ...execution, runId: "wrong-run" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const pending = await list();
  expect(pending).toMatchObject({
    ok: true,
    data: expect.arrayContaining([
      expect.objectContaining({ runId: run.runId, requestId: "normal", requestVersion: 1, mode: "normal", status: "awaiting" }),
      expect.objectContaining({ runId: run.runId, requestId: "native", requestVersion: 2, mode: "native_deferred", status: "awaiting" }),
    ]),
  });
  expect(pending.data).toHaveLength(2);
  expect(JSON.stringify(pending)).not.toContain("private-native-route");
  expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [expect.objectContaining({ id: run.runId, state: "waiting_input", questions: 2 })] });

  expect(await submitReceipt(engine, { version: 1, receiptId: "same-run-finished", kind: "no_update", execution, payload: {} })).toMatchObject({ ok: true });
  expect(await list()).toMatchObject({
    data: expect.arrayContaining([expect.objectContaining({ requestId: "normal", status: "awaiting" }), expect.objectContaining({ requestId: "native", status: "closed" })]),
  });
  expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [expect.objectContaining({ id: run.runId, state: "succeeded", questions: 1 })] });
});

test("规则空出原生暂停的执行槽，并在原回答恢复时先取得槽", { timeout: 60_000 }, async () => {
  const fake = executor();
  fixture.executor = fake;
  const engine = await start(tempVault(), true);
  const bindings = new Map<string, Extract<ExecutionReceipt, { kind: "question"; payload: { mode: "native_deferred" } }>["execution"]>();
  fake.dispatch = vi.fn<TaskDispatchExecutor["dispatch"]>().mockImplementation(async ({ snapshot, dispatchId, runId, attempt }) => {
    const execution = {
      vaultId: engine.vault.id,
      taskId: snapshot.taskId,
      dispatchId,
      runId,
      attempt,
      sessionBinding: { machineId: machineId(), sessionId: `session-${runId}`, coreId: "fixture-core", coreAddress: "t2", processGeneration: runId, provider: "codex", nativeSessionId: `thread-${runId}` },
    } satisfies ExecutionBinding;
    bindings.set(runId, execution);
    return { state: "accepted", execution };
  });
  const answer = vi.fn<NonNullable<TaskDispatchExecutor["answer"]>>().mockResolvedValue({ status: "accepted" });
  fake.answer = answer;
  const source = { kind: "automation", ruleId: "fixture-rule", ruleVersion: "v1", occurrenceId: "slot-fixture", maxConcurrent: 1 } as const satisfies RuleSource;
  const accept = async (title: string) => fixture.rule!.acceptRule(intent(await createDispatchable(engine, title)), source);
  const first = await accept("等待原生回答");
  await waitDispatch(engine, first, { state: "running" });
  const second = await accept("同规则独立会话");
  await waitDispatch(engine, second, { state: "pending", reason: "waiting_resource" });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);

  const execution = bindings.get(first.runId)!;
  const requestId = "slot-question";
  expect(
    await submitReceipt(engine, { version: 1, receiptId: requestId, kind: "question", execution, payload: { mode: "native_deferred", requestId, requestVersion: 1, nativeRequestId: "slot-native", text: "选择", options: ["一"] } }),
  ).toMatchObject({ ok: true });
  await waitDispatch(engine, second, { state: "running" });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);

  const lookup = { taskId: first.taskId, runId: first.runId, sessionId: execution.sessionBinding.sessionId, requestId, requestVersion: 1, replyId: randomUUID() };
  expect(await call(engine, "tasks.reply", { ...lookup, answer: "一" })).toMatchObject({ ok: true, data: { status: "pending" } });
  const third = await accept("同规则第三个会话");
  await waitDispatch(engine, third, { state: "pending", reason: "waiting_resource" });
  expect(answer).not.toHaveBeenCalled();
  expect(await submitReceipt(engine, { version: 1, receiptId: "slot-second-finished", kind: "no_update", execution: bindings.get(second.runId)!, payload: {} })).toMatchObject({ ok: true });
  await vi.waitFor(async () => expect(await call(engine, "tasks.reply.read", lookup)).toMatchObject({ ok: true, data: { status: "accepted" } }));
  expect(answer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ execution, replyId: lookup.replyId, answer: "一" }), expect.any(AbortSignal));
  await waitDispatch(engine, third, { state: "pending", reason: "waiting_resource" });
  expect(fake.dispatch).toHaveBeenCalledTimes(2);
});

test("原生回答先落盘，竞争只保存一个回答，确认丢失后只对账", { timeout: 60_000 }, async () => {
  const { root, fake, engine, task, run, execution } = await startBoundRun();
  const answer = vi.fn<NonNullable<TaskDispatchExecutor["answer"]>>().mockRejectedValue(new Error("合成确认丢失"));
  const inspect = vi.fn<NonNullable<TaskDispatchExecutor["inspectAnswer"]>>().mockResolvedValue({ status: "unknown" });
  fake.answer = answer;
  fake.inspectAnswer = inspect;
  const question = {
    version: 1,
    receiptId: "reply-question",
    kind: "question",
    execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: "fixture-thread" } },
    payload: { mode: "native_deferred", requestId: "ask-a", requestVersion: 2, text: "请选一个", options: ["一", "二"], nativeRequestId: "private-route" },
  } as const satisfies ExecutionReceipt;
  expect(await call(engine, "plugins.setEnabled", { id: "automations", enabled: false })).toMatchObject({ ok: true });
  expect(await submitReceipt(engine, question)).toMatchObject({ ok: true });
  expect(await submitReceipt(engine, { ...question, receiptId: "later-question", payload: { ...question.payload, requestId: "ask-b", nativeRequestId: "other-private-route" } })).toMatchObject({ ok: true });

  const base = { taskId: task.id, runId: run.runId, sessionId: execution.sessionBinding.sessionId, requestId: "ask-a", requestVersion: 2 };
  const first = { ...base, replyId: "reply-a", answer: "一" };
  const second = { ...base, replyId: "reply-b", answer: "二" };
  const answerComments = async (running: RunningEngine) => (await call<TaskDto>(running, "tasks.read", { id: task.id })).data.comments.filter(({ event }) => event === "answer");
  expect(await call(engine, "tasks.reply", first, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await call(engine, "tasks.reply", { ...first, answer: "未列出的选项" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call(engine, "tasks.reply", { ...first, requestVersion: 1 })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const addComment = TasksService.prototype.addComment;
  const blocked = vi.spyOn(TasksService.prototype, "addComment").mockImplementation(function (this: TasksService, id, comment) {
    if (comment.event === "answer") throw new Error("合成评论写入中断");
    return addComment.call(this, id, comment);
  });
  let winner = first;
  let saved: unknown;
  try {
    const responses = await Promise.all([call(engine, "tasks.reply", first), call(engine, "tasks.reply", second)]);
    expect(responses.filter(({ ok }) => ok)).toHaveLength(1);
    const winningIndex = responses.findIndex(({ ok }) => ok);
    winner = winningIndex === 0 ? first : second;
    saved = responses[winningIndex]!.data;
    expect(saved).toMatchObject({ replyId: winner.replyId, status: "pending" });
    expect(JSON.stringify(saved)).not.toMatch(/nativeRequestId|"answer":/);
    expect(responses[1 - winningIndex]).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect((await call(engine, "tasks.reply", winner)).data).toEqual(saved);
    expect(await call(engine, "tasks.reply", { ...winner, answer: winner === first ? second.answer : first.answer })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(await answerComments(engine)).toEqual([]);
    expect(answer).not.toHaveBeenCalled();
    await stop(engine);
  } finally {
    blocked.mockRestore();
  }

  const { answer: acceptedText, ...lookup } = winner;
  const restarted = await start(root);
  await vi.waitFor(async () => expect(await call(restarted, "tasks.reply.read", lookup)).toMatchObject({ ok: true, data: { status: "unknown" } }));
  const sent = { execution, requestId: "ask-a", requestVersion: 2, nativeRequestId: "private-route", replyId: winner.replyId, answer: acceptedText };
  expect(answer).toHaveBeenCalledExactlyOnceWith(sent, expect.any(AbortSignal));
  expect(await call(restarted, "tasks.questions.list", { taskId: task.id })).toMatchObject({
    ok: true,
    data: expect.arrayContaining([expect.objectContaining({ requestId: "ask-a", reply: expect.objectContaining({ status: "unknown" }) }), expect.objectContaining({ requestId: "ask-b", status: "awaiting" })]),
  });
  await stop(restarted);

  inspect.mockClear();
  inspect.mockResolvedValue({ status: "accepted" });
  const recovered = await start(root);
  await vi.waitFor(async () => expect(await call(recovered, "tasks.reply.read", lookup)).toMatchObject({ ok: true, data: { status: "accepted" } }));
  expect(inspect).toHaveBeenCalledExactlyOnceWith(sent, expect.any(AbortSignal));
  expect(answer).toHaveBeenCalledTimes(1);
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await answerComments(recovered)).toMatchObject([{ run: run.runId, ask: "ask-a", event: "answer", body: acceptedText }]);
  expect(await call(recovered, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [expect.objectContaining({ id: run.runId, questions: 1 })] });
});

test("原轮停止先保存意图，重开只核实同一次停止", { timeout: 60_000 }, async () => {
  const { root, fake, engine, task, run, execution } = await startBoundRun();
  const input = { taskId: task.id, dispatchId: run.dispatchId, runId: run.runId, stopId: "user-stop-bound" };
  const requestStop = (running: RunningEngine, request = input) => call(running, "tasks.dispatch.stop", request);
  const readStop = (running: RunningEngine) => call(running, "tasks.dispatch.stop.read", input);
  const interrupt = vi.fn<NonNullable<TaskDispatchExecutor["stop"]>>().mockRejectedValue(new Error("停止请求的回包丢失"));
  const inspect = vi.fn<NonNullable<TaskDispatchExecutor["inspectStop"]>>().mockResolvedValue("unknown");
  fake.stop = interrupt;
  fake.inspectStop = inspect;
  const choice = { taskId: task.id, runId: run.runId, sessionId: execution.sessionBinding.sessionId, requestId: "open-before-stop", requestVersion: 1, replyId: "reply-after-stop", answer: "一" };
  await submitReceipt(engine, {
    version: 1,
    kind: "question",
    receiptId: "stop-native-question",
    execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: "fixture-thread" } },
    payload: { mode: "native_deferred", requestId: choice.requestId, requestVersion: 1, options: ["一"], text: "原轮问题", nativeRequestId: "stop-private-route" },
  });
  expect(await call(engine, "tasks.dispatch.stop", input, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await requestStop(engine, { ...input, runId: "another-run" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const accepted = await requestStop(engine);
  expect(accepted).toMatchObject({ ok: true, data: { ...input, status: "pending" } });
  expect(recordOf(engine, run).stop).toMatchObject({ stopId: input.stopId, acceptedAt: expect.any(String) });
  expect(await requestStop(engine, { ...input, stopId: "different-stop" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  await vi.waitFor(async () => expect(await readStop(engine)).toMatchObject({ ok: true, data: { status: "unknown" } }));
  expect(await call(engine, "tasks.dispatch.list", { taskId: task.id })).toMatchObject({ ok: true, data: [{ runId: run.runId, stop: { stopId: input.stopId, status: "unknown" } }] });
  expect(await call(engine, "tasks.reply", choice)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect((await requestStop(engine)).data).toEqual((await readStop(engine)).data);
  expect(interrupt).toHaveBeenCalledExactlyOnceWith({ execution, stopId: input.stopId }, expect.any(AbortSignal));
  await stop(engine);

  inspect.mockClear();
  inspect.mockResolvedValue("stopped");
  const reopened = await start(root);
  await vi.waitFor(async () => expect(await readStop(reopened)).toMatchObject({ ok: true, data: { ...input, status: "stopped" } }));
  expect(await call(reopened, "tasks.dispatch.recent", { limit: 10 })).toMatchObject({ ok: true, data: [{ dispatch: { runId: run.runId, stop: { stopId: input.stopId, status: "stopped" } }, run: { state: "cancelled" } }] });
  expect(inspect).toHaveBeenCalledExactlyOnceWith({ execution, stopId: input.stopId }, expect.any(AbortSignal));
  expect(interrupt).toHaveBeenCalledTimes(1);
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: run.runId, state: "cancelled", finishedAt: expect.any(String), questions: 0 }] });
  expect(await call(reopened, "tasks.questions.list", { taskId: task.id })).toMatchObject({ ok: true, data: [{ requestId: choice.requestId, status: "closed" }] });
  expect(await call<TaskDto>(reopened, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: { status: "in_progress" } });
});

test("Automations 停用后，人工受理、两规则竞争及任务正文快照在重开后沿用一个 run", { timeout: 60_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  expect(await call(engine, "plugins.setEnabled", { id: "automations", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
  const task = await createDispatchable(engine);
  expect(await call(engine, "tasks.comments.add", { taskId: task.id, body: "讨论不会作为输入" })).toMatchObject({ ok: true });
  const request = intent(task);
  const desktop = call<DispatchReceipt>(engine, "tasks.dispatch", request);
  const attempts = await Promise.all([
    desktop.then((result) => (result.ok ? result.data : result.error)),
    ...["rule-a", "rule-b"].map((id) =>
      fixture.rule!.acceptRule(intent(task), rule(id)).catch((error: unknown) => {
        if (!isHuhuError(error)) throw error;
        return error.toJSON();
      }),
    ),
  ]);
  const winners = attempts.filter((result): result is DispatchReceipt => !!result && "eventId" in result);
  expect(winners).toHaveLength(1);
  const receipt = winners[0]!;
  expect(receipt).toMatchObject({ state: "pending", attempt: 1 });
  for (const result of attempts.filter((item) => !winners.some((winner) => winner === item))) {
    expect(result).toMatchObject({ code: "INVALID_INPUT", details: { reason: "task_occupied", eventId: receipt.eventId, runId: receipt.runId } });
  }
  expect(recordOf(engine, receipt)).toMatchObject({ claim: null, snapshot: { body: task.body, references: ["Notes/"], inputHash: task.inputHash, expectedVersion: task.version } });
  expect(recordOf(engine, receipt).snapshot.taskVersion).not.toBe(task.version);
  expect(readFileSync(recordFile(engine, receipt.eventId), "utf8")).not.toContain("讨论不会作为输入");
  expect(await call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [] });
  await stop(engine);

  const fake = executor();
  fake.ready = vi.fn<TaskDispatchExecutor["ready"]>().mockResolvedValue("busy");
  fixture.executor = fake;
  const reopened = await start(root);
  expect(await call(reopened, "automations.list", {})).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
  await waitDispatch(reopened, receipt, { state: "pending", reason: "waiting_resource", runId: receipt.runId });
  expect(await call(reopened, "tasks.read", { id: task.id })).toMatchObject({ ok: true, data: { status: "not_started" } });
  expect(fake.dispatch).not.toHaveBeenCalled();
  fake.ready = vi.fn<TaskDispatchExecutor["ready"]>().mockResolvedValue("ready");
  await waitDispatch(reopened, receipt, { state: "running", runId: receipt.runId, attempt: 1 });
  await vi.waitFor(async () => {
    const status = await call<TaskDto>(reopened, "tasks.read", { id: task.id });
    expect(status.data.status).toBe("in_progress");
    expect(status.data.comments.filter((comment) => comment.id === `sys-${receipt.runId}-dispatched`)).toHaveLength(1);
  });
  expect(fake.dispatch).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ eventId: receipt.eventId, runId: receipt.runId, attempt: 1, snapshot: expect.objectContaining({ inputHash: task.inputHash, body: task.body }) }),
    expect.any(AbortSignal),
  );
  expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: receipt.runId, state: "running" }] });
  const runningTask = (await call<TaskDto>(reopened, "tasks.read", { id: task.id })).data;
  const updated = await call<TaskDto>(reopened, "tasks.update", { id: task.id, expectedVersion: runningTask.version, patch: { body: "保留活动运行占用" } });
  expect(await call(reopened, "tasks.dispatch", intent(updated.data))).toMatchObject({ ok: false, error: { details: { reason: "task_occupied", runId: receipt.runId } } });
  expect(spawn).not.toHaveBeenCalled();
});

test("超过网关 24 小时，同 dispatchId 仍重交原记录且异载荷冲突", { timeout: 60_000 }, async () => {
  fixture.now = new Date("2030-01-01T00:00:00Z");
  const root = tempVault();
  const engine = await start(root, true);
  expect(await call(engine, "plugins.setEnabled", { id: "automations", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
  const task = await createDispatchable(engine);
  const request = intent(task);
  const key = randomUUID();
  const lookup = { taskId: task.id, dispatchId: request.dispatchId };
  const first = await call<DispatchReceipt>(engine, "tasks.dispatch", request, engine.rendererToken, key);
  expect(first).toMatchObject({ ok: true, data: { state: "pending" } });
  const parallel = await Promise.all([call<DispatchReceipt>(engine, "tasks.dispatch", request), call<DispatchReceipt>(engine, "tasks.dispatch", request)]);
  for (const response of parallel) expect(response).toEqual(first);
  expect(await call(engine, "tasks.dispatch.read", { ...lookup, taskId: "unrelated" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const cancelled = await call<DispatchReceipt>(engine, "tasks.dispatch.cancel", lookup);
  expect(cancelled).toMatchObject({ ok: true, data: { state: "cancelled", runId: first.data.runId, cancelRequested: true } });
  expect(await call(engine, "tasks.dispatch.cancel", lookup)).toEqual(cancelled);
  const cache = path.join(engine.vault.runtimeDir, "idempotency.ndjson");
  await stop(engine);
  // 仅移动隔离 Vault 的网关缓存时间，保留相同 HTTP 幂等键再重放。
  const oldCache = readFileSync(cache, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => {
      const entry = JSON.parse(line) as { k: string; at: number };
      if (entry.k === `desktop|tasks.dispatch|${key}`) entry.at -= 25 * 60 * 60_000;
      return JSON.stringify(entry);
    });
  writeFileSync(cache, `${oldCache.join("\n")}\n`);
  fixture.now = new Date("2030-01-02T01:00:00Z");
  fixture.executor = executor();
  const reopened = await start(root);
  expect(await call(reopened, "tasks.dispatch", request, reopened.rendererToken, key)).toEqual(cancelled);
  expect(await call(reopened, "tasks.dispatch", { ...request, expectedVersion: "different" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(await call(reopened, "tasks.dispatch", { ...request, taskId: "different-task" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(fixture.executor.dispatch).not.toHaveBeenCalled();
  expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [] });
});

test("领取落盘与发送写入之间及发送结果未落盘时，重开使用同一 run 和 attempt", { timeout: 60_000 }, async () => {
  fixture.checkMs = 60_000;
  const root = tempVault();
  const fake = executor();
  fixture.executor = fake;
  const engine = await start(root, true);
  const write = VaultFiles.prototype.write;
  const boundary = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(function (this: VaultFiles, rel, bytes, options) {
    if (rel.startsWith("tasks/dispatches/") && (JSON.parse(Buffer.from(bytes).toString("utf8")) as DispatchRecord).receipt.state === "sending") throw new Error("中断：领取已落盘，发送尚未开始");
    return write.call(this, rel, bytes, options);
  });
  const task = await createDispatchable(engine);
  const response = await call<DispatchReceipt>(engine, "tasks.dispatch", intent(task));
  expect(response).toMatchObject({ ok: true, data: { state: "pending" } });
  const receipt = response.data;
  try {
    await waitDispatch(engine, receipt, { state: "claimed" });
    await vi.waitFor(() => expect(fixture.errors).toContainEqual(new Error("中断：领取已落盘，发送尚未开始")));
    expect(recordOf(engine, receipt)).toMatchObject({ receipt: { runId: receipt.runId, attempt: 1 }, claim: { machineId: expect.any(String) }, startedAt: null });
    const cancelling = await createDispatchable(engine, "领取后取消");
    const second = (await call<DispatchReceipt>(engine, "tasks.dispatch", intent(cancelling))).data;
    await waitDispatch(engine, second, { state: "claimed" });
    const cancel = await call(engine, "tasks.dispatch.cancel", { taskId: cancelling.id, dispatchId: second.dispatchId });
    expect(cancel).toMatchObject({ ok: true, data: { state: "cancelled", runId: second.runId } });
    expect(await call(engine, "tasks.runs", { id: cancelling.id })).toMatchObject({ ok: true, data: [{ id: second.runId, state: "cancelled" }] });
    expect(fake.dispatch).not.toHaveBeenCalled();
  } finally {
    boundary.mockRestore();
  }
  await stop(engine);

  let sent: ((state: "accepted") => void) | undefined;
  fake.dispatch = vi.fn(
    () =>
      new Promise<"accepted">((resolve) => {
        sent = resolve;
      }),
  );
  const restarted = await start(root);
  await waitDispatch(restarted, receipt, { state: "sending" });
  await vi.waitFor(() => expect(fake.dispatch).toHaveBeenCalledTimes(1));
  expect(await call(restarted, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: receipt.runId, state: "queued" }] });
  await stop(restarted);
  sent?.("accepted");
  expect(recordOf(restarted, receipt).receipt.state).toBe("sending");

  fake.inspect = vi.fn<TaskDispatchExecutor["inspect"]>().mockResolvedValue("accepted");
  const recovered = await start(root);
  await waitDispatch(recovered, receipt, { state: "running", runId: receipt.runId, attempt: 1 });
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  expect(fake.inspect).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ runId: receipt.runId, attempt: 1, snapshotHash: recordOf(recovered, receipt).snapshotHash, snapshot: expect.objectContaining({ body: task.body }) }),
    expect.any(AbortSignal),
  );
  expect(await call(recovered, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ id: receipt.runId, state: "running" }] });
});

test("输入变化、窗口过期和任务关闭都阻止未发意图，未确认发送仍占用", { timeout: 60_000 }, async () => {
  fixture.now = new Date("2030-02-01T00:00:00Z");
  const root = tempVault();
  const engine = await start(root, true);
  const edited = await createDispatchable(engine, "修改输入");
  const expiring = await createDispatchable(engine, "窗口到期");
  const closing = await createDispatchable(engine, "关闭任务");
  const unknown = await createDispatchable(engine, "发送待核实");
  const old = await call<DispatchReceipt>(engine, "tasks.dispatch", intent(edited));
  const closed = await call<DispatchReceipt>(engine, "tasks.dispatch", intent(closing));
  const inWindow = await fixture.rule!.acceptRule(intent(expiring), { ...rule("expire"), expiresAt: "2030-02-01T01:00:00Z" });
  await expect(fixture.rule!.acceptRule(intent(unknown), { ...rule("future"), notBefore: "2030-02-01T01:00:00Z" })).rejects.toMatchObject({ details: { reason: "not_due" } });
  const next = await call<TaskDto>(engine, "tasks.update", { id: edited.id, expectedVersion: edited.version, patch: { body: "新输入" } });
  expect(next).toMatchObject({ ok: true, data: { inputRevision: edited.inputRevision + 1 } });
  expect(await call(engine, "tasks.setStatus", { id: closing.id, expectedVersion: closing.version, status: "completed" })).toMatchObject({ ok: true });
  await stop(engine);
  fixture.now = new Date("2030-02-01T01:00:00Z");
  fixture.executor = {
    ...executor(),
    dispatch: vi.fn(async () => {
      throw new Error("合成回包丢失");
    }),
  };
  const reopened = await start(root);
  await waitDispatch(reopened, old.data, { state: "stale_input" });
  await waitDispatch(reopened, inWindow, { state: "expired" });
  await waitDispatch(reopened, closed.data, { state: "cancelled", reason: "task_closed" });
  expect(recordOf(reopened, old.data).snapshot).toMatchObject({ body: edited.body, inputHash: edited.inputHash });
  expect(fixture.executor.ready).not.toHaveBeenCalled();
  expect(await call(reopened, "tasks.dispatch", intent(edited))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT", details: { reason: "stale_input" } } });
  const inFlight = (await call<DispatchReceipt>(reopened, "tasks.dispatch", intent(unknown))).data;
  await waitDispatch(reopened, inFlight, { state: "unknown", reason: "awaiting_confirmation" });
  const changed = await call<TaskDto>(reopened, "tasks.update", { id: unknown.id, expectedVersion: unknown.version, patch: { body: "更新不解除原轮占用" } });
  expect(await call(reopened, "tasks.dispatch", intent(changed.data))).toMatchObject({ ok: false, error: { details: { reason: "task_occupied", runId: inFlight.runId } } });
  expect(await call(reopened, "tasks.dispatch.cancel", { taskId: unknown.id, dispatchId: inFlight.dispatchId })).toMatchObject({ ok: true, data: { state: "unknown", cancelRequested: true } });
  await stop(reopened);
  const after = await start(root);
  await waitDispatch(after, inFlight, { state: "unknown", cancelRequested: true, runId: inFlight.runId });
  expect(await call(after, "tasks.dispatch", intent(changed.data))).toMatchObject({ ok: false, error: { details: { reason: "task_occupied", runId: inFlight.runId } } });
  expect(fixture.executor.inspect).toHaveBeenCalledWith(expect.objectContaining({ runId: inFlight.runId, snapshot: expect.objectContaining({ body: unknown.body, inputHash: unknown.inputHash }) }), expect.any(AbortSignal));
  expect(fixture.executor.dispatch).toHaveBeenCalledTimes(1);
  fixture.executor.inspect = vi.fn<TaskDispatchExecutor["inspect"]>().mockResolvedValue("not_sent");
  await waitDispatch(after, inFlight, { state: "cancelled", cancelRequested: true, runId: inFlight.runId });
  expect(fixture.executor.dispatch).toHaveBeenCalledTimes(1);
});

test("外部调用、只读受理及损坏记录都无法开始执行", { timeout: 60_000 }, async () => {
  const root = tempVault();
  const engine = await start(root, true);
  const task = await createDispatchable(engine);
  const input = intent(task);
  const lookup = { taskId: task.id, dispatchId: input.dispatchId };
  const dispatchCapabilities = { "tasks.dispatch": input, "tasks.dispatch.read": lookup, "tasks.dispatch.cancel": lookup };
  for (const [capability, args] of Object.entries(dispatchCapabilities)) {
    expect(await call(engine, capability, args, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  }
  expect(await call(engine, "gateway.mcp.update", { enabled: true })).toMatchObject({ ok: true });
  const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
  const token = await issueMcpCredential(engine);
  const session = await openMcpSession(endpoint, token);
  const mcp = async (method: string, params: unknown) => {
    const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session);
    expect(response.status).toBe(200);
    return ((await response.json()) as { result: { tools?: { name: string }[]; isError?: boolean } }).result;
  };
  expect(await mcp("tools/list", {})).toEqual({ tools: [] });
  expect(await call(engine, "gateway.update", { capability: "tasks.list", exposed: true })).toMatchObject({ ok: true });
  const { tools } = await mcp("tools/list", {});
  expect(tools).toContainEqual(expect.objectContaining({ name: "tasks_list" }));
  for (const [capability, args] of Object.entries(dispatchCapabilities)) {
    const name = capability.replaceAll(".", "_");
    expect(tools).not.toContainEqual(expect.objectContaining({ name }));
    expect(await mcp("tools/call", { name, arguments: args })).toMatchObject({ isError: true });
  }
  expect(await call(engine, "tasks.dispatch", { ...input, source: rule("forged") })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  await stop(engine);
  const readOnly = await start(root, false, true);
  expect(await call(readOnly, "tasks.dispatch", input)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
  await stop(readOnly);
  const writable = await start(root);
  const accepted = await call<DispatchReceipt>(writable, "tasks.dispatch", input);
  expect(accepted.ok).toBe(true);
  const recordPath = recordFile(writable, accepted.data.eventId);
  await stop(writable);
  writeFileSync(recordPath, '{"schema":1,"receipt":');
  fixture.executor = executor();
  const recovered = await start(root);
  expect(await call(recovered, "tasks.dispatch.read", lookup)).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL", details: { eventId: accepted.data.eventId } } });
  expect(await call(recovered, "tasks.dispatch", intent(task))).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
  expect(fixture.executor.dispatch).not.toHaveBeenCalled();
});

test("结构合法但身份损坏的记录报错，独立任务仍可重开恢复", { timeout: 60_000 }, async () => {
  const root = tempVault();
  const initial = executor();
  fixture.executor = { ...initial, dispatch: vi.fn<TaskDispatchExecutor["dispatch"]>().mockResolvedValue("unknown") };
  const source = await start(root, true);
  const damaged = [];
  for (const patch of [{ runId: "", attempt: 2 }, { runId: newId("run") }, { attempt: 2 }, { state: "claimed" }]) {
    const task = await createDispatchable(source);
    const request = intent(task);
    const receipt = await acceptDispatch(source, request);
    await waitDispatch(source, receipt, { state: "unknown" });
    damaged.push({ request, receipt, patch, file: recordFile(source, receipt.eventId), taskFile: path.join(root, task.path), record: recordOf(source, receipt) });
  }
  await stop(source);
  delete fixture.executor;
  const idle = await start(root);
  const healthy = await createDispatchable(idle, "独立待派");
  const pending = await acceptDispatch(idle, intent(healthy));
  await stop(idle);
  const corrupted = damaged.map(({ file, taskFile, record, patch }) => {
    const bytes = JSON.stringify({ ...record, receipt: { ...record.receipt, ...patch } });
    writeFileSync(file, bytes);
    return { bytes, taskBytes: readFileSync(taskFile) };
  });

  const recovered = executor();
  fixture.executor = recovered;
  const reopened = await start(root);
  const replies = await Promise.all(damaged.flatMap(({ request, receipt }) => [call(reopened, "tasks.dispatch.read", { taskId: receipt.taskId, dispatchId: receipt.dispatchId }), call(reopened, "tasks.dispatch", request)]));
  await waitDispatch(reopened, pending, { state: "running", runId: pending.runId, attempt: 1 });
  expect(replies.map((response) => [response.ok, response.error?.code])).toEqual(
    damaged.flatMap(() => [
      [false, "WRITE_PARTIAL"],
      [false, "WRITE_PARTIAL"],
    ]),
  );
  expect(recovered.inspect).not.toHaveBeenCalled();
  expect(recovered.ready).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ runId: pending.runId, attempt: 1 }), expect.any(AbortSignal));
  expect(recovered.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ runId: pending.runId, attempt: 1 }), expect.any(AbortSignal));
  damaged.forEach(({ file, taskFile }, i) => {
    expect(readFileSync(file, "utf8")).toBe(corrupted[i]!.bytes);
    expect(readFileSync(taskFile)).toEqual(corrupted[i]!.taskBytes);
  });
});

test("ZIP 导入保留待派、待核实及已发历史，同 Vault 重开才会继续派遣", { timeout: 60_000 }, async () => {
  const root = tempVault();
  const importedRoot = tempVault();
  const sameIdRoot = tempVault();
  const archive = path.join(tempVault(), "backup.zip");
  fixture.executor = { ...executor(), dispatch: vi.fn<TaskDispatchExecutor["dispatch"]>().mockResolvedValue("unknown") };
  const initial = await start(root, true);
  const unknownTask = await createDispatchable(initial, "待核实");
  const unknownRequest = intent(unknownTask);
  const unknown = await acceptDispatch(initial, unknownRequest);
  await waitDispatch(initial, unknown, { state: "unknown" });
  const sentTask = await createDispatchable(initial, "已发但看板尚未更新");
  const sentRequest = intent(sentTask);
  fixture.executor.dispatch = vi.fn<TaskDispatchExecutor["dispatch"]>().mockResolvedValue("accepted");
  const write = VaultFiles.prototype.write;
  const interrupted = new Error("中断：目标已接受，任务 Markdown 尚未写入");
  const boundary = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(function (this: VaultFiles, rel, bytes, options) {
    if (this.root === root && rel === sentTask.path) throw interrupted;
    return write.call(this, rel, bytes, options);
  });
  const { source, pendingTask, pending, sent, history, before, imported } = await (async () => {
    try {
      const sent = await acceptDispatch(initial, sentRequest);
      await waitDispatch(initial, sent, { state: "running" });
      await vi.waitFor(() => expect(fixture.errors).toContain(interrupted));
      await stop(initial);
      delete fixture.executor;
      const source = await start(root);
      const pendingTask = await createDispatchable(source, "待派");
      const pendingRequest = intent(pendingTask);
      const pending = await acceptDispatch(source, pendingRequest);
      const history = [
        { task: pendingTask, request: pendingRequest, receipt: pending },
        { task: unknownTask, request: unknownRequest, receipt: unknown },
        { task: sentTask, request: sentRequest, receipt: sent },
      ];
      expect(await call(source, "tasks.read", { id: sentTask.id })).toMatchObject({ ok: true, data: { status: "not_started" } });
      const before = history.map(({ task, receipt }) => ({
        record: readFileSync(recordFile(source, receipt.eventId)),
        task: readFileSync(path.join(root, task.path)),
        reply: recordOf(source, receipt).receipt,
      }));
      expect(await call(source, "vault.exportPackage", { dest: archive, includeAttachments: false })).toMatchObject({ ok: true, data: { vaultId: source.vault.id } });
      const imported = await call<{ vaultId: string }>(source, "vault.importPackage", { zipPath: archive, targetDir: importedRoot });
      expect(imported.ok).toBe(true);
      expect(imported.data.vaultId).not.toBe(source.vault.id);
      await stop(source);
      return { source, pendingTask, pending, sent, history, before, imported };
    } finally {
      boundary.mockRestore();
    }
  })();

  const cloneExecutor = executor();
  fixture.executor = cloneExecutor;
  const clone = await start(importedRoot);
  expect(clone.vault.info.id).toBe(imported.data.vaultId);
  expect(await call(clone, "tasks.runs", { id: unknownTask.id })).toMatchObject({ ok: true, data: [{ id: unknown.runId, state: "unknown" }] });
  expect(await call(clone, "tasks.runs", { id: sentTask.id })).toMatchObject({ ok: true, data: [{ id: sent.runId, state: "running" }] });
  // Recover an independent local event to observe a complete scan in the imported Vault.
  const own = await createDispatchable(clone, "副本自己的新任务");
  const ownReceipt = await acceptDispatch(clone, intent(own));
  await waitDispatch(clone, ownReceipt, { state: "running" });
  const copied = await Promise.all(
    history.map(async ({ request, receipt, task }) => {
      const lookup = { taskId: task.id, dispatchId: receipt.dispatchId };
      return {
        read: await call(clone, "tasks.dispatch.read", lookup),
        repeat: await call(clone, "tasks.dispatch", request),
        mismatch: await call(clone, "tasks.dispatch", { ...request, expectedVersion: "different" }),
        fresh: await call(clone, "tasks.dispatch", intent(task)),
        cancel: await call(clone, "tasks.dispatch.cancel", lookup),
        record: readFileSync(recordFile(clone, receipt.eventId)),
        task: readFileSync(path.join(importedRoot, task.path)),
      };
    }),
  );

  await stop(clone);
  delete fixture.executor;
  const importer = await start(tempVault(), true);
  // The public restore always creates a new Vault identity, including an unrelated importer.
  const unrelated = await call<{ vaultId: string }>(importer, "vault.importPackage", { zipPath: archive, targetDir: tempVault() });
  expect(unrelated.ok).toBe(true);
  expect(unrelated.data.vaultId).not.toBe(source.vault.id);
  await stop(importer);

  // Model a copied/legacy Vault with the low-level archive reader, outside the public restore contract.
  expect(importPackage(archive, sameIdRoot).vaultId).toBe(source.vault.id);

  // Even a file-level copy of the original runtime key lacks the current directory identity.
  const keyName = readdirSync(source.vault.runtimeDir).find((name) => /^task-dispatch-[a-f0-9]{32}\.key$/.test(name));
  expect(keyName).toBeDefined();
  const localRuntime = path.join(sameIdRoot, path.relative(root, source.vault.runtimeDir));
  mkdirSync(localRuntime, { recursive: true });
  writeFileSync(path.join(localRuntime, keyName!), readFileSync(path.join(source.vault.runtimeDir, keyName!)));

  const sameIdExecutor = executor();
  fixture.executor = sameIdExecutor;
  const sameId = await start(sameIdRoot);
  expect(sameId.vault.id).toBe(source.vault.id);
  const sameIdLookup = { taskId: pending.taskId, dispatchId: pending.dispatchId };
  expect(await call(sameId, "tasks.dispatch.read", sameIdLookup)).toMatchObject({ ok: true, data: pending });
  expect(await call(sameId, "tasks.dispatch.cancel", sameIdLookup)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "unverified_owner" } } });
  const ownInSameId = await createDispatchable(sameId, "同 ID 副本的新任务");
  const sameIdReceipt = await acceptDispatch(sameId, intent(ownInSameId));
  await waitDispatch(sameId, sameIdReceipt, { state: "running" });
  expect(readdirSync(localRuntime).filter((name) => /^task-dispatch-[a-f0-9]{32}\.key$/.test(name))).toHaveLength(2);
  expect(sameIdExecutor.ready).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: sameIdReceipt.eventId }), expect.any(AbortSignal));
  expect(sameIdExecutor.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: sameIdReceipt.eventId }), expect.any(AbortSignal));
  expect(sameIdExecutor.inspect).not.toHaveBeenCalled();
  history.forEach(({ task, receipt }, i) => {
    expect(readFileSync(recordFile(sameId, receipt.eventId))).toEqual(before[i]!.record);
    expect(readFileSync(path.join(sameIdRoot, task.path))).toEqual(before[i]!.task);
  });
  await stop(sameId);

  const sourceExecutor = executor();
  fixture.executor = sourceExecutor;
  const reopened = await start(root);
  expect(reopened.vault.info.id).toBe(source.vault.info.id);
  await waitDispatch(reopened, pending, { state: "running", runId: pending.runId, attempt: 1 });
  expect(sourceExecutor.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: pending.eventId, runId: pending.runId, attempt: 1 }), expect.any(AbortSignal));
  expect(sourceExecutor.inspect).toHaveBeenCalledWith(expect.objectContaining({ eventId: unknown.eventId, runId: unknown.runId, attempt: 1 }), expect.any(AbortSignal));

  expect(cloneExecutor.ready).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: ownReceipt.eventId }), expect.any(AbortSignal));
  expect(cloneExecutor.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: ownReceipt.eventId }), expect.any(AbortSignal));
  expect(cloneExecutor.inspect).not.toHaveBeenCalled();
  copied.forEach(({ read, repeat, mismatch, fresh, cancel, record, task }, i) => {
    expect(read).toMatchObject({ ok: true, data: before[i]!.reply });
    expect(repeat).toEqual(read);
    expect(mismatch).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(fresh).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "task_occupied" } } });
    expect(cancel).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "foreign_vault" } } });
    expect(record).toEqual(before[i]!.record);
    expect(task).toEqual(before[i]!.task);
  });
  expect(readFileSync(recordFile(reopened, pending.eventId))).not.toEqual(before[0]!.record);
  await vi.waitFor(() => expect(readFileSync(path.join(root, pendingTask.path))).not.toEqual(before[0]!.task));
  expect(readFileSync(recordFile(reopened, unknown.eventId))).toEqual(before[1]!.record);
  expect(readFileSync(path.join(root, unknownTask.path))).toEqual(before[1]!.task);
  expect(readFileSync(recordFile(reopened, sent.eventId))).toEqual(before[2]!.record);
  expect(await call(reopened, "tasks.read", { id: sentTask.id })).toMatchObject({ ok: true, data: { status: "in_progress", comments: [{ id: `sys-${sent.runId}-dispatched` }] } });
  expect(readFileSync(path.join(root, sentTask.path))).not.toEqual(before[2]!.task);
});

test("身份未证实的旧版收据保留历史和占用，重开无需认领或补写", { timeout: 60_000 }, async () => {
  const root = tempVault();
  const source = await start(root, true);
  const task = await createDispatchable(source, "旧版记录");
  const request = intent(task);
  const pending = await acceptDispatch(source, request);
  const file = recordFile(source, pending.eventId);
  const record = recordOf(source, pending);
  await stop(source);
  const { receipt, requestHash, snapshot, snapshotHash, claim, startedAt, finishedAt } = record;
  const oldBytes = JSON.stringify({ schema: 1, receipt, requestHash, snapshot, snapshotHash, claim, startedAt, finishedAt });
  writeFileSync(file, oldBytes);
  const taskFile = path.join(root, task.path);
  const taskBytes = readFileSync(taskFile);
  const fake = executor();
  fixture.executor = fake;
  const reopened = await start(root);
  const key = { taskId: pending.taskId, dispatchId: pending.dispatchId };
  const read = await call(reopened, "tasks.dispatch.read", key);
  expect(read).toMatchObject({ ok: true, data: pending });
  expect(await call(reopened, "tasks.dispatch", request)).toEqual(read);
  expect(await call(reopened, "tasks.dispatch", intent(task))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "task_occupied" } } });
  expect(await call(reopened, "tasks.dispatch.cancel", key)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { reason: "unverified_owner" } } });
  const own = await createDispatchable(reopened, "本 Vault 新记录");
  const ownReceipt = await acceptDispatch(reopened, intent(own));
  await waitDispatch(reopened, ownReceipt, { state: "running" });
  expect(fake.ready).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: ownReceipt.eventId }), expect.any(AbortSignal));
  expect(fake.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventId: ownReceipt.eventId }), expect.any(AbortSignal));
  expect(fake.inspect).not.toHaveBeenCalled();
  expect(readFileSync(file, "utf8")).toBe(oldBytes);
  expect(readFileSync(taskFile)).toEqual(taskBytes);
});

test.each(externalEntries)("%s 逐项开放、撤销和重查任务的派遣、补充与停止", { timeout: 45_000 }, async (entry) => {
  const { root, engine, task, fake, run, execution } = await startBoundRun();
  const configure = async (id: string, exposed: boolean, running = engine) => {
    expect(await call(running, "gateway.update", { capability: id, exposed })).toMatchObject({ ok: true, data: { exposed, revision: expect.any(Number) } });
  };
  const {
    data: { token },
  } = await call<{ token: string }>(engine, "gateway.tokens.create", { name: "domain-test" });
  expect(await call(engine, "gateway.mcp.update", { enabled: true })).toMatchObject({ ok: true });
  const external = await externalToolEntry(entry, engine, token);
  const ids = {
    list: "tasks.dispatch.list",
    recent: "tasks.dispatch.recent",
    send: "tasks.supplement",
    supplement: "tasks.supplement.read",
    stop: "tasks.dispatch.stop",
    stopped: "tasks.dispatch.stop.read",
    internal: "tasks.receipts.consume",
  };
  const supplement = { taskId: task.id, runId: run.runId, sessionId: execution.sessionBinding.sessionId, supplementId: randomUUID() };
  const stopInput = { taskId: task.id, runId: run.runId, dispatchId: run.dispatchId, stopId: randomUUID() };
  const send = { ...supplement, text: "本机夹具正文", messageIds: [] };
  const inputs = {
    [ids.list]: { taskId: task.id },
    [ids.recent]: { limit: 1 },
    [ids.send]: send,
    [ids.supplement]: supplement,
    [ids.stop]: stopInput,
    [ids.stopped]: stopInput,
    [ids.internal]: {},
  };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const absent = { ok: false, error: { code: "NOT_FOUND" } };
  expect(await external.list()).toEqual([]);
  for (const [id, input] of Object.entries(inputs)) expect(await external.call(id, input)).toMatchObject(denied);
  expect(
    await call(engine, "gateway.policy.preview", {
      changes: [
        { capability: ids.list, exposed: true },
        { capability: ids.internal, exposed: true },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

  for (const id of [ids.list, ids.recent, ids.supplement, ids.stopped]) await configure(id, true);
  const initialStarts = vi.mocked(spawn).mock.calls.length;
  const peek = vi.spyOn(HerdrCore.prototype, "peek");
  const writes = vi.spyOn(VaultFiles.prototype, "write");
  try {
    expect(await external.call(ids.list, inputs[ids.list])).toMatchObject({ ok: true, data: [{ runId: run.runId, session: { id: supplement.sessionId } }] });
    expect(await external.call(ids.recent, inputs[ids.recent])).toMatchObject({ ok: true, data: [{ dispatch: { runId: run.runId } }] });
    expect(await external.call(ids.list, { taskId: "missing-task" })).toMatchObject(absent);
    expect(await external.call(ids.supplement, supplement)).toMatchObject(absent);
    expect(await external.call(ids.stopped, stopInput)).toMatchObject(absent);
    expect(writes).not.toHaveBeenCalled();
    expect(vi.mocked(spawn).mock.calls).toHaveLength(initialStarts);
    expect(peek).not.toHaveBeenCalled();
  } finally {
    writes.mockRestore();
    peek.mockRestore();
  }

  await configure(ids.send, true);
  await configure(ids.stop, true);
  expect(new Set(await external.list())).toEqual(new Set([ids.list, ids.recent, ids.send, ids.supplement, ids.stop, ids.stopped]));
  vi.mocked(fake.ready).mockResolvedValue("busy");
  const interrupt = vi.fn<NonNullable<TaskDispatchExecutor["stop"]>>().mockResolvedValue("stopped");
  fake.stop = interrupt;
  expect(await external.call(ids.send, { ...send, sessionId: "wrong-session" })).toMatchObject({ ok: false, error: { code: "RUN_UNKNOWN" } });
  expect(await external.call(ids.stop, { ...stopInput, runId: "wrong-run" })).toMatchObject(absent);
  const supplements = await Promise.all([external.call<{ followUpRunId: string }>(ids.send, send), external.call<{ followUpRunId: string }>(ids.send, send)]);
  expect(supplements[0]).toMatchObject({ ok: true, data: { followUpRunId: expect.any(String) } });
  expect(supplements[1]).toEqual(supplements[0]);
  const supplementAccepted = supplements[0];
  if (!supplementAccepted?.ok) throw Error("未受理补充夹具");
  const supplementRunId = supplementAccepted.data.followUpRunId;
  expect(await external.call(ids.send, { ...send, text: "同意图不同输入" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  const stops = await Promise.all([external.call(ids.stop, stopInput), external.call(ids.stop, stopInput)]);
  for (const result of stops) expect(result).toMatchObject({ ok: true, data: { runId: run.runId, stopId: stopInput.stopId } });
  await expect.poll(() => external.call(ids.stopped, stopInput)).toMatchObject({ ok: true, data: { status: "stopped" } });
  expect(interrupt).toHaveBeenCalledExactlyOnceWith({ execution, stopId: stopInput.stopId }, expect.any(AbortSignal));
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  if (entry === "HTTP MCP") {
    const other = await externalToolEntry(entry, engine, token);
    expect(await other.call(ids.supplement, supplement)).toMatchObject(absent);
    expect(await other.call(ids.stopped, stopInput)).toMatchObject(absent);
  }

  for (const [id, input] of Object.entries(inputs).filter(([id]) => id !== ids.internal)) {
    await configure(id, false);
    expect(await external.list()).not.toContain(id);
    expect(await external.call(id, input)).toMatchObject(denied);
  }
  expect(interrupt).toHaveBeenCalledTimes(1);
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
  await stop(engine);

  const reopened = await start(root);
  for (const id of [ids.send, ids.supplement, ids.stop, ids.stopped]) await configure(id, true, reopened);
  const again = await externalToolEntry(entry, reopened, token);
  if (entry === "CLI") {
    expect(await again.call(ids.send, send)).toMatchObject({ ok: true, data: { followUpRunId: supplementRunId, status: "expired" } });
    expect(await again.call(ids.stop, stopInput)).toMatchObject({ ok: true, data: { status: "stopped" } });
  } else {
    expect(await again.call(ids.send, send)).toMatchObject(absent);
    expect(await again.call(ids.stop, stopInput)).toMatchObject(absent);
  }
  expect(await call(reopened, ids.supplement, supplement)).toMatchObject({ ok: true, data: { followUpRunId: supplementRunId, status: "expired" } });
  expect(await call(reopened, ids.stopped, stopInput)).toMatchObject({ ok: true, data: { status: "stopped" } });
  expect(interrupt).toHaveBeenCalledTimes(1);
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
});

test.each(externalEntries)("%s 逐项开放和撤销 Tasks 目标快照，冷与热夹具都无需拨号", { timeout: 45_000 }, async (entry) => {
  targetProviders = {
    claude: { id: "fixture", modes: ["new", "existing"], ready: vi.fn().mockResolvedValue(true), acceptance: vi.fn().mockResolvedValue(null) },
  };
  const engine = await start(tempVault(), true);
  const [space] = (await call<{ id: string; root: string }[]>(engine, "agent.spaces.list", {})).data;
  expect(space).toBeDefined();
  const command = path.join(engine.vault.root, "fixture-agent");
  writeFileSync(command, "", { mode: 0o755 });
  expect(await call(engine, "agent.settings.update", { expectedRevision: 0, defaultAgent: "claude", agents: { claude: { command } } })).toMatchObject({ ok: true });
  const {
    data: { token },
  } = await call<{ token: string }>(engine, "gateway.tokens.create", { name: "target-snapshot" });
  expect(await call(engine, "gateway.mcp.update", { enabled: true })).toMatchObject({ ok: true });
  const external = await externalToolEntry(entry, engine, token);
  const id = "tasks.dispatch.targets";
  const input = { spaceId: space!.id };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const configure = (exposed: boolean) => call(engine, "gateway.update", { capability: id, exposed });
  const targetDir = path.join(engine.vault.stateDir, "agent-cli", "sessions");
  const targetFile = path.join(targetDir, "session-fixture.json");
  const existing = {
    id: "session-fixture",
    requestId: "request-fixture",
    spaceId: input.spaceId,
    name: "fixture",
    state: "running",
    provider: "claude",
    cwd: space!.root,
    terminalId: "fixture-core/t1",
    createdAt: "2026-01-01T00:00:00Z",
  };

  expect(await external.list()).not.toContain(id);
  expect(await external.call(id, input)).toMatchObject(denied);
  expect(await configure(true)).toMatchObject({ ok: true });
  expect(await external.list()).toContain(id);
  const initialStarts = vi.mocked(spawn).mock.calls.length;
  const peek = vi.spyOn(HerdrCore.prototype, "peek");
  const ensure = vi.spyOn(HerdrCore.prototype, "ensure");
  const dial = vi.spyOn(HerdrClient.prototype, "connect");
  const rpc = vi.spyOn(HerdrClient.prototype, "call");
  const observe = vi.spyOn(SessionsService.prototype, "executionSession");
  const writes = vi.spyOn(VaultFiles.prototype, "write");
  try {
    const list = () => external.call<Array<{ mode: string; sessionId?: string }>>(id, input);
    const cold = await list();
    expect(cold).toMatchObject({ ok: true });
    if (!cold.ok) throw Error(cold.error.code);
    expect(cold.data).toContainEqual(expect.objectContaining({ mode: "new", provider: "claude", available: true }));
    expect(cold.data.some(({ mode }) => mode === "existing")).toBe(false);
    expect(existsSync(targetDir)).toBe(false);

    mkdirSync(targetDir, { recursive: true });
    const bytes = JSON.stringify(existing);
    writeFileSync(targetFile, bytes);
    const warm = await list();
    expect(warm).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ mode: "existing", provider: "claude", sessionId: existing.id, available: false, reason: "binding_unverified", capabilities: expect.objectContaining({ liveSession: { state: "runtime_check", reason: "binding_unverified" } }) })]) });
    expect(readFileSync(targetFile, "utf8")).toBe(bytes);
    expect(await external.call(id, { spaceId: "space-missing" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(vi.mocked(spawn).mock.calls).toHaveLength(initialStarts);
    for (const spy of [peek, ensure, dial, rpc, observe, writes]) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of [peek, ensure, dial, rpc, observe, writes]) spy.mockRestore();
  }

  expect(await configure(false)).toMatchObject({ ok: true });
  expect(await external.list()).not.toContain(id);
  expect(await external.call(id, input)).toMatchObject(denied);
  expect(readFileSync(targetFile, "utf8")).toBe(JSON.stringify(existing));
});

test("包验收先阻止接收，停用后恢复只丢一次 ACK，重交沿用唯一记录", { timeout: 60_000 }, async () => {
  const { root, engine, task, run, execution } = await startBoundRun();
  const input = { version: 1, receiptId: "fixture-before-consume", kind: "result", execution, payload: { message: "合成结果" } } as const satisfies ExecutionReceipt;
  const gate = path.join(root, "ordered-receipt-gate");
  mkdirSync(gate);
  writeFileSync(path.join(gate, "dispatch-id"), run.dispatchId);
  writeFileSync(path.join(gate, "before-consume"), "");
  writeFileSync(path.join(gate, "drop-once"), "");
  vi.stubEnv("HUHU_E2E_TASK_RECEIPT_ACK_GATE", gate);
  const inbox = path.join(engine.vault.stateDir, "tasks", "receipts");
  const records = () => (existsSync(inbox) ? readdirSync(inbox).filter((file) => file.endsWith(".json")) : []);
  expect(await submitReceipt(engine, input)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  expect(JSON.parse(readFileSync(path.join(gate, "pending.json"), "utf8"))).toEqual(input);
  expect(records()).toEqual([]);
  expect(await call(engine, "plugins.setEnabled", { id: "tasks", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
  writeFileSync(path.join(gate, "consume-release"), "");
  expect((await submitReceipt(engine, input)).ok).toBe(false);
  expect(records()).toEqual([]);
  expect(await call(engine, "plugins.setEnabled", { id: "tasks", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
  expect(await submitReceipt(engine, input)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  const held = JSON.parse(readFileSync(path.join(gate, "held.json"), "utf8"));
  expect(records()).toHaveLength(1);
  expect(await submitReceipt(engine, input)).toEqual({ ok: true, data: held });
  expect(await submitReceipt(engine, input)).toEqual({ ok: true, data: held });
  expect(records()).toHaveLength(1);
  await vi.waitFor(async () => expect((await call<TaskDto>(engine, "tasks.read", { id: task.id })).data.comments.filter(({ event }) => event === "result")).toHaveLength(1));
});

async function bindGitHubFixture(engine: RunningEngine, replyActorIds: number[] = []) {
  const token = await call<{ id: string; token: string }>(engine, "gateway.tokens.create", { name: "github-connector-fixture" });
  expect(token.ok).toBe(true);
  const config = await call<{ sourceId: string }>(engine, "tasks.github.source.create", {
    connectorId: token.data.id, repositoryId: githubRepository.id, repository: githubRepository.name, replyActorIds,
  });
  expect(config.ok).toBe(true);
  for (const capability of ["tasks.github.events.accept", "tasks.github.events.read"]) {
    expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
  }
  return { ...token.data, ...config.data };
}

test("TW4 GitHub 事件重投、冲突、乱序和来源归并经过实际 HTTP 认证与持久化", async () => {
  const root = tempVault();
  let engine = await start(root, true);
  const first = await bindGitHubFixture(engine);
  const second = await bindGitHubFixture(engine);
  const accept = (raw: unknown, connection = first, sourceId = connection.sourceId) =>
    call<{ taskId: string; state: string }>(engine, "tasks.github.events.accept", { sourceId, raw }, connection.token);
  const created = await accept(githubIssueEvent());
  expect(created).toMatchObject({ ok: true, data: { state: "created", taskId: expect.any(String) } });
  const id = created.data.taskId;
  expect(await accept(githubIssueEvent(), second, first.sourceId)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await accept(githubIssueEvent(), second)).toMatchObject({ ok: true, data: { state: "created", taskId: expect.not.stringMatching(id) } });
  expect(await accept(githubIssueEvent("20101", { title: "同 ID 异内容" }))).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(await accept({ ...githubIssueEvent("20106"), repo: { ...githubRepository, id: 999 } })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await accept(githubIssueEvent("20102", { updated_at: "2026-11-24T10:01:00Z", body: "较新的 Issue" }))).toMatchObject({ ok: true, data: { state: "updated", taskId: id } });
  expect(await accept(githubIssueEvent("20103", { updated_at: "2026-11-24T09:59:00Z" }))).toMatchObject({ ok: true, data: { state: "stale", taskId: id } });
  expect(await accept(githubCommentEvent("20104", "同一 Issue 的评论"))).toMatchObject({ ok: true, data: { state: "discussion", taskId: id } });

  await stop(engine);
  engine = await start(root);
  expect(await accept(githubIssueEvent())).toEqual(created);
  expect(await accept(githubCommentEvent("20104", "同一 Issue 的评论"))).toMatchObject({ ok: true, data: { state: "discussion", taskId: id } });
  const task = (await call<TaskDto>(engine, "tasks.read", { id })).data;
  expect(task.origin).toMatchObject({ kind: "external", github: { sourceId: first.sourceId, issueId: githubIssue.id, eventId: "20101" } });
  expect(task.comments.map(({ event }) => event)).toEqual(["github-issue-updated", "github-comment"]);
  expect(await call(engine, "tasks.github.events.read", { sourceId: first.sourceId, eventId: "20104" }, first.token)).toMatchObject({
    ok: true, data: { raw: githubCommentEvent("20104", "同一 Issue 的评论"), connectorId: first.id, actor: githubAuthor, taskId: id },
  });
  expect(await call(engine, "tasks.github.source.retire", { sourceId: first.sourceId })).toMatchObject({ ok: true });
  expect(await accept(githubIssueEvent())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
});

test("TW4 GitHub 已认证事件仍按真实作者、原对象及当前版本消费原生问题一次", async () => {
  const { fake, engine } = await startBoundRun();
  const connector = await bindGitHubFixture(engine, [githubAuthor.id]);
  const submit = (raw: unknown) => call<{ taskId: string; reply: unknown }>(engine, "tasks.github.events.accept", { sourceId: connector.sourceId, raw }, connector.token);
  const { data: { taskId } } = await submit(githubIssueEvent());
  const { data: original } = await call<TaskDto>(engine, "tasks.read", { id: taskId });
  const { data: spaces } = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
  const { data: task } = await call<TaskDto>(engine, "tasks.update", {
    id: taskId, expectedVersion: original.version, patch: { type: "agent", execution: { spaceId: spaces[0]!.id, provider: "codex" } },
  });
  const run = await acceptDispatch(engine, intent(task));
  await waitDispatch(engine, run, { state: "running" });
  const execution = recordOf(engine, run).boundExecution!;
  const question = { taskId, runId: run.runId, sessionId: execution.sessionBinding.sessionId, requestId: "github-ask", requestVersion: 2 };
  const answer = vi.fn<NonNullable<TaskDispatchExecutor["answer"]>>().mockResolvedValue({ status: "accepted" });
  fake.answer = answer;
  expect(await submitReceipt(engine, {
    version: 1, kind: "question", receiptId: "github-question",
    execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: "fixture-thread" } },
    payload: { mode: "native_deferred", requestId: question.requestId, requestVersion: 2, text: "选择结果", options: ["明确答复"], nativeRequestId: "gh-native" },
  })).toMatchObject({ ok: true });
  expect(await call(engine, "tasks.github.question.allow", { ...question, sourceId: connector.sourceId, issueId: githubIssue.id })).toMatchObject({ ok: true });
  const body = (version: number) => `/huhu answer ${question.runId} ${question.sessionId} ${question.requestId} ${version}\n明确答复`;
  expect(await submit(githubCommentEvent("20102", "只是讨论"))).toMatchObject({ ok: true, data: { state: "discussion" } });
  expect(await submit(githubCommentEvent("20103", body(2), { id: 88, login: "other-author" }))).toMatchObject({ ok: true, data: { state: "reply-denied" } });
  expect(await submit(githubCommentEvent("20104", body(1)))).toMatchObject({ ok: true, data: { state: "reply-denied" } });
  expect(answer).not.toHaveBeenCalled();

  const accepted = await submit(githubCommentEvent("20105", body(2)));
  expect(accepted).toMatchObject({ ok: true, data: { state: "reply-accepted", reply: question } });
  expect(await submit(githubCommentEvent("20105", body(2)))).toEqual(accepted);
  expect(await submit(githubCommentEvent("20106", body(2)))).toMatchObject({ ok: true, data: { state: "reply-rejected" } });
  await expect.poll(() => call(engine, "tasks.reply.read", accepted.data.reply)).toMatchObject({ ok: true, data: { status: "accepted" } });
  await expect.poll(async () => (await call<TaskDto>(engine, "tasks.read", { id: taskId })).data.comments.filter(({ event }) => event === "answer")).toMatchObject([{ author: "GitHub @issue-author", body: "明确答复" }]);
  expect(answer).toHaveBeenCalledTimes(1);
});

test.each(["echo", "list", "none"] as const)("TW5 GitHub 丢失 POST 回包（%s）只核实原结果，不再发送或派发", async (evidence) => {
  const { root, fake, engine: first } = await startBoundRun();
  let engine = first;
  const connector = await bindGitHubFixture(engine);
  const receive = (raw: unknown) => call<{ taskId: string; state: string }>(engine, "tasks.github.events.accept", { sourceId: connector.sourceId, raw }, connector.token);
  const { data: { taskId } } = await receive(githubIssueEvent());
  const { data: original } = await call<TaskDto>(engine, "tasks.read", { id: taskId });
  const { data: spaces } = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
  const { data: task } = await call<TaskDto>(engine, "tasks.update", {
    id: taskId, expectedVersion: original.version, patch: { type: "agent", execution: { spaceId: spaces[0]!.id, provider: "codex" } },
  });
  const run = await acceptDispatch(engine, intent(task));
  await waitDispatch(engine, run, { state: "running" });
  const execution = recordOf(engine, run).boundExecution!;
  const result = { version: 1, kind: "result", receiptId: "github-result-receipt", execution, payload: { message: "待投递的稳定结果" } } as const satisfies ExecutionReceipt;
  expect(await submitReceipt(engine, result)).toEqual(await submitReceipt(engine, result));
  await expect.poll(() => call(engine, "tasks.runs", { id: taskId })).toMatchObject({
    ok: true, data: [{ result: { receiptId: result.receiptId, delivery: "delivered" } }],
  });
  const outputActor = { id: 81, login: "github-delivery-bot" };
  const scope = { sourceId: connector.sourceId, issueId: githubIssue.id };
  expect(await call(engine, "tasks.github.deliveries.allow", { ...scope, actorId: outputActor.id })).toMatchObject({ ok: true });
  for (const verb of ["claim", "confirm", "read"]) {
    expect(await call(engine, "gateway.update", { capability: `tasks.github.deliveries.${verb}`, exposed: true })).toMatchObject({ ok: true });
  }

  let posts = 0;
  let queries = 0;
  let postedBody = "";
  let echoed: Awaited<ReturnType<typeof receive>> | undefined;
  const server = createServer(async (req, res) => {
    try {
      res.setHeader("content-type", "application/json");
      const { pathname } = new URL(req.url!, "http://127.0.0.1");
      const repo = `/repos/${githubRepository.name}`;
      const issue = `${repo}/issues/${githubIssue.number}`;
      if (pathname === repo) res.end(JSON.stringify({ id: githubRepository.id, full_name: githubRepository.name }));
      else if (pathname === issue) res.end(JSON.stringify(githubIssue));
      else if (pathname === "/user") res.end(JSON.stringify(outputActor));
      else if (pathname === `${issue}/comments` && req.method === "POST") {
        posts++;
        let raw = "";
        for await (const chunk of req) raw += String(chunk);
        postedBody = (JSON.parse(raw) as { body: string }).body;
        if (evidence === "echo") echoed = await receive(githubCommentEvent("20150", postedBody, outputActor));
        res.destroy();
      } else if (pathname === `${issue}/comments`) {
        queries++;
        const comment = githubCommentEvent("20150", postedBody, outputActor).payload.comment;
        res.end(JSON.stringify(evidence === "list" && postedBody ? [comment] : []));
      } else {
        res.writeHead(404).end("{}");
      }
    } catch {
      res.writeHead(500).end("{}");
    }
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { githubClient, huhuClient } = await import(/* @vite-ignore */ new URL("../../../scripts/github-task-connector.mjs", import.meta.url).href);
    const { deliver } = await import(/* @vite-ignore */ new URL("../../../scripts/github-task-delivery.mjs", import.meta.url).href);
    const github = githubClient(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`), "fixture", githubRepository.name);
    const huhu = () => huhuClient(new URL(`http://127.0.0.1:${engine.port}`), connector.token);
    const key = { ...scope, taskId, receiptId: result.receiptId };
    const request = { ...key, repository: githubRepository.name, repositoryId: githubRepository.id, issueNumber: githubIssue.number };
    const delivered = await deliver(github, huhu(), request);
    const expectedState = evidence === "none" ? "unknown" : "accepted";
    expect(delivered).toMatchObject({ state: expectedState, receiptId: result.receiptId });
    expect(posts).toBe(1);
    expect(queries).toBe(evidence === "echo" ? 0 : 1);
    expect(postedBody).toContain(result.payload.message);
    if (evidence === "echo") expect(echoed).toMatchObject({ ok: true, data: { state: "echo", deliveryId: delivered.deliveryId } });
    if (evidence === "list") expect(await receive(githubCommentEvent("20150", postedBody, outputActor))).toMatchObject({ ok: true, data: { state: "echo" } });
    expect(await receive(githubCommentEvent("20151", postedBody, githubAuthor))).toMatchObject({ ok: true, data: { state: "discussion" } });
    if (evidence !== "none") expect(await receive(githubCommentEvent("20152", postedBody, outputActor))).toMatchObject({ ok: true, data: { state: "discussion" } });

    const dispatches = vi.mocked(fake.dispatch).mock.calls.length;
    await stop(engine);
    engine = await start(root);
    expect(await submitReceipt(engine, result)).toMatchObject({ ok: true });
    expect(await deliver(github, huhu(), request)).toMatchObject({ state: expectedState, deliveryId: delivered.deliveryId });
    expect(await call(engine, "tasks.github.deliveries.read", key, connector.token)).toMatchObject({ ok: true, data: { state: expectedState } });
    expect(posts).toBe(1);
    expect(fake.dispatch).toHaveBeenCalledTimes(dispatches);
    const { data: saved } = await call<TaskDto>(engine, "tasks.read", { id: taskId });
    expect(saved.comments.filter(({ event }) => event === "result")).toHaveLength(1);
    expect(saved.comments.filter(({ event }) => event === "github-comment")).toHaveLength(evidence === "none" ? 1 : 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("TW5 邮件结果关联冷恢复沿用 Mail Outbox 原草稿版与回执", async () => {
  const operation = { operationId: "smtp-fixture-operation", messageId: "<smtp-fixture@example.invalid>" };
  const outboxSubmit = vi.fn<NonNullable<typeof mailOutboxFixture>["submit"]>()
    .mockRejectedValueOnce(new Error("提交后响应丢失"))
    .mockResolvedValue(operation);
  mailOutboxFixture = { submit: outboxSubmit };
  const { root, engine, task, execution, fake } = await startBoundRun();
  const receipt = { version: 1, kind: "result", receiptId: "mail-task-result", execution, payload: { message: "需要邮件投递的结果" } } as const satisfies ExecutionReceipt;
  expect(await submitReceipt(engine, receipt)).toMatchObject({ ok: true });
  await expect.poll(() => call(engine, "tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [{ result: { delivery: "delivered" } }] });
  const draft = { draftId: randomUUID(), expectedRevision: randomUUID() };
  const intent = { ...draft, taskId: task.id, receiptId: receipt.receiptId };
  const submit = (running: RunningEngine, input = intent) => call(running, "tasks.mail.deliveries.submit", input);
  expect(await submit(engine)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  await stop(engine);
  const reopened = await start(root);
  expect(await submit(reopened, { ...intent, draftId: randomUUID() })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  const retry = await submit(reopened);
  expect(retry).toMatchObject({ ok: true, data: { ...operation, resultMessageId: expect.stringMatching(/^receipt-/u) } });
  expect(await submit(reopened)).toEqual(retry);
  expect(outboxSubmit.mock.calls.map(([input]) => input)).toEqual([draft, draft]);
  expect(fake.dispatch).toHaveBeenCalledTimes(1);
});
