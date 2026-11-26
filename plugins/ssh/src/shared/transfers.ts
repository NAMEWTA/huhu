import { z } from "zod";
import { FileSession } from "./files.js";

const TransferPath = z.string().min(1).max(32767);
const Local = z.strictObject({ kind: z.literal("local"), path: TransferPath });
const Remote = z.strictObject({ kind: z.literal("remote"), fileSessionId: z.uuid(), path: TransferPath, sudo: z.literal(true).optional(), sudoSessionId: z.uuid().optional() });
export const TransferEndpoint = z.discriminatedUnion("kind", [Local, Remote]);
export type TransferEndpoint = z.infer<typeof TransferEndpoint>;
export const TransferRequest = z.strictObject({ source: TransferEndpoint, target: TransferEndpoint });
export type TransferRequest = z.infer<typeof TransferRequest>;
export const TransferBatchRequest = z.strictObject({
  source: TransferEndpoint,
  target: TransferEndpoint,
  names: z.array(z.string().min(1).max(255)).min(1).max(32),
  localFileSessionId: z.uuid().optional(),
});
export type TransferBatchRequest = z.infer<typeof TransferBatchRequest>;
export const TransferId = z.strictObject({ transferId: z.uuid() });
export const TransferLocation = FileSession.extend({ transferPath: z.string() });
export type TransferLocation = z.infer<typeof TransferLocation>;
const Origin = z.discriminatedUnion("kind", [Local, Remote.extend({ session: FileSession })]);
export type TransferOrigin = z.infer<typeof Origin>;
export const TransferState = z.enum(["queued", "checking", "waiting", "running", "paused", "committing", "uncertain", "cancelling", "completed", "failed", "cancelled", "skipped"]);
export const TransferJob = TransferId.extend({
  source: Origin,
  target: Origin,
  state: TransferState,
  bytes: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
  bytesPerSecond: z.number().nonnegative(),
  message: z.string().optional(),
  errorCode: z.string().optional(),
  recovery: z.object({ stagingPath: TransferPath, backupPath: TransferPath.optional() }).optional(),
  conflictRevision: z.uuid().optional(),
  directory: z.boolean().optional(),
  batchId: z.uuid().optional(),
});
export type TransferJob = z.infer<typeof TransferJob>;
export const TransferChoice = z.enum(["replace", "resume", "reject", "skip", "merge"]);
export const TransferBatch = z.object({
  batchId: z.uuid(),
  source: Origin,
  target: Origin,
  children: z.array(z.uuid()),
  state: z.enum(["active", "completed", "partial", "failed"]),
});
export type TransferBatch = z.infer<typeof TransferBatch>;
export const TransferQueue = z.object({ jobs: z.array(TransferJob), batches: z.array(TransferBatch), liveLimit: z.number(), parallel: z.number(), canQueue: z.boolean() });
export type TransferQueue = z.infer<typeof TransferQueue>;
