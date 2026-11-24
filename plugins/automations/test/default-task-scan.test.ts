import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AutomationRuleFrontmatter } from "@huhu/contracts";
import { VaultFiles } from "@huhu/vault";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import { DEFAULT_TASK_SCAN_RULE_ID as ruleId, DEFAULT_TASK_SCAN_SERVICE, type DefaultTaskScanService } from "../src/engine/default-task-scan.js";
import { Scheduler } from "../src/engine/scheduler.js";
import { AutomationsService } from "../src/engine/service.js";

const markerPath = "automations/default-task-scan.json";
const at = (clock: string) => new Date(`2030-02-02T${clock}Z`);
const fixture = { now: at("01:00:00"), defaults: undefined as DefaultTaskScanService | undefined, schedule: false };
const engines: RunningEngine[] = [];
const dirs: string[] = [];

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
            if (name === DEFAULT_TASK_SCAN_SERVICE) fixture.defaults = service as DefaultTaskScanService;
          },
        },
        { ...opts, now: () => fixture.now, schedule: fixture.schedule },
      )) satisfies typeof automations.apply,
  };
});

beforeEach(() => {
  fixture.now = at("01:00:00");
  fixture.schedule = false;
  vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
});

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fixture.defaults = undefined;
  vi.restoreAllMocks();
});

async function open(vaultPath?: string) {
  const create = vaultPath === undefined;
  if (!vaultPath) {
    vaultPath = mkdtempSync(path.join(tmpdir(), "huhu-default-task-scan-"));
    dirs.push(vaultPath);
  }
  fixture.defaults = undefined;
  const engine = await boot({ vaultPath, create });
  engines.push(engine);
  expect(fixture.defaults).toBeDefined();
  return { engine, defaults: fixture.defaults!, root: vaultPath, marker: path.join(engine.vault.stateDir, markerPath) };
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
}

async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  const result = (await response.json()) as { ok: boolean; data: T };
  expect(result).toMatchObject({ ok: true });
  return result.data;
}

type Rule = { id: string; path: string; version: string; body: string; data: AutomationRuleFrontmatter };
const list = (engine: RunningEngine) => call<Rule[]>(engine, "automations.list", {});
const read = (engine: RunningEngine) => call<Rule>(engine, "automations.read", { id: ruleId });
const zone = (engine: RunningEngine, value: string) => call(engine, "settings.update", { patch: { dateTime: { zone: value } } });
const marker = (file: string) => readFileSync(file, "utf8");

test("停用插件后，迟到的启动对账不会重新安装 Cron", async () => {
  fixture.schedule = true;
  let resolveReconcile!: () => void;
  const reconcile = { promise: new Promise<void>((resolve) => (resolveReconcile = resolve)), resolve: () => resolveReconcile() };
  vi.spyOn(AutomationsService.prototype, "reconcileTerminals").mockReturnValue(reconcile.promise);
  const sync = vi.spyOn(Scheduler.prototype, "sync");
  const { engine } = await open();
  try {
    await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
  } finally {
    reconcile.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(sync).not.toHaveBeenCalled();
});

test("首次显式启用只创建一条默认规则，重开尊重设置、编辑、停用和删除，显式恢复使用同一 ID", async () => {
  const first = await open();
  expect(await list(first.engine)).toEqual([]);
  expect(existsSync(first.marker)).toBe(false);
  await call(first.engine, "plugins.setEnabled", { id: "automations", enabled: false });
  await expect(first.defaults.initializeAfterEnable()).rejects.toMatchObject({ code: "PLUGIN_DISABLED" });
  await call(first.engine, "plugins.setEnabled", { id: "automations", enabled: true });
  expect(await list(first.engine)).toEqual([]);
  await zone(first.engine, "Asia/Taipei");
  const defaults = fixture.defaults!;
  expect(await Promise.all([defaults.initializeAfterEnable(), defaults.initializeAfterEnable(), defaults.initializeAfterEnable()])).toEqual([
    { ruleId, state: "created" },
    { ruleId, state: "existing" },
    { ruleId, state: "existing" },
  ]);
  const [rule] = await list(first.engine);
  expect(rule).toMatchObject({
    id: ruleId,
    body: "",
    data: {
      title: "处理可执行的 Agent 任务",
      enabled: true,
      trigger: { preset: "every15", cron: "*/15 * * * *", zone: "Asia/Taipei" },
      action: { kind: "agent", input: { source: "tasks", tags: [], includeOverdue: true, includeUnscheduled: true, maxConcurrent: 1 } },
      createdAt: fixture.now.toISOString(),
      updatedAt: fixture.now.toISOString(),
    },
  });
  expect(JSON.parse(marker(first.marker))).toMatchObject({ ruleId, state: "initialized" });
  await stop(first.engine);

  const second = await open(first.root);
  expect(await second.defaults.initializeAfterEnable()).toEqual({ ruleId, state: "existing" });
  expect(await list(second.engine)).toEqual([rule]);
  await zone(second.engine, "Europe/Paris");
  fixture.now = at("01:17:00");
  const edited = await call<Rule>(second.engine, "automations.update", {
    id: ruleId,
    expectedVersion: rule!.version,
    patch: { title: "我的任务扫描", trigger: { preset: "custom", cron: "*/10 * * * *", zone: "Asia/Taipei" } },
    body: "保留我的补充指令",
  });
  expect(edited.path).not.toBe(rule!.path);
  fixture.now = at("01:20:01");
  const paused = await call<Rule>(second.engine, "automations.setEnabled", { id: ruleId, enabled: false });
  const pausedBytes = readFileSync(path.join(second.root, paused.path));
  await stop(second.engine);

  const third = await open(first.root);
  expect(await third.defaults.initializeAfterEnable()).toEqual({ ruleId, state: "existing" });
  expect(await third.defaults.restore()).toEqual({ ruleId, state: "existing" });
  expect(await read(third.engine)).toEqual(paused);
  expect(readFileSync(path.join(third.root, paused.path))).toEqual(pausedBytes);
  expect(paused).toMatchObject({ body: "保留我的补充指令", data: { enabled: false, trigger: { cron: "*/10 * * * *", zone: "Asia/Taipei" } } });
  const activate = vi.fn();
  fixture.now = at("02:04:00");
  const scheduler = new Scheduler({ activate, lastActivatedFor: () => at("01:10:00"), now: () => fixture.now });
  const scheduleRule = (row: Rule) => ({ id: row.id, ...row.data.trigger, enabled: row.data.enabled, updatedAt: row.data.updatedAt, missedRunGraceMinutes: row.data.missedRunGraceMinutes });
  try {
    scheduler.sync([scheduleRule(paused)]);
    expect(scheduler.active()).toEqual([]);
    const resumed = await call<Rule>(third.engine, "automations.setEnabled", { id: ruleId, enabled: true });
    scheduler.sync([scheduleRule(resumed)]);
    expect(scheduler.active()).toEqual([ruleId]);
    expect(activate).not.toHaveBeenCalled();
  } finally {
    scheduler.stop();
  }
  await call(third.engine, "automations.delete", { id: ruleId });
  expect(await list(third.engine)).toEqual([]);
  await stop(third.engine);

  const fourth = await open(first.root);
  expect(await fourth.defaults.initializeAfterEnable()).toEqual({ ruleId, state: "deleted" });
  expect(await list(fourth.engine)).toEqual([]);
  fixture.now = at("02:09:00");
  expect(await Promise.all([fourth.defaults.restore(), fourth.defaults.restore()])).toEqual([
    { ruleId, state: "created" },
    { ruleId, state: "existing" },
  ]);
  expect(await list(fourth.engine)).toMatchObject([{ id: ruleId, body: "", data: { enabled: true, trigger: { cron: "*/15 * * * *", zone: "Europe/Paris" }, updatedAt: fixture.now.toISOString() } }]);
}, 30_000);

test.each(["marker-only", "rule-written", "delete-before-finalization"] as const)(
  "%s 中断后重开，按持久标记收敛",
  async (stage) => {
    const first = await open();
    await zone(first.engine, "Pacific/Kiritimati");
    const write = VaultFiles.prototype.write;
    const failure = new Error(`injected ${stage}`);
    const spy = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(function (this: VaultFiles, rel, bytes, options) {
      if (stage === "marker-only" && rel.startsWith("Automations/") && rel.endsWith(`--${ruleId}.md`)) throw failure;
      if (stage !== "marker-only" && rel === markerPath && Buffer.from(bytes).toString("utf8").includes('"initialized"')) throw failure;
      return write.call(this, rel, bytes, options);
    });
    try {
      await expect(first.defaults.initializeAfterEnable()).rejects.toBe(failure);
    } finally {
      spy.mockRestore();
    }
    expect(JSON.parse(marker(first.marker))).toMatchObject({ ruleId, state: "pending" });
    const listBefore = await list(first.engine);
    expect(listBefore).toHaveLength(stage === "marker-only" ? 0 : 1);
    if (stage === "delete-before-finalization") await call(first.engine, "automations.delete", { id: ruleId });
    await stop(first.engine);

    const reopened = await open(first.root);
    if (stage === "delete-before-finalization") {
      expect(await reopened.defaults.initializeAfterEnable()).toEqual({ ruleId, state: "deleted" });
      expect(await list(reopened.engine)).toEqual([]);
    } else {
      const result = { ruleId, state: stage === "marker-only" ? "created" : "existing" };
      expect(await reopened.defaults.initializeAfterEnable()).toEqual(result);
      const rows = await list(reopened.engine);
      expect(rows).toMatchObject([{ id: ruleId, data: { trigger: { zone: "Pacific/Kiritimati" } } }]);
      if (stage === "rule-written") expect(rows).toEqual(listBefore);
    }
    expect(JSON.parse(marker(reopened.marker))).toMatchObject({ ruleId, state: "initialized" });
  },
  30_000,
);

test("仅规则在盘上时补标记并保留重命名后的版本，损坏的保留规则文件不会被重建", async () => {
  const first = await open();
  await first.defaults.initializeAfterEnable();
  const seeded = await read(first.engine);
  const edited = await call<Rule>(first.engine, "automations.update", { id: ruleId, expectedVersion: seeded.version, patch: { title: "保留仅存在的规则" }, body: "用户正文" });
  await stop(first.engine);
  unlinkSync(first.marker);

  const second = await open(first.root);
  expect(await second.defaults.initializeAfterEnable()).toEqual({ ruleId, state: "existing" });
  expect(await list(second.engine)).toEqual([edited]);
  expect(JSON.parse(marker(second.marker))).toMatchObject({ ruleId, state: "initialized" });
  await stop(second.engine);

  const file = path.join(first.root, edited.path);
  const corrupt = "---\nhuhu: [\n---\n";
  writeFileSync(file, corrupt);
  const reopened = await open(first.root);
  await expect(reopened.defaults.restore()).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { path: edited.path } });
  expect(readFileSync(file, "utf8")).toBe(corrupt);
  expect(await list(reopened.engine)).toEqual([]);
}, 30_000);
