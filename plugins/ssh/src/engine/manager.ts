import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { Readable } from "node:stream";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type { HuhuApi } from "@huhu/kernel";
import type { ConnectionStatus, HostKeyPrompt, KnownHostKey } from "../shared/trust.js";
import * as sftp from "./sftp.js";
import { KnownHosts, fingerprintSha256 } from "./known-hosts.js";
import { agentAuth, type ConnectionAuth, type HostRecord, type ManagedHost } from "./host-configurations.js";
import type { SshHost } from "./hosts.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";
import type { FileOrigin } from "../shared/files.js";
import type { z } from "zod";

export interface AuditEntry {
  at: string;
  hostId: string;
  action: string;
  result: "ok" | "failed" | "cancelled";
  detail: string;
}

export interface SshDeps {
  hosts: { list(): HostRecord[] | Promise<HostRecord[]> };
  knownHostsFile: string;
  knownHostsFiles?: HuhuApi["vault"]["files"];
  auditDir: string;
  /** 解析 safe:// 引用；保险箱锁定时抛 SAFE_LOCKED。 */
  resolveSecret(ref: string, purpose: string): string;
  withManagedAuth?: (host: ManagedHost, connect: (auth: ConnectionAuth) => Promise<void>) => Promise<void>;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  decisionTimeoutMs?: number;
}

interface Conn {
  hostId: string;
  attemptId: string;
  routeIdentity: string;
  clients: Client[];
  target: Client;
}
type Attempt = {
  id: string;
  hostId: string;
  signal: AbortSignal;
  requirePromptId: boolean;
  expectedTarget?: string;
  routeTarget?: string;
  pending?: { prompt: HostKeyPrompt; answer(accept: boolean, remember: boolean): void } | undefined;
  changed?: HostKeyPrompt;
};
type DialResult = { attemptId: string; connection: Conn };
export type SftpSource = string | { hostId: string; connectionId: string; fileSessionId: string; signal: AbortSignal };

function connectionIdentity(chain: readonly HostRecord[]): string {
  return JSON.stringify(chain.map((host) => ("revision" in host ? [host.id, host.revision] : [host.id, host.host, host.port, host.user, host.auth, host.connectTimeoutSec])));
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

const describeHost = ({ id, name, host, port }: HostRecord) => ({ id, name, host, port });

/** SSH 密钥类型名取自公钥 blob 的第一个字符串。 */
export function keyTypeOf(key: Buffer): string {
  const len = key.readUInt32BE(0);
  return key.subarray(4, 4 + len).toString("ascii");
}

/** 连接管理：逐跳连接、逐跳主机密钥确认、认证、Exec、审计。 */
export class SshManager {
  private conns = new Map<string, Conn>();
  private shells = new Map<string, ShellRec>();
  private fileOrigins = new WeakMap<Conn, z.infer<typeof FileOrigin>>();
  private shellConnections = new WeakMap<ShellRec, Conn>();
  private attempts = new Map<string, Attempt>();
  private statuses = new Map<string, ConnectionStatus>();
  private execs = new Map<string, ExecRun>();
  /** 正在传输（上传/下载）的主机：同一主机同时只传一个文件。 */
  private transferring = new Map<string, { controller: AbortController; fileSessionId?: string }>();
  private known: KnownHosts;

  constructor(private readonly d: SshDeps) {
    this.known = new KnownHosts(d.knownHostsFile, d.knownHostsFiles);
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

  connectionStatuses(): ConnectionStatus[] {
    return [...this.statuses.values()];
  }

  knownHosts(): KnownHostKey[] {
    return this.known.list();
  }

  forgetHostKey(key: KnownHostKey): Promise<void> {
    return this.known.forget(key);
  }

  private update(status: ConnectionStatus) {
    this.statuses.set(status.hostId, status);
    this.d.publish("ssh.connectionChanged", { hostId: status.hostId, state: status.state === "key-changed" ? "failed" : status.state });
  }

  /** 只消费当前连接和跳的待答项。旧调用者使用唯一 attemptId + hop。 */
  decide(attemptId: string, hop: number, accept: boolean, promptId?: string, remember = true): boolean {
    const attempt = this.attempts.get(attemptId);
    const pending = attempt?.pending;
    if (!attempt || attempt.signal.aborted || pending?.prompt.hop !== hop || (promptId === undefined ? attempt.requirePromptId : pending.prompt.promptId !== promptId)) return false;
    attempt.pending = undefined;
    pending.answer(accept, remember);
    return true;
  }

  private route(hostId: string, hosts: readonly HostRecord[]): HostRecord[] {
    return routeForHost(new Map(hosts.map((host) => [host.id, host])), hostId);
  }

  private legacyAuth(h: SshHost): ConnectionAuth {
    if (h.auth.kind === "agent") return agentAuth();
    if (h.auth.kind === "password") return { password: this.d.resolveSecret(h.auth.secretRef, `ssh:${h.id}`) };
    const privateKey = this.d.resolveSecret(h.auth.secretRef, `ssh:${h.id}`);
    return { privateKey, ...(h.auth.passphraseRef ? { passphrase: this.d.resolveSecret(h.auth.passphraseRef, `ssh:${h.id}`) } : {}) };
  }

  private connecting = new Map<string, { attempt: Attempt; abort: AbortController; promise: Promise<DialResult>; direct: boolean; workspaces: number }>();

  /** 同一主机的并发 connect 合并为一次，避免产生被遗弃的重复连接。 */
  async connect(hostId: string, signal?: AbortSignal): Promise<{ attemptId: string }> {
    const { attemptId } = await this.begin(hostId, signal).promise;
    return { attemptId };
  }

  /** 桌面工作台切换页面时，已发起的连接仍由 Engine 持有。 */
  start(hostId: string): { attemptId: string } {
    const { attempt, promise } = this.begin(hostId, AbortSignal.timeout(5 * 60_000), true);
    void promise.catch(() => undefined); // 终态由连接快照读取。
    return { attemptId: attempt.id };
  }

  private begin(hostId: string, signal?: AbortSignal, requirePromptId = false, expectedTarget?: string) {
    const running = this.connecting.get(hostId);
    if (running) {
      if (!expectedTarget) running.direct = true;
      return running;
    }
    const abort = new AbortController();
    const attempt: Attempt = { id: newId("cap").replace("cap", "att"), hostId, signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal, requirePromptId, ...(expectedTarget && { expectedTarget }) };
    const promise = Promise.resolve()
      .then(() => this.doConnect(attempt))
      .finally(() => {
        this.connecting.delete(hostId);
        this.attempts.delete(attempt.id);
      });
    const created = { attempt, abort, promise, direct: !expectedTarget, workspaces: 0 };
    this.connecting.set(hostId, created);
    this.attempts.set(attempt.id, attempt);
    this.update({ hostId, attemptId: attempt.id, state: "connecting" });
    return created;
  }

  private async doConnect(attempt: Attempt): Promise<DialResult> {
    const { hostId, id: attemptId, signal } = attempt;
    const current = () => this.statuses.get(hostId)?.attemptId === attemptId;
    const opened: Client[] = [];
    let stage: { hop: number; server: HostKeyPrompt["server"] } | undefined;
    const closeOpened = () => {
      for (const client of [...opened].reverse()) client.end();
    };
    signal.addEventListener("abort", closeOpened, { once: true });
    try {
      const hosts = await this.d.hosts.list();
      if (!hosts.some((host) => host.id === hostId)) {
        if (current()) this.statuses.delete(hostId);
        throw errors.notFound("SSH 主机不存在");
      }
      const chain = this.route(hostId, hosts);
      attempt.routeTarget = workspaceTarget(chain);
      if (attempt.expectedTarget && attempt.routeTarget !== attempt.expectedTarget) throw new HuhuError("VERSION_CONFLICT", "绑定的 SSH 主机、账户或跳板身份已变更");
      if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消");
      const target = chain[chain.length - 1]!;
      const routeIdentity = connectionIdentity(chain);
      const existing = this.conns.get(hostId);
      if (existing?.routeIdentity === routeIdentity) {
        existing.attemptId = attemptId;
        this.update({ hostId, attemptId, state: "connected" });
        return { attemptId: "existing", connection: existing };
      }
      this.drop(hostId);
      let sock: unknown;
      for (const [hop, h] of chain.entries()) {
        stage = { hop, server: describeHost(h) };
        const client = new Client();
        opened.push(client);
        if ("revision" in h) {
          if (!this.d.withManagedAuth) throw new HuhuError("SSH_AUTH_FAILED", "SSH 本机认证不可用");
          await this.d.withManagedAuth(h, (auth) => this.connectHop(client, h, target, hop, attempt, auth, sock));
        } else {
          await this.connectHop(client, h, target, hop, attempt, this.legacyAuth(h), sock);
        }
        client.setNoDelay(true); // SFTP/交互 shell 都是小包往返，Nagle + 延迟确认会让每次往返多出几十毫秒
        if (hop < chain.length - 1) {
          const next = chain[hop + 1] as SshHost;
          sock = await new Promise((resolve, reject) => client.forwardOut("127.0.0.1", 0, next.host, next.port, (e, s) => (e ? reject(new HuhuError("SSH_DISCONNECTED", `跳板 ${hop + 1} 转发失败：${e.message}`)) : resolve(s))));
        }
      }
      if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消");
      const connection = { hostId, attemptId, routeIdentity, clients: opened, target: opened[opened.length - 1]! };
      this.conns.set(hostId, connection);
      this.fileOrigins.set(connection, { connectionId: newId("cap"), hostId, name: target.name, host: target.host, user: target.user, port: target.port });
      connection.target.on("close", () => {
        if (this.conns.get(hostId) === connection) this.drop(hostId);
      });
      this.audit({ hostId, action: "connect", result: "ok", detail: `${target.user}@${target.host}:${target.port}（${chain.length - 1} 个跳板）` });
      this.update({ hostId, attemptId, state: "connected" });
      return { attemptId, connection };
    } catch (e) {
      closeOpened();
      this.audit({ hostId, action: "connect", result: "failed", detail: e instanceof HuhuError ? e.code : "error" });
      if (current()) {
        if (attempt.changed) this.update({ hostId, attemptId, state: "key-changed", prompt: attempt.changed, ...(attempt.expectedTarget && { workspace: true as const }) });
        else this.update({ hostId, attemptId, state: "failed", message: e instanceof HuhuError ? e.message : "SSH 连接失败", ...stage });
      }
      throw e;
    } finally {
      signal.removeEventListener("abort", closeOpened);
    }
  }

  private connectHop(client: Client, h: HostRecord, target: HostRecord, hop: number, attempt: Attempt, auth: ConnectionAuth, sock: unknown): Promise<void> {
    const { id: attemptId, hostId, signal } = attempt;
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      let done = false;
      const finish = (error?: HuhuError) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (attempt.pending?.prompt.hop === hop) attempt.pending = undefined;
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => {
        finish(new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消", { details: { hop } }));
        client.end();
      };
      const resumeTimer = () => {
        timer = setTimeout(() => {
          finish(new HuhuError("SSH_TIMEOUT", `连接超时（第 ${hop + 1} 跳）`, { details: { hop } }));
          client.end();
        }, h.connectTimeoutSec * 1000);
      };
      const publishKey = (prompt: HostKeyPrompt, reason: "first" | "changed") => {
        this.d.publish("ssh.hostKeyPrompt", { attemptId, hostId: h.id, hop, fingerprint: prompt.fingerprint, keyType: prompt.keyType, reason });
      };
      const blockChanged = (prompt: HostKeyPrompt, verify: (ok: boolean) => void) => {
        attempt.changed = prompt;
        publishKey(prompt, "changed");
        finish(new HuhuError("SSH_HOST_KEY_MISMATCH", "主机密钥与记录不符，已拒绝连接", { details: { hop } }));
        verify(false);
      };
      if (signal.aborted) return cancel();
      signal.addEventListener("abort", cancel, { once: true });
      client.once("ready", () => finish());
      client.once("close", () => finish(new HuhuError("SSH_DISCONNECTED", "SSH 连接已关闭", { details: { hop } })));
      client.on("error", (e: Error & { level?: string }) => {
        if (e.level === "client-authentication") return finish(new HuhuError("SSH_AUTH_FAILED", `认证失败（第 ${hop + 1} 跳）`, { details: { hop } }));
        finish(new HuhuError("SSH_DISCONNECTED", `连接失败（第 ${hop + 1} 跳）`, { details: { hop } }));
      });
      resumeTimer();
      try {
        client.connect({
          ...(sock ? { sock: sock as never } : { host: h.host, port: h.port }),
          username: h.user,
          // 网络和认证的计时在等待用户核对指纹期间暂停。
          readyTimeout: 0,
          ...(h.keepaliveIntervalSec !== undefined ? { keepaliveInterval: h.keepaliveIntervalSec * 1000 } : {}),
          ...(h.keepaliveCountMax !== undefined ? { keepaliveCountMax: h.keepaliveCountMax } : {}),
          ...auth,
          hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
            if (done) return verify(false);
            const keyType = keyTypeOf(key);
            let check: ReturnType<KnownHosts["check"]>;
            try {
              check = this.known.check(h.host, h.port, keyType, key);
            } catch {
              finish(new HuhuError("INTERNAL", "读取已知主机记录失败", { details: { hop } }));
              return verify(false);
            }
            if (check.state === "trusted") return verify(true);
            const prompt: HostKeyPrompt = {
              promptId: newId("cap").replace("cap", "prompt"),
              attemptId,
              target: describeHost(target),
              server: describeHost(h),
              hop,
              keyType,
              fingerprint: fingerprintSha256(key),
              recorded: check.recorded,
            };
            if (check.state === "mismatch") return blockChanged(prompt, verify);
            clearTimeout(timer);
            timer = setTimeout(() => {
              finish(new HuhuError("SSH_DISCONNECTED", "等待主机指纹确认超时", { details: { hop } }));
              verify(false);
            }, this.d.decisionTimeoutMs ?? 120_000);
            attempt.pending = {
              prompt,
              answer: (accept, remember) => {
                clearTimeout(timer);
                if (!accept) {
                  finish(new HuhuError("SSH_DISCONNECTED", "已拒绝主机指纹，连接已取消", { details: { hop } }));
                  verify(false);
                  return;
                }
                this.update({ hostId, attemptId, state: "connecting" });
                void this.known
                  .approve(h.host, h.port, keyType, key, remember, signal)
                  .then((result) => {
                    if (done) return;
                    if (result.state === "mismatch") return blockChanged({ ...prompt, promptId: newId("cap").replace("cap", "prompt"), recorded: result.recorded }, verify);
                    resumeTimer();
                    verify(true);
                  })
                  .catch(() => {
                    if (done) return;
                    finish(new HuhuError("INTERNAL", "保存 SSH 主机信任失败", { details: { hop } }));
                    verify(false);
                  });
              },
            };
            this.update({ hostId, attemptId, state: "waiting", prompt, ...(attempt.expectedTarget && { workspace: true as const }) });
            publishKey(prompt, "first");
          },
        } as never);
      } catch {
        finish(new HuhuError("SSH_AUTH_FAILED", "SSH 连接设置无法使用", { details: { hop } }));
      }
    });
  }

  // ---- Shell ----
  workspacePrompt(hostId: string, target: string): HostKeyPrompt | undefined {
    const status = this.statuses.get(hostId);
    return status?.state === "waiting" && this.attempts.get(status.attemptId)?.routeTarget === target ? status.prompt : undefined;
  }

  async openWorkspaceShell(pane: { hostId: string; target: string; loginCommand?: string | undefined }, signal: AbortSignal, onEnd: () => void): Promise<ShellInfo> {
    const { hostId, target, loginCommand } = pane;
    const chain = this.route(hostId, await this.d.hosts.list());
    const bindingChanged = () => new HuhuError("VERSION_CONFLICT", "绑定的 SSH 主机、账户或跳板身份已变更");
    if (workspaceTarget(chain) !== target) throw bindingChanged();
    signal.throwIfAborted();
    const dial = this.begin(hostId, undefined, true, target);
    dial.workspaces++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--dial.workspaces === 0 && !dial.direct && this.connecting.get(hostId) === dial && !this.conns.has(hostId)) dial.abort.abort();
    };
    signal.addEventListener("abort", release, { once: true });
    let connection: Conn;
    try {
      ({ connection } = await dial.promise);
    } finally {
      signal.removeEventListener("abort", release);
      release();
    }
    if (connection.routeIdentity !== connectionIdentity(chain) || workspaceTarget(this.route(hostId, await this.d.hosts.list())) !== target) throw bindingChanged();
    signal.throwIfAborted();
    const shell = await this.openShell(hostId, undefined, connection, onEnd);
    if (signal.aborted) {
      this.closeShell(shell.id);
      signal.throwIfAborted();
    }
    if (loginCommand) {
      const rec = this.shells.get(shell.id);
      if (rec?.state === "running") rec.channel.write(loginCommand + "\r");
    }
    return shell;
  }

  async openShell(hostId: string, size: { cols: number; rows: number } = { cols: 80, rows: 24 }, expected?: Conn, onEnd?: () => void): Promise<ShellInfo> {
    const conn = this.conns.get(hostId);
    if (!conn || (expected && conn !== expected)) throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    const channel = await new Promise<ClientChannel>((resolve, reject) =>
      conn.target.shell({ term: "xterm-256color", cols: size.cols, rows: size.rows }, (err, ch) => (err ? reject(new HuhuError("SSH_DISCONNECTED", `打开 Shell 失败：${err.message}`)) : resolve(ch))),
    );
    if (this.conns.get(hostId) !== conn) {
      channel.close();
      throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    }
    const id = `ssh-${newId("cap").replace("cap-", "")}`;
    const rec: ShellRec = { id, hostId, name: `Shell ${this.listShells(hostId).length + 1}`, state: "running", createdAt: this.d.now().toISOString(), channel, buffer: [], bufferSize: 0, viewers: new Set(), closers: new Set() };
    this.shells.set(id, rec);
    this.shellConnections.set(rec, conn);
    if (onEnd) rec.closers.add(onEnd);
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
  shellInfo(id: string): ShellInfo | undefined {
    const shell = this.shells.get(id);
    return shell && this.info(shell);
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
    if (this.statuses.get(hostId)?.attemptId === c.attemptId) this.update({ hostId, attemptId: c.attemptId, state: "disconnected" });
  }

  disconnect(hostId: string): void {
    this.connecting.get(hostId)?.abort.abort();
    if (this.conns.has(hostId)) {
      this.drop(hostId);
      this.audit({ hostId, action: "disconnect", result: "ok", detail: "" });
    }
  }

  forgetConnection(hostId: string): void {
    this.disconnect(hostId);
    this.statuses.delete(hostId);
  }

  disposeAll(): void {
    for (const { abort } of this.connecting.values()) abort.abort();
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

  fileOrigin(hostId: string, shellId?: string): z.infer<typeof FileOrigin> | undefined {
    const conn = this.conns.get(hostId);
    if (!conn) return undefined;
    if (shellId) {
      const shell = this.shells.get(shellId);
      if (!shell || shell.state !== "running" || this.shellConnections.get(shell) !== conn) return undefined;
    }
    return this.fileOrigins.get(conn);
  }

  /** SFTP：每次操作借用绑定的 SSH 连接，独立开关通道。 */
  async withSftp<T>(source: SftpSource, action: string, detail: string, fn: (s: SFTPWrapper, signal: AbortSignal) => Promise<T>, opts: { transfer?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const binding = typeof source === "string" ? undefined : source;
    const hostId = typeof source === "string" ? source : source.hostId;
    const conn = this.conns.get(hostId);
    if (!conn || (binding && this.fileOrigins.get(conn)?.connectionId !== binding.connectionId)) throw new HuhuError("SSH_DISCONNECTED", binding ? "文件会话的原连接已断开" : "尚未连接该主机");
    if (opts.transfer && this.transferring.has(hostId)) throw errors.invalidInput("这台主机正在传输另一个文件，请等它完成后再试");
    const ac = new AbortController();
    const signal = AbortSignal.any([ac.signal, ...(binding ? [binding.signal] : []), ...(opts.signal ? [opts.signal] : [])]);
    signal.throwIfAborted();
    if (opts.transfer) this.transferring.set(hostId, { controller: ac, ...(binding ? { fileSessionId: binding.fileSessionId } : {}) });
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
      session = await Promise.race([
        new Promise<SFTPWrapper>((resolve, reject) =>
          conn.target.sftp((err, channel) => {
            if (err) return reject(err);
            if (signal.aborted) {
              channel.end();
              return reject(signal.reason);
            }
            resolve(channel);
          }),
        ),
        stop,
      ]);
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
  sftpCancel(source: SftpSource): boolean {
    const transfer = this.transferring.get(typeof source === "string" ? source : source.hostId);
    if (!transfer || (typeof source !== "string" && transfer.fileSessionId !== source.fileSessionId)) return false;
    transfer.controller.abort();
    return true;
  }

  sftpList(hostId: SftpSource, dir: string, signal?: AbortSignal) {
    return this.withSftp(hostId, "list", dir || "~", (s) => sftp.list(s, dir), signal ? { signal } : {});
  }
  sftpRead(hostId: SftpSource, p: string) {
    return this.withSftp(hostId, "read", p, (s, sig) => sftp.readText(s, p, sig));
  }
  sftpWrite(hostId: SftpSource, p: string, text: string, overwrite: boolean) {
    return this.withSftp(hostId, "write", p, (s, sig) => sftp.writeAtomic(s, p, Readable.from(Buffer.from(text, "utf8")), { overwrite, signal: sig }));
  }
  sftpUpload(hostId: SftpSource, localPath: string, remotePath: string, overwrite: boolean, signal?: AbortSignal) {
    return this.withSftp(hostId, "upload", remotePath, (s, sig) => sftp.uploadLocal(s, localPath, remotePath, { overwrite, signal: sig }), { transfer: true, ...(signal ? { signal } : {}) });
  }
  sftpDownload(hostId: SftpSource, remotePath: string, localPath: string, overwrite: boolean, signal?: AbortSignal) {
    return this.withSftp(hostId, "download", remotePath, (s, sig) => sftp.downloadToLocal(s, remotePath, localPath, { overwrite, signal: sig }), { transfer: true, ...(signal ? { signal } : {}) });
  }
  sftpMkdir(hostId: SftpSource, p: string) {
    return this.withSftp(hostId, "mkdir", p, (s) => sftp.mkdir(s, p));
  }
  sftpRename(hostId: SftpSource, from: string, to: string, overwrite: boolean) {
    return this.withSftp(hostId, "rename", `${from} → ${to}`, (s) => sftp.rename(s, from, to, overwrite));
  }
  sftpDelete(hostId: SftpSource, p: string) {
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
