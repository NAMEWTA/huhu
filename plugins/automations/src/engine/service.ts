import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { errors, isHuhuError, newId, type AutomationRuleFrontmatter, type AutomationRunFrontmatter, type EventPayload, type EventType, type TaskDto } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { VaultFiles, type Entity, type SemanticRepository } from "@huhu/vault";
import { z } from "zod";
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
  terminalOwner: string | null;
  call(capability: string, input: unknown, idempotencyKey?: string): Promise<unknown>;
  launchTerminal?(ruleId: string, action: TerminalRuleAction, input: TerminalRuleLaunch, signal: AbortSignal, expectedEnvironmentRevision: string | null): Promise<{ id: string }>;
  /** 测试用：终端会话轮询间隔（毫秒），缺省 500。 */
  terminalPollMs?: number;
  notify(n: { title: string; module: string }): void;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  zone(): string;
}

type TerminalRuleAction = Extract<AutomationRuleFrontmatter["action"], { kind: "terminal" }>;
export type TerminalRuleLaunch = {
  spaceId: string;
  spaceRevision: number;
  provider: "shell";
  command: string;
  shell: TerminalRuleAction["shell"];
  requestId: string;
};
export type ApprovedTerminalReceipt = {
  runId: string;
  activationId: string;
  state: string;
  startedAt: string;
  finishedAt: string | null;
};
type ApprovedTerminalPlan = {
  intent: string;
  target: Omit<TerminalRuleLaunch, "requestId">;
  fingerprint: string;
  validate(): void;
  launch(input: TerminalRuleLaunch, signal: AbortSignal, onPending: (completion: Promise<{ id: string }>) => void): Promise<{ id: string }>;
};
type TerminalSession = { id: string; requestId: string; state: string; exitCode?: number | null; hasEnv?: boolean };
type TerminalReservation = { run: Entity; input?: TerminalRuleLaunch; created: boolean };
const terminalRequestId = (runId: string) => `autorun-${runId}`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const errorCode = (error: unknown) => (error as { code?: unknown } | null)?.code;
const errorMessage = (error: unknown) => {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return typeof code === "string" ? `${code}：${message}` : message;
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
type RulePatch = { [K in "title" | "trigger" | "action" | "missedRunGraceMinutes"]?: RuleData[K] | undefined };
export function hasLegacyTerminalEnvironment(action: RuleData["action"]): boolean {
  return action.kind === "terminal" && Object.keys(action.envRefs ?? {}).length > 0;
}

function actionForWrite(action: RuleData["action"]): RuleData["action"] {
  if (action.kind !== "terminal") return action;
  if (hasLegacyTerminalEnvironment(action)) throw errors.invalidInput("规则环境请在此规则的受保护配置中设置");
  const { envRefs: _, ...current } = action;
  return current;
}
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
  private readonly abort = new AbortController();
  /** 活动规则的互斥和取消控制器。 */
  private readonly ruleAbort = new Map<string, AbortController>();
  private ruleChanges: Promise<unknown> = Promise.resolve();

  /** 取消一条正在执行的规则；没有在执行则返回 false。 */
  cancel(ruleId: string): boolean {
    const c = this.ruleAbort.get(ruleId);
    if (!c) return false;
    c.abort();
    return true;
  }

  assertRuleRun(ruleId: string, runId: string, activationId: string): void {
    const { data } = this.runDetail(runId);
    if (!this.d.terminalOwner || data["terminalOwner"] !== this.d.terminalOwner || data["ruleId"] !== ruleId || data["activationId"] !== activationId) {
      throw errors.notFound("没有这次规则运行");
    }
  }

  /** 停用时结束等待。已经创建的终端交给原会话继续。 */
  abortAll(): void {
    this.abort.abort();
  }

  private readonly runAbort = new Map<string, AbortController>();
  private readonly approvedForeground = new Map<string, Promise<ApprovedTerminalReceipt>>();
  private readonly pendingTerminalRuns = new Map<string, Promise<TerminalReservation>>();
  private readonly background = new Set<Promise<void>>();
  private reconciling: Promise<void> | undefined;

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

  /** 把规则自身的变更、桌面批准和外部受理放在同一顺序中。 */
  withRuleConfiguration<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.ruleChanges.then(operation);
    this.ruleChanges = next.catch(() => undefined);
    return next;
  }

  // ---- 规则 ----
  rules(): { id: string; path: string; version: string; body: string; data: RuleData }[] {
    return this.d.repo.list("automation-rule").map((e) => ({ id: e.id, path: e.path, version: e.version, body: e.body.replace(/^\r?\n/, ""), data: e.data as unknown as RuleData }));
  }

  rule(id: string) {
    const r = this.rules().find((x) => x.id === id);
    if (!r) throw errors.notFound(`规则 ${id} 不存在`);
    return r;
  }

  async create(input: { title: string; trigger: RuleData["trigger"]; action: RuleData["action"]; body?: string | undefined; missedRunGraceMinutes?: number | undefined }) {
    validateSchedule(input.trigger.cron, input.trigger.zone);
    if (input.action.kind === "agent" && input.action.input.source === "tasks" && (input.body?.length ?? 0) > TASK_SCAN_INSTRUCTIONS_LIMIT) {
      throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    }
    const now = iso(this.d.now());
    const e = await this.d.repo.create(
      "automation-rule",
      { title: input.title, enabled: false, trigger: input.trigger, missedRunGraceMinutes: input.missedRunGraceMinutes ?? 30, action: actionForWrite(input.action), createdAt: now, updatedAt: now },
      input.body ?? "",
    );
    this.d.publish("entity.changed", { kind: "automation-rule", id: e.id, op: "created" });
    return this.rule(e.id);
  }

  async update(id: string, expectedVersion: string, patch: RulePatch, body?: string, authorize?: (rule: { data: RuleData }) => void) {
    return this.withRuleConfiguration(async () => {
      const cur = this.rule(id);
      authorize?.(cur);
      if (expectedVersion !== cur.version) throw errors.versionConflict(cur.version);
      return this.updateRule(cur, patch, body);
    });
  }

  private async updateRule(cur: ReturnType<AutomationsService["rule"]>, patch: RulePatch, body?: string) {
    const { id, version: expectedVersion } = cur;
    if (patch.trigger) validateSchedule(patch.trigger.cron, patch.trigger.zone);
    const currentAction = cur.data.action;
    const action = patch.action;
    if (action) patch = { ...patch, action: actionForWrite(action) };
    if (action?.kind === "agent" && action.input.source === "tasks" && currentAction.kind === "agent" && currentAction.input.source === "tasks") {
      patch = { ...patch, action: { ...action, input: { ...currentAction.input, ...action.input } } };
    }
    const next = patch.action ?? cur.data.action;
    if (body !== undefined && body.trim() !== "" && next.kind !== "agent") throw errors.invalidInput("只有 Agent 规则可保存提示词或扫描补充指令");
    if (next.kind === "agent" && next.input.source === "tasks" && (body?.length ?? 0) > TASK_SCAN_INSTRUCTIONS_LIMIT) throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    if (body === undefined && currentAction.kind === "agent" && (next.kind !== "agent" || currentAction.input.source !== next.input.source)) body = "";
    const replacingLegacy = action && hasLegacyTerminalEnvironment(currentAction);
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    await this.d.repo.patch("automation-rule", id, { ...changes, ...(replacingLegacy && { enabled: false }), updatedAt: iso(this.d.now()) }, expectedVersion, body); // body = 规则正文（agent 动作“提示词”输入的提示词；“任务”输入的补充指令）
    this.d.publish("entity.changed", { kind: "automation-rule", id, op: "updated" });
    return this.rule(id);
  }

  async setEnabled(id: string, enabled: boolean, authorizeEnable?: (action: RuleData["action"]) => void, expectedVersion?: string) {
    return this.withRuleConfiguration(async () => {
      const cur = this.rule(id);
      if (expectedVersion !== undefined && expectedVersion !== cur.version) throw errors.versionConflict(cur.version);
      if (enabled) {
        authorizeEnable?.(cur.data.action);
        if (hasLegacyTerminalEnvironment(cur.data.action)) throw errors.invalidInput("请先在规则中配置受保护环境");
      }
      await this.d.repo.patch("automation-rule", id, { enabled, updatedAt: iso(this.d.now()) }, cur.version);
      this.d.publish("entity.changed", { kind: "automation-rule", id, op: "updated" });
      return this.rule(id);
    });
  }

  async delete(id: string, expectedVersion?: string): Promise<void> {
    await this.withRuleConfiguration(async () => {
      const cur = this.rule(id);
      if (expectedVersion !== undefined && expectedVersion !== cur.version) throw errors.versionConflict(cur.version);
      await this.d.repo.delete("automation-rule", id, cur.version);
      this.d.publish("entity.changed", { kind: "automation-rule", id, op: "deleted" });
    });
  }

  // ---- 扫描 ----
  /** 只读预览：候选、跳过原因、接下来三次激活时间；不写任何文件。 */
  preview(ruleId: string, expectedVersion?: string) {
    const r = this.rule(ruleId);
    if (expectedVersion !== undefined && expectedVersion !== r.version) throw errors.versionConflict(r.version);
    const now = this.d.now();
    const next = nextRuns(r.data.trigger.cron, r.data.trigger.zone, 3, now);
    if (!isTaskScanRule(r)) return { ruleVersion: r.version, next, tasksDisabled: false, candidates: [], skipped: [] };
    const { tasksDisabled, candidates, skipped } = this.classifyTaskScan(r, now);
    return {
      ruleVersion: r.version,
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
    const byId = new Map<string, ActivationRecord>();
    if (existsSync(this.d.activationsDir)) {
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
    }
    for (const run of this.d.repo.list("automation-run")) {
      const id = run.data["activationId"];
      const activation = this.terminalActivation(run, typeof id === "string" ? byId.get(id) : undefined);
      if (activation) byId.set(activation.activationId, activation);
    }
    const shallow = [...byId.values()].filter((row) => row.trigger === "schedule" && !row.finishedAt && !row.summary);
    if (shallow.length) {
      const terminalRules = new Set(
        this.rules()
          .filter(({ data }) => data.action.kind === "terminal")
          .map(({ id }) => id),
      );
      for (const row of shallow) {
        if (terminalRules.has(row.ruleId)) byId.set(row.activationId, { ...row, summary: { state: "unknown" } });
      }
    }
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  private terminalActivation(run: Entity, legacy?: ActivationRecord): ActivationRecord | undefined {
    const data = run.data as unknown as AutomationRunFrontmatter;
    const { activationId, ruleId, trigger, scheduledFor, startedAt, finishedAt } = data;
    if (data.actionKind !== "terminal" || typeof activationId !== "string" || typeof data.state !== "string") return undefined;
    const result = { ...(typeof finishedAt === "string" ? { finishedAt } : {}), summary: { state: this.terminalState(data) } };
    if (legacy && legacy.ruleId === ruleId) {
      const { finishedAt: _, ...base } = legacy;
      return { ...base, ...result };
    }
    if (typeof startedAt !== "string" || typeof ruleId !== "string" || (trigger !== "schedule" && trigger !== "manual")) return undefined;
    return { activationId, ruleId, trigger, scheduledFor: typeof scheduledFor === "string" ? scheduledFor : null, startedAt, ...result };
  }

  private terminalState(data: Pick<AutomationRunFrontmatter, "state" | "finishedAt" | "terminalOwner">): string {
    return !data.finishedAt && data.terminalOwner !== this.d.terminalOwner ? "unknown" : data.state;
  }

  lastActivatedFor(ruleId: string): Date | null {
    const last = this.activations()
      .filter((a) => a.ruleId === ruleId && a.scheduledFor)
      .sort((a, b) => (b.scheduledFor as string).localeCompare(a.scheduledFor as string))[0];
    if (last?.scheduledFor) return new Date(last.scheduledFor);
    const rule = this.rules().find(({ id }) => id === ruleId)?.data;
    if (rule?.action.kind !== "terminal" || !rule.enabled) return null;
    // 首个计划点还没有运行时，调度器从启用/编辑时间起按现有宽限补交。
    const earliest = this.d.now().getTime() - rule.missedRunGraceMinutes * 60_000 - 1;
    return new Date(Math.max(earliest, Date.parse(rule.updatedAt)));
  }

  private writeActivation(r: ActivationRecord): void {
    mkdirSync(this.d.activationsDir, { recursive: true });
    appendFileSync(path.join(this.d.activationsDir, `${iso(this.d.now()).slice(0, 7)}.ndjson`), JSON.stringify(r) + "\n");
  }

  activateNonAgent(ruleId: string, trigger: "schedule" | "manual", scheduledFor: Date | null = null): Promise<ActivationRecord> {
    const rule = this.rule(ruleId);
    if (rule.data.action.kind === "agent") throw errors.invalidInput("Agent 规则由 Tasks 接受派遣");
    if (hasLegacyTerminalEnvironment(rule.data.action)) throw errors.invalidInput("旧规则需要重新配置受保护环境");
    return this.activateRule(rule, trigger, scheduledFor);
  }

  private async activateRule(rule: ReturnType<AutomationsService["rule"]>, trigger: "schedule" | "manual", scheduledFor: Date | null): Promise<ActivationRecord> {
    const ruleId = rule.id;
    // 定时触发只对已启用的规则生效（规则被恢复/外部修改为暂停后，内存里的作业可能还没重建）
    if (trigger === "schedule" && !rule.data.enabled) return { activationId: "skipped", ruleId, trigger, scheduledFor: null, startedAt: iso(this.d.now()), summary: { state: "paused" } };
    const slot = scheduledFor ? iso(scheduledFor) : null;
    const a = rule.data.action;
    if (trigger === "schedule" && slot && a.kind === "terminal") return this.activateScheduledTerminal(rule, a, slot);
    return this.withRule(ruleId, async () => {
      const rec: ActivationRecord = { activationId: newId("cap").replace("cap", "act"), ruleId, trigger, scheduledFor: slot, startedAt: iso(this.d.now()) };
      this.writeActivation(rec);
      this.d.publish("automation.activated", { ruleId, activationId: rec.activationId, trigger });
      let summary: ActivationRecord["summary"];
      if (a.kind === "terminal") {
        let revision: string | null = null;
        let failure = "";
        try {
          revision = this.terminalEnvironment(ruleId)?.revision ?? null;
        } catch {
          failure = "无法冻结规则的受保护环境修订。";
        }
        const run = await this.createTerminalRun(rec, { failure });
        summary = failure ? { state: "failed" } : await this.runTerminalAction(run, rule.data.title, a, undefined, revision);
      } else if (a.kind === "reminder") summary = await this.runReminderAction(rule.data.title, a);
      else summary = { state: "unsupported" };
      const pending = "state" in summary && (summary.state === "running" || summary.state === "unknown");
      const done = { ...rec, ...(pending ? {} : { finishedAt: iso(this.d.now()) }), summary };
      this.writeActivation(done);
      return done;
    });
  }

  private claimRule(ruleId: string): () => void {
    if (this.ruleAbort.has(ruleId)) throw errors.invalidInput("这条规则正在执行");
    const owner = new AbortController();
    this.ruleAbort.set(ruleId, owner);
    return () => {
      if (this.ruleAbort.get(ruleId) === owner) this.ruleAbort.delete(ruleId);
    };
  }

  private async withRule<T>(ruleId: string, operation: () => Promise<T>): Promise<T> {
    const release = this.claimRule(ruleId);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async activateScheduledTerminal(rule: ReturnType<AutomationsService["rule"]>, action: TerminalRuleAction, slot: string): Promise<ActivationRecord> {
    const ruleId = rule.id;
    const previous = this.activations().find((row) => row.ruleId === ruleId && row.trigger === "schedule" && row.scheduledFor === slot);
    if (previous) return previous;
    const occurrence = hash([ruleId, slot]).slice(0, 32);
    const runId = `arun-${occurrence}`;
    const pending = this.pendingTerminalRuns.get(runId);
    if (pending) {
      await pending;
      return this.terminalActivation(this.d.repo.read("automation-run", runId))!;
    }
    return this.withRule(ruleId, async () => {
      const rec: ActivationRecord = { activationId: `act-${occurrence}`, ruleId, trigger: "schedule", scheduledFor: slot, startedAt: iso(this.d.now()) };
      const reservation = this.reserveTerminalRun(rule, action, rec, runId);
      this.pendingTerminalRuns.set(runId, reservation);
      const { run, input, created } = await reservation.finally(() => this.pendingTerminalRuns.delete(runId));
      if (created) {
        this.d.publish("automation.activated", { ruleId, activationId: rec.activationId, trigger: rec.trigger });
        if (input) await this.runTerminalAction(run, rule.data.title, action, input);
        else this.d.notify({ title: `自动化「${rule.data.title}」失败：${run.body.trim()}`, module: "automations" });
      }
      return this.terminalActivation(this.d.repo.read("automation-run", run.id))!;
    });
  }

  private async reserveTerminalRun(rule: ReturnType<AutomationsService["rule"]>, action: TerminalRuleAction, rec: ActivationRecord, runId: string): Promise<TerminalReservation> {
    let input: TerminalRuleLaunch | undefined;
    let launch: AutomationRunFrontmatter["terminalLaunch"];
    let failure = "";
    try {
      const target = await this.terminalInput(action, runId);
      launch = { fingerprint: this.terminalFingerprint(rule.version, target, this.terminalEnvironment(rule.id)), submittedAt: null };
      input = target;
    } catch (error) {
      failure = errorMessage(error) || "无法核对启动配置。";
    }
    try {
      const run = await this.createTerminalRun(rec, { runId, ...(launch && { terminalLaunch: launch }), failure });
      return { run, ...(input && { input }), created: true };
    } catch (error) {
      if (errorCode(error) !== "NAME_CONFLICT") throw error;
      const run = this.d.repo.read("automation-run", runId);
      if (run.data["ruleId"] !== rec.ruleId || run.data["scheduledFor"] !== rec.scheduledFor || !this.terminalActivation(run)) throw error;
      return { run, created: false };
    }
  }

  private createTerminalRun(rec: ActivationRecord, { runId, terminalLaunch, failure = "", terminalIntent }: { runId?: string; terminalLaunch?: AutomationRunFrontmatter["terminalLaunch"]; failure?: string; terminalIntent?: string } = {}) {
    const { terminalOwner } = this.d;
    if (!terminalOwner) throw errors.invalidInput("无法确认终端规则的本机归属");
    const { activationId, ruleId, trigger, scheduledFor, startedAt } = rec;
    return this.d.repo.create(
      "automation-run",
      {
        activationId,
        ruleId,
        actionKind: "terminal",
        trigger,
        scheduledFor,
        startedAt,
        terminalOwner,
        ...(terminalLaunch && { terminalLaunch }),
        ...(terminalIntent && { terminalIntent }),
        ...(failure ? { state: "failed", finishedAt: iso(this.d.now()) } : { state: "running" }),
      },
      failure,
      runId,
    );
  }

  private async markTerminalSubmission(run: Entity, fingerprint: string): Promise<string> {
    const submittedAt = iso(this.d.now());
    await this.d.repo.patch("automation-run", run.id, { terminalLaunch: { fingerprint, submittedAt } }, run.version);
    return submittedAt;
  }

  /** Admit under the configuration queue; host verification and settlement can wait outside it. */
  async invokeApprovedTerminal(ruleId: string, intentId: string, prepare: () => ApprovedTerminalPlan): Promise<ApprovedTerminalReceipt> {
    const identity = hash(["external-terminal", intentId]).slice(0, 32);
    const runId = `arun-${identity}`;
    const receipt = (run: Entity, intent: string): ApprovedTerminalReceipt => {
      const data = run.data as unknown as AutomationRunFrontmatter;
      if (!this.d.terminalOwner || data.terminalOwner !== this.d.terminalOwner) throw errors.permissionDenied("外部运行必须属于当前本机 Vault");
      if (data.actionKind !== "terminal" || data.ruleId !== ruleId || data.terminalIntent !== intent || !data.activationId || !data.startedAt) throw errors.idempotencyMismatch();
      return { runId, activationId: data.activationId, state: data.state, startedAt: data.startedAt, finishedAt: data.finishedAt };
    };
    const accepted = await this.withRuleConfiguration(async () => {
      const plan = prepare();
      const previous = this.d.repo.list("automation-run").find(({ id }) => id === runId);
      if (previous) return { reply: receipt(previous, plan.intent), foreground: this.approvedForeground.get(runId) };
      this.abort.signal.throwIfAborted();
      plan.validate();
      const title = this.rule(ruleId).data.title;
      const release = this.claimRule(ruleId);
      try {
        const activationId = `act-${identity}`;
        const rec: ActivationRecord = { ruleId, activationId, trigger: "manual", scheduledFor: null, startedAt: iso(this.d.now()) };
        const run = await this.createTerminalRun(rec, { runId, terminalLaunch: { fingerprint: plan.fingerprint, submittedAt: null }, terminalIntent: plan.intent });
        this.d.publish("automation.activated", { ruleId, activationId, trigger: "manual" });
        const cancel = this.terminalSignal(ruleId, runId);
        const submittedAt = await this.markTerminalSubmission(run, plan.fingerprint);
        let resolveForeground!: (result: ApprovedTerminalReceipt) => void;
        let rejectForeground!: (error: unknown) => void;
        const promise = new Promise<ApprovedTerminalReceipt>((resolve, reject) => {
          resolveForeground = resolve;
          rejectForeground = reject;
        });
        const foreground = { resolve: resolveForeground, reject: rejectForeground };
        void promise.catch(() => undefined);
        this.approvedForeground.set(runId, promise);
        return { plan, submittedAt, title, cancel, release, foreground };
      } catch (error) {
        this.runAbort.delete(runId);
        release();
        throw error;
      }
    });
    if ("reply" in accepted && accepted.reply) return accepted.foreground ?? accepted.reply;

    const { plan, submittedAt, title, cancel, release, foreground } = accepted;
    const signal = AbortSignal.any([cancel, this.abort.signal]);
    const settle = async ({ id: sessionId }: { id: string }) => {
      if (this.abort.signal.aborted) return;
      const current = this.d.repo.read("automation-run", runId);
      if (current.data["finishedAt"] || current.data["terminalOwner"] !== this.d.terminalOwner || current.data["terminalIntent"] !== plan.intent || (current.data["sessionId"] && current.data["sessionId"] !== sessionId)) return;
      if (current.data["sessionId"] !== sessionId) await this.d.repo.patch("automation-run", runId, { sessionId }, current.version);
      await this.settleTerminalRun(runId, sessionId, submittedAt, title, cancel);
    };
    const settleCancellation = async (error: unknown) => {
      if (!isHuhuError(error) || error.code !== "INVALID_INPUT" || error.details?.["reason"] !== "native_cancelled_before_start" || error.details["requestId"] !== terminalRequestId(runId)) return false;
      const sessionId = error.details["sessionId"];
      const cleanup = error.details["cleanupRequired"];
      if (typeof sessionId !== "string" || typeof cleanup !== "boolean") return false;
      if (this.abort.signal.aborted) return true;
      const current = this.d.repo.read("automation-run", runId);
      if (current.data["finishedAt"] || current.data["terminalOwner"] !== this.d.terminalOwner || current.data["terminalIntent"] !== plan.intent || (current.data["sessionId"] && current.data["sessionId"] !== sessionId)) return true;
      await this.finishTerminalRun(runId, "cancelled", error.message, { sessionId, ...(cleanup && { terminalReleasePending: true }) });
      if (cleanup) this.track(this.releaseTerminal(runId, sessionId));
      return true;
    };
    let completion: Promise<{ id: string }> | undefined;
    let settling = false;
    let submitted = false;
    try {
      try {
        plan.validate();
        signal.throwIfAborted();
        submitted = true;
        const session = await plan.launch({ ...plan.target, requestId: terminalRequestId(runId) }, signal, (pending) => {
          completion = pending;
        });
        settling = true;
        this.track(settle(session).finally(() => this.runAbort.delete(runId)));
      } catch (error) {
        if (!this.abort.signal.aborted) {
          if (!submitted) {
            await this.finishTerminalRun(runId, cancel.aborted ? "cancelled" : "failed", "已批准的终端命令未提交。");
          } else if (isHuhuError(error) && error.code === "SPACE_INVALID" && error.details?.["reason"] === "approved_directory_changed") {
            await this.finishTerminalRun(runId, "failed", error.message);
          } else if (!(await settleCancellation(error))) {
            await this.terminalPending(runId, "核对原启动及终端状态。");
          }
        }
        if (completion) {
          settling = true;
          this.track(
            completion
              .then(settle, async (error) => {
                if (!(await settleCancellation(error))) throw error;
              })
              .finally(async () => {
                this.runAbort.delete(runId);
                if (!this.abort.signal.aborted) await this.reconcileTerminals();
              }),
          );
        }
      }
      const result = receipt(this.d.repo.read("automation-run", runId), plan.intent);
      foreground.resolve(result);
      return result;
    } catch (error) {
      foreground.reject(error);
      throw error;
    } finally {
      this.approvedForeground.delete(runId);
      release();
      if (!settling) this.runAbort.delete(runId);
    }
  }

  private async terminalInput(action: TerminalRuleAction, runId: string): Promise<TerminalRuleLaunch> {
    const spaces = (await this.d.call("agent.spaces.list", {})) as { id: string; revision: number; root: string }[];
    const space = action.spaceId ? spaces.find((x) => x.id === action.spaceId) : spaces.find((x) => sameDir(x.root, this.d.vaultRoot));
    if (!space) throw errors.invalidInput(action.spaceId ? "Space 不存在或目录不可访问" : "没有以 Vault 根为目录的 Space，请在规则里选择一个 Space");
    return { spaceId: space.id, spaceRevision: space.revision, provider: "shell", command: action.command, shell: action.shell, requestId: terminalRequestId(runId) };
  }

  private terminalEnvironment(ruleId: string) {
    const files = new VaultFiles(this.d.vaultRoot, undefined, true);
    return ModuleCredentials.readPortableDefinition(files, "automations", z.unknown(), ruleId);
  }

  private terminalFingerprint(ruleVersion: string, input: TerminalRuleLaunch, environment: unknown): string {
    return hash([ruleVersion, input.spaceId, input.spaceRevision, environment ?? null]);
  }

  private matchingEnvironmentRevision(ruleId: string, input: TerminalRuleLaunch, fingerprint: string): string | null | undefined {
    try {
      const rule = this.rule(ruleId);
      if (!rule.data.enabled || rule.data.action.kind !== "terminal" || hasLegacyTerminalEnvironment(rule.data.action)) return undefined;
      const environment = this.terminalEnvironment(ruleId);
      if (this.terminalFingerprint(rule.version, input, environment) === fingerprint) return environment?.revision ?? null;
    } catch {
      return undefined;
    }
    return undefined;
  }

  /**
   * terminal 动作：在 Space 里以可见的 Herdr 终端会话运行命令（agent-cli 的 `agent.sessions.launch`，由 agent-cli 按平台 shell 构造命令行，见 plugins/agent-cli/src/shared/shell.ts）。
   * 规则环境只在 Engine 交给 Agent CLI 的启动服务。运行记录持有同一终端会话 ID。
   */
  private async runTerminalAction(run: Entity, ruleTitle: string, action: TerminalRuleAction, preparedInput?: TerminalRuleLaunch, expectedEnvironmentRevision: string | null = null): Promise<{ state: string }> {
    const { ruleId, startedAt, terminalLaunch } = run.data as unknown as AutomationRunFrontmatter;
    const cancel = this.terminalSignal(ruleId, run.id);
    const launchSignal = AbortSignal.any([this.abort.signal, cancel]);
    let submittedAt = startedAt;
    let attempted = false;
    let accepted = false;
    try {
      let input: TerminalRuleLaunch;
      try {
        input = preparedInput ?? (await this.terminalInput(action, run.id));
      } catch (error) {
        if (terminalLaunch) return await this.terminalPending(run.id, "原计划未提交，当前无法核对原启动配置。", run.version);
        throw error;
      }
      if (terminalLaunch) {
        if (this.abort.signal.aborted) return { state: "running" };
        if (cancel.aborted) return await this.finishTerminalRun(run.id, "cancelled", "提交前已取消。");
        const revision = this.matchingEnvironmentRevision(ruleId, input, terminalLaunch.fingerprint);
        if (revision === undefined) {
          return await this.terminalPending(run.id, "原计划未提交，规则或启动配置已变化，需人工核对。", run.version);
        }
        expectedEnvironmentRevision = revision;
        // 先持久化可能提交的边界。即使下一行尚未调用 Core，重启后也只能核对原请求。
        try {
          submittedAt = await this.markTerminalSubmission(run, terminalLaunch.fingerprint);
        } catch (error) {
          if (errorCode(error) === "VERSION_CONFLICT") return { state: String(this.d.repo.read("automation-run", run.id).data["state"]) };
          throw error;
        }
        if (this.abort.signal.aborted) return { state: "running" };
        if (cancel.aborted) return await this.finishTerminalRun(run.id, "cancelled", "提交前已取消。");
        if (this.matchingEnvironmentRevision(ruleId, input, terminalLaunch.fingerprint) !== expectedEnvironmentRevision) {
          return await this.terminalPending(run.id, "规则或启动配置在提交前已变化，需人工核对。");
        }
      }
      attempted = true;
      const sess = this.d.launchTerminal ? await this.d.launchTerminal(ruleId, action, input, launchSignal, expectedEnvironmentRevision) : ((await this.d.call("agent.sessions.launch", input, input.requestId)) as { id: string });
      accepted = true;
      const cur = this.d.repo.read("automation-run", run.id);
      await this.d.repo.patch("automation-run", run.id, { sessionId: sess.id }, cur.version);
      return await this.settleTerminalRun(run.id, sess.id, submittedAt, ruleTitle, cancel);
    } catch (e) {
      if (this.abort.signal.aborted) return { state: "running" };
      // 写入阶段出错时交给重启读取持久状态，避免覆盖可能已经落盘的提交记录。
      if (terminalLaunch && !attempted) throw e;
      const code = errorCode(e);
      // 受保护环境会把回调中的启动错误折叠成 operation-failed，其中也可能有丢失的 ACK。
      const uncertain = terminalLaunch && (!isHuhuError(e) || e.details?.["reason"] === "operation-failed");
      if (accepted || code === "RUN_UNKNOWN" || code === "WRITE_PARTIAL" || code === "INTERNAL" || uncertain) {
        return await this.terminalPending(run.id, "正在核对原启动及终端状态。");
      }
      const msg = errorMessage(e);
      this.d.notify({ title: `自动化「${ruleTitle}」失败：${msg}`, module: "automations" });
      return await this.finishTerminalRun(run.id, "failed", msg);
    } finally {
      this.runAbort.delete(run.id);
    }
  }

  private async finishTerminalRun(runId: string, state: "failed" | "cancelled", message: string, terminal?: { sessionId: string; terminalReleasePending?: true }): Promise<{ state: string }> {
    const cur = this.d.repo.read("automation-run", runId);
    await this.d.repo.patch("automation-run", runId, { state, finishedAt: iso(this.d.now()), ...terminal }, cur.version, `${cur.body}\n## 输出\n\n${message}\n`);
    this.d.publish("run.stateChanged", { runId, kind: "automation-run", state });
    return { state };
  }

  /** 等终端会话结束（轮询 agent.sessions.list；取消或超时就结束会话），读取脱敏后的输出，写回运行记录。引擎重启后的对账也走这里。 */
  private async terminalSessions(): Promise<TerminalSession[] | null> {
    return (await this.d.call("agent.sessions.list", {}).catch(() => null)) as TerminalSession[] | null;
  }

  private async terminalPending(runId: string, message: string, expectedVersion?: string): Promise<{ state: string }> {
    const cur = this.d.repo.read("automation-run", runId);
    if (cur.data["finishedAt"] || (expectedVersion !== undefined && cur.version !== expectedVersion)) return { state: String(cur.data["state"]) };
    if (cur.data["state"] !== "unknown") {
      await this.d.repo.patch("automation-run", runId, { state: "unknown", finishedAt: null }, cur.version, `\n${message}\n`);
      this.d.publish("run.stateChanged", { runId, kind: "automation-run", state: "unknown" });
    }
    return { state: "unknown" };
  }

  private async settleTerminalRun(runId: string, sessionId: string, startedAt: string | null, ruleTitle: string, signal: AbortSignal): Promise<{ state: string }> {
    const deadline = (startedAt ? Date.parse(startedAt) : this.d.now().getTime()) + TERMINAL_TIMEOUT_MS;
    let sess: TerminalSession;
    let killedFor: "cancel" | "timeout" | null = null;
    for (;;) {
      if (this.abort.signal.aborted) return { state: "running" };
      const list = await this.terminalSessions();
      if (this.abort.signal.aborted) return { state: "running" };
      const matching = list?.find((x) => x.id === sessionId && x.requestId === terminalRequestId(runId));
      if (!matching || matching.state === "unknown" || matching.state === "launching") return this.terminalPending(runId, "等待原终端确认，当前无法确定结果。");
      sess = matching;
      if (sess.state !== "running") break;
      if (!killedFor && signal.aborted) killedFor = "cancel";
      else if (!killedFor && this.d.now().getTime() > deadline) killedFor = "timeout";
      if (killedFor) await this.d.call("agent.sessions.kill", { id: sessionId }, `autokill-${runId}`).catch(() => undefined);
      await new Promise((r) => setTimeout(r, this.d.terminalPollMs ?? 500));
    }
    let output = "";
    try {
      output = ((await this.d.call("agent.sessions.output", { id: sessionId, lines: 200 })) as { text: string }).text;
    } catch {
      output = "（终端输出已不可读）";
    }
    if (this.abort.signal.aborted) return { state: "running" };
    const exitCode = sess.exitCode ?? null;
    const cancelled = killedFor === "cancel" || (sess.state === "failed" && signal.aborted);
    const state = cancelled ? "cancelled" : killedFor === "timeout" || sess.state === "failed" ? "failed" : exitCode === 0 ? "succeeded" : exitCode === null ? "unknown" : "failed";
    const note = killedFor === "timeout" ? `超过 ${TERMINAL_TIMEOUT_MS / 60_000} 分钟，已结束终端。\n` : "";
    const cur = this.d.repo.read("automation-run", runId);
    await this.d.repo.patch("automation-run", runId, { state, finishedAt: iso(this.d.now()), exitCode, ...(sess.hasEnv && { sessionId, terminalReleasePending: true }) }, cur.version, `\n## 输出\n\n${note}${output}\n`);
    this.d.publish("run.stateChanged", { runId, kind: "automation-run", state });
    if (state === "failed" || state === "unknown") this.d.notify({ title: `自动化「${ruleTitle}」${STATE_TEXT[state] ?? state}`, module: "automations" });
    if (sess.hasEnv) await this.releaseTerminal(runId, sessionId);
    return { state };
  }

  private async releaseTerminal(runId: string, sessionId: string): Promise<void> {
    if (this.abort.signal.aborted) return;
    try {
      await this.d.call("agent.sessions.release", { id: sessionId, requestId: terminalRequestId(runId) }, `autorelease-${runId}`);
    } catch {
      return;
    }
    if (this.abort.signal.aborted) return;
    const run = this.d.repo.read("automation-run", runId);
    if (run.data["terminalOwner"] === this.d.terminalOwner && run.data["sessionId"] === sessionId && run.data["terminalReleasePending"] === true) {
      await this.d.repo.patch("automation-run", runId, { terminalReleasePending: false }, run.version);
    }
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

  reconcileTerminals(): Promise<void> {
    if (this.reconciling) return this.reconciling;
    const pending = this.reconcileTerminalRecords().finally(() => {
      this.reconciling = undefined;
    });
    this.reconciling = pending;
    return pending;
  }

  private async reconcileTerminalRecords(): Promise<void> {
    const owner = this.d.terminalOwner;
    if (!owner || this.abort.signal.aborted) return;
    const rows = this.d.repo.list("automation-run").filter(({ id, data, readOnly }) => {
      if (readOnly || data["actionKind"] !== "terminal" || data["terminalOwner"] !== owner || this.runAbort.has(id)) return false;
      return data["finishedAt"] ? data["terminalReleasePending"] === true && typeof data["sessionId"] === "string" : data["state"] === "running" || data["state"] === "unknown";
    });
    if (!rows.length) return;
    const rules = new Map(this.rules().map((rule) => [rule.id, rule]));
    let sessions: TerminalSession[] | null | undefined;
    for (const run of rows) {
      const { id } = run;
      if (this.abort.signal.aborted || this.runAbort.has(id)) continue;
      const { ruleId, sessionId, startedAt, finishedAt, terminalLaunch, state, trigger } = run.data as unknown as AutomationRunFrontmatter;
      if (finishedAt && sessionId) {
        await this.releaseTerminal(id, sessionId);
        continue;
      }
      const rule = rules.get(ruleId);
      if (trigger === "schedule" && terminalLaunch?.submittedAt === null && !sessionId) {
        if (state !== "running" || this.ruleAbort.has(ruleId)) continue;
        if (!rule?.data.enabled || rule.data.action.kind !== "terminal" || hasLegacyTerminalEnvironment(rule.data.action)) {
          await this.terminalPending(id, "原计划未提交，规则已停用、删除或需要重新配置。", run.version);
          continue;
        }
        const { title, action } = rule.data;
        this.track(this.withRule(ruleId, () => this.runTerminalAction(run, title, action)).then(() => undefined));
        continue;
      }
      if (sessions === undefined) sessions = await this.terminalSessions();
      if (this.abort.signal.aborted || this.runAbort.has(id)) continue;
      const session = sessions?.find((row) => row.requestId === terminalRequestId(id) && (!sessionId || row.id === sessionId));
      if (!session || session.state === "launching" || session.state === "unknown") {
        await this.terminalPending(id, "原启动暂时无法核实。", run.version);
        continue;
      }
      if (!sessionId) await this.d.repo.patch("automation-run", id, { sessionId: session.id }, run.version);
      const title = rule?.data.title ?? "终端命令";
      this.track(
        this.settleTerminalRun(id, session.id, terminalLaunch?.submittedAt ?? startedAt, title, this.terminalSignal(null, id))
          .then(() => undefined)
          .finally(() => this.runAbort.delete(id)),
      );
    }
  }

  runs(limit = 200) {
    const titles = new Map(this.rules().map(({ id, data }) => [id, data.title]));
    return this.d.repo
      .list("automation-run")
      .filter(({ data }) => data["actionKind"] === "terminal")
      .map(({ id, data }) => {
        const run = data as unknown as AutomationRunFrontmatter;
        return { id, kind: "automation-run" as const, state: this.terminalState(run), title: titles.get(run.ruleId) ?? run.ruleId, startedAt: run.startedAt, finishedAt: run.finishedAt, live: !run.finishedAt && this.runAbort.has(id) };
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
    if (!data["finishedAt"] && data["terminalOwner"] !== this.d.terminalOwner) {
      return { id, kind: "automation-run" as const, version, body: `当前 Vault 无法核实这次运行的本机归属。\n\n${body}`, data: { ...data, state: "unknown", sessionId: null }, title, live: false };
    }
    return { id, kind: "automation-run" as const, version, body, data, title, live: !data["finishedAt"] && this.runAbort.has(id) };
  }
}
