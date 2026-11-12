import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, Trash, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { TasksService } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup(nowIso = "2026-11-10T12:00:00Z") {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-t-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const events: [string, unknown][] = [];
  let now = new Date(nowIso);
  const svc = new TasksService({
    repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))),
    trash: new Trash(files),
    publish: (t, p) => events.push([t, p]),
    zone: () => "UTC",
    now: () => now,
  });
  return { svc, root, events, setNow: (iso: string) => (now = new Date(iso)) };
}
const agent = { kind: "agent" as const, spaceId: "space-1", provider: "codex", model: null, effort: null, fast: false };

describe("TasksService", () => {
  test("ACC-TK-01 创建 agent 任务：completed=false，frontmatter 符合模型，不启动任何进程", async () => {
    const { svc, root, events } = setup();
    const t = await svc.create({ title: "整理研究摘要", body: "需求正文", due: "2026-11-11", project: null, execution: agent, resources: [{ kind: "folder", path: "Research", id: null }], reminders: [] });
    expect(t).toMatchObject({ completed: false, inputRevision: 1, due: "2026-11-11" });
    const text = readFileSync(path.join(root, t.path), "utf8");
    expect(text).toContain("kind: task");
    expect(text).toContain("completed: false");
    expect(text).not.toMatch(/priority|status/);
    expect(svc.list({ category: "tomorrow" }).map((x) => x.id)).toEqual([t.id]);
    expect(events).toContainEqual(["entity.changed", { kind: "task", id: t.id, op: "created" }]);
  });

  test("ACC-TK-09 只改 due 不改 inputRevision；改标题/正文才+1 并发布 task.inputChanged", async () => {
    const { svc, events } = setup();
    let t = await svc.create({ title: "A", body: "b", due: null, project: null, execution: agent, resources: [], reminders: [] });
    t = await svc.update(t.id, t.version, { due: "2026-12-01" });
    expect(t.inputRevision).toBe(1);
    expect(events.some(([e]) => e === "task.inputChanged")).toBe(false);
    t = await svc.update(t.id, t.version, { body: "改了" });
    expect(t.inputRevision).toBe(2);
    expect(events.filter(([e]) => e === "task.inputChanged")).toHaveLength(1);
    t = await svc.update(t.id, t.version, { title: "新标题" });
    expect(t.inputRevision).toBe(3);
    expect(t.path).toContain("新标题--");
  });

  test("勾选：写 completedAt；agent 重开 inputRevision+1；manual 重开不变；不碰其他字段", async () => {
    const { svc, events, setNow } = setup();
    const a = await svc.create({ title: "A", body: "", due: "2026-11-12", project: "P", execution: agent, resources: [], reminders: [] });
    setNow("2026-11-10T13:00:00Z");
    const done = await svc.setCompleted(a.id, true, a.version);
    expect(done).toMatchObject({ completed: true, completedAt: "2026-11-10T13:00:00Z", inputRevision: 1, due: "2026-11-12", project: "P" });
    expect(events).toContainEqual(["task.completedChanged", { taskId: a.id, completed: true }]);
    const reopened = await svc.setCompleted(a.id, false, done.version);
    expect(reopened).toMatchObject({ completed: false, completedAt: null, inputRevision: 2 }); // ACC-TK-10
    const m = await svc.create({ title: "M", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    const md = await svc.setCompleted(m.id, true, m.version);
    expect((await svc.setCompleted(m.id, false, md.version)).inputRevision).toBe(1);
  });

  test("ACC-TK-02 勾选正在运行的任务：进入已完成，run 保持 running", async () => {
    const { svc, root } = setup();
    const t = await svc.create({ title: "运行中", body: "", due: null, project: null, execution: agent, resources: [], reminders: [] });
    mkdirSync(path.join(root, "Task Runs"));
    writeFileSync(
      path.join(root, "Task Runs/r--run-bbb222.md"),
      `---\nhuhu: {kind: task-run, id: run-bbb222, schema: 1}\ntaskId: ${t.id}\nruleId: rule-1\nprocessingKey: k\nattempt: 1\nstate: running\nprovider: codex\nspaceId: space-1\ncwd: /x\nmachineId: m\n---\n`,
    );
    const done = await svc.setCompleted(t.id, true, t.version);
    expect(done.completed).toBe(true);
    expect(svc.list({ category: "ended" }).map((x) => x.id)).toContain(t.id);
    expect(svc.runs(t.id)).toMatchObject([{ id: "run-bbb222", state: "running" }]);
  });

  test("ACC-TK-03 run 成功不会自动完成任务：任务仍未完成，run 结果可读", async () => {
    const { svc, root } = setup();
    const t = await svc.create({ title: "已跑完", body: "", due: null, project: null, execution: agent, resources: [], reminders: [] });
    mkdirSync(path.join(root, "Task Runs"));
    writeFileSync(
      path.join(root, "Task Runs/r--run-ccc333.md"),
      `---\nhuhu: {kind: task-run, id: run-ccc333, schema: 1}\ntaskId: ${t.id}\nruleId: rule-1\nprocessingKey: k\nattempt: 1\nstate: succeeded\nprovider: codex\nspaceId: space-1\ncwd: /x\nmachineId: m\n---\n`,
    );
    expect(svc.read(t.id).completed).toBe(false);
    expect(svc.list({ category: "all" }).find((x) => x.id === t.id)?.completed).toBe(false);
    expect(svc.runs(t.id)).toMatchObject([{ state: "succeeded" }]);
  });

  test("版本冲突被拒", async () => {
    const { svc } = setup();
    const t = await svc.create({ title: "A", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    await svc.setCompleted(t.id, true, t.version);
    await expect(svc.setCompleted(t.id, false, t.version)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("ACC-TK-08 外部把 completed 改为 true 后列表反映", async () => {
    const { svc, root } = setup();
    const t = await svc.create({ title: "A", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    const f = path.join(root, t.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("completed: false", "completed: true"));
    expect(svc.list({ completed: true }).map((x) => x.id)).toEqual([t.id]);
    expect(svc.list({ category: "ended" })).toHaveLength(1);
  });

  test("分类与搜索；排序：未完成在前，按截止日", async () => {
    const { svc } = setup();
    const mk = (title: string, due: string | null, project: string | null = null) => svc.create({ title, body: "", due, project, execution: { kind: "manual" }, resources: [], reminders: [] });
    await mk("今天的", "2026-11-10");
    await mk("后天的", "2026-11-12", "HUHU");
    await mk("下月的", "2026-12-20");
    await mk("无期限", null);
    expect(svc.list({ category: "today" }).map((t) => t.title)).toEqual(["今天的"]);
    expect(svc.list({ category: "week" }).map((t) => t.title)).toEqual(["今天的", "后天的"]);
    expect(svc.list({ query: "huhu" }).map((t) => t.title)).toEqual(["后天的"]);
    expect(svc.list().map((t) => t.title)).toEqual(["今天的", "后天的", "下月的", "无期限"]);
  });

  test("复制：新 id、未完成、inputRevision=1、提醒未投递；删除进回收站并保留 task-run", async () => {
    const { svc, root } = setup();
    const t = await svc.create({
      title: "A",
      body: "x",
      due: null,
      project: null,
      execution: agent,
      resources: [],
      reminders: [{ id: "rem-1", channel: "in_app", at: "2026-11-10T09:00:00Z", enabled: true, deliveredAt: "2026-11-10T09:00:05Z" }],
    });
    const done = await svc.setCompleted(t.id, true, t.version);
    const dup = await svc.duplicate(done.id);
    expect(dup).toMatchObject({ completed: false, inputRevision: 1 });
    expect(dup.id).not.toBe(t.id);
    expect(dup.reminders[0]?.deliveredAt).toBeNull();
    mkdirSync(path.join(root, "Task Runs"));
    writeFileSync(
      path.join(root, "Task Runs/r--run-aaa111.md"),
      `---\nhuhu: {kind: task-run, id: run-aaa111, schema: 1}\ntaskId: ${t.id}\nruleId: rule-1\nprocessingKey: k\nattempt: 1\nstate: succeeded\nprovider: codex\nspaceId: space-1\ncwd: /x\nmachineId: m\n---\n`,
    );
    expect(svc.runs(t.id)).toMatchObject([{ id: "run-aaa111", state: "succeeded" }]);
    svc.delete(t.id);
    expect(() => svc.read(t.id)).toThrow();
    expect(readdirSync(path.join(root, "Task Runs"))).toHaveLength(1);
    expect(readdirSync(path.join(root, ".huhu/trash"))).toHaveLength(1);
  });

  test("提醒：到点未投递才返回；投递后写 deliveredAt 且任务仍未完成", async () => {
    const { svc, events, setNow } = setup("2026-11-10T08:00:00Z");
    const t = await svc.create({
      title: "A",
      body: "",
      due: null,
      project: null,
      execution: { kind: "manual" },
      resources: [],
      reminders: [
        { id: "rem-1", channel: "in_app", at: "2026-11-10T09:00:00Z", enabled: true, deliveredAt: null },
        { id: "rem-2", channel: "in_app", at: "2026-11-10T07:00:00Z", enabled: false, deliveredAt: null },
      ],
    });
    expect(svc.dueReminders()).toEqual([]);
    setNow("2026-11-10T09:01:00Z");
    expect(svc.dueReminders().map((r) => r.reminderId)).toEqual(["rem-1"]);
    await svc.markReminderDelivered(t.id, "rem-1");
    expect(svc.dueReminders()).toEqual([]);
    expect(svc.read(t.id)).toMatchObject({ completed: false });
    expect(svc.read(t.id).reminders[0]?.deliveredAt).toBeTruthy();
    expect(events).toContainEqual(["reminder.due", { taskId: t.id, reminderId: "rem-1", title: "A" }]);
  });

  describe("提醒容错", () => {
    test("单个只读任务写不进去时，其余提醒仍投递且不抛未处理异常", async () => {
      const { svc } = setup("2026-11-10T08:00:00Z");
      const a = await svc.create({
        title: "A",
        body: "",
        due: null,
        project: null,
        execution: { kind: "manual" },
        resources: [],
        reminders: [{ id: "rem-1", channel: "in_app", at: "2026-11-10T07:00:00Z", enabled: true, deliveredAt: null }],
      });
      expect(svc.dueReminders()).toHaveLength(1);
      await svc.markReminderDelivered(a.id, "rem-1");
      expect(svc.dueReminders()).toHaveLength(0);
    });
  });
});
