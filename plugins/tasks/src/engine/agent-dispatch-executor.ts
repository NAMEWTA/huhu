import { createHash } from "node:crypto";
import type { HuhuApi } from "@huhu/kernel";
import { AgentDispatchInputSchema, AgentDispatchResponseSchema, AgentDispatchTargetInfoSchema, AgentDispatchTargetSchema } from "@huhu/plugin-agent-cli/engine";
import { z } from "zod";
import type { TaskDispatchExecutor, TaskDispatchResult, TaskDispatchWork } from "./dispatch.js";
import { fingerprint } from "./dispatch-store.js";
import { AgentReplyResult } from "./native-replies.js";

const Targets = z.array(AgentDispatchTargetInfoSchema);
const InputText = AgentDispatchInputSchema.shape.input;
const Unsupported = new Set(["provider_acceptance_unavailable", "provider_generation_unavailable", "native_resume_evidence_unavailable"]);

function textOf({ snapshot }: TaskDispatchWork): string {
  const instructions = snapshot.source.kind === "automation" ? snapshot.source.instructions : undefined;
  const text = instructions ? `${snapshot.body}\n\n${instructions}` : snapshot.body;
  // The terminal contract permits LF. The saved Markdown and snapshot hash retain their original bytes.
  return text.replace(/\r\n/g, "\n");
}

function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

export function createAgentDispatchExecutor(api: Pick<HuhuApi, "call"> & { vault: Pick<HuhuApi["vault"], "vaultId"> }, machineId: string): TaskDispatchExecutor {
  const scope = { vaultId: api.vault.vaultId, machineId };
  const keyOf = ({ snapshot, dispatchId, runId, attempt }: TaskDispatchWork) => ({ ...scope, taskId: snapshot.taskId, dispatchId, runId, attempt });

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

  return {
    async ready(work, signal) {
      const { execution } = work.snapshot;
      const preference = execution.target ?? { mode: "new" };
      const { spaceId, provider, model, effort, fast } = execution;
      if (!spaceId || !InputText.safeParse(textOf(work)).success) return "unavailable";
      const options = preference.mode === "new" ? { ...(model != null && { model }), ...(effort != null && { effort }), fast } : undefined;
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
      const target = listing.find((item) => item.mode === preference.mode && item.spaceId === spaceId && (preference.mode === "existing" ? item.sessionId === preference.sessionId : item.provider === provider));
      if (!target) return work.agentTarget ? "busy" : "unavailable";
      if (target.reason && Unsupported.has(target.reason)) return work.agentTarget ? "busy" : "unsupported";
      const selected = AgentDispatchTargetSchema.safeParse(
        preference.mode === "existing"
          ? { mode: "existing", spaceId, spaceRevision: target.spaceRevision, binding: target.binding }
          : preference.mode === "resume"
            ? { mode: "resume", spaceId, provider, nativeSessionId: preference.nativeSessionId }
            : { mode: "new", spaceId, provider, spaceRevision: target.spaceRevision, configurationId: target.configurationId, ...options },
      );
      if (!selected.success) return work.agentTarget || target.reason === "binding_unverified" ? "busy" : "unavailable";
      if (work.agentTarget && fingerprint(work.agentTarget) !== fingerprint(selected.data)) return "busy";
      if (target.available) return { state: "ready", target: selected.data };
      if (target.reason === "input_owned" || target.reason === "binding_unverified") return { state: "busy", target: selected.data };
      return work.agentTarget ? "busy" : "unavailable";
    },

    async dispatch(work, signal) {
      const input = AgentDispatchInputSchema.safeParse({
        ...keyOf(work),
        eventIds: [work.eventId],
        inputSnapshotRef: work.eventId,
        inputSnapshotHash: work.snapshotHash,
        input: textOf(work),
        target: work.agentTarget,
      });
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
  };
}

function definitelyUnsent(receipt: z.infer<typeof AgentDispatchResponseSchema>): boolean {
  return receipt.coreWrite === "not_sent" && (receipt.nativeWrite === undefined || receipt.nativeWrite === "not_sent") && !receipt.providerAcceptance;
}
