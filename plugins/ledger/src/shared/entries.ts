import { LedgerAccount, LedgerBalanceBase, LedgerBook, LedgerBusinessDate, LedgerCreateRecord, LedgerCurrency, LedgerMinorUnits, LedgerRecord } from "@huhu/contracts";
import { z } from "zod";
import { BookId, BookName, BookRef, BookVersion } from "./books.js";

export const EntryId = z.uuidv4();
const text = z.string().trim().max(500).nullable();
const money = z.string().regex(/^-?\d+$/);
const revision = z.string().min(1);
export const DictionaryKind = z.enum(["account-type", "bank", "category", "tag"]);
export const DictionaryItem = z.strictObject({
  id: EntryId, bookId: BookId, kind: DictionaryKind, name: BookName, status: z.enum(["active", "archived"]),
});
export const DictionaryInput = BookVersion.extend({
  id: EntryId.optional(), kind: DictionaryKind, name: BookName, status: DictionaryItem.shape.status.default("active"),
});
export const AccountLabels = z.strictObject({ accountTypeId: EntryId.nullable(), bankId: EntryId.nullable() });
export const AccountDetails = LedgerAccount.extend({
  labels: AccountLabels, balanceMinor: money, bases: z.array(LedgerBalanceBase),
});
export const AccountsView = z.strictObject({
  book: LedgerBook, businessDate: LedgerBusinessDate, accounts: z.array(AccountDetails), dictionary: z.array(DictionaryItem),
});
const accountInput = LedgerAccount.pick({ type: true, currency: true }).extend({ name: BookName, labels: AccountLabels });
export const CreateAccount = BookVersion.extend({ account: accountInput, openingMinor: LedgerMinorUnits, effectiveBusinessDate: LedgerBusinessDate });
export const UpdateAccount = BookVersion.extend({ accountId: EntryId, account: accountInput });
export const AccountState = BookVersion.extend({ accountId: EntryId, status: LedgerAccount.shape.status });
export const InputBase = BookVersion.extend({
  accountId: EntryId, effectiveBusinessDate: LedgerBusinessDate, balanceMinor: LedgerMinorUnits,
});
export const BasePreview = InputBase.extend({ currentBalanceMinor: money, replacedRevision: revision.nullable() });
export const ConfirmBase = InputBase.extend({ replacedRevision: revision.nullable() });

export const maxAttachmentBytes = 2 * 1024 * 1024;
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const Attachment = z.strictObject({
  id: EntryId,
  // eslint-disable-next-line no-control-regex -- An attachment filename cannot contain ASCII control characters.
  fileName: z.string().trim().min(1).max(180).regex(/^[^/\\\x00-\x1f\x7f]+$/),
  mediaType: z.string().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/),
  size: z.int().positive().max(maxAttachmentBytes),
  sha256,
});
export const AttachmentRead = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("available"), attachment: Attachment, base64: z.string() }),
  z.strictObject({ status: z.literal("missing"), attachment: Attachment }),
]);
export const UploadAttachment = BookVersion.extend({
  recordId: EntryId, recordRevision: revision,
  fileName: Attachment.shape.fileName, mediaType: Attachment.shape.mediaType,
  base64: z.string().min(4).max(4 * Math.ceil(maxAttachmentBytes / 3)).regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
export const AttachmentRef = BookRef.extend({ attachmentId: EntryId });

const RecordTitle = z.string().trim().min(1).max(150);
export const CreateRecord = LedgerCreateRecord.extend({ bookId: BookId, title: RecordTitle });
export const RecordVersion = BookVersion.extend({ recordId: EntryId, recordRevision: revision });
export const UpdateRecord = RecordVersion.extend({ title: RecordTitle, record: LedgerCreateRecord.shape.record });
export const RecordView = z.strictObject({
  record: LedgerRecord, title: RecordTitle, businessDate: LedgerBusinessDate, offset: z.boolean(),
  legacyOffset: z.boolean(),
  attachments: z.array(Attachment.extend({ missing: z.boolean() })),
});
export const RecordRef = BookRef.extend({ recordId: EntryId });

export const RecordKind = z.enum(["income", "expense", "transfer"]);
export const RecordFilters = z.strictObject({
  from: LedgerBusinessDate.optional(), to: LedgerBusinessDate.optional(), type: RecordKind.optional(),
  accountId: EntryId.optional(), toAccountId: EntryId.optional(), currency: LedgerCurrency.optional(), categoryId: EntryId.optional(),
  tagId: EntryId.optional(), minMinor: LedgerMinorUnits.optional(), maxMinor: LedgerMinorUnits.optional(),
  query: z.string().trim().max(500).optional(), payee: z.string().trim().max(500).optional(), memo: z.string().trim().max(500).optional(),
  offset: z.boolean().optional(), uncategorized: z.literal(true).optional(),
}).refine((f) => !f.from || !f.to || f.from <= f.to, "开始日期须早于或等于结束日期")
  .refine((f) => f.minMinor === undefined || f.maxMinor === undefined || BigInt(f.minMinor) <= BigInt(f.maxMinor), "最小金额须小于或等于最大金额");
export const RecordsQuery = BookRef.extend({
  filters: RecordFilters.default({}),
  page: z.int().min(1).max(100_000).default(1),
  pageSize: z.int().min(1).max(100).default(25),
});
export const RecordsPage = z.strictObject({
  book: LedgerBook, total: z.int().nonnegative(), page: z.int().positive(), pageSize: z.int().positive(),
  rows: z.array(RecordView),
  totals: z.array(z.strictObject({
    currency: LedgerCurrency, incomeMinor: money, expenseMinor: money, netMinor: money, transferInMinor: money, transferOutMinor: money,
  })),
});

const Patch = z.strictObject({
  categoryId: EntryId.nullable().optional(), tagIds: z.array(EntryId).max(50).optional(), memo: text.optional(), payee: text.optional(),
}).refine((input) => Object.keys(input).length > 0, "请选择要修改的字段");
const batchAction = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("delete") }),
  z.strictObject({ kind: z.literal("update"), patch: Patch }),
]);
export const InputBatch = BookVersion.extend({
  selection: z.array(z.strictObject({ recordId: EntryId, recordRevision: revision })).min(1).max(200)
    .refine((rows) => new Set(rows.map(({ recordId }) => recordId)).size === rows.length),
  action: batchAction,
});
export const BatchPreview = z.strictObject({
  previewId: sha256, revision, count: z.int().positive(), attachmentCount: z.int().nonnegative(),
});
export const ConfirmBatch = InputBatch.extend({ previewId: sha256 });

export type DictionaryItem = z.infer<typeof DictionaryItem>;
export type AccountsView = z.infer<typeof AccountsView>;
export type Attachment = z.infer<typeof Attachment>;
export type RecordView = z.infer<typeof RecordView>;
export type RecordFilters = z.infer<typeof RecordFilters>;
export type RecordsPage = z.infer<typeof RecordsPage>;
export type BasePreview = z.infer<typeof BasePreview>;
export type BatchPreview = z.infer<typeof BatchPreview>;
