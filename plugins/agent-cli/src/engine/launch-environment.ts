import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, ModuleCredentials, type CredentialAction, type CredentialOwner, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { AGENT_CATALOG } from "../shared/catalog.js";

const key = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const value = z
  .string()
  .max(16_384)
  .regex(/^[^\0]*$/);
const provider = z.enum([...AGENT_CATALOG.map(({ id }) => id), "shell"] as const);
const Definition = z.strictObject({
  format: z.literal(1),
  name: z.string().trim().min(1).max(160),
  provider,
  ordinary: z.array(z.strictObject({ name: key, value })).max(64),
  protectedNames: z.array(key).max(64),
});
type Definition = z.infer<typeof Definition>;
export type AgentCredentialHost = Pick<CredentialOwner<Definition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;

const revision = z.uuidv4();
const identity = z.strictObject({ id: z.uuidv4(), expectedRevision: revision });
const patch = z.discriminatedUnion("action", [
  z.strictObject({ name: key, action: z.literal("keep") }),
  z.strictObject({ name: key, action: z.literal("clear") }),
  z.strictObject({ name: key, action: z.literal("replace"), value: value.min(1), reconfigure: z.literal(true).optional() }),
]);
const saveInput = Definition.omit({ format: true }).extend({ id: z.uuidv4().optional(), expectedRevision: revision.nullable(), changes: z.array(patch).max(128) });
const state = z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"]);
const view = Definition.omit({ format: true }).extend({ id: z.uuidv4(), revision, states: z.record(key, state) });
const base = { plugin: "agent-cli", desktopOnly: true, exposable: false, defaultExposed: false } as const;

export const agentEnvironmentDescriptors = {
  list: defineCapabilityDescriptor({
    ...base,
    name: "agent.launch.environments.list",
    scope: "read",
    risk: "normal",
    title: "列出 Agent CLI 启动环境",
    description: "读取启动环境和受保护变量的本机状态。",
    input: z.strictObject({}),
    output: z.strictObject({ localAvailable: z.boolean(), profiles: z.array(view) }),
  }),
  save: defineCapabilityDescriptor({
    ...base,
    name: "agent.launch.environments.save",
    scope: "admin",
    risk: "high",
    title: "保存 Agent CLI 启动环境",
    description: "按版本保存普通变量和受保护变量补丁。",
    input: saveInput,
    output: view,
  }),
  remove: defineCapabilityDescriptor({
    ...base,
    name: "agent.launch.environments.remove",
    scope: "admin",
    risk: "high",
    title: "删除 Agent CLI 启动环境",
    description: "按版本移除本模块拥有的启动环境。",
    input: identity,
    output: z.strictObject({ removed: z.literal(true) }),
  }),
};

function unavailable(): HuhuError {
  return new HuhuError("INVALID_INPUT", "当前 Vault 无法使用本机 Agent CLI 凭据保护");
}

function translate(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  switch (error.code) {
    case "conflict":
      throw new HuhuError("VERSION_CONFLICT", "启动环境已更新，请重新读取");
    case "not-found":
      throw errors.notFound("启动环境不存在");
    case "cancelled":
      throw errors.invalidInput("已取消启动环境修改");
    case "invalid-input":
      throw errors.invalidInput("启动环境配置无效");
    case "missing-key":
      throw new HuhuError("INVALID_INPUT", "本机密钥不可用，请重新配置受保护变量");
    default:
      throw new HuhuError("INTERNAL", "无法读取或保存 Agent CLI 启动环境");
  }
}

function project({ entityId, revision, authState, definition }: Awaited<ReturnType<ModuleCredentials<Definition>["list"]>>[number]) {
  const { format: _format, ...profile } = definition;
  return { id: entityId, revision, ...profile, states: authState };
}

function patches(definition: Definition, previous: Definition | undefined, changes: z.infer<typeof patch>[]): CredentialAction[] {
  const variables = [...definition.ordinary.map(({ name }) => name), ...definition.protectedNames];
  if (new Set(variables.map((name) => name.toUpperCase())).size !== variables.length) throw errors.invalidInput("环境变量名不能重复");
  const target = new Set(definition.protectedNames);
  const prior = new Set(previous?.protectedNames ?? []);
  const events = new Map<string, CredentialAction>();
  for (const { name, ...change } of changes) {
    if (events.has(name) || (!target.has(name) && (!prior.has(name) || change.action !== "clear"))) throw errors.invalidInput("受保护变量补丁与当前配置不符");
    events.set(name, { ...change, purpose: name });
  }
  for (const name of target) if (!events.has(name)) events.set(name, { purpose: name, action: "keep" });
  for (const name of prior) if (!target.has(name) && events.get(name)?.action !== "clear") throw errors.invalidInput("移除受保护变量需要显式清除");
  return [...events.values()];
}

export function registerAgentEnvironments(api: HuhuApi, host?: AgentCredentialHost): void {
  const store = host && new ModuleCredentials({ ...host, pluginId: "agent-cli", definition: Definition, targets: (d) => Object.fromEntries(d.protectedNames.map((name) => [name, d.provider])) });
  api.defineCapability(
    bindCapability(agentEnvironmentDescriptors.list, async () => ({
      localAvailable: store !== undefined,
      profiles: store ? (await store.list().catch(translate)).map(project) : [],
    })),
  );
  api.defineCapability(
    bindCapability(agentEnvironmentDescriptors.save, async ({ signal }, { id, expectedRevision, changes, ...fields }) => {
      if (!store) throw unavailable();
      if ((id === undefined) !== (expectedRevision === null)) throw errors.invalidInput("环境 ID 和预期版本必须一起提供");
      const entityId = id ?? randomUUID();
      const definition: Definition = { ...fields, format: 1 };
      const current = id ? (await store.list().catch(translate)).find((profile) => profile.entityId === id) : undefined;
      if (id && current?.revision !== expectedRevision) throw new HuhuError("VERSION_CONFLICT", "启动环境已更新，请重新读取");
      // The owner requires patches for configured old purposes and new targets.
      const actions = patches(definition, current?.definition, changes).filter(({ purpose }) => definition.protectedNames.includes(purpose) || current?.authState[purpose] !== "unconfigured");
      return project({ ...(await store.save({ entityId, expectedRevision, definition, actions, signal }).catch(translate)), definition });
    }),
  );
  api.defineCapability(
    bindCapability(agentEnvironmentDescriptors.remove, async ({ signal }, { id, expectedRevision }) => {
      if (!store) throw unavailable();
      await store.delete(id, expectedRevision, signal).catch(translate);
      return { removed: true as const };
    }),
  );
}
