import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const MAGIC = Buffer.from("HUHU\x01", "binary");
const IV_LEN = 12;
const TAG_LEN = 16;

export const KDF_PARAMS = { name: "scrypt" as const, N: 2 ** 17, r: 8, p: 1 };

export interface Kdf {
  name: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
}

/** scrypt 派生 32 字节 KEK；maxmem 256 MiB。 */
export function deriveKek(password: string, kdf: Kdf): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), Buffer.from(kdf.salt, "base64"), 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export function newKdf(params: { N: number; r: number; p: number } = KDF_PARAMS): Kdf {
  return { name: "scrypt", N: params.N, r: params.r, p: params.p, salt: randomBytes(16).toString("base64") };
}

/** 封装：`HUHU\x01 | iv(12) | tag(16) | 密文`，AAD 绑定上下文（如 itemId）。 */
export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

/** 解封；认证失败（密码错误、被篡改、AAD 不符）抛出 SealError。 */
export class SealError extends Error {}
export function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
  if (sealed.length < MAGIC.length + IV_LEN + TAG_LEN || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new SealError("格式无效");
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = sealed.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const ct = sealed.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  try {
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch {
    throw new SealError("认证失败");
  }
}

export function keyCheck(dk: Buffer): string {
  return createHmac("sha256", dk).update("huhu-safe/check").digest("base64");
}

export function checkMatches(dk: Buffer, expected: string): boolean {
  const a = Buffer.from(keyCheck(dk));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newDataKey = (): Buffer => randomBytes(32);
