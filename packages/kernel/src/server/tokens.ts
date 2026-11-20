import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Caller } from "@huhu/contracts";

function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** 令牌 → 调用者身份。只保存哈希，比较用 timingSafeEqual。 */
export class TokenTable {
  private readonly entries: { hash: Buffer; caller: Caller; subject: string }[] = [];

  /** 生成并登记一个新令牌，返回明文（只此一次）。 */
  issue(caller: Caller): string {
    const token = randomBytes(32).toString("base64url");
    this.entries.push({ hash: digest(token), caller, subject: caller });
    return token;
  }

  /** 登记已有令牌的哈希（HTTP 服务令牌持久化后重载）。 */
  addHash(hashHex: string, caller: Caller, subject: string = caller): void {
    const hash = Buffer.from(hashHex, "hex");
    if (hash.length !== 32) throw new Error("令牌哈希必须是 SHA-256（32 字节）");
    this.entries.push({ hash, caller, subject });
  }

  static hashHex(token: string): string {
    return digest(token).toString("hex");
  }

  /** 撤销某个令牌（按哈希）。 */
  removeHash(hashHex: string): void {
    const h = Buffer.from(hashHex, "hex");
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]?.hash.equals(h)) this.entries.splice(i, 1);
  }

  revokeCaller(caller: Caller): void {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]?.caller === caller) this.entries.splice(i, 1);
  }

  authenticate(token: string | undefined): Caller | null {
    return this.principal(token)?.caller ?? null;
  }

  principal(token: string | undefined): { caller: Caller; subject: string } | null {
    if (!token) return null;
    const h = digest(token);
    let found: (typeof this.entries)[number] | undefined;
    for (const e of this.entries) if (timingSafeEqual(e.hash, h)) found = e; // 遍历全部，避免提前返回的时序差异
    return found ? { caller: found.caller, subject: found.subject } : null;
  }
}
