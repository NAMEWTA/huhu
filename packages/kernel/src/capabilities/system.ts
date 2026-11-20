import { createHash } from "node:crypto";
import { CAPABILITY_AVAILABILITIES, CAPABILITY_SCOPES, CapabilityCatalogEntrySchema, ToolAccessSnapshotSchema, errors, toJsonSchema, type CapabilityAvailability, type CapabilityCatalogEntry } from "@huhu/contracts";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";
import { toolSelection, type ExposureStore } from "../exposure.js";
import type { PluginManager } from "../plugin-manager.js";

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
          if (!cap?.exposable || cap.desktopOnly || availability === "not-found") return [];
          return [[name, { cap, availability, title: descriptor?.title ?? name, risk: descriptor?.risk ?? (cap.scope === "read" ? "normal" : "high") }]] as const;
        }),
    );
    const identity = [...entries].map(([name, { cap, availability, risk, title }]) => [name, cap.plugin, cap.scope, availability, risk, title, toJsonSchema(cap.input), toJsonSchema(cap.output, "output")]);
    return { revision: createHash("sha256").update(JSON.stringify(identity)).digest("hex"), entries };
  }
  function verifiedChanges(raw: z.infer<typeof policyChanges>, entries: ReturnType<typeof catalog>["entries"]) {
    const changes = new Map<string, boolean>();
    for (const { capability, exposed } of raw) {
      if (!entries.has(capability)) throw errors.invalidInput(`${capability} 不在可开放的工具目录中`);
      if (changes.has(capability) && changes.get(capability) !== exposed) throw errors.invalidInput(`${capability} 有冲突的开放选择`);
      changes.set(capability, exposed);
    }
    return [...changes].map(([capability, exposed]) => ({ capability, exposed }));
  }

  const offs = [
    registry.register(
      defineCapability({
        name: "plugins.list",
        plugin: "kernel",
        scope: "read",
        exposable: true,
        defaultExposed: true,
        input: z.object({}),
        output: z.array(PluginInfo),
        handler: () =>
          plugins.list().map((p) => ({
            id: p.id,
            title: p.manifest.title,
            description: p.manifest.description,
            version: p.manifest.version,
            origin: p.manifest.origin,
            state: p.state,
            ...(p.error ? { error: p.error } : {}),
            dependsOn: p.manifest.dependsOn,
            permissions: p.manifest.permissions,
            contributes: { modules: p.manifest.contributes.modules, settingsPages: p.manifest.contributes.settingsPages, capabilities: p.manifest.contributes.capabilities },
          })),
      }),
    ),
    registry.register(
      defineCapability({
        name: "plugins.setEnabled",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({ id: z.string(), enabled: z.boolean() }),
        output: z.object({ state: z.string(), alsoDisabled: z.array(z.string()) }),
        handler: async (_c, i) => {
          if (i.id === "kernel") return { state: "active", alsoDisabled: [] };
          if (i.enabled) {
            const state = await plugins.enable(i.id);
            if (state === "active") exposure.setPluginEnabled?.(i.id, true);
            return { state, alsoDisabled: [] };
          }
          const stopped = await plugins.disable(i.id); // 依赖它的插件先被停用
          for (const id of stopped) exposure.setPluginEnabled?.(id, false);
          return { state: "disabled", alsoDisabled: stopped.filter((x) => x !== i.id) };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.get",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({}),
        output: z.object({ mcp: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }), tokens: z.number(), toolAccess: ToolAccessSnapshotSchema }),
        handler: () => ({ mcp: gateway?.tokens.mcp() ?? { enabled: false, transport: "stdio" as const }, tokens: gateway?.tokens.list().length ?? 0, toolAccess: exposure.snapshot() }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.mcp.update",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }),
        output: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }),
        handler: (_c, i) => {
          gateway?.tokens.setMcp(i);
          return i;
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.tokens.list",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({}),
        output: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })),
        handler: () => gateway?.tokens.list() ?? [],
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.tokens.create",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({ name: z.string().min(1).max(60) }),
        output: z.object({ id: z.string(), token: z.string() }),
        handler: (_c, i) => {
          if (!gateway) throw errors.invalidInput("HTTP 服务未启用");
          return gateway.tokens.create(i.name);
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.tokens.revoke",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({ id: z.string() }),
        output: z.object({ revoked: z.boolean() }),
        handler: (_c, i) => ({ revoked: gateway?.tokens.revoke(i.id) ?? false }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.update",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({ capability: z.string(), exposed: z.boolean() }),
        output: z.object({ exposed: z.boolean(), revision: z.int().nonnegative() }),
        handler: async (_c, i) => {
          const cap = registry.getDescriptor(i.capability) ?? registry.get(i.capability);
          if (!cap) throw errors.capabilityNotFound(i.capability);
          // exposable:false 的能力（保险箱明文、Agent/SSH 执行等）永远不能开放
          if (i.exposed && !cap.exposable) throw errors.invalidInput(`${i.capability} 不允许对外开放`);
          const { revision, changed } = await exposure.setMany([i]);
          if (changed) exposure.publishPolicyChange?.();
          return { exposed: i.exposed, revision };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.policy.preview",
        plugin: "kernel",
        scope: "admin",
        desktopOnly: true,
        exposable: false,
        defaultExposed: false,
        input: z.strictObject({ changes: policyChanges }),
        output: z.strictObject({ revision: policyRevision, catalogRevision, targets: z.array(policyTarget) }),
        handler: (_c, { changes }) => {
          const policy = exposure.snapshot();
          if (policy.state === "error") throw errors.invalidInput(policy.message, { reason: policy.reason });
          const current = catalog();
          const targets = verifiedChanges(changes, current.entries).map(({ capability, exposed }) => {
            const { cap, availability, risk, title } = current.entries.get(capability)!;
            return { capability, exposed, plugin: cap.plugin, scope: cap.scope, availability, risk, title, selected: toolSelection(policy, capability) };
          });
          return { revision: policy.revision, catalogRevision: current.revision, targets };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.policy.update",
        plugin: "kernel",
        scope: "write",
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
    ),
    registry.register(
      defineCapability({
        name: "gateway.audit.list",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({}),
        output: z.array(z.object({ at: z.string(), entry: z.string(), capability: z.string(), code: z.string(), ms: z.number() })),
        handler: () => (gateway?.audit?.list() ?? []).slice().reverse(),
      }),
    ),
    registry.register(
      defineCapability({
        name: "gateway.audit.clear",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
        defaultExposed: false,
        input: z.object({}),
        output: z.object({ ok: z.literal(true) }),
        handler: () => (gateway?.audit?.clear(), { ok: true as const }),
      }),
    ),
    registry.register(
      defineCapability({
        // 测试台：不执行能力，只回答"以 CLI / MCP / HTTP 身份调用它，现在会不会被允许"
        name: "gateway.check",
        plugin: "kernel",
        scope: "admin",
        exposable: false,
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
            return { allowed: true, reason: cap.scope === "read" ? "允许调用" : "允许调用（写/执行类调用需要幂等键）" };
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
    ),
    registry.register(
      defineCapability({
        name: "capabilities.list",
        plugin: "kernel",
        scope: "read",
        exposable: false,
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
    ),
  ];
  return () => offs.forEach((o) => o());
}

import { SettingsSchema, mergeSettings, type Settings } from "@huhu/contracts";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NotificationStore } from "../notifications.js";

const NotificationDto = z.object({ id: z.string(), title: z.string(), module: z.string(), body: z.string().optional(), at: z.string(), read: z.boolean() });

/** 读取 settings.json；缺失或损坏时按默认值（原文件保留）。 */
export function readSettingsFile(settingsFile: string): Settings {
  try {
    return SettingsSchema.parse(existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {});
  } catch {
    return SettingsSchema.parse({});
  }
}

/** notifications.* 与 settings.*（kernel 能力，仅桌面可用）。 */
export function registerNotificationAndSettings(registry: CapabilityRegistry, store: NotificationStore, settingsFile: string): () => void {
  const desktop = { plugin: "kernel", exposable: false, defaultExposed: false } as const;
  const read = (): Settings => readSettingsFile(settingsFile);
  const offs = [
    registry.register(
      defineCapability({
        name: "notifications.list",
        ...desktop,
        scope: "read",
        input: z.object({ unreadOnly: z.boolean().optional(), module: z.string().optional() }),
        output: z.array(NotificationDto),
        handler: (_c, i) => store.list({ ...(i.unreadOnly ? { unreadOnly: true } : {}), ...(i.module ? { module: i.module } : {}) }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "notifications.markRead",
        ...desktop,
        scope: "write",
        input: z.object({ ids: z.union([z.array(z.string()), z.literal("all")]) }),
        output: z.object({ changed: z.number() }),
        handler: (_c, i) => ({ changed: store.markRead(i.ids) }),
      }),
    ),
    registry.register(
      defineCapability({ name: "notifications.delete", ...desktop, scope: "write", input: z.object({ ids: z.array(z.string()).min(1) }), output: z.object({ changed: z.number() }), handler: (_c, i) => ({ changed: store.delete(i.ids) }) }),
    ),
    registry.register(defineCapability({ name: "notifications.clearRead", ...desktop, scope: "write", input: z.object({}), output: z.object({ changed: z.number() }), handler: () => ({ changed: store.clearRead() }) })),
    registry.register(defineCapability({ name: "settings.get", ...desktop, scope: "read", input: z.object({}), output: SettingsSchema, handler: () => read() })),
    registry.register(
      defineCapability({
        name: "settings.update",
        ...desktop,
        scope: "write",
        input: z.object({ patch: z.record(z.string(), z.unknown()) }),
        output: SettingsSchema,
        handler: (_c, i) => {
          const next = mergeSettings(read(), i.patch);
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
          return next;
        },
      }),
    ),
  ];
  return () => offs.forEach((o) => o());
}
