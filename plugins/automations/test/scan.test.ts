import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ClaimStore } from "../src/engine/claims.js";
import { classify, processingKeyOf, type Claim, type ScanEnv, type SnapshotTask } from "../src/engine/scan.js";
import { builtinScanRule } from "../src/shared/builtin.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const agent = (id: string, over: Partial<SnapshotTask> = {}): SnapshotTask => ({ id, title: id, completed: false, execution: { kind: "agent", spaceId: "space-1", provider: "codex" }, inputRevision: 1, inputHash: `h-${id}`, ...over });
function env(over: Partial<ScanEnv> = {}, claims: Claim[] = []): ScanEnv {
  return { claims: (k) => claims.find((c) => c.processingKey === k) ?? null, holds: () => false, spaceAccessible: () => "ok", cliAvailable: () => true, ...over };
}

describe("classify（预览与扫描共用）", () => {
  test("ACC-AU-02 2 个未完成 Agent、1 手动、1 已完成 Agent → 候选 2，跳过 2 并带原因", () => {
    const tasks: SnapshotTask[] = [agent("a"), agent("b"), { ...agent("m"), execution: { kind: "manual" } }, agent("d", { completed: true })];
    const r = classify(tasks, env());
    expect(r.candidates.map((c) => c.task.id)).toEqual(["a", "b"]);
    expect(r.skipped.map((s) => [s.task.id, s.reason])).toEqual([
      ["m", "not-agent"],
      ["d", "completed"],
    ]);
  });
  test("同输入已有 claim 跳过（各状态原因不同）；修改正文（hash 变）再次成为候选；只改截止日不变", () => {
    const t = agent("a");
    const mk = (state: Claim["state"]): Claim => ({ processingKey: processingKeyOf(t), taskId: "a", runId: "run-1", state, claimedAt: "" });
    for (const [state, reason] of [
      ["succeeded", "already-processed"],
      ["failed", "already-processed"],
      ["unknown", "already-processed"],
      ["running", "running"],
      ["queued", "running"],
      ["waiting_input", "running"],
    ] as const) {
      expect(classify([t], env({}, [mk(state)])).skipped[0]).toMatchObject({ reason });
    }
    const done = [mk("succeeded")];
    expect(classify([agent("a", { inputHash: "changed" })], env({}, done)).candidates).toHaveLength(1); // ACC-AU-04
    expect(classify([agent("a")], env({}, done)).candidates).toHaveLength(0); // ACC-AU-05：输入未变
    expect(classify([agent("a", { inputRevision: 2 })], env({}, done)).candidates).toHaveLength(1); // 重新打开 inputRevision+1
  });
  test("ACC-AU-12 恢复后暂停；缺 Space / 目录不可访问 / CLI 未安装", () => {
    expect(classify([agent("a")], env({ holds: (id) => id === "a" })).skipped[0]?.reason).toBe("held-after-restore");
    expect(classify([agent("a", { execution: { kind: "agent", spaceId: null, provider: "codex" } })], env()).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "missing" })).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "inaccessible" })).skipped[0]?.reason).toBe("space-inaccessible");
    expect(classify([agent("a")], env({ cliAvailable: () => false })).skipped[0]?.reason).toBe("cli-missing");
  });
});

describe("ClaimStore", () => {
  test("原子创建：重复创建返回 false；更新；列表", () => {
    const d = mkdtempSync(path.join(tmpdir(), "huhu-cl-"));
    dirs.push(d);
    const store = new ClaimStore(path.join(d, "claims"));
    const c: Claim = { processingKey: "task-1:1:abc", taskId: "task-1", runId: "run-1", state: "queued", claimedAt: "t" };
    expect(store.create(c)).toBe(true);
    expect(store.create(c)).toBe(false);
    expect(store.get(c.processingKey)).toEqual(c);
    expect(store.update(c.processingKey, { state: "running" }).state).toBe("running");
    expect(store.list()).toHaveLength(1);
    expect(store.get("nope")).toBeNull();
  });
});

describe("内置规则（ACC-AU-01）", () => {
  test("每 5 分钟、已启用、内置", () => {
    expect(builtinScanRule("Asia/Taipei", "2026-11-10T00:00:00Z")).toMatchObject({ builtin: true, enabled: true, trigger: { cron: "*/5 * * * *", zone: "Asia/Taipei" }, action: { kind: "scan_agent_tasks" } });
  });
});

describe("HoldStore（ACC-AU-12）", () => {
  test("hold 后同输入被跳过；输入变化（hash 不同）自动失效；release 后恢复处理", async () => {
    const { HoldStore } = await import("../src/engine/holds.js");
    const d = mkdtempSync(path.join(tmpdir(), "huhu-hold-"));
    dirs.push(d);
    const h = new HoldStore(path.join(d, "holds.json"));
    h.hold("task-1", "hash-a");
    expect(h.isHeld("task-1", "hash-a")).toBe(true);
    expect(h.isHeld("task-1", "hash-b")).toBe(false);
    expect(classify([agent("task-1", { inputHash: "hash-a" })], env({ holds: (t, x) => h.isHeld(t, x) })).skipped[0]?.reason).toBe("held-after-restore");
    expect(classify([agent("task-1", { inputHash: "hash-b" })], env({ holds: (t, x) => h.isHeld(t, x) })).candidates).toHaveLength(1);
    h.release("task-1");
    expect(h.isHeld("task-1", "hash-a")).toBe(false);
    h.hold("task-2", "x");
    h.prune(() => "changed");
    expect(h.isHeld("task-2", "x")).toBe(false);
  });
});
