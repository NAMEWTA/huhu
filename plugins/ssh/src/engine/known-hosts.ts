import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type TrustState = "trusted" | "unknown" | "mismatch";

export function fingerprintSha256(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

const hostToken = (host: string, port: number) => (port === 22 ? host : `[${host}]:${port}`);

/** HUHU 信任的主机密钥（OpenSSH known_hosts 格式）：`<host> <keytype> <base64>`。 */
export class KnownHosts {
  constructor(private readonly file: string) {}

  private entries(): { host: string; type: string; key: string }[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .flatMap((l) => {
        const [host, type, key] = l.split(/\s+/);
        return host && type && key ? [{ host, type, key }] : [];
      });
  }

  check(host: string, port: number, keyType: string, key: Buffer): { state: TrustState; recorded: string[] } {
    const mine = this.entries().filter((e) => e.host === hostToken(host, port));
    if (mine.length === 0) return { state: "unknown", recorded: [] };
    const b64 = key.toString("base64");
    if (mine.some((e) => e.type === keyType && e.key === b64)) return { state: "trusted", recorded: [] };
    return { state: "mismatch", recorded: mine.map((e) => fingerprintSha256(Buffer.from(e.key, "base64"))) };
  }

  trust(host: string, port: number, keyType: string, key: Buffer): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${hostToken(host, port)} ${keyType} ${key.toString("base64")}\n`);
  }
}
