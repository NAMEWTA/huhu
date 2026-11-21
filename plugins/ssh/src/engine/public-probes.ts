import { createHash } from "node:crypto";
import { errors, type HuhuError } from "@huhu/contracts";
import type { CapabilityContext, HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { KnownHostKey, type ConnectionStatus, type HostKeyPrompt } from "../shared/trust.js";
import type { SshManager } from "./manager.js";
import { externalSshOwner, readBoundRoute, ResourceHost, ResourceHostId } from "./public-resources.js";

const attemptId = z.string().min(1).max(128);
export const StartPublicProbe = ResourceHostId.extend({ routeRevision: ResourceHost.shape.routeRevision });
export const PublicProbeId = ResourceHostId.extend({ attemptId });
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
  statusBase.extend({ state: z.enum(["connecting", "verified"]) }),
  statusBase.extend({ state: z.enum(["waiting", "key-changed"]), prompt: PublicTrustPrompt }),
  statusBase.extend({ state: z.literal("failed"), reason: z.enum(["route-changed", "authentication-failed", "timeout", "connection-failed"]) }),
]);

type Status = z.infer<typeof PublicProbeStatus>;
type Binding = z.infer<typeof StartPublicProbe>;
type Probe = { owner: string; kind: "probe" | "job"; abort: AbortController; expires: number; status: Status };

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
  ) {}

  start(context: CapabilityContext, binding: Binding) {
    const owner = externalSshOwner(context);
    context.signal.throwIfAborted();
    readBoundRoute(this.files, binding);
    const existing = [...this.probes.values()].find(
      ({ owner: recordOwner, kind, expires, status }) =>
        recordOwner === owner && kind === "probe" && expires > Date.now() && status.hostId === binding.hostId && status.routeRevision === binding.routeRevision && (status.state === "connecting" || status.state === "waiting"),
    );
    if (existing) return { attemptId: existing.status.attemptId };
    const connection = this.open(owner, binding, "probe");
    void connection.ready.then(connection.close, connection.close);
    return { attemptId: connection.attemptId };
  }

  openForJob(owner: string, binding: Binding) {
    return this.open(owner, binding, "job");
  }

  private open(owner: string, { hostId, routeRevision }: Binding, kind: Probe["kind"]) {
    const current = () => readBoundRoute(this.files, { hostId, routeRevision });
    const chain = current();
    const now = Date.now();
    for (const [id, probe] of this.probes) {
      if (probe.expires > now) continue;
      if (probe.kind === "probe") probe.abort.abort();
      this.probes.delete(id);
    }
    const running = [...this.probes.values()].filter((probe) => probe.owner === owner && (probe.status.state === "connecting" || probe.status.state === "waiting"));
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
          probe.status = { ...base, state: "verified" };
          break;
        default:
          probe.status = { ...base, state: "failed", reason: failure(code) };
      }
    };
    const connection = this.manager.openExternalConnection(chain, abort.signal, current, apply);
    const { attemptId } = connection;
    this.probes.set(attemptId, { owner, kind, abort, expires: now + 300_000, status: { hostId, routeRevision, attemptId, state: "connecting" } });
    return {
      attemptId,
      ready: connection.ready.finally(() => clearTimeout(timeout)),
      close: () => abort.abort(),
    };
  }

  read(context: CapabilityContext, input: z.infer<typeof PublicProbeId>): Status {
    const probe = this.probes.get(input.attemptId);
    if (probe?.owner !== externalSshOwner(context) || probe.status.hostId !== input.hostId || probe.expires <= Date.now()) throw errors.notFound("SSH 连接核验");
    return probe.status;
  }

  list(context: CapabilityContext): Status[] {
    const owner = externalSshOwner(context);
    const now = Date.now();
    return [...this.probes.values()].filter((probe) => probe.owner === owner && probe.expires > now).map(({ status }) => status);
  }

  decide(context: CapabilityContext, input: z.infer<typeof DecidePublicProbe>) {
    const status = this.read(context, input);
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
}
