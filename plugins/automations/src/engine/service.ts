import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { errors, newId, type AutomationRuleFrontmatter, type EventPayload, type EventType, type TaskDto } from "@huhu/contracts";
import type { SemanticRepository } from "@huhu/vault";
import { nextRuns, validateSchedule } from "../shared/cron.js";
import { dispatchWindow } from "./dispatch-window.js";
import { classify, type ScanFilter, type SnapshotTask } from "./scan.js";

/** 两个目录是否是同一个目录（macOS 上临时目录 /var 是 /private/var 的符号链接，Windows 上大小写不敏感）：优先比 realpath。 */
export function sameDir(a: string, b: string): boolean {
  const norm = (p: string): string => {
    try {
      return realpathSync.native(p);
    } catch {
      return path.resolve(p);
    }
  };
  const x = norm(a);
  const y = norm(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

export interface TaskQueryLike {
  listAll(): TaskDto[];
  /** 可以派发的 agent 任务：type=agent 且未开始。 */
  listDispatchable(): TaskDto[];
  snapshot(taskId: string): TaskDto;
  agentDispatchBlocker?(task: TaskDto): string | undefined;
}

export interface AutomationsDeps {
  repo: SemanticRepository;
  /** activations/*.ndjson 所在目录。 */
  activationsDir: string;
  taskQuery(): TaskQueryLike | undefined;
  spaceState(spaceId: string): { state: "ok" | "missing" | "inaccessible"; root?: string };
  cliAvailable(provider: string): boolean;
  /** 每次扫描前刷新“有哪些 CLI 可用”（启动时探测的结果会过期：之后才安装的 CLI、启动时探测超时的 CLI）；失败不影响扫描。 */
  refreshClis?(): Promise<void>;
  holds(taskId: string, inputHash: string): boolean;
  /** 默认终端 Space 对应的 Vault 根。 */
  vaultRoot: string;
  call(capability: string, input: unknown, idempotencyKey?: string): Promise<unknown>;
  launchTerminal?(ruleId: string, action: TerminalRuleAction, input: TerminalRuleLaunch, signal: AbortSignal): Promise<{ id: string }>;
  /** 测试用：终端会话轮询间隔（毫秒），缺省 500。 */
  terminalPollMs?: number;
  notify(n: { title: string; module: string }): void;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  zone(): string;
}

type TerminalRuleAction = Extract<AutomationRuleFrontmatter["action"], { kind: "terminal" }>;
type TerminalRuleLaunch = {
  spaceId: string;
  spaceRevision: number;
  provider: "shell";
  command: string;
  shell: TerminalRuleAction["shell"];
  envRefs?: TerminalRuleAction["envRefs"];
  requestId: string;
};

export interface ActivationRecord {
  activationId: string;
  ruleId: string;
  trigger: "schedule" | "manual";
  scheduledFor: string | null;
  startedAt: string;
  finishedAt?: string;
  summary?: { processed: number; skipped: number } | { state: string };
}

const STATE_TEXT: Record<string, string> = { succeeded: "已完成", failed: "失败", cancelled: "已取消", waiting_input: "在等你回答", unknown: "结果无法确认" };
const TERMINAL_TIMEOUT_MS = 10 * 60_000;
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
type RuleData = AutomationRuleFrontmatter;
type TaskScanInput = Extract<Extract<RuleData["action"], { kind: "agent" }>["input"], { source: "tasks" }>;
export type TaskScanRule = {
  id: string;
  version: string;
  body: string;
  data: Omit<RuleData, "action"> & { action: { kind: "agent"; input: TaskScanInput } };
};

export function isTaskScanRule(rule: { data: RuleData }): rule is TaskScanRule {
  return rule.data.action.kind === "agent" && rule.data.action.input.source === "tasks";
}

export const TASK_SCAN_INSTRUCTIONS_LIMIT = 20_000;

function taskScanFilter(input: TaskScanInput, zone: string, now: Date): ScanFilter {
  return {
    tags: input.tags,
    now,
    ...(input.window && { window: dispatchWindow(input.window, zone, now) }),
    includeOverdue: input.includeOverdue ?? false,
    includeUnscheduled: input.includeUnscheduled ?? !input.window,
  };
}

export class AutomationsService {
  private running = new Set<string>();
  private readonly abort = new AbortController();
  /** 每条活动终端规则有自己的取消控制器。 */
  private readonly ruleAbort = new Map<string, AbortController>();

  /** 取消一条正在执行的规则；没有在执行则返回 false。 */
  cancel(ruleId: string): boolean {
    const c = this.ruleAbort.get(ruleId);
    if (!c) return false;
    c.abort();
    return true;
  }

  /** 停用时结束等待。已经创建的终端交给原会话继续。 */
  abortAll(): void {
    this.abort.abort();
  }

  private readonly runAbort = new Map<string, AbortController>();
  private readonly background = new Set<Promise<void>>();

  private terminalSignal(ruleId: string | null, runId: string): AbortSignal {
    const rc = new AbortController();
    this.runAbort.set(runId, rc);
    const rule = ruleId ? this.ruleAbort.get(ruleId) : undefined;
    return rule ? AbortSignal.any([rule.signal, rc.signal]) : rc.signal;
  }

  /** 取消一次运行（结束其 CLI 进程）。没有在跟踪则返回 false。 */
  cancelRun(runId: string): boolean {
    const c = this.runAbort.get(runId);
    if (!c) return false;
    c.abort();
    return true;
  }

  private track(p: Promise<void>): void {
    const q = p.catch(() => undefined).finally(() => this.background.delete(q));
    this.background.add(q);
  }

  /** 等后台里的运行/接管都结束（测试与关闭用）。 */
  async idle(): Promise<void> {
    while (this.background.size > 0) await Promise.all(this.background);
  }

  constructor(private readonly d: AutomationsDeps) {}

  // ---- 规则 ----
  rules(): { id: string; path: string; version: string; body: string; data: RuleData }[] {
    return this.d.repo.list("automation-rule").map((e) => ({ id: e.id, path: e.path, version: e.version, body: e.body.replace(/^\r?\n/, ""), data: e.data as unknown as RuleData }));
  }

  rule(id: string) {
    const r = this.rules().find((x) => x.id === id);
    if (!r) throw errors.notFound(`规则 ${id} 不存在`);
    return r;
  }

  async create(input: { title: string; trigger: RuleData["trigger"]; action: RuleData["action"]; body?: string; missedRunGraceMinutes?: number }) {
    validateSchedule(input.trigger.cron, input.trigger.zone);
    if (input.action.kind === "agent" && input.action.input.source === "tasks" && (input.body?.length ?? 0) > TASK_SCAN_INSTRUCTIONS_LIMIT) {
      throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    }
    const now = iso(this.d.now());
    const e = await this.d.repo.create(
      "automation-rule",
      { title: input.title, enabled: false, trigger: input.trigger, missedRunGraceMinutes: input.missedRunGraceMinutes ?? 30, action: input.action, createdAt: now, updatedAt: now },
      input.body ?? "",
    );
    this.d.publish("entity.changed", { kind: "automation-rule", id: e.id, op: "created" });
    return this.rule(e.id);
  }

  async update(id: string, expectedVersion: string, patch: Partial<Pick<RuleData, "title" | "trigger" | "action" | "missedRunGraceMinutes">>, body?: string) {
    const cur = this.rule(id);
    if (patch.trigger) validateSchedule(patch.trigger.cron, patch.trigger.zone);
    const currentAction = cur.data.action;
    const action = patch.action;
    if (action?.kind === "agent" && action.input.source === "tasks" && currentAction.kind === "agent" && currentAction.input.source === "tasks") {
      patch = { ...patch, action: { ...action, input: { ...currentAction.input, ...action.input } } };
    }
    const next = patch.action ?? cur.data.action;
    if (body !== undefined && body.trim() !== "" && next.kind !== "agent") throw errors.invalidInput("只有 Agent 规则可保存提示词或扫描补充指令");
    if (next.kind === "agent" && next.input.source === "tasks" && (body?.length ?? 0) > TASK_SCAN_INSTRUCTIONS_LIMIT) throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    if (body === undefined && currentAction.kind === "agent" && (next.kind !== "agent" || currentAction.input.source !== next.input.source)) body = "";
    await this.d.repo.patch("automation-rule", id, { ...patch, updatedAt: iso(this.d.now()) }, expectedVersion, body); // body = 规则正文（agent 动作“提示词”输入的提示词；“任务”输入的补充指令）
    this.d.publish("entity.changed", { kind: "automation-rule", id, op: "updated" });
    return this.rule(id);
  }

  async setEnabled(id: string, enabled: boolean) {
    const cur = this.rule(id);
    await this.d.repo.patch("automation-rule", id, { enabled, updatedAt: iso(this.d.now()) }, cur.version);
    this.d.publish("entity.changed", { kind: "automation-rule", id, op: "updated" });
    return this.rule(id);
  }

  async delete(id: string): Promise<void> {
    const cur = this.rule(id);
    await this.d.repo.delete("automation-rule", id, cur.version);
    this.d.publish("entity.changed", { kind: "automation-rule", id, op: "deleted" });
  }

  // ---- 扫描 ----
  /** 只读预览：候选、跳过原因、接下来三次激活时间；不写任何文件。 */
  preview(ruleId: string) {
    const r = this.rule(ruleId);
    const now = this.d.now();
    const next = nextRuns(r.data.trigger.cron, r.data.trigger.zone, 3, now);
    if (!isTaskScanRule(r)) return { next, tasksDisabled: false, candidates: [], skipped: [] };
    const { tasksDisabled, candidates, skipped } = this.classifyTaskScan(r, now);
    return {
      next,
      tasksDisabled,
      candidates: candidates.map((c) => ({ taskId: c.task.id, title: c.task.title, inputRevision: c.task.inputRevision, processingKey: c.processingKey })),
      skipped: skipped.map((s) => ({ taskId: s.task.id, title: s.task.title, reason: s.reason, ...(s.detail ? { detail: s.detail } : {}) })),
    };
  }

  classifyTaskScan(rule: TaskScanRule, now: Date) {
    const query = this.d.taskQuery();
    const targets = { holds: this.d.holds, spaceAccessible: (id: string) => this.d.spaceState(id).state, cliAvailable: this.d.cliAvailable };
    return { tasksDisabled: !query, ...classify(this.allTasks(query), targets, taskScanFilter(rule.data.action.input, rule.data.trigger.zone, now)) };
  }

  async refreshTaskScanTargets(): Promise<void> {
    await this.d.refreshClis?.();
  }

  templateIssue(spaceId: string, provider: string, body: string): string | undefined {
    if (!body.trim()) return "empty-template";
    if (!spaceId.trim()) return "missing-space";
    const { state } = this.d.spaceState(spaceId);
    if (state !== "ok") return state === "missing" ? "missing-space" : "space-inaccessible";
    if (!provider.trim() || !this.d.cliAvailable(provider)) return "cli-missing";
    return undefined;
  }

  private snapshotOf(t: TaskDto): SnapshotTask & { version: string } {
    return {
      id: t.id,
      version: t.version,
      title: t.title,
      type: t.type,
      status: t.status,
      tags: t.tags,
      availableAt: t.availableAt ?? null,
      execution: t.execution ? { spaceId: t.execution.spaceId, provider: t.execution.provider } : null,
      inputRevision: t.inputRevision,
      inputHash: t.inputHash,
      dispatchBlockers: t.dispatchBlockers,
    };
  }

  private allTasks(query: TaskQueryLike | undefined) {
    return (query?.listAll() ?? []).map((task) => {
      const snapshot = this.snapshotOf(task);
      if (!query?.agentDispatchBlocker) return snapshot;
      const blocker = query.agentDispatchBlocker(task);
      return { ...snapshot, dispatchBlockers: blocker ? [blocker] : [], usesExistingSession: task.execution?.target?.mode === "existing" };
    });
  }

  // ---- 激活 ----
  activations(): ActivationRecord[] {
    if (!existsSync(this.d.activationsDir)) return [];
    const byId = new Map<string, ActivationRecord>();
    for (const f of readdirSync(this.d.activationsDir)
      .filter((x) => x.endsWith(".ndjson"))
      .sort()) {
      for (const line of readFileSync(path.join(this.d.activationsDir, f), "utf8").split("\n").filter(Boolean)) {
        try {
          const r = JSON.parse(line) as ActivationRecord;
          byId.set(r.activationId, { ...byId.get(r.activationId), ...r });
        } catch {
          // 崩溃时的半行
        }
      }
    }
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  lastActivatedFor(ruleId: string): Date | null {
    const last = this.activations()
      .filter((a) => a.ruleId === ruleId && a.scheduledFor)
      .sort((a, b) => (b.scheduledFor as string).localeCompare(a.scheduledFor as string))[0];
    return last?.scheduledFor ? new Date(last.scheduledFor) : null;
  }

  private writeActivation(r: ActivationRecord): void {
    mkdirSync(this.d.activationsDir, { recursive: true });
    appendFileSync(path.join(this.d.activationsDir, `${iso(this.d.now()).slice(0, 7)}.ndjson`), JSON.stringify(r) + "\n");
  }

  activateNonAgent(ruleId: string, trigger: "schedule" | "manual", scheduledFor: Date | null = null): Promise<ActivationRecord> {
    const rule = this.rule(ruleId);
    if (rule.data.action.kind === "agent") throw errors.invalidInput("Agent 规则由 Tasks 接受派遣");
    return this.activateRule(rule, trigger, scheduledFor);
  }

  private async activateRule(rule: ReturnType<AutomationsService["rule"]>, trigger: "schedule" | "manual", scheduledFor: Date | null): Promise<ActivationRecord> {
    const ruleId = rule.id;
    // 定时触发只对已启用的规则生效（规则被恢复/外部修改为暂停后，内存里的作业可能还没重建）
    if (trigger === "schedule" && !rule.data.enabled) return { activationId: "skipped", ruleId, trigger, scheduledFor: null, startedAt: iso(this.d.now()), summary: { state: "paused" } };
    if (this.running.has(ruleId)) throw errors.invalidInput("这条规则正在执行");
    this.running.add(ruleId);
    this.ruleAbort.set(ruleId, new AbortController());
    const now = this.d.now();
    const rec: ActivationRecord = { activationId: newId("cap").replace("cap", "act"), ruleId, trigger, scheduledFor: scheduledFor ? iso(scheduledFor) : null, startedAt: iso(now) };
    this.writeActivation(rec);
    this.d.publish("automation.activated", { ruleId, activationId: rec.activationId, trigger });
    try {
      let summary: ActivationRecord["summary"];
      const a = rule.data.action;
      if (a.kind === "terminal") summary = await this.runTerminalAction(rule.id, rule.data.title, a, trigger);
      else if (a.kind === "reminder") summary = await this.runReminderAction(rule.data.title, a);
      else summary = { state: "unsupported" };
      const done = { ...rec, finishedAt: iso(this.d.now()), summary };
      this.writeActivation(done);
      return done;
    } finally {
      this.running.delete(ruleId);
      this.ruleAbort.delete(ruleId);
    }
  }

  /**
   * terminal 动作：在 Space 里以可见的 Herdr 终端会话运行命令（agent-cli 的 `agent.sessions.launch`，由 agent-cli 按平台 shell 构造命令行，见 plugins/agent-cli/src/shared/shell.ts）。
   * 规则环境只在 Engine 交给 Agent CLI 的启动服务。运行记录持有同一终端会话 ID。
   */
  private async runTerminalAction(ruleId: string, ruleTitle: string, a: TerminalRuleAction, trigger: "schedule" | "manual"): Promise<{ state: string }> {
    const run = await this.d.repo.create("automation-run", { ruleId, actionKind: "terminal", trigger, state: "running", startedAt: iso(this.d.now()) }, "");
    const usedEnv = Object.keys(a.envRefs).length > 0;
    const cancel = this.terminalSignal(ruleId, run.id);
    const launchSignal = AbortSignal.any([this.abort.signal, cancel]);
    try {
      const spaces = (await this.d.call("agent.spaces.list", {})) as { id: string; revision: number; root: string }[];
      const space = a.spaceId ? spaces.find((x) => x.id === a.spaceId) : spaces.find((x) => sameDir(x.root, this.d.vaultRoot));
      if (!space) throw errors.invalidInput(a.spaceId ? "Space 不存在或目录不可访问" : "没有以 Vault 根为目录的 Space，请在规则里选择一个 Space");
      const key = `autorun-${run.id}`;
      const input: TerminalRuleLaunch = { spaceId: space.id, spaceRevision: space.revision, provider: "shell", command: a.command, shell: a.shell, ...(usedEnv ? { envRefs: a.envRefs } : {}), requestId: key };
      const sess = this.d.launchTerminal ? await this.d.launchTerminal(ruleId, a, input, launchSignal) : ((await this.d.call("agent.sessions.launch", input, key)) as { id: string });
      const cur = this.d.repo.read("automation-run", run.id);
      await this.d.repo.patch("automation-run", run.id, { sessionId: sess.id }, cur.version);
      return await this.settleTerminalRun(run.id, sess.id, ruleTitle, cancel);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      const msg = typeof code === "string" ? `${code}：${e instanceof Error ? e.message : String(e)}` : e instanceof Error ? e.message : String(e);
      this.d.notify({ title: `自动化「${ruleTitle}」失败：${msg}`, module: "automations" });
      const cur = this.d.repo.read("automation-run", run.id);
      await this.d.repo.patch("automation-run", run.id, { state: "failed", finishedAt: iso(this.d.now()) }, cur.version, `${cur.body}\n## 输出\n\n${msg}\n`);
      this.d.publish("run.stateChanged", { runId: run.id, kind: "automation-run", state: "failed" });
      return { state: "failed" };
    } finally {
      this.runAbort.delete(run.id);
    }
  }

  /** 等终端会话结束（轮询 agent.sessions.list；取消或超时就结束会话），读取脱敏后的输出，写回运行记录。引擎重启后的对账也走这里。 */
  private async settleTerminalRun(runId: string, sessionId: string, ruleTitle: string, signal: AbortSignal): Promise<{ state: string }> {
    const deadline = this.d.now().getTime() + TERMINAL_TIMEOUT_MS;
    type S = { id: string; state: string; exitCode?: number | null; hasEnv?: boolean };
    let sess: S | undefined;
    let killedFor: "cancel" | "timeout" | null = null;
    for (;;) {
      if (this.abort.signal.aborted && !signal.aborted) return { state: "running" }; // 引擎关闭：终端继续运行，下次启动对账
      const list = (await this.d.call("agent.sessions.list", {}).catch(() => null)) as S[] | null;
      sess = list?.find((x) => x.id === sessionId);
      if (!sess || sess.state !== "running") break;
      if (!killedFor && signal.aborted) killedFor = "cancel";
      else if (!killedFor && this.d.now().getTime() > deadline) killedFor = "timeout";
      if (killedFor) await this.d.call("agent.sessions.kill", { id: sessionId }, `autokill-${runId}`).catch(() => undefined);
      await new Promise((r) => setTimeout(r, this.d.terminalPollMs ?? 500));
    }
    let output = "";
    if (sess) {
      try {
        output = ((await this.d.call("agent.sessions.output", { id: sessionId, lines: 200 })) as { text: string }).text;
      } catch {
        output = "（终端输出已不可读）";
      }
    }
    // 带保险箱环境变量的命令：输出读完就移除终端，Herdr 的状态文件里不留秘密值
    if (sess?.hasEnv) await this.d.call("agent.sessions.release", { id: sessionId }, `autorelease-${runId}`).catch(() => undefined);
    const exitCode = sess?.exitCode ?? null;
    const state =
      !sess || sess.state === "unknown" ? "unknown" : killedFor === "cancel" ? "cancelled" : killedFor === "timeout" || sess.state === "failed" ? "failed" : exitCode === 0 ? "succeeded" : exitCode === null ? "unknown" : "failed";
    const note = !sess ? "终端会话记录已不存在，结果无法确认。\n" : killedFor === "timeout" ? `超过 ${TERMINAL_TIMEOUT_MS / 60_000} 分钟，已结束终端。\n` : "";
    const cur = this.d.repo.read("automation-run", runId);
    await this.d.repo.patch("automation-run", runId, { state, finishedAt: iso(this.d.now()), exitCode }, cur.version, `${cur.body}\n## 输出\n\n${note}${output}\n`);
    this.d.publish("run.stateChanged", { runId, kind: "automation-run", state });
    if (state === "failed" || state === "unknown") this.d.notify({ title: `自动化「${ruleTitle}」${STATE_TEXT[state] ?? state}`, module: "automations" });
    return { state };
  }

  /** reminder 动作：发站内通知，或新建一个人工任务（引用可选的关联任务），或两者都做。 */
  private async runReminderAction(ruleTitle: string, a: { mode: "notification" | "task" | "both"; text: string; taskId: string | null }): Promise<{ state: string }> {
    const ref = a.taskId ? `\n\n相关任务：[[${this.taskPath(a.taskId) ?? a.taskId}]]` : "";
    if (a.mode === "notification" || a.mode === "both") this.d.notify({ title: a.text, module: a.taskId ? "tasks" : "automations" });
    if (a.mode === "task" || a.mode === "both") {
      try {
        await this.d.call("tasks.create", { title: a.text.slice(0, 200), type: "human", body: `${a.text}${ref}\n\n（由自动化「${ruleTitle}」创建）` }, newId("cap"));
      } catch (e) {
        this.d.notify({ title: `自动化「${ruleTitle}」创建任务失败：${e instanceof Error ? e.message : String(e)}`, module: "automations" });
        return { state: "failed" };
      }
    }
    return { state: "succeeded" };
  }

  private taskPath(taskId: string): string | null {
    try {
      return this.d.taskQuery()?.snapshot(taskId).path ?? null;
    } catch {
      return null;
    }
  }

  async reconcileTerminals(): Promise<void> {
    for (const r of this.d.repo.list("automation-run")) {
      const td = r.data as unknown as { actionKind: string; state: string; ruleId: string; sessionId: string | null };
      if (td.actionKind !== "terminal" || td.state !== "running" || this.runAbort.has(r.id)) continue;
      const title = this.rules().find((x) => x.id === td.ruleId)?.data.title ?? "终端命令";
      let sessionId = td.sessionId;
      if (!sessionId) {
        // 会话启动成功、sessionId 还没写回运行记录就中断了：按 requestId（autorun-<运行 id>）从 agent-cli 找回，别留下没人清理的终端
        const list = (await this.d.call("agent.sessions.list", {}).catch(() => null)) as { id: string; requestId: string }[] | null;
        sessionId = list?.find((x) => x.requestId === `autorun-${r.id}`)?.id ?? null;
        if (sessionId) {
          const cur = this.d.repo.read("automation-run", r.id);
          await this.d.repo.patch("automation-run", r.id, { sessionId }, cur.version).catch(() => undefined);
        }
      }
      if (!sessionId) {
        const cur = this.d.repo.read("automation-run", r.id);
        await this.d.repo.patch("automation-run", r.id, { state: "unknown", finishedAt: iso(this.d.now()) }, cur.version, `${cur.body}\n## 输出\n\n没有留下终端会话，结果无法确认。\n`).catch(() => undefined);
        continue;
      }
      this.track(
        this.settleTerminalRun(r.id, sessionId, title, this.terminalSignal(null, r.id))
          .then(() => undefined)
          .finally(() => this.runAbort.delete(r.id)),
      );
    }
  }

  runs(limit = 200) {
    const titles = new Map(this.rules().map(({ id, data }) => [id, data.title]));
    return this.d.repo
      .list("automation-run")
      .filter(({ data }) => data["actionKind"] === "terminal")
      .map(({ id, data }) => {
        const { ruleId, state, startedAt, finishedAt } = data as unknown as { ruleId: string; state: string; startedAt: string | null; finishedAt: string | null };
        return { id, kind: "automation-run" as const, state, title: titles.get(ruleId) ?? ruleId, startedAt, finishedAt, live: this.runAbort.has(id) };
      })
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
      .slice(0, limit);
  }

  runDetail(runId: string) {
    if (!/^arun-[0-9a-z]+$/.test(runId)) throw errors.notFound(`终端运行 ${runId} 不存在`);
    const { id, version, body, data } = this.d.repo.read("automation-run", runId);
    const ruleId = String(data["ruleId"]);
    if (data["actionKind"] !== "terminal") throw errors.notFound(`终端运行 ${runId} 不存在`);
    const title = this.rules().find((rule) => rule.id === ruleId)?.data.title ?? ruleId;
    return { id, kind: "automation-run" as const, version, body, data, title, live: this.runAbort.has(id) };
  }
}
