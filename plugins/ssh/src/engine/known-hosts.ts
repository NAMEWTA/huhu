import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import type { KnownHostKey } from "../shared/trust.js";

export type TrustState = "trusted" | "unknown" | "mismatch";

export function fingerprintSha256(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

const hostToken = (host: string, port: number) => (port === 22 ? host : `[${host}]:${port}`);
type Entry = { host: string; type: string; key: string };
type Snapshot = { text: string; version: string | null };

function entryOf(line: string): Entry | undefined {
  const [host, type, key] = line.trim().split(/\s+/);
  if (!host || !type || !key || /^[#@|]/.test(host) || host.includes(",")) return;
  return { host, type, key };
}

function identity(entry: Entry): KnownHostKey {
  const bracketed = /^\[(.+)\]:(\d+)$/.exec(entry.host);
  return {
    host: bracketed?.[1] ?? entry.host,
    port: bracketed ? Number(bracketed[2]) : 22,
    keyType: entry.type,
    fingerprint: fingerprintSha256(Buffer.from(entry.key, "base64")),
  };
}

function verdict(text: string, host: string, port: number, keyType: string, key: Buffer): { state: TrustState; recorded: string[] } {
  const token = hostToken(host, port);
  const mine = text
    .split("\n")
    .map(entryOf)
    .filter((entry): entry is Entry => entry?.host === token);
  if (!mine.length) return { state: "unknown", recorded: [] };
  const b64 = key.toString("base64");
  if (mine.some((e) => e.type === keyType && e.key === b64)) return { state: "trusted", recorded: [] };
  return { state: "mismatch", recorded: [...new Set(mine.map((entry) => identity(entry).fingerprint))] };
}

/** HUHU 信任的主机密钥（OpenSSH known_hosts 格式）：`<host> <keytype> <base64>`。 */
export class KnownHosts {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly relative: string | undefined;

  constructor(
    private readonly file: string,
    private readonly files?: HuhuApi["vault"]["files"],
  ) {
    this.relative = files && path.relative(files.root, file).split(path.sep).join("/");
  }

  private read(): Snapshot {
    if (this.files && this.relative) {
      const current = this.files.read(this.relative);
      if (!current && this.files.exists(this.relative)) throw errors.invalidInput("已知主机路径应为普通文件");
      return current ? { text: current.bytes.toString("utf8"), version: current.version } : { text: "", version: null };
    }
    return { text: existsSync(this.file) ? readFileSync(this.file, "utf8") : "", version: null };
  }

  private async write(text: string, version: string | null, beforeCommit?: () => void): Promise<void> {
    if (this.files && this.relative) {
      await this.files.write(this.relative, Buffer.from(text), { expectedVersion: version, ...(beforeCommit && { beforeCommit }) });
      return;
    }
    mkdirSync(path.dirname(this.file), { recursive: true });
    beforeCommit?.();
    writeFileSync(this.file, text);
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  check(host: string, port: number, keyType: string, key: Buffer) {
    return verdict(this.read().text, host, port, keyType, key);
  }

  /** 在消费决定时复核，避免并发首次确认把另一把密钥写入相同主机和端口。 */
  approve(host: string, port: number, keyType: string, key: Buffer, remember: boolean, signal: AbortSignal) {
    return this.mutate(async () => {
      signal.throwIfAborted();
      const { text, version } = this.read();
      const check = verdict(text, host, port, keyType, key);
      if (remember && check.state === "unknown") {
        const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
        await this.write(`${prefix}${hostToken(host, port)} ${keyType} ${key.toString("base64")}\n`, version);
      }
      return check;
    });
  }

  list(): KnownHostKey[] {
    const keys = new Map<string, KnownHostKey>();
    for (const line of this.read().text.split("\n")) {
      const entry = entryOf(line);
      if (!entry) continue;
      const key = identity(entry);
      if (key.port >= 1 && key.port <= 65535) keys.set(JSON.stringify(key), key);
    }
    return [...keys.values()];
  }

  forget(key: KnownHostKey, assertCurrent?: () => void): Promise<void> {
    return this.mutate(async () => {
      assertCurrent?.();
      const { text, version } = this.read();
      const token = hostToken(key.host, key.port);
      const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
      const retained = lines.filter((line) => {
        const entry = entryOf(line);
        return !(entry?.host === token && entry.type === key.keyType && identity(entry).fingerprint === key.fingerprint);
      });
      if (retained.length === lines.length) throw errors.notFound("这条已知主机记录已变更，请重新核对。");
      await this.write(retained.join(""), version, assertCurrent);
    });
  }
}
