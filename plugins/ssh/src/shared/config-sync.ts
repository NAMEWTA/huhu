import { z } from "zod";

export const configFields = ["ProxyJump", "IdentityFile", "ServerAliveInterval", "ServerAliveCountMax"] as const;
export const ConfigField = z.enum(configFields);
export type ConfigField = z.infer<typeof ConfigField>;
export const ConfigSyncSource = z.strictObject({
  path: z.string().min(1).max(4096),
  alias: z.string().regex(/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]{0,254}$/),
  hostId: z.string().regex(/^host-owned-[a-f0-9]{32}$/),
});
const ConfigSyncRow = z.strictObject({
  field: ConfigField,
  file: z.string().nullable(),
  huhu: z.string().nullable(),
  change: z.enum(["same", "file", "huhu", "conflict", "unbound"]),
  unavailable: z.string().optional(),
});
export const ConfigSyncPreview = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  comparison: z.string().regex(/^[a-f0-9]{64}$/),
  stateRevision: z.string().nullable(),
  hostRevision: z.uuidv4(),
  rows: z.array(ConfigSyncRow),
});
export type ConfigSyncPreview = z.infer<typeof ConfigSyncPreview>;
export const ApplyConfigSync = ConfigSyncSource.extend({
  ...ConfigSyncPreview.pick({ fingerprint: true, comparison: true, stateRevision: true, hostRevision: true }).shape,
  direction: z.enum(["file-to-huhu", "huhu-to-file", "establish"]),
  field: ConfigField,
});
