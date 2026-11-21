import { errors, ExecutionBindingSchema, ExecutionSessionBindingSchema } from "@huhu/contracts";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { AgentDispatch } from "./dispatch.js";
import { DispatchInput, DispatchLookup, LaunchOptions, ProviderAcceptance } from "./dispatch-store.js";
import { NativeAnswer, NativeAnswerStatus } from "./native-answer.js";
import { NativeStop, NativeStopStatus } from "./native-stop.js";

export const AgentDispatchTargetInfoSchema = z.object({
  mode: z.enum(["new", "existing", "resume"]),
  provider: z.string(),
  spaceId: z.string(),
  spaceRevision: z.number().int(),
  configurationId: z.string().nullable(),
  sessionId: z.string().optional(),
  binding: ExecutionSessionBindingSchema.nullable(),
  available: z.boolean(),
  reason: z.string().nullable(),
  structuredReply: z.boolean(),
  structuredResult: z.boolean(),
  cancel: z.boolean(),
});
export const AgentDispatchResponseSchema = z.object({
  status: z.enum(["accepted", "busy", "unsupported", "unknown", "not_sent"]),
  reason: z.string().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  execution: ExecutionBindingSchema.nullable(),
  ownerActive: z.boolean(),
  coreWrite: z.enum(["not_sent", "core_written", "unknown"]),
  nativeWrite: z.enum(["not_sent", "unknown", "provider_accepted"]).optional(),
  providerAcceptance: ProviderAcceptance.nullable(),
});

export function registerDispatch(api: HuhuApi, dispatch: AgentDispatch): void {
  const trust = (caller: string) => {
    if (caller !== "plugin:tasks") throw errors.permissionDenied("Agent 任务派遣");
  };
  const internal = { plugin: "agent-cli", exposable: false, defaultExposed: false } as const;
  api.defineCapability(
    def({
      ...internal,
      name: "agent.targets.list",
      scope: "read",
      input: DispatchLookup.pick({ vaultId: true, machineId: true }).extend({ spaceId: z.string().min(1), options: LaunchOptions.optional(), mode: z.literal("snapshot").optional() }),
      output: z.array(AgentDispatchTargetInfoSchema),
      handler: ({ caller, signal }, input) => {
        trust(caller);
        return dispatch.targets(input, signal);
      },
    }),
  );
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.dispatch",
      scope: "execute",
      idempotency: "handler",
      input: DispatchInput,
      output: AgentDispatchResponseSchema,
      handler: ({ caller, signal }, input) => {
        trust(caller);
        return dispatch.dispatch(input, signal);
      },
    }),
  );
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.inspect",
      scope: "read",
      input: DispatchLookup,
      output: AgentDispatchResponseSchema,
      handler: ({ caller, signal }, input) => {
        trust(caller);
        return dispatch.inspect(input, signal);
      },
    }),
  );
  const answerOutput = z.strictObject({ status: NativeAnswerStatus });
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.answer",
      scope: "execute",
      idempotency: "handler",
      input: NativeAnswer,
      output: answerOutput,
      handler: async ({ caller, signal }, input) => {
        trust(caller);
        return { status: await dispatch.answer(input, true, signal) };
      },
    }),
  );
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.answer.inspect",
      scope: "read",
      input: NativeAnswer,
      output: answerOutput,
      handler: async ({ caller, signal }, input) => {
        trust(caller);
        return { status: await dispatch.answer(input, false, signal) };
      },
    }),
  );
  const stopOutput = z.strictObject({ status: NativeStopStatus });
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.stop",
      scope: "execute",
      idempotency: "handler",
      input: NativeStop,
      output: stopOutput,
      handler: async ({ caller, signal }, input) => {
        trust(caller);
        return { status: await dispatch.stop(input, true, signal) };
      },
    }),
  );
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.stop.inspect",
      scope: "read",
      input: NativeStop,
      output: stopOutput,
      handler: async ({ caller, signal }, input) => {
        trust(caller);
        return { status: await dispatch.stop(input, false, signal) };
      },
    }),
  );
}
