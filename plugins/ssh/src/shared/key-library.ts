import { z } from "zod";

export const SshKeyId = z.uuidv4();
export const SshKeySummary = z.strictObject({
  id: SshKeyId,
  revision: z.uuidv4(),
  name: z.string(),
  keyType: z.string(),
  publicKey: z.string(),
  fingerprint: z.string(),
  encrypted: z.boolean(),
  available: z.boolean(),
  referenced: z.boolean(),
});
export type SshKeySummary = z.infer<typeof SshKeySummary>;

const name = z.string().trim().min(1).max(120);
const passphrase = z.string().min(1).max(1024).optional();
export const AddSshKey = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("generate"), name, passphrase }),
  z.strictObject({ action: z.literal("import"), name, passphrase, privateKey: z.string().min(1).max(1024 * 1024) }),
]);
export type AddSshKey = z.infer<typeof AddSshKey>;

export const RemoveSshKey = SshKeySummary.pick({ id: true, revision: true });
