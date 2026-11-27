import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { ExecutionBindingSchema, HuhuError, isHuhuError, isId, TaskExecutionSchema, type TaskDto } from "@huhu/contracts";
import {
  TaskDispatchInputIdentitySchema as InputIdentity,
  TaskDispatchInputSchema,
  TaskDispatchLookupSchema,
  TaskRetryDispatchSchema,
  TaskStopLookupSchema,
  TaskStopReceiptSchema,
  TaskRuleDispatchSourceSchema,
  TaskFollowUpDispatchSchema,
  TaskFollowUpSourceSchema,
  TaskDispatchReceiptSchema,
  TaskDispatchViewSchema,
  TaskRunSummarySchema,
  TaskMcpAuthorizationSchema,
  RecentTaskRunSchema,
} from "@huhu/contracts";
import { AgentDispatchTargetSchema } from "@huhu/plugin-agent-cli/engine";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { canonicalJson } from "../shared/input.js";
import { TaskJournalIndex } from "./journal-index.js";
import { ResponseActor } from "./response-actor.js";

const Id = z.string().trim().min(1).max(256);
const Instant = z.iso.datetime();
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const FrozenContext = z.strictObject({
  messages: z.array(z.strictObject({ id: Id, body: z.string().max(8_000) })).max(8),
  artifacts: z.array(z.strictObject({ path: z.string(), version: z.string(), expectedVersion: z.string().optional(), text: z.string().max(8_000) })).max(4),
});
export const DispatchInput = TaskDispatchInputSchema;
export const DispatchLookup = TaskDispatchLookupSchema;
export const RetryDispatch = TaskRetryDispatchSchema;
export const StopLookup = TaskStopLookupSchema;
export const StopReceipt = TaskStopReceiptSchema;
export const RuleSource = TaskRuleDispatchSourceSchema;
export const FollowUpDispatch = TaskFollowUpDispatchSchema;
export const FollowUpSource = TaskFollowUpSourceSchema;
export const DispatchReceipt = TaskDispatchReceiptSchema;
export const TaskDispatchView = TaskDispatchViewSchema;
export const TaskRunSummary = TaskRunSummarySchema;
export const RecentTaskRun = RecentTaskRunSchema;
export type TaskRunSummary = z.infer<typeof TaskRunSummary>;
export type RecentTaskRun = z.infer<typeof RecentTaskRun>;

// Keep the persisted owner fingerprint private.
const StopRecord = StopReceipt.omit({ taskId: true, dispatchId: true, runId: true }).extend({ toolOwner: Digest.optional() });
export const ReplySource = z.strictObject({
  kind: z.literal("reply"),
  parent: ExecutionBindingSchema,
  requestId: Id,
  requestVersion: z.int().positive(),
  replyId: Id,
  answer: z.string().min(1).max(20_000),
  messageIds: z.array(Id).max(32),
  actor: ResponseActor.optional(),
});
export const SupplementSource = z.strictObject({
  kind: z.literal("supplement"),
  parent: ExecutionBindingSchema,
  supplementId: Id,
  toolOwner: Digest.optional(),
  text: z.string().max(20_000).optional(),
  messageIds: z.array(Id).max(32),
  actor: ResponseActor.optional(),
});
const Source = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("desktop") }), z.strictObject({ kind: z.literal("tool"), owner: Digest.optional() }), RuleSource, ReplySource, SupplementSource, FollowUpSource]);
const Snapshot = InputIdentity.extend({
  taskId: Id,
  expectedVersion: z.string(),
  taskVersion: z.string(),
  body: z.string(),
  execution: TaskExecutionSchema,
  mcpAuthorization: TaskMcpAuthorizationSchema.optional(),
  references: z.array(z.string()),
  source: Source,
  allowEarly: z.boolean().optional(),
  newRound: z.literal(true).optional(),
  previousRunId: Id.optional(),
  context: FrozenContext.optional(),
});

export function dispatchSnapshotText({ body, source, context }: z.infer<typeof Snapshot>): string {
  const instructions = source.kind === "automation" ? source.instructions : undefined;
  const messages = context?.messages.map(({ body }) => body);
  const artifacts = context?.artifacts.map(({ path, version, text }) => `文件 ${path}（版本 ${version}）\n${text}`);
  return [body, instructions, ...(messages?.length ? ["选取的任务消息", ...messages] : []), ...(artifacts?.length ? ["选取的关联产物", ...artifacts] : [])]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n")
    .replace(/\r\n/g, "\n");
}
const RecordFields = z.object({
  receipt: DispatchReceipt,
  retryOf: z.strictObject({ intent: RetryDispatch, taskInput: InputIdentity }).optional(),
  requestHash: z.string(),
  snapshot: Snapshot,
  snapshotHash: z.string(),
  agentTarget: AgentDispatchTargetSchema.optional(),
  boundExecution: ExecutionBindingSchema.optional(),
  stop: StopRecord.optional(),
  claim: z.object({ machineId: z.string(), at: Instant }).nullable(),
  startedAt: Instant.nullable(),
  finishedAt: Instant.nullable(),
});
const OwnedRecord = RecordFields.extend({
  schema: z.literal(2),
  owner: z.object({ vaultId: Id, storageId: Digest }),
  identityHash: Digest,
  seal: Digest,
});
const DispatchRecord = z.discriminatedUnion("schema", [RecordFields.extend({ schema: z.literal(1) }), OwnedRecord]);

export type DispatchInput = z.infer<typeof DispatchInput>;
export type DispatchLookup = z.infer<typeof DispatchLookup>;
export type RetryDispatch = z.infer<typeof RetryDispatch>;
export type RuleSource = z.infer<typeof RuleSource>;
export type DispatchSource = z.infer<typeof Source>;
export type DispatchSnapshot = z.infer<typeof Snapshot>;
export type DispatchReceipt = z.infer<typeof DispatchReceipt>;
export type TaskDispatchView = z.infer<typeof TaskDispatchView>;
export type StopLookup = z.infer<typeof StopLookup>;
export type StopReceipt = z.infer<typeof StopReceipt>;
export type DispatchRecord = z.infer<typeof DispatchRecord>;
export type OwnedRecord = z.infer<typeof OwnedRecord>;
type UnsealedRecord = Omit<OwnedRecord, "seal">;
type Stored = { record: DispatchRecord; version: string };

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function eventIdOf(dispatchId: string): string {
  return `evt-${fingerprint(dispatchId)}`;
}

export function retryDispatchId(dispatchId: string): string {
  return `retry-${fingerprint(dispatchId)}`;
}

function identityOf({ owner, receipt, requestHash, snapshotHash }: Omit<UnsealedRecord, "identityHash">): string {
  const { taskId, dispatchId, eventId, runId, attempt, acceptedAt } = receipt;
  return fingerprint({ owner, taskId, dispatchId, eventId, runId, attempt, acceptedAt, requestHash, snapshotHash });
}

function seal(record: UnsealedRecord, key: Buffer): string {
  return createHmac("sha256", key).update(canonicalJson(record)).digest("hex");
}

function storageIdOf(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex");
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
  private readonly keyFile: string;
  private readonly index: TaskJournalIndex;
  private readonly released = new Set<string>();

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    machineId: string,
    private readonly changed?: (receipt: DispatchReceipt, op: "created" | "updated") => void,
  ) {
    // 用当前实际目录的文件系统身份定位密钥。复制运行目录也不会用到原目录的密钥。
    const { dev, ino, birthtimeNs } = statSync(files.root, { bigint: true });
    const dirId = fingerprint([dev.toString(), ino.toString(), birthtimeNs.toString()]).slice(0, 32);
    this.keyFile = `runtime/${machineId}/task-dispatch-${dirId}.key`;
    this.index = new TaskJournalIndex(this.files, this.dir, /^evt-[a-f0-9]{64}\.json$/, (file) => {
      const record = this.read(this.eventId(file))?.record;
      return record ? this.groups(record) : null;
    });
  }

  private eventId(file: string) {
    return file.slice(this.dir.length + 1, -5);
  }

  private path(eventId: string) {
    return `${this.dir}/${eventId}.json`;
  }

  private groups(record: DispatchRecord): string[] {
    const { receipt } = record;
    const groups = [`task:${receipt.taskId}`];
    if (this.owns(record)) {
      if (holdsTask(receipt)) groups.push("active");
      else this.released.add(receipt.eventId);
    }
    return groups;
  }

  private selected(group: string, onError?: (error: unknown) => void): DispatchRecord[] {
    return this.index.paths(group, onError).flatMap((file) => {
      try {
        const record = this.read(this.eventId(file))?.record;
        return record ? [record] : [];
      } catch (error) {
        if (!onError) throw error;
        onError(error);
        return [];
      }
    });
  }

  forTask(taskId: string, onError?: (error: unknown) => void): DispatchRecord[] {
    return this.selected(`task:${taskId}`, onError);
  }

  active(onError: (error: unknown) => void): DispatchRecord[] {
    return this.selected("active", onError);
  }

  hasActive(): boolean {
    return this.index.has("active") || this.released.size > 0;
  }

  watch(onChange: () => void): void {
    this.index.onChange = onChange;
  }

  close(): void {
    this.index.close();
  }

  retire(eventId: string): void {
    this.index.exclude(this.path(eventId), "active");
    this.released.add(eventId);
  }

  reactivate(dispatchId: string): void {
    const eventId = eventIdOf(dispatchId);
    const record = this.read(eventId)?.record;
    if (record) this.index.replace(this.path(eventId), this.groups(record));
  }

  releasedReservations(): ReadonlySet<string> {
    return this.released;
  }

  acknowledgeReleased(): void {
    this.released.clear();
  }

  get readOnly(): boolean {
    return this.files.readOnly;
  }

  assertWritable(): void {
    this.files.assertWritable();
  }

  assertNewDispatchSafe(): void {
    this.assertWritable();
    this.index.assertHealthy();
  }

  owns(record: DispatchRecord): record is OwnedRecord {
    return this.ownerKey(record) !== null;
  }

  ownerIssue(record: DispatchRecord): "foreign_vault" | "unverified_owner" {
    return record.schema === 2 && record.owner.vaultId !== this.vaultId ? "foreign_vault" : "unverified_owner";
  }

  private readKey(): Buffer | null {
    const key = this.files.read(this.keyFile)?.bytes;
    if (!key) return null;
    if (key.length !== 32) throw new HuhuError("WRITE_PARTIAL", "任务派遣存储凭据损坏");
    return key;
  }

  private ownerKey(record: DispatchRecord | UnsealedRecord): Buffer | null {
    if (record.schema === 1 || record.owner.vaultId !== this.vaultId) return null;
    const key = this.readKey();
    return key && storageIdOf(key) === record.owner.storageId ? key : null;
  }

  read(eventId: string): Stored | null {
    const rel = this.path(eventId);
    const file = this.files.read(rel);
    if (!file) return null;
    try {
      const record = DispatchRecord.parse(JSON.parse(file.bytes.toString("utf8")));
      const { receipt, snapshot, claim, requestHash, snapshotHash } = record;
      const { taskId, inputHash, inputRevision, expectedVersion, source, allowEarly, newRound, previousRunId, context } = snapshot;
      if (receipt.parentRunId !== (newRound ? previousRunId : "parent" in source ? source.parent?.runId : undefined)) throw new Error("后续运行关联不一致");
      const input = {
        taskId,
        dispatchId: receipt.dispatchId,
        inputHash,
        inputRevision,
        expectedVersion,
        ...(allowEarly !== undefined && { allowEarly }),
        ...(newRound && { newRound }),
        ...(context && { context: { messageIds: context.messages.map(({ id }) => id), artifacts: context.artifacts.map(({ path, expectedVersion }) => ({ path, ...(expectedVersion !== undefined && { expectedVersion }) })) } }),
      };
      if (receipt.eventId !== eventId || eventIdOf(receipt.dispatchId) !== eventId || receipt.taskId !== taskId || !isId(receipt.runId, "run")) throw new Error("派遣身份校验失败");
      const { retryOf } = record;
      if (retryOf ? record.schema !== 2 || receipt.attempt < 2 || retryOf.intent.taskId !== taskId || retryDispatchId(retryOf.intent.dispatchId) !== receipt.dispatchId : receipt.attempt !== 1) {
        throw new Error("重试身份校验失败");
      }
      if (fingerprint(snapshot) !== snapshotHash || fingerprint(retryOf?.intent ?? { input, source }) !== requestHash) throw new Error("请求或快照校验失败");
      if ((receipt.state === "pending" && claim) || (["claimed", "sending", "running", "unknown"].includes(receipt.state) && !claim)) throw new Error("领取状态与记录不符");
      const execution = record.boundExecution;
      if (record.stop && (!execution || receipt.state !== "running")) throw new Error("停止意图的原执行绑定无效");
      if (
        execution &&
        (record.schema !== 2 ||
          execution.vaultId !== record.owner.vaultId ||
          execution.taskId !== taskId ||
          execution.dispatchId !== receipt.dispatchId ||
          execution.runId !== receipt.runId ||
          execution.attempt !== receipt.attempt ||
          execution.sessionBinding.machineId !== claim?.machineId)
      ) {
        throw new Error("执行绑定与派遣记录不符");
      }
      if (record.schema === 2) {
        const { seal: savedSeal, ...unsigned } = record;
        if (identityOf(unsigned) !== unsigned.identityHash) throw new Error("受理身份校验失败");
        const key = this.ownerKey(record);
        if (key && !timingSafeEqual(Buffer.from(savedSeal, "hex"), Buffer.from(seal(unsigned, key), "hex"))) throw new Error("派遣记录签名校验失败");
      }
      return { record, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务派遣记录损坏", { details: { path: rel, eventId } });
    }
  }

  list(onDamaged?: (error: HuhuError) => void): DispatchRecord[] {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(this.dir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return names
      .filter((name) => /^evt-[a-f0-9]{64}\.json$/.test(name))
      .flatMap((name) => {
        const eventId = name.slice(0, -5);
        try {
          const stored = this.read(eventId);
          if (!stored) throw new HuhuError("WRITE_PARTIAL", "任务派遣记录读取期间消失", { details: { eventId } });
          return [stored.record];
        } catch (error) {
          if (!onDamaged || !isHuhuError(error) || error.code !== "WRITE_PARTIAL") throw error;
          onDamaged(error);
          return [];
        }
      });
  }

  async create(fields: z.infer<typeof RecordFields>): Promise<OwnedRecord> {
    // Vault ZIP 保留业务记录。只有同一 Vault 的本机 runtime 保存签名密钥。
    let key = this.readKey();
    if (!key) {
      const generated = randomBytes(32);
      try {
        await this.files.write(this.keyFile, generated, { expectedVersion: null });
        key = generated;
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NAME_CONFLICT") throw error;
        key = this.readKey();
        if (!key) throw error;
      }
    }
    const record = { ...fields, schema: 2 as const, owner: { vaultId: this.vaultId, storageId: storageIdOf(key) } };
    return this.writeSealed({ ...record, identityHash: identityOf(record) }, key, null);
  }

  async write({ seal: _priorSeal, ...record }: OwnedRecord, expectedVersion: string, beforeCommit?: () => void): Promise<OwnedRecord> {
    const key = this.ownerKey(record);
    if (!key) throw new HuhuError("WRITE_PARTIAL", "无法验证任务派遣存储所有者");
    return this.writeSealed(record, key, expectedVersion, beforeCommit);
  }

  private async writeSealed(unsigned: UnsealedRecord, key: Buffer, expectedVersion: string | null, beforeCommit?: () => void): Promise<OwnedRecord> {
    const record = { ...unsigned, seal: seal(unsigned, key) };
    const location = this.path(record.receipt.eventId);
    await this.files.write(location, Buffer.from(`${JSON.stringify(record, null, 2)}\n`), { expectedVersion, ...(beforeCommit && { beforeCommit }) });
    this.index.replace(location, this.groups(record));
    this.changed?.(record.receipt, expectedVersion === null ? "created" : "updated");
    return record;
  }
}
