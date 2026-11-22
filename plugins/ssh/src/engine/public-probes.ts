import { createHash } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext, HuhuApi, OperationReceipts } from "@huhu/kernel";
import type { Client } from "ssh2";
import { z } from "zod";
import { KnownHostKey, type ConnectionStatus, type HostKeyPrompt } from "../shared/trust.js";
import type { SshManager } from "./manager.js";
import type { RetainActivity } from "./public-jobs.js";
import { assertSshHosts, externalSshOwner, hasSshHosts, readBoundRoute, ResourceHost, ResourceHostId, selectedSshHosts, visibleSshRoutes } from "./public-resources.js";
import { workspaceTarget } from "./workspace-target.js";

const attemptId = z.string().min(1).max(128);
export const StartPublicProbe = ResourceHostId.extend({ routeRevision: ResourceHost.shape.routeRevision });
export const StartPublicProbeIntent = StartPublicProbe.extend({ intentKey: CapabilityIntentKeySchema.optional() });
export const ConnectOwned = StartPublicProbe.extend({ intentKey: CapabilityIntentKeySchema });
export const PublicProbeId = ResourceHostId.extend({ attemptId });
export const OwnedConnection = StartPublicProbe.extend({ attemptId });
const PublicTrustPrompt = z.strictObject({
  promptId: z.string().min(1).max(128),
  hop: z.int().nonnegative(),
  serverHostId: ResourceHostId.shape.hostId,
  keyType: KnownHostKey.shape.keyType,
  fingerprint: KnownHostKey.shape.fingerprint,
  promptRevision: ResourceHost.shape.routeRevision,
});

export const DecidePublicProbe = PublicProbeId.extend({
  routeRevision: ResourceHost.shape.routeRevision,
  ...PublicTrustPrompt.shape,
  accept: z.boolean(),
});
const statusBase = PublicProbeId.extend({ routeRevision: ResourceHost.shape.routeRevision });
export const PublicProbeStatus = z.discriminatedUnion("state", [
  statusBase.extend({ state: z.enum(["connecting", "verified", "connected", "disconnected"]) }),
  statusBase.extend({ state: z.enum(["waiting", "key-changed"]), prompt: PublicTrustPrompt }),
  statusBase.extend({ state: z.literal("failed"), reason: z.enum(["route-changed", "authentication-failed", "timeout", "connection-failed"]) }),
]);

type Status = z.infer<typeof PublicProbeStatus>;
type Binding = z.infer<typeof StartPublicProbe>;
type Probe = {
  owner: string;
  kind: "probe" | "job" | "connection";
  hostIds: string[];
  authorized(): boolean;
  validate(): void;
  abort: AbortController;
  expires: number;
  status: Status;
  client?: Client;
  cancelled?: true;
  revoked?: true;
};

function promptView({ hostId, attemptId, routeRevision }: Status, prompt: HostKeyPrompt): z.infer<typeof PublicTrustPrompt> {
  const { promptId, hop, keyType, fingerprint } = prompt;
  const serverHostId = prompt.server.id;
  const promptRevision = createHash("sha256")
    .update(JSON.stringify([hostId, attemptId, routeRevision, hop, serverHostId, promptId, keyType, fingerprint]))
    .digest("hex");
  return { promptId, hop, serverHostId, keyType, fingerprint, promptRevision };
}

function failure(error?: HuhuError["code"]): Extract<Status, { state: "failed" }>["reason"] {
  if (error === "VERSION_CONFLICT" || error === "NOT_FOUND") return "route-changed";
  if (error === "SSH_AUTH_FAILED") return "authentication-failed";
  return error === "SSH_TIMEOUT" ? "timeout" : "connection-failed";
}

export class PublicSshProbes {
  private readonly probes = new Map<string, Probe>();

  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly manager: SshManager,
    private readonly operations?: { vaultInstance: string; receipts: OperationReceipts; retainActivity?: RetainActivity },
    private readonly connectionChanged?: (id: string) => void,
  ) {}

  start(context: CapabilityContext, { intentKey, ...binding }: z.infer<typeof StartPublicProbeIntent>) {
    const owner = externalSshOwner(context);
    context.signal.throwIfAborted();
    assertSshHosts(context, [binding.hostId]);
    if (intentKey !== undefined) return this.startIntent(context, owner, binding, intentKey, "probe");
    readBoundRoute(this.files, context, binding);
    const existing = [...this.probes.values()].find(
      ({ owner: recordOwner, kind, expires, status }) =>
        recordOwner === owner && kind === "probe" && expires > Date.now() && status.hostId === binding.hostId && status.routeRevision === binding.routeRevision && (status.state === "connecting" || status.state === "waiting"),
    );
    if (existing) return { attemptId: existing.status.attemptId };
    return this.startProbe(context, owner, binding);
  }

  connect(context: CapabilityContext, { intentKey, ...binding }: z.infer<typeof ConnectOwned>) {
    const owner = externalSshOwner(context);
    context.signal.throwIfAborted();
    assertSshHosts(context, [binding.hostId]);
    return this.startIntent(context, owner, binding, intentKey, "connection");
  }

  private startIntent(context: CapabilityContext, owner: string, binding: Binding, key: string, kind: "probe" | "connection") {
    if (!this.operations) throw errors.invalidInput("此 Vault 无法保存 SSH 连接意图");
    this.files.assertWritable();
    const { receipts, vaultInstance } = this.operations;
    const receiptOwner = createHash("sha256")
      .update(JSON.stringify([vaultInstance, owner]))
      .digest("hex");
    const capability = kind === "probe" ? "ssh.resources.connection.start" : "ssh.connect";
    const previous = receipts.lookup(receiptOwner, { capability, intentKey: key });
    if (previous) {
      const { mismatch } = receipts.claim(receiptOwner, capability, key, binding);
      if (mismatch) throw errors.idempotencyMismatch();
      assertSshHosts(context, previous.resources?.["ssh.hosts"] ?? [binding.hostId]);
      const result = previous.phase === "completed" && previous.result.ok ? PublicProbeId.pick({ attemptId: true }).safeParse(previous.result.data) : undefined;
      const probe = result?.success ? this.probes.get(result.data.attemptId) : undefined;
      if (probe?.revoked) throw errors.permissionDenied("SSH 主机授权");
      if (probe && probe.expires > Date.now() && result?.success) return result.data;
      throw new HuhuError("INTERNAL", "原 SSH 核验结果待核实", { retryable: false, details: { outcome: "unknown", operationId: previous.operationId } });
    }
    const chain = readBoundRoute(this.files, context, binding);
    const { entry } = receipts.claim(receiptOwner, capability, key, binding, { "ssh.hosts": chain.map(({ id }) => id) });
    if (entry.phase !== "accepted") throw errors.invalidInput("SSH 核验意图已结束");
    const result = kind === "probe" ? this.startProbe(context, owner, binding) : this.startConnection(context, owner, binding);
    receipts.complete(entry, "completed", { ok: true, data: result });
    return result;
  }

  private startConnection(context: CapabilityContext, owner: string, binding: Binding) {
    const release = this.operations?.retainActivity?.();
    let connection: ReturnType<PublicSshProbes["open"]>;
    try {
      connection = this.open(context, owner, binding, "connection");
    } catch (error) {
      release?.();
      throw error;
    }
    const record = this.probes.get(connection.attemptId)!;
    const closed = () => {
      delete record.client;
      record.expires = Date.now() + 300_000;
      if (record.status.state === "connected") record.status = { ...binding, attemptId: connection.attemptId, state: "disconnected" };
      release?.();
      this.connectionChanged?.(connection.attemptId);
    };
    record.abort.signal.addEventListener("abort", closed, { once: true });
    void connection.ready.then(
      (client) => {
        if (record.abort.signal.aborted) return;
        record.client = client;
        record.status = { ...binding, attemptId: connection.attemptId, state: "connected" };
        client.once("close", connection.close);
        this.manager.recordExternalAudit(owner, binding, "connect", "ok");
        this.connectionChanged?.(connection.attemptId);
      },
      () => {
        connection.close();
        this.manager.recordExternalAudit(owner, binding, "connect", record.cancelled ? "cancelled" : "failed");
      },
    );
    this.connectionChanged?.(connection.attemptId);
    return { attemptId: connection.attemptId };
  }

  private startProbe(context: CapabilityContext, owner: string, binding: Binding) {
    const connection = this.open(context, owner, binding, "probe");
    const finish = (result: "ok" | "failed") => {
      connection.close();
      this.manager.recordExternalAudit(owner, binding, "connect", this.probes.get(connection.attemptId)?.cancelled ? "cancelled" : result);
    };
    void connection.ready.then(
      () => finish("ok"),
      () => finish("failed"),
    );
    return { attemptId: connection.attemptId };
  }

  openForJob(context: CapabilityContext, owner: string, binding: Binding) {
    return this.open(context, owner, binding, "job");
  }

  private open(context: CapabilityContext, owner: string, { hostId, routeRevision }: Binding, kind: Probe["kind"]) {
    const current = () => readBoundRoute(this.files, context, { hostId, routeRevision });
    const chain = current();
    const now = Date.now();
    for (const [id, probe] of this.probes) {
      if (probe.expires > now) continue;
      if (probe.kind === "probe") probe.abort.abort();
      this.probes.delete(id);
    }
    const running = [...this.probes.values()].filter((probe) => probe.owner === owner && (probe.status.state === "connecting" || probe.status.state === "waiting" || probe.status.state === "connected"));
    if (this.probes.size >= 64) throw errors.invalidInput("SSH 核验记录已满，请稍后重试");
    if (running.length >= 4) throw errors.invalidInput("当前主体的 SSH 连接核验过多");
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 180_000);
    timeout.unref();
    const apply = (event: ConnectionStatus, code?: HuhuError["code"]) => {
      const probe = this.probes.get(event.attemptId);
      if (!probe) return;
      const base = { hostId, routeRevision, attemptId: event.attemptId };
      switch (event.state) {
        case "waiting":
        case "key-changed":
          probe.status = { ...base, state: event.state, prompt: promptView(probe.status, event.prompt) };
          break;
        case "connecting":
          probe.status = { ...base, state: "connecting" };
          break;
        case "connected":
          if (kind !== "connection") probe.status = { ...base, state: "verified" };
          break;
        default:
          probe.status = { ...base, state: "failed", reason: failure(code) };
      }
      if (kind === "connection") this.connectionChanged?.(event.attemptId);
    };
    const connection = this.manager.openExternalConnection(chain, abort.signal, current, apply);
    const { attemptId } = connection;
    const hostIds = chain.map(({ id }) => id);
    this.probes.set(attemptId, {
      owner, kind, hostIds, authorized: () => hasSshHosts(context, hostIds), validate: current, abort,
      expires: kind === "connection" ? Infinity : now + 300_000,
      status: { hostId, routeRevision, attemptId, state: "connecting" },
    });
    return {
      attemptId,
      ready: connection.ready.finally(() => clearTimeout(timeout)),
      close: () => abort.abort(),
    };
  }

  connection(context: CapabilityContext, input: z.infer<typeof OwnedConnection>) {
    const record = this.get(context, input, "connection");
    if (record.status.routeRevision !== input.routeRevision) throw errors.notFound("原 SSH 连接");
    const route = readBoundRoute(this.files, context, input);
    if (!record.client || record.abort.signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "该主机的原连接已结束");
    const { name, host, user, port } = route.at(-1)!;
    return {
      client: record.client,
      signal: record.abort.signal,
      hostIds: record.hostIds,
      targetIdentity: workspaceTarget(route),
      origin: { connectionId: input.attemptId, hostId: input.hostId, name, host, user, port },
    };
  }

  workbenchConnections(): ConnectionStatus[] {
    return [...this.probes.values()].filter(({ kind }) => kind === "connection").map(({ status }) => ({
      hostId: status.hostId,
      attemptId: status.attemptId,
      source: "external" as const,
      state: status.state === "connected" ? "connected" : status.state === "failed" || status.state === "disconnected" || status.state === "key-changed" ? "disconnected" : "connecting",
    }));
  }

  closeWorkbench(attemptId: string, hostId: string): void {
    const probe = this.probes.get(attemptId);
    if (probe?.kind !== "connection" || probe.status.hostId !== hostId) throw errors.notFound("外部 SSH 连接");
    probe.cancelled = true;
    probe.abort.abort();
  }

  revalidateConnections(): void {
    for (const probe of this.probes.values()) {
      if (probe.kind !== "connection" || probe.abort.signal.aborted) continue;
      try {
        probe.validate();
      } catch {
        probe.abort.abort();
      }
    }
  }

  read(context: CapabilityContext, input: z.infer<typeof PublicProbeId>): Status {
    return this.get(context, input).status;
  }

  private get(context: CapabilityContext, input: z.infer<typeof PublicProbeId>, kind?: Probe["kind"]): Probe {
    const probe = this.probes.get(input.attemptId);
    if (probe?.owner !== externalSshOwner(context) || probe.status.hostId !== input.hostId || probe.expires <= Date.now() || (kind && probe.kind !== kind)) throw errors.notFound("SSH 连接核验");
    assertSshHosts(context, probe.hostIds);
    if (probe.revoked) throw errors.permissionDenied("SSH 主机授权");
    return probe;
  }

  list(context: CapabilityContext): Status[] {
    const owner = externalSshOwner(context);
    const selected = selectedSshHosts(context);
    const now = Date.now();
    return [...this.probes.values()].filter((probe) => probe.owner === owner && !probe.revoked && probe.expires > now && probe.hostIds.every((id) => selected.has(id))).map(({ status }) => status);
  }

  currentStatuses(context: CapabilityContext): Status[] {
    const routes = visibleSshRoutes(this.files, context);
    return this.list(context).filter(({ hostId, routeRevision }) => routes.get(hostId)?.routeRevision === routeRevision);
  }

  cancel(context: CapabilityContext, input: z.infer<typeof PublicProbeId> & Binding) {
    const probe = this.get(context, input);
    if (probe.kind === "job") throw errors.notFound("SSH 连接");
    if (probe.status.routeRevision !== input.routeRevision) throw errors.notFound("SSH 连接核验");
    readBoundRoute(this.files, context, input);
    context.signal.throwIfAborted();
    if (!probe.abort.signal.aborted && (probe.status.state === "connecting" || probe.status.state === "waiting" || probe.status.state === "connected")) {
      probe.cancelled = true;
      probe.abort.abort();
    }
    return { ok: true as const };
  }

  decide(context: CapabilityContext, input: z.infer<typeof DecidePublicProbe>, kind?: Probe["kind"]) {
    const { status } = this.get(context, input, kind);
    if (status.state !== "waiting") throw errors.notFound("SSH 首次信任待答");
    const { prompt } = status;
    if (
      status.routeRevision !== input.routeRevision ||
      prompt.promptId !== input.promptId ||
      prompt.hop !== input.hop ||
      prompt.serverHostId !== input.serverHostId ||
      prompt.keyType !== input.keyType ||
      prompt.fingerprint !== input.fingerprint ||
      prompt.promptRevision !== input.promptRevision
    ) {
      throw errors.notFound("SSH 首次信任待答");
    }
    context.signal.throwIfAborted();
    if (!this.manager.decidePublicProbe(input.attemptId, input.hop, input.promptId, input.accept)) throw errors.notFound("SSH 首次信任待答");
    return { applied: true as const };
  }

  dispose(): void {
    for (const { abort } of this.probes.values()) abort.abort();
    this.probes.clear();
  }

  revokeUnauthorized(): void {
    for (const probe of this.probes.values()) {
      if (probe.revoked || probe.authorized()) continue;
      probe.revoked = true;
      probe.abort.abort();
    }
  }
}
