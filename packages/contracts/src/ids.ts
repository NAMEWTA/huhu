import { randomInt } from "node:crypto";

export const ID_PREFIXES = ["note", "task", "run", "rule", "arun", "cap", "cmt", "space", "host", "item"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomSuffix(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** 生成 `<前缀>-<base36 时间戳><4 位随机>`。 */
export function newId(prefix: IdPrefix, now: number = Date.now()): string {
  return `${prefix}-${now.toString(36)}${randomSuffix(4)}`;
}

export function newVaultId(): string {
  return `vault-${randomSuffix(12)}`;
}

export function parseId(id: string): { prefix: IdPrefix; body: string } | null {
  const m = /^([a-z]+)-([0-9a-z]{5,})$/.exec(id);
  if (!m) return null;
  const prefix = m[1] as IdPrefix;
  return (ID_PREFIXES as readonly string[]).includes(prefix) ? { prefix, body: m[2] as string } : null;
}

export function isId(id: string, prefix?: IdPrefix): boolean {
  const p = parseId(id);
  return p !== null && (prefix === undefined || p.prefix === prefix);
}
