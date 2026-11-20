import { z } from "zod";

export const ConnectionPreferences = z.strictObject({
  connectTimeoutSec: z.number().min(1).max(300),
  keepaliveIntervalSec: z.int().min(0).max(3600).nullable(),
  keepaliveCountMax: z.int().min(0).max(1000).nullable(),
});
export type ConnectionPreferences = z.infer<typeof ConnectionPreferences>;
export const TransferPreferences = z.strictObject({ parallel: z.int().min(1).max(8) });

export const VaultPreferences = z.strictObject({ connection: ConnectionPreferences, transfer: TransferPreferences });
export type VaultPreferences = z.infer<typeof VaultPreferences>;
export const defaultVaultPreferences: VaultPreferences = {
  connection: { connectTimeoutSec: 20, keepaliveIntervalSec: null, keepaliveCountMax: null },
  transfer: { parallel: 2 },
};
export const VaultPreferencesSnapshot = z.strictObject({ values: VaultPreferences, revision: z.string().nullable() });
export type VaultPreferencesSnapshot = z.infer<typeof VaultPreferencesSnapshot>;
export const UpdateVaultPreferences = z.strictObject({
  expectedRevision: z.string().nullable(),
  change: z.discriminatedUnion("section", [z.strictObject({ section: z.literal("connection"), values: ConnectionPreferences }), z.strictObject({ section: z.literal("transfer"), values: TransferPreferences })]),
});
export type UpdateVaultPreferences = z.infer<typeof UpdateVaultPreferences>;
