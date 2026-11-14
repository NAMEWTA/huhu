import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { OperationLog, SemanticRepository, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { ClaimStore } from "../src/engine/claims.js";
import { AutomationsService, type AutomationsDeps, type RunOutcome, type WorkerInput } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const exec = (n: number) => ({ spaceId: `space-${n}`, provider: "codex", model: null, effort: null, fast: false });
function task(id: string, over: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    path: `Tasks/${id}.md`,
    version: "v",
    title: id,
    body: "",
    type: "agent",
    status: "not_started",
    completedAt: null,
    tags: [],
    due: null,
    project: null,
    origin: { kind: "desktop" },
    execution: exec(1),
    reminders: [],
    inputRevision: 1,
    inputHash: `h-${id}`,
    createdAt: "",
    updatedAt: "",
    readOnly: false,
    comments: [],
    references: [],
    problems: [],
    dispatchBlockers: [],
    ...over,
  };
}

interface Call {
  capability: string;
  input: Record<string, unknown>;
  key?: string;
}
function setup(
  opts: {
    tasks?: TaskDto[];
    tasksEnabled?: boolean;
    outcome?: (i: WorkerInput) => RunOutcome;
    adopt?: AutomationsDeps["adopt"];
    hasRound?: AutomationsDeps["hasRound"];
    runAlive?: AutomationsDeps["runAlive"];
    killRound?: AutomationsDeps["killRound"];
    /** 假 agent-cli：按命令返回会话；output 为命令的“输出”。 */
    terminal?: { exitCode?: number | null; output?: string; stayRunning?: boolean; launchError?: string };
    spaceState?: "ok" | "missing";
  } = {},
) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-au-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const tasks = opts.tasks ?? [];
  const workerCalls: WorkerInput[] = [];
  const calls: Call[] = [];
  const notes: string[] = [];
  const events: string[] = [];
  const flags = { failMark: false };
  const sessions = new Map<string, { id: string; state: string; exitCode: number | null; requestId?: string; hasEnv?: boolean }>();
  const svc = new AutomationsService({
    repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))),
    claims: new ClaimStore(path.join(d, "claims")),
    activationsDir: path.join(d, "act"),
    taskQuery: () =>
      opts.tasksEnabled === false ? undefined : { listAll: () => tasks, listDispatchable: () => tasks.filter((t) => t.type === "agent" && t.status === "not_started"), snapshot: (id) => tasks.find((t) => t.id === id) as TaskDto },
    worker: async (i) => {
      workerCalls.push(i);
      return opts.outcome?.(i) ?? { state: "succeeded", message: `完成 ${i.task.title}`, exitCode: 0, nativeSessionId: "sess-1", questions: [] };
    },
    ...(opts.adopt ? { adopt: opts.adopt } : {}),
    ...(opts.hasRound ? { hasRound: opts.hasRound } : {}),
    ...(opts.runAlive ? { runAlive: opts.runAlive } : {}),
    ...(opts.killRound ? { killRound: opts.killRound } : {}),
    terminalPollMs: 5,
    spaceState: () => ({ state: opts.spaceState ?? "ok", root: "/work" }),
    cliAvailable: () => true,
    holds: () => false,
    vaultRoot: root,
    readVaultFile: () => "任务文件快照",
    // 模拟 tasks 插件：markDispatched 只在任务仍是未开始时生效，并把它置为进行中
    call: async (capability, input, key) => {
      const i = input as Record<string, unknown>;
      calls.push({ capability, input: i, ...(key ? { key } : {}) });
      if (!key && !/^(agent\.spaces\.list|agent\.sessions\.(list|output)|tasks\.(list|read))$/.test(capability)) throw new Error("写入类能力必须提供幂等键"); // 与内核 Dispatcher 一致：缺幂等键会被拒绝
      if (capability === "agent.spaces.list") return [{ id: "space-1", revision: 1, root }];
      if (capability === "agent.sessions.launch") {
        if (opts.terminal?.launchError) throw new Error(opts.terminal.launchError);
        sessions.set(`sess-${sessions.size + 1}`, {
          id: `sess-${sessions.size + 1}`,
          state: opts.terminal?.stayRunning ? "running" : "exited",
          exitCode: opts.terminal?.exitCode ?? 0,
          requestId: String(i["requestId"]),
          hasEnv: Object.keys((i["envRefs"] as object | undefined) ?? {}).length > 0,
        });
        return { id: `sess-${sessions.size}` };
      }
      if (capability === "agent.sessions.list") return [...sessions.values()];
      if (capability === "agent.sessions.kill") {
        const x = sessions.get(String(i["id"]));
        if (x) Object.assign(x, { state: "exited", exitCode: null });
        return {};
      }
      if (capability === "agent.sessions.release") return { ok: true };
      if (capability === "agent.sessions.output") return { text: opts.terminal?.output ?? "", complete: true };
      if (capability === "tasks.markDispatched") {
        const t = tasks.find((x) => x.id === i["id"]);
        if (flags.failMark || !t || t.status !== "not_started") throw new Error("任务已变化，不能派发");
        t.status = "in_progress";
      }
      return {};
    },
    notify: (n) => notes.push(n.title),
    publish: (t) => events.push(t),
    now: () => new Date("2026-11-10T12:00:00Z"),
    zone: () => "UTC",
    machineId: "m1",
  });
  return { svc, root, tasks, workerCalls, calls, notes, events, flags, d };
}
type Ctx = ReturnType<typeof setup>;

const every5 = { preset: "every5", cron: "*/5 * * * *", zone: "UTC" };
/** 一条已启用的“让 Agent 处理任务”规则。 */
async function scanRule(svc: AutomationsService, tags: string[] = [], maxConcurrent = 1): Promise<string> {
  const r = await svc.create({ title: "处理 Agent 任务", trigger: every5, action: { kind: "agent", input: { source: "tasks", tags, maxConcurrent } } });
  return (await svc.setEnabled(r.id, true)).id;
}
const promptAction = { kind: "agent" as const, input: { source: "prompt" as const, spaceId: "space-1", provider: "claude", model: null, effort: null, fast: false } };
const taskRuns = (ctx: Ctx) => (existsSync(path.join(ctx.root, "Task Runs")) ? readdirSync(path.join(ctx.root, "Task Runs")) : []);

describe("规则正文（agent 动作“提示词”输入）", () => {
  test("update 可以改正文；其他动作不接受非空正文；从“提示词”改成别的动作会清空旧提示词；省略 body 保留原文", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "整理", trigger: { preset: "daily", cron: "30 9 * * *", zone: "UTC" }, action: promptAction, body: "第一版" });
    expect(r.body).toBe("第一版");
    const r2 = await svc.update(r.id, r.version, { title: "整理2" });
    expect(r2.body).toBe("第一版");
    const r3 = await svc.update(r.id, r2.version, {}, "第二版");
    expect(r3.body).toBe("第二版");
    const reminder = { kind: "reminder" as const, mode: "notification" as const, text: "x", taskId: null };
    await expect(svc.update(r.id, r3.version, { action: reminder }, "还想留着提示词")).rejects.toThrow(/提示词/);
    const r4 = await svc.update(r.id, r3.version, { action: reminder });
    expect(r4.body).toBe("");
    await expect(svc.update(r.id, r4.version, {}, "提醒规则不该有正文")).rejects.toThrow(/提示词/);
  });
  test("“任务”输入的规则正文是补充指令，允许保留", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "扫", trigger: every5, action: { kind: "agent", input: { source: "tasks", tags: [], maxConcurrent: 1 } }, body: "完成后请写总结" });
    expect(r.body).toBe("完成后请写总结");
  });
});

describe("规则", () => {
  test("新 Vault 没有任何内置规则；规则都可以删除；新建默认暂停；可启停", async () => {
    const { svc } = setup();
    expect(svc.rules()).toEqual([]);
    const r = await svc.create({ title: "每天提醒", trigger: { preset: "daily9", cron: "0 9 * * *", zone: "UTC" }, action: { kind: "reminder", mode: "notification", text: "喝水", taskId: null } });
    expect(r.data.enabled).toBe(false);
    expect((await svc.setEnabled(r.id, true)).data.enabled).toBe(true);
    await svc.delete(r.id);
    expect(svc.rules()).toEqual([]);
  });
  test("非法 cron / 时区被拒绝", async () => {
    const { svc } = setup();
    const r = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "x", taskId: null } });
    await expect(svc.create({ title: "x", trigger: { preset: "custom", cron: "bad", zone: "UTC" }, action: { kind: "reminder", mode: "notification", text: "x", taskId: null } })).rejects.toThrow(/定时设置无效/);
    await expect(svc.update(r.id, r.version, { trigger: { preset: "custom", cron: "0 9 * * *", zone: "Mars/Base" } })).rejects.toThrow();
  });
});

describe("agent 动作：任务输入", () => {
  const four = () => [task("a"), task("b", { execution: exec(2) }), task("h", { type: "human", execution: null }), task("d", { status: "completed" })];

  test("预览：候选 2、跳过 2 并带原因，且不产生任何文件", async () => {
    const { svc, d } = setup({ tasks: four() });
    const id = await scanRule(svc);
    const before = readdirSync(d).sort();
    const p = svc.preview(id);
    expect(p.candidates.map((c) => c.taskId)).toEqual(["a", "b"]);
    expect(p.skipped.map((s) => [s.taskId, s.reason])).toEqual([
      ["h", "not-agent"],
      ["d", "not-open"],
    ]);
    expect(p.next).toHaveLength(3);
    expect(readdirSync(d).sort()).toEqual(before);
    expect(existsSync(path.join(d, "claims"))).toBe(false);
  });

  test("立即运行：每个候选一个 task-run；先 markDispatched（幂等键 = runId）再启动 worker；再次运行不重复；重开后才再处理", async () => {
    const ctx = setup({ tasks: four() });
    const { svc, tasks, workerCalls, calls } = ctx;
    const id = await scanRule(svc);
    const a1 = await svc.activate(id, "manual");
    expect(a1.summary).toEqual({ processed: 2, skipped: 2 });
    expect(taskRuns(ctx)).toHaveLength(2);
    expect(workerCalls.map((w) => w.task.id).sort()).toEqual(["a", "b"]);
    expect(workerCalls[0]?.cwd).toBe("/work");
    expect(workerCalls[0]?.vaultRoot).toBe(ctx.root);
    expect(workerCalls[0]?.snapshotText).toBe("任务文件快照");
    const marks = calls.filter((c) => c.capability === "tasks.markDispatched");
    expect(marks).toHaveLength(2);
    for (const m of marks) expect(m.key).toBe(m.input["runId"]);
    expect(tasks.filter((t) => t.status === "in_progress").map((t) => t.id)).toEqual(["a", "b"]);
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 4 });
    expect(taskRuns(ctx)).toHaveLength(2);
    // 用户重开 a（inputRevision+1）：新的派发意图
    tasks[0] = { ...tasks[0]!, status: "not_started", inputRevision: 2 };
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 3 });
    expect(taskRuns(ctx)).toHaveLength(3);
    // 只改截止日（不影响 inputHash / inputRevision）：同一输入已有成功运行，不再处理
    tasks[1] = { ...tasks[1]!, status: "not_started", due: "2026-12-01" };
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 4 });
  });

  test("标签筛选：只处理带全部标签的任务；其余带 tag-mismatch", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a", { tags: ["周报", "接口"] }), task("b", { execution: exec(2), tags: ["周报"] }), task("c", { execution: exec(3) })] });
    const id = await scanRule(svc, ["周报", "接口"]);
    expect(svc.preview(id).skipped.map((s) => [s.taskId, s.reason])).toEqual([
      ["b", "tag-mismatch"],
      ["c", "tag-mismatch"],
    ]);
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 2 });
    expect(workerCalls.map((w) => w.task.id)).toEqual(["a"]);
  });

  test("同一 Space 同一时间只跑一个：同 Space 的第二个任务 space-busy", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a"), task("b")] });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped.map((s) => [s.taskId, s.reason])).toEqual([["b", "space-busy"]]);
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 1 });
    expect(workerCalls.map((w) => w.task.id)).toEqual(["a"]);
  });

  test("任务自身有阻塞原因（引用越界、结构错误等）→ 不派发，预览显示原因", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a", { dispatchBlockers: ["引用越界：../x.md"] })] });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]).toMatchObject({ taskId: "a", reason: "task-blocked", detail: "引用越界：../x.md" });
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 1 });
    expect(workerCalls).toHaveLength(0);
  });

  test("markDispatched 失败 → 撤回 claim 与 task-run，不启动 worker；下一次触发重新派发", async () => {
    const ctx = setup({ tasks: [task("a")] });
    const { svc, workerCalls, flags } = ctx;
    const id = await scanRule(svc);
    flags.failMark = true;
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 0 });
    expect(workerCalls).toHaveLength(0);
    expect(taskRuns(ctx)).toEqual([]);
    expect((svc as unknown as { d: { claims: ClaimStore } }).d.claims.list()).toEqual([]);
    flags.failMark = false;
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 0 });
    expect(taskRuns(ctx)).toHaveLength(1);
  });

  test("worker 失败 → failed，不自动重试；ask 回执 → waiting_input 带问题；两种情况都给任务追加 agent 评论（id 由运行派生）", async () => {
    const ctx = setup({
      tasks: [task("a"), task("b", { execution: exec(2) })],
      outcome: (i) =>
        i.task.id === "a"
          ? { state: "failed", message: "boom", exitCode: 1, nativeSessionId: null, questions: [] }
          : { state: "waiting_input", message: "要覆盖吗", exitCode: 0, nativeSessionId: "s9", questions: [{ id: "q-1", text: "是否覆盖？", options: ["覆盖", "另存"] }] },
    });
    const { svc, root, calls } = ctx;
    const id = await scanRule(svc);
    await svc.activate(id, "manual");
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 2 });
    const texts = readdirSync(path.join(root, "Task Runs")).map((f) => readFileSync(path.join(root, "Task Runs", f), "utf8"));
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => /state: failed/.test(t) && t.includes("boom"))).toBe(true);
    expect(texts.some((t) => /state: waiting_input/.test(t) && t.includes("是否覆盖？"))).toBe(true);
    const comments = calls.filter((c) => c.capability === "tasks.comments.add").map((c) => c.input);
    expect(comments).toContainEqual(expect.objectContaining({ taskId: "a", source: "agent", event: "failed", body: "boom", id: expect.stringMatching(/^run-.*-r1-failed$/) }));
    expect(comments).toContainEqual(expect.objectContaining({ taskId: "b", source: "agent", ask: "q-1", event: "question", body: "是否覆盖？" }));
  });

  test("tasks 插件停用：扫描跳过（预览标注）；reminder 规则正常通知", async () => {
    const { svc, notes } = setup({ tasksEnabled: false });
    const scanId = await scanRule(svc);
    expect((await svc.activate(scanId, "manual")).summary).toEqual({ state: "tasks-disabled" });
    expect(svc.preview(scanId).tasksDisabled).toBe(true);
    const n = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "该休息了", taskId: null } });
    await svc.setEnabled(n.id, true);
    expect((await svc.activate(n.id, "schedule", new Date("2026-11-10T11:55:00Z"))).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["该休息了"]);
  });

  test("Space 缺失的候选被跳过；同一规则不能并发激活", async () => {
    const { svc } = setup({ tasks: [task("a")], spaceState: "missing" });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]?.reason).toBe("missing-space");
    let release!: () => void;
    const s2 = setup({ tasks: [task("a")] });
    const id2 = await scanRule(s2.svc);
    (s2.svc as unknown as { d: { worker: unknown } }).d.worker = () =>
      new Promise((r) => {
        release = () => r({ state: "succeeded", message: "ok", exitCode: 0, nativeSessionId: null, questions: [] });
      });
    const first = s2.svc.activate(id2, "manual");
    for (let i = 0; i < 200 && !release; i++) await new Promise((r) => setTimeout(r, 10));
    await expect(s2.svc.activate(id2, "manual")).rejects.toThrow(/正在执行/);
    release();
    await first;
  });

  test("activeFor：有活动 claim 的任务为 true", async () => {
    const { svc } = setup({ tasks: [task("a")], outcome: () => ({ state: "waiting_input", message: "q", exitCode: 0, nativeSessionId: "s", questions: [{ id: "q-1", text: "?", options: [] }] }) });
    await svc.activate(await scanRule(svc), "manual");
    expect(svc.activeFor(["a", "zzz"])).toEqual({ a: true, zzz: false });
  });

  test("激活记录：start+finish 合并为一条，lastActivatedFor 取最近计划时间", async () => {
    const { svc } = setup();
    const id = await scanRule(svc);
    await svc.activate(id, "schedule", new Date("2026-11-10T11:55:00Z"));
    await svc.activate(id, "manual");
    const acts = svc.activations();
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.finishedAt)).toBe(true);
    expect(svc.lastActivatedFor(id)?.toISOString()).toBe("2026-11-10T11:55:00.000Z");
  });
});

describe("agent 动作：提示词输入 / terminal / reminder", () => {
  test("提示词：规则正文就是提示词，不涉及任务与 claim；结果写 automation-run 并通知", async () => {
    const ctx = setup();
    const { svc, workerCalls, calls, notes } = ctx;
    const r = await svc.create({ title: "晨间整理", trigger: every5, action: promptAction, body: "整理今天的收件箱" });
    const rec = await svc.activate(r.id, "manual");
    expect(rec.summary).toEqual({ state: "succeeded" });
    expect(workerCalls).toHaveLength(1);
    expect(workerCalls[0]).toMatchObject({ cwd: "/work", provider: "claude", vaultRoot: ctx.root });
    expect(workerCalls[0]?.task.body).toBe("整理今天的收件箱");
    expect(calls.filter((c) => c.capability === "tasks.markDispatched")).toEqual([]);
    expect(taskRuns(ctx)).toEqual([]);
    const run = svc.runs().find((x) => x.kind === "automation-run")!;
    expect(svc.runDetail(run.id).body).toContain("完成");
    expect(notes.some((t) => t.includes("晨间整理") && t.includes("已完成"))).toBe(true);
  });

  test("reminder：通知 / 新建人工任务（引用关联任务）/ 两者都做；建任务失败要提示", async () => {
    const { svc, calls, notes } = setup({ tasks: [task("a")] });
    const mk = async (mode: "notification" | "task" | "both", taskId: string | null) => (await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode, text: "复盘周报", taskId } })).id;
    expect((await svc.activate(await mk("notification", null), "manual")).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["复盘周报"]);
    expect(calls).toEqual([]);
    expect((await svc.activate(await mk("both", "a"), "manual")).summary).toEqual({ state: "succeeded" });
    const create = calls.find((c) => c.capability === "tasks.create")!;
    expect(create.input).toMatchObject({ title: "复盘周报", type: "human" });
    expect(String(create.input["body"])).toContain("[[Tasks/a.md]]");
    expect(notes).toEqual(["复盘周报", "复盘周报"]);
    // 建任务失败（tasks 停用等）
    (svc as unknown as { d: { call: unknown } }).d.call = async () => {
      throw new Error("tasks 未启用");
    };
    expect((await svc.activate(await mk("task", null), "manual")).summary).toEqual({ state: "failed" });
    expect(notes.at(-1)).toContain("创建任务失败");
  });

  test("terminal：经 agent-cli 的 Herdr 会话运行（launch 带 command / shell / Space），automation-run 记录 sessionId，输出与退出码写入运行记录", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "hello-terminal" } });
    const { svc, calls } = ctx;
    const ok = await svc.create({ title: "打招呼", trigger: every5, action: { kind: "terminal", command: "echo hello-terminal", shell: "sh", spaceId: null, envRefs: {} } });
    expect((await svc.activate(ok.id, "manual")).summary).toEqual({ state: "succeeded" });
    const launch = calls.find((c) => c.capability === "agent.sessions.launch")!;
    expect(launch.input).toMatchObject({ provider: "shell", command: "echo hello-terminal", shell: "sh", spaceId: "space-1" });
    expect(launch.input).not.toHaveProperty("envRefs");
    const run = svc.runs().find((x) => x.kind === "automation-run")!;
    const d = svc.runDetail(run.id);
    expect(d.body).toContain("hello-terminal");
    expect(d.data).toMatchObject({ sessionId: "sess-1", exitCode: 0, state: "succeeded" });
    // 非零退出码 → failed
    const bad = setup({ terminal: { exitCode: 3 } });
    const r2 = await bad.svc.create({ title: "失败", trigger: every5, action: { kind: "terminal", command: "exit 3", shell: "default", spaceId: null, envRefs: {} } });
    expect((await bad.svc.activate(r2.id, "manual")).summary).toEqual({ state: "failed" });
  });

  test("terminal：环境变量引用原样交给 agent-cli（automations 不接触秘密值）；启动失败（保险箱锁定等）→ 失败并通知，不留下 running", async () => {
    const { svc, calls } = setup({ terminal: { exitCode: 0, output: "token=***" } });
    const r = await svc.create({ title: "带密钥", trigger: every5, action: { kind: "terminal", command: 'echo "token=$MY_TOKEN"', shell: "default", spaceId: null, envRefs: { MY_TOKEN: "vault:token" } } });
    expect((await svc.activate(r.id, "manual")).summary).toEqual({ state: "succeeded" });
    const launch = calls.find((c) => c.capability === "agent.sessions.launch")!;
    expect(launch.input["envRefs"]).toEqual({ MY_TOKEN: "vault:token" });
    expect(calls.find((c) => c.capability === "agent.sessions.output")!.input).not.toHaveProperty("usedEnv"); // 是否带过环境变量以 agent-cli 的会话记录为准，不由调用方声明
    expect(calls.some((c) => c.capability === "agent.sessions.release")).toBe(true); // 带密钥的命令读完输出后移除终端
    const locked = setup({ terminal: { launchError: "SAFE_LOCKED：保险箱已锁定" } });
    const r2 = await locked.svc.create({ title: "锁定", trigger: every5, action: { kind: "terminal", command: "echo x", shell: "default", spaceId: null, envRefs: { A: "vault:x" } } });
    expect((await locked.svc.activate(r2.id, "manual")).summary).toEqual({ state: "failed" });
    expect(locked.notes.some((t) => t.includes("SAFE_LOCKED"))).toBe(true);
    const run = locked.svc.runs().find((x) => x.kind === "automation-run")!;
    expect(locked.svc.runDetail(run.id).data["state"]).toBe("failed");
  });

  test("terminal：取消 → 结束终端并记为 cancelled；重启对账：停在 running 的运行按会话真实状态完成", async () => {
    const ctx = setup({ terminal: { stayRunning: true, output: "partial" } });
    const { svc, calls } = ctx;
    const r = await svc.create({ title: "长任务", trigger: every5, action: { kind: "terminal", command: "sleep 100", shell: "default", spaceId: null, envRefs: {} } });
    const p = svc.activate(r.id, "manual");
    for (let i = 0; i < 100 && !calls.some((c) => c.capability === "agent.sessions.launch"); i++) await new Promise((x) => setTimeout(x, 5));
    svc.cancel(r.id);
    await p;
    expect(calls.some((c) => c.capability === "agent.sessions.kill")).toBe(true);
    const run = svc.runs().find((x) => x.kind === "automation-run")!;
    expect(svc.runDetail(run.id).data["state"]).toBe("cancelled");
    // 对账：一个停在 running、会话已结束的运行
    const rec = setup({ terminal: { exitCode: 0, output: "done-after-restart" } });
    const rule = await rec.svc.create({ title: "重启对账", trigger: every5, action: { kind: "terminal", command: "echo", shell: "default", spaceId: null, envRefs: {} } });
    const d = rec.svc as unknown as { d: { repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    await rec.svc.activate(rule.id, "manual"); // 先产生一个 session（sess-1，已结束）
    const stuck = await d.d.repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1" }, "");
    await rec.svc.reconcile();
    await rec.svc.idle();
    expect(rec.svc.runDetail(stuck.id).data).toMatchObject({ state: "succeeded", exitCode: 0 });
    expect(rec.svc.runDetail(stuck.id).body).toContain("done-after-restart");
  });

  test("重启对账：规则之后被删除 / 去掉 envRefs 也不影响——带环境变量的会话仍会移除终端；sessionId 没来得及写回时按 requestId 找回", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "token=***" } });
    const { svc, calls } = ctx;
    const rule = await svc.create({ title: "带密钥", trigger: every5, action: { kind: "terminal", command: "echo", shell: "default", spaceId: null, envRefs: { T: "vault:t" } } });
    await svc.activate(rule.id, "manual");
    calls.length = 0;
    await svc.delete(rule.id); // 规则没了：对账不能再靠规则推断是否带过密钥
    const repo = (svc as unknown as { d: { repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } }).d.repo;
    const stuck = await repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1" }, "");
    await svc.reconcile();
    await svc.idle();
    expect(svc.runDetail(stuck.id).data["state"]).toBe("succeeded");
    expect(calls.some((c) => c.capability === "agent.sessions.release")).toBe(true);
    // sessionId 没写回：运行 id 对应的 requestId（autorun-<id>）能找回会话
    const lost = await repo.create("automation-run", { ruleId: "rule-gone", actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z" }, "");
    (ctx.svc as unknown as { d: { call: (c: string, i: unknown, k?: string) => Promise<unknown> } }).d.call = async (c) =>
      c === "agent.sessions.list" ? [{ id: "sess-9", requestId: `autorun-${lost.id}`, state: "exited", exitCode: 0, hasEnv: false }] : c === "agent.sessions.output" ? { text: "recovered", complete: true } : {};
    await svc.reconcile();
    await svc.idle();
    expect(svc.runDetail(lost.id).data).toMatchObject({ state: "succeeded", sessionId: "sess-9" });
    expect(svc.runDetail(lost.id).body).toContain("recovered");
  });
});

describe("审计回归", () => {
  test("定时触发不执行已暂停的规则；手动仍可运行", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a")] });
    const id = await scanRule(svc);
    await svc.setEnabled(id, false);
    expect((await svc.activate(id, "schedule", new Date())).summary).toEqual({ state: "paused" });
    expect(workerCalls).toHaveLength(0);
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 1, skipped: 0 });
  });
  test("启动对账把 queued/running 的 claim 置 unknown（无法接管时），之后扫描不再处理该输入", async () => {
    const { svc, workerCalls } = setup({ tasks: [task("a")] });
    const id = await scanRule(svc);
    const claims = (svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null } } }).d.claims;
    claims.create({ processingKey: "a:1:h-a", taskId: "a", runId: "run-gone", state: "running", claimedAt: "t" });
    expect(await svc.reconcile()).toBe(1);
    expect(claims.get("a:1:h-a")?.state).toBe("unknown");
    expect((await svc.activate(id, "manual")).summary).toEqual({ processed: 0, skipped: 1 });
    expect(workerCalls).toHaveLength(0);
  });
});

describe("问答续跑、取消与重试（ACC-AU-08）", () => {
  const ask = (n: string): RunOutcome => ({
    state: "waiting_input",
    message: `第 ${n} 次提问`,
    exitCode: 0,
    nativeSessionId: "sess-9",
    questions: [
      { id: "q-1", text: "是否覆盖？", options: ["覆盖", "另存"] },
      { id: "q-2", text: "文件名？", options: [] },
    ],
  });
  const done: RunOutcome = { state: "succeeded", message: "续跑完成", exitCode: 0, nativeSessionId: "sess-9", questions: [] };

  async function waiting() {
    let n = 0;
    const ctx = setup({ tasks: [task("a")], outcome: (i) => (i.resume ? done : ask(String(++n))) });
    await ctx.svc.activate(await scanRule(ctx.svc), "manual");
    const run = ctx.svc.runs().find((r) => r.kind === "task-run")!;
    return { ...ctx, runId: run.id };
  }

  test("回答全部问题后以原生会话 id 续跑，同一个 task-run 追加第 2 轮结果，attempt 不变", async () => {
    const { svc, runId, workerCalls, notes } = await waiting();
    expect(svc.runDetail(runId).data["state"]).toBe("waiting_input");
    expect(
      await svc.answerRun(runId, [
        { id: "q-1", answer: "覆盖" },
        { id: "q-2", answer: "out.md" },
      ]),
    ).toEqual({ resumed: true });
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
    const t1 = task("a");
    const t2 = task("b");
    const adopt: AutomationsDeps["adopt"] = async (i) => (i.runId === "run-ok" ? { ...done, message: "后台跑完了" } : { state: "unknown", message: "监督进程已不存在，结果无法确认", exitCode: null, nativeSessionId: null, questions: [] });
    const { svc, workerCalls, d } = setup({ tasks: [t1, t2], adopt });
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const mk = async (task: TaskDto) =>
      (
        await dd.d.repo.create(
          "task-run",
          { taskId: task.id, ruleId: "r", processingKey: `${task.id}:1:h-${task.id}`, attempt: 1, round: 1, state: "running", provider: "claude", model: null, spaceId: "space-1", cwd: "/work", machineId: "m1", questions: [] },
          "",
        )
      ).id;
    const okId = await mk(t1);
    expect(okId).toBeTruthy();
    // adopt 按 runId 区分：把 id 对上
    (svc as unknown as { d: { adopt: unknown } }).d.adopt = async (i: { runId: string }) =>
      i.runId === okId ? { ...done, message: "后台跑完了" } : { state: "unknown", message: "无法确认", exitCode: null, nativeSessionId: null, questions: [] };
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
    await ctx.svc.activate(await scanRule(ctx.svc), "manual");
    const runId = ctx.svc.runs().find((r) => r.kind === "task-run")!.id;
    await ctx.svc.answerRun(runId, [{ id: "q-1", answer: "甲" }]);
    await ctx.svc.idle();
    const qs = ctx.svc.runDetail(runId).data["questions"] as { id: string; answer: string | null; text: string }[];
    expect(qs.map((q) => [q.id, q.answer])).toEqual([
      ["q-1", "甲"],
      ["r2-q-1", null],
    ]);
    expect(await ctx.svc.answerRun(runId, [{ id: "r2-q-1", answer: "乙" }])).toEqual({ resumed: true });
    await ctx.svc.idle();
  });

  test("对账：运行目录不存在（CLI 从未启动）→ 正常继续启动，不是 unknown", async () => {
    const t1 = task("a");
    const { svc, workerCalls } = setup({ tasks: [t1], adopt: async () => null, hasRound: () => false });
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean; get(k: string): { state: string } | null }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const runId = (
      await dd.d.repo.create("task-run", { taskId: "a", ruleId: "r", processingKey: "a:1:h-a", attempt: 1, round: 1, state: "queued", provider: "codex", model: null, spaceId: "space-1", cwd: "/work", machineId: "m1", questions: [] }, "")
    ).id;
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
    const dd = svc as unknown as { d: { claims: { create(c: unknown): boolean }; repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } };
    const runId = (
      await dd.d.repo.create(
        "task-run",
        {
          taskId: "a",
          ruleId: "r",
          processingKey: "a:1:h-a",
          attempt: 1,
          round: 2,
          state: "running",
          provider: "claude",
          model: null,
          spaceId: "space-1",
          cwd: "/work",
          machineId: "m1",
          nativeSessionId: "sess-9",
          questions: [{ id: "q-1", text: "覆盖吗？", options: [], answer: "覆盖", answeredAt: "2026-11-10T12:00:00Z" }],
        },
        "",
      )
    ).id;
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
    const { svc } = setup({
      tasks: [task("a")],
      outcome: () => ({ state: "unknown", message: "无法确认", exitCode: null, nativeSessionId: null, questions: [] }),
      runAlive: () => alive,
      killRound: (id) => {
        killed.push(id);
        alive = false;
      },
    });
    await svc.activate(await scanRule(svc), "manual");
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
