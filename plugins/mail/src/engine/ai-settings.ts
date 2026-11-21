import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapability, defineCapabilityDescriptor, ModuleCredentials, type CapabilityContext, type CapabilityDefinition, type CapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { MailAccountOwner } from "./accounts.js";
import { aiEndpoint, mailCompletion, type AiMessage, type AiResult } from "./ai-transport.js";

// This Mail-owned namespace has its own portable schema and machine binding.
// The "mail" owner continues to contain mailbox account definitions exclusively.
const ownerId = "mail.ai";
const entityId = "settings";
const purpose = "api-key";
const definition = z.strictObject({
  enabled: z.boolean(),
  endpoint: z
    .string()
    .max(2048)
    .refine((url) => aiEndpoint(url) === url),
  model: z.string().trim().min(1).max(256),
});
type Definition = z.infer<typeof definition>;
const state = z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"]);
const publicSettings = z.strictObject({
  available: z.boolean(),
  revision: z.uuidv4().nullable(),
  enabled: z.boolean(),
  endpoint: z.string(),
  model: z.string(),
  keyState: state,
});
export type MailAiSettings = z.infer<typeof publicSettings>;
const edit = z.strictObject({
  expectedRevision: z.uuidv4().nullable(),
  enabled: z.boolean(),
  endpoint: z.string().trim().max(2000),
  model: z.string().trim().max(256),
  key: z
    .union([
      z.strictObject({ action: z.literal("keep") }),
      z.strictObject({ action: z.literal("clear") }),
      z.strictObject({
        action: z.literal("replace"),
        value: z
          .string()
          .regex(/^[!-~]+$/)
          .max(4096),
      }),
    ])
    .optional(),
});
type Edit = z.infer<typeof edit>;
const common = { plugin: "mail", exposable: false, defaultExposed: false } as const;
const localEdit = { ...common, desktopOnly: true, idempotency: "handler" } as const;
export const mailAiCapabilityDescriptors = {
  get: defineCapabilityDescriptor({
    ...common,
    name: "mail.ai.getSettings",
    title: "邮件 AI 设置",
    description: "读取邮件 AI 已保存的目的地、模型及 Key 状态。",
    risk: "normal",
    scope: "read",
    input: z.strictObject({}),
    output: publicSettings,
  }),
  verify: defineCapabilityDescriptor({
    ...localEdit,
    name: "mail.ai.verifyConnection",
    title: "测试邮件 AI 连接",
    description: "只向所填服务提交合成消息。",
    risk: "high",
    scope: "execute",
    input: edit,
    output: z.strictObject({ verified: z.literal(true) }),
  }),
  save: defineCapabilityDescriptor({
    ...localEdit,
    name: "mail.ai.saveSettings",
    title: "保存邮件 AI 设置",
    description: "保存目的地、模型及明确的 Key 更新。",
    risk: "high",
    scope: "write",
    input: edit,
    output: publicSettings,
  }),
};

const ping: AiMessage[] = [{ role: "user", content: "Huhu Mail connection test. Reply with OK." }];
const feedback = {
  cancelled: "邮件 AI 请求已取消。",
  timeout: "邮件 AI 服务连接超时。请检查地址和网络后重试。",
  auth: "邮件 AI 服务拒绝认证。请检查 Key 或换用有效的 Key。",
  redirect: "邮件 AI 服务要求跳转。请填写最终服务地址。",
  response: "邮件 AI 服务未返回可用文本。请检查模型和 Chat Completions 地址。",
  network: "无法连接邮件 AI 服务。请检查地址、证书和网络。",
} satisfies Record<Extract<AiResult, { ok: false }>["reason"], string>;

function unwrap(result: AiResult) {
  if (result.ok) return result.text;
  throw new HuhuError("INVALID_INPUT", feedback[result.reason], { details: { reason: result.reason } });
}

function failure(error: unknown): never {
  if (error instanceof HuhuError) throw error;
  if (error instanceof CredentialError) {
    if (error.code === "conflict") throw new HuhuError("VERSION_CONFLICT", "邮件 AI 设置已更新。请核对当前设置后再试。");
    if (error.code === "cancelled") throw errors.invalidInput(feedback.cancelled);
    if (["unconfigured", "unbound", "missing-key", "corrupt", "unavailable", "locked", "denied"].includes(error.code)) {
      throw errors.invalidInput("当前 Vault 的邮件 AI Key 不可用。请在此主机替换 Key，或清除后重新配置。");
    }
  }
  throw new HuhuError("INTERNAL", "邮件 AI 设置存储不可用。请检查此 Vault 和本机凭据服务。");
}

export async function registerMailAi(api: HuhuApi, host: MailAccountOwner | undefined, lifetime: AbortSignal, catalogDeclared: boolean) {
  const store = host && new ModuleCredentials({ ...host, pluginId: ownerId, definition, targets: ({ endpoint }) => ({ [purpose]: endpoint }) });
  if (store && host && !host.vault.readOnly) await store.recover();
  const active = new Set<Promise<unknown>>();
  const portable = () => ModuleCredentials.readPortableDefinition(api.vault.files, ownerId, definition, entityId);

  function project(entry: Definition | undefined, revision: string | null, keyState: MailAiSettings["keyState"] = "unconfigured"): MailAiSettings {
    return { available: Boolean(store), revision, enabled: entry?.enabled ?? false, endpoint: entry?.endpoint ?? "", model: entry?.model ?? "", keyState };
  }

  async function read() {
    if (!store) {
      const entry = portable();
      return project(entry?.definition, entry?.revision ?? null, entry?.configured.includes(purpose) ? "temporarily-unavailable" : "unconfigured");
    }
    const entry = (await store.list()).find(({ entityId: id }) => id === entityId);
    return project(entry?.definition, entry?.revision ?? null, entry?.authState[purpose]);
  }

  function ensureRevision(expectedRevision: string | null) {
    const current = portable();
    if ((current?.revision ?? null) !== expectedRevision) failure(new CredentialError("conflict"));
    return current;
  }

  async function editSettings(input: Edit, save: boolean, signal: AbortSignal) {
    const owner = store;
    if (!owner) throw errors.invalidInput("此主机的邮件 AI 凭据存储不可用。");
    const current = ensureRevision(input.expectedRevision);
    const endpoint = aiEndpoint(input.endpoint);
    if (!endpoint) throw errors.invalidInput("请输入不含凭据、查询或片段的 HTTPS 地址，或真实回环 HTTP 地址。");
    if (!input.model) throw errors.invalidInput("请输入服务使用的模型名称。");
    const key = input.key ?? { action: "keep" };
    const https = endpoint.startsWith("https:");
    const hasStoredKey = current?.configured.includes(purpose) ?? false;
    if (!https && key.action === "replace") throw errors.invalidInput("回环 HTTP 只支持无 Key 调用。请选择清除 Key。");
    if (hasStoredKey && key.action === "keep" && current?.definition.endpoint !== endpoint) {
      throw errors.invalidInput("服务地址已变化。请替换 Key，或选择清除再保存。");
    }
    const next = { enabled: input.enabled && !(https && key.action === "clear"), endpoint, model: input.model };
    const verify = !save || next.enabled || key.action === "replace";

    async function check(value: string | undefined) {
      if (value && (next.endpoint.includes(value) || next.model.includes(value))) throw errors.invalidInput("服务地址和模型名称不能包含 Key。");
      if (!verify) return;
      if (https && !value) throw errors.invalidInput("HTTPS 服务需要 API Key。请选择替换并输入有效的 Key。");
      ensureRevision(input.expectedRevision);
      unwrap(await mailCompletion(next.endpoint, next.model, value, ping, signal));
    }
    if (key.action === "keep" && https && hasStoredKey && verify) {
      // ModuleCredentials wraps errors thrown by the callback. Keep provider feedback as data until it exits.
      const result = await owner.use(entityId, [purpose], async (_, values, revision) => {
        if (revision !== input.expectedRevision) return { conflict: true } as const;
        try {
          await check(values.get(purpose));
          return {} as const;
        } catch (error) {
          return { error };
        }
      });
      if (result.conflict) failure(new CredentialError("conflict"));
      if ("error" in result) throw result.error;
    } else {
      await check(key.action === "replace" ? key.value : undefined);
    }
    if (signal.aborted) throw errors.invalidInput(feedback.cancelled);
    ensureRevision(input.expectedRevision);
    if (!save) return;
    const saved = await owner.save({
      entityId,
      expectedRevision: input.expectedRevision,
      definition: next,
      actions: [key.action === "replace" ? { purpose, ...key, reconfigure: true } : { purpose, ...key }],
      signal,
    });
    if (!lifetime.aborted) api.events.publish("entity.changed", { kind: "mail-ai-settings", id: entityId, op: "updated" });
    return project(next, saved.revision, saved.authState[purpose]);
  }

  function run<T>(context: CapabilityContext, operation: (signal: AbortSignal) => Promise<T>) {
    const signal = AbortSignal.any([context.signal, lifetime]);
    if (signal.aborted) throw errors.invalidInput(feedback.cancelled);
    const task = operation(signal)
      .catch(failure)
      .finally(() => active.delete(task));
    active.add(task);
    return task;
  }

  function register<I, O>(descriptor: CapabilityDescriptor<I, O>, handler: CapabilityDefinition<NoInfer<I>, NoInfer<O>>["handler"]) {
    api.defineCapability(catalogDeclared ? bindCapability(descriptor, handler) : defineCapability({ ...descriptor, handler }));
  }

  register(mailAiCapabilityDescriptors.get, async ({ caller }) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(mailAiCapabilityDescriptors.get.name);
    return read().catch(failure);
  });
  register(mailAiCapabilityDescriptors.verify, (context, input) => {
    if (context.caller !== "desktop") throw errors.permissionDenied(mailAiCapabilityDescriptors.verify.name);
    api.vault.files.assertWritable();
    return run(context, async (signal) => {
      await editSettings(input, false, signal);
      return { verified: true as const };
    });
  });
  register(mailAiCapabilityDescriptors.save, (context, input) => {
    if (context.caller !== "desktop") throw errors.permissionDenied(mailAiCapabilityDescriptors.save.name);
    api.vault.files.assertWritable();
    return run(context, async (signal) => {
      const saved = await editSettings(input, true, signal);
      if (!saved) throw new HuhuError("INTERNAL", "无法确认邮件 AI 设置保存结果。");
      return saved;
    });
  });
  return () => Promise.allSettled(active);
}
