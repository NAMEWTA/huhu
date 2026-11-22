import { z } from "zod";

export const RecordingSummary = z.strictObject({
  id: z.uuidv4(),
  shellId: z.string(),
  hostId: z.string(),
  label: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  truncated: z.boolean(),
  reason: z.enum(["stopped", "shell-ended", "vault-closed"]).nullable(),
});
export type RecordingSummary = z.infer<typeof RecordingSummary>;
export const RecordingContent = z.strictObject({ summary: RecordingSummary, text: z.string() });
export type RecordingContent = z.infer<typeof RecordingContent>;
