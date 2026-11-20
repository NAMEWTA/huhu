import { z } from "zod";
import { FileSession } from "./files.js";

const TransferPath = z.string().min(1).max(32767);
const Local = z.strictObject({ kind: z.literal("local"), path: TransferPath });
const Remote = z.strictObject({ kind: z.literal("remote"), fileSessionId: z.uuid(), path: TransferPath });
export const TransferEndpoint = z.discriminatedUnion("kind", [Local, Remote]);
export type TransferEndpoint = z.infer<typeof TransferEndpoint>;
export const TransferRequest = z.strictObject({ source: TransferEndpoint, target: TransferEndpoint });
export type TransferRequest = z.infer<typeof TransferRequest>;
export const TransferId = z.strictObject({ transferId: z.uuid() });
export const TransferLocation = FileSession.extend({ transferPath: z.string() });
export type TransferLocation = z.infer<typeof TransferLocation>;
const Origin = z.discriminatedUnion("kind", [Local, Remote.extend({ session: FileSession })]);
export type TransferOrigin = z.infer<typeof Origin>;
export const TransferState = z.enum(["queued", "checking", "waiting", "running", "paused", "committing", "cancelling", "completed", "failed", "cancelled", "skipped"]);
export const TransferJob = TransferId.extend({
  source: Origin,
  target: Origin,
  state: TransferState,
  bytes: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
  bytesPerSecond: z.number().nonnegative(),
  message: z.string().optional(),
  errorCode: z.string().optional(),
});
export type TransferJob = z.infer<typeof TransferJob>;
export const TransferChoice = z.enum(["replace", "resume", "reject", "skip"]);
export const TransferQueue = z.object({ jobs: z.array(TransferJob), liveLimit: z.number(), parallel: z.number(), canQueue: z.boolean() });
export type TransferQueue = z.infer<typeof TransferQueue>;
