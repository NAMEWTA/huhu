import path from "node:path";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, OperationReceipts, type Context, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { mailAccountDefinitionSchema } from "./account-definition.js";
import { AccountRemovals, pendingRemoval, registerAccountRemoval } from "./account-removals.js";
import { openMailAccounts, type MailAccountOwner } from "./accounts.js";
import { registerAccountSetup } from "./account-setup.js";
import { registerConversations } from "./conversations.js";
import { registerDrafts } from "./drafts.js";
import { registerMessageCache } from "./message-cache.js";
import type { MailOAuthRuntime } from "./oauth-provider.js";
import { registerMailOAuth } from "./oauth-sessions.js";
import type { MailSmtpTransport } from "./smtp.js";
import { registerMailSyncSchedule, type MailSyncOptions } from "./sync-schedule.js";
import { makeMailSearchText } from "./search-text.js";
import { registerMailSubset } from "./subset-data.js";

const accountSummary = z.strictObject({
  accountId: z.string(),
  revision: z.string(),
  authState: z.record(z.string(), z.enum(["unconfigured", "configured", "temporarily-unavailable", "needs-reconfiguration", "corrupt"])),
  definition: mailAccountDefinitionSchema,
});

export const mailAccountsListDescriptor = defineCapabilityDescriptor({
  name: "mail.accounts.list",
  plugin: "mail",
  title: "邮箱账号",
  description: "读取此 Vault 中已保存的邮箱配置及认证状态。",
  risk: "normal",
  scope: "read",
  exposable: false,
  defaultExposed: false,
  input: z.strictObject({}),
  output: z.strictObject({ available: z.boolean(), accounts: z.array(accountSummary), pendingRemovals: z.array(pendingRemoval).optional() }),
});

export async function apply(ctx: Context, api: HuhuApi, owner?: MailAccountOwner, transport?: MailSmtpTransport, syncOptions: MailSyncOptions = {}, oauthRuntime?: MailOAuthRuntime): Promise<void> {
  const lifetime = new AbortController();
  const removals = new AccountRemovals(api.vault.files);
  const accounts = owner ? openMailAccounts(owner, undefined, removals, oauthRuntime, lifetime.signal) : undefined;
  if (accounts && owner && !owner.vault.readOnly) await accounts.recover();
  const drainSubset = await registerMailSubset(api, accounts, owner, removals, lifetime.signal);
  api.defineCapability(
    bindCapability(mailAccountsListDescriptor, async ({ caller }) => {
      if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(mailAccountsListDescriptor.name);
      const rows = accounts ? await accounts.list() : [];
      const pending = caller === "desktop" ? removals.pending() : [];
      return { available: accounts !== undefined, accounts: rows, ...(pending.length && { pendingRemovals: pending }) };
    }),
  );
  const drainSetup = registerAccountSetup(api, accounts, removals.serializeAddress.bind(removals), lifetime.signal);
  const intents = owner && !owner.vault.readOnly ? { ledger: new OperationReceipts(path.join(owner.vault.runtimeDir, "mail-oauth-intents.ndjson")), vaultInstance: owner.localVaultInstanceId } : undefined;
  const drainOAuth = registerMailOAuth(api, accounts, oauthRuntime, lifetime.signal, intents);
  const { drafts, outbox, drain: drainDrafts } = registerDrafts(api, accounts, lifetime.signal, transport, removals);
  const searchText = makeMailSearchText();
  const messages = registerMessageCache(api, accounts, lifetime.signal, removals, drafts, searchText, syncOptions.notify);
  const drainSync = registerMailSyncSchedule(api, accounts, messages, lifetime.signal, syncOptions);
  registerConversations(api, accounts, removals, lifetime.signal, messages, searchText);
  registerAccountRemoval(api, accounts, removals, drafts, outbox, messages, lifetime.signal);
  ctx.effect(() => async () => {
    lifetime.abort();
    await Promise.all([drainSetup(), drainDrafts(), messages.drain(), removals.drain(), drainSync(), drainOAuth(), drainSubset(), accounts?.drainOAuth()]);
  });
}
