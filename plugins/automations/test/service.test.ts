import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { OperationLog, SemanticRepository, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { ClaimStore } from "../src/engine/claims.js";
import { AutomationsService, type AutomationsDeps, type RunOutcome, type WorkerInput } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function task(id: string, over: Partial<TaskDto> = {}): TaskDto {
  return { id, path: `Tasks/${id}.md`, version: "v", title: id, body: "", completed: false, completedAt: null, due: null, project: null, execution: { kind: "agent", spaceId: "space-1", provider: "codex", model: null, effort: null, fast: false }, resources: [], reminders: [], inputRevision: 1, inputHash: `h-${id}`, createdAt: "", updatedAt: "", readOnly: false, ...over };
}

function setup(opts: { tasks?: TaskDto[]; tasksEnabled?: boolean; outcome?: (i: WorkerInput) => RunOutcome; adopt?: AutomationsDeps["adopt"]; hasRound?: AutomationsDeps["hasRound"]; runAlive?: AutomationsDeps["runAlive"]; killRound?: AutomationsDeps["killRound"]; spaceState?: "ok" | "missing" } = {}) {
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
    ...(opts.adopt ? { adopt: opts.adopt } : {}), ...(opts.hasRound ? { hasRound: opts.hasRound } : {}), ...(opts.runAlive ? { runAlive: opts.runAlive } : {}), ...(opts.killRound ? { killRound: opts.killRound } : {}),
    spaceState: () => ({ state: opts.spaceState ?? "ok", root: "/work" }), cliAvailable: () => true, holds: () => false,
    notify: (n) => notes.push(n.title), publish: (t) => events.push(t), now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC", machineId: "m1",
  });
  return { svc, root, tasks, workerCalls, notes, events, d };
}

describe("规则正文（agent_prompt 的提示词）", () => {
  test("update 可以改正文；非 Agent 动作不接受非空正文；从 Agent 改成别的动作会清空旧提示词；省略 body 保留原文", async () => {
    const { svc } = setup();
    const trig = { preset: "daily", cron: "30 9 * * *", zone: "UTC" };
    const r = await svc.create({ title: "整理", trigger: trig, action: { kind: "agent_prompt", spaceId: "s", provider: "claude", model: null, effort: null, fast: false }, body: "第一版" });
    expect(r.body).toBe("第一版");
    const r2 = await svc.update(r.id, r.version, { title: "整理2" });
    expect(r2.body).toBe("第一版"); // 省略 body：保留
    const r3 = await svc.update(r.id, r2.version, {}, "第二版");
    expect(r3.body).toBe("第二版");
    await expect(svc.update(r.id, r3.version, { action: { kind: "notify", channel: "in_app", text: "x" } }, "还想留着提示词")).rejects.toThrow(/提示词/);
    const r4 = await svc.update(r.id, r3.version, { action: { kind: "notify", channel: "in_app", text: "x" } });
    expect(r4.body).toBe(""); // 改成通知：旧提示词被清空
    await expect(svc.update(r.id, r4.version, {}, "通知规则不该有正文")).rejects.toThrow(/提示词/);
  });
});

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
    for (let i = 0; i < 200 && !release; i++) await new Promise((r) => setTimeout(r, 10)); // 轮询等待 worker 被调用，而不是固定 sleep
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

describe("问答续跑、取消与重试（ACC-AU-08）", () => {
  const ask = (n: string): RunOutcome => ({ state: "waiting_input", message: `第 ${n} 次提问`, exitCode: 0, nativeSessionId: "sess-9", questions: [{ id: "q-1", text: "是否覆盖？", options: ["覆盖", "另存"] }, { id: "q-2", text: "文件名？", options: [] }] });
  const done: RunOutcome = { state: "succeeded", message: "续跑完成", exitCode: 0, nativeSessionId: "sess-9", questions: [] };

  async function waiting() {
    let n = 0;
    const ctx = setup({ tasks: [task("a")], outcome: (i) => (i.resume ? done : ask(String(++n))) });
    await ctx.svc.ensureBuiltin();
    await ctx.svc.activate(ctx.svc.rules()[0]!.id, "manual");
    const run = ctx.svc.runs().find((r) => r.kind === "task-run")!;
    return { ...ctx, runId: run.id };
  }

  test("回答全部问题后以原生会话 id 续跑，同一个 task-run 追加第 2 轮结果，attempt 不变", async () => {
    const { svc, runId, workerCalls, notes } = await waiting();
    expect(svc.runDetail(runId).data["state"]).toBe("waiting_input");
    expect(await svc.answerRun(runId, [{ id: "q-1", answer: "覆盖" }, { id: "q-2", answer: "out.md" }])).toEqual({ resumed: true });
    await svc.idle();
    const call = workerCalls.at(-1)!;
    expect(call.resume?.nativeSessionId).toBe("sess-9");
    expect(call.round).toBe(2);
    expect(call.resume?.prompt).toContain("覆盖");
    expect(call.resume?.prompt).toContain("out.md");
    const d = svc.runDetail(runId);
    expect(d.data).toMatchObject({ state: "succeeded", attempt: 1, round: 2 });
    expect(d.body).toContain("第 1 轮结果");
    expect(d.body).toContain("第 2 轮结果");
    expect((d.data["questions"] as { answer: string }[]).map((q) => q.answer)).toEqual(["覆盖", "out.md"]);
    expect(notes.some((t) => t.includes("已完成"))).toBe(true);
  });

  test("只答一部分仍保持等待；同一问题不能答两次；不在等待的运行不能回答；同时两次回答只有一次生效", async () => {
    const { svc, runId, workerCalls } = await waiting();
    expect(await svc.answerRun(runId, [{ id: "q-1", answer: "覆盖" }])).toEqual({ resumed: false });
    expect(svc.runDetail(runId).data["state"]).toBe("waiting_input");
    await expect(svc.answerRun(runId, [{ id: "q-1", answer: "另存" }])).rejects.toThrow(/已经回答/);
    await expect(svc.answerRun(runId, [{ id: "nope", answer: "x" }])).rejects.toThrow(/没有这个问题/);
    const before = workerCalls.length;
    const r = await Promise.allSettled([svc.answerRun(runId, [{ id: "q-2", answer: "a.md" }]), svc.answerRun(runId, [{ id: "q-2", answer: "b.md" }])]);
    await svc.idle();
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(workerCalls.length).toBe(before + 1);
    await expect(svc.answerRun(runId, [{ id: "q-2", answer: "c" }])).rejects.toThrow(/不在等待/);
    await expect(svc.answerRun("../x", [{ id: "q-1", answer: "x" }])).rejects.toThrow(/非法/);
  });

  test("等待回答时取消 → cancelled；失败的运行可以重试（attempt+1，同一 processingKey，claim 指向新运行），超过 10 次拒绝", async () => {
    const { svc, runId } = await waiting();
    expect(await svc.cancelRunById(runId)).toEqual({ cancelled: true });
    expect(svc.runDetail(runId).data["state"]).toBe("cancelled");
    expect(svc.runDetail(runId).canRetry).toBe(true);
    const { runId: next } = await svc.retryRun(runId);
    await svc.idle();
    expect(svc.runDetail(next).data).toMatchObject({ attempt: 2, round: 1 });
    await expect(svc.retryRun(runId)).rejects.toThrow(/取代/); // 旧运行已被新尝试取代
    await expect(svc.retryRun(next)).rejects.toThrow(/只有失败/); // 新运行正在等待回答
  });

  test("ACC-AU-06/07：重启对账——结果已落盘的运行完成（不再启动 worker），无法确认的置 unknown，别的机器的 claim 不动", async () => {
    const t1 = task("a"); const t2 = task("b");
    const adopt: AutomationsDeps["adopt"] = async (i) => (i.runId === "run-ok" ? { ...done, message: "后台跑完了" } : { state: "unknown", message: "监督进程已不存在，结果无法确认", exitCode: null, nativeSessionId: null, questions: [] });
    const { svc, workerCalls, d } = setup({ tasks: [t1, t2], adopt });
    await svc.ensureBuiltin();
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const mk = async (task: TaskDto) => (await dd.d.repo.create("task-run", { taskId: task.id, ruleId: "r", processingKey: `${task.id}:1:h-${task.id}`, attempt: 1, round: 1, state: "running", provider: "claude", model: null, spaceId: "space-1", cwd: "/work", machineId: "m1", questions: [] }, "")).id;
    const okId = await mk(t1);
    expect(okId).toBeTruthy();
    // adopt 按 runId 区分：把 id 对上
    (svc as unknown as { d: { adopt: unknown } }).d.adopt = async (i: { runId: string }) => (i.runId === okId ? { ...done, message: "后台跑完了" } : { state: "unknown", message: "无法确认", exitCode: null, nativeSessionId: null, questions: [] });
    const badId = await mk(t2);
    dd.d.claims.create({ processingKey: "a:1:h-a", taskId: "a", runId: okId, state: "running", claimedAt: "t", machineId: "m1" });
    dd.d.claims.create({ processingKey: "b:1:h-b", taskId: "b", runId: badId, state: "running", claimedAt: "t", machineId: "m1" });
    dd.d.claims.create({ processingKey: "z:1:h-z", taskId: "z", runId: "elsewhere", state: "running", claimedAt: "t", machineId: "other-machine" });
    expect(await svc.reconcile()).toBe(2);
    await svc.idle();
    expect(svc.runDetail(okId).data["state"]).toBe("succeeded");
    expect(svc.runDetail(okId).body).toContain("后台跑完了");
    expect(svc.runDetail(badId).data["state"]).toBe("unknown");
    expect(dd.d.claims.get("b:1:h-b")?.state).toBe("unknown");
    expect(dd.d.claims.get("z:1:h-z")?.state).toBe("running");
    expect(workerCalls).toHaveLength(0);
    void d;
  });

  test("第二轮提问复用 q-1：改名成 r2-q-1，仍可作答，已回答的第一轮问题保留", async () => {
    let n = 0;
    const one: RunOutcome = { state: "waiting_input", message: "提问", exitCode: 0, nativeSessionId: "sess-9", questions: [{ id: "q-1", text: "第一问？", options: [] }] };
    const two: RunOutcome = { state: "waiting_input", message: "再问", exitCode: 0, nativeSessionId: "sess-9", questions: [{ id: "q-1", text: "第二问？", options: [] }] };
    const ctx = setup({ tasks: [task("a")], outcome: () => (++n === 1 ? one : two) });
    await ctx.svc.ensureBuiltin();
    await ctx.svc.activate(ctx.svc.rules()[0]!.id, "manual");
    const runId = ctx.svc.runs().find((r) => r.kind === "task-run")!.id;
    await ctx.svc.answerRun(runId, [{ id: "q-1", answer: "甲" }]);
    await ctx.svc.idle();
    const qs = ctx.svc.runDetail(runId).data["questions"] as { id: string; answer: string | null; text: string }[];
    expect(qs.map((q) => [q.id, q.answer])).toEqual([["q-1", "甲"], ["r2-q-1", null]]);
    expect(await ctx.svc.answerRun(runId, [{ id: "r2-q-1", answer: "乙" }])).toEqual({ resumed: true });
    await ctx.svc.idle();
  });

  test("对账：运行目录不存在（CLI 从未启动）→ 正常继续启动，不是 unknown", async () => {
    const t1 = task("a");
    const { svc, workerCalls } = setup({ tasks: [t1], adopt: async () => null, hasRound: () => false });
    await svc.ensureBuiltin();
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const runId = (await dd.d.repo.create("task-run", { taskId: "a", ruleId: "r", processingKey: "a:1:h-a", attempt: 1, round: 1, state: "queued", provider: "codex", model: null, spaceId: "space-1", cwd: "/work", machineId: "m1", questions: [] }, "")).id;
    dd.d.claims.create({ processingKey: "a:1:h-a", taskId: "a", runId, state: "queued", claimedAt: "t", machineId: "m1" });
    await svc.reconcile();
    await svc.idle();
    expect(workerCalls).toHaveLength(1);
    expect(svc.runDetail(runId).data["state"]).toBe("succeeded");
  });

  test("重试拒绝：别的机器启动的运行", async () => {
    const { svc } = await waiting();
    const runId = svc.runs().find((r) => r.kind === "task-run")!.id;
    await svc.cancelRunById(runId);
    const dd = svc as unknown as { d: { claims: { update(k: string, p: unknown): unknown } } };
    dd.d.claims.update(svc.runDetail(runId).data["processingKey"] as string, { machineId: "other" });
    await expect(svc.retryRun(runId)).rejects.toThrow(/另一台机器/);
  });

  test("对账：第 2 轮续跑在启动前中断 → 带着回答 --resume 重新启动，而不是当成全新运行", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a")], adopt: async () => null, hasRound: (_id, round) => round === 1 });
    await svc.ensureBuiltin();
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const runId = (await dd.d.repo.create("task-run", { taskId: "a", ruleId: "r", processingKey: "a:1:h-a", attempt: 1, round: 2, state: "running", provider: "claude", model: null, spaceId: "space-1", cwd: "/work", machineId: "m1", nativeSessionId: "sess-9", questions: [{ id: "q-1", text: "覆盖吗？", options: [], answer: "覆盖", answeredAt: "2026-11-10T12:00:00Z" }] }, "")).id;
    dd.d.claims.create({ processingKey: "a:1:h-a", taskId: "a", runId, state: "running", claimedAt: "t", machineId: "m1" });
    await svc.reconcile();
    await svc.idle();
    expect(workerCalls).toHaveLength(1);
    expect(workerCalls[0]?.resume).toMatchObject({ nativeSessionId: "sess-9" });
    expect(workerCalls[0]?.resume?.prompt).toContain("覆盖");
    expect(workerCalls[0]?.round).toBe(2);
  });

  test("失去监督的孤儿 CLI：详情显示 live，可以取消（结束进程并标记已取消），之后才能重试", async () => {
    let alive = true;
    const killed: string[] = [];
    const { svc } = setup({ tasks: [task("a")], outcome: () => ({ state: "unknown", message: "无法确认", exitCode: null, nativeSessionId: null, questions: [] }), runAlive: () => alive, killRound: (id) => { killed.push(id); alive = false; } });
    await svc.ensureBuiltin();
    await svc.activate(svc.rules()[0]!.id, "manual");
    const runId = svc.runs().find((r) => r.kind === "task-run")!.id;
    expect(svc.runDetail(runId)).toMatchObject({ live: true, canRetry: true });
    await expect(svc.retryRun(runId)).rejects.toThrow(/还在运行/);
    expect(await svc.cancelRunById(runId)).toEqual({ cancelled: true });
    expect(killed).toEqual([runId]);
    expect(svc.runDetail(runId).data["state"]).toBe("cancelled");
    expect((await svc.retryRun(runId)).runId).toBeTruthy();
    await svc.idle();
  });
});
