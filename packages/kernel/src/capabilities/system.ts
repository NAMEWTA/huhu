import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  CAPABILITY_AVAILABILITIES,
  CAPABILITY_SCOPES,
  CapabilityCatalogEntrySchema,
  ToolAccessSnapshotSchema,
  errors,
  isWorkbenchCaller,
  toJsonSchema,
  type CapabilityAvailability,
  type CapabilityCatalogEntry,
  type CapabilityRisk,
} from "@huhu/contracts";
import { z } from "zod";
import { bindCapability, defineCapabilityDescriptor, type CapabilityDefinition, type CapabilityRegistry } from "./define.js";
import { toolSelection, type ExposureStore } from "../exposure.js";
import type { PluginManager } from "../plugin-manager.js";

/** Kernel tools are bound for the life of a Vault. Declare their metadata from the same definition as the handler. */
export function registerKernelCapability<I, O>(registry: CapabilityRegistry, definition: CapabilityDefinition<I, O> & { risk?: CapabilityRisk; title?: string }): () => void {
  const { handler, risk = "normal", title = definition.name, ...contract } = definition;
  const descriptor = defineCapabilityDescriptor({ ...contract, title, description: title, risk });
  registry.declareDescriptors("kernel", [descriptor]);
  return registry.register(bindCapability(descriptor, handler));
}

export const durableExternal = { idempotency: "durable", externalIntentRequired: true } as const;

const PluginInfo = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.string(),
  origin: z.string(),
  state: z.enum(["active", "disabled", "failed"]),
  error: z.string().optional(),
  dependsOn: z.array(z.string()),
  permissions: z.array(z.string()),
  contributes: z.object({ modules: z.array(z.string()), settingsPages: z.array(z.string()), capabilities: z.array(z.string()) }),
});

const unavailableReasons = {
  "not-found": "能力不存在或插件未安装",
  "plugin-disabled": "所属插件已停用",
  "plugin-failed": "所属插件启动或运行失败",
  "handler-missing": "所属插件已启用，处理函数尚未注册",
};

const policyChanges = z
  .array(z.strictObject({ capability: z.string().min(1), exposed: z.boolean() }))
  .min(1)
  .max(1000);
const policyRevision = z.int().nonnegative();
const catalogRevision = z.string().regex(/^[a-f0-9]{64}$/);
const policyTarget = z.strictObject({
  capability: z.string(),
  plugin: z.string(),
  title: z.string(),
  risk: z.enum(["normal", "high"]),
  scope: z.enum(CAPABILITY_SCOPES),
  availability: z.enum(CAPABILITY_AVAILABILITIES),
  selected: z.boolean().nullable(),
  exposed: z.boolean(),
});

/** 注册内核的插件与能力目录能力（interfaces.md §2：plugins.*、capabilities.list）。 */
export function registerSystemCapabilities(
  registry: CapabilityRegistry,
  plugins: PluginManager,
  exposure: Pick<ExposureStore, "snapshot" | "setMany"> & { setPluginEnabled?(id: string, enabled: boolean): void; publishPolicyChange?(): void },
  gateway?: {
    audit?: { list(): { at: string; entry: string; capability: string; code: string; ms: number }[]; clear(): void };
    tokens: {
      list(): { id: string; name: string; createdAt: string }[];
      create(name: string): { id: string; token: string };
      revoke(id: string): boolean;
      mcp(): { enabled: boolean; transport: "stdio" | "http" };
      setMcp(c: { enabled: boolean; transport: "stdio" | "http" }): void;
    };
  },
): () => void {
  const availabilityOf = (owner: string | undefined, handlerBound: boolean): CapabilityAvailability | "not-found" => {
    const state = owner === "kernel" ? "active" : owner && plugins.state(owner);
    if (!state) return "not-found";
    if (state === "disabled") return "plugin-disabled";
    if (state === "failed") return "plugin-failed";
    return handlerBound ? "active" : "handler-missing";
  };
  function catalog() {
    const entries = new Map(
      registry
        .knownNames()
        .sort()
        .flatMap((name) => {
          const handler = registry.get(name);
          const descriptor = registry.getDescriptor(name);
          const cap = descriptor ?? handler;
          const availability = availabilityOf(cap?.plugin, !!handler);
          if (!cap?.exposable || availability === "not-found") return [];
          return [[name, { cap, availability, title: descriptor?.title ?? name, risk: descriptor?.risk ?? (cap.scope === "read" ? "normal" : "high"), individualExposure: descriptor?.individualExposure }]] as const;
        }),
    );
    const identity = [...entries].map(([name, { cap, availability, risk, title, individualExposure }]) => [
      name,
      cap.plugin,
      cap.scope,
      availability,
      risk,
      title,
      individualExposure ?? false,
      toJsonSchema(cap.input),
      toJsonSchema(cap.output, "output"),
    ]);
    return { revision: createHash("sha256").update(JSON.stringify(identity)).digest("hex"), entries };
  }
  function verifiedChanges(raw: z.infer<typeof policyChanges>, entries: ReturnType<typeof catalog>["entries"]) {
    const changes = new Map<string, boolean>();
    for (const { capability, exposed } of raw) {
      if (!entries.has(capability)) throw errors.invalidInput(`${capability} 不在可开放的工具目录中`);
      if (changes.has(capability) && changes.get(capability) !== exposed) throw errors.invalidInput(`${capability} 有冲突的开放选择`);
      changes.set(capability, exposed);
    }
    if (changes.size > 1) {
      for (const [capability, exposed] of changes) {
        if (exposed && entries.get(capability)?.individualExposure) throw errors.invalidInput(`${capability} 只能逐项开放`);
      }
    }
    return [...changes].map(([capability, exposed]) => ({ capability, exposed }));
  }

  let pluginChanges: Promise<unknown> = Promise.resolve();
  const offs = [
    registerKernelCapability(registry, {
      name: "plugins.list",
      plugin: "kernel",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.object({}),
      output: z.array(PluginInfo),
      handler: ({ caller }) =>
        plugins.list().map((p) => ({
          id: p.id,
          title: p.manifest.title,
          description: p.manifest.description,
          version: p.manifest.version,
          origin: p.manifest.origin,
          state: p.state,
          ...(isWorkbenchCaller(caller) && p.error ? { error: p.error } : {}),
          dependsOn: p.manifest.dependsOn,
          permissions: p.manifest.permissions,
          contributes: { modules: p.manifest.contributes.modules, settingsPages: p.manifest.contributes.settingsPages, capabilities: p.manifest.contributes.capabilities },
        })),
    }),
    registerKernelCapability(registry, {
      name: "plugins.setEnabled",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      ...durableExternal,
      exposable: true,
      defaultExposed: false,
      input: z.strictObject({ id: z.string(), enabled: z.boolean(), expectedVersion: z.string().optional(), alsoDisabled: z.array(z.string()).optional() }),
      output: z.object({ state: z.string(), alsoDisabled: z.array(z.string()) }),
      handler: (context, input) => {
        const next = pluginChanges.then(async () => {
          context.signal.throwIfAborted();
          const { id, enabled } = input;
          if (!isWorkbenchCaller(context.caller)) {
            const installed = plugins.list();
            const target = installed.find((plugin) => plugin.id === id);
            if (!target) throw errors.notFound("插件");
            if (target.manifest.origin !== "builtin") throw errors.permissionDenied("外部入口只能启停内置插件");
            if (input.expectedVersion !== target.manifest.version) throw errors.versionConflict(target.manifest.version);
            const affected = new Set([id]);
            for (let size = 0; size !== affected.size;) {
              size = affected.size;
              for (const plugin of installed) {
                if (enabled) {
                  if (affected.has(plugin.id)) for (const dep of plugin.manifest.dependsOn) affected.add(dep);
                } else if (plugin.state === "active" && plugin.manifest.dependsOn.some((dep) => affected.has(dep))) {
                  affected.add(plugin.id);
                }
              }
            }
            if (installed.some((plugin) => affected.has(plugin.id) && plugin.manifest.origin !== "builtin")) throw errors.permissionDenied("涉及未受信插件");
            affected.delete(id);
            if (!enabled && JSON.stringify([...affected].sort()) !== JSON.stringify([...(input.alsoDisabled ?? [])].sort())) {
              throw errors.invalidInput("应确认连带停用的插件集合");
            }
          }
          if (id === "kernel") return { state: "active", alsoDisabled: [] };
          if (enabled) {
            const state = await plugins.enable(id);
            if (state === "active") exposure.setPluginEnabled?.(id, true);
            return { state, alsoDisabled: [] };
          }
          const stopped = await plugins.disable(id);
          for (const stoppedId of stopped) exposure.setPluginEnabled?.(stoppedId, false);
          return { state: "disabled", alsoDisabled: stopped.filter((stoppedId) => stoppedId !== id) };
        });
        pluginChanges = next.catch(() => undefined);
        return next;
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.get",
      plugin: "kernel",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ mcp: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }), tokens: z.number(), toolAccess: ToolAccessSnapshotSchema }),
      handler: () => ({ mcp: gateway?.tokens.mcp() ?? { enabled: false, transport: "stdio" as const }, tokens: gateway?.tokens.list().length ?? 0, toolAccess: exposure.snapshot() }),
    }),
    registerKernelCapability(registry, {
      name: "gateway.mcp.update",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      exposable: false,
      defaultExposed: false,
      input: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }),
      output: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }),
      handler: (_c, i) => {
        gateway?.tokens.setMcp(i);
        return i;
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.tokens.list",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      exposable: true,
      defaultExposed: false,
      input: z.object({}),
      output: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })),
      handler: ({ caller, subject, session }) =>
        (gateway?.tokens.list() ?? []).filter(({ id }) => isWorkbenchCaller(caller) || caller === "cli" || (caller === "http" && id === (session?.credentialId ?? subject))).map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    }),
    registerKernelCapability(registry, {
      name: "gateway.tokens.create",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      exposable: false,
      defaultExposed: false,
      input: z.object({ name: z.string().min(1).max(60) }),
      output: z.object({ id: z.string(), token: z.string() }),
      handler: (_c, i) => {
        if (!gateway) throw errors.invalidInput("HTTP 服务未启用");
        return gateway.tokens.create(i.name);
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.tokens.revoke",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string() }),
      output: z.object({ revoked: z.boolean() }),
      handler: (_c, i) => ({ revoked: gateway?.tokens.revoke(i.id) ?? false }),
    }),
    registerKernelCapability(registry, {
      name: "gateway.update",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      exposable: false,
      defaultExposed: false,
      input: z.object({ capability: z.string(), exposed: z.boolean() }),
      output: z.object({ exposed: z.boolean(), revision: z.int().nonnegative() }),
      handler: async (_c, i) => {
        const cap = registry.getDescriptor(i.capability) ?? registry.get(i.capability);
        if (!cap) throw errors.capabilityNotFound(i.capability);
        // exposable:false 的能力只能从其内部入口调用。
        if (i.exposed && !cap.exposable) throw errors.invalidInput(`${i.capability} 不允许对外开放`);
        const { revision, changed } = await exposure.setMany([i]);
        if (changed) exposure.publishPolicyChange?.();
        return { exposed: i.exposed, revision };
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.policy.preview",
      plugin: "kernel",
      scope: "read",
      desktopOnly: true,
      exposable: true,
      defaultExposed: false,
      input: z.strictObject({ changes: policyChanges, expectedRevision: policyRevision.optional(), catalogRevision: catalogRevision.optional() }),
      output: z.strictObject({ revision: policyRevision, catalogRevision, targets: z.array(policyTarget) }),
      handler: (_c, { changes, expectedRevision, catalogRevision: expectedCatalog }) => {
        const policy = exposure.snapshot();
        if (policy.state === "error") throw errors.invalidInput(policy.message, { reason: policy.reason });
        const current = catalog();
        if (expectedRevision !== undefined && expectedRevision !== policy.revision) throw errors.versionConflict(String(policy.revision));
        if (expectedCatalog !== undefined && expectedCatalog !== current.revision) throw errors.versionConflict(current.revision);
        const targets = verifiedChanges(changes, current.entries).map(({ capability, exposed }) => {
          const { cap, availability, risk, title } = current.entries.get(capability)!;
          return { capability, exposed, plugin: cap.plugin, scope: cap.scope, availability, risk, title, selected: toolSelection(policy, capability) };
        });
        return { revision: policy.revision, catalogRevision: current.revision, targets };
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.policy.update",
      plugin: "kernel",
      scope: "write",
      risk: "high",
      desktopOnly: true,
      exposable: false,
      defaultExposed: false,
      input: z.strictObject({ changes: policyChanges, expectedRevision: policyRevision, catalogRevision }),
      output: z.strictObject({ revision: policyRevision, changed: z.boolean() }),
      handler: async ({ caller }, input) => {
        if (caller !== "desktop") throw errors.permissionDenied("更新工具开放策略");
        const current = catalog();
        const assertCatalog = (revision: string) => {
          if (revision !== input.catalogRevision) throw errors.versionConflict(revision);
        };
        assertCatalog(current.revision);
        const changes = verifiedChanges(input.changes, current.entries);
        const saved = await exposure.setMany(changes, input.expectedRevision, () => assertCatalog(catalog().revision));
        if (saved.changed) exposure.publishPolicyChange?.();
        return saved;
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.audit.list",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      exposable: true,
      defaultExposed: false,
      input: z.object({}),
      output: z.array(z.object({ at: z.string(), entry: z.string(), capability: z.string(), code: z.string(), ms: z.number() })),
      handler: ({ caller }) => {
        const records = (gateway?.audit?.list() ?? []).slice().reverse();
        if (isWorkbenchCaller(caller)) return records;
        const policy = exposure.snapshot();
        return records.filter(({ capability }) => registry.get(capability)?.exposable && toolSelection(policy, capability) === true);
      },
    }),
    registerKernelCapability(registry, {
      name: "gateway.audit.clear",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: () => (gateway?.audit?.clear(), { ok: true as const }),
    }),
    registerKernelCapability(registry, {
      // 测试台：不执行能力，只回答"以 CLI / MCP / HTTP 身份调用它，现在会不会被允许"
      name: "gateway.check",
      plugin: "kernel",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.object({ capability: z.string() }),
      output: z.object({
        found: z.boolean(),
        scope: z.enum(CAPABILITY_SCOPES).nullable(),
        availability: z.enum([...CAPABILITY_AVAILABILITIES, "not-found"]),
        identities: z.array(z.object({ identity: z.enum(["cli", "mcp", "http"]), allowed: z.boolean(), reason: z.string() })),
      }),
      handler: (_c, i) => {
        const cap = registry.get(i.capability);
        const descriptor = registry.getDescriptor(i.capability);
        const availability = availabilityOf(registry.knownPlugin(i.capability), !!cap);
        const verdict = (): { allowed: boolean; reason: string } => {
          if (availability !== "active") return { allowed: false, reason: unavailableReasons[availability] };
          if (!cap) return { allowed: false, reason: unavailableReasons["handler-missing"] };
          if (!cap.exposable) return { allowed: false, reason: "该能力永不对外开放" };
          const policy = exposure.snapshot();
          if (policy.state === "error") return { allowed: false, reason: policy.message };
          if (toolSelection(policy, cap.name) !== true) return { allowed: false, reason: "尚未开放：先在上面打开它的开关" };
          const requirement = cap.externalIntentRequired ? "（需要持久意图键）" : cap.scope === "write" || cap.scope === "execute" ? "（需要幂等键）" : "";
          return { allowed: true, reason: `允许调用${requirement}` };
        };
        const v = verdict();
        return {
          found: availability !== "not-found",
          scope: availability === "not-found" ? null : (descriptor?.scope ?? cap?.scope ?? null),
          availability,
          identities: (["cli", "mcp", "http"] as const).map((identity) => ({
            identity,
            ...(identity === "mcp" && v.allowed && gateway?.tokens.mcp().enabled !== true ? { allowed: false, reason: "MCP 服务已关闭" } : v),
          })),
        };
      },
    }),
    registerKernelCapability(registry, {
      name: "capabilities.list",
      plugin: "kernel",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      // 管理目录可包含停用项；CLI 和 MCP 使用已认证的发现入口。
      input: z.object({ includeInactive: z.boolean().optional() }),
      output: z.array(CapabilityCatalogEntrySchema),
      handler: (_c, i) => {
        const policy = exposure.snapshot();
        const names = i.includeInactive ? registry.knownNames().sort((a, b) => a.localeCompare(b)) : registry.list().map((cap) => cap.name);
        const entries: CapabilityCatalogEntry[] = [];
        for (const name of names) {
          const plugin = registry.knownPlugin(name);
          if (!plugin) continue;
          const active = registry.get(name);
          const availability = availabilityOf(plugin, !!active);
          if (availability === "not-found" || (!i.includeInactive && availability !== "active")) continue;
          const descriptor = registry.getDescriptor(name);
          const definition = descriptor ?? (availability === "active" ? active : undefined);
          const selected = toolSelection(policy, name);
          entries.push({
            name,
            plugin,
            availability,
            scope: definition?.scope ?? null,
            ...(descriptor && { title: descriptor.title, description: descriptor.description, risk: descriptor.risk }),
            ...(descriptor?.individualExposure && { individualExposure: true }),
            exposable: definition?.exposable ?? false,
            selected,
            exposed: availability === "active" && definition?.exposable === true && selected === true,
            input: definition ? toJsonSchema(definition.input) : null,
            output: definition ? toJsonSchema(definition.output, "output") : null,
          });
        }
        return entries;
      },
    }),
  ];
  return () => offs.forEach((o) => o());
}

import { SettingsSchema, mergeSettings, type Settings } from "@huhu/contracts";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Notification, NotificationStore } from "../notifications.js";

const NotificationDto = z.object({ id: z.string(), title: z.string(), module: z.string(), body: z.string().optional(), at: z.string(), read: z.boolean() });
const notificationIds = z.array(z.string().min(1)).max(1000);
const revisionHash = z.string().regex(/^[a-f0-9]{64}$/);
const SettingsView = SettingsSchema.extend({ revision: revisionHash.optional() });
const ExternalSettingsPatch = z.strictObject({
  appearance: SettingsSchema.shape.appearance.unwrap().strict().partial().optional(),
  editor: SettingsSchema.shape.editor.unwrap().strict().partial().optional(),
  dateTime: SettingsSchema.shape.dateTime.unwrap().strict().partial().optional(),
  storage: SettingsSchema.shape.storage.unwrap().strict().partial().optional(),
});

function visibleNotification(notification: Notification): boolean {
  return notification.module === "home" && notification.title === "专注完成" && notification.body === undefined;
}

function settingsRevision(settings: Settings): string {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}

function publicSettings(settings: Settings) {
  return { ...settings, shortcuts: {}, revision: settingsRevision(settings) };
}

/** 读取 settings.json；缺失或损坏时按默认值（原文件保留）。 */
export function readSettingsFile(settingsFile: string): Settings {
  try {
    return SettingsSchema.parse(existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {});
  } catch {
    return SettingsSchema.parse({});
  }
}

/** Register the per-Vault notification and settings tools. */
export function registerNotificationAndSettings(registry: CapabilityRegistry, store: NotificationStore, settingsFile: string): () => void {
  const publicTool = { plugin: "kernel", exposable: true, defaultExposed: false } as const;
  const read = (): Settings => readSettingsFile(settingsFile);
  function checkNotificationIds(ids: string[], readOnly = false): void {
    const visible = new Set(
      store
        .list()
        .filter((notification) => visibleNotification(notification) && (!readOnly || notification.read))
        .map(({ id }) => id),
    );
    if (ids.some((id) => !visible.has(id))) throw errors.notFound("通知");
  }
  const offs = [
    registerKernelCapability(registry, {
      name: "notifications.list",
      ...publicTool,
      scope: "read",
      risk: "high",
      input: z.object({ unreadOnly: z.boolean().optional(), module: z.string().optional() }),
      output: z.array(NotificationDto),
      handler: ({ caller }, i) => {
        const items = store.list({ ...(i.unreadOnly ? { unreadOnly: true } : {}), ...(i.module ? { module: i.module } : {}) });
        return isWorkbenchCaller(caller) ? items : items.filter(visibleNotification);
      },
    }),
    registerKernelCapability(registry, {
      name: "notifications.markRead",
      ...publicTool,
      scope: "write",
      ...durableExternal,
      input: z.object({ ids: z.union([notificationIds, z.literal("all")]) }),
      output: z.object({ changed: z.number() }),
      handler: ({ caller }, { ids }) => {
        if (!isWorkbenchCaller(caller)) {
          if (ids === "all") throw errors.invalidInput("请指定通知 ID");
          checkNotificationIds(ids);
        }
        return { changed: store.markRead(ids) };
      },
    }),
    registerKernelCapability(registry, {
      name: "notifications.delete",
      ...publicTool,
      scope: "write",
      risk: "high",
      ...durableExternal,
      input: z.object({ ids: notificationIds.min(1) }),
      output: z.object({ changed: z.number() }),
      handler: ({ caller }, { ids }) => {
        if (!isWorkbenchCaller(caller)) checkNotificationIds(ids);
        return { changed: store.delete(ids) };
      },
    }),
    registerKernelCapability(registry, {
      name: "notifications.clearRead",
      ...publicTool,
      scope: "write",
      risk: "high",
      ...durableExternal,
      input: z.object({ ids: notificationIds.optional() }),
      output: z.object({ changed: z.number() }),
      handler: ({ caller }, { ids }) => {
        if (isWorkbenchCaller(caller) && ids === undefined) return { changed: store.clearRead() };
        if (ids === undefined) throw errors.invalidInput("请指定已读通知 ID");
        checkNotificationIds(ids, true);
        return { changed: store.delete(ids) };
      },
    }),
    registerKernelCapability(registry, {
      name: "settings.get",
      ...publicTool,
      scope: "read",
      input: z.object({}),
      output: SettingsView,
      handler: ({ caller }) => (isWorkbenchCaller(caller) ? read() : publicSettings(read())),
    }),
    registerKernelCapability(registry, {
      name: "settings.update",
      ...publicTool,
      scope: "admin",
      risk: "high",
      ...durableExternal,
      input: z.object({ patch: z.record(z.string(), z.unknown()), expectedRevision: revisionHash.optional() }),
      output: SettingsView,
      handler: ({ caller }, i) => {
        const workbench = isWorkbenchCaller(caller);
        const current = read();
        if (!workbench) {
          const revision = settingsRevision(current);
          if (i.expectedRevision !== revision) throw errors.versionConflict(revision);
          const patch = ExternalSettingsPatch.safeParse(i.patch);
          if (!patch.success || !isDeepStrictEqual(patch.data, i.patch)) throw errors.invalidInput("设置范围或值无效");
        }
        const next = mergeSettings(current, i.patch);
        mkdirSync(path.dirname(settingsFile), { recursive: true });
        // 现有文件无法解析：覆盖前先留一份副本，用户的原始设置不会因一次保存而消失
        if (existsSync(settingsFile)) {
          try {
            JSON.parse(readFileSync(settingsFile, "utf8"));
          } catch {
            copyFileSync(settingsFile, `${settingsFile}.corrupt-${Date.now()}`);
          }
        }
        const tmpFile = `${settingsFile}.${process.pid}.tmp`; // 先写临时文件再改名：读取方永远看不到写到一半的文件
        writeFileSync(tmpFile, JSON.stringify(next, null, 2));
        renameSync(tmpFile, settingsFile);
        return workbench ? next : publicSettings(next);
      },
    }),
  ];
  return () => offs.forEach((o) => o());
}
