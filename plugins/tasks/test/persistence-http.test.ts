import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";

const dirs: string[] = [];
const engines: RunningEngine[] = [];

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
});

async function start(vaultPath: string, create = false) {
  const engine = await boot({ vaultPath, create });
  engines.push(engine);
  return engine;
}

function tempVault() {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-tasks-http-"));
  dirs.push(dir);
  return dir;
}

async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown, token = engine.rendererToken) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  return (await response.json()) as { ok: boolean; data: T; error?: { code: string } };
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
