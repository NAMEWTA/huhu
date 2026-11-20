import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { VaultFiles } from "@huhu/vault";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import type { TaskDispatchExecutor } from "../../tasks/src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord } from "../../tasks/src/engine/dispatch-store.js";
import type { TaskRuleDispatch } from "../../tasks/src/engine/index.js";
import { Scheduler } from "../src/engine/scheduler.js";
import type { TaskScanOccurrences } from "../src/engine/task-scan-occurrences.js";

const fixture = {
  now: new Date(),
  scans: undefined as TaskScanOccurrences | undefined,
  ready: vi.fn<TaskDispatchExecutor["ready"]>(),
  dispatch: vi.fn<TaskDispatchExecutor["dispatch"]>(),
  accept: vi.fn<TaskRuleDispatch["acceptRule"]>(),
  legacyWorker: vi.fn(),
};

vi.mock("@huhu/plugin-automations/engine", async (original) => {
  const automations = await original<typeof import("../src/engine/index.js")>();
  return {
    ...automations,
    apply: ((ctx, api, opts) =>
      automations.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === "taskScanOccurrences") fixture.scans = service as TaskScanOccurrences;
          },
        },
        { ...opts, schedule: false, now: () => fixture.now, refreshClis: async () => {}, cliAvailable: () => true, worker: fixture.legacyWorker },
      )) satisfies typeof automations.apply,
  };
});

vi.mock("../../tasks/src/engine/index.js", async (original) => {
  const tasks = await original<typeof import("../../tasks/src/engine/index.js")>();
  return {
    ...tasks,
    apply: ((ctx, api, opts) =>
      tasks.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            if (name !== "taskDispatch") return api.provide(name, service);
            fixture.accept.mockImplementation((service as TaskRuleDispatch).acceptRule);
            api.provide(name, { acceptRule: fixture.accept } satisfies TaskRuleDispatch);
          },
        },
        {
          ...opts,
          now: () => fixture.now,
          dispatchCheckMs: 50,
          dispatchExecutor: { ready: fixture.ready, dispatch: fixture.dispatch, inspect: async () => "unknown" },
        },
      )) satisfies typeof tasks.apply,
  };
});

const engines: RunningEngine[] = [];
const dirs: string[] = [];
const at = (value: string) => new Date(`2030-02-01T${value}Z`);
const trigger = { preset: "every15", cron: "*/15 * * * *", zone: "Asia/Taipei" };
const scanDir = "automations/task-scan-occurrences/";

beforeEach(() => {
  fixture.now = at("01:00:00");
  fixture.ready.mockReset().mockResolvedValue("busy");
  fixture.dispatch.mockReset().mockResolvedValue("accepted");
  fixture.accept.mockReset();
  fixture.legacyWorker.mockReset().mockRejectedValue(new Error("旧 worker 不应参加任务扫描"));
  vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
});

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fixture.scans = undefined;
  vi.restoreAllMocks();
});

async function start(vaultPath?: string) {
  const create = vaultPath === undefined;
  if (!vaultPath) {
    vaultPath = mkdtempSync(path.join(tmpdir(), "huhu-task-occurrences-"));
    dirs.push(vaultPath);
  }
  fixture.scans = undefined;
  const engine = await boot({ vaultPath, create });
  engines.push(engine);
  expect(fixture.scans).toBeDefined();
  return { engine, scans: fixture.scans! };
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
}

async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  return (await response.json()) as { ok: boolean; data: T; error?: { code: string; details?: Record<string, unknown> } };
}

async function invoke<T = unknown>(engine: RunningEngine, capability: string, input: unknown) {
  const result = await call<T>(engine, capability, input);
  expect(result).toMatchObject({ ok: true });
  return result.data;
}

async function createTask(engine: RunningEngine, title: string, tags = ["match"], availableAt?: string) {
  const [space] = await invoke<{ id: string }[]>(engine, "agent.spaces.list", {});
  return invoke<TaskDto>(engine, "tasks.create", { title, body: `${title}的原正文`, type: "agent", tags, availableAt, execution: { spaceId: space!.id, provider: "codex" } });
}

type Rule = { id: string; version: string; body: string; data: { updatedAt: string; enabled: boolean; missedRunGraceMinutes: number } };

async function createRule(engine: RunningEngine, title: string) {
  const rule = await invoke<Rule>(engine, "automations.create", {
    title,
    body: "第一版补充指令",
    trigger,
    action: { kind: "agent", input: { source: "tasks", tags: ["match"], maxConcurrent: 1, window: { kind: "today" }, includeUnscheduled: true } },
  });
  return invoke<Rule>(engine, "automations.setEnabled", { id: rule.id, enabled: true });
}

function dispatchRecords(engine: RunningEngine): DispatchRecord[] {
  const dir = path.join(engine.vault.stateDir, "tasks", "dispatches");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as DispatchRecord);
}

test("真实两规则和工作台争同一任务，重交沿用原版本，运行长任务期间可读发生", async () => {
  const { engine, scans } = await start();
  const a = await createRule(engine, "扫描甲");
  const b = await createRule(engine, "扫描乙");
  const task = await createTask(engine, "同一个任务");
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const input = { taskId: task.id, dispatchId: randomUUID(), expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash };

  const [first, duplicate, second, desktop] = await Promise.all([
    scans.scheduled(a.id, slot),
    scans.scheduled(a.id, new Date("2030-02-01T09:15:00+08:00")),
    scans.scheduled(b.id, slot),
    call<DispatchReceipt>(engine, "tasks.dispatch", input),
  ]);
  expect(first).toEqual(duplicate);
  expect([first?.items[0], second?.items[0]].filter((row) => row?.state === "accepted").length + Number(desktop.ok)).toBe(1);
  expect(fixture.accept).toHaveBeenCalledTimes(2);
  const [winner] = dispatchRecords(engine);
  expect(dispatchRecords(engine)).toHaveLength(1);
  for (const row of [first!, second!]) {
    expect(row.finishedAt).toEqual(expect.any(String));
    const result = row.items[0]!;
    if (result.state === "accepted") expect(result).toMatchObject({ eventId: winner!.receipt.eventId, runId: winner!.receipt.runId });
    else expect(result).toMatchObject({ state: "skipped", reason: "task_occupied", blockingRunId: winner!.receipt.runId });
  }
  if (!desktop.ok) expect(desktop.error).toMatchObject({ details: { reason: "task_occupied", runId: winner!.receipt.runId } });
  await vi.waitFor(() => expect(dispatchRecords(engine)[0]?.receipt).toMatchObject({ state: "pending", reason: "waiting_resource" }));
  expect(fixture.dispatch).not.toHaveBeenCalled();

  fixture.now = at("01:16:00");
  const edited = await invoke<Rule>(engine, "automations.update", { id: a.id, expectedVersion: a.version, patch: {}, body: "第二版补充指令" });
  expect(edited.body).toBe("第二版补充指令");
  const added = await createTask(engine, "下一次才入选");
  expect(await scans.scheduled(a.id, slot)).toEqual(first);
  expect(first).toMatchObject({ ruleVersion: a.version, rule: { instructions: "第一版补充指令" } });
  expect(first?.items.map((item) => item.taskId)).toEqual([task.id]);

  // Dispatch acceptance completes independently of the eventual task execution.
  fixture.dispatch.mockImplementation(
    async () =>
      new Promise((resolve) => {
        releaseDispatch = () => resolve("accepted");
      }),
  );
  let releaseDispatch: (() => void) | undefined;
  fixture.ready.mockResolvedValue("ready");
  try {
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledTimes(1));
    expect(scans.read(first!.id)).toEqual(first);
    expect(scans.read(first!.id)?.items.some((item) => item.taskId === added.id)).toBe(false);
  } finally {
    releaseDispatch?.();
  }
  expect(fixture.legacyWorker).not.toHaveBeenCalled();
});

test.each(["occurrence", "acceptance", "finish"] as const)("%s 写入边界中断后重开，从原名单收尾", async (stage) => {
  const first = await start();
  const rule = await createRule(first.engine, "带恢复的扫描");
  const a = await createTask(first.engine, "候选甲");
  const b = await createTask(first.engine, "候选乙");
  const future = await createTask(first.engine, "未到时间", undefined, at("03:00:00").toISOString());
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const write = VaultFiles.prototype.write;
  const error = new Error(`injected ${stage} interruption`);
  const boundary = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, rel, bytes, options) {
    if (rel.startsWith(scanDir)) {
      const row = JSON.parse(Buffer.from(bytes).toString("utf8")) as NonNullable<ReturnType<TaskScanOccurrences["read"]>>;
      if (stage === "occurrence" && options?.expectedVersion === null) {
        await write.call(this, rel, bytes, options);
        throw error;
      }
      if (stage === "acceptance" && row.items.some((item) => item.state === "accepted")) throw error;
      if (stage === "finish" && row.finishedAt) throw error;
    }
    return write.call(this, rel, bytes, options);
  });
  try {
    await expect(first.scans.scheduled(rule.id, slot)).rejects.toBe(error);
  } finally {
    boundary.mockRestore();
  }

  const [frozen] = first.scans.list();
  expect(frozen).toMatchObject({ finishedAt: null, ruleVersion: rule.version, rule: { instructions: "第一版补充指令" } });
  expect(frozen!.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ taskId: a.id, inputHash: a.inputHash, expectedVersion: a.version, dispatchId: expect.any(String) }),
      expect.objectContaining({ taskId: b.id, inputHash: b.inputHash, expectedVersion: b.version, dispatchId: expect.any(String) }),
      expect.objectContaining({ taskId: future.id, state: "skipped", reason: "not-due" }),
    ]),
  );
  expect(first.scans.lastScheduledFor(rule.id)).toEqual(slot);
  const before = dispatchRecords(first.engine);
  expect(before).toHaveLength({ occurrence: 0, acceptance: 1, finish: 2 }[stage]);
  expect(frozen!.items.filter((item) => item.state === "accepted")).toHaveLength(stage === "finish" ? 2 : 0);
  fixture.now = at("01:16:00");
  await invoke(first.engine, "automations.update", { id: rule.id, expectedVersion: rule.version, patch: {}, body: "更新后的指令" });
  const added = await createTask(first.engine, "中断后新增");
  if (stage === "occurrence") {
    await invoke(first.engine, "tasks.update", { id: a.id, expectedVersion: a.version, patch: { body: "中断后修改任务输入" } });
  }
  await invoke(first.engine, "automations.setEnabled", { id: rule.id, enabled: false });
  await stop(first.engine);

  const reopened = await start(first.engine.vault.root);
  fixture.accept.mockClear();
  await reopened.scans.recover();
  const completed = reopened.scans.read(frozen!.id)!;
  expect(completed).toMatchObject({ ruleVersion: rule.version, rule: frozen!.rule, scheduledForUTC: slot.toISOString(), finishedAt: expect.any(String) });
  expect(completed.items.map(({ taskId, dispatchId }) => ({ taskId, dispatchId }))).toEqual(frozen!.items.map(({ taskId, dispatchId }) => ({ taskId, dispatchId })));
  expect(completed.items.some((item) => item.taskId === added.id)).toBe(false);
  expect(fixture.accept).toHaveBeenCalledTimes(stage === "finish" ? 0 : 2);
  const after = dispatchRecords(reopened.engine);
  expect(after).toHaveLength(stage === "occurrence" ? 1 : 2);
  if (stage === "occurrence") expect(completed.items.find((item) => item.taskId === a.id)).toMatchObject({ state: "skipped", reason: "stale_input" });
  for (const record of after) {
    const { receipt, snapshot } = record;
    expect(snapshot.source).toMatchObject({ ruleId: rule.id, ruleVersion: rule.version, instructions: "第一版补充指令", occurrenceId: completed.id });
    expect(completed.items.find((item) => item.taskId === receipt.taskId)).toMatchObject({ state: "accepted", dispatchId: receipt.dispatchId, eventId: receipt.eventId, runId: receipt.runId });
  }
  for (const record of before) expect(after).toEqual(expect.arrayContaining([expect.objectContaining({ receipt: expect.objectContaining({ eventId: record.receipt.eventId, runId: record.receipt.runId }) })]));
  expect(await reopened.scans.scheduled(rule.id, slot)).toEqual(completed);
  expect(fixture.legacyWorker).not.toHaveBeenCalled();
});

test("停用期间不补扫，既受理任务可单独取消，启用后只补最近一轮且手动有独立身份", async () => {
  const { engine, scans } = await start();
  const rule = await createRule(engine, "可启停的扫描");
  const first = await createTask(engine, "首轮任务");
  fixture.now = at("01:15:00");
  const initial = await scans.scheduled(rule.id, fixture.now);
  const accepted = initial!.items.find((item) => item.taskId === first.id);
  expect(accepted?.state).toBe("accepted");
  fixture.now = at("01:20:00");
  await invoke(engine, "automations.setEnabled", { id: rule.id, enabled: false });
  fixture.now = at("02:00:00");
  expect(await scans.scheduled(rule.id, at("01:30:00"))).toBeNull();
  expect(scans.lastScheduledFor(rule.id)).toEqual(at("01:15:00"));
  expect(await invoke<DispatchReceipt>(engine, "tasks.dispatch.read", { taskId: first.id, dispatchId: accepted?.dispatchId })).toMatchObject({ state: "pending" });
  expect(await invoke<DispatchReceipt>(engine, "tasks.dispatch.cancel", { taskId: first.id, dispatchId: accepted?.dispatchId })).toMatchObject({ state: "cancelled" });

  fixture.now = at("02:01:00");
  await invoke(engine, "automations.setEnabled", { id: rule.id, enabled: true });
  expect(await scans.scheduled(rule.id, at("02:00:00"))).toBeNull();
  const task = await createTask(engine, "离线才可运行", undefined, at("03:03:00").toISOString());
  fixture.now = at("03:05:00");
  const current = await invoke<Rule>(engine, "automations.read", { id: rule.id });
  const callback = vi.fn(async (ruleId: string, scheduledFor: Date) => {
    await scans.scheduled(ruleId, scheduledFor);
  });
  const scheduler = new Scheduler({ activate: callback, lastActivatedFor: (id) => scans.lastScheduledFor(id), now: () => fixture.now });
  scheduler.sync([{ id: rule.id, ...trigger, ...current.data }]);
  scheduler.stop();
  await Promise.all(callback.mock.results.map((result) => result.value as Promise<void>));
  expect(callback).toHaveBeenCalledExactlyOnceWith(rule.id, at("03:00:00"), "schedule");
  expect(scans.list().find((row) => row.scheduledForUTC === at("03:00:00").toISOString())).toMatchObject({
    ruleVersion: current.version,
    items: expect.arrayContaining([expect.objectContaining({ taskId: task.id, state: "accepted" })]),
  });
  const [manual1, manual2] = await Promise.all([scans.invoke(rule.id), scans.invoke(rule.id)]);
  expect(manual1.id).not.toBe(manual2.id);
  expect([manual1.scheduledForUTC, manual2.scheduledForUTC]).toEqual([null, null]);
  expect(scans.lastScheduledFor(rule.id)).toEqual(at("03:00:00"));
  await invoke(engine, "automations.delete", { id: rule.id });
  expect(await scans.scheduled(rule.id, at("01:15:00"))).toEqual(initial);
});
