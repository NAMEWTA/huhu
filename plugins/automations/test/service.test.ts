import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { OperationLog, SemanticRepository, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { ClaimStore } from "../src/engine/claims.js";
import { AutomationsService, type RunOutcome, type WorkerInput } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function task(id: string, over: Partial<TaskDto> = {}): TaskDto {
  return { id, path: `Tasks/${id}.md`, version: "v", title: id, body: "", completed: false, completedAt: null, due: null, project: null, execution: { kind: "agent", spaceId: "space-1", provider: "codex", model: null, effort: null, fast: false }, resources: [], reminders: [], inputRevision: 1, inputHash: `h-${id}`, createdAt: "", updatedAt: "", readOnly: false, ...over };
}

function setup(opts: { tasks?: TaskDto[]; tasksEnabled?: boolean; outcome?: (i: WorkerInput) => RunOutcome; spaceState?: "ok" | "missing" } = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-au-")); dirs.push(d);
  const root = path.join(d, "v"); mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const tasks = opts.tasks ?? [];
  const workerCalls: WorkerInput[] = [];
  const notes: string[] = [];
  const events: string[] = [];
  const svc = new AutomationsService({
    repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))),
    claims: new ClaimStore(path.join(d, "claims")), activationsDir: path.join(d, "act"),
    taskQuery: () => (opts.tasksEnabled === false ? undefined : { listAll: () => tasks, listOpenAgentTasks: () => tasks.filter((t) => !t.completed && t.execution.kind === "agent"), snapshot: (id) => tasks.find((t) => t.id === id) as TaskDto }),
    worker: async (i) => { workerCalls.push(i); return opts.outcome?.(i) ?? { state: "succeeded", message: `完成 ${i.task.title}`, exitCode: 0, nativeSessionId: "sess-1", questions: [] }; },
    spaceState: () => ({ state: opts.spaceState ?? "ok", root: "/work" }), cliAvailable: () => true, holds: () => false,
    notify: (n) => notes.push(n.title), publish: (t) => events.push(t), now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC", machineId: "m1",
  });
  return { svc, root, tasks, workerCalls, notes, events, d };
}

describe("规则", () => {
  test("ACC-AU-01 新 Vault 有内置规则（每 5 分钟、启用）；不能删除；可暂停", async () => {
    const { svc } = setup();
    await svc.ensureBuiltin(); await svc.ensureBuiltin();
    const rules = svc.rules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.data).toMatchObject({ builtin: true, enabled: true, trigger: { cron: "*/5 * * * *" } });
    await expect(svc.delete(rules[0]!.id)).rejects.toThrowError(/内置规则/);
    expect((await svc.setEnabled(rules[0]!.id, false)).data.enabled).toBe(false);
  });
  test("新建规则默认暂停；非法 cron / 时区被拒绝", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "每天提醒", trigger: { preset: "daily9", cron: "0 9 * * *", zone: "UTC" }, action: { kind: "notify", channel: "in_app", text: "喝水" } });
    expect(r.data.enabled).toBe(false);
    await expect(svc.create({ title: "x", trigger: { preset: "custom", cron: "bad", zone: "UTC" }, action: { kind: "notify", channel: "in_app", text: "x" } })).rejects.toThrow(/定时设置无效/);
    await expect(svc.update(r.id, r.version, { trigger: { preset: "custom", cron: "0 9 * * *", zone: "Mars/Base" } })).rejects.toThrow();
  });
});

describe("扫描", () => {
  const four = [task("a"), task("b"), task("m", { execution: { kind: "manual" } }), task("d", { completed: true })];

  test("ACC-AU-02 预览：候选 2、跳过 2 并带原因，且不产生任何文件", async () => {
    const { svc, d } = setup({ tasks: four });
    await svc.ensureBuiltin();
    const before = readdirSync(d).sort();
    const p = svc.preview(svc.rules()[0]!.id);
    expect(p.candidates.map((c) => c.taskId)).toEqual(["a", "b"]);
    expect(p.skipped.map((s) => [s.taskId, s.reason])).toEqual([["m", "not-agent"], ["d", "completed"]]);
    expect(p.next).toHaveLength(3);
    expect(readdirSync(d).sort()).toEqual(before);
    expect(() => readdirSync(path.join(d, "claims"))).toThrow();
  });

  test("ACC-AU-03/04/05 立即运行：每个候选一个 task-run=succeeded；再次运行不重复；改正文才再处理；只改截止日不处理", async () => {
    const { svc, tasks, workerCalls, root } = setup({ tasks: four });
    await svc.ensureBuiltin();
    const id = svc.rules()[0]!.id;
    const a1 = await svc.activate(id, "manual");
    expect(a1.summary).toEqual({ processed: 2, skipped: 2 });
    const runs = readdirSync(path.join(root, "Task Runs"));
    expect(runs).toHaveLength(2);
    expect(workerCalls.map((w) => w.task.id).sort()).toEqual(["a", "b"]);
    expect(workerCalls[0]?.cwd).toBe("/work");
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 4 }); // 再次运行不产生新 task-run
    expect(readdirSync(path.join(root, "Task Runs"))).toHaveLength(2);
    // 编辑 a 的正文（inputHash 变化）
    tasks[0] = { ...tasks[0]!, inputHash: "h-a-edited" };
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 3 });
    expect(readdirSync(path.join(root, "Task Runs"))).toHaveLength(3);
    // 只改截止日：输入未变
    tasks[1] = { ...tasks[1]!, due: "2026-12-01" };
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 4 });
    expect(tasks.every((t) => t.id !== "a" || !t.completed)).toBe(true); // Task 仍未完成
  });

  test("worker 失败 → failed，不自动重试；ask 回执 → waiting_input 带问题", async () => {
    const { svc, root } = setup({ tasks: [task("a"), task("b")], outcome: (i) => i.task.id === "a" ? { state: "failed", message: "boom", exitCode: 1, nativeSessionId: null, questions: [] } : { state: "waiting_input", message: "要覆盖吗", exitCode: 0, nativeSessionId: "s9", questions: [{ id: "q-1", text: "是否覆盖？", options: ["覆盖", "另存"] }] } });
    await svc.ensureBuiltin();
    const id = svc.rules()[0]!.id;
    await svc.activate(id, "manual");
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 2 });
    const texts = readdirSync(path.join(root, "Task Runs")).map((f) => readFileSync(path.join(root, "Task Runs", f), "utf8"));
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => /state: failed/.test(t) && t.includes("boom"))).toBe(true);
    expect(texts.some((t) => /state: waiting_input/.test(t) && t.includes("是否覆盖？") && t.includes("sessionid-check") === false)).toBe(true);
  });

  test("ACC-AU-10 tasks 插件停用：scan 跳过；notify 规则正常发送通知", async () => {
    const { svc, notes } = setup({ tasksEnabled: false });
    await svc.ensureBuiltin();
    const scanId = svc.rules()[0]!.id;
    expect((await svc.activate(scanId, "manual")).summary).toEqual({ state: "tasks-disabled" });
    expect(svc.preview(scanId).tasksDisabled).toBe(true);
    const n = await svc.create({ title: "提醒", trigger: { preset: "every5", cron: "*/5 * * * *", zone: "UTC" }, action: { kind: "notify", channel: "in_app", text: "该休息了" } });
    await svc.setEnabled(n.id, true);
    expect((await svc.activate(n.id, "schedule", new Date("2026-11-10T11:55:00Z"))).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["该休息了"]);
  });

  test("Space 缺失的候选被跳过；同一规则不能并发激活", async () => {
    const { svc } = setup({ tasks: [task("a")], spaceState: "missing" });
    await svc.ensureBuiltin();
    const id = svc.rules()[0]!.id;
    expect(svc.preview(id).skipped[0]?.reason).toBe("missing-space");
    let release!: () => void;
    const s2 = setup({ tasks: [task("a")] });
    await s2.svc.ensureBuiltin();
    (s2.svc as unknown as { d: { worker: unknown } }).d.worker = () => new Promise((r) => { release = () => r({ state: "succeeded", message: "ok", exitCode: 0, nativeSessionId: null, questions: [] }); });
    const first = s2.svc.activate(s2.svc.rules()[0]!.id, "manual");
    await new Promise((r) => setTimeout(r, 50));
    await expect(s2.svc.activate(s2.svc.rules()[0]!.id, "manual")).rejects.toThrow(/正在执行/);
    release();
    await first;
  });

  test("激活记录：start+finish 合并为一条，lastActivatedFor 取最近计划时间", async () => {
    const { svc } = setup();
    await svc.ensureBuiltin();
    const id = svc.rules()[0]!.id;
    await svc.activate(id, "schedule", new Date("2026-11-10T11:55:00Z"));
    await svc.activate(id, "manual");
    const acts = svc.activations();
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.finishedAt)).toBe(true);
    expect(svc.lastActivatedFor(id)?.toISOString()).toBe("2026-11-10T11:55:00.000Z");
  });
});

describe("审计回归", () => {
  test("定时触发不执行已暂停的规则；手动仍可运行", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a")] });
    await svc.ensureBuiltin();
    const id = svc.rules()[0]!.id;
    await svc.setEnabled(id, false);
    expect((await svc.activate(id, "schedule", new Date())).summary).toEqual({ state: "paused" });
    expect(workerCalls).toHaveLength(0);
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 0 });
  });
  test("ACC-AU-07：启动对账把 queued/running 的 claim 置 unknown，之后扫描不再处理该输入", async () => {
    const t = task("a");
    const { svc, workerCalls, d } = setup({ tasks: [t] });
    await svc.ensureBuiltin();
    const claims = (svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null } } }).d.claims;
    claims.create({ processingKey: "a:1:h-a", taskId: "a", runId: "run-gone", state: "running", claimedAt: "t" });
    expect(await svc.reconcile()).toBe(1);
    expect(claims.get("a:1:h-a")?.state).toBe("unknown");
    expect((await svc.activate(svc.rules()[0]!.id, "manual")).summary).toEqual({ processed: 0, skipped: 1 });
    expect(workerCalls).toHaveLength(0);
    void d;
  });
});
