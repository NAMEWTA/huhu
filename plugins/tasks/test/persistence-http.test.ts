import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isHuhuError, TaskPatchSchema, TaskWritableSchema, toJsonSchema, type TaskDto } from "@huhu/contracts";
import { VaultFiles } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import type { TaskDispatchExecutor } from "../src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord, RuleSource } from "../src/engine/dispatch-store.js";
import type { TaskRuleDispatch } from "../src/engine/index.js";

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
          ...(fixture.executor ? { dispatchExecutor: fixture.executor } : {}),
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
  expect(await call(engine, "tasks.dispatch", input, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
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
  expect(await call(recovered, "tasks.dispatch.read", { taskId: task.id, dispatchId: input.dispatchId })).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL", details: { eventId: accepted.data.eventId } } });
  expect(await call(recovered, "tasks.dispatch", intent(task))).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
  expect(fixture.executor.dispatch).not.toHaveBeenCalled();
});
