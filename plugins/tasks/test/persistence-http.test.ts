import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isHuhuError, newId, TaskPatchSchema, TaskWritableSchema, toJsonSchema, type ExecutionBinding, type ExecutionReceipt, type TaskDto } from "@huhu/contracts";
import { executionReceiptIdentity } from "@huhu/contracts/execution-receipt/engine";
import { machineId, VaultFiles } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import type { TaskDispatchExecutor } from "../src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord, RuleSource } from "../src/engine/dispatch-store.js";
import type { TaskRuleDispatch } from "../src/engine/index.js";
import { TasksService } from "../src/engine/service.js";

const dirs: string[] = [];
const engines: RunningEngine[] = [];
const fixture: { now?: Date; executor?: TaskDispatchExecutor; rule?: TaskRuleDispatch; errors: unknown[]; checkMs?: number } = { errors: [] };

vi.mock("@huhu/plugin-tasks/engine", async (original) => {
  const tasks = await original<typeof import("../src/engine/index.js")>();
  return {
    ...tasks,
    apply: ((ctx, api, opts) =>
      tasks.apply(
        ctx,
        {
          ...api,
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

vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(() => {
    throw new Error("保存任务不得启动子进程");
  }),
}));

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  delete fixture.now;
  delete fixture.executor;
  delete fixture.rule;
  delete fixture.checkMs;
  fixture.errors.length = 0;
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
    patch: { title: task.title, type: task.type, body: "更新正文", tags: ["已编辑"], due: task.due, project: task.project, execution: task.execution, reminders: task.reminders },
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
  const reminders = [{ id: "fixture-reminder", channel: "in_app", at: "2099-01-01T00:00:00Z", enabled: true, deliveredAt: null }];
  const existing = await call<TaskDto>(engine, "tasks.create", { title: "已有会话", type: "agent", body: "一轮任务", execution: existingConfig, reminders });
  expect(existing).toMatchObject({ ok: true, data: { execution: existingConfig } });
  expect(existing.data.dispatchBlockers).toContain("复用已有会话需要 Agent CLI 支持绑定派遣");
  expect(await call(engine, "tasks.create", { title: "无会话", type: "agent", execution: { target: { mode: "existing" } } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call(engine, "tasks.create", { title: "冲突会话", type: "agent", execution: { target: { mode: "new", sessionId: "fixture-huhu-session" } } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

  const patched = await call<TaskDto>(engine, "tasks.update", { id: existing.data.id, expectedVersion: existing.data.version, patch: { tags: ["合成"] } });
  expect(patched).toMatchObject({ ok: true, data: { execution: existingConfig, reminders, inputRevision: 1, inputHash: existing.data.inputHash } });
  const formConfig = { spaceId, provider: "codex", model: null, effort: null, fast: false };
  const formSaved = await call<TaskDto>(engine, "tasks.update", { id: existing.data.id, expectedVersion: patched.data.version, patch: { execution: formConfig } });
  expect(formSaved).toMatchObject({ ok: true, data: { execution: existingConfig, inputRevision: 1, inputHash: existing.data.inputHash } });
  expect(readFileSync(path.join(root, existing.data.path), "utf8")).toMatch(/target:\n +mode: existing\n +sessionId: fixture-huhu-session/);

  for (const capability of ["tasks.create", "tasks.comments.add"]) {
    expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
  }
  expect(await call(engine, "tasks.create", { title: "外部 Agent", type: "agent", execution: existingConfig }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await call(engine, "tasks.create", { title: "外部代填运行配置", execution: existingConfig }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await call(engine, "tasks.comments.add", { taskId: agent.data.id, body: "外部输入" }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
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
      comments: [],
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

function intent(task: TaskDto, dispatchId = randomUUID()) {
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
  await waitDispatch(engine, early.data, { state: "pending", reason: "waiting_schedule" });
  expect(fake.dispatch).not.toHaveBeenCalled();
  fixture.now = new Date("2026-11-21T10:00:00Z");
  await waitDispatch(engine, early.data, { state: "running", reason: null });
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

test("持久验收原回执后才 ACK，重开补送原评论一次且不重新执行", { timeout: 60_000 }, async () => {
  const { root, fake, engine, task, run, execution } = await startBoundRun();
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
    // The origin can lose the first successful response without losing the committed payload.
    expect(await consume(engine)).toEqual(expected);
    const receiptDir = path.join(engine.vault.stateDir, "tasks", "receipts");
    const [file] = readdirSync(receiptDir);
    expect(file).toBeDefined();
    const deliveryFile = path.join(receiptDir, file!);
    const durable = () => JSON.parse(readFileSync(deliveryFile, "utf8")) as { status: string; receipt: ExecutionReceipt; consumption: { delivery: { messageId: string } } };
    expect(durable()).toMatchObject({ receipt: input, status: "pending" });
    const messageId = durable().consumption.delivery.messageId;
    await vi.waitFor(async () => expect(await resultComments(engine)).toMatchObject([{ id: messageId, run: run.runId, body: input.payload.message }]));
    expect(durable().status).toBe("pending");
    await stop(engine);
    fault = null;
    const reopened = await start(root);
    expect(await consume(reopened)).toEqual(expected);
    expect(await consume(reopened, { ...input, payload: { message: "同 ID 异载荷" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await vi.waitFor(() => expect(durable().status).toBe("delivered"));
    expect(await resultComments(reopened)).toMatchObject([{ id: messageId, run: run.runId, body: input.payload.message }]);
    const afterResult = (await call<TaskDto>(reopened, "tasks.read", { id: task.id })).data;
    expect(afterResult.status).toBe("in_progress");
    expect(await call(reopened, "tasks.runs", { id: task.id })).toMatchObject({
      ok: true,
      data: [{ id: run.runId, state: "succeeded", finishedAt: expect.any(String), questions: 0 }],
    });
    const closed = await call<TaskDto>(reopened, "tasks.setStatus", { id: task.id, expectedVersion: afterResult.version, status: "completed" });
    expect(closed).toMatchObject({ ok: true, data: { status: "completed" } });
    const reopenedTask = await call<TaskDto>(reopened, "tasks.setStatus", { id: task.id, expectedVersion: closed.data.version, status: "not_started" });
    expect(reopenedTask).toMatchObject({ ok: true, data: { status: "not_started", inputRevision: afterResult.inputRevision + 1 } });
    expect(fake.dispatch).toHaveBeenCalledTimes(1);
  } finally {
    injection.mockRestore();
  }
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
  expect(await call(engine, "tasks.reply", choice)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect((await requestStop(engine)).data).toEqual((await readStop(engine)).data);
  expect(interrupt).toHaveBeenCalledExactlyOnceWith({ execution, stopId: input.stopId }, expect.any(AbortSignal));
  await stop(engine);

  inspect.mockClear();
  inspect.mockResolvedValue("stopped");
  const reopened = await start(root);
  await vi.waitFor(async () => expect(await readStop(reopened)).toMatchObject({ ok: true, data: { ...input, status: "stopped" } }));
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
  expect(await call(engine, "gateway.mcp.update", { enabled: true, transport: "http" })).toMatchObject({ ok: true });
  const mcp = async (method: string, params: unknown) => {
    const response = await fetch(`http://127.0.0.1:${engine.port}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${engine.mcpToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
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
  // An unrelated importer preserves the archive's Vault ID. Its copy still has no local dispatch key.
  expect(await call(importer, "vault.importPackage", { zipPath: archive, targetDir: sameIdRoot })).toMatchObject({ ok: true, data: { vaultId: source.vault.id } });
  await stop(importer);

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
