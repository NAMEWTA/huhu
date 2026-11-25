import { z } from "zod";
import { PlanOccurrenceLinkSchema } from "./automation-plan.js";

const change = z.enum(["created", "modified", "deleted", "renamed"]);
export const VaultIndexEntrySchema = z.object({ path: z.string(), type: z.enum(["file", "dir"]), size: z.number(), mtimeMs: z.number() });
const indexRevision = z.int().nonnegative();
export const VaultIndexSnapshotSchema = z.object({ revision: indexRevision, entries: z.array(VaultIndexEntrySchema) });
export type VaultIndexSnapshot = z.infer<typeof VaultIndexSnapshotSchema>;
export const NoteIndexDeltaSchema = z.object({ before: indexRevision, revision: indexRevision, entry: VaultIndexEntrySchema, tagsChanged: z.boolean() });
export type NoteIndexDelta = z.infer<typeof NoteIndexDeltaSchema>;

const op = z.enum(["created", "updated", "deleted"]);

/** 事件类型与 payload；interfaces.md §5 的唯一实现。 */
export const EVENT_PAYLOADS = {
  "vault.fileChanged": z.object({ path: z.string(), kind: z.string().optional(), id: z.string().optional(), change, from: z.string().optional(), writeId: z.string().optional(), version: z.string().optional(), noteIndex: NoteIndexDeltaSchema.optional() }),
  /** 目录（含空目录）被创建 / 删除 / 改名：资源目录（vault.list）据此失效。 */
  "vault.dirChanged": z.object({ path: z.string() }),
  "entity.changed": z.object({ kind: z.string(), id: z.string(), op, sourcePlugin: z.string().optional(), /** 档案等按路径标识的实体：文件夹路径与其 index.md 的笔记 id。 */ path: z.string().optional(), noteId: z.string().nullable().optional() }),
  /** 保险箱解锁成功（依赖保险箱凭据而暂停的功能据此恢复）。 */
  "safe.unlocked": z.object({}),
  "safe.locked": z.object({ instanceId: z.uuid(), generation: z.int().nonnegative(), reason: z.enum(["manual", "auto", "leave", "close", "corrupt"]) }),
  "plugin.stateChanged": z.object({ id: z.string(), state: z.enum(["active", "disabled", "failed"]), error: z.string().optional() }),
  "task.statusChanged": z.object({ taskId: z.string(), status: z.enum(["not_started", "in_progress", "completed"]), previous: z.enum(["not_started", "in_progress", "completed"]) }),
  "task.inputChanged": z.object({ taskId: z.string(), inputRevision: z.number().int(), inputHash: z.string() }),
  "automation.activated": z.object({ ruleId: z.string(), activationId: z.string(), trigger: z.string() }),
  "run.stateChanged": z.object({ runId: z.string(), kind: z.enum(["task-run", "automation-run"]), state: z.string() }),
  "reminder.due": z.object({ taskId: z.string(), reminderId: z.string(), title: z.string() }),
  "notification.created": z.object({ id: z.string(), title: z.string(), module: z.string(), occurrence: PlanOccurrenceLinkSchema.optional() }),
  "agent.sessionChanged": z.object({ sessionId: z.string(), state: z.string() }),
  "ssh.connectionChanged": z.object({ hostId: z.string(), state: z.string() }),
  "ssh.hostKeyPrompt": z.object({ attemptId: z.string(), hostId: z.string(), hop: z.number().int(), fingerprint: z.string(), keyType: z.string(), reason: z.enum(["first", "changed"]) }),
  "sync.statusChanged": z.object({ status: z.string(), ahead: z.number().int(), behind: z.number().int(), conflicts: z.number().int(), pausedReason: z.string().optional() }),
  "engine.closing": z.object({}),
} as const;

export type EventType = keyof typeof EVENT_PAYLOADS;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_PAYLOADS)[T]>;

export interface HuhuEvent<T extends EventType = EventType> {
  id: string;
  vaultId: string;
  type: T;
  at: string;
  payload: EventPayload<T>;
}

export const EventEnvelopeSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  type: z.string(),
  at: z.string(),
  payload: z.unknown(),
  seq: z.number().int().optional(),
});
