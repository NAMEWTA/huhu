import { errors, toJsonSchema } from "@huhu/contracts";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";
import type { PluginManager } from "../plugin-manager.js";

const PluginInfo = z.object({
  id: z.string(), title: z.string(), description: z.string(), version: z.string(), origin: z.string(),
  state: z.enum(["active", "disabled", "failed"]), error: z.string().optional(), dependsOn: z.array(z.string()), permissions: z.array(z.string()),
});

/** 注册内核的插件与能力目录能力（interfaces.md §2：plugins.*、capabilities.list）。 */
export function registerSystemCapabilities(
  registry: CapabilityRegistry,
  plugins: PluginManager,
  exposure: { isExposed(name: string): boolean; set?(name: string, exposed: boolean): void; setPluginEnabled?(id: string, enabled: boolean): void },
  gateway?: { tokens: { list(): { id: string; name: string; createdAt: string }[]; create(name: string): { id: string; token: string }; revoke(id: string): boolean } },
): () => void {
  const offs = [
    registry.register(defineCapability({
      name: "plugins.list", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true, input: z.object({}), output: z.array(PluginInfo),
      handler: () => plugins.list().map((p) => ({ id: p.id, title: p.manifest.title, description: p.manifest.description, version: p.manifest.version, origin: p.manifest.origin, state: p.state, ...(p.error ? { error: p.error } : {}), dependsOn: p.manifest.dependsOn, permissions: p.manifest.permissions })),
    })),
    registry.register(defineCapability({
      name: "plugins.setEnabled", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false,
      input: z.object({ id: z.string(), enabled: z.boolean() }), output: z.object({ state: z.string(), alsoDisabled: z.array(z.string()) }),
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
    })),
    registry.register(defineCapability({
      name: "gateway.tokens.list", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false, input: z.object({}),
      output: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })), handler: () => gateway?.tokens.list() ?? [],
    })),
    registry.register(defineCapability({
      name: "gateway.tokens.create", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false, input: z.object({ name: z.string().min(1).max(60) }),
      output: z.object({ id: z.string(), token: z.string() }),
      handler: (_c, i) => { if (!gateway) throw errors.invalidInput("HTTP 服务未启用"); return gateway.tokens.create(i.name); },
    })),
    registry.register(defineCapability({
      name: "gateway.tokens.revoke", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false, input: z.object({ id: z.string() }),
      output: z.object({ revoked: z.boolean() }), handler: (_c, i) => ({ revoked: gateway?.tokens.revoke(i.id) ?? false }),
    })),
    registry.register(defineCapability({
      name: "gateway.update", plugin: "kernel", scope: "admin", exposable: false, defaultExposed: false,
      input: z.object({ capability: z.string(), exposed: z.boolean() }), output: z.object({ exposed: z.boolean() }),
      handler: (_c, i) => {
        const cap = registry.get(i.capability);
        if (!cap) throw errors.capabilityNotFound(i.capability);
        // exposable:false 的能力（保险箱明文、Agent/SSH 执行等）永远不能开放
        if (i.exposed && !cap.exposable) throw errors.invalidInput(`${i.capability} 不允许对外开放`);
        exposure.set?.(i.capability, i.exposed);
        return { exposed: i.exposed };
      },
    })),
    registry.register(defineCapability({
      name: "capabilities.list", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true, input: z.object({}),
      output: z.array(z.object({ name: z.string(), plugin: z.string(), scope: z.string(), exposable: z.boolean(), exposed: z.boolean(), input: z.unknown(), output: z.unknown() })),
      handler: () => registry.list().map((c) => ({ name: c.name, plugin: c.plugin, scope: c.scope, exposable: c.exposable, exposed: c.exposable && exposure.isExposed(c.name), input: toJsonSchema(c.input), output: toJsonSchema(c.output) })),
    })),
  ];
  return () => offs.forEach((o) => o());
}

import { SettingsSchema, mergeSettings, type Settings } from "@huhu/contracts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NotificationStore } from "../notifications.js";

const NotificationDto = z.object({ id: z.string(), title: z.string(), module: z.string(), at: z.string(), read: z.boolean() });

/** notifications.* 与 settings.*（kernel 能力，仅桌面可用）。 */
export function registerNotificationAndSettings(registry: CapabilityRegistry, store: NotificationStore, settingsFile: string): () => void {
  const desktop = { plugin: "kernel", exposable: false, defaultExposed: false } as const;
  const read = (): Settings => {
    try {
      return SettingsSchema.parse(existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {});
    } catch {
      return SettingsSchema.parse({}); // 损坏的文件按默认值启动（原文件保留，由调用方备份）
    }
  };
  const offs = [
    registry.register(defineCapability({ name: "notifications.list", ...desktop, scope: "read", input: z.object({ unreadOnly: z.boolean().optional(), module: z.string().optional() }), output: z.array(NotificationDto), handler: (_c, i) => store.list({ ...(i.unreadOnly ? { unreadOnly: true } : {}), ...(i.module ? { module: i.module } : {}) }) })),
    registry.register(defineCapability({ name: "notifications.markRead", ...desktop, scope: "write", input: z.object({ ids: z.union([z.array(z.string()), z.literal("all")]) }), output: z.object({ changed: z.number() }), handler: (_c, i) => ({ changed: store.markRead(i.ids) }) })),
    registry.register(defineCapability({ name: "notifications.delete", ...desktop, scope: "write", input: z.object({ ids: z.array(z.string()).min(1) }), output: z.object({ changed: z.number() }), handler: (_c, i) => ({ changed: store.delete(i.ids) }) })),
    registry.register(defineCapability({ name: "notifications.clearRead", ...desktop, scope: "write", input: z.object({}), output: z.object({ changed: z.number() }), handler: () => ({ changed: store.clearRead() }) })),
    registry.register(defineCapability({ name: "settings.get", ...desktop, scope: "read", input: z.object({}), output: SettingsSchema, handler: () => read() })),
    registry.register(defineCapability({
      name: "settings.update", ...desktop, scope: "write", input: z.object({ patch: z.record(z.string(), z.unknown()) }), output: SettingsSchema,
      handler: (_c, i) => {
        const next = mergeSettings(read(), i.patch);
        mkdirSync(path.dirname(settingsFile), { recursive: true });
        writeFileSync(settingsFile, JSON.stringify(next, null, 2));
        return next;
      },
    })),
  ];
  return () => offs.forEach((o) => o());
}
