import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { Client, type ClientChannel } from "ssh2";
import { KnownHosts, fingerprintSha256 } from "./known-hosts.js";
import type { HostStore, SshHost } from "./hosts.js";

export interface AuditEntry { at: string; hostId: string; action: string; result: "ok" | "failed" | "cancelled"; detail: string }

export interface SshDeps {
  hosts: HostStore;
  knownHostsFile: string;
  auditDir: string;
  /** 解析 safe:// 引用；保险箱锁定时抛 SAFE_LOCKED。 */
  resolveSecret(ref: string, purpose: string): string;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  decisionTimeoutMs?: number;
}

interface Conn { hostId: string; clients: Client[]; target: Client }
interface ExecRun { channel: ClientChannel; interrupted: boolean }

/** SSH 密钥类型名取自公钥 blob 的第一个字符串。 */
export function keyTypeOf(key: Buffer): string {
  const len = key.readUInt32BE(0);
  return key.subarray(4, 4 + len).toString("ascii");
}

/** 连接管理：逐跳连接、逐跳主机密钥确认、认证、Exec、审计。 */
export class SshManager {
  private conns = new Map<string, Conn>();
  private attempts = new Map<string, Map<number, (accept: boolean) => void>>();
  private execs = new Map<string, ExecRun>();
  private known: KnownHosts;

  constructor(private readonly d: SshDeps) {
    this.known = new KnownHosts(d.knownHostsFile);
  }

  // ---- 审计（不含凭据）----
  private audit(e: Omit<AuditEntry, "at">): void {
    mkdirSync(this.d.auditDir, { recursive: true });
    appendFileSync(path.join(this.d.auditDir, `${this.d.now().toISOString().slice(0, 7)}.ndjson`), JSON.stringify({ at: this.d.now().toISOString(), ...e }) + "\n");
  }
  auditList(hostId?: string, limit = 200): AuditEntry[] {
    if (!existsSync(this.d.auditDir)) return [];
    return readFileSync(path.join(this.d.auditDir, `${this.d.now().toISOString().slice(0, 7)}.ndjson`), "utf8").split("\n").filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry).filter((a) => !hostId || a.hostId === hostId).slice(-limit).reverse();
  }

  isConnected(hostId: string): boolean {
    return this.conns.has(hostId);
  }

  /** UI 对主机密钥提示的决定；迟到/未知的决定被忽略。 */
  decide(attemptId: string, hop: number, accept: boolean): boolean {
    const cb = this.attempts.get(attemptId)?.get(hop);
    if (!cb) return false;
    this.attempts.get(attemptId)?.delete(hop);
    cb(accept);
    return true;
  }

  private route(target: SshHost): SshHost[] {
    const chain: SshHost[] = [];
    const walk = (h: SshHost) => {
      for (const j of h.jumpHostIds) walk(this.d.hosts.get(j));
      chain.push(h);
    };
    walk(target);
    return chain;
  }

  private authConfig(h: SshHost): Record<string, unknown> {
    if (h.auth.kind === "agent") return { agent: process.env["SSH_AUTH_SOCK"] ?? (process.platform === "win32" ? "\\\\.\\pipe\\openssh-ssh-agent" : undefined) };
    if (h.auth.kind === "password") return { password: this.d.resolveSecret(h.auth.secretRef, `ssh:${h.id}`) };
    const privateKey = this.d.resolveSecret(h.auth.secretRef, `ssh:${h.id}`);
    return { privateKey, ...(h.auth.passphraseRef ? { passphrase: this.d.resolveSecret(h.auth.passphraseRef, `ssh:${h.id}`) } : {}) };
  }

  private connecting = new Map<string, Promise<{ attemptId: string }>>();

  /** 同一主机的并发 connect 合并为一次，避免产生被遗弃的重复连接。 */
  connect(hostId: string): Promise<{ attemptId: string }> {
    const running = this.connecting.get(hostId);
    if (running) return running;
    const p = this.doConnect(hostId).finally(() => this.connecting.delete(hostId));
    this.connecting.set(hostId, p);
    return p;
  }

  private async doConnect(hostId: string): Promise<{ attemptId: string }> {
    const target = this.d.hosts.get(hostId);
    if (this.conns.has(hostId)) return { attemptId: "existing" };
    const chain = this.route(target); // 1. 冻结路由
    const attemptId = newId("cap").replace("cap", "att");
    this.attempts.set(attemptId, new Map());
    const opened: Client[] = [];
    try {
      let sock: unknown;
      for (const [hop, h] of chain.entries()) {
        const cfg = this.authConfig(h); // 先解密凭据：保险箱锁定时在发送任何网络数据前就失败（SAFE_LOCKED）
        const client = new Client();
        opened.push(client);
        await this.connectHop(client, h, hop, attemptId, cfg, sock);
        if (hop < chain.length - 1) {
          const next = chain[hop + 1] as SshHost;
          sock = await new Promise((resolve, reject) => client.forwardOut("127.0.0.1", 0, next.host, next.port, (e, s) => (e ? reject(new HuhuError("SSH_DISCONNECTED", `跳板 ${hop + 1} 转发失败：${e.message}`)) : resolve(s))));
        }
      }
      this.conns.set(hostId, { hostId, clients: opened, target: opened[opened.length - 1] as Client });
      opened[opened.length - 1]?.on("close", () => this.drop(hostId));
      this.audit({ hostId, action: "connect", result: "ok", detail: `${target.user}@${target.host}:${target.port}（${chain.length - 1} 个跳板）` });
      this.d.publish("ssh.connectionChanged", { hostId, state: "connected" });
      return { attemptId };
    } catch (e) {
      for (const c of opened.reverse()) c.end(); // 失败：逆序关闭已建立的跳板连接
      this.audit({ hostId, action: "connect", result: "failed", detail: e instanceof HuhuError ? e.code : "error" });
      this.d.publish("ssh.connectionChanged", { hostId, state: "failed" });
      throw e;
    } finally {
      this.attempts.delete(attemptId);
    }
  }

  private connectHop(client: Client, h: SshHost, hop: number, attemptId: string, auth: Record<string, unknown>, sock: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      let mismatch = false;
      let rejectedByUser = false;
      client.once("ready", () => resolve());
      client.once("error", (e: Error & { level?: string }) => {
        if (mismatch) return reject(new HuhuError("SSH_HOST_KEY_MISMATCH", "主机密钥与记录不符，已拒绝连接", { details: { hop } }));
        if (rejectedByUser) return reject(new HuhuError("SSH_DISCONNECTED", "已取消：未信任主机密钥", { details: { hop } }));
        if (e.level === "client-authentication") return reject(new HuhuError("SSH_AUTH_FAILED", `认证失败（第 ${hop + 1} 跳）`));
        if (/Timed out/i.test(e.message)) return reject(new HuhuError("SSH_TIMEOUT", `连接超时（第 ${hop + 1} 跳）`));
        reject(new HuhuError("SSH_DISCONNECTED", `连接失败（第 ${hop + 1} 跳）：${e.message}`));
      });
      client.connect({
        ...(sock ? { sock: sock as never } : { host: h.host, port: h.port }),
        username: h.user, readyTimeout: h.connectTimeoutSec * 1000, ...auth,
        hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
          const type = keyTypeOf(key);
          const check = this.known.check(h.host, h.port, type, key);
          if (check.state === "trusted") return verify(true);
          if (check.state === "mismatch") {
            mismatch = true; // 认证之前就拒绝：不发送任何凭据
            this.d.publish("ssh.hostKeyPrompt", { attemptId, hostId: h.id, hop, fingerprint: fingerprintSha256(key), keyType: type, reason: "changed" });
            return verify(false);
          }
          this.d.publish("ssh.hostKeyPrompt", { attemptId, hostId: h.id, hop, fingerprint: fingerprintSha256(key), keyType: type, reason: "first" });
          const timer = setTimeout(() => { this.attempts.get(attemptId)?.delete(hop); rejectedByUser = true; verify(false); }, this.d.decisionTimeoutMs ?? 120_000);
          this.attempts.get(attemptId)?.set(hop, (accept) => {
            clearTimeout(timer);
            if (accept) this.known.trust(h.host, h.port, type, key);
            else rejectedByUser = true;
            verify(accept);
          });
        },
      } as never);
    });
  }

  private drop(hostId: string): void {
    const c = this.conns.get(hostId);
    if (!c) return;
    this.conns.delete(hostId);
    for (const cl of c.clients.reverse()) cl.end();
    this.d.publish("ssh.connectionChanged", { hostId, state: "disconnected" });
  }

  disconnect(hostId: string): void {
    if (this.conns.has(hostId)) {
      this.drop(hostId);
      this.audit({ hostId, action: "disconnect", result: "ok", detail: "" });
    }
  }

  disposeAll(): void {
    for (const id of Array.from(this.conns.keys())) this.drop(id);
  }

  /** Exec：超时/取消时发送 INT 并关闭 channel；返回输出末 2000 行。 */
  async exec(hostId: string, command: string, opts: { timeoutSec?: number; execId?: string } = {}): Promise<{ execId: string; stdout: string; stderr: string; exitCode: number | null; ms: number; interrupted: boolean }> {
    const conn = this.conns.get(hostId);
    if (!conn) throw new HuhuError("SSH_DISCONNECTED", "尚未连接该主机");
    if (!command.trim()) throw errors.invalidInput("命令不能为空");
    const execId = opts.execId ?? newId("cap").replace("cap", "exec");
    const started = Date.now();
    return new Promise((resolve, reject) => {
      conn.target.exec(command, (err, channel) => {
        if (err) return reject(new HuhuError("SSH_DISCONNECTED", `执行失败：${err.message}`));
        const run: ExecRun = { channel, interrupted: false };
        this.execs.set(execId, run);
        let out = "";
        let errOut = "";
        let code: number | null = null;
        const timer = opts.timeoutSec ? setTimeout(() => this.cancel(execId), opts.timeoutSec * 1000) : null;
        channel.on("data", (b: Buffer) => { out += b; });
        channel.stderr.on("data", (b: Buffer) => { errOut += b; });
        channel.on("exit", (c: number | null) => { code = c; });
        channel.on("close", () => {
          if (timer) clearTimeout(timer);
          this.execs.delete(execId);
          const tail = (s: string) => s.split("\n").slice(-2000).join("\n");
          this.audit({ hostId, action: "exec", result: run.interrupted ? "cancelled" : code === 0 ? "ok" : "failed", detail: `命令长度 ${command.length}` }); // 命令里可能含口令，审计不记原文
          resolve({ execId, stdout: tail(out), stderr: tail(errOut), exitCode: code, ms: Date.now() - started, interrupted: run.interrupted });
        });
      });
    });
  }

  cancel(execId: string): boolean {
    const run = this.execs.get(execId);
    if (!run) return false;
    run.interrupted = true;
    try { run.channel.signal("INT"); } catch { /* 部分服务器不支持 signal */ }
    run.channel.close();
    return true;
  }
}
