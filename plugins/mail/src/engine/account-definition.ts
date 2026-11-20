import { isIP } from "node:net";
import { z } from "zod";
import { isSelectable } from "../mail-folder-visibility.js";
import { mailPreset, mailProviderSchema } from "./presets.js";
export { isSelectable } from "../mail-folder-visibility.js";

const hostname = z.hostname();
const host = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => isIP(value) !== 0 || hostname.safeParse(value).success);
const endpointFields = {
  port: z.number().int().min(1).max(65_535),
  security: z.enum(["tls", "starttls", "none"]),
};

export const accountSettingsSchema = z
  .strictObject({
    provider: mailProviderSchema,
    email: z.string().trim().pipe(z.email()),
    label: z.string().trim().max(80),
    auth: z.enum(["password", "app-password", "oauth2"]),
    imap: z.strictObject({ ...endpointFields, host }),
    smtpEnabled: z.boolean(),
    smtp: z.strictObject({ ...endpointFields, host: z.union([host, z.string().trim().pipe(z.literal(""))]) }),
  })
  .refine(({ provider, auth }) => mailPreset(provider).credentials.some((option) => option.method === auth), { path: ["auth"] })
  .refine(({ smtpEnabled, smtp }) => !smtpEnabled || smtp.host !== "", { path: ["smtp", "host"] });

export type MailAccountSettings = z.input<typeof accountSettingsSchema>;

export const mailFolderSchema = z.strictObject({
  path: z.string().min(1),
  name: z.string(),
  delimiter: z.string().nullable(),
  specialUse: z.string().nullable(),
  flags: z.array(z.string()),
});
export type MailFolder = z.infer<typeof mailFolderSchema>;

export const isInbox = (path: string) => path.toUpperCase() === "INBOX";

export const mailAccountDefinitionSchema = z.strictObject({
  format: z.literal(1),
  settings: accountSettingsSchema.safeExtend({ auth: z.enum(["password", "app-password"]) }),
  folders: z.array(mailFolderSchema).refine((folders) => folders.every(isSelectable) && folders.some(({ path }) => path === "INBOX") && new Set(folders.map(({ path }) => (isInbox(path) ? "INBOX" : path))).size === folders.length),
});
export type MailAccountDefinition = z.infer<typeof mailAccountDefinitionSchema>;

export const accountPasswordPurpose = "account-password";

export function imapTarget({ email, auth, imap }: MailAccountSettings) {
  return JSON.stringify([email.trim(), auth, imap.host.trim().toLowerCase(), imap.port, imap.security]);
}

export function accountTargets(settings: MailAccountDefinition["settings"]) {
  const { smtpEnabled, smtp } = settings;
  return { [accountPasswordPurpose]: JSON.stringify([imapTarget(settings), smtpEnabled ? [smtp.host, smtp.port, smtp.security] : null]) };
}

export function parseAccountSettings(input: MailAccountSettings) {
  return accountSettingsSchema.safeParse(input);
}
