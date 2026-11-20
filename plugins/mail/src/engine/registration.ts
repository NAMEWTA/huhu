import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type Context, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { mailAccountDefinitionSchema } from "./account-definition.js";
import { openMailAccounts, type MailAccountOwner } from "./accounts.js";
import { registerDrafts } from "./drafts.js";
import { registerMessageCache } from "./message-cache.js";
import type { MailSmtpTransport } from "./smtp.js";

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
  output: z.strictObject({ available: z.boolean(), accounts: z.array(accountSummary) }),
});

export async function apply(ctx: Context, api: HuhuApi, owner?: MailAccountOwner, transport?: MailSmtpTransport): Promise<void> {
  const lifetime = new AbortController();
  const accounts = owner ? openMailAccounts(owner) : undefined;
  if (accounts && owner && !owner.vault.readOnly) await accounts.recover();
  api.defineCapability(
    bindCapability(mailAccountsListDescriptor, async ({ caller }) => {
      if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(mailAccountsListDescriptor.name);
      return { available: accounts !== undefined, accounts: accounts ? await accounts.list() : [] };
    }),
  );
  registerMessageCache(api, accounts, lifetime.signal);
  const drainDrafts = registerDrafts(api, accounts, lifetime.signal, transport);
  ctx.effect(() => async () => {
    lifetime.abort();
    await drainDrafts();
  });
}
