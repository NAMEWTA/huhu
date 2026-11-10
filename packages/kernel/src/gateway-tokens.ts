import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { newId } from "@huhu/contracts";
import { TokenTable } from "./server/tokens.js";

export interface HttpToken { id: string; name: string; hash: string; createdAt: string }

/** HTTP 服务令牌：`gateways.json` 只保存哈希；明文只在创建时返回一次，身份为 `http`。 */
export class GatewayTokens {
  constructor(private readonly file: string, private readonly table: TokenTable, private readonly now: () => Date = () => new Date()) {
    for (const t of this.load().tokens ?? []) this.table.addHash(t.hash, "http");
  }

  private load(): { tokens: HttpToken[] } & Record<string, unknown> {
    try {
      return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as { tokens: HttpToken[] }) : { tokens: [] };
    } catch {
      return { tokens: [] };
    }
  }

  list(): Omit<HttpToken, "hash">[] {
    return (this.load().tokens ?? []).map(({ hash: _h, ...rest }) => rest);
  }

  create(name: string): { id: string; token: string } {
    const all = this.load();
    const token = `huhu_${randomBytes(24).toString("base64url")}`;
    const hash = TokenTable.hashHex(token);
    const rec: HttpToken = { id: newId("cap").replace("cap", "tok"), name, hash, createdAt: this.now().toISOString() };
    this.write({ ...all, tokens: [...(all.tokens ?? []), rec] });
    this.table.addHash(hash, "http");
    return { id: rec.id, token };
  }

  /** 撤销：从持久化与内存令牌表中移除。 */
  revoke(id: string): boolean {
    const all = this.load();
    const rec = (all.tokens ?? []).find((t) => t.id === id);
    if (!rec) return false;
    this.write({ ...all, tokens: all.tokens.filter((t) => t.id !== id) });
    this.table.removeHash(rec.hash);
    return true;
  }

  private write(v: unknown): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(v, null, 2));
  }
}
