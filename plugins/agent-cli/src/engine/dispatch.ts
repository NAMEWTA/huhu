import { createHash } from "node:crypto";
import { HuhuError, errors, type ExecutionBinding } from "@huhu/contracts";
import { AGENT_CATALOG, type AgentId } from "../shared/catalog.js";
import { ProviderAcceptance, type AgentDispatchStore, type DispatchInput, type DispatchLookup, type LaunchOptions, type StoredDispatch } from "./dispatch-store.js";
import type { InputOwnership } from "./input-ownership.js";
import { launchHash } from "./launch-binding.js";
import type { SessionsService } from "./sessions.js";
import type { SpaceStore } from "./spaces.js";
import type { z } from "zod";

/** A trusted Engine adapter must obtain readiness and acceptance from the bound provider protocol. */
export interface DispatchProvider {
  readonly id: string;
  readonly modes: readonly ("new" | "existing")[];
  ready(binding: ExecutionBinding["sessionBinding"], signal: AbortSignal): Promise<boolean>;
  acceptance(execution: ExecutionBinding, inputSha256: string, signal: AbortSignal): Promise<ProviderAcceptance | null>;
}

type Status = "accepted" | "busy" | "unsupported" | "unknown" | "not_sent";
const dispatchKey = ({ vaultId, machineId, taskId, runId, attempt, dispatchId }: DispatchLookup): DispatchLookup => ({ vaultId, machineId, taskId, runId, attempt, dispatchId });
const receipt = (record: StoredDispatch | null, status: Status, reason: string | null = null) => ({
  status,
  reason,
  acceptedAt: record?.acceptedAt ?? null,
  execution: record?.execution ?? null,
  ownerActive: record?.ownerActive ?? false,
  coreWrite: record?.write === "sending" ? ("unknown" as const) : (record?.write ?? "not_sent"),
  providerAcceptance: record?.providerAcceptance ?? null,
});
type DispatchResponse = ReturnType<typeof receipt>;

export class AgentDispatch {
  private readonly inflight = new Map<string, { fingerprint: string; result: Promise<DispatchResponse> }>();

  constructor(
    private readonly d: {
      vaultId: string;
      readOnly: boolean;
      spaces: SpaceStore;
      sessions: SessionsService;
      ownership: InputOwnership;
      store: AgentDispatchStore;
      providers: Partial<Record<AgentId, DispatchProvider>>;
      signal: AbortSignal;
    },
  ) {}

  async targets(input: { vaultId: string; machineId: string; spaceId: string; options?: z.infer<typeof LaunchOptions> | undefined }) {
    this.assertScope(input);
    const space = this.d.spaces.get(input.spaceId);
    const unavailable = this.d.readOnly ? "read_only_vault" : null;
    const newTargets = await Promise.all(
      AGENT_CATALOG.map(async ({ id: provider }) => {
        const adapter = this.d.providers[provider];
        let reason = unavailable ?? (adapter?.modes.includes("new") ? null : "provider_acceptance_unavailable");
        let configurationId: string | null = null;
        if (!reason) {
          try {
            configurationId = await this.d.sessions.freezeLaunch({ ...input.options, spaceId: space.id, spaceRevision: space.revision, provider });
          } catch (error) {
            reason = error instanceof HuhuError ? error.code : "configuration_unavailable";
          }
        }
        return { mode: "new" as const, provider, spaceId: space.id, spaceRevision: space.revision, configurationId, binding: null, available: reason === null, reason };
      }),
    );
    const existing = await Promise.all(
      this.d.sessions
        .list(space.id)
        .filter(({ provider }) => provider !== "shell")
        .map(async (session) => {
          const provider = session.provider as AgentId;
          const adapter = this.d.providers[provider];
          let reason = unavailable ?? (adapter?.modes.includes("existing") ? null : "provider_generation_unavailable");
          const current = reason ? null : await this.d.sessions.executionSession(session.id);
          if (!reason && (!current || current.finished)) reason = "binding_unverified";
          if (!reason && !this.d.ownership.availableForTask(session.id)) reason = "input_owned";
          return { mode: "existing" as const, provider, spaceId: space.id, spaceRevision: space.revision, configurationId: null, sessionId: session.id, binding: current?.binding ?? null, available: reason === null, reason };
        }),
    );
    const resume = AGENT_CATALOG.map(({ id: provider }) => ({
      mode: "resume" as const,
      provider,
      spaceId: space.id,
      spaceRevision: space.revision,
      configurationId: null,
      binding: null,
      available: false,
      reason: "native_resume_evidence_unavailable",
    }));
    return [...newTargets, ...existing, ...resume].map((target) => ({ ...target, structuredReply: false, structuredResult: false, cancel: false }));
  }

  async dispatch(input: DispatchInput, requestSignal: AbortSignal): Promise<DispatchResponse> {
    this.assertScope(input);
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    const fingerprint = launchHash(input);
    const prior = this.lookup(input);
    if (prior && prior.fingerprint !== fingerprint) throw errors.idempotencyMismatch();
    const running = this.inflight.get(input.dispatchId);
    if (running) {
      if (running.fingerprint !== fingerprint) throw errors.idempotencyMismatch();
      return running.result;
    }
    const result = this.advance(input, fingerprint, prior, signal).finally(() => this.inflight.delete(input.dispatchId));
    this.inflight.set(input.dispatchId, { fingerprint, result });
    return result;
  }

  async inspect(input: DispatchLookup, requestSignal: AbortSignal): Promise<DispatchResponse> {
    this.assertScope(input);
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    const prior = this.lookup(input);
    if (!prior) return receipt(null, "unknown", "receipt_not_found");
    if (this.inflight.has(input.dispatchId)) return receipt(prior, "unknown", "dispatch_in_progress");
    // Use the same fence as dispatch so an older inspection cannot overwrite an in-flight write.
    const result = this.observe(prior, signal).finally(() => this.inflight.delete(input.dispatchId));
    this.inflight.set(input.dispatchId, { fingerprint: prior.fingerprint, result });
    return result;
  }

  private assertScope(input: { vaultId: string; machineId: string }): void {
    if (input.vaultId !== this.d.vaultId || input.machineId !== this.d.spaces.machineId) throw errors.permissionDenied("派遣目标的 Vault 或机器");
  }

  private lookup(input: DispatchLookup): StoredDispatch | null {
    const record = this.d.store.read(input.dispatchId);
    if (!record) return null;
    if (launchHash(record.key) !== launchHash(dispatchKey(input))) throw errors.idempotencyMismatch();
    return record;
  }

  private assertCurrent(record: StoredDispatch): void {
    if (launchHash(this.lookup(record.key)) !== launchHash(record)) {
      throw this.unknown(record, "dispatch_receipt_changed");
    }
  }

  private unknown(record: StoredDispatch, reason: string): HuhuError {
    return new HuhuError("RUN_UNKNOWN", "派遣的输入状态待核实，请用原派遣标识重查", { retryable: true, details: { dispatchId: record.key.dispatchId, reason } });
  }

  private async advance(input: DispatchInput, fingerprint: string, prior: StoredDispatch | null, signal: AbortSignal): Promise<DispatchResponse> {
    if (prior && prior.write !== "not_sent") return this.observe(prior, signal);
    if (this.d.readOnly) return receipt(prior, "unsupported", "read_only_vault");
    const { target } = input;
    if (target.mode === "resume") return receipt(prior, "unsupported", "native_resume_evidence_unavailable");
    const provider = (target.mode === "new" ? target.provider : target.binding.provider) as AgentId;
    const adapter = Object.hasOwn(this.d.providers, provider) ? this.d.providers[provider] : undefined;
    if (!adapter?.modes.includes(target.mode)) return receipt(prior, "unsupported", "provider_acceptance_unavailable");
    if (prior && prior.adapterId !== adapter.id) return receipt(prior, "unknown", "provider_adapter_changed");

    const record: StoredDispatch = prior ?? {
      schema: 1,
      key: dispatchKey(input),
      fingerprint,
      inputSha256: createHash("sha256").update(input.input).digest("hex"),
      adapterId: adapter.id,
      acceptedAt: new Date().toISOString(),
      execution: null,
      ownerActive: false,
      write: "not_sent",
      providerAcceptance: null,
    };
    if (!prior) this.d.store.save(record);
    const id = record.execution?.sessionBinding.sessionId ?? (target.mode === "existing" ? target.binding.sessionId : await this.launchNew(target, record, signal));
    signal.throwIfAborted();
    if (!id) return receipt(record, "not_sent", "launch_unverified");
    const current = await this.d.sessions.executionSession(id);
    signal.throwIfAborted();
    if (!current || current.spaceId !== target.spaceId || current.binding.provider !== provider) return receipt(record, "not_sent", "binding_unverified");
    const expectation = record.execution?.sessionBinding ?? (target.mode === "existing" ? target.binding : null);
    if (expectation && launchHash(expectation) !== launchHash(current.binding)) {
      throw new HuhuError("VERSION_CONFLICT", "Agent 进程绑定已变化", { details: { reason: "binding_changed" } });
    }
    if (current.finished) return this.observe(record, signal);

    if (!this.d.ownership.availableForTask(id, input.dispatchId)) return receipt(record, "busy", "input_owned");
    const ready = await adapter.ready(current.binding, signal).catch(() => false);
    signal.throwIfAborted();
    if (!ready) return receipt(record, "not_sent", "provider_not_ready");
    const { machineId: _machineId, ...key } = record.key;
    const execution = { ...key, sessionBinding: current.binding };
    const sending: StoredDispatch = { ...record, execution, ownerActive: true, write: "sending" };
    const write = await this.d.sessions.writeExecutionInput(execution, input.input, signal, () => {
      this.assertCurrent(record);
      if (!this.d.ownership.availableForTask(id, input.dispatchId)) return false;
      this.d.store.save(sending);
      return true;
    });
    if (write === "busy" || write === "not_sent") {
      signal.throwIfAborted();
      return write === "busy" ? receipt(record, "busy", "input_owned") : receipt(record, "not_sent", "binding_unverified");
    }
    // A new scope can reconcile the original sending intent. The disposed scope cannot update it.
    if (this.d.signal.aborted) throw this.unknown(sending, "dispatch_scope_ended_after_send");
    this.assertCurrent(sending);
    const updated: StoredDispatch = { ...sending, write };
    this.d.store.save(updated);
    return this.observe(updated, signal);
  }

  private async launchNew(target: Extract<DispatchInput["target"], { mode: "new" }>, record: StoredDispatch, signal: AbortSignal): Promise<string | null> {
    const { mode: _mode, configurationId, ...launch } = target;
    try {
      return (await this.d.sessions.launch({ ...launch, expectedConfigurationId: configurationId, requestId: "dispatch-" + launchHash(record.key) }, signal)).id;
    } catch (error) {
      if (error instanceof HuhuError && (error.code === "RUN_UNKNOWN" || error.code === "HERDR_UNAVAILABLE")) return null;
      throw error;
    }
  }

  private async observe(record: StoredDispatch, signal: AbortSignal): Promise<DispatchResponse> {
    signal.throwIfAborted();
    if (!record.execution) return receipt(record, "not_sent");
    const sessionId = record.execution.sessionBinding.sessionId;
    let current = await this.d.sessions.executionSession(sessionId);
    signal.throwIfAborted();
    if (!current && !this.d.readOnly) {
      await this.d.sessions.reconcile();
      signal.throwIfAborted();
      current = await this.d.sessions.executionSession(sessionId);
      signal.throwIfAborted();
    }
    if (!current || launchHash(current.binding) !== launchHash(record.execution.sessionBinding)) return receipt(record, "unknown", "binding_changed");
    let next = record.write === "sending" ? { ...record, write: "unknown" as const } : record;
    const adapter = this.d.providers[current.binding.provider as AgentId];
    if (!next.providerAcceptance && next.write !== "not_sent" && adapter?.id === next.adapterId) {
      const proof = ProviderAcceptance.safeParse(await adapter.acceptance(record.execution, record.inputSha256, signal).catch(() => null));
      signal.throwIfAborted();
      if (proof.success && proof.data.inputSha256 === record.inputSha256 && launchHash(proof.data.execution) === launchHash(record.execution)) {
        next = { ...next, providerAcceptance: proof.data };
      }
    }
    if (current.finished && next.ownerActive) next = { ...next, ownerActive: false };
    if (next !== record && !this.d.readOnly) {
      this.assertCurrent(record);
      this.d.store.save(next);
    }
    if (next.providerAcceptance) return receipt(next, "accepted");
    if (next.write === "core_written") return receipt(next, "unknown", "provider_acceptance_unconfirmed");
    if (next.write === "unknown") return receipt(next, "unknown", "core_write_unconfirmed");
    return receipt(next, "not_sent");
  }
}
