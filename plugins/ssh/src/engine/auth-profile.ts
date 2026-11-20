import { z } from "zod";

export const SshHostProfile = z.object({
  name: z.string(),
  host: z.string(),
  port: z.int().min(1).max(65535).default(22),
  user: z.string(),
  jumpHostIds: z.array(z.string()).max(1).default([]),
  tags: z.array(z.string()).default([]),
  connectTimeoutSec: z.number().min(1).max(300).optional(),
  keepaliveIntervalSec: z.int().min(0).max(3600).optional(),
  keepaliveCountMax: z.int().min(0).max(1000).optional(),
});
export type SshHostProfile = z.infer<typeof SshHostProfile>;
const LegacyProfile = { ...SshHostProfile.shape, jumpHostIds: z.array(z.string()).default([]) };
const legacyAuthKind = z.enum(["key", "password", "agent"]);
export const LegacyHostRecord = z.object({ ...LegacyProfile, id: z.string(), auth: z.object({ kind: legacyAuthKind }) });
export const LegacyHostView = LegacyHostRecord.extend({
  auth: z.object({ kind: legacyAuthKind, source: z.literal("legacy") }),
  repairRequired: z.literal(true),
});

const AuthKind = z.enum(["password", "key", "agent", "identity-file"]);
export type AuthKind = z.infer<typeof AuthKind>;
const Purpose = z.enum(["password", "privateKey", "passphrase", "identityFile"]);
export type Purpose = z.infer<typeof Purpose>;
const CredentialPatch = z.discriminatedUnion("action", [
  z.strictObject({ purpose: Purpose, action: z.literal("keep") }),
  z.strictObject({ purpose: Purpose, action: z.literal("replace"), value: z.string().min(1), reconfigure: z.literal(true).optional() }),
  z.strictObject({ purpose: Purpose, action: z.literal("clear") }),
]);

export const OwnedHostId = z.string().regex(/^host-owned-[a-f0-9]{32}$/);
const Revision = z.uuidv4();
const CredentialState = z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"]);
const AuthState = z.record(z.string(), CredentialState);

export const HostDefinition = z.strictObject({ ...SshHostProfile.shape, format: z.literal(1), configId: z.uuidv4(), authKind: AuthKind });
export type HostDefinition = z.infer<typeof HostDefinition>;
export const ConfigureHost = z.strictObject({ ...SshHostProfile.shape, hostId: OwnedHostId.optional(), expectedRevision: Revision.nullable(), authKind: AuthKind, credentials: z.array(CredentialPatch).default([]) });
export type ConfigureHost = z.infer<typeof ConfigureHost>;
export const HostRevision = z.strictObject({ hostId: OwnedHostId, expectedRevision: Revision });
export const CopyHost = HostRevision.extend({ name: z.string() });
export const HostAuthSummary = z.object({ hostId: OwnedHostId, revision: Revision, authKind: AuthKind, configured: z.boolean(), authState: AuthState });
export const ManagedHostView = z.object({
  ...SshHostProfile.shape,
  id: OwnedHostId,
  auth: z.object({ kind: AuthKind, source: z.literal("ssh") }),
  revision: Revision,
  authState: AuthState,
  configured: z.boolean(),
});

export const purposes: Record<AuthKind, readonly Purpose[]> = {
  password: ["password"],
  key: ["privateKey", "passphrase"],
  agent: [],
  "identity-file": ["identityFile", "passphrase"],
};
