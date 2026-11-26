import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { Readable, type Duplex } from "node:stream";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type { HuhuApi } from "@huhu/kernel";
import type { ConnectionHop, ConnectionStatus, HostKeyPrompt, KnownHostAuthority, KnownHostKey, SshAuthenticationPrompt } from "../shared/trust.js";
import * as sftp from "./sftp.js";
import { KnownHosts, fingerprintSha256, type TrustBlock } from "./known-hosts.js";
import { OPENSSH_ED25519_CERT } from "./host-certificate.js";
import { agentAuth, type ConnectionAuth, type HostRecord, type ManagedHost } from "./host-configurations.js";
import { connectionIdentity, routeForHost, workspaceTarget } from "./workspace-target.js";
import type { DirectoryFollowState, FileOrigin } from "../shared/files.js";
import { openIntegratedShell, type ShellDirectory } from "./shell-directory.js";
import { defaultVaultPreferences, type ConnectionPreferences } from "../shared/preferences.js";
import { openPrivilegedSftp } from "./privileged-sftp.js";
import type { z } from "zod";
import { interruptExecChannel } from "./exec-interrupt.js";
import type { DraftConnectionResult } from "../shared/draft-connection.js";
import { outboundProxyVersion, summarizeOutboundProxy, type EffectiveProxy } from "./outbound-proxies.js";
import type { DeviceProxies } from "./device-proxies.js";
import { dialShellRelay } from "./shell-relay.js";
import type { QuickEndpoint } from "../shared/quick-connection.js";

const hostTrustErrors: Partial<Record<TrustBlock, string>> = {
  revoked: "SSH 主机身份或签发 CA 已撤销",
  "untrusted-ca": "主机证书的签发 CA 未获批准",
  "certificate-required": "此主机需要可信 CA 签发的证书",
  "principal-mismatch": "SSH 主机证书与此跳的主机地址不匹配",
  "no-principals": "SSH 主机证书未绑定主机地址",
  expired: "SSH 主机证书已过期",
  "not-yet-valid": "SSH 主机证书尚未生效",
  "invalid-host-policy": "已知主机信任规则无效",
};

export interface AuditEntry {
  at: string;
  hostId: string;
  action: string;
  result: "ok" | "failed" | "cancelled" | "unknown";
  detail: string;
}

type ExternalAudit = AuditEntry & { owner: string; routeRevision: string };
const auditOwner = (vaultInstance: string, owner: string) =>
  createHash("sha256")
    .update(JSON.stringify([vaultInstance, owner]))
    .digest("hex");

export interface SshDeps {
  hosts: { list(): HostRecord[] | Promise<HostRecord[]> };
  knownHostsFile: string;
  knownHostsFiles?: HuhuApi["vault"]["files"];
  auditDir: string;
  externalAudit?: { directory: string; vaultInstance: string };
  withManagedAuth: (host: ManagedHost, connect: (auth: ConnectionAuth) => Promise<void>) => Promise<void>;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  connectionPreferences?(): ConnectionPreferences;
  outbound?: {
    resolve(host: ManagedHost): EffectiveProxy;
    dial(profile: NonNullable<EffectiveProxy["profile"]>, target: { host: string; port: number }, signal: AbortSignal, assertCurrent: () => void): Promise<Duplex>;
  };
  deviceProxy?: { commands: DeviceProxies; currentRoute(hostId: string): string };
  decisionTimeoutMs?: number;
}

interface Conn {
  slot: string;
  hostId: string;
  attemptId: string;
  routeIdentity: string;
  clients: Client[];
  target: Client;
  route: ConnectionHop[];
  reconnected: boolean;
  onLoss?: (route: string) => void;
}
type Attempt = {
  slot?: string;
  purpose?: "pane" | "shell" | "files";
  id: string;
  hostId: string;
  signal: AbortSignal;
  requirePromptId: boolean;
  quick?: { host: ManagedHost; auth: ConnectionAuth };
  report?: (status: ConnectionStatus) => void;
  expectedTarget?: string;
  reconnectRoute?: string;
  routeTarget?: string;
  publicProbe?: { validate(): void; keyboard(prompt: KeyboardPrompt): void };
  draft?: {
    authenticate(connect: (auth: ConnectionAuth) => Promise<void>): Promise<void>;
    validate?: (() => void) | undefined;
    reachable?: Extract<DraftConnectionResult, { state: "reachable" }>;
  };
  pending?: { prompt: HostKeyPrompt; answer(accept: boolean, remember: boolean): void } | undefined;
  pendingKeyboard?: { prompt: KeyboardPrompt; answer(responses: string[]): void } | undefined;
  authentication?: { prompt: SshAuthenticationPrompt; answer(answers: string[] | null): void } | undefined;
  changed?: HostKeyPrompt;
  route?: ConnectionHop[];
  outbound?: EffectiveProxy;
  validateRoute?: () => void;
};
export type KeyboardPrompt = { promptId: string; hop: number; serverHostId: string; instructions: string; prompts: { label: string; echo: boolean }[] };
type DialResult = { attemptId: string; connection: Conn };
export type PrivilegedFileLease = { channel: SFTPWrapper; lifetime: AbortController; tail: Promise<void> };
export type SftpSource = string | { hostId: string; connectionId: string; fileSessionId: string; signal: AbortSignal; externalClient?: Client; privileged?: PrivilegedFileLease };
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
  routeIdentity: string;
  kind: "borrowed" | "dedicated";
  holders(): number;
  validate(): Promise<void>;
  release(): void;
};
export type MonitorConnection = Pick<ForwardLease, "id" | "client" | "release" | "routeIdentity"> & { onClose(notify: () => void): () => void };

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
const quickHostId = (id: string) => `host-quick-${id}`;
const isQuickHost = (hostId: string) => hostId.startsWith("host-quick-");

const describeHost = ({ id, name, host, port }: HostRecord) => ({ id, name, host, port });

/** SSH 密钥类型名取自公钥 blob 的第一个字符串。 */
export function keyTypeOf(key: Buffer): string {
  const len = key.readUInt32BE(0);
  return key.subarray(4, 4 + len).toString("ascii");
}

/** 连接管理：逐跳连接、逐跳主机密钥确认、认证、Exec、审计。 */
export class SshManager {
  private conns = new Map<string, Conn>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private shells = new Map<string, ShellRec>();
  private fileOrigins = new WeakMap<Conn, z.infer<typeof FileOrigin>>();
  private shellConnections = new WeakMap<ShellRec, Conn>();
  private attempts = new Map<string, Attempt>();
  private quick = new Map<string, { shellId?: string }>();
  private drafts = new Set<AbortController>();
  private forwardDials = new Map<string, ForwardDial>();
  private borrowedForwards = new WeakMap<Conn, Set<ForwardOwner>>();
  private statuses = new Map<string, ConnectionStatus>();
  private execs = new Map<string, ExecRun>();
  /** 每台 SSH 传输连接同一时间仅运行一个旧入口文件传输。 */
  private transferring = new Map<string, { controller: AbortController; fileSessionId?: string }>();
  private known: KnownHosts;

  constructor(private readonly d: SshDeps) {
    this.known = new KnownHosts(d.knownHostsFile, d.knownHostsFiles);
  }

  // ---- 审计（不含凭据）----
  private audit(e: Omit<AuditEntry, "at"> | Omit<ExternalAudit, "at">, directory = this.d.auditDir): void {
    if (isQuickHost(e.hostId)) return;
    const at = this.d.now().toISOString();
    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, `${at.slice(0, 7)}.ndjson`), JSON.stringify({ at, ...e }) + "\n");
  }

  recordExternalAudit(owner: string, binding: { hostId: string; routeRevision: string }, action: "connect" | "exec", result: AuditEntry["result"]): void {
    const journal = this.d.externalAudit;
    if (!journal) return;
    try {
      const { hostId, routeRevision } = binding;
      this.audit({ hostId, action, result, detail: "", owner: auditOwner(journal.vaultInstance, owner), routeRevision }, journal.directory);
    } catch {
      // Failing to write audit metadata must not change the connection or job result.
    }
  }

  auditList(hostId?: string, limit = 200): AuditEntry[] {
    return this.readAudit<AuditEntry>(this.d.auditDir, (entry) => !hostId || entry.hostId === hostId, limit);
  }

  externalAuditList(owner: string, routes: ReadonlyMap<string, { routeRevision: string }>, hostId: string | undefined, limit: number): AuditEntry[] {
    const journal = this.d.externalAudit;
    if (!journal) return [];
    const ownerId = auditOwner(journal.vaultInstance, owner);
    return this.readAudit<ExternalAudit>(
      journal.directory,
      (entry) => {
        if ((hostId !== undefined && entry.hostId !== hostId) || entry.owner !== ownerId) return false;
        const route = routes.get(entry.hostId);
        return route !== undefined && route.routeRevision === entry.routeRevision;
      },
      limit,
    ).map(({ at, action, result, hostId }) => ({ at, action, result, hostId, detail: "" }));
  }

  private readAudit<T extends AuditEntry>(directory: string, matches: (entry: T) => boolean, limit: number): T[] {
    const month = path.join(directory, `${this.d.now().toISOString().slice(0, 7)}.ndjson`);
    if (!existsSync(month)) return []; // 目录在、当月文件还没有
    return readFileSync(month, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as T)
      .filter(matches)
      .slice(-limit)
      .reverse();
  }

  isConnected(hostId: string): boolean {
    return this.conns.has(hostId);
  }

  hasWorkbenchConnection(hostId: string): boolean {
    return [...this.conns.values()].some((connection) => connection.hostId === hostId)
      || [...this.connecting.values()].some(({ attempt }) => attempt.hostId === hostId);
  }

  connectionStatuses(): ConnectionStatus[] {
    return [...this.statuses.values()].filter(({ hostId }) => !isQuickHost(hostId));
  }

  knownHosts(): KnownHostKey[] {
    return this.known.list();
  }

  forgetHostKey(key: KnownHostKey, assertCurrent?: () => void): Promise<void> {
    return this.known.forget(key, assertCurrent);
  }

  knownAuthorities() {
    return this.known.authorities();
  }

  addHostAuthority(host: Pick<HostRecord, "host" | "port">, publicKey: string, revision: string | null, signal: AbortSignal) {
    return this.known.addAuthority(host.host, host.port, publicKey, revision, signal);
  }

  removeHostAuthority(authority: KnownHostAuthority, revision: string | null, signal: AbortSignal) {
    return this.known.removeAuthority(authority, revision, signal);
  }

  private update(status: ConnectionStatus, slot?: string) {
    const attempt = this.attempts.get(status.attemptId);
    const key = slot ?? attempt?.slot ?? status.hostId;
    const route = status.route ?? attempt?.route;
    const purpose = attempt?.purpose ?? this.statuses.get(key)?.purpose;
    this.statuses.set(key, { ...status, ...(route && { route: [...route] }), ...(purpose && { purpose }) });
    const state = status.state === "key-changed" ? "failed" : status.state === "auth-waiting" ? "waiting" : status.state;
    this.d.publish("ssh.connectionChanged", { hostId: status.hostId, state });
  }

  private trace(attempt: Attempt, hop: number, stage: ConnectionHop["stage"], auth?: ConnectionHop["auth"]) {
    const step = attempt.route?.[hop];
    if (!step || !attempt.route) return;
    const last = step.timeline.at(-1);
    const timeline = last?.stage === stage ? step.timeline : [...step.timeline.slice(-63), { stage, at: this.d.now().toISOString() }];
    attempt.route[hop] = { ...step, stage, timeline, ...(auth && { auth }) };
    if (this.statuses.get(attempt.slot ?? attempt.hostId)?.attemptId === attempt.id) this.update({ hostId: attempt.hostId, attemptId: attempt.id, state: "connecting" });
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

  decideAuthentication(attemptId: string, hop: number, promptId: string, answers: string[] | null): boolean {
    const attempt = this.attempts.get(attemptId);
    const pending = attempt?.authentication;
    if (!attempt || attempt.signal.aborted || pending?.prompt.hop !== hop || pending.prompt.promptId !== promptId) return false;
    if (answers !== null && answers.length !== pending.prompt.questions.length) return false;
    attempt.authentication = undefined;
    pending.answer(answers);
    return true;
  }

  private answerPrompt(attempt: Attempt | undefined, hop: number, accept: boolean, promptId: string | undefined, remember: boolean): boolean {
    const pending = attempt?.pending;
    if (!attempt || attempt.signal.aborted || pending?.prompt.hop !== hop || (promptId === undefined ? attempt.requirePromptId : pending.prompt.promptId !== promptId)) return false;
    attempt.pending = undefined;
    pending.answer(accept, remember);
    return true;
  }

  respondPublicKeyboard(attemptId: string, promptId: string, hop: number, responses: string[]): boolean {
    const attempt = this.attempts.get(attemptId);
    const pending = attempt?.pendingKeyboard;
    if (!attempt?.publicProbe || attempt.signal.aborted || !pending || pending.prompt.promptId !== promptId || pending.prompt.hop !== hop) return false;
    if (responses.length !== pending.prompt.prompts.length) throw errors.invalidInput("键盘交互响应数量不匹配");
    attempt.publicProbe.validate();
    attempt.pendingKeyboard = undefined;
    pending.answer(responses);
    return true;
  }

  openExternalConnection(chain: ManagedHost[], signal: AbortSignal, validate: () => void, report: (status: ConnectionStatus, code?: HuhuError["code"]) => void, keyboard: (prompt: KeyboardPrompt) => void) {
    const id = newId("cap").replace("cap", "att");
    const hostId = chain.at(-1)!.id;
    const attempt: Attempt = { id, hostId, signal, requirePromptId: true, report, publicProbe: { validate, keyboard } };
    this.attempts.set(id, attempt);
    const opened: Client[] = [];
    const close = () => {
      signal.removeEventListener("abort", close);
      for (const client of opened.splice(0).reverse()) {
        client.off("close", close);
        client.end();
      }
    };
    signal.addEventListener("abort", close, { once: true });
    const ready = Promise.resolve()
      .then(() => this.dialChain(chain, attempt, opened))
      .then((client) => {
        signal.throwIfAborted();
        validate();
        for (const hop of opened) hop.once("close", close);
        report({ hostId, attemptId: id, state: "connected" });
        return client;
      })
      .catch((error: unknown) => {
        close();
        if (attempt.changed) report({ hostId, attemptId: id, state: "key-changed", prompt: attempt.changed });
        else report({ hostId, attemptId: id, state: "failed", message: "SSH 连接核验失败" }, error instanceof HuhuError ? error.code : undefined);
        throw error;
      })
      .finally(() => this.attempts.delete(id));
    return { attemptId: id, ready };
  }

  private route(hostId: string, hosts: readonly HostRecord[]): ManagedHost[] {
    const chain = routeForHost(new Map(hosts.map((host) => [host.id, host])), hostId);
    return chain.map((host, hop) => {
      if (!("revision" in host)) throw new HuhuError("SSH_AUTH_FAILED", `第 ${hop + 1} 跳的 SSH 主机需要在模块中重新配置凭据`, { details: { reason: "legacy-host-needs-repair", hop } });
      return host;
    });
  }

  private routeIdentity(chain: readonly ManagedHost[], outbound = this.d.outbound?.resolve(chain.at(-1)!)): string {
    const command = this.d.deviceProxy?.commands.read(chain.at(-1)!.id);
    return connectionIdentity(chain, command ? `command:${command.revision}` : outbound && outboundProxyVersion(outbound));
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

  startQuick(id: string, endpoint: QuickEndpoint, password?: string): { hostId: string } {
    const hostId = quickHostId(id);
    if (this.quick.has(hostId)) return { hostId };
    if (this.connecting.has(hostId)) throw errors.versionConflict("上一次临时连接正在关闭");
    const host: ManagedHost = {
      ...endpoint,
      id: hostId,
      name: `${endpoint.user}@${endpoint.host}`,
      revision: randomUUID(),
      configId: randomUUID(),
      jumpHostIds: [],
      tags: [],
      auth: { kind: password ? "password" : "agent", source: "ssh" },
      authState: {},
      configured: true,
    };
    const session: { shellId?: string } = {};
    this.quick.set(hostId, session);
    const { promise, attempt } = this.begin(hostId, AbortSignal.timeout(5 * 60_000), true, undefined, { host, auth: password ? { password } : agentAuth() });
    void promise.then(async ({ connection }) => {
      if (this.quick.get(hostId) !== session) return;
      const shell = await this.openShell(hostId, undefined, connection, () => queueMicrotask(() => {
        if (this.quick.get(hostId) === session) this.closeQuick(id);
      }));
      if (this.quick.get(hostId) !== session) {
        this.closeShell(shell.id);
        this.shells.delete(shell.id);
        return;
      }
      session.shellId = shell.id;
      this.update({ hostId, attemptId: attempt.id, state: "connected", route: connection.route });
    }).catch((error: unknown) => {
      if (this.quick.get(hostId) !== session || this.statuses.get(hostId)?.state !== "connected") return;
      this.drop(hostId);
      this.update({ hostId, attemptId: attempt.id, state: "failed", message: error instanceof HuhuError ? error.message : "无法打开临时终端" });
    });
    return { hostId };
  }

  quickStatus(id: string) {
    const hostId = quickHostId(id);
    const session = this.quick.get(hostId);
    const status = this.statuses.get(hostId);
    return session && status ? { status, ...(session.shellId && { shellId: session.shellId }) } : null;
  }

  isQuickAttempt(attemptId: string): boolean {
    return Boolean(this.attempts.get(attemptId)?.quick);
  }

  closeQuick(id: string): boolean {
    const hostId = quickHostId(id);
    const session = this.quick.get(hostId);
    if (!session) return false;
    this.quick.delete(hostId);
    this.forgetConnection(hostId);
    if (session.shellId) this.shells.delete(session.shellId);
    return true;
  }

  private begin(hostId: string, signal?: AbortSignal, requirePromptId = false, expectedTarget?: string, quick?: Attempt["quick"], reconnectRoute?: string, owner?: { slot: string; purpose: NonNullable<Attempt["purpose"]> }) {
    const slot = owner?.slot ?? hostId;
    this.cancelReconnect(slot);
    const running = this.connecting.get(slot);
    if (running) {
      if (!expectedTarget) running.direct = true;
      return running;
    }
    const abort = new AbortController();
    const attempt: Attempt = { id: newId("cap").replace("cap", "att"), hostId, signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal, requirePromptId, ...owner, ...(expectedTarget && { expectedTarget }), ...(quick && { quick }), ...(reconnectRoute && { reconnectRoute }) };
    const promise = Promise.resolve()
      .then(() => this.doConnect(attempt))
      .finally(() => {
        if (this.connecting.get(slot)?.attempt === attempt) this.connecting.delete(slot);
        this.attempts.delete(attempt.id);
        delete attempt.quick;
      });
    const created = { attempt, abort, promise, direct: !expectedTarget, workspaces: 0 };
    this.connecting.set(slot, created);
    this.attempts.set(attempt.id, attempt);
    this.update({ hostId, attemptId: attempt.id, state: "connecting" });
    return created;
  }

  private async doConnect(attempt: Attempt): Promise<DialResult> {
    const { hostId, id: attemptId, signal } = attempt;
    const slot = attempt.slot ?? hostId;
    const current = () => this.statuses.get(slot)?.attemptId === attemptId;
    const opened: Client[] = [];
    let stage: { hop: number; server: HostKeyPrompt["server"] } | undefined;
    const closeOpened = () => {
      for (const client of [...opened].reverse()) client.end();
    };
    signal.addEventListener("abort", closeOpened, { once: true });
    try {
      const hosts = attempt.quick ? [attempt.quick.host] : await this.d.hosts.list();
      if (!hosts.some((host) => host.id === hostId)) {
        if (current()) this.statuses.delete(slot);
        throw errors.notFound("SSH 主机不存在");
      }
      const chain = this.route(hostId, hosts);
      attempt.routeTarget = workspaceTarget(chain);
      if (attempt.expectedTarget && attempt.routeTarget !== attempt.expectedTarget) throw new HuhuError("VERSION_CONFLICT", "绑定的 SSH 主机、账户或跳板身份已变更");
      if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消");
      const target = chain[chain.length - 1]!;
      const outbound = this.d.outbound?.resolve(target);
      if (outbound) attempt.outbound = outbound;
      const routeIdentity = this.routeIdentity(chain, outbound);
      if (attempt.reconnectRoute && attempt.reconnectRoute !== routeIdentity) throw new HuhuError("VERSION_CONFLICT", "原 SSH 路由已变更，自动重连已停止");
      const existing = this.conns.get(slot);
      if (existing?.routeIdentity === routeIdentity) {
        existing.attemptId = attemptId;
        existing.reconnected = false;
        const connectionId = this.fileOrigins.get(existing)?.connectionId;
        this.update({ hostId, attemptId, state: "connected", route: existing.route, ...(connectionId && { connectionId }) });
        return { attemptId: "existing", connection: existing };
      }
      this.drop(slot);
      attempt.route = [];
      const client = await this.dialChain(chain, attempt, opened, (hop, host) => {
        stage = { hop, server: describeHost(host) };
      });
      if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消");
      const connection: Conn = { slot, hostId, attemptId, routeIdentity, clients: opened, target: client, route: [...attempt.route], reconnected: attempt.reconnectRoute !== undefined };
      this.conns.set(slot, connection);
      const connectionId = newId("cap");
      this.fileOrigins.set(connection, { connectionId, hostId, name: target.name, host: target.host, user: target.user, port: target.port });
      connection.target.on("close", () => {
        if (this.conns.get(slot) !== connection) return;
        this.drop(slot);
        if (isQuickHost(hostId) || connection.reconnected || !this.d.connectionPreferences?.().autoReconnect) return;
        if (attempt.purpose) connection.onLoss?.(routeIdentity);
        else this.scheduleReconnect(hostId, routeIdentity);
      });
      this.audit({ hostId, action: "connect", result: "ok", detail: `${target.user}@${target.host}:${target.port}（${chain.length - 1} 个跳板）` });
      this.update({ hostId, attemptId, state: "connected", connectionId });
      return { attemptId, connection };
    } catch (e) {
      closeOpened();
      this.audit({ hostId, action: "connect", result: "failed", detail: e instanceof HuhuError ? e.code : "error" });
      if (current()) {
        if (stage) this.trace(attempt, stage.hop, "failed");
        if (attempt.changed) this.update({ hostId, attemptId, state: "key-changed", prompt: attempt.changed, ...(this.connecting.get(attempt.slot ?? hostId)?.workspaces && { workspace: true as const }) });
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
    const outbound = attempt.outbound ?? this.d.outbound?.resolve(target);
    const outboundVersion = outbound && outboundProxyVersion(outbound);
    const device = this.d.deviceProxy;
    const command = device?.commands.read(target.id);
    const validate = () => {
      (attempt.publicProbe?.validate ?? attempt.draft?.validate)?.();
      if (device?.commands.read(target.id)?.revision !== command?.revision) throw errors.versionConflict("本机 SSH ProxyCommand 批准已变更");
      if (command) {
        if (command.route !== device?.currentRoute(target.id)) throw errors.invalidInput("SSH 路由已变更，请重新批准本机 ProxyCommand");
        return;
      }
      const current = this.d.outbound?.resolve(target);
      if ((current && outboundProxyVersion(current)) !== outboundVersion) throw errors.versionConflict("SSH 出站代理已更新");
    };
    attempt.validateRoute = validate;
    let socket: unknown;
    for (const [hop, host] of chain.entries()) {
      attempt.signal.throwIfAborted();
      onHop?.(hop, host);
      if (attempt.route) {
        const proxy = hop === 0 ? (command ? { source: "command" as const } : outbound && summarizeOutboundProxy(outbound)) : undefined;
        attempt.route.push({ ...describeHost(host), user: host.user, auth: host.keyId ? "key-library" : host.auth.kind, stage: "dialing", timeline: [], ...(proxy && { outboundProxy: proxy }), ...(hop > 0 && host.viaShell && { viaShell: true as const }) });
        this.trace(attempt, hop, "dialing");
      }
      if (command && attempt.publicProbe) throw errors.permissionDenied("本机 SSH ProxyCommand");
      validate();
      const client = new Client();
      opened.push(client);
      const authenticate = async (auth: ConnectionAuth) => {
        validate();
        const preferences = {
          connectTimeoutSec: host.connectTimeoutSec ?? defaults.connectTimeoutSec,
          keepaliveIntervalSec: host.keepaliveIntervalSec ?? defaults.keepaliveIntervalSec,
          keepaliveCountMax: host.keepaliveCountMax ?? defaults.keepaliveCountMax,
        };
        const proxy = this.d.outbound;
        const profile = outbound?.profile;
        const dial = device && command
          ? (signal: AbortSignal) => device.commands.dial(command, chain, signal, validate)
          : proxy && profile
            ? (signal: AbortSignal) => proxy.dial(profile, host, signal, validate)
            : undefined;
        if (hop !== 0 || !dial) return this.connectHop(client, host, target, hop, attempt, auth, socket, preferences);
        this.trace(attempt, hop, "proxy");
        const deadline = AbortSignal.any([attempt.signal, AbortSignal.timeout(preferences.connectTimeoutSec * 1000)]);
        const stream = await dial(deadline);
        try {
          deadline.throwIfAborted();
          validate();
          this.trace(attempt, hop, "dialing");
          await this.connectHop(client, host, target, hop, attempt, auth, stream, preferences);
        } catch (error) {
          stream.destroy();
          throw error;
        }
      };
      if (attempt.quick) await authenticate(attempt.quick.auth);
      else if (attempt.draft && host === target) await attempt.draft.authenticate(authenticate);
      else await this.d.withManagedAuth(host, authenticate);
      client.setNoDelay(true);
      const next = chain[hop + 1];
      if (next) {
        validate();
        this.trace(attempt, hop, "forwarding");
        if (next.viaShell) {
          const timeout = (next.connectTimeoutSec ?? defaults.connectTimeoutSec) * 1000;
          socket = await dialShellRelay(client, next, AbortSignal.any([attempt.signal, AbortSignal.timeout(timeout)]));
        } else {
          socket = await new Promise((resolve, reject) =>
            client.forwardOut("127.0.0.1", 0, next.host, next.port, (error, stream) => (error ? reject(new HuhuError("SSH_DISCONNECTED", `跳板 ${hop + 1} 转发失败：${error.message}`)) : resolve(stream))),
          );
        }
      }
      this.trace(attempt, hop, "connected");
    }
    return opened[opened.length - 1]!;
  }

  /** A draft probe owns its transports and never registers them as Workbench connections. */
  async testDraft(chain: ManagedHost[], authenticate: NonNullable<Attempt["draft"]>["authenticate"], callerSignal: AbortSignal, validate?: () => void): Promise<DraftConnectionResult> {
    const lifetime = new AbortController();
    this.drafts.add(lifetime);
    const signal = AbortSignal.any([callerSignal, lifetime.signal, AbortSignal.timeout(30_000)]);
    const draft: NonNullable<Attempt["draft"]> = { authenticate, validate };
    const attempt: Attempt = { id: newId("cap"), hostId: chain.at(-1)!.id, signal, requirePromptId: true, draft };
    const opened: Client[] = [];
    let hop: number | undefined;
    const close = () => {
      for (const client of opened.toReversed()) client.destroy();
    };
    signal.addEventListener("abort", close, { once: true });
    try {
      await this.dialChain(chain, attempt, opened, (index) => {
        hop = index;
      });
      signal.throwIfAborted();
      validate?.();
      return { state: "authenticated" };
    } catch (error) {
      if (callerSignal.aborted || lifetime.signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "测试连接已取消");
      validate?.();
      if (draft.reachable) return draft.reachable;
      return { state: "failed", ...(hop !== undefined && { hop }), message: signal.aborted ? "测试连接超时" : error instanceof HuhuError ? error.message : "测试连接失败" };
    } finally {
      this.drafts.delete(lifetime);
      signal.removeEventListener("abort", close);
      close();
    }
  }

  async acquireForward(hostId: string, boundTarget: string, signal: AbortSignal, notify: ForwardOwner): Promise<ForwardLease> {
    return this.acquireTransport("forward", hostId, signal, notify, boundTarget);
  }

  async acquireMonitor(hostId: string, signal: AbortSignal, notify: ForwardOwner): Promise<MonitorConnection> {
    const lease = await this.acquireTransport("monitor", hostId, signal, notify);
    return {
      id: lease.id,
      client: lease.client,
      routeIdentity: lease.routeIdentity,
      release: lease.release,
      onClose: (closed) => {
        lease.client.once("close", closed);
        return () => lease.client.off("close", closed);
      },
    };
  }

  monitorPane(hostId: string, shellId: string): MonitorConnection {
    const shell = this.shells.get(shellId);
    const conn = this.runningShellConnection(hostId, shellId);
    if (!conn || !shell) throw new HuhuError("SSH_DISCONNECTED", "此分栏的原 SSH 连接已关闭");
    return {
      id: this.fileOrigins.get(conn)!.connectionId,
      client: conn.target,
      routeIdentity: conn.routeIdentity,
      release: () => undefined,
      onClose: (closed) => {
        shell.closers.add(closed);
        return () => shell.closers.delete(closed);
      },
    };
  }

  boundTransport(hostId: string, connectionId: string): Client {
    const connection = this.findConnection(hostId, connectionId);
    if (!connection) throw new HuhuError("SSH_DISCONNECTED", "请选择仍然在线的原 SSH 连接");
    return connection.target;
  }

  private async acquireTransport(scope: "forward" | "monitor", hostId: string, signal: AbortSignal, notify: ForwardOwner, boundTarget?: string): Promise<ForwardLease> {
    const chain = this.route(hostId, await this.d.hosts.list());
    const stale = () => new HuhuError("VERSION_CONFLICT", scope === "forward" ? "转发规则所绑定的主机、账户或跳板配置已变更" : "监控的主机、账户或跳板配置已变更");
    if (boundTarget && workspaceTarget(chain) !== boundTarget) throw stale();
    const identity = this.routeIdentity(chain);
    const validate = async () => {
      if (this.routeIdentity(this.route(hostId, await this.d.hosts.list())) !== identity) throw stale();
      signal.throwIfAborted();
    };
    signal.throwIfAborted();
    const borrowed = this.conns.get(hostId);
    if (borrowed?.routeIdentity === identity) {
      if (scope === "monitor") return { id: this.fileOrigins.get(borrowed)!.connectionId, client: borrowed.target, routeIdentity: identity, kind: "borrowed", holders: () => 0, validate, release: () => undefined };
      const owners = this.borrowedForwards.get(borrowed) ?? new Set<ForwardOwner>();
      owners.add(notify);
      this.borrowedForwards.set(borrowed, owners);
      return {
        id: this.fileOrigins.get(borrowed)!.connectionId,
        client: borrowed.target,
        routeIdentity: identity,
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
      return { id: dial.id, client, routeIdentity: identity, kind: "dedicated", holders: () => dial.owners.size, validate, release };
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

  private connectHop(client: Client, h: HostRecord, target: HostRecord, hop: number, attempt: Attempt, auth: ConnectionAuth, sock: unknown, preferences: Omit<ConnectionPreferences, "autoReconnect" | "shareConnections">): Promise<void> {
    const { id: attemptId, hostId, signal } = attempt;
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      let done = false;
      let ready = false;
      let certificateRequired = false;
      let accepted: { key: Buffer; authority?: Buffer } | undefined;
      const finish = (error?: HuhuError) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (attempt.pending?.prompt.hop === hop) attempt.pending = undefined;
        if (attempt.pendingKeyboard?.prompt.hop === hop) attempt.pendingKeyboard = undefined;
        if (attempt.authentication?.prompt.hop === hop) attempt.authentication = undefined;
        signal.removeEventListener("abort", cancel);
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => {
        finish(signal.reason instanceof HuhuError ? signal.reason : new HuhuError("SSH_DISCONNECTED", "SSH 连接已取消", { details: { hop } }));
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
          const validate = attempt.validateRoute ?? attempt.publicProbe?.validate ?? attempt.draft?.validate;
          validate?.();
          return true;
        } catch (error) {
          finish(error instanceof HuhuError ? error : errors.invalidInput("无法核对 SSH 路由"));
          return false;
        }
      };
      const blockChanged = (prompt: HostKeyPrompt, verify: (ok: boolean) => void) => {
        if (attempt.draft) {
          finish(new HuhuError("SSH_HOST_KEY_MISMATCH", "主机密钥与记录不符，请在已知主机中核对", { details: { hop } }));
          return verify(false);
        }
        attempt.changed = prompt;
        publishKey(prompt, "changed");
        finish(new HuhuError("SSH_HOST_KEY_MISMATCH", "主机密钥与记录不符，已拒绝连接", { details: { hop } }));
        verify(false);
      };
      const blockTrust = (reason: TrustBlock, verify: (ok: boolean) => void) => {
        finish(new HuhuError("SSH_HOST_KEY_MISMATCH", hostTrustErrors[reason] ?? "SSH 主机证书核验失败", { details: { hop, reason } }));
        verify(false);
      };
      const acceptTrust = (key: Buffer, authority: Buffer | undefined, verify: (ok: boolean) => void) => {
        accepted = { key: Buffer.from(key), ...(authority && { authority: Buffer.from(authority) }) };
        const step = attempt.route?.[hop];
        if (step) {
          const fingerprint = fingerprintSha256(key);
          step.verifiedHost = authority ? { kind: "certificate", fingerprint, authority: fingerprintSha256(authority) } : { kind: "fingerprint", fingerprint };
        }
        this.trace(attempt, hop, "authenticating");
        verify(true);
      };
      if (signal.aborted) return cancel();
      signal.addEventListener("abort", cancel, { once: true });
      client.once("ready", () => {
        if (done) return;
        ready = true;
        finish();
      });
      client.once("close", () => finish(new HuhuError("SSH_DISCONNECTED", "SSH 连接已关闭", { details: { hop } })));
      client.on("error", (e: Error & { level?: string }) => {
        if (e.level === "client-authentication") {
          if (attempt.draft && !auth.password && !auth.privateKey && !auth.agent) attempt.draft.reachable = { state: "reachable", hop, reason: "authentication-required" };
          if (h.auth.kind === "agent" && !auth.agent) return finish(new HuhuError("SSH_AUTH_FAILED", "本机 SSH Agent 不可用，请检查 SSH_AUTH_SOCK 或系统服务", { details: { hop, reason: "agent-unavailable" } }));
          return finish(new HuhuError("SSH_AUTH_FAILED", `认证失败（第 ${hop + 1} 跳）`, { details: { hop } }));
        }
        if (certificateRequired && e.level === "handshake") return finish(new HuhuError("SSH_HOST_KEY_MISMATCH", "SSH 主机证书握手未通过", { details: { hop, reason: "certificate-handshake" } }));
        finish(new HuhuError("SSH_DISCONNECTED", `连接失败（第 ${hop + 1} 跳）`, { details: { hop } }));
      });
      const setWaiting = !attempt.report && !attempt.draft;
      // Each server round owns its answer. The network deadline pauses while the user reads it.
      if (attempt.publicProbe) {
        client.on("keyboard-interactive", (_name, instructions, _lang, prompts, respond) => {
          if (done || !currentTarget()) return;
          if (prompts.length > 8 || instructions.length > 1024 || prompts.some(({ prompt }) => prompt.length > 512) || attempt.pendingKeyboard) {
            finish(new HuhuError("SSH_AUTH_FAILED", "SSH 键盘交互请求无效", { details: { hop } }));
            client.end();
            return;
          }
          if (!prompts.length) {
            respond([]);
            return;
          }
          const prompt: KeyboardPrompt = {
            promptId: newId("cap").replace("cap", "prompt"),
            hop,
            serverHostId: h.id,
            instructions,
            prompts: prompts.map(({ prompt: label, echo }) => ({ label, echo: echo ?? false })),
          };
          clearTimeout(timer);
          timer = setTimeout(() => {
            finish(new HuhuError("SSH_TIMEOUT", "等待键盘交互响应超时", { details: { hop } }));
            client.end();
          }, this.d.decisionTimeoutMs ?? 120_000);
          attempt.pendingKeyboard = {
            prompt,
            answer: (responses) => {
              clearTimeout(timer);
              attempt.report?.({ hostId, attemptId, state: "connecting" });
              resumeTimer();
              respond(responses);
            },
          };
          attempt.publicProbe?.keyboard(prompt);
        });
      } else if (setWaiting || attempt.draft) {
        client.on("keyboard-interactive", (name, instructions, _language, prompts, respond) => {
          if (done) return;
          if (attempt.draft) {
            attempt.draft.reachable = { state: "reachable", hop, reason: "authentication-required" };
            finish(new HuhuError("SSH_AUTH_FAILED", "SSH 服务器需要交互认证", { details: { hop } }));
            return;
          }
          if (prompts.length === 0) return respond([]);
          if (prompts.length > 32) {
            finish(new HuhuError("SSH_AUTH_FAILED", "服务器请求的认证输入项过多", { details: { hop } }));
            client.end();
            return;
          }
          clearTimeout(timer);
          const authPrompt: SshAuthenticationPrompt = {
            attemptId,
            promptId: newId("cap").replace("cap", "prompt"),
            hop,
            target: describeHost(target),
            server: describeHost(h),
            name: name.slice(0, 2048),
            instructions: instructions.slice(0, 4096),
            questions: prompts.map(({ prompt, echo }) => ({ text: prompt.slice(0, 2048), echo: echo === true })),
          };
          attempt.authentication = {
            prompt: authPrompt,
            answer: (answers) => {
              clearTimeout(timer);
              if (answers === null) {
                finish(new HuhuError("SSH_DISCONNECTED", "已取消交互认证", { details: { hop } }));
                client.end();
                return;
              }
              this.trace(attempt, hop, "authenticating", "keyboard-interactive");
              resumeTimer();
              respond(answers);
            },
          };
          timer = setTimeout(() => {
            finish(new HuhuError("SSH_DISCONNECTED", "等待交互认证超时", { details: { hop } }));
            client.end();
          }, this.d.decisionTimeoutMs ?? 120_000);
          this.trace(attempt, hop, "answering", "keyboard-interactive");
          this.update({ hostId, attemptId, state: "auth-waiting", authPrompt, ...(this.connecting.get(attempt.slot ?? hostId)?.workspaces && { workspace: true as const }) });
        });
      }
      resumeTimer();
      try {
        certificateRequired = this.known.certificateRequired(h.host, h.port);
        client.connect({
          ...(sock ? { sock: sock as never } : { host: h.host, port: h.port }),
          username: h.user,
          // 网络和认证的计时在等待用户核对指纹期间暂停。
          readyTimeout: 0,
          ...(preferences.keepaliveIntervalSec !== null ? { keepaliveInterval: preferences.keepaliveIntervalSec * 1000 } : {}),
          ...(preferences.keepaliveCountMax !== null ? { keepaliveCountMax: preferences.keepaliveCountMax } : {}),
          ...auth,
          ...(certificateRequired && { algorithms: { serverHostKey: [OPENSSH_ED25519_CERT] } }),
          ...((attempt.publicProbe || setWaiting || attempt.draft) && { tryKeyboard: true }),
          hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
            if (!ready && (signal.aborted || done || !currentTarget())) return verify(false);
            const keyType = keyTypeOf(key);
            let check: ReturnType<KnownHosts["check"]>;
            try {
              check = this.known.check(h.host, h.port, keyType, key, this.d.now());
            } catch {
              finish(new HuhuError("INTERNAL", "读取已知主机记录失败", { details: { hop } }));
              return verify(false);
            }
            if (accepted) {
              // Rekey verifies the authenticated identity again, without any new trust prompt.
              if (check.state === "trusted") {
                const sameAuthority = accepted.authority ? check.authority !== undefined && accepted.authority.equals(check.authority) : !check.authority;
                return verify(sameAuthority && accepted.key.equals(check.key));
              }
              return verify(check.state === "unknown" && !accepted.authority && accepted.key.equals(key));
            }
            if (check.state === "blocked") return blockTrust(check.reason, verify);
            if (check.state === "trusted") {
              return acceptTrust(check.key, check.authority, verify);
            }
            const prompt: HostKeyPrompt = {
              promptId: newId("cap").replace("cap", "prompt"),
              attemptId,
              target: describeHost(target),
              server: describeHost(h),
              hop,
              keyType: keyType === OPENSSH_ED25519_CERT ? "ssh-ed25519" : keyType,
              fingerprint: fingerprintSha256(check.state === "mismatch" ? check.key : key),
              recorded: check.state === "mismatch" ? check.recorded : [],
            };
            if (check.state === "mismatch") return blockChanged(prompt, verify);
            if (attempt.draft) {
              attempt.draft.reachable = { state: "reachable", hop, reason: "host-key" };
              finish(new HuhuError("SSH_DISCONNECTED", "SSH 服务器指纹待确认", { details: { hop } }));
              return verify(false);
            }
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
                    if (result.state === "blocked") return blockTrust(result.reason, verify);
                    if (result.state === "mismatch") return blockChanged({ ...prompt, promptId: newId("cap").replace("cap", "prompt"), recorded: result.recorded }, verify);
                    if (!currentTarget()) return verify(false);
                    resumeTimer();
                    acceptTrust(key, undefined, verify);
                  })
                  .catch(() => {
                    if (done) return;
                    finish(new HuhuError("INTERNAL", "保存 SSH 主机信任失败", { details: { hop } }));
                    verify(false);
                  });
              },
            };
            const status = { hostId, attemptId, state: "waiting", prompt, ...(this.connecting.get(attempt.slot ?? hostId)?.workspaces && { workspace: true as const }) } as const;
            this.trace(attempt, hop, "trust");
            if (attempt.report) attempt.report(status);
            else this.update(status);
            publishKey(prompt, "first");
          },
        } as never);
      } catch (error) {
        if (error instanceof HuhuError) finish(new HuhuError(error.code, error.message, { details: { ...error.details, hop } }));
        else finish(new HuhuError("SSH_AUTH_FAILED", "SSH 连接设置无法使用", { details: { hop } }));
      }
    });
  }

  // ---- Shell ----
  workspacePrompt(slot: string, target: string): HostKeyPrompt | undefined {
    const status = this.statuses.get(slot);
    return status?.state === "waiting" && this.attempts.get(status.attemptId)?.routeTarget === target ? status.prompt : undefined;
  }

  workspaceAuthentication(slot: string, target: string): SshAuthenticationPrompt | undefined {
    const status = this.statuses.get(slot);
    return status?.state === "auth-waiting" && this.attempts.get(status.attemptId)?.routeTarget === target ? status.authPrompt : undefined;
  }

  async openWorkspaceShell(pane: { hostId: string; target: string; loginCommand?: string | undefined }, signal: AbortSignal, onEnd: () => void, slot = pane.hostId, recovery?: { onLoss(route: string): void; route?: string }): Promise<ShellInfo> {
    const { hostId, target, loginCommand } = pane;
    const chain = this.route(hostId, await this.d.hosts.list());
    const bindingChanged = () => new HuhuError("VERSION_CONFLICT", "绑定的 SSH 主机、账户或跳板身份已变更");
    if (workspaceTarget(chain) !== target) throw bindingChanged();
    signal.throwIfAborted();
    const owner = slot === hostId ? undefined : { slot, purpose: "pane" as const };
    const dial = this.begin(hostId, owner ? signal : undefined, true, target, undefined, recovery?.route, owner);
    dial.workspaces++;
    const status = this.statuses.get(slot);
    if (status?.attemptId === dial.attempt.id && (status.state === "waiting" || status.state === "key-changed" || status.state === "auth-waiting") && !status.workspace) this.update({ ...status, workspace: true });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--dial.workspaces === 0 && !dial.direct && this.connecting.get(slot) === dial && !this.conns.has(slot)) dial.abort.abort();
    };
    signal.addEventListener("abort", release, { once: true });
    let connection: Conn;
    try {
      ({ connection } = await dial.promise);
    } finally {
      signal.removeEventListener("abort", release);
      release();
    }
    if (connection.routeIdentity !== this.routeIdentity(chain) || workspaceTarget(this.route(hostId, await this.d.hosts.list())) !== target) throw bindingChanged();
    signal.throwIfAborted();
    const shell = await this.openShell(hostId, undefined, connection, onEnd, !loginCommand);
    if (signal.aborted) {
      this.closeShell(shell.id);
      signal.throwIfAborted();
    }
    if (owner && recovery) connection.onLoss = recovery.onLoss;
    if (loginCommand) {
      const rec = this.shells.get(shell.id);
      if (rec?.state === "running") rec.channel.write(loginCommand + "\r");
    }
    return shell;
  }

  async openShell(hostId: string, size: { cols: number; rows: number } = { cols: 80, rows: 24 }, expected?: Conn, onEnd?: () => void, integrate = false): Promise<ShellInfo> {
    const conn = expected ?? this.conns.get(hostId);
    if (!conn || conn.hostId !== hostId || this.conns.get(conn.slot) !== conn) throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    const pty = { term: "xterm-256color", cols: size.cols, rows: size.rows };
    const integrated = integrate ? await openIntegratedShell(conn.target, pty) : undefined;
    const channel = integrated?.channel ?? (await new Promise<ClientChannel>((resolve, reject) => conn.target.shell(pty, (err, ch) => (err ? reject(new HuhuError("SSH_DISCONNECTED", `打开 Shell 失败：${err.message}`)) : resolve(ch)))));
    if (this.conns.get(conn.slot) !== conn) {
      channel.close();
      throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    }
    const id = `${isQuickHost(hostId) ? "ssh-local-quick-" : "ssh-"}${newId("cap").replace("cap-", "")}`;
    const rec: ShellRec = { id, hostId, name: `Shell ${this.listShells(hostId).length + 1}`, state: "running", createdAt: this.d.now().toISOString(), channel, buffer: [], bufferSize: 0, viewers: new Set(), closers: new Set() };
    this.shells.set(id, rec);
    if (integrated) rec.directory = integrated.directory;
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
      this.endShell(rec);
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
    return [...this.shells.values()].filter((s) => !isQuickHost(s.hostId) && (!hostId || s.hostId === hostId)).map((s) => this.info(s));
  }
  closeShell(id: string): boolean {
    const s = this.shells.get(id);
    if (!s) return false;
    this.endShell(s);
    s.channel.close(); // “结束 shell”才关闭 channel；关闭视图不会
    return true;
  }
  /** 绑定一个查看者（WebSocket）：先回放最近输出，再接实时输出。返回 detach 函数；不会关闭 channel。 */
  attachShell(id: string, view: { onData(b: Buffer): void; onEnd(): void }, replay = true): { write(b: Buffer): void; resize(cols: number, rows: number): void; detach(): void } | null {
    const s = this.shells.get(id);
    if (!s) return null;
    if (replay) for (const b of s.buffer) view.onData(b);
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

  private endShell(shell: ShellRec): void {
    if (shell.state === "ended") return;
    shell.state = "ended";
    for (const notify of shell.closers) notify();
    shell.closers.clear();
  }

  private drop(slot: string): void {
    const connection = this.conns.get(slot);
    if (!connection) return;
    this.conns.delete(slot);
    for (const shell of this.shells.values()) {
      if (this.shellConnections.get(shell) === connection) this.endShell(shell);
    }
    for (const client of connection.clients.toReversed()) client.end();
    const { hostId, attemptId } = connection;
    if (this.statuses.get(slot)?.attemptId === attemptId) this.update({ hostId, attemptId, state: "disconnected" }, slot);
  }

  newPaneSlot(hostId: string): string {
    return this.d.connectionPreferences?.().shareConnections === false ? newId("cap") : hostId;
  }

  closeOwnedConnection(slot: string): void {
    const dial = this.connecting.get(slot);
    if (dial) {
      this.connecting.delete(slot);
      dial.abort.abort();
    }
    this.cancelReconnect(slot);
    this.drop(slot);
    const status = this.statuses.get(slot);
    if (status) {
      this.statuses.delete(slot);
      this.d.publish("ssh.connectionChanged", { hostId: status.hostId, state: "disconnected" });
    }
  }

  async openFileConnection(hostId: string, signal: AbortSignal) {
    const slot = newId("cap");
    const close = () => this.closeOwnedConnection(slot);
    try {
      const { connection } = await this.begin(hostId, signal, true, undefined, undefined, undefined, { slot, purpose: "files" }).promise;
      signal.throwIfAborted();
      return { origin: this.fileOrigins.get(connection)!, close };
    } catch (error) {
      close();
      throw error;
    }
  }

  async openWorkbenchShell(hostId: string, size: { cols: number; rows: number }, signal: AbortSignal): Promise<ShellInfo> {
    if (this.d.connectionPreferences?.().shareConnections !== false) return this.openShell(hostId, size);
    const slot = newId("cap");
    try {
      const { connection } = await this.begin(hostId, signal, true, undefined, undefined, undefined, { slot, purpose: "shell" }).promise;
      signal.throwIfAborted();
      const shell = await this.openShell(hostId, size, connection, () => this.closeOwnedConnection(slot));
      if (signal.aborted) {
        this.closeShell(shell.id);
        signal.throwIfAborted();
      }
      return shell;
    } catch (error) {
      this.closeOwnedConnection(slot);
      throw error;
    }
  }

  private scheduleReconnect(hostId: string, route: string): void {
    this.cancelReconnect(hostId);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(hostId);
      if (!this.d.connectionPreferences?.().autoReconnect || this.conns.has(hostId) || this.connecting.has(hostId)) return;
      void this.begin(hostId, AbortSignal.timeout(90_000), true, undefined, undefined, route).promise.catch(() => undefined);
    }, 1000);
    this.reconnectTimers.set(hostId, timer);
    timer.unref();
  }

  private cancelReconnect(hostId: string): void {
    clearTimeout(this.reconnectTimers.get(hostId));
    this.reconnectTimers.delete(hostId);
  }

  disconnect(hostId: string): void {
    this.cancelReconnect(hostId);
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
    for (const hostId of this.reconnectTimers.keys()) this.cancelReconnect(hostId);
    for (const draft of this.drafts) draft.abort();
    for (const { abort } of this.connecting.values()) abort.abort();
    for (const { abort } of this.forwardDials.values()) abort.abort();
    for (const id of Array.from(this.conns.keys())) this.drop(id);
    for (const [hostId, session] of this.quick) {
      this.statuses.delete(hostId);
      if (session.shellId) this.shells.delete(session.shellId);
    }
    this.quick.clear();
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

  private findConnection(hostId: string, connectionId: string): Conn | undefined {
    return [...this.conns.values()].find((conn) => conn.hostId === hostId && this.fileOrigins.get(conn)?.connectionId === connectionId);
  }

  hasFileConnection(hostId: string, connectionId: string): boolean {
    return this.findConnection(hostId, connectionId) !== undefined;
  }

  private runningShellConnection(hostId: string, shellId: string): Conn | undefined {
    const shell = this.shells.get(shellId);
    const conn = shell && this.shellConnections.get(shell);
    return shell?.state === "running" && conn?.hostId === hostId && this.conns.get(conn.slot) === conn ? conn : undefined;
  }

  fileOrigin(hostId: string, shellId?: string): z.infer<typeof FileOrigin> | undefined {
    const conn = shellId ? this.runningShellConnection(hostId, shellId) : this.conns.get(hostId);
    return conn && this.fileOrigins.get(conn);
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
  async withSftp<T>(source: SftpSource, action: string, detail: string, fn: (s: SFTPWrapper, signal: AbortSignal) => Promise<T>, opts: { transfer?: boolean; signal?: AbortSignal; timeoutMs?: number; elevated?: boolean } = {}): Promise<T> {
    const binding = typeof source === "string" ? undefined : source;
    const hostId = typeof source === "string" ? source : source.hostId;
    const conn = binding ? this.findConnection(hostId, binding.connectionId) : this.conns.get(hostId);
    const external = binding?.externalClient;
    const target = external ?? conn?.target;
    if (!target) throw new HuhuError("SSH_DISCONNECTED", binding ? "文件会话的原连接已断开" : "尚未连接该主机");
    const transferKey = binding?.connectionId ?? this.fileOrigin(hostId)!.connectionId;
    if (opts.transfer && this.transferring.has(transferKey)) throw errors.invalidInput("这台主机正在传输另一个文件，请等它完成后再试");
    const ac = new AbortController();
    const privileged = opts.elevated ? binding?.privileged : undefined;
    const signal = AbortSignal.any([ac.signal, ...(binding ? [binding.signal] : []), ...(opts.signal ? [opts.signal] : []), ...(privileged ? [privileged.lifetime.signal] : [])]);
    signal.throwIfAborted();
    if (opts.transfer) this.transferring.set(transferKey, { controller: ac, ...(binding ? { fileSessionId: binding.fileSessionId } : {}) });
    let session: SFTPWrapper | undefined;
    let unlock: (() => void) | undefined;
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
        privileged ? (() => {
          const previous = privileged.tail;
          const held = new Promise<void>((release) => { unlock = release; });
          privileged.tail = previous.then(() => held);
          return previous.then(() => {
            signal.throwIfAborted();
            return privileged.channel;
          });
        })() : opts.elevated ? openPrivilegedSftp(target, signal) : new Promise<SFTPWrapper>((resolve, reject) =>
          target.sftp((err, channel) => {
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
        target.once("close", onClose);
        live.once("close", onClose);
        const prev = detach;
        detach = () => {
          prev();
          target.removeListener("close", onClose);
          live.removeListener("close", onClose);
        };
      });
      dead.catch(() => undefined);
      const r = await Promise.race([fn(live, signal), dead, stop]);
      if (!external) this.audit({ hostId, action: `sftp.${action}`, result: "ok", detail: detail.slice(0, 500) });
      return r;
    } catch (e) {
      const he = sftp.mapSftpError(e, detail);
      if (!external) this.audit({ hostId, action: `sftp.${action}`, result: /已取消/.test(he.message) ? "cancelled" : "failed", detail: `${detail.slice(0, 400)}：${he.message.slice(0, 100)}` });
      throw he;
    } finally {
      detach();
      try {
        if (!privileged) session?.end();
        if (privileged && session && signal.aborted) privileged.lifetime.abort();
      } catch {
        /* 连接已断 */
      }
      unlock?.();
      if (opts.transfer) this.transferring.delete(transferKey);
    }
  }

  /** 取消这台主机上正在进行的传输。 */
  sftpCancel(source: SftpSource): boolean {
    const connectionId = typeof source === "string" ? this.fileOrigin(source)?.connectionId : source.connectionId;
    const transfer = connectionId && this.transferring.get(connectionId);
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
    interruptExecChannel(run.channel);
    run.channel.close();
    return true;
  }
}
