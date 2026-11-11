import { errors, toJsonSchema } from "@huhu/contracts";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";
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
});

/** 注册内核的插件与能力目录能力（interfaces.md §2：plugins.*、capabilities.list）。 */
export function registerSystemCapabilities(
  registry: CapabilityRegistry,
  plugins: PluginManager,
  exposure: { isExposed(name: string): boolean; set?(name: string, exposed: boolean): void; setPluginEnabled?(id: string, enabled: boolean): void },
  gateway?: {
    tokens: {
      list(): { id: string; name: string; createdAt: string }[];
      create(name: string): { id: string; token: string };
      revoke(id: string): boolean;
      mcp(): { enabled: boolean; transport: "stdio" | "http" };
      setMcp(c: { enabled: boolean; transport: "stdio" | "http" }): void;
    };
  },
): () => void {
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
        output: z.object({ mcp: z.object({ enabled: z.boolean(), transport: z.enum(["stdio", "http"]) }), tokens: z.number(), exposure: z.record(z.string(), z.boolean()) }),
        handler: () => ({ mcp: gateway?.tokens.mcp() ?? { enabled: false, transport: "stdio" as const }, tokens: gateway?.tokens.list().length ?? 0, exposure: {} }),
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
        output: z.object({ exposed: z.boolean() }),
        handler: (_c, i) => {
          const cap = registry.get(i.capability);
          if (!cap) throw errors.capabilityNotFound(i.capability);
          // exposable:false 的能力（保险箱明文、Agent/SSH 执行等）永远不能开放
          if (i.exposed && !cap.exposable) throw errors.invalidInput(`${i.capability} 不允许对外开放`);
          exposure.set?.(i.capability, i.exposed);
          return { exposed: i.exposed };
        },
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
        output: z.object({ found: z.boolean(), scope: z.string().nullable(), identities: z.array(z.object({ identity: z.enum(["cli", "mcp", "http"]), allowed: z.boolean(), reason: z.string() })) }),
        handler: (_c, i) => {
          const cap = registry.get(i.capability);
          const verdict = (): { allowed: boolean; reason: string } => {
            if (!cap) return { allowed: false, reason: "能力不存在，或所属插件未启用" };
            if (!cap.exposable) return { allowed: false, reason: "该能力永不对外开放" };
            if (!exposure.isExposed(cap.name)) return { allowed: false, reason: "尚未开放：先在上面打开它的开关" };
            return { allowed: true, reason: cap.scope === "read" ? "允许调用" : "允许调用（写/执行类调用需要幂等键）" };
          };
          const v = verdict();
          return { found: !!cap, scope: cap?.scope ?? null, identities: (["cli", "mcp", "http"] as const).map((identity) => ({ identity, ...v })) };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "capabilities.list",
        plugin: "kernel",
        scope: "read",
        exposable: true,
        defaultExposed: true,
        input: z.object({}),
        output: z.array(z.object({ name: z.string(), plugin: z.string(), scope: z.string(), exposable: z.boolean(), exposed: z.boolean(), input: z.unknown(), output: z.unknown() })),
        handler: () =>
          registry.list().map((c) => ({ name: c.name, plugin: c.plugin, scope: c.scope, exposable: c.exposable, exposed: c.exposable && exposure.isExposed(c.name), input: toJsonSchema(c.input), output: toJsonSchema(c.output) })),
      }),
    ),
  ];
  return () => offs.forEach((o) => o());
}

import { SettingsSchema, mergeSettings, type Settings } from "@huhu/contracts";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NotificationStore } from "../notifications.js";

const NotificationDto = z.object({ id: z.string(), title: z.string(), module: z.string(), at: z.string(), read: z.boolean() });

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
