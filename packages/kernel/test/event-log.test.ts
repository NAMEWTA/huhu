import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { describeEvent, EventLog } from "../src/event-log.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-evlog-"));
  dirs.push(d);
  return path.join(d, "diagnostics", "events.ndjson");
};

describe("事件日志", () => {
  test("追加写入、新的在前、按模块 / 关键字过滤；重启后仍在；半行被跳过", () => {
    const f = tmp();
    const log = new EventLog(f, () => new Date("2026-11-11T08:00:00Z"));
    log.append({ module: "任务", message: "任务「写周报」已完成", tone: "success" });
    log.append({ module: "同步", message: "出现冲突，需要处理", tone: "error" });
    expect(log.list().map((e) => e.module)).toEqual(["同步", "任务"]);
    expect(log.list({ module: "任务" })).toHaveLength(1);
    expect(log.list({ query: "冲突" })[0]?.tone).toBe("error");
    expect(log.modules()).toEqual(["任务", "同步"]);
    writeFileSync(f, readFileSync(f, "utf8") + '{"id":"ev-x","tim'); // 崩溃留下的半行
    const again = new EventLog(f);
    expect(again.list()).toHaveLength(2);
    again.append({ module: "任务", message: "崩溃后的第一条", tone: "neutral" });
    expect(new EventLog(f).list().map((e) => e.message)[0]).toBe("崩溃后的第一条"); // 没有被半行吞掉
    expect(again.list({ limit: 1 })).toHaveLength(1);
  });
  test("翻译引擎事件：只有面向用户的事件会被记录，带上标题", () => {
    const title = (k: string, id: string) => (k === "task" && id === "t1" ? "写周报" : null);
    expect(describeEvent({ type: "task.completedChanged", payload: { taskId: "t1", completed: true } }, title)).toEqual({ module: "任务", message: "任务「写周报」已完成", tone: "success" });
    expect(describeEvent({ type: "entity.changed", payload: { kind: "task", id: "t1", op: "created" } }, title)?.message).toBe("任务「写周报」已创建");
    expect(describeEvent({ type: "run.stateChanged", payload: { runId: "r", kind: "task-run", state: "failed" } })).toMatchObject({ module: "自动化", tone: "error" });
    expect(describeEvent({ type: "run.stateChanged", payload: { runId: "r", kind: "task-run", state: "running" } })).toBeNull();
    expect(describeEvent({ type: "vault.fileChanged", payload: { path: "a.md", change: "modified" } })).toBeNull();
    expect(describeEvent({ type: "entity.changed", payload: { kind: "task-run", id: "x", op: "created" } })).toBeNull();
    expect(describeEvent({ type: "entity.changed", payload: { kind: "task", id: "t1", op: "updated" } }, title)).toBeNull(); // 更新太频繁：不记录
    expect(describeEvent({ type: "plugin.stateChanged", payload: { id: "ssh", state: "active" } })?.message).toBe("插件 ssh 已启用");
  });
});
