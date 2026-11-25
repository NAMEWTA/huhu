import { errors, isWorkbenchCaller } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapability, defineCapabilityDescriptor, ExposureStore, toolSelection, type CapabilityContext, type CapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  CreateAccount,
  CreateEntry,
  CreateEntryReceipt,
  CreateTag,
  CreateTagReceipt,
  DeleteAccount,
  DeleteEntry,
  DeleteEntryReceipt,
  DeleteTag,
  EntryDetail,
  EntryIndex,
  GetEntry,
  ListEntries,
  RevealAccount,
  SafeCallerProof,
  SafeSession,
  TagList,
  TagReceipt,
  UpdateAccount,
  UpdateAccountReceipt,
  UpdateEntry,
  UpdateEntryReceipt,
  UpdateTag,
} from "./personal.js";
import { Safe, type SafeAccess } from "./safe.js";

export { Safe } from "./safe.js";
export { safeGitSnapshots, validateSafePackage, withSafePackageSnapshot } from "./store.js";

const Ok = z.strictObject({ ok: z.literal(true) });
const Empty = z.strictObject({});
const Lifecycle = z.strictObject({ session: SafeSession.optional() });
const Password = Lifecycle.extend({ password: z.string() });
const Status = z.strictObject({
  initialized: z.boolean(),
  locked: z.boolean(),
  corrupt: z.boolean(),
  corruptFile: z.enum(["keyring.json", "manifest.json"]).optional(),
  autoLockMinutes: z.number(),
  lockOnLeave: z.boolean(),
  cooldownSeconds: z.number(),
  instanceId: z.uuid(),
  generation: z.int().nonnegative(),
  callerProof: SafeCallerProof.optional(),
});

function tool<I, O>(name: string, title: string, scope: CapabilityDescriptor["scope"], input: z.ZodType<I>, output: z.ZodType<O>, options: { risk?: CapabilityDescriptor["risk"]; individualExposure?: true; exposable?: false } = {}) {
  return defineCapabilityDescriptor({
    name: `safe.${name}`,
    title,
    description: title,
    plugin: "safe",
    scope,
    input,
    output,
    risk: options.risk ?? (options.individualExposure || scope !== "read" ? "high" : "normal"),
    ...(options.individualExposure && { individualExposure: true }),
    exposable: options.exposable ?? true,
    defaultExposed: false,
    ...(scope === "write" && { idempotency: "handler" }),
  });
}

const caps = {
  createEntry: tool("entries.create", "新建保险箱条目", "write", CreateEntry, CreateEntryReceipt),
  updateEntry: tool("entries.update", "编辑保险箱条目", "write", UpdateEntry, UpdateEntryReceipt),
  listEntries: tool("entries.list", "列出保险箱条目索引", "read", ListEntries, EntryIndex),
  getEntry: tool("entries.get", "读取保险箱条目摘要", "read", GetEntry, EntryDetail),
  createAccount: tool("accounts.create", "向保险箱条目新增账号", "write", CreateAccount, UpdateAccountReceipt, { exposable: false }),
  updateAccount: tool("accounts.update", "编辑指定账号", "write", UpdateAccount, UpdateAccountReceipt),
  deleteAccount: tool("accounts.delete", "移除条目中的指定账号", "write", DeleteAccount, UpdateEntryReceipt),
  deleteEntry: tool("entries.delete", "删除整个条目及其账号", "write", DeleteEntry, DeleteEntryReceipt),
  reveal: tool("accounts.reveal", "显式查看指定账号的明文密码", "read", RevealAccount, z.strictObject({ password: z.string() }), { individualExposure: true }),
  listTags: tool("tags.list", "列出保险箱标签", "read", ListEntries, TagList),
  createTag: tool("tags.create", "新建保险箱标签", "write", CreateTag, CreateTagReceipt),
  updateTag: tool("tags.update", "编辑保险箱标签", "write", UpdateTag, TagReceipt),
  deleteTag: tool("tags.delete", "删除保险箱标签", "write", DeleteTag, TagReceipt),
  status: tool("status", "读取保险箱状态与会话代", "read", Empty, Status),
  setup: tool("setup", "设置保险箱主密码", "admin", Password, Ok),
  unlock: tool("unlock", "以主密码解锁保险箱", "admin", Password, Ok),
  lock: tool("lock", "锁定保险箱", "admin", Lifecycle.extend({ reason: z.literal("leave").optional() }), Ok),
  changePassword: tool("changePassword", "修改保险箱主密码", "admin", Lifecycle.extend({ oldPassword: z.string(), newPassword: z.string() }), Ok),
  settings: tool("settings.update", "修改保险箱锁定设置", "admin", Lifecycle.extend({ autoLockMinutes: z.number().optional(), lockOnLeave: z.boolean().optional() }), Ok),
  audit: tool(
    "audit.list",
    "读取保险箱访问记录",
    "read",
    Lifecycle.extend({ limit: z.number().int().min(1).max(1000).default(200) }),
    z.array(z.strictObject({ at: z.string(), action: z.string(), itemId: z.string().nullable(), subject: z.string(), result: z.string() })),
    { risk: "high" },
  ),
};

export const safeCapabilityDescriptors: readonly CapabilityDescriptor[] = Object.values(caps);

export function apply(
  ctx: Context,
  api: HuhuApi,
  opts: {
    now?: () => number;
    kdfParams?: { N: number; r: number; p: number };
    catalogDeclared?: true;
  } = {},
): Safe {
  const safe = new Safe({ dir: path.join(api.vault.files.root, ".huhu", "safe"), files: api.vault.files, now: opts.now ?? Date.now, publish: (t, p) => api.events.publish(t, p), ...(opts.kdfParams ? { kdfParams: opts.kdfParams } : {}) });
  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  const proofKey = randomBytes(32);
  const proof = (context: CapabilityContext, { instanceId, generation }: SafeSession) =>
    createHmac("sha256", proofKey)
      .update(JSON.stringify([context.caller, context.subject ?? context.caller, instanceId, generation]))
      .digest();
  api.events.subscribe((event) => {
    if (event.type === "engine.closing") safe.lock("close");
  });
  ctx.effect(() => () => {
    proofKey.fill(0);
    safe.lock("close");
  });

  function register<I, O>(descriptor: CapabilityDescriptor<I, O>, run: (access: SafeAccess, input: I, context: CapabilityContext) => O | Promise<O>, recheck?: (context: CapabilityContext, input: I) => void) {
    const handler = async (context: CapabilityContext, input: I) => {
      const external = !isWorkbenchCaller(context.caller);
      const access: SafeAccess = {
        subject: context.caller.startsWith("web:") ? "web" : context.caller,
        check() {
          context.signal.throwIfAborted();
          if (!external) return;
          if (!["cli", "mcp", "http"].includes(context.caller)) throw errors.permissionDenied(descriptor.name);
          if (!descriptor.exposable || toolSelection(exposure.snapshot(), descriptor.name) !== true) throw errors.capabilityNotExposed(descriptor.name);
        },
      };
      access.check();
      const data = await run(access, input, context);
      access.check();
      recheck?.(context, input);
      return data;
    };
    if (opts.catalogDeclared) {
      api.defineCapability(bindCapability(descriptor, handler));
    } else {
      // The old registry infers risk from scope. Keep reveal out of its bulk read selection.
      const scope = descriptor.name === caps.reveal.name ? "admin" : descriptor.scope;
      api.defineCapability(defineCapability({ ...descriptor, scope, handler }));
    }
  }

  function checkSession(context: CapabilityContext, session: SafeSession | undefined, unlocked: boolean) {
    if (context.caller !== "desktop" && !session) throw errors.invalidInput("需要当前 Vault 的保险箱会话代，请先读取保险箱状态");
    safe.assertSession(session, unlocked);
    if (!session) return;
    if (!isWorkbenchCaller(context.caller) || session.callerProof) {
      if (!session.callerProof || !timingSafeEqual(Buffer.from(session.callerProof, "hex"), proof(context, session))) throw errors.permissionDenied("保险箱会话不属于当前工具身份");
    }
  }

  function personal<I extends { session: SafeSession }, O>(descriptor: CapabilityDescriptor<I, O>, run: (access: SafeAccess, input: I) => O | Promise<O>) {
    const check = (context: CapabilityContext, input: I) => checkSession(context, input.session, true);
    register(
      descriptor,
      (access, input, context) => {
        check(context, input);
        return run(access, input);
      },
      check,
    );
  }

  personal(caps.createEntry, (access, input) => safe.createEntry(input, access));
  personal(caps.updateEntry, (access, input) => safe.updateEntry(input, access));
  personal(caps.listEntries, (access, input) => safe.listEntries(input.session, access));
  personal(caps.getEntry, (access, input) => safe.getEntry(input.session, input.entryId, access));
  personal(caps.createAccount, (access, input) => safe.createAccount(input, access));
  personal(caps.updateAccount, (access, input) => safe.updateAccount(input, access));
  personal(caps.deleteAccount, (access, input) => safe.deleteAccount(input, access));
  personal(caps.deleteEntry, (access, input) => safe.deleteEntry(input, access));
  personal(caps.reveal, (access, input) => safe.revealAccount(input.session, input.entryId, input.accountId, access));
  personal(caps.listTags, (access, input) => safe.listTags(input.session, access));
  personal(caps.createTag, (access, input) => safe.createTag(input, access));
  personal(caps.updateTag, (access, input) => safe.updateTag(input, access));
  personal(caps.deleteTag, (access, input) => safe.deleteTag(input, access));

  register(caps.status, (_access, _input, context) => {
    safe.assertSession();
    const state = safe.status();
    return isWorkbenchCaller(context.caller) ? state : { ...state, callerProof: proof(context, state).toString("hex") };
  });
  register(caps.setup, async (access, input, context) => {
    checkSession(context, input.session, false);
    await safe.setup(input.password, access);
    return { ok: true };
  });
  register(caps.unlock, async (access, input, context) => {
    checkSession(context, input.session, false);
    await safe.unlock(input.password, access);
    return { ok: true };
  });
  register(caps.lock, (access, input, context) => {
    checkSession(context, input.session, false);
    safe.lock(input.reason, access.subject);
    return { ok: true };
  });
  register(caps.changePassword, async (access, input, context) => {
    checkSession(context, input.session, true);
    await safe.changePassword(input.oldPassword, input.newPassword, access);
    return { ok: true };
  });
  register(caps.settings, async (access, input, context) => {
    checkSession(context, input.session, true);
    const { autoLockMinutes, lockOnLeave } = input;
    await safe.updateSettings({ ...(autoLockMinutes !== undefined && { autoLockMinutes }), ...(lockOnLeave !== undefined && { lockOnLeave }) }, access);
    return { ok: true };
  });
  const checkAudit = (context: CapabilityContext, input: z.infer<typeof caps.audit.input>) => {
    if (!isWorkbenchCaller(context.caller) || input.session) checkSession(context, input.session, false);
  };
  register(
    caps.audit,
    (_access, input, context) => {
      checkAudit(context, input);
      return safe.auditList(input.limit);
    },
    checkAudit,
  );
  return safe;
}
