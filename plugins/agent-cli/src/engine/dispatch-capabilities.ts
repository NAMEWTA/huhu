import { errors, ExecutionBindingSchema, ExecutionSessionBindingSchema } from "@huhu/contracts";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { AgentDispatch } from "./dispatch.js";
import { DispatchInput, DispatchLookup, LaunchOptions, ProviderAcceptance } from "./dispatch-store.js";

const TargetInfo = z.object({
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
const DispatchResponse = z.object({
  status: z.enum(["accepted", "busy", "unsupported", "unknown", "not_sent"]),
  reason: z.string().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  execution: ExecutionBindingSchema.nullable(),
  ownerActive: z.boolean(),
  coreWrite: z.enum(["not_sent", "core_written", "unknown"]),
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
      input: DispatchLookup.pick({ vaultId: true, machineId: true }).extend({ spaceId: z.string().min(1), options: LaunchOptions.optional() }),
      output: z.array(TargetInfo),
      handler: ({ caller }, input) => {
        trust(caller);
        return dispatch.targets(input);
      },
    }),
  );
  api.defineCapability(
    def({
      ...internal,
      name: "agent.runs.dispatch",
      scope: "execute",
      input: DispatchInput,
      output: DispatchResponse,
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
      output: DispatchResponse,
      handler: ({ caller, signal }, input) => {
        trust(caller);
        return dispatch.inspect(input, signal);
      },
    }),
  );
}
