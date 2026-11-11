import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { Readable } from "node:stream";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import * as sftp from "./sftp.js";
import { KnownHosts, fingerprintSha256 } from "./known-hosts.js";
import type { HostStore, SshHost } from "./hosts.js";

export interface AuditEntry {
  at: string;
  hostId: string;
  action: string;
  result: "ok" | "failed" | "cancelled";
  detail: string;
}

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

interface Conn {
  hostId: string;
  clients: Client[];
  target: Client;
}
interface ExecRun {
  channel: ClientChannel;
  interrupted: boolean;
}

export interface ShellInfo {
  id: string;
  hostId: string;
  name: string;
  state: "running" | "ended";
  createdAt: string;
}
interface ShellRec extends ShellInfo {
  channel: ClientChannel;
  buffer: Buffer[];
  bufferSize: number;
  viewers: Set<(b: Buffer) => void>;
  closers: Set<() => void>;
}
const SHELL_BUFFER = 64 * 1024;

/** SSH 密钥类型名取自公钥 blob 的第一个字符串。 */
export function keyTypeOf(key: Buffer): string {
  const len = key.readUInt32BE(0);
  return key.subarray(4, 4 + len).toString("ascii");
}

/** 连接管理：逐跳连接、逐跳主机密钥确认、认证、Exec、审计。 */
export class SshManager {
  private conns = new Map<string, Conn>();
  private shells = new Map<string, ShellRec>();
  private attempts = new Map<string, Map<number, (accept: boolean) => void>>();
  private execs = new Map<string, ExecRun>();
  /** 正在传输（上传/下载）的主机：同一主机同时只传一个文件。 */
  private transferring = new Map<string, AbortController>();
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
    const month = path.join(this.d.auditDir, `${this.d.now().toISOString().slice(0, 7)}.ndjson`);
    if (!existsSync(month)) return []; // 目录在、当月文件还没有
    return readFileSync(month, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry)
      .filter((a) => !hostId || a.hostId === hostId)
      .slice(-limit)
      .reverse();
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
        client.setNoDelay(true); // SFTP/交互 shell 都是小包往返，Nagle + 延迟确认会让每次往返多出几十毫秒
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
        username: h.user,
        readyTimeout: h.connectTimeoutSec * 1000,
        ...auth,
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
          const timer = setTimeout(() => {
            this.attempts.get(attemptId)?.delete(hop);
            rejectedByUser = true;
            verify(false);
          }, this.d.decisionTimeoutMs ?? 120_000);
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

  // ---- Shell ----
  async openShell(hostId: string, size: { cols: number; rows: number } = { cols: 80, rows: 24 }): Promise<ShellInfo> {
    const conn = this.conns.get(hostId);
    if (!conn) throw new HuhuError("SSH_DISCONNECTED", "尚未连接该主机");
    const channel = await new Promise<ClientChannel>((resolve, reject) =>
      conn.target.shell({ term: "xterm-256color", cols: size.cols, rows: size.rows }, (err, ch) => (err ? reject(new HuhuError("SSH_DISCONNECTED", `打开 Shell 失败：${err.message}`)) : resolve(ch))),
    );
    const id = `ssh-${newId("cap").replace("cap-", "")}`;
    const rec: ShellRec = { id, hostId, name: `Shell ${this.listShells(hostId).length + 1}`, state: "running", createdAt: this.d.now().toISOString(), channel, buffer: [], bufferSize: 0, viewers: new Set(), closers: new Set() };
    this.shells.set(id, rec);
    channel.on("data", (b: Buffer) => {
      rec.buffer.push(b);
      rec.bufferSize += b.length;
      while (rec.bufferSize > SHELL_BUFFER && rec.buffer.length > 1) rec.bufferSize -= (rec.buffer.shift() as Buffer).length;
      for (const v of rec.viewers) v(b);
    });
    channel.on("close", () => {
      rec.state = "ended";
      for (const c of rec.closers) c();
    });
    this.audit({ hostId, action: "shell", result: "ok", detail: id });
    return this.info(rec);
  }

  private info(r: ShellRec): ShellInfo {
    return { id: r.id, hostId: r.hostId, name: r.name, state: r.state, createdAt: r.createdAt };
  }
  listShells(hostId?: string): ShellInfo[] {
    return [...this.shells.values()].filter((s) => !hostId || s.hostId === hostId).map((s) => this.info(s));
  }
  closeShell(id: string): boolean {
    const s = this.shells.get(id);
    if (!s) return false;
    s.channel.close(); // “结束 shell”才关闭 channel；关闭视图不会
    return true;
  }
  /** 绑定一个查看者（WebSocket）：先回放最近输出，再接实时输出。返回 detach 函数；不会关闭 channel。 */
  attachShell(id: string, view: { onData(b: Buffer): void; onEnd(): void }): { write(b: Buffer): void; resize(cols: number, rows: number): void; detach(): void } | null {
    const s = this.shells.get(id);
    if (!s) return null;
    for (const b of s.buffer) view.onData(b);
    s.viewers.add(view.onData);
    s.closers.add(view.onEnd);
    if (s.state === "ended") queueMicrotask(view.onEnd);
    return {
      write: (b) => {
        if (s.state === "running") s.channel.write(b);
      },
      resize: (cols, rows) => {
        if (s.state === "running") s.channel.setWindow(rows, cols, 0, 0);
      },
      detach: () => {
        s.viewers.delete(view.onData);
        s.closers.delete(view.onEnd);
      },
    };
  }

  private drop(hostId: string): void {
    const c = this.conns.get(hostId);
    if (!c) return;
    // 连接断开：该主机的所有 shell 变为已结束（重新连接后需新建，不会绑定到新连接）
    for (const s of this.shells.values())
      if (s.hostId === hostId) {
        s.state = "ended";
        for (const f of s.closers) f();
      }
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
        channel.on("data", (b: Buffer) => {
          out += b;
        });
        channel.stderr.on("data", (b: Buffer) => {
          errOut += b;
        });
        channel.on("exit", (c: number | null) => {
          code = c;
        });
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

  /** SFTP：复用已建立的连接（含跳板链路），每次操作单独开一个 SFTP 会话，结束即关；写审计（动作与远端路径，不含内容）。 */
  async withSftp<T>(hostId: string, action: string, detail: string, fn: (s: SFTPWrapper, signal: AbortSignal) => Promise<T>, opts: { transfer?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const conn = this.conns.get(hostId);
    if (!conn) throw new HuhuError("SSH_DISCONNECTED", "尚未连接该主机");
    if (opts.transfer && this.transferring.has(hostId)) throw errors.invalidInput("这台主机正在传输另一个文件，请等它完成后再试");
    const ac = new AbortController();
    if (opts.transfer) this.transferring.set(hostId, ac);
    const signal = opts.signal ? AbortSignal.any([opts.signal, ac.signal]) : ac.signal;
    let session: SFTPWrapper | undefined;
    let detach = (): void => undefined;
    try {
      // 取消（用户或调度器）与超时都要能让一切立刻结束并释放互斥：连接还活着但服务器不回应时，ssh2 不会自己报错
      const stop = new Promise<never>((_, reject) => {
        const onAbort = () => reject(new HuhuError("INTERNAL", "传输已取消", { retryable: false }));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
        const timer = opts.transfer
          ? null
          : setTimeout(() => {
              ac.abort();
              reject(new HuhuError("SSH_TIMEOUT", "远端没有响应（60 秒）"));
            }, opts.timeoutMs ?? 60_000);
        const prev = detach;
        detach = () => {
          prev();
          signal.removeEventListener("abort", onAbort);
          if (timer) clearTimeout(timer);
        };
      });
      stop.catch(() => undefined);
      session = await Promise.race([new Promise<SFTPWrapper>((resolve, reject) => conn.target.sftp((err, s) => (err ? reject(err) : resolve(s)))), stop]);
      const live = session;
      // 连接或 SFTP 通道中途关闭时，ssh2 的流不一定报错，操作会一直挂着：这里主动中止并报告断线
      const dead = new Promise<never>((_, reject) => {
        const onClose = () => {
          reject(new HuhuError("SSH_DISCONNECTED", "连接已中断"));
          ac.abort();
        }; // 先报断线，再中止流（否则会先被当成“已取消”）
        conn.target.once("close", onClose);
        live.once("close", onClose);
        const prev = detach;
        detach = () => {
          prev();
          conn.target.removeListener("close", onClose);
          live.removeListener("close", onClose);
        };
      });
      dead.catch(() => undefined);
      const r = await Promise.race([fn(live, signal), dead, stop]);
      this.audit({ hostId, action: `sftp.${action}`, result: "ok", detail: detail.slice(0, 500) });
      return r;
    } catch (e) {
      const he = sftp.mapSftpError(e, detail);
      this.audit({ hostId, action: `sftp.${action}`, result: /已取消/.test(he.message) ? "cancelled" : "failed", detail: `${detail.slice(0, 400)}：${he.message.slice(0, 100)}` });
      throw he;
    } finally {
      detach();
      try {
        session?.end();
      } catch {
        /* 连接已断 */
      }
      if (opts.transfer) this.transferring.delete(hostId);
    }
  }

  /** 取消这台主机上正在进行的传输。 */
  sftpCancel(hostId: string): boolean {
    const ac = this.transferring.get(hostId);
    if (!ac) return false;
    ac.abort();
    return true;
  }

  sftpList(hostId: string, dir: string) {
    return this.withSftp(hostId, "list", dir || "~", (s) => sftp.list(s, dir));
  }
  sftpRead(hostId: string, p: string) {
    return this.withSftp(hostId, "read", p, (s, sig) => sftp.readText(s, p, sig));
  }
  sftpWrite(hostId: string, p: string, text: string, overwrite: boolean) {
    return this.withSftp(hostId, "write", p, (s, sig) => sftp.writeAtomic(s, p, Readable.from(Buffer.from(text, "utf8")), { overwrite, signal: sig }));
  }
  sftpUpload(hostId: string, localPath: string, remotePath: string, overwrite: boolean, signal?: AbortSignal) {
    return this.withSftp(hostId, "upload", remotePath, (s, sig) => sftp.uploadLocal(s, localPath, remotePath, { overwrite, signal: sig }), { transfer: true, ...(signal ? { signal } : {}) });
  }
  sftpDownload(hostId: string, remotePath: string, localPath: string, overwrite: boolean, signal?: AbortSignal) {
    return this.withSftp(hostId, "download", remotePath, (s, sig) => sftp.downloadToLocal(s, remotePath, localPath, { overwrite, signal: sig }), { transfer: true, ...(signal ? { signal } : {}) });
  }
  sftpMkdir(hostId: string, p: string) {
    return this.withSftp(hostId, "mkdir", p, (s) => sftp.mkdir(s, p));
  }
  sftpRename(hostId: string, from: string, to: string, overwrite: boolean) {
    return this.withSftp(hostId, "rename", `${from} → ${to}`, (s) => sftp.rename(s, from, to, overwrite));
  }
  sftpDelete(hostId: string, p: string) {
    return this.withSftp(hostId, "delete", p, (s) => sftp.remove(s, p));
  }

  cancel(execId: string): boolean {
    const run = this.execs.get(execId);
    if (!run) return false;
    run.interrupted = true;
    try {
      run.channel.signal("INT");
    } catch {
      /* 部分服务器不支持 signal */
    }
    run.channel.close();
    return true;
  }
}
