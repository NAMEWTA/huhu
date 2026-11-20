import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { AgentInputSchema, AutomationRuleFrontmatterSchema, errors, HuhuError, isHuhuError } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskRuleDispatch } from "../../../tasks/src/engine/index.js";
import { isTaskScanRule, TASK_SCAN_INSTRUCTIONS_LIMIT, type AutomationsService, type TaskScanRule } from "./service.js";

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
  id: Id,
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  scheduledForUTC: Instant.nullable(),
  startedAt: Instant,
  finishedAt: Instant.nullable(),
  rule: AutomationRuleFrontmatterSchema.pick({ title: true, trigger: true, missedRunGraceMinutes: true }).extend({
    input: AgentInputSchema.refine((input) => input.source === "tasks"),
    instructions: z.string().max(TASK_SCAN_INSTRUCTIONS_LIMIT),
  }),
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

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    private readonly rules: Pick<AutomationsService, "rule" | "classifyTaskScan">,
    private readonly taskDispatch: () => TaskRuleDispatch | undefined,
    private readonly now: () => Date,
  ) {}

  scheduled(ruleId: string, scheduledFor: Date): Promise<Occurrence | null> {
    const at = scheduledFor.toISOString();
    return this.run(occurrenceId(ruleId, at), { ruleId, at });
  }

  async invoke(ruleId: string): Promise<Occurrence> {
    const occurrence = await this.run(`inv-${randomUUID()}`, { ruleId, at: null });
    if (!occurrence) throw errors.notFound(`规则 ${ruleId} 不存在`);
    return occurrence;
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

  lastScheduledFor(ruleId: string): Date | null {
    let latest: string | null = null;
    for (const row of this.list()) {
      const at = row.scheduledForUTC;
      if (row.ruleId === ruleId && at && (!latest || at > latest)) latest = at;
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
      if (
        row.id !== id ||
        correctId !== id ||
        row.vaultId !== this.vaultId ||
        taskIds.size !== row.items.length ||
        (row.tasksDisabled && row.items.length !== 0) ||
        row.items.some((item) => (item.dispatchId && item.dispatchId !== dispatchId(id, item.taskId)) || (row.finishedAt !== null && item.state === "pending"))
      )
        throw new Error("扫描发生身份或状态不一致");
      return { occurrence: row, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "扫描发生记录损坏或不属于当前 Vault", { details: { id } });
    }
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
      const rule = this.rules.rule(trigger.ruleId);
      const now = this.now();
      if (trigger.at && (!rule.data.enabled || Date.parse(trigger.at) <= Date.parse(rule.data.updatedAt))) return null;
      if (trigger.at && Date.parse(trigger.at) > now.getTime()) throw errors.invalidInput("计划派遣时间尚未到达");
      if (!isTaskScanRule(rule)) throw errors.invalidInput("该规则没有扫描已有任务");
      stored = await this.persist(this.freeze(id, rule, trigger.at, now), null);
    }
    if (!stored) throw new HuhuError("WRITE_PARTIAL", "扫描发生记录在读取期间消失", { details: { id } });
    if (stored.occurrence.finishedAt !== null) return stored.occurrence;
    this.files.assertWritable();

    const row = stored.occurrence;
    for (const [index, item] of row.items.entries()) {
      if (item.state !== "pending") continue;
      signal.throwIfAborted();
      row.items[index] = await this.accept(row, item);
      signal.throwIfAborted();
      stored = await this.persist(row, stored.version);
    }
    signal.throwIfAborted();
    return (await this.persist({ ...row, finishedAt: this.now().toISOString() }, stored.version)).occurrence;
  }

  private freeze(id: string, rule: TaskScanRule, at: string | null, now: Date): Occurrence {
    if (rule.body.length > TASK_SCAN_INSTRUCTIONS_LIMIT) throw errors.invalidInput("扫描补充指令不能超过 20000 字符");
    const { tasksDisabled, candidates, skipped } = this.rules.classifyTaskScan(rule, now, true);
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
      id,
      ruleId: rule.id,
      ruleVersion: rule.version,
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

  private async accept(row: Occurrence, item: Extract<Item, { state: "pending" }>): Promise<Item> {
    const tasks = this.taskDispatch();
    if (!tasks) throw errors.pluginDisabled("tasks");
    const { taskId, dispatchId, expectedVersion, inputRevision, inputHash } = item;
    let receipt: Acceptance;
    try {
      receipt = await tasks.acceptRule({ taskId, dispatchId, expectedVersion, inputRevision, inputHash }, { kind: "automation", ruleId: row.ruleId, ruleVersion: row.ruleVersion, occurrenceId: row.id, instructions: row.rule.instructions });
    } catch (error) {
      const skipped = rejection(error);
      if (!skipped) throw error;
      return { ...item, ...skipped, state: "skipped" };
    }
    return { ...item, state: "accepted", eventId: receipt.eventId, runId: receipt.runId, acceptedAt: receipt.acceptedAt };
  }
}
