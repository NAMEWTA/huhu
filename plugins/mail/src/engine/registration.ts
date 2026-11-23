import path from "node:path";
import { isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, OperationReceipts, type Context, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { accountSettingsSchema, mailAccountDefinitionSchema, mailFolderSchema } from "./account-definition.js";
import { AccountRemovals, accountRemovalDescriptors, pendingRemoval, registerAccountRemoval } from "./account-removals.js";
import { openMailAccounts, type MailAccountOwner } from "./accounts.js";
import { accountSetupDescriptors, registerAccountSetup } from "./account-setup.js";
import { mailAiCapabilityDescriptors, registerMailAi } from "./ai-settings.js";
import { conversationsDescriptors, registerConversations } from "./conversations.js";
import { draftDescriptors, registerDrafts } from "./drafts.js";
import { accountMailboxSummaries, messageCacheDescriptors, registerMessageCache } from "./message-cache.js";
import type { MailOAuthRuntime } from "./oauth-provider.js";
import { mailOAuthCapabilityDescriptors, registerMailOAuth } from "./oauth-sessions.js";
import type { MailSmtpTransport } from "./smtp.js";
import { syncScheduleDescriptors, registerMailSyncSchedule, type MailSyncOptions } from "./sync-schedule.js";
import { makeMailSearchText } from "./search-text.js";
import { subsetDescriptors, registerMailSubset } from "./subset-data.js";
import { mailTool, requireMailCaller } from "./tool-access.js";
import { mailIntents } from "./tool-intents.js";
import { webAttachmentDescriptors } from "./web-attachments.js";

const { provider, email, label, auth, smtpEnabled } = accountSettingsSchema.shape;
const toolAccountDefinition = z.strictObject({
  settings: z.strictObject({ provider, email, label, auth, smtpEnabled }),
  folders: z.array(mailFolderSchema.pick({ path: true, name: true })),
});

const accountSummary = z.strictObject({
  accountId: z.string(),
  revision: z.string(),
  authState: z.record(z.string(), z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"])),
  definition: z.union([mailAccountDefinitionSchema, toolAccountDefinition]),
  mailbox: z.strictObject({ unread: z.int().nonnegative(), synced: z.boolean() }).nullable().optional(),
});

export const mailAccountsListDescriptor = defineCapabilityDescriptor({
  name: "mail.accounts.list",
  ...mailTool,
  title: "邮箱账号",
  description: "读取此 Vault 中已保存的邮箱配置及认证状态。",
  risk: "high",
  scope: "read",
  input: z.strictObject({ includeMailboxSummary: z.literal(true).optional() }),
  output: z.strictObject({ available: z.boolean(), accounts: z.array(accountSummary), pendingRemovals: z.array(pendingRemoval).optional() }),
});

export const mailCapabilityDescriptors = [
  mailAccountsListDescriptor,
  ...Object.values(accountRemovalDescriptors),
  ...Object.values(accountSetupDescriptors),
  ...Object.values(conversationsDescriptors),
  ...Object.values(draftDescriptors),
  ...Object.values(webAttachmentDescriptors),
  ...Object.values(mailAiCapabilityDescriptors),
  ...Object.values(mailOAuthCapabilityDescriptors),
  ...Object.values(messageCacheDescriptors),
  ...Object.values(subsetDescriptors),
  ...Object.values(syncScheduleDescriptors),
];

export async function apply(
  ctx: Context,
  api: HuhuApi,
  owner?: MailAccountOwner,
  transport?: MailSmtpTransport,
  syncOptions: MailSyncOptions = {},
  oauthRuntime?: MailOAuthRuntime,
  options: { aiCatalogDeclared?: boolean } = {},
): Promise<void> {
  const lifetime = new AbortController();
  const once = mailIntents(owner && !owner.vault.readOnly ? new OperationReceipts(path.join(owner.vault.runtimeDir, "mail-tool-intents.ndjson")) : undefined);
  const removals = new AccountRemovals(api.vault.files);
  const accounts = owner
    ? openMailAccounts(owner, undefined, removals, oauthRuntime, lifetime.signal, (id) => {
        api.events.publish("entity.changed", { kind: "mail-account", id, op: "updated" });
      })
    : undefined;
  if (accounts && owner && !owner.vault.readOnly) await accounts.recover();
  const drainSubset = await registerMailSubset(api, accounts, owner, removals, lifetime.signal, once);
  const withMailboxSummaries = accountMailboxSummaries(api.vault.files);
  api.defineCapability(
    bindCapability(mailAccountsListDescriptor, async ({ caller }, { includeMailboxSummary }) => {
      requireMailCaller(caller, mailAccountsListDescriptor.name);
      const rows = accounts ? await accounts.list() : [];
      const pending = caller === "desktop" ? removals.pending() : [];
      const visible = isWorkbenchCaller(caller)
        ? includeMailboxSummary
          ? await withMailboxSummaries(rows)
          : rows
        : rows.map(({ accountId, revision, authState, definition: { settings, folders } }) => {
            const { provider, email, label, auth, smtpEnabled } = settings;
            return {
              accountId,
              revision,
              authState,
              definition: { settings: { provider, email, label, auth, smtpEnabled }, folders: folders.map(({ path, name }) => ({ path, name })) },
            };
          });
      return { available: accounts !== undefined, accounts: visible, ...(pending.length && { pendingRemovals: pending }) };
    }),
  );
  const drainSetup = registerAccountSetup(api, accounts, removals.serializeAddress.bind(removals), lifetime.signal, once);
  const intents = owner && !owner.vault.readOnly ? { ledger: new OperationReceipts(path.join(owner.vault.runtimeDir, "mail-oauth-intents.ndjson")), vaultInstance: owner.localVaultInstanceId } : undefined;
  const drainOAuth = registerMailOAuth(api, accounts, oauthRuntime, lifetime.signal, intents);
  const drainAi = await registerMailAi(api, owner, lifetime.signal, options.aiCatalogDeclared === true, accounts, removals, once);
  const { drafts, outbox, drain: drainDrafts } = registerDrafts(api, accounts, lifetime.signal, transport, removals, once);
  const searchText = makeMailSearchText();
  const messages = registerMessageCache(api, accounts, lifetime.signal, removals, drafts, searchText, once, syncOptions.notify);
  const drainSync = registerMailSyncSchedule(api, accounts, messages, lifetime.signal, syncOptions, once);
  registerConversations(api, accounts, removals, lifetime.signal, messages, searchText);
  registerAccountRemoval(api, accounts, removals, drafts, outbox, messages, lifetime.signal);
  ctx.effect(() => async () => {
    lifetime.abort();
    await Promise.all([drainSetup(), drainDrafts(), messages.drain(), removals.drain(), drainSync(), drainOAuth(), drainAi(), drainSubset(), accounts?.drainOAuth()]);
  });
}
