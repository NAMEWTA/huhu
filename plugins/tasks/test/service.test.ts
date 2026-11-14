import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskOrigin, TaskWritable } from "@huhu/contracts";
import { OperationLog, SemanticRepository, Trash, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { TasksService } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup(nowIso = "2026-11-10T12:00:00Z", over: { hasActiveRun?: (id: string) => boolean | undefined } = {}) {
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
    pathKind: (rel) => (rel.includes("..") ? null : existsSync(path.join(root, rel)) ? (rel.endsWith(".md") ? "file" : "folder") : null),
    ...over,
  });
  return { svc, root, events, setNow: (iso: string) => (now = new Date(iso)) };
}
const desktop: TaskOrigin = { kind: "desktop" };
const agentExec = { spaceId: "space-1", provider: "codex", model: null, effort: null, fast: false };
const w = (over: Partial<TaskWritable> = {}): TaskWritable => ({ title: "A", type: "human", body: "", tags: [], due: null, project: null, execution: null, reminders: [], ...over });

describe("TasksService（schema 2）", () => {
  test("A01/ACC-TK-01 创建 agent 任务：status=not_started，frontmatter 与 <task> 区段符合模型，不启动任何进程", async () => {
    const { svc, root, events } = setup();
    const t = await svc.create(w({ title: "整理研究摘要", type: "agent", body: "需求正文，参考 [[Research/]]", due: "2026-11-11", tags: ["#周报", "周报", " 接口 "], execution: agentExec }), desktop);
    expect(t).toMatchObject({ type: "agent", status: "not_started", completedAt: null, inputRevision: 1, due: "2026-11-11", tags: ["周报", "接口"], origin: { kind: "desktop" }, body: "需求正文，参考 [[Research/]]", execution: agentExec });
    const text = readFileSync(path.join(root, t.path), "utf8");
    expect(text).toContain("schema: 2");
    expect(text).toContain("status: not_started");
    expect(text).toContain("type: agent");
    expect(text).toMatch(/<task>\n\n需求正文，参考 \[\[Research\/\]\]\n\n<\/task>/);
    expect(text).not.toContain("completed:");
    expect(readdirSync(path.join(root, "Tasks"))).toHaveLength(1);
    expect(existsSync(path.join(root, "Task Runs"))).toBe(false);
    expect(events).toContainEqual(["entity.changed", { kind: "task", id: t.id, op: "created" }]);
  });

  test("A02/E01 标签规范化与“全部匹配”筛选；外部修改 tags 后正确显示", async () => {
    const { svc, root } = setup();
    const a = await svc.create(w({ title: "a", tags: ["周报", "接口"] }), desktop);
    await svc.create(w({ title: "b", tags: ["周报"] }), desktop);
    await svc.create(w({ title: "c" }), desktop);
    expect(
      svc
        .list({ tags: ["周报"] })
        .map((t) => t.title)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(svc.list({ tags: ["周报", "接口"] }).map((t) => t.title)).toEqual(["a"]);
    expect(svc.list({ tags: [] })).toHaveLength(3);
    expect(svc.list({ tags: ["周"] })).toHaveLength(0); // 逐字相等，不做前缀匹配
    const f = path.join(root, a.path);
    writeFileSync(f, readFileSync(f, "utf8").replace(/tags:[^]*?\n(?=\w)/, "tags: ['#新标签', ' 接口 ', 新标签]\n"));
    expect(svc.read(a.id).tags).toEqual(["新标签", "接口"]);
  });

  test("A05/§4 状态流转：human 开始、关闭、重开；每次追加系统评论；agent 任务不能手动改为进行中", async () => {
    const { svc, events } = setup();
    const h = await svc.create(w({ title: "人工" }), desktop);
    const started = await svc.setStatus(h.id, "in_progress", h.version);
    expect(started.status).toBe("in_progress");
    expect(started.comments.map((c) => [c.source, c.event])).toEqual([["system", "start"]]);
    const done = await svc.setStatus(h.id, "completed", started.version);
    expect(done).toMatchObject({ status: "completed", inputRevision: 1 });
    expect(done.completedAt).toBe("2026-11-10T12:00:00Z");
    const reopened = await svc.setStatus(h.id, "not_started", done.version);
    expect(reopened).toMatchObject({ status: "not_started", completedAt: null, inputRevision: 1 }); // human 重开不需要新的派发意图
    expect(reopened.comments.map((c) => c.event)).toEqual(["start", "close", "reopen"]);
    expect(events).toContainEqual(["task.statusChanged", { taskId: h.id, status: "completed", previous: "in_progress" }]);

    const a = await svc.create(w({ title: "代理", type: "agent", body: "x", execution: agentExec }), desktop);
    await expect(svc.setStatus(a.id, "in_progress", a.version)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const closed = await svc.setStatus(a.id, "completed", a.version); // agent 任务仍可手动关闭
    const reopenedAgent = await svc.setStatus(a.id, "not_started", closed.version);
    expect(reopenedAgent).toMatchObject({ status: "not_started", inputRevision: 2 }); // 无活动运行：新的派发意图
  });

  test("§4.4 重开：有活动运行时回到进行中且 inputRevision 不变；拖回未开始被拒绝", async () => {
    const { svc } = setup("2026-11-10T12:00:00Z", { hasActiveRun: () => true });
    const a = await svc.create(w({ type: "agent", body: "x", execution: agentExec }), desktop);
    const done = await svc.setStatus(a.id, "completed", a.version);
    const re = await svc.setStatus(a.id, "not_started", done.version);
    expect(re).toMatchObject({ status: "in_progress", inputRevision: 1 });
    await expect(svc.setStatus(a.id, "not_started", re.version)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  test("§4.2 markDispatched：条件写（未开始 + processingKey 一致）；同一 runId 幂等；任务已变化时拒绝", async () => {
    const { svc } = setup();
    const a = await svc.create(w({ type: "agent", body: "x", execution: agentExec }), desktop);
    await expect(svc.markDispatched(a.id, { inputRevision: 1, inputHash: "stale" }, "run-1")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const d = await svc.markDispatched(a.id, { inputRevision: a.inputRevision, inputHash: a.inputHash }, "run-1");
    expect(d.status).toBe("in_progress");
    expect(d.comments.map((c) => c.id)).toEqual(["sys-run-1-dispatched"]);
    expect((await svc.markDispatched(a.id, { inputRevision: a.inputRevision, inputHash: a.inputHash }, "run-1")).comments).toHaveLength(1); // 重复调用
    await expect(svc.markDispatched(a.id, { inputRevision: a.inputRevision, inputHash: a.inputHash }, "run-2")).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 已不是未开始
  });

  test("A06/B09 只替换 <task> 区段：评论与区段外内容保持；编辑时评论到达，保存不丢评论", async () => {
    const { svc, root } = setup();
    const t = await svc.create(w({ title: "A", body: "旧要求" }), desktop);
    const withComment = (await svc.addComment(t.id, { id: "c1", at: "2026-11-10T12:01:00Z", source: "human", author: "我", body: "一条评论" })).comment;
    expect(withComment.id).toBe("c1");
    // 用户在表单里基于旧快照编辑（t.version 已过期），但 <task> 与 execution 没有被别人改过 → 补丁照常生效
    const saved = await svc.update(t.id, t.version, { body: "新要求 [[设计/接口.md]]" }, t.inputHash);
    expect(saved.body).toBe("新要求 [[设计/接口.md]]");
    expect(saved.comments.map((c) => c.id)).toEqual(["c1"]);
    expect(saved.inputRevision).toBe(2);
    // 没有 baseInputHash 时仍按版本冲突处理
    const t2 = await svc.create(w({ title: "B" }), desktop);
    await svc.addComment(t2.id, { id: "c1", at: "2026-11-10T12:01:00Z", source: "human", body: "x" });
    await expect(svc.update(t2.id, t2.version, { title: "B2" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    // 区段外与未知键逐字节保持
    const f = path.join(root, saved.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("\n<task>", "\n区段外的话\n\n<task>").replace("title:", "customKey: 保留我\ntitle:"));
    const after = svc.read(saved.id);
    const changed = await svc.update(after.id, after.version, { body: "再改一次" });
    const text = readFileSync(path.join(root, changed.path), "utf8");
    expect(text).toContain("区段外的话");
    expect(text).toContain("customKey: 保留我");
    expect(text).toContain("一条评论");
  });

  test("A07 结构问题：缺失 <task> 的文件报文件级问题，不可派发，但仍可查看和关闭", async () => {
    const { svc, root } = setup();
    const t = await svc.create(w({ type: "agent", body: "x", execution: agentExec }), desktop);
    const f = path.join(root, t.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("<task>", "<tsk>"));
    const bad = svc.read(t.id);
    expect(bad.problems.length).toBeGreaterThan(0);
    expect(bad.dispatchBlockers.join()).toContain("结构");
    const closed = await svc.setStatus(t.id, "completed", bad.version);
    expect(closed.status).toBe("completed");
  });

  test("§3.4 引用：解析 <task> 与评论中的 [[路径]]，标注是否存在；文件夹以 / 结尾；越界引用阻止派发", async () => {
    const { svc, root } = setup();
    mkdirSync(path.join(root, "设计"), { recursive: true });
    writeFileSync(path.join(root, "设计/接口.md"), "x");
    const t = await svc.create(w({ type: "agent", body: "参考 [[设计/接口.md]]、[[设计/]]、[[缺失.md]]，代码里的 `[[忽略.md]]`", execution: agentExec }), desktop);
    expect(t.references.map((r) => [r.path, r.kind, r.exists])).toEqual([
      ["设计/接口.md", "file", true],
      ["设计/", "folder", true],
      ["缺失.md", "file", false],
    ]);
    const c = await svc.addComment(t.id, { id: "c1", at: "2026-11-10T12:00:00Z", source: "human", body: "还有 [[../越界.md]]" });
    expect(c.added).toBe(true);
    const after = svc.read(t.id);
    expect(after.dispatchBlockers.some((b) => b.includes("引用越界"))).toBe(true);
  });

  test("A03 agent 任务缺少执行配置或内容时给出不可派发原因", async () => {
    const { svc } = setup();
    const noExec = await svc.create(w({ type: "agent", body: "x" }), desktop);
    expect(noExec.dispatchBlockers).toContain("缺少执行配置");
    const empty = await svc.create(w({ type: "agent", execution: agentExec }), desktop);
    expect(empty.dispatchBlockers).toContain("任务内容为空");
    const ok = await svc.create(w({ type: "agent", body: "x", execution: agentExec }), desktop);
    expect(ok.dispatchBlockers).toEqual([]);
  });

  test("评论：按 id 去重；评论与标签不改变 inputRevision / inputHash", async () => {
    const { svc } = setup();
    const t = await svc.create(w({ type: "agent", body: "x", execution: agentExec }), desktop);
    const r1 = await svc.addComment(t.id, { id: "run-1-q-q1", at: "2026-11-10T12:00:00Z", source: "agent", run: "run-1", ask: "q1", body: "以哪套为准？" });
    const r2 = await svc.addComment(t.id, { id: "run-1-q-q1", at: "2026-11-10T12:00:05Z", source: "agent", body: "重复写入" });
    expect([r1.added, r2.added]).toEqual([true, false]);
    const tagged = await svc.update(t.id, svc.read(t.id).version, { tags: ["新"] });
    expect(tagged.inputRevision).toBe(1);
    expect(tagged.inputHash).toBe(t.inputHash);
    expect(tagged.comments).toHaveLength(1);
    expect(tagged.comments[0]).toMatchObject({ source: "agent", run: "run-1", ask: "q1" });
  });

  test("分类与搜索；排序：进行中、未开始、已完成，再按截止日", async () => {
    const { svc } = setup();
    const mk = (title: string, due: string | null, project: string | null = null) => svc.create(w({ title, due, project }), desktop);
    await mk("今天的", "2026-11-10");
    await mk("后天的", "2026-11-12", "HUHU");
    await mk("下月的", "2026-12-20");
    await mk("无期限", null);
    expect(svc.list({ category: "today" }).map((t) => t.title)).toEqual(["今天的"]);
    expect(svc.list({ category: "week" }).map((t) => t.title)).toEqual(["今天的", "后天的"]);
    expect(svc.list({ query: "huhu" }).map((t) => t.title)).toEqual(["后天的"]);
    expect(svc.list().map((t) => t.title)).toEqual(["今天的", "后天的", "下月的", "无期限"]);
    const t = svc.list({ query: "无期限" })[0]!;
    await svc.setStatus(t.id, "completed", t.version);
    expect(svc.list({ category: "ended" })).toHaveLength(1);
    expect(svc.list({ status: ["not_started", "in_progress"] })).toHaveLength(3);
  });

  test("ACC-TK-08 外部把 status 改为 completed 后列表反映", async () => {
    const { svc, root } = setup();
    const t = await svc.create(w(), desktop);
    const f = path.join(root, t.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("status: not_started", "status: completed"));
    expect(svc.list({ status: ["completed"] }).map((x) => x.id)).toEqual([t.id]);
  });

  test("A09 schema 1 的旧任务文件：报错且不出现在列表，文件字节不变", async () => {
    const { svc, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    const v1 = "---\nhuhu: {kind: task, id: task-old001, schema: 1}\ntitle: 旧\ncompleted: false\nexecution: {kind: manual}\ncreatedAt: 2026-11-10T07:15:31Z\nupdatedAt: 2026-11-10T07:15:31Z\n---\n旧正文\n";
    writeFileSync(path.join(root, "Tasks/旧--task-old001.md"), v1);
    expect(svc.list()).toEqual([]);
    expect(readFileSync(path.join(root, "Tasks/旧--task-old001.md"), "utf8")).toBe(v1);
  });

  test("复制：新 id、未开始、inputRevision=1、提醒未投递；删除进回收站并保留 task-run", async () => {
    const { svc, root } = setup();
    const t = await svc.create(w({ type: "agent", body: "x", execution: agentExec, reminders: [{ id: "rem-1", channel: "in_app", at: "2026-11-10T09:00:00Z", enabled: true, deliveredAt: "2026-11-10T09:00:05Z" }] }), desktop);
    const done = await svc.setStatus(t.id, "completed", t.version);
    const dup = await svc.duplicate(done.id, desktop);
    expect(dup).toMatchObject({ status: "not_started", inputRevision: 1, comments: [] });
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

  test("提醒：到点未投递才返回；投递后写 deliveredAt 且任务状态不变", async () => {
    const { svc, events, setNow } = setup("2026-11-10T08:00:00Z");
    const t = await svc.create(
      w({
        reminders: [
          { id: "rem-1", channel: "in_app", at: "2026-11-10T09:00:00Z", enabled: true, deliveredAt: null },
          { id: "rem-2", channel: "in_app", at: "2026-11-10T07:00:00Z", enabled: false, deliveredAt: null },
        ],
      }),
      desktop,
    );
    expect(svc.dueReminders()).toEqual([]);
    setNow("2026-11-10T09:01:00Z");
    expect(svc.dueReminders().map((r) => r.reminderId)).toEqual(["rem-1"]);
    await svc.markReminderDelivered(t.id, "rem-1");
    expect(svc.dueReminders()).toEqual([]);
    expect(svc.read(t.id)).toMatchObject({ status: "not_started" });
    expect(svc.read(t.id).reminders[0]?.deliveredAt).toBeTruthy();
    expect(events).toContainEqual(["reminder.due", { taskId: t.id, reminderId: "rem-1", title: "A" }]);
  });
});
