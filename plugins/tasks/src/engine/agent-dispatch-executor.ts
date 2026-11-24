import { createHash } from "node:crypto";
import type { TaskExecution } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { AgentDispatchInputSchema, AgentDispatchResponseSchema, AgentDispatchTargetInfoSchema, AgentDispatchTargetSchema, AgentNativeStopStatusSchema } from "@huhu/plugin-agent-cli/engine";
import { z } from "zod";
import type { TaskDispatchExecutor, TaskDispatchReadiness, TaskDispatchResult, TaskDispatchWork } from "./dispatch.js";
import { fingerprint } from "./dispatch-store.js";
import { AgentReplyResult } from "./native-replies.js";

const Targets = z.array(AgentDispatchTargetInfoSchema);
const InputText = AgentDispatchInputSchema.shape.input;
const Unsupported = new Set(["provider_acceptance_unavailable", "provider_generation_unavailable", "native_resume_evidence_unavailable"]);
const Busy = new Set(["input_owned", "binding_unverified", "history_writer_busy"]);
const StopResult = z.strictObject({ status: AgentNativeStopStatusSchema });

function executionText(body: string, instructions?: string): string {
  const text = instructions ? `${body}\n\n${instructions}` : body;
  // The terminal contract permits LF. The saved Markdown and snapshot hash retain their original bytes.
  return text.replace(/\r\n/g, "\n");
}

function textOf({ snapshot }: TaskDispatchWork): string {
  return executionText(snapshot.body, snapshot.source.kind === "automation" ? snapshot.source.instructions : undefined);
}

function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

export function createAgentDispatchExecutor(api: Pick<HuhuApi, "call"> & { vault: Pick<HuhuApi["vault"], "vaultId"> }, machineId: string): TaskDispatchExecutor {
  const scope = { vaultId: api.vault.vaultId, machineId };
  const keyOf = ({ snapshot, dispatchId, runId, attempt }: TaskDispatchWork) => ({ ...scope, taskId: snapshot.taskId, dispatchId, runId, attempt });
  const dispatchInput = (work: TaskDispatchWork) =>
    AgentDispatchInputSchema.safeParse({
      ...keyOf(work),
      eventIds: [work.eventId],
      inputSnapshotRef: work.eventId,
      inputSnapshotHash: work.snapshotHash,
      input: textOf(work),
      target: work.agentTarget,
    });

  const outcome = (receipt: z.infer<typeof AgentDispatchResponseSchema>, work: TaskDispatchWork): Exclude<TaskDispatchResult, "unsupported"> => {
    if (receipt.status === "not_sent" && definitelyUnsent(receipt)) return "not_sent";
    const { execution, providerAcceptance } = receipt;
    if (receipt.status !== "accepted" || !execution || !providerAcceptance || !work.agentTarget) return "unknown";
    const confirmed = receipt.nativeWrite === undefined ? receipt.coreWrite !== "not_sent" : receipt.nativeWrite === "provider_accepted" && providerAcceptance.nativeTurnId && execution.sessionBinding.nativeSessionId;
    if (!confirmed) return "unknown";
    const { sessionBinding, ...identity } = execution;
    const { machineId, ...expectedIdentity } = keyOf(work);
    if (sessionBinding.machineId !== machineId || fingerprint(identity) !== fingerprint(expectedIdentity)) return "unknown";
    const target = work.agentTarget;
    if (target.mode === "existing" ? fingerprint(sessionBinding) !== fingerprint(target.binding) : sessionBinding.provider !== target.provider) return "unknown";
    if (target.mode === "resume" && sessionBinding.nativeSessionId !== target.nativeSessionId) return "unknown";
    const sha256 = createHash("sha256").update(textOf(work)).digest("hex");
    return providerAcceptance.inputSha256 === sha256 && fingerprint(providerAcceptance.execution) === fingerprint(execution) ? { state: "accepted", execution } : "unknown";
  };

  async function historyReadiness(execution: TaskExecution, text: string, frozen: TaskDispatchWork["agentTarget"], signal: AbortSignal) {
    const { spaceId, provider, model, effort, fast, target: preference } = execution;
    if (preference?.mode !== "resume" || provider !== "codex" || !preference.history || model || effort || fast) {
      return { state: "unsupported" as const, reason: "native_resume_evidence_unavailable" };
    }
    const history = preference.history;
    if (!spaceId || history.machineId !== machineId || history.spaceId !== spaceId || !InputText.safeParse(text).success) {
      return { state: "unavailable" as const, reason: "history_selection_changed" };
    }
    if (frozen?.mode === "resume") {
      if (
        frozen.spaceId !== spaceId ||
        frozen.provider !== provider ||
        frozen.nativeSessionId !== preference.nativeSessionId ||
        frozen.spaceRevision !== preference.history.spaceRevision ||
        fingerprint(frozen.history) !== fingerprint(preference.history) ||
        !frozen.configurationId
      ) {
        return { state: "unavailable" as const, reason: "history_selection_changed" };
      }
      // Restore may change the rollout revision. Only the original dispatch may replay its binding.
      return { state: "ready" as const, target: frozen };
    }
    let listing: z.infer<typeof Targets>;
    try {
      listing = Targets.parse(await api.call("agent.targets.list", { ...scope, spaceId }, { signal }));
    } catch (error) {
      signal.throwIfAborted();
      const code = errorCode(error);
      if (code === "PLUGIN_DISABLED" || code === "ENGINE_CLOSING" || code === "HERDR_UNAVAILABLE") return { state: "busy" as const, reason: code };
      if (code === "NOT_FOUND" || code === "INVALID_INPUT" || code === "PERMISSION_DENIED") return { state: "unavailable" as const, reason: code };
      throw error;
    }
    signal.throwIfAborted();
    const matches = listing.filter(
      (row) =>
        row.mode === "resume" && row.spaceId === spaceId && row.provider === provider && row.nativeSessionId === preference.nativeSessionId && row.spaceRevision === history.spaceRevision && fingerprint(row.history) === fingerprint(history),
    );
    const row = matches.length === 1 ? matches[0] : undefined;
    if (!row) return { state: "unavailable" as const, reason: "history_selection_changed" };
    const selected = AgentDispatchTargetSchema.safeParse({ mode: "resume", spaceId, provider, nativeSessionId: row.nativeSessionId, history: row.history, spaceRevision: row.spaceRevision, configurationId: row.configurationId });
    if (row.available && selected.success) return { state: "ready" as const, target: selected.data };
    const reason = row.reason ?? "history_selection_changed";
    if (Unsupported.has(reason)) return { state: "unsupported" as const, reason };
    if (Busy.has(reason)) return { state: "busy" as const, reason, ...(selected.success && { target: selected.data }) };
    return { state: "unavailable" as const, reason };
  }

  return {
    async ready(work, signal): Promise<TaskDispatchReadiness> {
      const { execution } = work.snapshot;
      const preference = execution.target ?? { mode: "new" };
      const { spaceId, provider, model, effort, fast, profile } = execution;
      const text = textOf(work);
      if (preference.mode === "resume") {
        const result = await historyReadiness(execution, text, work.agentTarget, signal);
        return result.target && (result.state === "ready" || result.state === "busy") ? { state: result.state, target: result.target } : result.state;
      }
      if (!spaceId || !InputText.safeParse(text).success) return "unavailable";
      const options = preference.mode === "new" ? { ...(model != null && { model }), ...(effort != null && { effort }), fast, ...(profile && { profile }) } : undefined;
      let listing: z.infer<typeof Targets>;
      try {
        listing = Targets.parse(await api.call("agent.targets.list", { ...scope, spaceId, ...(options && { options }) }, { signal }));
      } catch (error) {
        signal.throwIfAborted();
        const code = errorCode(error);
        if (code === "PLUGIN_DISABLED" || code === "ENGINE_CLOSING" || code === "HERDR_UNAVAILABLE") return "busy";
        if (code === "NOT_FOUND" || code === "INVALID_INPUT" || code === "PERMISSION_DENIED") return work.agentTarget ? "busy" : "unavailable";
        throw error;
      }
      signal.throwIfAborted();
      const matches = listing.filter((item) => {
        if (item.mode !== preference.mode || item.spaceId !== spaceId) return false;
        if (preference.mode === "existing") return item.sessionId === preference.sessionId;
        return item.provider === provider;
      });
      const target = matches.length === 1 ? matches[0] : undefined;
      if (!target) return work.agentTarget ? "busy" : "unavailable";
      if (target.reason === "session_ended") return "unavailable";
      if (target.reason && Unsupported.has(target.reason)) return work.agentTarget ? "busy" : "unsupported";
      const selected = AgentDispatchTargetSchema.safeParse(
        preference.mode === "existing"
          ? { mode: "existing", spaceId, spaceRevision: target.spaceRevision, binding: target.binding }
          : { mode: "new", spaceId, provider, spaceRevision: target.spaceRevision, configurationId: target.configurationId, ...options },
      );
      if (!selected.success) return work.agentTarget || target.reason === "binding_unverified" ? "busy" : "unavailable";
      if (work.agentTarget && fingerprint(work.agentTarget) !== fingerprint(selected.data)) return "busy";
      if (target.available) return { state: "ready", target: selected.data };
      if (target.reason === "input_owned" || target.reason === "binding_unverified") return { state: "busy", target: selected.data };
      return work.agentTarget ? "busy" : "unavailable";
    },

    resumeEligibility(execution, body, instructions, signal) {
      return historyReadiness(execution, executionText(body, instructions), undefined, signal);
    },

    async prepareResume(work, signal) {
      const input = dispatchInput(work);
      if (!input.success) return "unsupported";
      try {
        const { input: body, ...intent } = input.data;
        const inputSha256 = createHash("sha256").update(body).digest("hex");
        const receipt = AgentDispatchResponseSchema.parse(await api.call("agent.runs.dispatch", { ...intent, inputSha256 }, { idempotencyKey: work.dispatchId, signal }));
        signal.throwIfAborted();
        if (receipt.status === "unsupported" && (receipt.reason === "history_selection_changed" || receipt.reason === "AGENT_DISABLED")) return "unavailable";
        if (receipt.status === "unsupported") return "unsupported";
        return receipt.status === "not_sent" && receipt.reason === "resume_ready" && definitelyUnsent(receipt) ? "ready" : "busy";
      } catch (error) {
        signal.throwIfAborted();
        return errorCode(error) === "IDEMPOTENCY_MISMATCH" ? "unavailable" : "busy";
      }
    },

    async dispatch(work, signal) {
      const input = dispatchInput(work);
      if (!input.success) return "unsupported";
      try {
        const value = await api.call("agent.runs.dispatch", input.data, { idempotencyKey: work.dispatchId, signal });
        signal.throwIfAborted();
        const receipt = AgentDispatchResponseSchema.parse(value);
        if (definitelyUnsent(receipt)) {
          if (receipt.status === "unsupported") return "unsupported";
          if (receipt.status === "busy") return "not_sent";
        }
        return outcome(receipt, work);
      } catch (error) {
        signal.throwIfAborted();
        const code = errorCode(error);
        // The Agent checks space and binding before recording a write intent.
        if (code === "SPACE_INVALID" || code === "VERSION_CONFLICT") return "not_sent";
        return "unknown";
      }
    },

    async inspect(work, signal) {
      const value = await api.call("agent.runs.inspect", keyOf(work), { signal });
      signal.throwIfAborted();
      return outcome(AgentDispatchResponseSchema.parse(value), work);
    },

    async answer(input, signal) {
      return AgentReplyResult.parse(await api.call("agent.runs.answer", input, { idempotencyKey: input.replyId, signal }));
    },

    async inspectAnswer(input, signal) {
      return AgentReplyResult.parse(await api.call("agent.runs.answer.inspect", input, { signal }));
    },

    async stop(input, signal) {
      return StopResult.parse(await api.call("agent.runs.stop", input, { idempotencyKey: input.stopId, signal })).status;
    },

    async inspectStop(input, signal) {
      return StopResult.parse(await api.call("agent.runs.stop.inspect", input, { signal })).status;
    },
  };
}

function definitelyUnsent(receipt: z.infer<typeof AgentDispatchResponseSchema>): boolean {
  return receipt.coreWrite === "not_sent" && (receipt.nativeWrite === undefined || receipt.nativeWrite === "not_sent") && !receipt.providerAcceptance;
}
