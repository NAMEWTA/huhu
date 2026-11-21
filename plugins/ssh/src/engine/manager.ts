import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { Readable } from "node:stream";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type { HuhuApi } from "@huhu/kernel";
import type { ConnectionStatus, HostKeyPrompt, KnownHostKey } from "../shared/trust.js";
import * as sftp from "./sftp.js";
import { KnownHosts, fingerprintSha256 } from "./known-hosts.js";
import type { ConnectionAuth, HostRecord, ManagedHost } from "./host-configurations.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";
import type { DirectoryFollowState, FileOrigin } from "../shared/files.js";
import { ShellDirectory, shellDirectoryProbe, type IntegratedShell } from "./shell-directory.js";
import { defaultVaultPreferences, type ConnectionPreferences } from "../shared/preferences.js";
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
  withManagedAuth: (host: ManagedHost, connect: (auth: ConnectionAuth) => Promise<void>) => Promise<void>;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  connectionPreferences?(): ConnectionPreferences;
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
  report?: (status: ConnectionStatus) => void;
  expectedTarget?: string;
  routeTarget?: string;
  publicProbe?: { validate(): void };
  pending?: { prompt: HostKeyPrompt; answer(accept: boolean, remember: boolean): void } | undefined;
  changed?: HostKeyPrompt;
};
type DialResult = { attemptId: string; connection: Conn };
export type SftpSource = string | { hostId: string; connectionId: string; fileSessionId: string; signal: AbortSignal };
type ForwardOwner = (status: ConnectionStatus) => void;
type ForwardDial = {
  id: string;
  abort: AbortController;
  owners: Set<ForwardOwner>;
  status?: ConnectionStatus;
  ready: Promise<Client>;
};
export type ForwardLease = {
  id: string;
  client: Client;
  kind: "borrowed" | "dedicated";
  holders(): number;
  validate(): Promise<void>;
  release(): void;
};
export type MonitorConnection = Pick<ForwardLease, "id" | "client" | "release"> & { onClose(notify: () => void): () => void };

function connectionIdentity(chain: readonly ManagedHost[]): string {
  return JSON.stringify(chain.map(({ id, revision }) => [id, revision]));
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
  directory?: ShellDirectory;
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
  private integratedShells = new WeakMap<Conn, Promise<IntegratedShell | undefined>>();
  private attempts = new Map<string, Attempt>();
  private forwardDials = new Map<string, ForwardDial>();
  private borrowedForwards = new WeakMap<Conn, Set<ForwardOwner>>();
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
    if (attempt?.publicProbe) return false;
    return this.answerPrompt(attempt, hop, accept, promptId, remember);
  }

  decidePublicProbe(attemptId: string, hop: number, promptId: string, accept: boolean): boolean {
    const attempt = this.attempts.get(attemptId);
    if (!attempt?.publicProbe) return false;
    attempt.publicProbe.validate();
    return this.answerPrompt(attempt, hop, accept, promptId, false);
  }

  private answerPrompt(attempt: Attempt | undefined, hop: number, accept: boolean, promptId: string | undefined, remember: boolean): boolean {
    const pending = attempt?.pending;
    if (!attempt || attempt.signal.aborted || pending?.prompt.hop !== hop || (promptId === undefined ? attempt.requirePromptId : pending.prompt.promptId !== promptId)) return false;
    attempt.pending = undefined;
    pending.answer(accept, remember);
    return true;
  }

  startPublicProbe(chain: ManagedHost[], signal: AbortSignal, validate: () => void, report: (status: ConnectionStatus, code?: HuhuError["code"]) => void): string {
    const id = newId("cap").replace("cap", "att");
    const hostId = chain.at(-1)!.id;
    const attempt: Attempt = { id, hostId, signal, requirePromptId: true, report, publicProbe: { validate } };
    this.attempts.set(id, attempt);
    const opened: Client[] = [];
    const close = () => {
      for (const client of opened.splice(0).reverse()) client.end();
    };
    signal.addEventListener("abort", close, { once: true });
    void Promise.resolve()
      .then(() => this.dialChain(chain, attempt, opened))
      .then(() => {
        signal.throwIfAborted();
        validate();
        report({ hostId, attemptId: id, state: "connected" });
      })
      .catch((error: unknown) => {
        if (attempt.changed) report({ hostId, attemptId: id, state: "key-changed", prompt: attempt.changed });
        else report({ hostId, attemptId: id, state: "failed", message: "SSH 连接核验失败" }, error instanceof HuhuError ? error.code : undefined);
      })
      .finally(() => {
        signal.removeEventListener("abort", close);
        this.attempts.delete(id);
        close();
      });
    return id;
  }

  private route(hostId: string, hosts: readonly HostRecord[]): ManagedHost[] {
    const chain = routeForHost(new Map(hosts.map((host) => [host.id, host])), hostId);
    return chain.map((host, hop) => {
      if (!("revision" in host)) throw new HuhuError("SSH_AUTH_FAILED", `第 ${hop + 1} 跳的 SSH 主机需要在模块中重新配置凭据`, { details: { reason: "legacy-host-needs-repair", hop } });
      return host;
    });
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
      const client = await this.dialChain(chain, attempt, opened, (hop, host) => {
        stage = { hop, server: describeHost(host) };
      });
      if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消");
      const connection = { hostId, attemptId, routeIdentity, clients: opened, target: client };
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
        if (attempt.changed) this.update({ hostId, attemptId, state: "key-changed", prompt: attempt.changed, ...(this.connecting.get(hostId)?.workspaces && { workspace: true as const }) });
        else this.update({ hostId, attemptId, state: "failed", message: e instanceof HuhuError ? e.message : "SSH 连接失败", ...stage });
      }
      throw e;
    } finally {
      signal.removeEventListener("abort", closeOpened);
    }
  }

  private async dialChain(chain: ManagedHost[], attempt: Attempt, opened: Client[], onHop?: (hop: number, host: ManagedHost) => void): Promise<Client> {
    const target = chain[chain.length - 1]!;
    const defaults = this.d.connectionPreferences?.() ?? defaultVaultPreferences.connection;
    let socket: unknown;
    for (const [hop, host] of chain.entries()) {
      attempt.signal.throwIfAborted();
      attempt.publicProbe?.validate();
      onHop?.(hop, host);
      const client = new Client();
      opened.push(client);
      const authenticate = (auth: ConnectionAuth) => {
        attempt.publicProbe?.validate();
        return this.connectHop(client, host, target, hop, attempt, auth, socket, {
          connectTimeoutSec: host.connectTimeoutSec ?? defaults.connectTimeoutSec,
          keepaliveIntervalSec: host.keepaliveIntervalSec ?? defaults.keepaliveIntervalSec,
          keepaliveCountMax: host.keepaliveCountMax ?? defaults.keepaliveCountMax,
        });
      };
      await this.d.withManagedAuth(host, authenticate);
      client.setNoDelay(true);
      const next = chain[hop + 1];
      if (next) {
        socket = await new Promise((resolve, reject) =>
          client.forwardOut("127.0.0.1", 0, next.host, next.port, (error, stream) => (error ? reject(new HuhuError("SSH_DISCONNECTED", `跳板 ${hop + 1} 转发失败：${error.message}`)) : resolve(stream))),
        );
      }
    }
    return opened[opened.length - 1]!;
  }

  async acquireForward(hostId: string, boundTarget: string, signal: AbortSignal, notify: ForwardOwner): Promise<ForwardLease> {
    return this.acquireTransport("forward", hostId, signal, notify, boundTarget);
  }

  async acquireMonitor(hostId: string, signal: AbortSignal, notify: ForwardOwner): Promise<MonitorConnection> {
    const lease = await this.acquireTransport("monitor", hostId, signal, notify);
    return {
      id: lease.id,
      client: lease.client,
      release: lease.release,
      onClose: (closed) => {
        lease.client.once("close", closed);
        return () => lease.client.off("close", closed);
      },
    };
  }

  monitorPane(hostId: string, shellId: string): MonitorConnection {
    const conn = this.conns.get(hostId);
    const shell = this.shells.get(shellId);
    if (!conn || !shell || shell.state !== "running" || this.shellConnections.get(shell) !== conn) throw new HuhuError("SSH_DISCONNECTED", "此分栏的原 SSH 连接已关闭");
    return {
      id: this.fileOrigins.get(conn)!.connectionId,
      client: conn.target,
      release: () => undefined,
      onClose: (closed) => {
        shell.closers.add(closed);
        return () => shell.closers.delete(closed);
      },
    };
  }

  private async acquireTransport(scope: "forward" | "monitor", hostId: string, signal: AbortSignal, notify: ForwardOwner, boundTarget?: string): Promise<ForwardLease> {
    const chain = this.route(hostId, await this.d.hosts.list());
    const stale = () => new HuhuError("VERSION_CONFLICT", scope === "forward" ? "转发规则所绑定的主机、账户或跳板配置已变更" : "监控的主机、账户或跳板配置已变更");
    if (boundTarget && workspaceTarget(chain) !== boundTarget) throw stale();
    const identity = connectionIdentity(chain);
    const validate = async () => {
      if (connectionIdentity(this.route(hostId, await this.d.hosts.list())) !== identity) throw stale();
      signal.throwIfAborted();
    };
    signal.throwIfAborted();
    const borrowed = this.conns.get(hostId);
    if (borrowed?.routeIdentity === identity) {
      if (scope === "monitor") return { id: this.fileOrigins.get(borrowed)!.connectionId, client: borrowed.target, kind: "borrowed", holders: () => 0, validate, release: () => undefined };
      const owners = this.borrowedForwards.get(borrowed) ?? new Set<ForwardOwner>();
      owners.add(notify);
      this.borrowedForwards.set(borrowed, owners);
      return {
        id: this.fileOrigins.get(borrowed)!.connectionId,
        client: borrowed.target,
        kind: "borrowed",
        holders: () => owners.size,
        validate,
        release: () => {
          owners.delete(notify);
        },
      };
    }

    const poolKey = `${scope}:${identity}`;
    const dial = this.forwardDials.get(poolKey) ?? this.openForwardDial(poolKey, chain, hostId);
    dial.owners.add(notify);
    const release = () => {
      if (dial.owners.delete(notify) && dial.owners.size === 0) dial.abort.abort();
    };
    let detach = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      const stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      detach = () => signal.removeEventListener("abort", stop);
    });
    if (dial.status) notify(dial.status);
    try {
      const client = await Promise.race([dial.ready, cancelled]);
      await validate();
      if (dial.abort.signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 专用连接已结束");
      return { id: dial.id, client, kind: "dedicated", holders: () => dial.owners.size, validate, release };
    } catch (error) {
      release();
      throw error;
    } finally {
      detach();
    }
  }

  private openForwardDial(identity: string, chain: ManagedHost[], hostId: string): ForwardDial {
    const abort = new AbortController();
    const signal = abort.signal;
    const opened: Client[] = [];
    const owners = new Set<ForwardOwner>();
    const cleanup = () => {
      if (this.forwardDials.get(identity) === dial) this.forwardDials.delete(identity);
      for (const client of [...opened].reverse()) client.end();
    };
    const attempt: Attempt = {
      id: newId("cap").replace("cap", "att"),
      hostId,
      signal,
      requirePromptId: true,
      report: (status) => {
        dial.status = status;
        for (const owner of owners) owner(status);
      },
    };
    const ready = Promise.resolve()
      .then(() => this.dialChain(chain, attempt, opened))
      .then((client) => {
        signal.throwIfAborted();
        for (const hop of opened) hop.once("close", () => abort.abort());
        return client;
      })
      .catch((error: unknown) => {
        if (attempt.changed) attempt.report?.({ hostId, attemptId: attempt.id, state: "key-changed", prompt: attempt.changed });
        abort.abort();
        throw error;
      })
      .finally(() => this.attempts.delete(attempt.id));
    const dial: ForwardDial = { id: newId("cap"), abort, owners, ready };
    signal.addEventListener("abort", cleanup, { once: true });
    this.forwardDials.set(identity, dial);
    this.attempts.set(attempt.id, attempt);
    return dial;
  }

  private connectHop(client: Client, h: HostRecord, target: HostRecord, hop: number, attempt: Attempt, auth: ConnectionAuth, sock: unknown, preferences: ConnectionPreferences): Promise<void> {
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
        }, preferences.connectTimeoutSec * 1000);
      };
      const publishKey = (prompt: HostKeyPrompt, reason: "first" | "changed") => {
        if (attempt.publicProbe) return;
        this.d.publish("ssh.hostKeyPrompt", { attemptId, hostId: h.id, hop, fingerprint: prompt.fingerprint, keyType: prompt.keyType, reason });
      };
      const currentTarget = () => {
        try {
          attempt.publicProbe?.validate();
          return true;
        } catch (error) {
          finish(error instanceof HuhuError ? error : errors.invalidInput("无法核对 SSH 路由"));
          return false;
        }
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
          ...(preferences.keepaliveIntervalSec !== null ? { keepaliveInterval: preferences.keepaliveIntervalSec * 1000 } : {}),
          ...(preferences.keepaliveCountMax !== null ? { keepaliveCountMax: preferences.keepaliveCountMax } : {}),
          ...auth,
          hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
            if (done || !currentTarget()) return verify(false);
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
                const status = { hostId, attemptId, state: "connecting" } as const;
                if (attempt.report) attempt.report(status);
                else this.update(status);
                void this.known
                  .approve(h.host, h.port, keyType, key, remember, signal)
                  .then((result) => {
                    if (done) return;
                    if (result.state === "mismatch") return blockChanged({ ...prompt, promptId: newId("cap").replace("cap", "prompt"), recorded: result.recorded }, verify);
                    if (!currentTarget()) return verify(false);
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
            const status = { hostId, attemptId, state: "waiting", prompt, ...(this.connecting.get(hostId)?.workspaces && { workspace: true as const }) } as const;
            if (attempt.report) attempt.report(status);
            else this.update(status);
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
    const status = this.statuses.get(hostId);
    if (status?.attemptId === dial.attempt.id && (status.state === "waiting" || status.state === "key-changed") && !status.workspace) this.update({ ...status, workspace: true });
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
    const shell = await this.openShell(hostId, undefined, connection, onEnd, !loginCommand);
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

  private shellIntegration(conn: Conn): Promise<IntegratedShell | undefined> {
    const existing = this.integratedShells.get(conn);
    if (existing) return existing;
    const probe = new Promise<IntegratedShell | undefined>((resolve) => {
      let timedOut = false;
      let channel: ClientChannel | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        channel?.close();
        resolve(undefined);
      }, 1500);
      conn.target.exec(shellDirectoryProbe, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          return resolve(undefined);
        }
        if (timedOut) return stream.close();
        channel = stream;
        let stdout = "";
        stream.on("data", (chunk: Buffer) => {
          if (stdout.length <= 16) stdout += chunk.subarray(0, 17).toString();
        });
        stream.once("close", (code: number | undefined) => {
          clearTimeout(timer);
          const detected = stdout.trim();
          resolve(code === 0 && (detected === "bash" || detected === "zsh") ? detected : undefined);
        });
      });
    });
    this.integratedShells.set(conn, probe);
    return probe;
  }

  async openShell(hostId: string, size: { cols: number; rows: number } = { cols: 80, rows: 24 }, expected?: Conn, onEnd?: () => void, integrate = false): Promise<ShellInfo> {
    const conn = this.conns.get(hostId);
    if (!conn || (expected && conn !== expected)) throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    const detected = integrate ? await this.shellIntegration(conn) : undefined;
    const directory = detected ? new ShellDirectory() : undefined;
    const integrated =
      detected && directory
        ? await new Promise<ClientChannel | undefined>((resolve) => {
            let timedOut = false;
            const timer = setTimeout(() => {
              timedOut = true;
              resolve(undefined);
            }, 1500);
            conn.target.exec(directory.launch(detected), { pty: { term: "xterm-256color", cols: size.cols, rows: size.rows } }, (err, ch) => {
              clearTimeout(timer);
              if (err) return resolve(undefined);
              if (timedOut) return ch.close();
              resolve(ch);
            });
          })
        : undefined;
    const channel =
      integrated ??
      (await new Promise<ClientChannel>((resolve, reject) =>
        conn.target.shell({ term: "xterm-256color", cols: size.cols, rows: size.rows }, (err, ch) => (err ? reject(new HuhuError("SSH_DISCONNECTED", `打开 Shell 失败：${err.message}`)) : resolve(ch))),
      ));
    if (this.conns.get(hostId) !== conn) {
      channel.close();
      throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    }
    const id = `ssh-${newId("cap").replace("cap-", "")}`;
    const rec: ShellRec = { id, hostId, name: `Shell ${this.listShells(hostId).length + 1}`, state: "running", createdAt: this.d.now().toISOString(), channel, buffer: [], bufferSize: 0, viewers: new Set(), closers: new Set() };
    this.shells.set(id, rec);
    if (integrated && directory) rec.directory = directory;
    this.shellConnections.set(rec, conn);
    if (onEnd) rec.closers.add(onEnd);
    channel.on("data", (b: Buffer) => {
      rec.directory?.output(b);
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
    s.state = "ended";
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
        if (s.state === "running") {
          s.directory?.input(b);
          s.channel.write(b);
        }
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
    for (const { abort } of this.forwardDials.values()) abort.abort();
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

  directoryState(origin: z.infer<typeof FileOrigin> & { shellId?: string | undefined }): DirectoryFollowState {
    if (!origin.shellId) return { state: "unsupported", revision: 0 };
    if (this.fileOrigin(origin.hostId, origin.shellId)?.connectionId !== origin.connectionId) return { state: "ended", revision: 0 };
    return this.shells.get(origin.shellId)?.directory?.state() ?? { state: "unsupported", revision: 0 };
  }

  followDirectory(origin: z.infer<typeof FileOrigin> & { shellId?: string | undefined }, revision: number, directory: string): boolean {
    if (!origin.shellId || this.fileOrigin(origin.hostId, origin.shellId)?.connectionId !== origin.connectionId) return false;
    const shell = this.shells.get(origin.shellId);
    if (!shell || shell.viewers.size !== 1 || shell.channel.destroyed || !shell.channel.writable) return false;
    const command = shell.directory?.command(revision, directory);
    if (!command) return false;
    shell.channel.write(command);
    return true;
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
