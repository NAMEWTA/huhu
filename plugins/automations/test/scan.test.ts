import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ClaimStore } from "../src/engine/claims.js";
import { classify, processingKeyOf, type Claim, type ScanEnv, type SnapshotTask } from "../src/engine/scan.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const agent = (id: string, over: Partial<SnapshotTask> = {}): SnapshotTask => ({
  id,
  title: id,
  type: "agent",
  status: "not_started",
  tags: [],
  execution: { spaceId: "space-1", provider: "codex" },
  inputRevision: 1,
  inputHash: `h-${id}`,
  dispatchBlockers: [],
  ...over,
});
function env(over: Partial<ScanEnv> = {}, claims: Claim[] = []): ScanEnv {
  return { claims: (k) => claims.find((c) => c.processingKey === k) ?? null, holds: () => false, spaceAccessible: () => "ok", spaceBusy: () => false, cliAvailable: () => true, ...over };
}

describe("classify（预览与扫描共用）", () => {
  test("只有 type=agent 且 status=not_started 的任务才是候选；跳过项带原因", () => {
    const tasks: SnapshotTask[] = [
      agent("a"),
      agent("b", { execution: { spaceId: "space-2", provider: "codex" } }),
      agent("h", { type: "human", execution: null }),
      agent("d", { status: "completed" }),
      agent("p", { status: "in_progress" }),
    ];
    const r = classify(tasks, env());
    expect(r.candidates.map((c) => c.task.id)).toEqual(["a", "b"]);
    expect(r.skipped.map((s) => [s.task.id, s.reason])).toEqual([
      ["h", "not-agent"],
      ["d", "not-open"],
      ["p", "not-open"],
    ]);
  });
  test("标签筛选：全部匹配才通过；规则无标签 = 不筛选", () => {
    const tasks = [agent("a", { tags: ["周报", "接口"] }), agent("b", { tags: ["周报"] }), agent("c")];
    expect(classify(tasks, env(), { tags: ["周报"] }).candidates.map((c) => c.task.id)).toEqual(["a"]); // a、b 同在 space-1：一次只选一个
    expect(classify(tasks, env(), { tags: ["周报", "接口"] }).candidates.map((c) => c.task.id)).toEqual(["a"]);
    expect(classify(tasks, env(), { tags: ["周报", "接口"] }).skipped.map((s) => [s.task.id, s.reason])).toEqual([
      ["b", "tag-mismatch"],
      ["c", "tag-mismatch"],
    ]);
    expect(classify(tasks, env(), {}).candidates).toHaveLength(1); // 同一 Space 一次只选一个
  });
  test("任务自身原因（引用越界、结构错误等）→ task-blocked，并带详情", () => {
    const r = classify([agent("a", { dispatchBlockers: ["引用越界：../x.md", "任务内容为空"] })], env());
    expect(r.skipped[0]).toMatchObject({ reason: "task-blocked", detail: "引用越界：../x.md；任务内容为空" });
  });
  test("同输入已有 claim 跳过（各状态原因不同）；输入变化或重开（inputRevision+1）后再次成为候选", () => {
    const t = agent("a");
    const mk = (state: Claim["state"]): Claim => ({ processingKey: processingKeyOf(t), taskId: "a", runId: "run-1", state, claimedAt: "" });
    for (const [state, reason] of [
      ["succeeded", "succeeded"],
      ["failed", "retryable"],
      ["cancelled", "retryable"],
      ["unknown", "running"],
      ["running", "running"],
      ["queued", "running"],
      ["waiting_input", "running"],
    ] as const) {
      expect(classify([t], env({}, [mk(state)])).skipped[0]).toMatchObject({ reason });
    }
    const done = [mk("succeeded")];
    expect(classify([agent("a", { inputHash: "changed" })], env({}, done)).candidates).toHaveLength(1);
    expect(classify([agent("a")], env({}, done)).candidates).toHaveLength(0);
    expect(classify([agent("a", { inputRevision: 2 })], env({}, done)).candidates).toHaveLength(1);
  });
  test("恢复后暂停；缺 Space / 目录不可访问 / CLI 未安装", () => {
    expect(classify([agent("a")], env({ holds: (id) => id === "a" })).skipped[0]?.reason).toBe("held-after-restore");
    expect(classify([agent("a", { execution: { spaceId: null, provider: "codex" } })], env()).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a", { execution: null })], env()).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "missing" })).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "inaccessible" })).skipped[0]?.reason).toBe("space-inaccessible");
    expect(classify([agent("a")], env({ cliAvailable: () => false })).skipped[0]?.reason).toBe("cli-missing");
  });
  test("同一 Space 同一时间只跑一个：已有活动运行或本次已选其他候选 → space-busy", () => {
    expect(classify([agent("a")], env({ spaceBusy: () => true })).skipped[0]?.reason).toBe("space-busy");
    const r = classify([agent("a"), agent("b"), agent("c", { execution: { spaceId: "space-2", provider: "codex" } })], env());
    expect(r.candidates.map((c) => c.task.id)).toEqual(["a", "c"]);
    expect(r.skipped.map((s) => [s.task.id, s.reason])).toEqual([["b", "space-busy"]]);
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
