import { z } from "zod";

export const AuthKind = z.enum(["password", "key", "agent", "identity-file"]);
export type AuthKind = z.infer<typeof AuthKind>;
export const Purpose = z.enum(["password", "privateKey", "passphrase", "identityFile"]);
export type Purpose = z.infer<typeof Purpose>;
export const purposes: Record<AuthKind, readonly Purpose[]> = {
  password: ["password"],
  key: ["privateKey", "passphrase"],
  agent: [],
  "identity-file": ["identityFile", "passphrase"],
};
