import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import type { KnownHostAuthorities, KnownHostAuthority, KnownHostKey } from "../shared/trust.js";
import { OPENSSH_ED25519_CERT, parseEd25519Authority, verifyHostCertificate, type HostCertificateFailure } from "./host-certificate.js";
import { knownHostRule, matchesKnownHostScope, type KnownHostRule } from "./known-host-rules.js";

export type TrustBlock = HostCertificateFailure | "certificate-required" | "invalid-host-policy";
type TrustDecision = { state: "trusted"; key: Buffer; authority?: Buffer } | { state: "unknown" } | { state: "mismatch"; key: Buffer; recorded: string[] } | { state: "blocked"; reason: TrustBlock };

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

function fingerprintVerdict(text: string, token: string, keyType: string, key: Buffer): TrustDecision {
  const mine = text
    .split("\n")
    .map(entryOf)
    .filter((entry): entry is Entry => entry?.host.toLowerCase() === token.toLowerCase());
  if (!mine.length) return { state: "unknown" };
  const b64 = key.toString("base64");
  if (mine.some((e) => e.type === keyType && e.key === b64)) return { state: "trusted", key };
  return { state: "mismatch", key, recorded: [...new Set(mine.map((entry) => identity(entry).fingerprint))] };
}

function rules(text: string, token: string): KnownHostRule[] {
  return text.split("\n").flatMap((line) => {
    const rule = knownHostRule(line);
    return rule && matchesKnownHostScope(rule.scope, token) ? [rule] : [];
  });
}

function authorityKey(rule: KnownHostRule): Buffer | undefined {
  if (rule.marker !== "@cert-authority" || rule.keyType !== "ssh-ed25519" || !rule.key) return;
  try {
    return parseEd25519Authority(`${rule.keyType} ${rule.key.toString("base64")}`);
  } catch {
    return undefined;
  }
}

function verdict(text: string, host: string, port: number, keyType: string, key: Buffer, now: Date): TrustDecision {
  const token = hostToken(host, port);
  const policy = rules(text, token);
  if (policy.some(({ key, keyType }) => !key || !keyType)) return { state: "blocked", reason: "invalid-host-policy" };
  const revoked = policy.flatMap(({ marker, key }) => (marker === "@revoked" && key ? [key] : []));
  if (revoked.some((revokedKey) => revokedKey.equals(key))) return { state: "blocked", reason: "revoked" };
  if (keyType === OPENSSH_ED25519_CERT) {
    const trusted = policy.map(authorityKey).filter((key) => key !== undefined);
    const certificate = verifyHostCertificate(key, host, now, trusted, revoked);
    if (!certificate.ok) return { state: "blocked", reason: certificate.reason };
    const pinned = fingerprintVerdict(text, token, "ssh-ed25519", certificate.leafKey);
    if (pinned.state === "mismatch") return pinned;
    return { state: "trusted", key: certificate.leafKey, authority: certificate.authorityKey };
  }
  if (policy.some(({ marker }) => marker === "@cert-authority")) return { state: "blocked", reason: "certificate-required" };
  return fingerprintVerdict(text, token, keyType, key);
}

function authorityOf(line: string): KnownHostAuthority | undefined {
  const rule = knownHostRule(line);
  if (rule?.marker !== "@cert-authority" || !rule.key || !rule.keyType) return;
  return { scope: rule.scope, keyType: rule.keyType, fingerprint: fingerprintSha256(rule.key) };
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
    if (!existsSync(this.file)) return { text: "", version: null };
    const text = readFileSync(this.file, "utf8");
    return { text, version: createHash("sha256").update(text).digest("hex").slice(0, 16) };
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

  certificateRequired(host: string, port: number): boolean {
    const policy = rules(this.read().text, hostToken(host, port));
    if (policy.some(({ key, keyType }) => !key || !keyType)) throw new HuhuError("SSH_HOST_KEY_MISMATCH", "已知主机信任规则无效", { details: { reason: "invalid-host-policy" } });
    const required = policy.some(({ marker }) => marker === "@cert-authority");
    if (required && !policy.some(authorityKey)) throw new HuhuError("SSH_HOST_KEY_MISMATCH", "该主机的证书 CA 需要受支持的 Ed25519 公钥", { details: { reason: "unsupported-authority" } });
    return required;
  }

  check(host: string, port: number, keyType: string, key: Buffer, now: Date) {
    return verdict(this.read().text, host, port, keyType, key, now);
  }

  authorities(): KnownHostAuthorities {
    const { text, version } = this.read();
    const entries = text
      .split("\n")
      .map(authorityOf)
      .filter((entry) => entry !== undefined);
    return { revision: version, authorities: [...new Map(entries.map((entry) => [JSON.stringify(entry), entry])).values()] };
  }

  addAuthority(host: string, port: number, publicKey: string, revision: string | null, signal: AbortSignal): Promise<KnownHostAuthorities> {
    const blob = parseEd25519Authority(publicKey);
    return this.mutate(async () => {
      signal.throwIfAborted();
      const { text, version } = this.read();
      if (version !== revision) throw errors.versionConflict(version ?? "");
      const scope = hostToken(host.toLowerCase(), port);
      if (/[\s,*!?|]/u.test(scope)) throw errors.invalidInput("只能向已保存的确切 SSH 主机和端口添加 CA");
      const existing = rules(text, scope).some((rule) => rule.marker === "@cert-authority" && rule.scope.toLowerCase() === scope && rule.key?.equals(blob));
      if (!existing) {
        const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
        await this.write(`${prefix}@cert-authority ${scope} ssh-ed25519 ${blob.toString("base64")}\n`, version, () => signal.throwIfAborted());
      }
      return this.authorities();
    });
  }

  removeAuthority(authority: KnownHostAuthority, revision: string | null, signal: AbortSignal): Promise<KnownHostAuthorities> {
    return this.mutate(async () => {
      signal.throwIfAborted();
      const { text, version } = this.read();
      if (version !== revision) throw errors.versionConflict(version ?? "");
      const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
      const retained = lines.filter((line) => {
        const entry = authorityOf(line);
        return !entry || entry.scope !== authority.scope || entry.keyType !== authority.keyType || entry.fingerprint !== authority.fingerprint;
      });
      if (lines.length === retained.length) throw errors.notFound("这条主机证书 CA 记录已变更");
      await this.write(retained.join(""), version, () => signal.throwIfAborted());
      return this.authorities();
    });
  }

  /** 在消费决定时复核，避免并发首次确认把另一把密钥写入相同主机和端口。 */
  approve(host: string, port: number, keyType: string, key: Buffer, remember: boolean, signal: AbortSignal) {
    return this.mutate(async () => {
      signal.throwIfAborted();
      const { text, version } = this.read();
      const check = verdict(text, host, port, keyType, key, new Date());
      if (remember && check.state === "unknown") {
        const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
        await this.write(`${prefix}${hostToken(host, port)} ${keyType} ${key.toString("base64")}\n`, version, () => signal.throwIfAborted());
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
        return !(entry?.host.toLowerCase() === token.toLowerCase() && entry.type === key.keyType && identity(entry).fingerprint === key.fingerprint);
      });
      if (retained.length === lines.length) throw errors.notFound("这条已知主机记录已变更，请重新核对。");
      await this.write(retained.join(""), version, assertCurrent);
    });
  }
}
