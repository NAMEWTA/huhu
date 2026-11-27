import { createHash } from "node:crypto";
import { HuhuError, errors, type ExecutionBinding } from "@huhu/contracts";
import { AGENT_CATALOG, type AgentId } from "../shared/catalog.js";
import { spaceCanLaunch } from "../shared/space.js";
import type { AgentDetector } from "./detect.js";
import { ProviderAcceptance, type AgentDispatchStore, type DispatchInput, type DispatchLookup, type LaunchOptions, type ResumePrepareInput, type StoredDispatch } from "./dispatch-store.js";
import type { InputOwnership } from "./input-ownership.js";
import { launchHash } from "./launch-binding.js";
import type { NativeAnswer, NativeAnswerStatus } from "./native-answer.js";
import type { NativeStop, NativeStopStatus } from "./native-stop.js";
import type { SessionsService } from "./sessions.js";
import type { SpaceStore } from "./spaces.js";
import type { Space } from "../shared/space.js";
import type { z } from "zod";
import type { AgentDispatchTargetInfoSchema } from "./dispatch-capabilities.js";

/** A trusted Engine adapter must obtain readiness and acceptance from the bound provider protocol. */
type ProviderIdentity = {
  readonly id: string;
  readonly modes: readonly ("new" | "existing" | "resume")[];
};
export type DispatchProvider = ProviderIdentity &
  (
    | { transport?: "pty"; ready(binding: ExecutionBinding["sessionBinding"], signal: AbortSignal): Promise<boolean>; acceptance(execution: ExecutionBinding, inputSha256: string, signal: AbortSignal): Promise<ProviderAcceptance | null> }
    | { transport: "native" }
  );

type Status = "accepted" | "busy" | "unsupported" | "unknown" | "not_sent";
const dispatchKey = ({ vaultId, machineId, taskId, runId, attempt, dispatchId }: DispatchLookup): DispatchLookup => ({ vaultId, machineId, taskId, runId, attempt, dispatchId });
const receipt = (record: StoredDispatch | null, status: Status, reason: string | null = null) => ({
  status,
  reason,
  acceptedAt: record?.acceptedAt ?? null,
  execution: record?.execution ?? null,
  ownerActive: record?.ownerActive ?? false,
  coreWrite: record?.transport === "native" ? ("not_sent" as const) : record?.write === "sending" ? ("unknown" as const) : (record?.write ?? "not_sent"),
  ...(record?.transport === "native" && {
    nativeWrite: record.providerAcceptance ? ("provider_accepted" as const) : record.write === "not_sent" ? ("not_sent" as const) : ("unknown" as const),
  }),
  providerAcceptance: record?.providerAcceptance ?? null,
});
type DispatchResponse = ReturnType<typeof receipt>;
export type ResumeTarget = Extract<DispatchInput["target"], { mode: "resume" }>;
type ResumeInfo = Omit<z.infer<typeof AgentDispatchTargetInfoSchema>, "profile" | "capabilities">;

export class AgentDispatch {
  private readonly inflight = new Map<string, { fingerprint: string; result: Promise<DispatchResponse> }>();

  constructor(
    private readonly d: {
      vaultId: string;
      readOnly: boolean;
      spaces: SpaceStore;
      sessions: SessionsService;
      detector: AgentDetector;
      ownership: InputOwnership;
      store: AgentDispatchStore;
      providers: Partial<Record<AgentId, DispatchProvider>>;
      resumeTargets?(space: Space, snapshot: boolean): Promise<ResumeInfo[]>;
      launchResume?(target: ResumeTarget, requestId: string, dispatchId: string, prepare: boolean, signal: AbortSignal): Promise<string | null>;
      resumeAbandoned?(dispatchId: string): boolean;
      taskMcpAvailable?(): boolean;
      signal: AbortSignal;
    },
  ) {}

  async targets(
    input: { vaultId: string; machineId: string; spaceId: string; options?: z.infer<typeof LaunchOptions> | undefined; mode?: "snapshot" | undefined; includeResume?: false | undefined; taskMcp?: boolean | undefined },
    requestSignal: AbortSignal,
  ) {
    this.assertScope(input);
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    const space = this.d.spaces.get(input.spaceId);
    const unavailable = this.d.readOnly ? "read_only_vault" : null;
    const snapshot = input.mode === "snapshot";
    const profile = input.options?.profile ?? "read-only";
    const write = profile === "workspace-write";
    const newTargets = await Promise.all(
      AGENT_CATALOG.map(async ({ id: provider }) => {
        const adapter = this.d.providers[provider];
        let reason = unavailable ?? (adapter?.modes.includes("new") ? null : "provider_acceptance_unavailable");
        if (write) {
          if (provider !== "codex" || adapter?.transport !== "native" || process.platform !== "linux" || process.arch !== "x64") reason ??= "workspace_write_profile_unsupported";
          else if (!this.d.spaces.dispatchWriteApproval(space)) reason ??= "workspace_write_approval_required";
        }
        let configurationId: string | null = null;
        if (!reason && snapshot) {
          if (write) reason = "binding_unverified";
          else if (!spaceCanLaunch(space)) reason = "SPACE_INVALID";
          else if (!this.d.detector.locate(provider)) reason = "configuration_unavailable";
        } else if (!reason) {
          try {
            configurationId = await this.d.sessions.freezeLaunch({ ...input.options, spaceId: space.id, spaceRevision: space.revision, provider, ...(adapter?.transport === "native" && { controlled: "codex" as const }) });
          } catch (error) {
            reason = error instanceof HuhuError ? (error.code === "HEADLESS_UNSUPPORTED" ? "provider_acceptance_unavailable" : String(error.details?.["reason"] ?? error.code)) : "configuration_unavailable";
          }
        }
        return { mode: "new" as const, provider, spaceId: space.id, spaceRevision: space.revision, configurationId, binding: null, available: reason === null, reason };
      }),
    );
    signal.throwIfAborted();
    const existing = await Promise.all(
      this.d.sessions
        .list(space.id)
        .filter(({ provider }) => provider !== "shell")
        .map(async (session) => {
          const provider = session.provider as AgentId;
          const adapter = this.d.providers[provider];
          let reason = unavailable ?? (write || session.writableDispatch ? "profile_requires_new_thread" : session.state === "exited" ? "session_ended" : adapter?.modes.includes("existing") ? null : "provider_generation_unavailable");
          if (!reason && snapshot) reason = "binding_unverified";
          const current = reason ? null : await this.d.sessions.executionSession(session.id);
          if (!reason && current?.finished) reason = "session_ended";
          if (!reason && !current) reason = "binding_unverified";
          if (!reason && adapter?.transport === "native" && (!current?.nativeExisting || this.abandonedResume(session.id))) reason = "provider_generation_unavailable";
          if (!reason && !this.d.ownership.availableForTask(session.id)) reason = "input_owned";
          return { mode: "existing" as const, provider, spaceId: space.id, spaceRevision: space.revision, configurationId: null, sessionId: session.id, binding: current?.binding ?? null, available: reason === null, reason };
        }),
    );
    signal.throwIfAborted();
    const codex = this.d.providers.codex;
    const history = input.includeResume !== false && !write && codex?.transport === "native" && codex.modes.includes("resume") && this.d.resumeTargets ? await this.d.resumeTargets(space, snapshot) : [];
    signal.throwIfAborted();
    const resume = AGENT_CATALOG.filter(({ id }) => input.includeResume !== false && !history.some((item) => item.provider === id)).map(({ id: provider }) => ({
      mode: "resume" as const,
      provider,
      spaceId: space.id,
      spaceRevision: space.revision,
      configurationId: null,
      binding: null,
      available: false,
      reason: write ? "profile_requires_new_thread" : "native_resume_evidence_unavailable",
    }));
    const unsupported = (reason: string) => ({ state: "unsupported" as const, reason });
    const runtime = (reason: string) => ({ state: "runtime_check" as const, reason });
    const conditional = (reason: string) => ({ state: "conditional" as const, reason });
    const available = { state: "available" as const };
    const interactiveProviders = new Set(spaceCanLaunch(space) ? AGENT_CATALOG.filter(({ id }) => this.d.detector.locate(id)).map(({ id }) => id) : []);
    return [...newTargets, ...existing, ...history, ...resume].map((target) => {
      const provider = target.provider as AgentId;
      const adapter = this.d.providers[provider];
      const native = adapter?.transport === "native";
      const reason = unavailable ?? target.reason;
      const dispatch = reason === "binding_unverified" ? runtime(reason) : reason ? (adapter ? conditional(reason) : unsupported(reason)) : target.configurationId || target.binding ? available : runtime("binding_unverified");
      const feature = native && !reason ? runtime("verify_native_thread_and_turn") : unsupported(reason ?? "provider_evidence_unavailable");
      const writeFeature =
        write && native && target.mode === "new" ? (reason === "workspace_write_approval_required" ? conditional(reason) : reason ? dispatch : runtime("verify_effective_workspace_sandbox")) : unsupported(reason ?? "read_only_profile");
      const interactive = interactiveProviders.has(provider) ? available : conditional("interactive_installation_or_space_unavailable");
      return {
        ...target,
        available: !unavailable && target.available,
        reason,
        profile,
        capabilities: {
          interactive,
          dispatch,
          liveSession: target.mode === "existing" ? dispatch : runtime("requires_live_binding"),
          coldResume: target.mode === "resume" ? dispatch : runtime("requires_qualified_persistent_history"),
          structuredReply: feature,
          structuredResult: feature,
          stop: feature,
          workspaceRead: feature,
          workspaceWrite: writeFeature,
          command: writeFeature,
          mcp: !input.taskMcp
            ? unsupported("no_task_tool_scope")
            : provider !== "codex" || !native || target.mode !== "new"
              ? unsupported("task_mcp_requires_new_controlled_codex")
              : reason
                ? unsupported(reason)
                : this.d.taskMcpAvailable?.()
                  ? available
                  : unsupported("task_mcp_service_unavailable"),
        },
      };
    });
  }

  async dispatch(input: DispatchInput, requestSignal: AbortSignal): Promise<DispatchResponse> {
    return this.run(input, requestSignal);
  }

  async prepareResume(input: ResumePrepareInput, requestSignal: AbortSignal): Promise<DispatchResponse> {
    if (input.target.mode !== "resume") throw errors.invalidInput("请选择原生历史目标");
    return this.run(input, requestSignal);
  }

  private async run(input: DispatchInput | ResumePrepareInput, requestSignal: AbortSignal): Promise<DispatchResponse> {
    this.assertScope(input);
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    const text = "input" in input ? input.input : undefined;
    const inputSha256 = "inputSha256" in input ? input.inputSha256 : createHash("sha256").update(input.input).digest("hex");
    const fingerprint = input.target.mode === "resume" ? launchHash({ ...input, input: undefined, inputSha256 }) : launchHash(input);
    const prior = this.lookup(input);
    if (prior && prior.fingerprint !== fingerprint) throw errors.idempotencyMismatch();
    const running = this.inflight.get(input.dispatchId);
    if (running) {
      if (running.fingerprint !== fingerprint) throw errors.idempotencyMismatch();
      return running.result;
    }
    const result = this.advance(input, fingerprint, prior, signal, inputSha256, text).finally(() => this.inflight.delete(input.dispatchId));
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

  async answer(input: NativeAnswer, send: boolean, requestSignal: AbortSignal): Promise<NativeAnswerStatus> {
    const { execution } = input;
    const { provider, sessionId, machineId, nativeSessionId } = execution.sessionBinding;
    this.assertScope({ vaultId: execution.vaultId, machineId });
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    if ((send && this.d.readOnly) || this.d.providers[provider as AgentId]?.transport !== "native" || !nativeSessionId) return "unsupported";
    const record = this.lookup({ ...execution, machineId });
    if (!record?.execution || record.transport !== "native" || record.write === "not_sent" || launchHash(record.execution) !== launchHash(execution)) return "stale";
    return this.d.sessions.answerNative(input, send, signal, () => this.d.ownership.hasTask(sessionId, execution.dispatchId) && this.d.ownership.availableForTask(sessionId, execution.dispatchId));
  }

  async stop(input: NativeStop, send: boolean, requestSignal: AbortSignal): Promise<NativeStopStatus> {
    const { execution } = input;
    const { provider, sessionId, machineId, nativeSessionId } = execution.sessionBinding;
    this.assertScope({ vaultId: execution.vaultId, machineId });
    const signal = AbortSignal.any([this.d.signal, requestSignal]);
    signal.throwIfAborted();
    const adapter = this.d.providers[provider as AgentId];
    if ((send && this.d.readOnly) || provider !== "codex" || adapter?.transport !== "native" || !nativeSessionId) return "unsupported";
    const record = this.d.store.read(execution.dispatchId);
    if (!record?.execution || record.transport !== "native" || record.write === "not_sent" || launchHash(record.execution) !== launchHash(execution)) return "stale";
    if (record.adapterId !== adapter.id) return "unsupported";
    const ownsInput = () => this.d.ownership.hasTask(sessionId, execution.dispatchId) && this.d.ownership.availableForTask(sessionId, execution.dispatchId);
    const status = await this.d.sessions.stopNative(input, send, signal, {
      inputSha256: record.inputSha256,
      intent: () => this.d.store.stopIntent(execution),
      ownsInput,
      claim: () => ownsInput() && this.d.store.claimStop(input),
    });
    if ((status === "stopped" || status === "completed") && !this.d.readOnly && !signal.aborted && !this.inflight.has(execution.dispatchId)) {
      const latest = this.d.store.read(execution.dispatchId);
      if (latest?.ownerActive && launchHash(latest.execution) === launchHash(execution)) this.observeNative(latest, execution);
    }
    return status;
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

  private abandonedResume(sessionId: string): boolean {
    if (!this.d.resumeAbandoned) return false;
    const owner = this.d.sessions.resumeOwner(sessionId);
    return !!owner && this.d.resumeAbandoned(owner);
  }

  private async advance(input: DispatchInput | ResumePrepareInput, fingerprint: string, prior: StoredDispatch | null, signal: AbortSignal, inputSha256: string, text: string | undefined): Promise<DispatchResponse> {
    if (prior && prior.write !== "not_sent") return this.observe(prior, signal);
    if (this.d.readOnly) return receipt(prior, "unsupported", "read_only_vault");
    const { target } = input;
    if (
      target.mode === "resume" &&
      (target.provider !== "codex" ||
        !target.history ||
        target.history.machineId !== input.machineId ||
        target.history.spaceId !== target.spaceId ||
        target.history.spaceRevision !== target.spaceRevision ||
        !target.configurationId ||
        !this.d.launchResume)
    )
      return receipt(prior, "unsupported", "native_resume_evidence_unavailable");
    const provider = (target.mode === "existing" ? target.binding.provider : target.provider) as AgentId;
    const adapter = Object.hasOwn(this.d.providers, provider) ? this.d.providers[provider] : undefined;
    if (!adapter?.modes.includes(target.mode) || (target.mode === "resume" && adapter.transport !== "native")) return receipt(prior, "unsupported", "provider_acceptance_unavailable");
    if (target.mode === "new" && target.profile === "workspace-write" && adapter.transport !== "native") return receipt(prior, "unsupported", "workspace_write_profile_unsupported");
    if (input.mcpAuthorization) {
      if (provider !== "codex" || adapter.transport !== "native" || target.mode !== "new") return receipt(prior, "unsupported", "task_mcp_requires_new_controlled_codex");
      if (!this.d.taskMcpAvailable?.()) return receipt(prior, "unsupported", "task_mcp_service_unavailable");
    }
    if (input.resultMode && adapter.transport !== "native") return receipt(prior, "unsupported", "result_mode_unsupported");
    if (prior && prior.adapterId !== adapter.id) return receipt(prior, "unknown", "provider_adapter_changed");

    const record: StoredDispatch = prior ?? {
      schema: 1,
      key: dispatchKey(input),
      fingerprint,
      inputSha256,
      adapterId: adapter.id,
      ...(adapter.transport === "native" && { transport: "native" }),
      ...(input.resultMode && { resultMode: input.resultMode }),
      acceptedAt: new Date().toISOString(),
      execution: null,
      ownerActive: false,
      write: "not_sent",
      providerAcceptance: null,
    };
    if (!prior) this.d.store.save(record);
    if (target.mode === "resume" && this.d.resumeAbandoned?.(input.dispatchId)) return receipt(record, "not_sent", "resume_abandoned");
    let id = record.execution?.sessionBinding.sessionId ?? (target.mode === "existing" ? target.binding.sessionId : null);
    if (!id && target.mode === "new") {
      try {
        id = await this.launchNew(target, record, signal, input.mcpAuthorization);
      } catch (error) {
        if (error instanceof HuhuError && error.code === "HEADLESS_UNSUPPORTED") return receipt(record, "unsupported", "provider_acceptance_unavailable");
        if (error instanceof HuhuError && error.details?.["reason"] === "task_mcp_authorization_inactive") return receipt(record, "unsupported", "task_mcp_authorization_inactive");
        if (error instanceof HuhuError && error.details?.["reason"] === "workspace_write_approval_required") return receipt(record, "unsupported", "workspace_write_approval_required");
        throw error;
      }
    }
    if (!id && target.mode === "resume") {
      const retry = record.resumeWriterRetry;
      if (retry && Date.now() < retry.after) return receipt(record, "busy", "history_writer_busy");
      try {
        const launchKey = retry ? [record.key, retry.count] : record.key;
        id = await this.d.launchResume!(target, "dispatch-" + launchHash(launchKey), input.dispatchId, text === undefined, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof HuhuError)) throw error;
        if (error.code === "RUN_UNKNOWN" && error.details?.["reason"] === "history_writer_busy") {
          this.assertCurrent(record);
          const count = (retry?.count ?? 0) + 1;
          const after = Date.now() + Math.min(60_000, 1_000 * 2 ** Math.min(count, 6));
          const updated = { ...record, resumeWriterRetry: { count, after } };
          this.d.store.save(updated);
          return receipt(updated, "busy", "history_writer_busy");
        }
        if (error.code === "RUN_UNKNOWN" && error.details?.["reason"] === "input_owned") return receipt(record, "busy", "input_owned");
        if (error.code === "AGENT_DISABLED") return receipt(record, "unsupported", error.code);
        if (error.code === "HEADLESS_UNSUPPORTED") return receipt(record, "unsupported", "native_resume_evidence_unavailable");
        if (error.code === "VERSION_CONFLICT" || error.code === "NOT_FOUND" || error.code === "SPACE_INVALID") return receipt(record, "unsupported", "history_selection_changed");
        if (error.code === "RUN_UNKNOWN" || error.code === "HERDR_UNAVAILABLE") return receipt(record, "not_sent", "launch_unverified");
        throw error;
      }
    }
    signal.throwIfAborted();
    if (!id) return receipt(record, "not_sent", "launch_unverified");
    const current = await this.d.sessions.executionSession(id);
    signal.throwIfAborted();
    if (!current || current.spaceId !== target.spaceId || current.binding.provider !== provider) return receipt(record, "not_sent", "binding_unverified");
    const expectation = record.execution?.sessionBinding ?? (target.mode === "existing" ? target.binding : null);
    if (expectation && launchHash(expectation) !== launchHash(current.binding)) {
      throw new HuhuError("VERSION_CONFLICT", "Agent 进程绑定已变化", { details: { reason: "binding_changed" } });
    }
    if (target.mode === "resume" && current.binding.nativeSessionId !== target.nativeSessionId) return receipt(record, "unsupported", "history_selection_changed");
    if (current.finished) return target.mode === "resume" ? receipt(record, "unsupported", "session_ended") : this.observe(record, signal);
    if (target.mode === "existing" && adapter.transport === "native" && (!current.nativeExisting || this.abandonedResume(id))) return receipt(record, "unsupported", "provider_generation_unavailable");

    if (!this.d.ownership.availableForTask(id, input.dispatchId)) return receipt(record, "busy", "input_owned");
    const ready = adapter.transport === "native" ? current.binding.nativeSessionId !== null : await adapter.ready(current.binding, signal).catch(() => false);
    signal.throwIfAborted();
    if (!ready) return receipt(record, "not_sent", "provider_not_ready");
    if (text === undefined) return receipt(record, "not_sent", "resume_ready");
    const { machineId: _machineId, ...key } = record.key;
    const execution = { ...key, sessionBinding: current.binding };
    const sending: StoredDispatch = { ...record, execution, ownerActive: true, write: "sending" };
    const write = await this.d.sessions
      .writeExecutionInput(
        execution,
        text,
        signal,
        () => {
          this.assertCurrent(record);
          if (target.spaceRevision !== undefined) {
            const space = this.d.spaces.validateForLaunch(target.spaceId, target.spaceRevision);
            if (target.mode === "new" && target.profile === "workspace-write" && !this.d.spaces.dispatchWriteApproval(space)) return false;
          }
          if (target.mode === "resume" && (this.d.resumeAbandoned?.(input.dispatchId) || this.d.sessions.resumeOwner(id) !== input.dispatchId)) return false;
          if (!this.d.ownership.availableForTask(id, input.dispatchId)) return false;
          this.d.store.save(sending);
          return true;
        },
        sending.resultMode,
      )
      .catch((error: unknown) => {
        if (target.mode === "resume" && error instanceof HuhuError && (error.code === "AGENT_DISABLED" || error.code === "HEADLESS_UNSUPPORTED")) return error.code;
        throw error;
      });
    if (write === "AGENT_DISABLED" || write === "HEADLESS_UNSUPPORTED") return receipt(record, "unsupported", write);
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

  private async launchNew(target: Extract<DispatchInput["target"], { mode: "new" }>, record: StoredDispatch, signal: AbortSignal, authorization: DispatchInput["mcpAuthorization"]): Promise<string | null> {
    const { mode: _mode, configurationId, ...launch } = target;
    try {
      const controlled = record.transport === "native" ? { controlled: "codex" as const } : {};
      return (
        await this.d.sessions.launch({ ...launch, ...controlled, ...(authorization && { taskMcp: { key: record.key, authorization } }), expectedConfigurationId: configurationId, requestId: "dispatch-" + launchHash(record.key) }, signal)
      ).id;
    } catch (error) {
      if (error instanceof HuhuError && (error.code === "RUN_UNKNOWN" || error.code === "HERDR_UNAVAILABLE")) return null;
      throw error;
    }
  }

  private async observe(record: StoredDispatch, signal: AbortSignal): Promise<DispatchResponse> {
    signal.throwIfAborted();
    if (!record.execution) return receipt(record, "not_sent");
    if (record.transport === "native") return this.observeNative(record, record.execution);
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
    if (!next.providerAcceptance && next.write !== "not_sent" && adapter?.id === next.adapterId && adapter.transport !== "native") {
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

  private observeNative(record: StoredDispatch, execution: ExecutionBinding): DispatchResponse {
    let next = record.write === "sending" ? { ...record, write: "unknown" as const } : record;
    const evidence = this.d.sessions.nativeEvidence(execution);
    if (evidence?.proof.inputSha256 === record.inputSha256) {
      const providerAcceptance = next.providerAcceptance ?? evidence.proof;
      const ownerActive = next.ownerActive && !evidence.finished;
      if (providerAcceptance !== next.providerAcceptance || ownerActive !== next.ownerActive) next = { ...next, providerAcceptance, ownerActive };
    }
    if (next !== record && !this.d.readOnly) {
      this.assertCurrent(record);
      this.d.store.save(next);
    }
    if (next.providerAcceptance) return receipt(next, "accepted");
    return receipt(next, "unknown", "native_acceptance_unconfirmed");
  }

  reconcileNative(execution: ExecutionBinding): void {
    if (this.d.readOnly || this.d.signal.aborted || this.inflight.has(execution.dispatchId)) return;
    const record = this.lookup({ ...execution, machineId: execution.sessionBinding.machineId });
    if (!record?.ownerActive || record.transport !== "native" || launchHash(record.execution) !== launchHash(execution)) return;
    this.observeNative(record, execution);
  }
}
