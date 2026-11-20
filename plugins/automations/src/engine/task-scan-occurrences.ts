import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { AgentInputSchema, AutomationRuleFrontmatterSchema, errors, HuhuError, isHuhuError } from "@huhu/contracts";
import { filesystemIdentity, machineId, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskRuleDispatch } from "../../../tasks/src/engine/index.js";
import { isTaskScanRule, TASK_SCAN_INSTRUCTIONS_LIMIT, type ActivationRecord, type AutomationsService, type TaskScanRule } from "./service.js";

const dir = "automations/task-scan-occurrences";
const Id = z.string().regex(/^(occ-[a-f0-9]{64}|inv-[a-f0-9-]{36})$/);
const DispatchId = z.string().regex(/^scan-[a-f0-9]{64}$/);
const Instant = z.iso.datetime();
const Item = z
  .object({ taskId: z.string().min(1), title: z.string(), inputRevision: z.number().int().positive(), inputHash: z.string().regex(/^[a-f0-9]{16}$/), expectedVersion: z.string().min(1) })
  .and(
    z.discriminatedUnion("state", [
      z.object({ state: z.literal("pending"), dispatchId: DispatchId }),
      z.object({ state: z.literal("accepted"), dispatchId: DispatchId, eventId: z.string().min(1), runId: z.string().min(1), acceptedAt: Instant }),
      z.object({ state: z.literal("skipped"), dispatchId: DispatchId.optional(), reason: z.string().min(1), detail: z.string().optional(), blockingRunId: z.string().optional() }),
    ]),
  );
const Occurrence = z.object({
  schema: z.literal(1),
  vaultId: z.string(),
  owner: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  id: Id,
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  maxConcurrent: z.int().min(1).max(4).optional(),
  scheduledForUTC: Instant.nullable(),
  startedAt: Instant,
  finishedAt: Instant.nullable(),
  rule: AutomationRuleFrontmatterSchema.pick({ title: true, trigger: true, missedRunGraceMinutes: true }).extend({
    input: AgentInputSchema,
    instructions: z.string().max(TASK_SCAN_INSTRUCTIONS_LIMIT),
  }),
  template: z.strictObject({ taskId: z.string().regex(/^task-[a-f0-9]{32}$/), issue: z.string().optional() }).optional(),
  tasksDisabled: z.boolean(),
  items: z.array(Item),
});

type Occurrence = z.infer<typeof Occurrence>;
type Item = z.infer<typeof Item>;
type Stored = { occurrence: Occurrence; version: string };
type Acceptance = Awaited<ReturnType<TaskRuleDispatch["acceptRule"]>>;

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

const occurrenceId = (ruleId: string, at: string) => `occ-${digest([ruleId, at])}`;
const dispatchId = (id: string, taskId: string) => `scan-${digest([id, taskId])}`;
const templateTaskId = (id: string) => `task-${digest(["template", id]).slice(0, 32)}`;

function rejection(error: unknown): { reason: string; detail: string; blockingRunId?: string } | null {
  if (!isHuhuError(error)) return null;
  if (error.code === "NOT_FOUND") return { reason: "task-not-found", detail: error.message };
  const reason = error.details?.reason;
  if (reason !== "task_occupied" && reason !== "stale_input" && reason !== "task_unavailable" && reason !== "not_due" && reason !== "expired") return null;
  const runId = error.details?.runId;
  return { reason, detail: error.message, ...(typeof runId === "string" && { blockingRunId: runId }) };
}

/** Owns scan selection and acceptance history. Tasks owns the execution and its current state. */
export class TaskScanOccurrences {
  private readonly active = new Map<string, Promise<Occurrence | null>>();
  private readonly shutdown = new AbortController();
  private readonly owner: string | null;

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    private readonly rules: Pick<AutomationsService, "rule" | "preview" | "classifyTaskScan" | "refreshTaskScanTargets" | "templateIssue">,
    private readonly taskDispatch: () => TaskRuleDispatch | undefined,
    private readonly now: () => Date,
    private readonly onChanged?: (activation: ActivationRecord) => void,
  ) {
    const stat = statSync(files.root, { bigint: true });
    const directory = filesystemIdentity(stat);
    this.owner = directory && stat.birthtimeNs > 0n ? digest([machineId(), directory, String(stat.birthtimeNs)]) : null;
  }

  scheduled(ruleId: string, scheduledFor: Date): Promise<Occurrence | null> {
    const at = scheduledFor.toISOString();
    return this.run(occurrenceId(ruleId, at), { ruleId, at });
  }

  async invoke(ruleId: string): Promise<Occurrence> {
    const occurrence = await this.run(`inv-${randomUUID()}`, { ruleId, at: null });
    if (!occurrence) throw errors.notFound(`规则 ${ruleId} 不存在`);
    return occurrence;
  }

  async preview(ruleId: string) {
    const signal = this.shutdown.signal;
    signal.throwIfAborted();
    await this.rules.refreshTaskScanTargets();
    signal.throwIfAborted();
    return this.rules.preview(ruleId);
  }

  read(id: string): Occurrence | null {
    return this.load(Id.parse(id))?.occurrence ?? null;
  }

  list(): Occurrence[] {
    return this.ids().map((id) => {
      const occurrence = this.read(id);
      if (!occurrence) throw new HuhuError("WRITE_PARTIAL", "扫描发生记录在读取期间消失", { details: { id } });
      return occurrence;
    });
  }

  activation({ id, ruleId, scheduledForUTC, startedAt, finishedAt, items, template }: Occurrence): ActivationRecord {
    const processed = items.filter(({ state }) => state === "accepted").length;
    const skipped = items.filter(({ state }) => state === "skipped").length + Number(!!template?.issue);
    return {
      activationId: id,
      ruleId,
      scheduledFor: scheduledForUTC,
      trigger: scheduledForUTC ? "schedule" : "manual",
      startedAt,
      ...(finishedAt && { finishedAt }),
      summary: finishedAt ? { processed, skipped } : { state: "pending" },
    };
  }

  lastScheduledFor(ruleId: string): Date | null {
    let latest: string | null = null;
    for (const row of this.list()) {
      const at = row.scheduledForUTC;
      if (this.owns(row) && row.ruleId === ruleId && at && (!latest || at > latest)) latest = at;
    }
    return latest ? new Date(latest) : null;
  }

  async recover(): Promise<void> {
    this.shutdown.signal.throwIfAborted();
    this.files.assertWritable();
    const results = await Promise.allSettled(this.ids().map((id) => this.run(id)));
    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (failures.length) throw new AggregateError(failures, "有扫描发生尚未完成受理");
  }

  async close(): Promise<void> {
    this.shutdown.abort();
    await Promise.allSettled(this.active.values());
  }

  private ids(): string[] {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(dir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .filter((id) => Id.safeParse(id).success);
  }

  private run(id: string, trigger?: { ruleId: string; at: string | null }): Promise<Occurrence | null> {
    const active = this.active.get(id);
    if (active) return active;
    const work = Promise.resolve()
      .then(() => this.advance(id, trigger))
      .finally(() => this.active.delete(id));
    this.active.set(id, work);
    return work;
  }

  private load(id: string): Stored | null {
    const file = this.files.read(`${dir}/${id}.json`);
    if (!file) return null;
    try {
      const row = Occurrence.parse(JSON.parse(file.bytes.toString("utf8")));
      const { scheduledForUTC: at } = row;
      const correctId = at ? occurrenceId(row.ruleId, at) : id.startsWith("inv-") && id;
      const taskIds = new Set(row.items.map((item) => item.taskId));
      const { template } = row;
      if (
        row.id !== id ||
        correctId !== id ||
        taskIds.size !== row.items.length ||
        (row.tasksDisabled && row.items.length !== 0) ||
        (row.rule.input.source === "prompt") !== (template !== undefined) ||
        (template && (template.taskId !== templateTaskId(id) || row.items.length > 1 || row.items.some(({ taskId }) => taskId !== template.taskId))) ||
        row.items.some((item) => (item.dispatchId && item.dispatchId !== dispatchId(id, item.taskId)) || (row.finishedAt !== null && item.state === "pending"))
      )
        throw new Error("扫描发生身份或状态不一致");
      return { occurrence: row, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "扫描发生记录损坏", { details: { id } });
    }
  }

  private owns(row: Occurrence): boolean {
    return this.owner !== null && row.owner === this.owner && row.vaultId === this.vaultId;
  }

  private async persist(occurrence: Occurrence, expectedVersion: string | null): Promise<Stored> {
    const { version } = await this.files.write(`${dir}/${occurrence.id}.json`, Buffer.from(`${JSON.stringify(occurrence, null, 2)}\n`), { expectedVersion });
    return { occurrence, version };
  }

  private async advance(id: string, trigger?: { ruleId: string; at: string | null }): Promise<Occurrence | null> {
    const signal = this.shutdown.signal;
    signal.throwIfAborted();
    let stored = this.load(id);
    if (!stored && trigger) {
      this.files.assertWritable();
      await this.rules.refreshTaskScanTargets();
      signal.throwIfAborted();
      const rule = this.rules.rule(trigger.ruleId);
      const now = this.now();
      if (trigger.at && (!rule.data.enabled || Date.parse(trigger.at) <= Date.parse(rule.data.updatedAt))) return null;
      if (trigger.at && Date.parse(trigger.at) > now.getTime()) throw errors.invalidInput("计划派遣时间尚未到达");
      if (this.owner === null) throw errors.invalidInput("无法验证当前 Vault 的本机扫描归属");
      const occurrence = isTaskScanRule(rule) ? this.freeze(id, rule, trigger.at, now, this.owner) : this.freezeTemplate(id, rule, trigger.at, now, this.owner);
      stored = await this.persist(occurrence, null);
      this.onChanged?.(this.activation(stored.occurrence));
    }
    if (!stored) throw new HuhuError("WRITE_PARTIAL", "扫描发生记录在读取期间消失", { details: { id } });
    // A restored scan is history. Only its original machine and directory may finish acceptance.
    if (!this.owns(stored.occurrence) || stored.occurrence.finishedAt !== null) return stored.occurrence;
    this.files.assertWritable();

    const row = stored.occurrence;
    if (row.template && !row.template.issue && row.items.length === 0) {
      await this.createTemplateTask(row, row.template);
      signal.throwIfAborted();
      stored = await this.persist(row, stored.version);
    }
    for (const [index, item] of row.items.entries()) {
      if (item.state !== "pending") continue;
      signal.throwIfAborted();
      row.items[index] = await this.accept(row, item);
      signal.throwIfAborted();
      stored = await this.persist(row, stored.version);
    }
    signal.throwIfAborted();
    const completed = (await this.persist({ ...row, finishedAt: this.now().toISOString() }, stored.version)).occurrence;
    this.onChanged?.(this.activation(completed));
    return completed;
  }

  private freeze(id: string, rule: TaskScanRule, at: string | null, now: Date, owner: string): Occurrence {
    if (rule.body.length > TASK_SCAN_INSTRUCTIONS_LIMIT) throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    const { tasksDisabled, candidates, skipped } = this.rules.classifyTaskScan(rule, now);
    const identity = (task: (typeof candidates)[number]["task"]) => ({
      taskId: task.id,
      title: task.title,
      inputHash: task.inputHash,
      inputRevision: task.inputRevision,
      expectedVersion: task.version,
    });
    return {
      schema: 1,
      vaultId: this.vaultId,
      owner,
      id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      maxConcurrent: rule.data.action.input.maxConcurrent,
      scheduledForUTC: at,
      startedAt: now.toISOString(),
      finishedAt: null,
      rule: { title: rule.data.title, trigger: rule.data.trigger, input: rule.data.action.input, missedRunGraceMinutes: rule.data.missedRunGraceMinutes, instructions: rule.body },
      tasksDisabled,
      items: [
        ...candidates.map(({ task }) => ({ ...identity(task), state: "pending" as const, dispatchId: dispatchId(id, task.id) })),
        ...skipped.map(({ task, reason, detail }) => ({ ...identity(task), state: "skipped" as const, reason, ...(detail && { detail }) })),
      ],
    };
  }

  private freezeTemplate(id: string, rule: ReturnType<AutomationsService["rule"]>, at: string | null, now: Date, owner: string): Occurrence {
    const { action, title, trigger, missedRunGraceMinutes } = rule.data;
    if (action.kind !== "agent" || action.input.source !== "prompt") throw errors.invalidInput("该规则没有任务输入");
    if (rule.body.length > TASK_SCAN_INSTRUCTIONS_LIMIT) throw errors.invalidInput("任务模板不能超过 20000 字符");
    const tasksDisabled = !this.taskDispatch();
    const issue = tasksDisabled ? "tasks-disabled" : this.rules.templateIssue(action.input.spaceId, action.input.provider, rule.body);
    return {
      schema: 1,
      vaultId: this.vaultId,
      owner,
      id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      maxConcurrent: 1,
      scheduledForUTC: at,
      startedAt: now.toISOString(),
      finishedAt: null,
      rule: { title, trigger, missedRunGraceMinutes, input: action.input, instructions: rule.body },
      template: { taskId: templateTaskId(id), ...(issue && { issue }) },
      tasksDisabled,
      items: [],
    };
  }

  private async createTemplateTask(row: Occurrence, template: NonNullable<Occurrence["template"]>): Promise<void> {
    const tasks = this.taskDispatch();
    if (!tasks) throw errors.pluginDisabled("tasks");
    const { input, instructions, title } = row.rule;
    if (input.source !== "prompt") throw new HuhuError("WRITE_PARTIAL", "模板规则输入损坏");
    const { source: _source, ...execution } = input;
    try {
      const task = await tasks.createFromRule({ taskId: template.taskId, ruleId: row.ruleId, occurrenceId: row.id, title, body: instructions, execution });
      const { id: taskId, title: taskTitle, version: expectedVersion, inputRevision, inputHash } = task;
      row.items.push({ taskId, title: taskTitle, expectedVersion, inputRevision, inputHash, dispatchId: dispatchId(row.id, taskId), state: "pending" });
    } catch (error) {
      const skipped = rejection(error);
      if (!skipped) throw error;
      template.issue = skipped.reason;
    }
  }

  private async accept(row: Occurrence, item: Extract<Item, { state: "pending" }>): Promise<Item> {
    const tasks = this.taskDispatch();
    if (!tasks) throw errors.pluginDisabled("tasks");
    const { taskId, dispatchId, expectedVersion, inputRevision, inputHash } = item;
    let receipt: Acceptance;
    try {
      receipt = await tasks.acceptRule(
        { taskId, dispatchId, expectedVersion, inputRevision, inputHash },
        {
          kind: "automation",
          ruleId: row.ruleId,
          ruleVersion: row.ruleVersion,
          occurrenceId: row.id,
          ...(!row.template && { instructions: row.rule.instructions }),
          ...(row.maxConcurrent !== undefined && { maxConcurrent: row.maxConcurrent }),
        },
      );
    } catch (error) {
      const skipped = rejection(error);
      if (!skipped) throw error;
      return { ...item, ...skipped, state: "skipped" };
    }
    return { ...item, state: "accepted", eventId: receipt.eventId, runId: receipt.runId, acceptedAt: receipt.acceptedAt };
  }
}
