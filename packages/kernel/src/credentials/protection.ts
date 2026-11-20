import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("HUHU-CRED\x01", "binary");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class LocalProtectionError extends Error {
  constructor(readonly reason: "locked" | "denied" | "unavailable") {
    super(reason);
  }
}

/** Engine adapter for an OS-protected key store. Key IDs are chosen by the transaction owner. */
export interface LocalCredentialProtection {
  /** Return a caller-owned key buffer, or null only when the exact entry is absent. */
  read(keyId: string): Promise<Buffer | null>;
  /** Create a new entry. The caller retains ownership of the buffer. */
  create(keyId: string, key: Buffer): Promise<void>;
  /** Delete the exact entry. An already absent entry also counts as success. */
  remove(keyId: string): Promise<void>;
}

export type CredentialErrorCode = "invalid-input" | "conflict" | "not-found" | "unconfigured" | "unbound" | "missing-key" | "locked" | "denied" | "unavailable" | "corrupt" | "storage-failed" | "operation-failed" | "cancelled";

export class CredentialError extends Error {
  constructor(readonly code: CredentialErrorCode) {
    super(code);
  }
}

export const newDataKey = (): Buffer => randomBytes(KEY_LENGTH);

// Same AES-256-GCM construction as Safe, with an independent envelope and AAD domain.
export function seal(key: Buffer, value: string, aad: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function open(key: Buffer, envelope: Buffer, aad: string): string {
  const ivEnd = MAGIC.length + IV_LENGTH;
  const tagEnd = ivEnd + TAG_LENGTH;
  if (key.length !== KEY_LENGTH || envelope.length <= tagEnd || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new CredentialError("corrupt");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(MAGIC.length, ivEnd), { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(envelope.subarray(ivEnd, tagEnd));
    const bytes = decipher.update(envelope.subarray(tagEnd));
    try {
      decipher.final();
      const value: unknown = JSON.parse(bytes.toString("utf8"));
      if (typeof value !== "string") throw new CredentialError("corrupt");
      return value;
    } finally {
      bytes.fill(0);
    }
  } catch {
    throw new CredentialError("corrupt");
  }
}
