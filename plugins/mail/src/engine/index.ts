export { openMailAccounts, type MailAccount, type MailAccountDraft } from "./accounts.js";
export type { MailAccountDefinition, MailAccountSettings, MailFolder } from "./account-definition.js";
export { MailAccountError, type MailAccountErrorCode, type MailFolderDiscovery } from "./discovery.js";
export { mailPreset, mailProviderSchema, type MailProvider } from "./presets.js";
export { apply, mailAccountsListDescriptor } from "./registration.js";
