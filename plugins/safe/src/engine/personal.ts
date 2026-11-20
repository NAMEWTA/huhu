import { z } from "zod";

const RequiredText = z.string().trim().min(1);
const OptionalUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/ })]);
const OptionalEmail = z.union([z.literal(""), z.email()]);
const Revision = z.int().positive();
const Timestamp = z.iso.datetime();

const AccountFields = z.object({
  account: RequiredText,
  password: z.string(),
  phone: z.string(),
  email: OptionalEmail,
  note: z.string(),
});
const AccountInput = AccountFields.extend({
  password: AccountFields.shape.password.default(""),
  phone: AccountFields.shape.phone.default(""),
  email: OptionalEmail.default(""),
  note: AccountFields.shape.note.default(""),
});
const StoredAccount = AccountFields.extend({ accountId: z.uuid(), createdAt: Timestamp, updatedAt: Timestamp });

export const SafeSession = z.object({ instanceId: z.uuid(), generation: z.int().nonnegative() });
export const ListEntries = z.object({ session: SafeSession });
export const GetEntry = ListEntries.extend({ entryId: z.uuid() });
export const RevealAccount = GetEntry.extend({ accountId: z.uuid() });
export const CreateEntry = ListEntries.extend({
  expectedRevision: z.int().nonnegative(),
  name: RequiredText,
  url: OptionalUrl.default(""),
  accounts: z.array(AccountInput).min(1),
});

const EntryRef = z.object({ entryId: z.uuid(), revision: Revision });
const EntryHeader = EntryRef.extend({ name: RequiredText, url: OptionalUrl, tagIds: z.array(z.uuid()), createdAt: Timestamp, updatedAt: Timestamp });

export const StoredEntry = EntryHeader.extend({ accounts: z.array(StoredAccount).min(1) });
export const EntryDetail = EntryHeader.extend({ accounts: z.array(StoredAccount.omit({ password: true }).extend({ hasPassword: z.boolean() })) });
export const EntryIndex = z.object({ revision: z.int().nonnegative(), entries: z.array(EntryRef) });
export const CreateEntryReceipt = EntryRef.extend({ accountIds: z.array(z.uuid()), status: z.literal("saved") });

export type SafeSession = z.infer<typeof SafeSession>;
export type CreateEntry = z.infer<typeof CreateEntry>;
export type StoredEntry = z.infer<typeof StoredEntry>;
