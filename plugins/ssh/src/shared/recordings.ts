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
  savePending: z.literal(true).optional(),
});
export type RecordingSummary = z.infer<typeof RecordingSummary>;

export const maxRecordingCheckpoints = 2048;
const PlaybackCheckpoint = z.strictObject({ atMs: z.int().positive(), end: z.int().positive() });
export type PlaybackCheckpoint = z.infer<typeof PlaybackCheckpoint>;

export const RecordingTimeline = z.strictObject({
  durationMs: z.int().nonnegative(),
  checkpoints: z.array(PlaybackCheckpoint).max(maxRecordingCheckpoints),
});
export type RecordingTimeline = z.infer<typeof RecordingTimeline>;

export const RecordingContent = z.strictObject({
  summary: RecordingSummary,
  text: z.string(),
  timeline: RecordingTimeline.optional(),
});
export type RecordingContent = z.infer<typeof RecordingContent>;
