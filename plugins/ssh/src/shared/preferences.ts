import { z } from "zod";

export const ConnectionPreferences = z.strictObject({
  connectTimeoutSec: z.number().min(1).max(300),
  keepaliveIntervalSec: z.int().min(0).max(3600).nullable(),
  keepaliveCountMax: z.int().min(0).max(1000).nullable(),
  autoReconnect: z.boolean().default(false),
});
export type ConnectionPreferences = z.infer<typeof ConnectionPreferences>;
export const TransferPreferences = z.strictObject({ parallel: z.int().min(1).max(8) });
export const defaultRecordingPreferences = { enabled: true, savedLimit: 60 };
export const RecordingPreferences = z.strictObject({ enabled: z.boolean(), savedLimit: z.int().min(1).max(60) });
export type RecordingPreferences = z.infer<typeof RecordingPreferences>;

export const VaultPreferences = z.strictObject({ connection: ConnectionPreferences, transfer: TransferPreferences, recording: RecordingPreferences.default(defaultRecordingPreferences) });
export type VaultPreferences = z.infer<typeof VaultPreferences>;
export const defaultVaultPreferences: VaultPreferences = {
  connection: { connectTimeoutSec: 20, keepaliveIntervalSec: null, keepaliveCountMax: null, autoReconnect: false },
  transfer: { parallel: 2 },
  recording: defaultRecordingPreferences,
};
export const VaultPreferencesSnapshot = z.strictObject({ values: VaultPreferences, revision: z.string().nullable() });
export type VaultPreferencesSnapshot = z.infer<typeof VaultPreferencesSnapshot>;
export const UpdateVaultPreferences = z.strictObject({
  expectedRevision: z.string().nullable(),
  change: z.discriminatedUnion("section", [
    z.strictObject({ section: z.literal("connection"), values: ConnectionPreferences }),
    z.strictObject({ section: z.literal("transfer"), values: TransferPreferences }),
    z.strictObject({ section: z.literal("recording"), values: RecordingPreferences }),
  ]),
});
export type UpdateVaultPreferences = z.infer<typeof UpdateVaultPreferences>;
