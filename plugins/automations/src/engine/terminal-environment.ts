import { createHash } from "node:crypto";
import { errors, HuhuError, type AutomationRuleFrontmatter } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, ModuleCredentials, type CredentialAction, type CredentialOwner, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { sameDir, type AutomationsService } from "./service.js";

const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/);
const Definition = z.strictObject({ format: z.literal(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), names: z.array(name).max(64) });
type Definition = z.infer<typeof Definition>;
export type AutomationCredentialHost = Pick<CredentialOwner<Definition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;

const id = z.strictObject({ ruleId: z.string().min(1).max(256) });
const changes = z.discriminatedUnion("action", [
  z.strictObject({ name, action: z.literal("keep") }),
  z.strictObject({ name, action: z.literal("clear") }),
  z.strictObject({
    name,
    action: z.literal("replace"),
    value: z
      .string()
      .min(1)
      .max(16_384)
      .regex(/^[^\0]*$/),
    reconfigure: z.literal(true).optional(),
  }),
]);
const view = z.strictObject({
  revision: z.uuidv4().nullable(),
  names: z.array(name),
  localAvailable: z.boolean(),
  targetChanged: z.boolean(),
  states: z.record(name, z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"])),
});
const base = { plugin: "automations", desktopOnly: true, exposable: false, defaultExposed: false } as const;
export const terminalEnvironmentDescriptors = {
  get: defineCapabilityDescriptor({
    ...base,
    name: "automations.terminal.environment.get",
    scope: "read",
    risk: "normal",
    title: "查看规则环境",
    description: "读取终端规则的受保护变量名和本机配置状态。",
    input: id,
    output: view,
  }),
  save: defineCapabilityDescriptor({
    ...base,
    name: "automations.terminal.environment.save",
    scope: "admin",
    risk: "high",
    title: "保存规则环境",
    description: "按版本向该终端规则写入或清除受保护变量。",
    input: id.extend({ expectedRevision: z.uuidv4().nullable(), names: z.array(name).max(64), changes: z.array(changes).max(128) }),
    output: view,
  }),
};

function translate(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  if (error.code === "conflict") throw new HuhuError("VERSION_CONFLICT", "规则环境已更新，请重新读取");
  if (error.code === "cancelled") throw errors.invalidInput("已取消规则环境修改");
  if (error.code === "invalid-input") throw errors.invalidInput("规则环境配置无效");
  throw errors.invalidInput("规则的本机环境不可用，请重新配置受保护变量", { reason: error.code });
}

function actionsFor(names: string[], previous: Definition | undefined, patches: z.infer<typeof changes>[]): CredentialAction[] {
  if (new Set(names.map((item) => item.toUpperCase())).size !== names.length) throw errors.invalidInput("环境变量名不能重复");
  const selected = new Set(names);
  const prior = new Set(previous?.names ?? []);
  const actions = new Map<string, CredentialAction>();
  for (const { name, ...patch } of patches) {
    if (actions.has(name) || (!selected.has(name) && (!prior.has(name) || patch.action !== "clear"))) throw errors.invalidInput("规则环境补丁与变量不符");
    actions.set(name, { ...patch, purpose: name });
  }
  for (const name of selected) if (!actions.has(name)) actions.set(name, { purpose: name, action: "keep" });
  for (const name of prior) if (!selected.has(name) && actions.get(name)?.action !== "clear") throw errors.invalidInput("移除变量需要明确清除");
  return [...actions.values()];
}

type TerminalAction = Extract<AutomationRuleFrontmatter["action"], { kind: "terminal" }>;
const targetOf = (ruleId: string, action: Pick<TerminalAction, "spaceId" | "shell" | "command">, spaceId: string, spaceRevision: number) =>
  createHash("sha256")
    .update(JSON.stringify([ruleId, action.spaceId, action.shell, action.command, spaceId, spaceRevision]))
    .digest("hex");

export function registerTerminalEnvironments(api: HuhuApi, rules: Pick<AutomationsService, "rule">, host?: AutomationCredentialHost) {
  const store = host && new ModuleCredentials({ ...host, pluginId: "automations", definition: Definition, targets: (definition) => Object.fromEntries(definition.names.map((name) => [name, definition.fingerprint])) });
  const read = async (ruleId: string) => (await store?.list().catch(translate))?.find(({ entityId }) => entityId === ruleId);
  const portable = (ruleId: string) => {
    try {
      return ModuleCredentials.readPortableDefinition(api.vault.files, "automations", Definition, ruleId);
    } catch (error) {
      return translate(error);
    }
  };
  const fingerprint = (ruleId: string) => {
    const { action } = rules.rule(ruleId).data;
    if (action.kind !== "terminal") throw errors.invalidInput("只有终端规则可以配置执行环境");
    const spaces = api.service<{ spaces: { list(): { id: string; revision: number; root: string }[] } }>("agentCli")?.spaces.list();
    const target = spaces?.find((space) => (action.spaceId ? space.id === action.spaceId : sameDir(space.root, api.vault.files.root)));
    return target ? targetOf(ruleId, action, target.id, target.revision) : null;
  };
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.get, async ({ caller }, { ruleId }) => {
      if (caller !== "desktop") throw errors.permissionDenied("查看规则环境");
      const current = fingerprint(ruleId);
      if (!store) {
        const saved = portable(ruleId);
        const names = saved?.definition.names ?? [];
        return {
          revision: saved?.revision ?? null,
          localAvailable: false,
          names,
          targetChanged: !!saved && saved.definition.fingerprint !== current,
          states: Object.fromEntries(names.map((name) => [name, saved?.configured.includes(name) ? ("temporarily-unavailable" as const) : ("unconfigured" as const)])),
        };
      }
      const saved = await read(ruleId);
      return { revision: saved?.revision ?? null, localAvailable: true, names: saved?.definition.names ?? [], states: saved?.authState ?? {}, targetChanged: !!saved && saved.definition.fingerprint !== current };
    }),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.save, async ({ caller, signal }, { ruleId, expectedRevision, names, changes }) => {
      if (caller !== "desktop") throw errors.permissionDenied("保存规则环境");
      if (!store) throw errors.invalidInput("当前 Vault 无法使用规则环境的本机保护");
      const current = fingerprint(ruleId);
      if (!current) throw errors.invalidInput("规则工作区不可用");
      const previous = await read(ruleId);
      if ((previous?.revision ?? null) !== expectedRevision) throw errors.versionConflict(previous?.revision ?? "");
      const definition = { format: 1 as const, fingerprint: current, names };
      const actions = actionsFor(names, previous?.definition, changes).filter(({ purpose }) => names.includes(purpose) || previous?.authState[purpose] !== "unconfigured");
      const saved = await store.save({ entityId: ruleId, expectedRevision, definition, actions, signal }).catch(translate);
      return { revision: saved.revision, localAvailable: true, names, states: saved.authState, targetChanged: false };
    }),
  );
  return {
    async use<R>(ruleId: string, action: Pick<TerminalAction, "spaceId" | "shell" | "command">, target: { spaceId: string; spaceRevision: number }, run: (env?: Record<string, string>) => Promise<R>): Promise<R> {
      if (!store) {
        if (portable(ruleId)?.definition.names.length) throw errors.invalidInput("本机保护不可用，无法读取规则环境");
        return run();
      }
      const saved = await read(ruleId);
      if (!saved?.definition.names.length) return run();
      const current = targetOf(ruleId, action, target.spaceId, target.spaceRevision);
      return store
        .use(ruleId, saved.definition.names, async (definition, values) => {
          if (definition.fingerprint !== current || fingerprint(ruleId) !== current) throw errors.invalidInput("终端命令或目标已变化，请重新配置规则环境");
          return run(Object.fromEntries(values));
        })
        .catch(translate);
    },
  };
}
