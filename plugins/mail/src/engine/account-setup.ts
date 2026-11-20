import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { accountSettingsSchema, mailFolderSchema } from "./account-definition.js";
import type { MailAccountDraft, openMailAccounts } from "./accounts.js";
import { MailAccountError, type MailAccountErrorCode } from "./discovery.js";

const setupKey = z.strictObject({ setupId: z.uuidv4() });
const workbenchSetup = { plugin: "mail", desktopOnly: true, exposable: false, defaultExposed: false } as const;

const messages = {
  "invalid-settings": "请检查邮箱地址、认证方式和服务器设置。",
  "credential-required": "请输入邮箱凭据。",
  "oauth-required": "此账号需要 OAuth 授权。",
  "discovery-stale": "当前配置已变更，请重新测试连接。",
  "inbox-required": "请至少选择 INBOX。",
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
  throw new HuhuError("INTERNAL", fallback);
}

type Setup = {
  draft: MailAccountDraft;
  expiry: ReturnType<typeof setTimeout>;
  save?: { selection: string; result: Promise<{ accountId: string }> };
  saved?: boolean;
};

export function registerAccountSetup(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, lifetime: AbortSignal) {
  const pending = new Map<string, Setup>();
  const savingAddresses = new Set<string>();

  function release(id: string, setup: Setup) {
    if (pending.get(id) !== setup) return;
    clearTimeout(setup.expiry);
    pending.delete(id);
    setup.draft.close();
  }

  function authorize(caller: string, name: string) {
    if (caller !== "desktop") throw errors.permissionDenied(name);
    lifetime.throwIfAborted();
    api.vault.files.assertWritable();
    if (!accounts) throw new HuhuError("INTERNAL", "此主机的本机邮箱凭据存储不可用。");
    return accounts;
  }

  api.defineCapability(
    defineCapability({
      ...workbenchSetup,
      name: "mail.accounts.testConnection",
      scope: "execute",
      // Connection testing is transient. Keep credential inputs out of the persistent idempotency store.
      idempotency: "handler",
      input: z.strictObject({ settings: accountSettingsSchema, password: z.string().min(1).max(4096) }),
      output: setupKey.extend({ folders: z.array(mailFolderSchema.extend({ selectable: z.boolean(), selected: z.boolean() })) }),
      handler: async ({ caller, signal }, { settings, password }) => {
        const owner = authorize(caller, "mail.accounts.testConnection");
        signal.throwIfAborted();
        if ([...pending.values()].filter((setup) => !setup.saved).length >= 16) throw new HuhuError("INVALID_INPUT", "邮箱设置会话已满，请取消旧的连接测试后重试。");
        const setupId = randomUUID();
        const draft = owner.begin(settings, password);
        const expiry = setTimeout(() => {
          const setup = pending.get(setupId);
          if (!setup) return;
          const expire = () => release(setupId, setup);
          if (setup.save) void setup.save.result.then(expire, expire);
          else expire();
        }, 5 * 60_000);
        expiry.unref();
        const setup = { draft, expiry };
        pending.set(setupId, setup);
        const abort = () => release(setupId, setup);
        signal.addEventListener("abort", abort, { once: true });
        try {
          const folders = await draft.testConnection();
          signal.throwIfAborted();
          lifetime.throwIfAborted();
          return { setupId, folders };
        } catch (error) {
          release(setupId, setup);
          setupError(error, "邮箱连接测试失败。");
        } finally {
          signal.removeEventListener("abort", abort);
        }
      },
    }),
  );

  api.defineCapability(
    defineCapability({
      ...workbenchSetup,
      name: "mail.accounts.save",
      scope: "write",
      idempotency: "handler",
      input: setupKey.extend({ folders: z.array(z.string().min(1)).min(1) }),
      output: z.strictObject({ accountId: z.string() }),
      handler: async ({ caller, signal }, { setupId, folders }) => {
        const owner = authorize(caller, "mail.accounts.save");
        signal.throwIfAborted();
        const setup = pending.get(setupId);
        if (!setup) throw new HuhuError("NOT_FOUND", "连接测试已失效，请重新测试。", { details: { reason: "discovery-required" } });
        const selection = JSON.stringify([...new Set(folders)].sort());
        if (setup.save) {
          if (setup.save.selection !== selection) throw errors.idempotencyMismatch();
          return setup.save.result;
        }
        try {
          setup.draft.selectFolders(folders);
          const { email } = setup.draft.snapshot().settings;
          const address = email.trim().toLowerCase();
          if (savingAddresses.has(address)) throw new HuhuError("INVALID_INPUT", "此邮箱正在保存，请稍后查看邮箱列表。");
          savingAddresses.add(address);
          const result = (async () => {
            try {
              if ((await owner.list()).some(({ definition }) => definition.settings.email.toLowerCase() === address)) {
                throw new HuhuError("NAME_CONFLICT", "该邮箱已存在于此 Vault。");
              }
              lifetime.throwIfAborted();
              const { accountId } = await setup.draft.save();
              setup.saved = true;
              return { accountId };
            } catch (error) {
              delete setup.save;
              setupError(error, "保存邮箱失败，请检查本机凭据存储后重试。");
            } finally {
              savingAddresses.delete(address);
              if (lifetime.aborted) release(setupId, setup);
            }
          })();
          setup.save = { selection, result };
          return await result;
        } catch (error) {
          setupError(error, "保存邮箱失败，请检查本机凭据存储后重试。");
        }
      },
    }),
  );

  api.defineCapability(
    defineCapability({
      ...workbenchSetup,
      name: "mail.accounts.cancelSetup",
      scope: "write",
      idempotency: "handler",
      input: setupKey,
      output: z.strictObject({}),
      handler: ({ caller }, { setupId }) => {
        authorize(caller, "mail.accounts.cancelSetup");
        const setup = pending.get(setupId);
        if (setup && (!setup.save || setup.saved)) release(setupId, setup);
        return {};
      },
    }),
  );

  return async () => {
    const saving: Promise<unknown>[] = [];
    for (const [id, setup] of pending) {
      if (setup.save && !setup.saved) saving.push(setup.save.result);
      else release(id, setup);
    }
    await Promise.allSettled(saving);
  };
}
