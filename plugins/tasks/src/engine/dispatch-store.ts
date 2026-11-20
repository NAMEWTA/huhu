import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { HuhuError, TaskExecutionSchema, TaskRunAttemptSchema, type TaskDto } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { canonicalJson } from "../shared/input.js";

const Id = z.string().trim().min(1).max(256);
const Instant = z.iso.datetime();
const InputIdentity = z.object({ inputRevision: z.number().int().positive(), inputHash: z.string().regex(/^[a-f0-9]{16}$/) });
export const DispatchInput = InputIdentity.extend({ taskId: Id, dispatchId: Id, expectedVersion: z.string().min(1) }).strict();
export const DispatchLookup = DispatchInput.pick({ taskId: true, dispatchId: true });
export const RuleSource = z.strictObject({
  kind: z.literal("automation"),
  ruleId: Id,
  ruleVersion: Id,
  occurrenceId: Id,
  notBefore: Instant.optional(),
  expiresAt: Instant.optional(),
  instructions: z.string().max(20_000).optional(),
});
const Source = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("desktop") }), RuleSource]);
const Snapshot = InputIdentity.extend({
  taskId: Id,
  expectedVersion: z.string(),
  taskVersion: z.string(),
  body: z.string(),
  execution: TaskExecutionSchema,
  references: z.array(z.string()),
  source: Source,
});
export const DispatchReceipt = DispatchLookup.extend({
  eventId: z.string(),
  runId: z.string(),
  attempt: TaskRunAttemptSchema,
  acceptedAt: Instant,
  state: z.enum(["pending", "claimed", "sending", "running", "unknown", "cancelled", "stale_input", "expired", "blocked"]),
  reason: z.enum(["waiting_resource", "task_occupied", "task_closed", "task_unavailable", "target_unavailable", "foreign_machine", "awaiting_confirmation"]).nullable(),
  cancelRequested: z.boolean(),
});
const DispatchRecord = z.object({
  schema: z.literal(1),
  receipt: DispatchReceipt,
  requestHash: z.string(),
  snapshot: Snapshot,
  snapshotHash: z.string(),
  claim: z.object({ machineId: z.string(), at: Instant }).nullable(),
  startedAt: Instant.nullable(),
  finishedAt: Instant.nullable(),
});

export type DispatchInput = z.infer<typeof DispatchInput>;
export type DispatchLookup = z.infer<typeof DispatchLookup>;
export type RuleSource = z.infer<typeof RuleSource>;
export type DispatchSource = z.infer<typeof Source>;
export type DispatchSnapshot = z.infer<typeof Snapshot>;
export type DispatchReceipt = z.infer<typeof DispatchReceipt>;
export type DispatchRecord = z.infer<typeof DispatchRecord>;
type Stored = { record: DispatchRecord; version: string };

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function eventIdOf(dispatchId: string): string {
  return `evt-${fingerprint(dispatchId)}`;
}

export function holdsTask({ state }: DispatchReceipt): boolean {
  return state === "pending" || state === "claimed" || state === "sending" || state === "running" || state === "unknown";
}

export function sameInput(task: TaskDto, input: Pick<DispatchInput, "inputRevision" | "inputHash">): boolean {
  return task.inputRevision === input.inputRevision && task.inputHash === input.inputHash;
}

/** 受理事实、冻结输入和领取事实在同一原子文件中；同一 event 的 run 无须跨文件补写。 */
export class DispatchStore {
  private readonly dir = "tasks/dispatches";

  constructor(private readonly files: VaultFiles) {}

  get readOnly(): boolean {
    return this.files.readOnly;
  }

  assertWritable(): void {
    this.files.assertWritable();
  }

  read(eventId: string): Stored | null {
    const rel = `${this.dir}/${eventId}.json`;
    const file = this.files.read(rel);
    if (!file) return null;
    try {
      const record = DispatchRecord.parse(JSON.parse(file.bytes.toString("utf8")));
      const { receipt, snapshot, claim } = record;
      if (receipt.eventId !== eventId || eventIdOf(receipt.dispatchId) !== eventId || receipt.taskId !== snapshot.taskId || fingerprint(snapshot) !== record.snapshotHash) throw new Error("身份或快照校验失败");
      if ((receipt.state === "pending" && claim) || (["claimed", "sending", "running", "unknown"].includes(receipt.state) && !claim)) throw new Error("领取状态与记录不符");
      return { record, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务派遣记录损坏", { details: { path: rel, eventId } });
    }
  }

  list(): DispatchRecord[] {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(this.dir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return names
      .filter((name) => /^evt-[a-f0-9]{64}\.json$/.test(name))
      .map((name) => {
        const eventId = name.slice(0, -5);
        const stored = this.read(eventId);
        if (!stored) throw new HuhuError("WRITE_PARTIAL", "任务派遣记录读取期间消失", { details: { eventId } });
        return stored.record;
      });
  }

  async write(record: DispatchRecord, expectedVersion: string | null): Promise<DispatchRecord> {
    await this.files.write(`${this.dir}/${record.receipt.eventId}.json`, Buffer.from(`${JSON.stringify(record, null, 2)}\n`), { expectedVersion });
    return record;
  }
}
