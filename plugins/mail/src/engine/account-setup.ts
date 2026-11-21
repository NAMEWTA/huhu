import { mailActor, mailRequestId, mailTool, requireMailCaller } from "./tool-access.js";
import { randomUUID } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { accountSettingsSchema, mailFolderSchema } from "./account-definition.js";
import { accountVersion } from "./account-removals.js";
import type { MailAccountDraft, openMailAccounts } from "./accounts.js";
import { MailAccountError, type MailAccountErrorCode } from "./discovery.js";

const setupKey = z.strictObject({ setupId: z.uuidv4() });
import type { MailIntents } from "./tool-intents.js";

const setupFolders = z.array(mailFolderSchema.extend({ selectable: z.boolean(), selected: z.boolean() }));
const passwordInput = z.string().min(1).max(4096);

const messages = {
  "invalid-settings": "请检查邮箱地址、认证方式和服务器设置。",
  "credential-required": "请输入邮箱凭据。",
  "oauth-required": "此账号需要 OAuth 授权。",
  "discovery-stale": "当前配置已变更，请重新测试连接。",
  "inbox-required": "请至少选择 INBOX。",
  "saved-folders-unavailable": "先前选定的目录已无法同步，邮箱配置和凭据仍保留。",
  "invalid-selection": "请选择已发现且可同步的目录。",
  "discovery-required": "请先测试连接。",
  "draft-busy": "邮箱正在保存，请稍后查看账号列表。",
  "draft-closed": "邮箱设置已结束，请重新测试连接。",
  network: "无法连接 IMAP 服务器，请检查主机、端口和网络。",
  timeout: "连接 IMAP 服务器超时，请检查网络后重试。",
  tls: "IMAP 加密连接验证失败，请检查服务器和证书。",
  authentication: "邮箱认证失败，请检查地址和凭据。",
  "folder-list": "无法读取 IMAP 目录，请检查服务器设置。",
  cancelled: "邮箱连接测试已取消。",
} satisfies Partial<Record<MailAccountErrorCode, string>>;

function setupError(error: unknown, fallback: string): never {
  if (error instanceof MailAccountError) {
    const message = messages[error.code as keyof typeof messages] ?? fallback;
    throw new HuhuError("INVALID_INPUT", message, { details: { reason: error.code } });
  }
  if (error instanceof HuhuError) throw error;
  if (error instanceof CredentialError && error.code === "conflict") throw new HuhuError("VERSION_CONFLICT", "邮箱配置已更新，请关闭后重新打开该账号。");
  if (error instanceof CredentialError && error.code === "cancelled") throw new HuhuError("INVALID_INPUT", "邮箱设置已取消。", { details: { reason: "cancelled" } });
  throw new HuhuError("INTERNAL", fallback);
}

type Setup = {
  draft: MailAccountDraft;
  actor: string;
  folders?: z.infer<typeof setupFolders>;
  repair: boolean;
  cancel: AbortController;
  expiry: ReturnType<typeof setTimeout>;
  save?: { selection: string; result: Promise<{ accountId: string }> };
  saved?: boolean;
  detachAccount?: () => void;
};

export const accountSetupDescriptors = {
  accountsTestConnection: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.accounts.testConnection",
    title: "测试邮箱连接",
    description: "测试指定邮箱连接并生成短时配置会话。",
    risk: "high",
    scope: "execute",
    idempotency: "handler",
    input: z.union([z.strictObject({ settings: accountSettingsSchema, password: passwordInput, requestId: mailRequestId }), accountVersion.extend({ password: passwordInput, requestId: mailRequestId })]),
    output: setupKey.extend({ folders: setupFolders }),
    desktopOnly: true,
  }),
  accountsSave: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.accounts.save",
    title: "保存邮箱",
    description: "保存已测试的邮箱和选定目录。",
    risk: "high",
    scope: "admin",
    idempotency: "handler",
    input: setupKey.extend({ folders: z.array(z.string().min(1)).min(1).optional() }),
    output: z.strictObject({ accountId: z.string() }),
    desktopOnly: true,
  }),
  accountsCancelSetup: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.accounts.cancelSetup",
    title: "取消邮箱配置",
    description: "关闭当前调用者的短时配置会话。",
    risk: "normal",
    scope: "write",
    idempotency: "handler",
    input: setupKey,
    output: z.strictObject({}),
    desktopOnly: true,
  }),
  accountsRename: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.accounts.rename",
    title: "更改邮箱名称",
    description: "按当前版本更改指定邮箱名称。",
    risk: "normal",
    scope: "write",
    idempotency: "handler",
    input: accountVersion.extend({ label: z.string().trim().max(80) }),
    output: z.strictObject({ accountId: z.string(), revision: z.string() }),
    desktopOnly: true,
  }),
};

export function registerAccountSetup(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, serializeAddress: <T>(address: string, run: () => Promise<T>) => Promise<T>, lifetime: AbortSignal, once: MailIntents) {
  const pending = new Map<string, Setup>();
  const savingAddresses = new Set<string>();

  function release(id: string, setup: Setup) {
    if (pending.get(id) !== setup) return;
    clearTimeout(setup.expiry);
    pending.delete(id);
    setup.detachAccount?.();
    setup.cancel.abort();
    const close = () => setup.draft.close();
    if (setup.save && !setup.saved) void setup.save.result.then(close, close);
    else close();
  }

  function authorize(caller: string, name: string) {
    requireMailCaller(caller, name, true);
    lifetime.throwIfAborted();
    api.vault.files.assertWritable();
    if (!accounts) throw new HuhuError("INTERNAL", "此主机的本机邮箱凭据存储不可用。");
    return accounts;
  }

  function ownSetup(setupId: string, actor: string) {
    const setup = pending.get(setupId);
    if (setup?.actor !== actor) throw new HuhuError("NOT_FOUND", "连接测试已失效，请重新测试。", { details: { reason: "discovery-required" } });
    return setup;
  }

  api.defineCapability(
    bindCapability(accountSetupDescriptors.accountsTestConnection, async (context, input) => {
      const { caller, signal } = context;
      const name = accountSetupDescriptors.accountsTestConnection.name;
      const owner = authorize(caller, name);
      const actor = mailActor(context, name);
      return once(
        context,
        name,
        input.requestId,
        input,
        async () => {
          signal.throwIfAborted();
          if ([...pending.values()].filter((setup) => !setup.saved).length >= 16) throw new HuhuError("INVALID_INPUT", "邮箱设置会话已满，请取消旧的连接测试后重试。");
          const repair = "accountId" in input;
          const draft = repair ? owner.beginRepair(input, input.password) : owner.begin(input.settings, input.password);
          const setupId = randomUUID();
          const expiry = setTimeout(() => {
            const setup = pending.get(setupId);
            if (setup) release(setupId, setup);
          }, 5 * 60_000);
          expiry.unref();
          const setup: Setup = { draft, actor, expiry, repair, cancel: new AbortController() };
          pending.set(setupId, setup);
          const abort = () => release(setupId, setup);
          if (repair) {
            const generation = owner.signal(input.accountId);
            generation.addEventListener("abort", abort, { once: true });
            setup.detachAccount = () => generation.removeEventListener("abort", abort);
          }
          signal.addEventListener("abort", abort, { once: true });
          try {
            const folders = await draft.testConnection();
            signal.throwIfAborted();
            lifetime.throwIfAborted();
            setup.folders = folders;
            return { setupId, folders };
          } catch (error) {
            release(setupId, setup);
            setupError(error, "邮箱连接测试失败。");
          } finally {
            signal.removeEventListener("abort", abort);
          }
        },
        ({ setupId }) => setupId,
        (setupId) => {
          const { folders } = ownSetup(setupId, actor);
          if (!folders) throw errors.notFound("邮箱配置");
          return { setupId, folders };
        },
      );
    }),
  );

  api.defineCapability(
    bindCapability(accountSetupDescriptors.accountsSave, async (context, input) => {
      const { caller, signal } = context;
      const { setupId, folders } = input;
      const name = accountSetupDescriptors.accountsSave.name;
      const owner = authorize(caller, name);
      const actor = mailActor(context, name);
      return once(
        context,
        name,
        setupId,
        input,
        async () => {
          signal.throwIfAborted();
          const setup = ownSetup(setupId, actor);
          if (setup.repair === (folders !== undefined)) throw errors.invalidInput("邮箱设置会话与保存参数不匹配。");
          const selection = JSON.stringify([...new Set(folders)].sort());
          if (setup.save) {
            if (setup.save.selection !== selection) throw errors.idempotencyMismatch();
            return setup.save.result;
          }
          if (folders) {
            try {
              setup.draft.selectFolders(folders);
            } catch (error) {
              setupError(error, "保存邮箱失败。");
            }
          }
          const cancelled = AbortSignal.any([signal, lifetime, setup.cancel.signal]);
          const result = setup.repair
            ? setup.draft.save(cancelled)
            : (async () => {
                const { email } = setup.draft.snapshot().settings;
                const address = email.trim().toLowerCase();
                if (savingAddresses.has(address)) throw new HuhuError("INVALID_INPUT", "此邮箱正在保存，请稍后查看邮箱列表。");
                savingAddresses.add(address);
                try {
                  return await serializeAddress(address, async () => {
                    if ((await owner.list()).some(({ definition }) => definition.settings.email.toLowerCase() === address)) {
                      throw new HuhuError("NAME_CONFLICT", "该邮箱已存在于此 Vault。");
                    }
                    cancelled.throwIfAborted();
                    return setup.draft.save(cancelled);
                  });
                } finally {
                  savingAddresses.delete(address);
                }
              })();
          const receipt = result.then(
            ({ accountId }) => {
              setup.saved = true;
              return { accountId };
            },
            (error: unknown) => {
              delete setup.save;
              setupError(error, "保存邮箱失败，请检查本机凭据存储后重试。");
            },
          );
          setup.save = { selection, result: receipt };
          return receipt;
        },
        ({ accountId }) => accountId,
        (accountId) => ({ accountId }),
      );
    }),
  );

  api.defineCapability(
    bindCapability(accountSetupDescriptors.accountsCancelSetup, (context, input) => {
      const { setupId } = input;
      const name = accountSetupDescriptors.accountsCancelSetup.name;
      authorize(context.caller, name);
      const actor = mailActor(context, name);
      const local = isWorkbenchCaller(context.caller);
      return once(
        context,
        name,
        setupId,
        input,
        () => {
          const setup = local ? pending.get(setupId) : ownSetup(setupId, actor);
          if (!local && setup?.save && !setup.saved) throw errors.invalidInput("邮箱正在保存，请等待保存结果。");
          if (setup) release(setupId, setup);
          return {};
        },
        () => null,
        () => ({}),
      );
    }),
  );
  api.defineCapability(
    bindCapability(accountSetupDescriptors.accountsRename, async (context, { label, ...target }) => {
      const { signal, caller } = context;
      const name = accountSetupDescriptors.accountsRename.name;
      const owner = authorize(caller, name);
      try {
        return await once(
          context,
          name,
          JSON.stringify([target.accountId, target.expectedRevision]),
          { label, ...target },
          () => owner.rename(target, label, AbortSignal.any([signal, lifetime])),
          (result) => result,
          (result) => result,
        );
      } catch (error) {
        setupError(error, "无法更改邮箱名称，请重试。");
      }
    }),
  );

  return async () => {
    const saving: Promise<unknown>[] = [];
    for (const [id, setup] of pending) {
      if (setup.save && !setup.saved) saving.push(setup.save.result);
      release(id, setup);
    }
    await Promise.allSettled(saving);
  };
}
