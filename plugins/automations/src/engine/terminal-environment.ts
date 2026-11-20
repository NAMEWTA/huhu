import { createHash, randomUUID } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError, type AutomationRuleFrontmatter } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, ExposureStore, ModuleCredentials, toolSelection, type CredentialAction, type CredentialOwner, type HuhuApi } from "@huhu/kernel";
import { filesystemIdentity, VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { ProtectedDirectory } from "../../../agent-cli/src/engine/protected-launch.js";
import { hasLegacyTerminalEnvironment, sameDir, type AutomationsService, type TerminalRuleLaunch } from "./service.js";

const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/);
const Definition = z.strictObject({ format: z.literal(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), names: z.array(name).max(64), namesRevision: z.uuidv4().optional() });
type Definition = z.infer<typeof Definition>;
export type AutomationCredentialHost = Pick<CredentialOwner<Definition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;

const id = z.strictObject({ ruleId: z.string().min(1).max(256) });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ruleVersion = z.string().min(1).max(128);
const externalName = z.string().regex(/^HUHU_RULE_SECRET_[A-Z0-9_]{1,80}$/);
const approvedNames = z
  .array(externalName)
  .min(1)
  .max(64)
  .refine((names) => new Set(names).size === names.length);
const approval = z.strictObject({ id: z.uuidv4(), target: digest, names: approvedNames, namesRevision: z.uuidv4().optional() });
const approvalFile = z.strictObject({ format: z.literal(1), approval: approval.nullable(), suspended: z.literal(true).optional() });
const review = z.strictObject({
  ruleVersion,
  target: digest,
  command: z.string(),
  shell: z.literal("powershell"),
  space: z.strictObject({ id: z.string(), revision: z.number().int(), root: z.string() }),
  names: z.array(name),
  approvalId: z.uuidv4().nullable(),
});
const expected = id.extend({ expectedRuleVersion: ruleVersion, expectedRevision: z.uuidv4().nullable() });
const external = { plugin: "automations", exposable: true, defaultExposed: false } as const;
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
  review: defineCapabilityDescriptor({
    ...base,
    name: "automations.terminal.approval.review",
    scope: "read",
    risk: "high",
    title: "核对外部使用的终端规则",
    description: "由桌面核对待批准的命令、Space 与变量名。",
    input: id,
    output: review,
  }),
  approve: defineCapabilityDescriptor({
    ...base,
    name: "automations.terminal.approval.approve",
    scope: "admin",
    risk: "high",
    title: "批准该终端规则供外部手动使用",
    description: "在本机批准所核对的固定目标与明确列出的变量名。",
    input: id.extend({ expectedRuleVersion: ruleVersion, target: digest, names: approvedNames, expectedApprovalId: z.uuidv4().nullable() }),
    output: z.strictObject({ approvalId: z.uuidv4() }),
  }),
  revoke: defineCapabilityDescriptor({
    ...base,
    name: "automations.terminal.approval.revoke",
    scope: "admin",
    risk: "high",
    title: "撤销该终端规则的本机批准",
    description: "撤销外部读取、更新配置和触发新手动运行的批准。",
    input: id.extend({ expectedApprovalId: z.uuidv4() }),
    output: z.strictObject({ revoked: z.literal(true) }),
  }),
  externalStatus: defineCapabilityDescriptor({
    ...external,
    name: "automations.terminal.external.status",
    scope: "read",
    risk: "high",
    title: "读取已批准规则的配置状态",
    description: "返回本机已批准名字的遮蔽配置状态和版本。",
    input: id,
    output: z.strictObject({ ruleVersion, revision: z.uuidv4().nullable(), states: view.shape.states }),
  }),
  externalSave: defineCapabilityDescriptor({
    ...external,
    name: "automations.terminal.external.save",
    scope: "admin",
    risk: "high",
    title: "更新已批准规则的保护值",
    description: "按规则及配置版本替换或清除已批准名字的保护值。",
    input: expected.extend({ changes: z.array(changes).min(1).max(64) }),
    output: z.strictObject({ ruleVersion, revision: z.uuidv4().nullable(), states: view.shape.states }),
  }),
  externalRun: defineCapabilityDescriptor({
    ...external,
    name: "automations.terminal.external.run",
    scope: "execute",
    idempotency: "handler",
    risk: "high",
    title: "手动运行经批准的终端规则",
    description: "运行当前 Vault 的固定批准目标，同一意图重交时读取原运行。",
    input: expected.extend({ intentId: z.uuidv4() }),
    output: z.strictObject({ runId: z.string(), activationId: z.string(), state: z.string(), startedAt: z.string(), finishedAt: z.string().nullable() }),
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
type Space = { id: string; revision: number; root: string };
type Approval = z.infer<typeof approval>;
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const sameNames = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value) => right.includes(value));
const targetOf = (ruleId: string, action: Pick<TerminalAction, "spaceId" | "shell" | "command">, spaceId: string, spaceRevision: number) => hash([ruleId, action.spaceId, action.shell, action.command, spaceId, spaceRevision]);

export function registerTerminalEnvironments(api: HuhuApi, rules: Pick<AutomationsService, "rule" | "withRuleConfiguration" | "invokeApprovedTerminal">, host?: AutomationCredentialHost) {
  const store = host && new ModuleCredentials({ ...host, pluginId: "automations", definition: Definition, targets: (definition) => Object.fromEntries(definition.names.map((name) => [name, definition.fingerprint])) });
  const local = host && new VaultFiles(host.localRoot, undefined, host.vault.readOnly);
  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  const read = async (ruleId: string) => (await store?.list().catch(translate))?.find(({ entityId }) => entityId === ruleId);
  const portable = (ruleId: string) => {
    try {
      return ModuleCredentials.readPortableDefinition(api.vault.files, "automations", Definition, ruleId);
    } catch (error) {
      return translate(error);
    }
  };
  const resolveSpace = (action: TerminalAction) =>
    api
      .service<{ spaces: { list(): Space[] } }>("agentCli")
      ?.spaces.list()
      .find((space) => (action.spaceId ? space.id === action.spaceId : sameDir(space.root, api.vault.files.root)));
  const fingerprint = (ruleId: string) => {
    const { action } = rules.rule(ruleId).data;
    if (action.kind !== "terminal") throw errors.invalidInput("只有终端规则可以配置执行环境");
    const target = resolveSpace(action);
    return target ? targetOf(ruleId, action, target.id, target.revision) : null;
  };
  const approvalPath = (ruleId: string) => `automations-terminal-approvals/${host?.localVaultInstanceId}/${hash(ruleId)}.json`;
  const readApproval = (ruleId: string) => {
    if (!local) return { approval: null, version: null };
    const file = approvalPath(ruleId);
    const stat = lstatSync(local.abs(file), { throwIfNoEntry: false });
    if (!stat) return { approval: null, version: null };
    if (!stat.isFile()) throw errors.permissionDenied("本机规则批准不可用");
    const saved = local.read(file);
    if (!saved) return { approval: null, version: null };
    try {
      const record = approvalFile.parse(JSON.parse(saved.bytes.toString("utf8")));
      return { approval: record.suspended ? null : record.approval, version: saved.version };
    } catch {
      throw errors.permissionDenied("本机规则批准不可用");
    }
  };
  const writeApproval = async (ruleId: string, next: Approval | null, expectedVersion: string | null, suspended = false) => {
    if (!local || api.vault.files.readOnly) throw errors.permissionDenied("本机规则批准不可用");
    return local.write(approvalPath(ruleId), Buffer.from(JSON.stringify({ format: 1, approval: next, ...(suspended && { suspended: true }) }) + "\n"), { expectedVersion });
  };
  const describeTarget = (ruleId: string) => {
    const rule = rules.rule(ruleId);
    const { action } = rule.data;
    if (process.platform !== "win32" || action.kind !== "terminal" || action.shell !== "powershell" || hasLegacyTerminalEnvironment(action)) {
      throw errors.permissionDenied("此批准仅用于已迁移的 Windows PowerShell 终端规则");
    }
    const space = resolveSpace(action);
    if (!space) throw errors.permissionDenied("规则 Space 当前不可用");
    const root = realpathSync.native(space.root);
    const spaceStat = statSync(root, { bigint: true });
    const ruleStat = statSync(api.vault.files.abs(rule.path), { bigint: true });
    const spaceIdentity = filesystemIdentity(spaceStat);
    const ruleIdentity = filesystemIdentity(ruleStat);
    if (!spaceStat.isDirectory() || !spaceIdentity || !ruleIdentity) throw errors.permissionDenied("规则目标的本机身份不可核对");
    const environmentTarget = targetOf(ruleId, action, space.id, space.revision);
    const directory: ProtectedDirectory = { path: root, identity: spaceIdentity, birthtimeNs: String(spaceStat.birthtimeNs) };
    const target = hash([environmentTarget, space.root, directory.path, directory.identity, directory.birthtimeNs, rule.version, ruleIdentity, String(ruleStat.mtimeNs)]);
    return { ruleVersion: rule.version, target, environmentTarget, directory, command: action.command, shell: action.shell, space: { id: space.id, root, revision: space.revision } };
  };
  const requireDesktop = (caller: string) => {
    if (caller !== "desktop") throw errors.permissionDenied("管理本机规则批准");
  };
  const authorizeExternal = (caller: string, capability: string, ruleId: string) => {
    if (caller !== "cli" && caller !== "mcp") throw errors.permissionDenied("此规则操作仅对 CLI 和 MCP 开放");
    if (toolSelection(exposure.snapshot(), capability) !== true) throw errors.capabilityNotExposed(capability);
    if (!store || api.vault.files.readOnly) throw errors.permissionDenied("本机规则批准不可用");
    const grant = readApproval(ruleId).approval;
    if (!grant) throw errors.permissionDenied("终端规则未获本机批准");
    const current = describeTarget(ruleId);
    const config = portable(ruleId);
    if (grant.target !== current.target || config?.definition.namesRevision !== grant.namesRevision || (config && !sameNames(config.definition.names, grant.names))) {
      throw errors.permissionDenied("终端规则目标或变量名已变化，需要重新批准");
    }
    return { grant, current, config };
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
    bindCapability(terminalEnvironmentDescriptors.save, ({ caller, signal }, { ruleId, expectedRevision, names, changes }) =>
      rules.withRuleConfiguration(async () => {
        if (caller !== "desktop") throw errors.permissionDenied("保存规则环境");
        if (!store) throw errors.invalidInput("当前 Vault 无法使用规则环境的本机保护");
        const current = fingerprint(ruleId);
        if (!current) throw errors.invalidInput("规则工作区不可用");
        const previous = await read(ruleId);
        if ((previous?.revision ?? null) !== expectedRevision) throw errors.versionConflict(previous?.revision ?? "");
        const prior = readApproval(ruleId);
        const previousNames = previous?.definition.names ?? prior.approval?.names ?? [];
        const changed = !sameNames(previousNames, names);
        const namesRevision = changed ? randomUUID() : previous?.definition.namesRevision;
        const definition = { format: 1 as const, fingerprint: current, names, ...(namesRevision && { namesRevision }) };
        const actions = actionsFor(names, previous?.definition, changes).filter(({ purpose }) => names.includes(purpose) || previous?.authState[purpose] !== "unconfigured");
        signal.throwIfAborted();
        // Suspend locally before publishing changed names. A crash or a later
        // rollback of the portable file cannot revive the old authorization.
        const suspended = changed && prior.approval ? await writeApproval(ruleId, prior.approval, prior.version, true) : null;
        try {
          const saved = await store.save({ entityId: ruleId, expectedRevision, definition, actions, signal });
          return { revision: saved.revision, localAvailable: true, names, states: saved.authState, targetChanged: false };
        } catch (error) {
          if (suspended && (portable(ruleId)?.revision ?? null) === expectedRevision) {
            await writeApproval(ruleId, prior.approval, suspended.version);
          }
          return translate(error);
        }
      }),
    ),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.review, ({ caller }, { ruleId }) => {
      requireDesktop(caller);
      const { environmentTarget: _, directory: _directory, ...current } = describeTarget(ruleId);
      const grant = readApproval(ruleId).approval;
      return { ...current, names: portable(ruleId)?.definition.names ?? grant?.names ?? [], approvalId: grant?.id ?? null };
    }),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.approve, ({ caller, signal }, { ruleId, expectedRuleVersion, target, names, expectedApprovalId }) =>
      rules.withRuleConfiguration(async () => {
        requireDesktop(caller);
        signal.throwIfAborted();
        const current = describeTarget(ruleId);
        if (current.ruleVersion !== expectedRuleVersion || current.target !== target) throw errors.versionConflict(current.ruleVersion);
        const prior = readApproval(ruleId);
        if ((prior.approval?.id ?? null) !== expectedApprovalId) throw errors.versionConflict(prior.approval?.id ?? "");
        const config = portable(ruleId);
        if (config && !sameNames(config.definition.names, names)) throw errors.invalidInput("请批准规则环境中现有的全部变量名");
        const approvalId = randomUUID();
        const namesRevision = config?.definition.namesRevision;
        await writeApproval(ruleId, { id: approvalId, names, target, ...(namesRevision && { namesRevision }) }, prior.version);
        return { approvalId };
      }),
    ),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.revoke, ({ caller, signal }, { ruleId, expectedApprovalId }) =>
      rules.withRuleConfiguration(async () => {
        requireDesktop(caller);
        signal.throwIfAborted();
        const prior = readApproval(ruleId);
        if (prior.approval?.id !== expectedApprovalId) throw errors.versionConflict(prior.approval?.id ?? "");
        await writeApproval(ruleId, null, prior.version);
        return { revoked: true as const };
      }),
    ),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.externalStatus, ({ caller }, { ruleId }) =>
      rules.withRuleConfiguration(async () => {
        const capability = terminalEnvironmentDescriptors.externalStatus.name;
        const { grant } = authorizeExternal(caller, capability, ruleId);
        const saved = await read(ruleId);
        const { current, config } = authorizeExternal(caller, capability, ruleId);
        const states = Object.fromEntries(
          grant.names.map((name) => {
            const state = saved?.authState[name] ?? "unconfigured";
            return [name, state === "configured" && config?.definition.fingerprint !== current.environmentTarget ? "needs-reconfiguration" : state];
          }),
        );
        return { ruleVersion: current.ruleVersion, revision: saved?.revision ?? null, states };
      }),
    ),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.externalSave, ({ caller, signal }, { ruleId, expectedRuleVersion, expectedRevision, changes }) =>
      rules.withRuleConfiguration(async () => {
        const capability = terminalEnvironmentDescriptors.externalSave.name;
        const { grant, current, config } = authorizeExternal(caller, capability, ruleId);
        if (!store) throw errors.permissionDenied("本机规则批准不可用");
        if (current.ruleVersion !== expectedRuleVersion) throw errors.versionConflict(current.ruleVersion);
        if ((config?.revision ?? null) !== expectedRevision) throw errors.versionConflict(config?.revision ?? "");
        if (changes.some(({ name }) => !grant.names.includes(name))) throw errors.permissionDenied("修改未批准的变量");
        const definition = { format: 1 as const, fingerprint: current.environmentTarget, names: grant.names, ...(grant.namesRevision && { namesRevision: grant.namesRevision }) };
        const saved = await store
          .save({
            entityId: ruleId,
            expectedRevision,
            definition,
            actions: actionsFor(grant.names, config?.definition, changes),
            signal,
            isCurrent: () => {
              try {
                const latest = authorizeExternal(caller, capability, ruleId);
                return latest.grant.id === grant.id && latest.current.target === current.target;
              } catch {
                return false;
              }
            },
          })
          .catch(translate);
        return { ruleVersion: current.ruleVersion, revision: saved.revision, states: saved.authState };
      }),
    ),
  );
  api.defineCapability(
    bindCapability(terminalEnvironmentDescriptors.externalRun, ({ caller, signal }, { ruleId, expectedRuleVersion, expectedRevision, intentId }) =>
      rules.withRuleConfiguration(async () => {
        const capability = terminalEnvironmentDescriptors.externalRun.name;
        const { grant, current } = authorizeExternal(caller, capability, ruleId);
        const intent = hash([caller, ruleId, grant.id, expectedRuleVersion, expectedRevision]);
        return rules.invokeApprovedTerminal(ruleId, intentId, intent, async (submit) => {
          signal.throwIfAborted();
          if (!store) throw errors.permissionDenied("本机规则批准不可用");
          const validate = () => {
            const latest = authorizeExternal(caller, capability, ruleId);
            if (latest.grant.id !== grant.id || latest.current.target !== current.target || latest.current.ruleVersion !== expectedRuleVersion) throw errors.versionConflict(latest.current.ruleVersion);
            if (!latest.config || latest.config.revision !== expectedRevision || latest.config.definition.fingerprint !== current.environmentTarget) {
              throw errors.versionConflict(latest.config?.revision ?? "");
            }
          };
          validate();
          const agent = api.service<{ launch(request: TerminalRuleLaunch & { env: Record<string, string>; approvedDirectory: ProtectedDirectory }, signal: AbortSignal): Promise<{ id: string }> }>("agentProtectedTerminal");
          if (!agent) throw errors.permissionDenied("受保护启动服务不可用");
          await store
            .use(ruleId, grant.names, async (definition, values, revision) => {
              signal.throwIfAborted();
              if (revision !== expectedRevision || !sameNames(definition.names, grant.names) || definition.fingerprint !== current.environmentTarget) throw errors.permissionDenied("已批准的规则配置不可用");
              const { command, shell, space } = current;
              await submit({ command, shell, provider: "shell", spaceId: space.id, spaceRevision: space.revision }, current.target, validate, (input, launchSignal) =>
                agent.launch({ ...input, env: Object.fromEntries(values), approvedDirectory: current.directory }, launchSignal),
              );
            })
            .catch(translate);
        });
      }),
    ),
  );
  return {
    async use<R>(
      ruleId: string,
      action: Pick<TerminalAction, "spaceId" | "shell" | "command">,
      target: { spaceId: string; spaceRevision: number },
      expectedRevision: string | null,
      run: (env?: Record<string, string>) => Promise<R>,
    ): Promise<R> {
      const saved = portable(ruleId);
      if ((saved?.revision ?? null) !== expectedRevision) throw errors.versionConflict(saved?.revision ?? "");
      if (!store) {
        if (saved?.definition.names.length) throw errors.invalidInput("本机保护不可用，无法读取规则环境");
        return run();
      }
      if (!saved?.definition.names.length) return run();
      const current = targetOf(ruleId, action, target.spaceId, target.spaceRevision);
      let changed = false;
      return store
        .use(ruleId, saved.definition.names, async (definition, values, revision) => {
          if (revision !== expectedRevision) {
            changed = true;
            throw errors.versionConflict(revision);
          }
          if (definition.fingerprint !== current || fingerprint(ruleId) !== current) throw errors.invalidInput("终端命令或目标已变化，请重新配置规则环境");
          return run(Object.fromEntries(values));
        })
        .catch((error: unknown) => {
          if (changed) throw new HuhuError("VERSION_CONFLICT", "运行预留的受保护环境已轮换。");
          return translate(error);
        });
    },
  };
}
