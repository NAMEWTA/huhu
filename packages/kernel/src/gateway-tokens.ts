import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { newId } from "@huhu/contracts";
import { TokenTable } from "./server/tokens.js";

export interface HttpToken { id: string; name: string; hash: string; createdAt: string }

/** HTTP 服务令牌：`gateways.json` 只保存哈希；明文只在创建时返回一次，身份为 `http`。 */
export class GatewayTokens {
  constructor(private readonly file: string, private readonly table: TokenTable, private readonly now: () => Date = () => new Date(), private readonly onRevoked?: () => void) {
    try {
      for (const t of this.load().tokens ?? []) this.table.addHash(t.hash, "http");
    } catch {
      // 文件损坏：启动时不加载任何 HTTP 令牌（不会覆盖原文件）
    }
  }

  private load(): { tokens: HttpToken[] } & Record<string, unknown> {
    if (!existsSync(this.file)) return { tokens: [] };
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as { tokens: HttpToken[] };
    } catch {
      // 不静默当作空表：随后的写入会覆盖掉原文件，让所有令牌无声失效
      throw new Error("gateways.json 无法解析，请修复或删除后重试");
    }
  }

  /** MCP 服务配置：与令牌同在 gateways.json；默认关闭。 */
  mcp(): { enabled: boolean; transport: "stdio" | "http" } {
    try {
      const m = (this.load() as { mcp?: { enabled?: boolean; transport?: string } }).mcp;
      return { enabled: m?.enabled === true, transport: m?.transport === "http" ? "http" : "stdio" };
    } catch {
      return { enabled: false, transport: "stdio" };
    }
  }

  setMcp(cfg: { enabled: boolean; transport: "stdio" | "http" }): void {
    this.write({ ...this.load(), mcp: cfg });
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
    this.onRevoked?.(); // 关闭该身份已建立的连接
    return true;
  }

  private write(v: unknown): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(v, null, 2));
    renameSync(tmp, this.file); // 原子替换
  }
}
