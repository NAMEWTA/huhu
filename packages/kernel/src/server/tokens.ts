import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Caller } from "@huhu/contracts";

function digest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** 令牌 → 调用者身份。只保存哈希，比较用 timingSafeEqual。 */
export class TokenTable {
  private readonly entries: { hash: Buffer; caller: Caller }[] = [];

  /** 生成并登记一个新令牌，返回明文（只此一次）。 */
  issue(caller: Caller): string {
    const token = randomBytes(32).toString("base64url");
    this.entries.push({ hash: digest(token), caller });
    return token;
  }

  /** 登记已有令牌的哈希（HTTP 服务令牌持久化后重载）。 */
  addHash(hashHex: string, caller: Caller): void {
    this.entries.push({ hash: Buffer.from(hashHex, "hex"), caller });
  }

  static hashHex(token: string): string {
    return digest(token).toString("hex");
  }

  revokeCaller(caller: Caller): void {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]?.caller === caller) this.entries.splice(i, 1);
  }

  authenticate(token: string | undefined): Caller | null {
    if (!token) return null;
    const h = digest(token);
    let found: Caller | null = null;
    for (const e of this.entries) if (timingSafeEqual(e.hash, h)) found = e.caller; // 遍历全部，避免提前返回的时序差异
    return found;
  }
}
