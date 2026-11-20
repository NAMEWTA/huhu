import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { dispatchWindow } from "../src/engine/dispatch-window.js";
import { classify, type ScanEnv, type SnapshotTask } from "../src/engine/scan.js";

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
function env(over: Partial<ScanEnv> = {}): ScanEnv {
  return { holds: () => false, spaceAccessible: () => "ok", cliAvailable: () => true, ...over };
}

test("窗口使用规则当地日历的半开边界，含周一、跨月和 DST", () => {
  const bounds = (...args: Parameters<typeof dispatchWindow>) => {
    const { start, end } = dispatchWindow(...args);
    return [new Date(start).toISOString(), new Date(end).toISOString()];
  };
  const monday = new Date("2026-11-16T02:00:00Z");
  expect(bounds({ kind: "today" }, "Asia/Taipei", monday)).toEqual(["2026-11-15T16:00:00.000Z", "2026-11-16T16:00:00.000Z"]);
  expect(bounds({ kind: "week" }, "Asia/Taipei", monday)).toEqual(["2026-11-15T16:00:00.000Z", "2026-11-22T16:00:00.000Z"]);
  expect(bounds({ kind: "month" }, "Asia/Taipei", monday)).toEqual(["2026-10-31T16:00:00.000Z", "2026-11-30T16:00:00.000Z"]);
  expect(bounds({ kind: "next-seven-days" }, "Asia/Taipei", monday)).toEqual(["2026-11-15T16:00:00.000Z", "2026-11-22T16:00:00.000Z"]);
  expect(bounds({ kind: "next-seven-days" }, "Asia/Taipei", new Date("2026-11-30T02:00:00Z"))).toEqual(["2026-11-29T16:00:00.000Z", "2026-12-06T16:00:00.000Z"]);
  expect(bounds({ kind: "today" }, "America/New_York", new Date("2026-03-08T16:00:00Z"))).toEqual(["2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"]);
  expect(bounds({ kind: "today" }, "America/New_York", new Date("2026-11-01T16:00:00Z"))).toEqual(["2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"]);
  expect(bounds({ kind: "custom", start: "2026-11-20T09:00:00+08:00", end: "2026-11-20T10:00:00+08:00" }, "Asia/Taipei", monday)).toEqual(["2026-11-20T01:00:00.000Z", "2026-11-20T02:00:00.000Z"]);
  const window = dispatchWindow({ kind: "today" }, "Asia/Taipei", monday);
  const setup = (now: Date) => classify([agent("开始", { availableAt: new Date(window.start).toISOString() }), agent("终点", { availableAt: new Date(window.end).toISOString() })], env(), { window, now });
  expect(setup(new Date(window.start)).candidates.map(({ task }) => task.id)).toEqual(["开始"]);
  expect(setup(new Date(window.end)).skipped.map(({ task, reason }) => [task.id, reason])).toEqual([["终点", "outside-window"]]);
});

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
    expect(classify(tasks, env(), { tags: ["周报"] }).candidates.map((c) => c.task.id)).toEqual(["a", "b"]);
    expect(classify(tasks, env(), { tags: ["周报", "接口"] }).candidates.map((c) => c.task.id)).toEqual(["a"]);
    expect(classify(tasks, env(), { tags: ["周报", "接口"] }).skipped.map((s) => [s.task.id, s.reason])).toEqual([
      ["b", "tag-mismatch"],
      ["c", "tag-mismatch"],
    ]);
    expect(classify(tasks, env(), {}).candidates).toHaveLength(3);
  });
  test("任务自身原因（引用越界、结构错误等）→ task-blocked，并带详情", () => {
    const r = classify([agent("a", { dispatchBlockers: ["引用越界：../x.md", "任务内容为空"] })], env());
    expect(r.skipped[0]).toMatchObject({ reason: "task-blocked", detail: "引用越界：../x.md；任务内容为空" });
  });
  test("台北明早的任务在最早时刻前不被扫描领取", () => {
    const availableAt = "2026-11-21T09:00:00+08:00";
    const task = agent("明早", { availableAt });
    const result = classify([task], env(), { now: new Date("2026-11-21T00:59:59.999Z") });
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toEqual([{ task, reason: "not-due", detail: availableAt }]);
    expect(classify([task], env(), { now: new Date("2026-11-21T01:00:00Z") }).candidates[0]?.task.id).toBe(task.id);
  });
  test("恢复后暂停；缺 Space / 目录不可访问 / CLI 未安装", () => {
    expect(classify([agent("a")], env({ holds: (id) => id === "a" })).skipped[0]?.reason).toBe("held-after-restore");
    expect(classify([agent("a", { execution: { spaceId: null, provider: "codex" } })], env()).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a", { execution: null })], env()).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "missing" })).skipped[0]?.reason).toBe("missing-space");
    expect(classify([agent("a")], env({ spaceAccessible: () => "inaccessible" })).skipped[0]?.reason).toBe("space-inaccessible");
    expect(classify([agent("a")], env({ cliAvailable: () => false })).skipped[0]?.reason).toBe("cli-missing");
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
