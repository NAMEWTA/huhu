import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import path from "node:path";
import { z } from "zod";
import { Safe, type ItemMeta } from "./safe.js";

export { Safe } from "./safe.js";

/** 其他插件通过 `api.service<SecretUse>("secretUse")` 使用。 */
export interface SecretUse {
  resolve(ref: string, ctx: { plugin: string; purpose: string }): string;
}

const Item = z.object({ id: z.string(), name: z.string(), type: z.enum(["password", "ssh-key", "token", "env"]), account: z.string(), allowedModules: z.array(z.string()), updatedAt: z.string() });
const Ok = z.object({ ok: z.literal(true) });

export function apply(ctx: Context, api: HuhuApi, opts: { now?: () => number; kdfParams?: { N: number; r: number; p: number } } = {}): Safe {
  const safe = new Safe({ dir: path.join(api.vault.files.root, ".huhu", "safe"), now: opts.now ?? Date.now, publish: (t, p) => api.events.publish(t, p), ...(opts.kdfParams ? { kdfParams: opts.kdfParams } : {}) });
  // Vault 关闭 / 插件停用：清零 DK
  ctx.effect(() => () => safe.lock("close"));
  api.provide("secretUse", { resolve: (ref, c) => safe.resolve(ref, c) } satisfies SecretUse);

  const desktopOnly = { exposable: false, defaultExposed: false } as const;
  api.defineCapability(def({ name: "safe.status", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({}), output: z.object({ initialized: z.boolean(), locked: z.boolean(), corrupt: z.boolean(), autoLockMinutes: z.number(), lockOnLeave: z.boolean(), cooldownSeconds: z.number() }), handler: () => safe.status() }));
  api.defineCapability(def({ name: "safe.setup", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({ password: z.string() }), output: Ok, handler: async (_c, i) => (await safe.setup(i.password), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.unlock", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({ password: z.string() }), output: Ok, handler: async (_c, i) => (await safe.unlock(i.password), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.lock", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({}), output: Ok, handler: () => (safe.lock("manual"), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.changePassword", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({ oldPassword: z.string(), newPassword: z.string() }), output: Ok, handler: async (_c, i) => (await safe.changePassword(i.oldPassword, i.newPassword), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.settings.update", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({ autoLockMinutes: z.number().optional(), lockOnLeave: z.boolean().optional() }), output: Ok, handler: (_c, i) => (safe.updateSettings({ ...(i.autoLockMinutes !== undefined ? { autoLockMinutes: i.autoLockMinutes } : {}), ...(i.lockOnLeave !== undefined ? { lockOnLeave: i.lockOnLeave } : {}) }), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.items.list", plugin: "safe", scope: "read", ...desktopOnly, input: z.object({}), output: z.array(Item), handler: () => safe.itemsList() }));
  api.defineCapability(def({
    name: "safe.items.save", plugin: "safe", scope: "write", ...desktopOnly,
    input: z.object({ id: z.string().optional(), name: z.string(), type: z.enum(["password", "ssh-key", "token", "env"]), account: z.string().optional(), allowedModules: z.array(z.string()).optional(), value: z.string().optional() }), output: Item,
    handler: (_c, i) => safe.itemSave({ name: i.name, type: i.type, ...(i.id ? { id: i.id } : {}), ...(i.account !== undefined ? { account: i.account } : {}), ...(i.allowedModules ? { allowedModules: i.allowedModules } : {}), ...(i.value !== undefined ? { value: i.value } : {}) }) satisfies ItemMeta,
  }));
  api.defineCapability(def({ name: "safe.items.delete", plugin: "safe", scope: "write", ...desktopOnly, input: z.object({ id: z.string() }), output: Ok, handler: (_c, i) => (safe.itemDelete(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "safe.items.reveal", plugin: "safe", scope: "admin", ...desktopOnly, input: z.object({ id: z.string(), purpose: z.enum(["reveal", "copy"]).default("reveal") }), output: z.object({ value: z.string() }), handler: (_c, i) => ({ value: safe.reveal(i.id, i.purpose) }) }));
  api.defineCapability(def({ name: "safe.audit.list", plugin: "safe", scope: "read", ...desktopOnly, input: z.object({ limit: z.number().int().min(1).max(1000).default(200) }), output: z.array(z.object({ at: z.string(), action: z.string(), itemId: z.string().nullable(), subject: z.string(), result: z.string() })), handler: (_c, i) => safe.auditList(i.limit) }));
  return safe;
}
