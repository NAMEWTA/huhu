import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { errors, newId, type AutomationRuleFrontmatter, type EventPayload, type EventType, type TaskDto } from "@huhu/contracts";
import type { Entity, SemanticRepository } from "@huhu/vault";
import { nextRuns, validateSchedule } from "../shared/cron.js";
import { builtinScanRule } from "../shared/builtin.js";
import type { ClaimStore } from "./claims.js";
import { classify, type ScanEnv, type SnapshotTask } from "./scan.js";
import { runScript, secretErrorToNotice, type ScriptStore } from "./scripts.js";

export interface TaskQueryLike {
  listAll(): TaskDto[];
  listOpenAgentTasks(): TaskDto[];
  snapshot(taskId: string): TaskDto;
}

export interface RunOutcome {
  state: "succeeded" | "failed" | "waiting_input" | "cancelled" | "unknown";
  /** Agent 最终消息（写入 task-run 的“结果”分区）。 */
  message: string;
  exitCode: number | null;
  nativeSessionId: string | null;
  questions: { id: string; text: string; options: string[] }[];
}

export interface WorkerInput {
  runId: string;
  task: TaskDto;
  cwd: string;
  provider: string;
  model: string | null;
  signal: AbortSignal;
}

export interface AutomationsDeps {
  repo: SemanticRepository;
  claims: ClaimStore;
  /** activations/*.ndjson 所在目录。 */
  activationsDir: string;
  taskQuery(): TaskQueryLike | undefined;
  /** 执行一个 Agent 任务（外部进程）。测试可注入替身。 */
  worker(input: WorkerInput): Promise<RunOutcome>;
  spaceState(spaceId: string): { state: "ok" | "missing" | "inaccessible"; root?: string };
  cliAvailable(provider: string): boolean;
  holds(taskId: string, inputHash: string): boolean;
  scripts?: ScriptStore;
  /** 解析保险箱引用（plugin=automations）；锁定时抛 SAFE_LOCKED。 */
  resolveSecret?(ref: string, purpose: string): string;
  notify(n: { title: string; module: string }): void;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  zone(): string;
  machineId: string;
}

export interface ActivationRecord {
  activationId: string;
  ruleId: string;
  trigger: "schedule" | "manual";
  scheduledFor: string | null;
  startedAt: string;
  finishedAt?: string;
  summary?: { processed: number; skipped: number } | { state: string };
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
type RuleData = AutomationRuleFrontmatter;

export class AutomationsService {
  private running = new Set<string>();
  private readonly abort = new AbortController();

  /** 插件停用/引擎关闭：终止运行中的脚本与 Agent 进程。 */
  abortAll(): void {
    this.abort.abort();
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

  /** 新 Vault：写入内置规则（已存在则不动）。 */
  async ensureBuiltin(): Promise<void> {
    if (this.rules().some((r) => r.data.builtin)) return;
    await this.d.repo.create("automation-rule", builtinScanRule(this.d.zone(), iso(this.d.now())), "每隔一段时间检查未完成的 Agent 任务，并交给对应的 Agent 处理。");
  }

  async create(input: { title: string; trigger: RuleData["trigger"]; action: RuleData["action"]; body?: string; missedRunGraceMinutes?: number }) {
    validateSchedule(input.trigger.cron, input.trigger.zone);
    const now = iso(this.d.now());
    const e = await this.d.repo.create("automation-rule", { title: input.title, enabled: false, builtin: false, trigger: input.trigger, missedRunGraceMinutes: input.missedRunGraceMinutes ?? 30, action: input.action, createdAt: now, updatedAt: now }, input.body ?? "");
    this.d.publish("entity.changed", { kind: "automation-rule", id: e.id, op: "created" });
    return this.rule(e.id);
  }

  async update(id: string, expectedVersion: string, patch: Partial<Pick<RuleData, "title" | "trigger" | "action" | "missedRunGraceMinutes">>) {
    const cur = this.rule(id);
    if (patch.trigger) validateSchedule(patch.trigger.cron, patch.trigger.zone);
    if (cur.data.builtin && patch.action && patch.action.kind !== cur.data.action.kind) throw errors.invalidInput("内置规则的动作类型不能更改");
    await this.d.repo.patch("automation-rule", id, { ...patch, updatedAt: iso(this.d.now()) }, expectedVersion);
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
    if (cur.data.builtin) throw errors.invalidInput("内置规则不能删除，只能暂停");
    await this.d.repo.delete("automation-rule", id, cur.version);
    this.d.publish("entity.changed", { kind: "automation-rule", id, op: "deleted" });
  }

  // ---- 扫描 ----
  private scanEnv(): ScanEnv {
    return {
      claims: (k) => this.d.claims.get(k),
      holds: (t, h) => this.d.holds(t, h),
      spaceAccessible: (id) => this.d.spaceState(id).state,
      cliAvailable: (p) => this.d.cliAvailable(p),
    };
  }

  /** 只读预览：候选、跳过原因、接下来三次激活时间；不写任何文件。 */
  preview(ruleId: string) {
    const r = this.rule(ruleId);
    const next = nextRuns(r.data.trigger.cron, r.data.trigger.zone, 3, this.d.now());
    if (r.data.action.kind !== "scan_agent_tasks") return { next, tasksDisabled: false, candidates: [], skipped: [] };
    if (!this.d.taskQuery()) return { next, tasksDisabled: true, candidates: [], skipped: [] };
    const { candidates, skipped } = classify(this.allTasks(), this.scanEnv()); // 含已完成/非 Agent 的跳过项
    return { next, tasksDisabled: false, candidates: candidates.map((c) => ({ taskId: c.task.id, title: c.task.title, inputRevision: c.task.inputRevision, processingKey: c.processingKey })), skipped: skipped.map((s) => ({ taskId: s.task.id, title: s.task.title, reason: s.reason, ...(s.detail ? { detail: s.detail } : {}) })) };
  }

  private allTasks(): SnapshotTask[] {
    return (this.d.taskQuery()?.listAll() ?? []).map((t) => ({ id: t.id, title: t.title, completed: t.completed, execution: t.execution.kind === "agent" ? { kind: "agent" as const, spaceId: t.execution.spaceId, provider: t.execution.provider } : { kind: "manual" as const }, inputRevision: t.inputRevision, inputHash: t.inputHash }));
  }

  // ---- 激活 ----
  activations(): ActivationRecord[] {
    if (!existsSync(this.d.activationsDir)) return [];
    const byId = new Map<string, ActivationRecord>();
    for (const f of readdirSync(this.d.activationsDir).filter((x) => x.endsWith(".ndjson")).sort()) {
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
    const last = this.activations().filter((a) => a.ruleId === ruleId && a.scheduledFor).sort((a, b) => (b.scheduledFor as string).localeCompare(a.scheduledFor as string))[0];
    return last?.scheduledFor ? new Date(last.scheduledFor) : null;
  }

  private writeActivation(r: ActivationRecord): void {
    mkdirSync(this.d.activationsDir, { recursive: true });
    appendFileSync(path.join(this.d.activationsDir, `${iso(this.d.now()).slice(0, 7)}.ndjson`), JSON.stringify(r) + "\n");
  }

  /** 激活一条规则。同一规则同一时间只会有一次激活在执行。 */
  async activate(ruleId: string, trigger: "schedule" | "manual", scheduledFor: Date | null = null): Promise<ActivationRecord> {
    const rule = this.rule(ruleId);
    // 定时触发只对已启用的规则生效（规则被恢复/外部修改为暂停后，内存里的作业可能还没重建）
    if (trigger === "schedule" && !rule.data.enabled) return { activationId: "skipped", ruleId, trigger, scheduledFor: null, startedAt: iso(this.d.now()), summary: { state: "paused" } };
    if (this.running.has(ruleId)) throw errors.invalidInput("这条规则正在执行");
    this.running.add(ruleId);
    const rec: ActivationRecord = { activationId: newId("cap").replace("cap", "act"), ruleId, trigger, scheduledFor: scheduledFor ? iso(scheduledFor) : null, startedAt: iso(this.d.now()) };
    this.writeActivation(rec);
    this.d.publish("automation.activated", { ruleId, activationId: rec.activationId, trigger });
    try {
      let summary: ActivationRecord["summary"];
      const a = rule.data.action;
      if (a.kind === "notify") {
        this.d.notify({ title: a.text, module: "automations" });
        summary = { state: "succeeded" };
      } else if (a.kind === "scan_agent_tasks") summary = await this.scan(rule.id, a.maxConcurrent);
      else if (a.kind === "script") summary = await this.runScriptAction(rule.id, rule.data.title, a.scriptId, a.args ?? [], trigger);
      else if (a.kind === "agent_prompt") summary = await this.runPromptAction(rule.id, rule.data.title, rule.body, a, trigger);
      else summary = { state: "unsupported" };
      const done = { ...rec, finishedAt: iso(this.d.now()), summary };
      this.writeActivation(done);
      return done;
    } finally {
      this.running.delete(ruleId);
    }
  }

  /** script 动作：结果写成 automation-run；保险箱锁定 → 运行失败并通知。 */
  private async runScriptAction(ruleId: string, ruleTitle: string, scriptId: string, args: string[], trigger: "schedule" | "manual"): Promise<{ state: string }> {
    const run = await this.d.repo.create("automation-run", { ruleId, actionKind: "script", trigger, state: "running", startedAt: iso(this.d.now()) }, "");
    let state = "failed"; let exitCode: number | null = null; let body = "";
    try {
      const def = this.d.scripts?.get(scriptId);
      if (!def) throw errors.notFound(`脚本 ${scriptId} 不存在`);
      const r = await runScript(def, args, (ref) => this.d.resolveSecret ? this.d.resolveSecret(ref, `script:${scriptId}`) : (() => { throw errors.invalidInput("保险箱插件未启用"); })(), this.abort.signal);
      state = r.state; exitCode = r.exitCode; body = r.output;
    } catch (e) {
      body = secretErrorToNotice(e);
      this.d.notify({ title: `自动化「${ruleTitle}」失败：${body}`, module: "automations" });
    }
    await this.d.repo.patch("automation-run", run.id, { state, finishedAt: iso(this.d.now()), exitCode }, run.version, `\n## 输出\n\n${body}\n`);
    this.d.publish("run.stateChanged", { runId: run.id, kind: "automation-run", state });
    return { state };
  }

  /** agent_prompt 动作：与扫描相同的 worker 启动路径，但不涉及 Task 与 claim。 */
  private async runPromptAction(ruleId: string, ruleTitle: string, prompt: string, a: { spaceId: string; provider: string; model?: string | null }, trigger: "schedule" | "manual"): Promise<{ state: string }> {
    const run = await this.d.repo.create("automation-run", { ruleId, actionKind: "agent_prompt", trigger, state: "running", startedAt: iso(this.d.now()) }, "");
    const space = this.d.spaceState(a.spaceId);
    let outcome: RunOutcome;
    if (space.state !== "ok" || !space.root) outcome = { state: "failed", message: "Space 不存在或目录不可访问", exitCode: null, nativeSessionId: null, questions: [] };
    else {
      const task = { id: run.id, title: ruleTitle, body: prompt, resources: [], execution: { kind: "agent", spaceId: a.spaceId, provider: a.provider, model: a.model ?? null } } as unknown as TaskDto;
      try {
        outcome = await this.d.worker({ runId: run.id, task, cwd: space.root, provider: a.provider, model: a.model ?? null, signal: this.abort.signal });
      } catch (e) {
        outcome = { state: "failed", message: e instanceof Error ? e.message : String(e), exitCode: null, nativeSessionId: null, questions: [] };
      }
    }
    await this.d.repo.patch("automation-run", run.id, { state: outcome.state, finishedAt: iso(this.d.now()), exitCode: outcome.exitCode, nativeSessionId: outcome.nativeSessionId }, run.version, `\n## 结果\n\n${outcome.message}\n`);
    this.d.publish("run.stateChanged", { runId: run.id, kind: "automation-run", state: outcome.state });
    return { state: outcome.state };
  }

  private async scan(ruleId: string, maxConcurrent: number): Promise<{ processed: number; skipped: number } | { state: string }> {
    if (!this.d.taskQuery()) return { state: "tasks-disabled" }; // ACC-AU-10：任务插件已停用，跳过
    const { candidates, skipped } = classify(this.allTasks(), this.scanEnv());
    let next = 0;
    let processed = 0;
    const worker = async () => {
      for (;;) {
        const c = candidates[next++];
        if (!c) return;
        if (await this.process(ruleId, c.task, c.processingKey)) processed++;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(4, maxConcurrent)) }, worker));
    return { processed, skipped: skipped.length };
  }

  /** 先持久化 claim 与 task-run(queued)，再启动 worker。 */
  private async process(ruleId: string, snap: SnapshotTask, processingKey: string): Promise<boolean> {
    if (this.abort.signal.aborted) return false; // 插件已停用/引擎关闭：不再启动新的 Agent 进程
    const task = this.d.taskQuery()?.snapshot(snap.id);
    if (!task || task.execution.kind !== "agent" || !task.execution.spaceId || !task.execution.provider) return false;
    if (task.inputHash !== snap.inputHash) return false; // 快照后任务又被编辑：本次不处理
    const space = this.d.spaceState(task.execution.spaceId);
    if (space.state !== "ok" || !space.root) return false;
    const run = await this.d.repo.create("task-run", { taskId: task.id, ruleId, processingKey, attempt: 1, state: "queued", provider: task.execution.provider, model: task.execution.model, spaceId: task.execution.spaceId, cwd: space.root, machineId: this.d.machineId, questions: [] }, "");
    if (!this.d.claims.create({ processingKey, taskId: task.id, runId: run.id, state: "queued", claimedAt: iso(this.d.now()) })) {
      await this.d.repo.delete("task-run", run.id, run.version); // 并发下别人先 claim：撤回刚建的 run
      return false;
    }
    await this.setRun(run, { state: "running", startedAt: iso(this.d.now()) }, processingKey);
    const ac = this.abort;
    let outcome: RunOutcome;
    try {
      outcome = await this.d.worker({ runId: run.id, task, cwd: space.root, provider: task.execution.provider, model: task.execution.model, signal: ac.signal });
    } catch (e) {
      outcome = { state: "failed", message: e instanceof Error ? e.message : String(e), exitCode: null, nativeSessionId: null, questions: [] };
    }
    const latest = this.d.repo.read("task-run", run.id);
    await this.setRun(latest, { state: outcome.state, finishedAt: iso(this.d.now()), exitCode: outcome.exitCode, nativeSessionId: outcome.nativeSessionId, questions: outcome.questions.map((q) => ({ ...q, answer: null, answeredAt: null })) }, processingKey, `\n## 结果\n\n${outcome.message}\n`);
    return true;
  }

  /**
   * 启动对账（ACC-AU-07 的无监督进程版本）：上次 Engine 退出时仍是 queued/running 的 claim，
   * 结果无法确认 → 置 unknown（task-run 同步）；扫描不会再处理该输入，只有用户明确"标记失败并重试"才会重新启动。
   */
  async reconcile(): Promise<number> {
    let n = 0;
    for (const c of this.d.claims.list()) {
      if (c.state !== "queued" && c.state !== "running") continue;
      this.d.claims.update(c.processingKey, { state: "unknown" });
      try {
        const run = this.d.repo.read("task-run", c.runId);
        await this.d.repo.patch("task-run", c.runId, { state: "unknown" }, run.version);
      } catch {
        // task-run 文件已不存在：claim 仍保持 unknown，阻止重复处理
      }
      n++;
    }
    return n;
  }

  private async setRun(run: Entity, changes: Record<string, unknown>, processingKey: string, body?: string): Promise<void> {
    const e = await this.d.repo.patch("task-run", run.id, changes, run.version, body);
    this.d.claims.update(processingKey, { state: (changes["state"] as never) ?? (e.data as { state: never }).state });
    this.d.publish("run.stateChanged", { runId: run.id, kind: "task-run", state: String(changes["state"]) });
  }
}
