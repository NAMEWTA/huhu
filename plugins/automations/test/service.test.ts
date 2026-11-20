import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError, type TaskDto } from "@huhu/contracts";
import { OperationLog, SemanticRepository, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { AutomationsService } from "../src/engine/service.js";

const dirs: string[] = [];
const terminalOwner = "a".repeat(64);
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
    /** 假 agent-cli：按命令返回会话；output 为命令的“输出”。 */
    terminal?: { exitCode?: number | null; output?: string; stayRunning?: boolean; launchError?: string; loseReply?: boolean; unavailable?: () => boolean; hasEnv?: boolean };
    spaceState?: "ok" | "missing";
  } = {},
) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-au-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const tasks = opts.tasks ?? [];
  const calls: Call[] = [];
  const notes: string[] = [];
  const events: string[] = [];
  const sessions = new Map<string, { id: string; state: string; exitCode: number | null; requestId?: string; hasEnv?: boolean }>();
  const repo = new SemanticRepository(files, new OperationLog(files, path.join(d, "ops")));
  const svc = new AutomationsService({
    repo,
    activationsDir: path.join(d, "act"),
    taskQuery: () =>
      opts.tasksEnabled === false ? undefined : { listAll: () => tasks, listDispatchable: () => tasks.filter((t) => t.type === "agent" && t.status === "not_started"), snapshot: (id) => tasks.find((t) => t.id === id) as TaskDto },
    terminalPollMs: 5,
    spaceState: () => ({ state: opts.spaceState ?? "ok", root: "/work" }),
    cliAvailable: () => true,
    holds: () => false,
    vaultRoot: root,
    terminalOwner,
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
          hasEnv: opts.terminal?.hasEnv ?? false,
        });
        if (opts.terminal?.loseReply) throw new HuhuError("RUN_UNKNOWN", "终端启动回执未收到");
        return { id: `sess-${sessions.size}` };
      }
      if (capability === "agent.sessions.list") {
        if (opts.terminal?.unavailable?.()) throw new Error("temporary disconnect");
        return [...sessions.values()];
      }
      if (capability === "agent.sessions.kill") {
        const x = sessions.get(String(i["id"]));
        if (x) Object.assign(x, { state: "exited", exitCode: null });
        return {};
      }
      if (capability === "agent.sessions.release") return { ok: true };
      if (capability === "agent.sessions.output") return { text: opts.terminal?.output ?? "", complete: true };
      return {};
    },
    notify: (n) => notes.push(n.title),
    publish: (t) => events.push(t),
    now: () => new Date("2026-11-10T12:00:00Z"),
    zone: () => "UTC",
  });
  return { svc, root, tasks, calls, notes, events, d, sessions, repo };
}

const every5 = { preset: "every5", cron: "*/5 * * * *", zone: "UTC" };
/** 一条已启用的“让 Agent 处理任务”规则。 */
async function scanRule(svc: AutomationsService, tags: string[] = [], maxConcurrent = 1): Promise<string> {
  const r = await svc.create({ title: "处理 Agent 任务", trigger: every5, action: { kind: "agent", input: { source: "tasks", tags, maxConcurrent } } });
  return (await svc.setEnabled(r.id, true)).id;
}
const promptAction = { kind: "agent" as const, input: { source: "prompt" as const, spaceId: "space-1", provider: "claude", model: null, effort: null, fast: false } };

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
    expect(existsSync(path.join(d, "act"))).toBe(false);
  });

  test("台北规则按当地时区预览窗口和入选任务，未排期与逾期可独立调整", async () => {
    const tasks = [
      task("yesterday", { availableAt: "2026-11-09T10:00:00Z", execution: exec(1) }),
      task("today", { availableAt: "2026-11-10T01:00:00Z", execution: exec(2) }),
      task("tomorrow", { availableAt: "2026-11-11T01:00:00Z", execution: exec(3) }),
      task("unscheduled", { availableAt: null, execution: exec(4) }),
    ];
    const { svc, d } = setup({ tasks });
    const trigger = { ...every5, zone: "Asia/Taipei" };
    const coreInput = { source: "tasks" as const, tags: [], maxConcurrent: 1 };
    const stored = await svc.create({
      title: "台北今天任务",
      trigger,
      action: { kind: "agent", input: { ...coreInput, window: { kind: "today" }, includeOverdue: true, includeUnscheduled: false } },
    });
    expect(svc.preview(stored.id).candidates.map(({ taskId }) => taskId)).toEqual(["yesterday", "today"]);
    const rule = await svc.update(stored.id, stored.version, { action: { kind: "agent", input: { ...coreInput, includeOverdue: false, includeUnscheduled: true } } });
    expect(rule.data.action).toMatchObject({ input: { window: { kind: "today" }, includeOverdue: false, includeUnscheduled: true } });
    const before = readdirSync(d).sort();
    const preview = svc.preview(rule.id);
    expect(readdirSync(d).sort()).toEqual(before);
    expect(preview.candidates.map(({ taskId }) => taskId)).toEqual(["today", "unscheduled"]);
    expect(preview.skipped).toMatchObject([
      { taskId: "yesterday", reason: "outside-window" },
      { taskId: "tomorrow", reason: "not-due" },
    ]);
    expect(svc.preview(rule.id).next).toEqual(preview.next);
    expect(svc.rule(rule.id).version).toBe(rule.version);
    expect(svc.lastActivatedFor(rule.id)).toBeNull();
  });

  test("标签筛选：只处理带全部标签的任务；其余带 tag-mismatch", async () => {
    const { svc } = setup({ tasks: [task("a", { tags: ["周报", "接口"] }), task("b", { execution: exec(2), tags: ["周报"] }), task("c", { execution: exec(3) })] });
    const id = await scanRule(svc, ["周报", "接口"]);
    expect(svc.preview(id).skipped.map((s) => [s.taskId, s.reason])).toEqual([
      ["b", "tag-mismatch"],
      ["c", "tag-mismatch"],
    ]);
    expect(svc.preview(id).candidates.map(({ taskId }) => taskId)).toEqual(["a"]);
  });

  test("任务自身有阻塞原因（引用越界、结构错误等）→ 不派发，预览显示原因", async () => {
    const { svc } = setup({ tasks: [task("a", { dispatchBlockers: ["引用越界：../x.md"] })] });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]).toMatchObject({ taskId: "a", reason: "task-blocked", detail: "引用越界：../x.md" });
    expect(svc.preview(id).candidates).toEqual([]);
  });

  test("tasks 插件停用：扫描跳过（预览标注）；reminder 规则正常通知", async () => {
    const { svc, notes } = setup({ tasksEnabled: false });
    const scanId = await scanRule(svc);
    expect(svc.preview(scanId).tasksDisabled).toBe(true);
    const n = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "该休息了", taskId: null } });
    await svc.setEnabled(n.id, true);
    expect((await svc.activateNonAgent(n.id, "schedule", new Date("2026-11-10T11:55:00Z"))).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["该休息了"]);
  });

  test("Space 缺失的候选被跳过", async () => {
    const { svc } = setup({ tasks: [task("a")], spaceState: "missing" });
    const id = await scanRule(svc);
    expect(svc.preview(id).skipped[0]?.reason).toBe("missing-space");
  });

  test("激活记录：start+finish 合并为一条，lastActivatedFor 取最近计划时间", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode: "notification", text: "休息", taskId: null } });
    await svc.setEnabled(id, true);
    await svc.activateNonAgent(id, "schedule", new Date("2026-11-10T11:55:00Z"));
    await svc.activateNonAgent(id, "manual");
    const acts = svc.activations();
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.finishedAt)).toBe(true);
    expect(svc.lastActivatedFor(id)?.toISOString()).toBe("2026-11-10T11:55:00.000Z");
  });
});

describe("agent 动作：提示词输入 / terminal / reminder", () => {
  test("reminder：通知 / 新建人工任务（引用关联任务）/ 两者都做；建任务失败要提示", async () => {
    const { svc, calls, notes } = setup({ tasks: [task("a")] });
    const mk = async (mode: "notification" | "task" | "both", taskId: string | null) => (await svc.create({ title: "提醒", trigger: every5, action: { kind: "reminder", mode, text: "复盘周报", taskId } })).id;
    expect((await svc.activateNonAgent(await mk("notification", null), "manual")).summary).toEqual({ state: "succeeded" });
    expect(notes).toEqual(["复盘周报"]);
    expect(calls).toEqual([]);
    expect((await svc.activateNonAgent(await mk("both", "a"), "manual")).summary).toEqual({ state: "succeeded" });
    const create = calls.find((c) => c.capability === "tasks.create")!;
    expect(create.input).toMatchObject({ title: "复盘周报", type: "human" });
    expect(String(create.input["body"])).toContain("[[Tasks/a.md]]");
    expect(notes).toEqual(["复盘周报", "复盘周报"]);
    // 建任务失败（tasks 停用等）
    (svc as unknown as { d: { call: unknown } }).d.call = async () => {
      throw new Error("tasks 未启用");
    };
    expect((await svc.activateNonAgent(await mk("task", null), "manual")).summary).toEqual({ state: "failed" });
    expect(notes.at(-1)).toContain("创建任务失败");
  });

  test("terminal：经 agent-cli 的 Herdr 会话运行（launch 带 command / shell / Space），automation-run 记录 sessionId，输出与退出码写入运行记录", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "hello-terminal" } });
    const { svc, calls } = ctx;
    const ok = await svc.create({ title: "打招呼", trigger: every5, action: { kind: "terminal", command: "echo hello-terminal", shell: "sh", spaceId: null, envRefs: {} } });
    expect((await svc.activateNonAgent(ok.id, "manual")).summary).toEqual({ state: "succeeded" });
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
    expect((await bad.svc.activateNonAgent(r2.id, "manual")).summary).toEqual({ state: "failed" });
  });

  test("旧环境待重新配置，不创建旧引用、不启动、不改历史规则", async () => {
    const { svc, calls, repo } = setup();
    const action = { kind: "terminal", command: "echo fixture", shell: "default", spaceId: null, envRefs: { FIXTURE: "safe://old-fixture" } } as const;
    await expect(svc.create({ title: "新规则", trigger: every5, action })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const old = await repo.create("automation-rule", { title: "旧规则", enabled: true, action, trigger: every5, createdAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-10T12:00:00Z" }, "");
    expect(() => svc.activateNonAgent(old.id, "manual")).toThrow("旧规则需要重新配置");
    await expect(svc.setEnabled(old.id, true)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(svc.rule(old.id).data.action).toEqual(action);
    expect(calls).toHaveLength(0);
    expect(svc.runs()).toHaveLength(0);
    const { envRefs: _, ...current } = action;
    const updated = await svc.update(old.id, old.version, { action: current });
    expect(updated.data).toMatchObject({ enabled: false, action: current });
    expect(updated.data.action).not.toHaveProperty("envRefs");
  });

  test("terminal：取消 → 结束终端并记为 cancelled；重启对账：停在 running 的运行按会话真实状态完成", async () => {
    const ctx = setup({ terminal: { stayRunning: true, output: "partial" } });
    const { svc, calls } = ctx;
    const r = await svc.create({ title: "长任务", trigger: every5, action: { kind: "terminal", command: "sleep 100", shell: "default", spaceId: null, envRefs: {} } });
    const p = svc.activateNonAgent(r.id, "manual");
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
    await rec.svc.activateNonAgent(rule.id, "manual"); // 先产生一个 session（sess-1，已结束）
    const stuck = await d.d.repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1", terminalOwner }, "");
    rec.sessions.get("sess-1")!.requestId = `autorun-${stuck.id}`;
    await rec.svc.reconcileTerminals();
    await rec.svc.idle();
    expect(rec.svc.runDetail(stuck.id).data).toMatchObject({ state: "succeeded", exitCode: 0 });
    expect(rec.svc.runDetail(stuck.id).body).toContain("done-after-restart");
  });

  test("重启对账：规则后来被删除，受保护会话仍会移除；丢失 sessionId 时按 requestId 找回", async () => {
    const ctx = setup({ terminal: { exitCode: 0, output: "token=***", hasEnv: true } });
    const { svc, calls } = ctx;
    const rule = await svc.create({ title: "带密钥", trigger: every5, action: { kind: "terminal", command: "echo", shell: "default", spaceId: null } });
    await svc.activateNonAgent(rule.id, "manual");
    calls.length = 0;
    await svc.delete(rule.id); // 规则没了：对账不能再靠规则推断是否带过密钥
    const repo = (svc as unknown as { d: { repo: { create(k: string, d: unknown, b: string): Promise<{ id: string }> } } }).d.repo;
    const stuck = await repo.create("automation-run", { ruleId: rule.id, actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", sessionId: "sess-1", terminalOwner }, "");
    ctx.sessions.get("sess-1")!.requestId = `autorun-${stuck.id}`;
    await svc.reconcileTerminals();
    await svc.idle();
    expect(svc.runDetail(stuck.id).data["state"]).toBe("succeeded");
    expect(calls.some((c) => c.capability === "agent.sessions.release")).toBe(true);
    // sessionId 没写回：运行 id 对应的 requestId（autorun-<id>）能找回会话
    const lost = await repo.create("automation-run", { ruleId: "rule-gone", actionKind: "terminal", trigger: "manual", state: "running", startedAt: "2026-11-10T11:00:00Z", terminalOwner }, "");
    (ctx.svc as unknown as { d: { call: (c: string, i: unknown, k?: string) => Promise<unknown> } }).d.call = async (c) =>
      c === "agent.sessions.list" ? [{ id: "sess-9", requestId: `autorun-${lost.id}`, state: "exited", exitCode: 0, hasEnv: false }] : c === "agent.sessions.output" ? { text: "recovered", complete: true } : {};
    await svc.reconcileTerminals();
    await svc.idle();
    expect(svc.runDetail(lost.id).data).toMatchObject({ state: "succeeded", sessionId: "sess-9" });
    expect(svc.runDetail(lost.id).body).toContain("recovered");
  });
});

test("暂停的终端规则可以手动运行，定时经过时不会创建会话", async () => {
  const { svc, calls } = setup({ terminal: { exitCode: 0 } });
  const rule = await svc.create({ title: "暂停的终端规则", trigger: every5, action: { kind: "terminal", command: "echo local", shell: "default", spaceId: null, envRefs: {} } });
  expect((await svc.activateNonAgent(rule.id, "schedule", new Date("2026-11-10T11:00:00Z"))).summary).toEqual({ state: "paused" });
  expect(calls).toEqual([]);
  expect((await svc.activateNonAgent(rule.id, "manual")).summary).toEqual({ state: "succeeded" });
  expect(calls.filter(({ capability }) => capability === "agent.sessions.launch")).toHaveLength(1);
});

test("原启动的回执丢失时只核对原会话，定时发生重交不会再启动", async () => {
  let disconnected = true;
  const { svc, calls, sessions } = setup({ terminal: { loseReply: true, output: "原命令已完成", unavailable: () => disconnected } });
  const rule = await svc.create({ title: "原终端规则", trigger: every5, action: { kind: "terminal", command: "echo local", shell: "default", spaceId: null, envRefs: {} } });
  await svc.setEnabled(rule.id, true);
  const slot = new Date("2026-11-10T12:00:00Z");
  const first = await svc.activateNonAgent(rule.id, "schedule", slot);
  expect(first.summary).toEqual({ state: "unknown" });
  expect(first.finishedAt).toBeUndefined();
  const run = svc.runs()[0]!;
  expect(svc.runDetail(run.id).data).toMatchObject({ state: "unknown", sessionId: null, finishedAt: null, terminalOwner });
  await svc.reconcileTerminals();
  expect(svc.runDetail(run.id).data["state"]).toBe("unknown");
  expect(await svc.activateNonAgent(rule.id, "schedule", slot)).toEqual(first);
  disconnected = false;
  sessions.set("unrelated", { id: "unrelated", requestId: "other", state: "running", exitCode: null });
  await svc.reconcileTerminals();
  await svc.idle();
  expect(svc.runDetail(run.id)).toMatchObject({ data: { state: "succeeded", sessionId: "sess-1" } });
  expect(svc.runDetail(run.id).body).toContain("原命令已完成");
  expect(await svc.activateNonAgent(rule.id, "schedule", slot)).toMatchObject({ activationId: first.activationId, summary: { state: "succeeded" }, finishedAt: expect.any(String) });
  expect(calls.filter(({ capability }) => capability === "agent.sessions.launch")).toHaveLength(1);
  expect(calls.filter(({ capability }) => capability === "agent.sessions.kill")).toHaveLength(0);
});
