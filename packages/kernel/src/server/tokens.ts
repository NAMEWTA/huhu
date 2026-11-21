import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Caller } from "@huhu/contracts";

function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** 令牌 → 调用者身份。只保存哈希，比较用 timingSafeEqual。 */
export class TokenTable {
  private readonly entries: { hash: Buffer; caller: Caller; subject: string; lifetime: AbortController }[] = [];

  /** 生成并登记一个新令牌，返回明文（只此一次）。 */
  issue(caller: Caller): string {
    const token = randomBytes(32).toString("base64url");
    this.entries.push({ hash: digest(token), caller, subject: caller, lifetime: new AbortController() });
    return token;
  }

  /** 登记已有令牌的哈希（HTTP 服务令牌持久化后重载）。 */
  addHash(hashHex: string, caller: Caller, subject: string = caller): void {
    const hash = Buffer.from(hashHex, "hex");
    if (hash.length !== 32) throw new Error("令牌哈希必须是 SHA-256（32 字节）");
    this.entries.push({ hash, caller, subject, lifetime: new AbortController() });
  }

  static hashHex(token: string): string {
    return digest(token).toString("hex");
  }

  /** 撤销某个令牌（按哈希）。 */
  removeHash(hashHex: string): void {
    const h = Buffer.from(hashHex, "hex");
    this.remove((entry) => entry.hash.equals(h));
  }

  revokeCaller(caller: Caller): void {
    this.remove((entry) => entry.caller === caller);
  }

  private remove(matches: (entry: (typeof this.entries)[number]) => boolean): void {
    const removed = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (!matches(entry)) continue;
      this.entries.splice(i, 1);
      removed.push(entry.lifetime);
    }
    for (const lifetime of removed) lifetime.abort();
  }

  authenticate(token: string | undefined): Caller | null {
    return this.principal(token)?.caller ?? null;
  }

  hasPrincipal(caller: Caller, subject: string): boolean {
    return this.entries.some((entry) => entry.caller === caller && entry.subject === subject && !entry.lifetime.signal.aborted);
  }

  principal(token: string | undefined): { caller: Caller; subject: string; signal: AbortSignal } | null {
    if (!token) return null;
    const h = digest(token);
    let found: (typeof this.entries)[number] | undefined;
    for (const e of this.entries) if (timingSafeEqual(e.hash, h)) found = e; // 遍历全部，避免提前返回的时序差异
    return found ? { caller: found.caller, subject: found.subject, signal: found.lifetime.signal } : null;
  }
}
