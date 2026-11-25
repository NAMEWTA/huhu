import { LedgerConfirmImport, LedgerCurrency, LedgerTimeZone } from "@huhu/contracts";
import { z } from "zod";
import { BookId, BookName, BookRef, BookVersion } from "./books.js";
import { EntryId, RecordFilters, RecordKind } from "./entries.js";

export const maxStatementBytes = 4 * 1024 * 1024;
export const maxStatementRows = 10_000;
const short = z.string().trim().max(180);
const rowId = z.string().regex(/^[0-9a-f]{64}$/);
export const BillSource = z.enum(["alipay", "jd", "wechat", "csv"]);
const csvColumn = z.int().min(1).max(128);
export const CsvColumns = z.strictObject({
  headerLine: z.int().min(1).max(200),
  date: csvColumn, amount: csvColumn, type: csvColumn, account: csvColumn, title: csvColumn,
  toAccount: csvColumn.optional(), toAmount: csvColumn.optional(), currency: csvColumn.optional(),
  category: csvColumn.optional(), payee: csvColumn.optional(), memo: csvColumn.optional(), number: csvColumn.optional(),
  typeValues: z.strictObject({ income: short.min(1), expense: short.min(1), transfer: short.min(1) })
    .refine((types) => new Set(Object.values(types).map((value) => value.normalize("NFKC").toLowerCase())).size === 3),
});
export const ImportFile = BookRef.extend({
  source: BillSource,
  sourceTimeZone: LedgerTimeZone,
  fileName: short.min(1),
  base64: z.string().min(4).max(4 * Math.ceil(maxStatementBytes / 3)).regex(/^[A-Za-z0-9+/]*={0,2}$/),
  columns: CsvColumns.optional(),
});
export const ImportReference = BookRef.extend({ previewId: EntryId });
export const ImportRow = z.strictObject({
  rowId, line: z.int().positive(), originalNumber: short.nullable(),
  title: z.string().max(150), sourceDate: z.string().max(100), businessDate: z.iso.date().nullable(),
  amount: short, toAmount: short, sourceCurrency: short,
  sourceAccount: short, sourceDestination: short, sourceCategory: short,
  accountId: EntryId.nullable(), toAccountId: EntryId.nullable(), categoryId: EntryId.nullable(),
  kind: RecordKind.nullable(), state: z.enum(["ready", "duplicate", "pending", "invalid", "skipped", "imported"]),
  diagnostic: z.string().nullable(),
});
export const ImportPreview = z.strictObject({
  bookId: BookId, previewId: EntryId, expectedRevision: z.string(), mappingRevision: z.string(), inputDigest: rowId,
  source: BillSource, encoding: z.enum(["UTF-8", "GBK", "XLSX"]), rows: z.array(ImportRow),
  counts: z.strictObject({ ready: z.int(), duplicate: z.int(), pending: z.int(), invalid: z.int(), skipped: z.int(), imported: z.int() }),
  proposedAccounts: z.array(short),
});
export const ResolveImport = ImportReference.extend({
  rows: z.array(z.strictObject({
    rowId, skip: z.boolean().optional(), accountId: EntryId.optional(), toAccountId: EntryId.optional(),
    kind: RecordKind.optional(), categoryId: EntryId.nullable().optional(), toAmount: short.optional(),
    disambiguation: z.enum(["earlier", "later"]).optional(),
  })).min(1).max(maxStatementRows),
});
export const ConfirmImport = LedgerConfirmImport.extend({
  bookId: BookId, previewId: EntryId, selectedRowIds: z.array(rowId).min(1).max(maxStatementRows)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const ImportResult = z.strictObject({ batchId: EntryId, imported: z.int().nonnegative(), recordIds: z.array(EntryId) });
export const ImportReceipt = ImportResult.extend({ key: rowId, owner: rowId, previewId: EntryId });

export const ImportMapping = z.strictObject({
  source: BillSource, kind: z.enum(["account", "category"]), original: short.min(1), targetId: EntryId,
  payeeContains: short.default(""), descriptionContains: short.default(""), recordType: RecordKind.nullable().default(null),
});
export const MappingList = z.strictObject({ revision: z.string(), rules: z.array(ImportMapping) });
export const SaveMapping = BookVersion.extend({ rules: z.array(ImportMapping).max(256) });
export const ExportCsv = BookRef.extend({ filters: RecordFilters.default({}) });
export const CsvResult = z.strictObject({ fileName: BookName, csv: z.string(), count: z.int().nonnegative() });
export type BillSource = z.infer<typeof BillSource>;
export type CsvColumns = z.infer<typeof CsvColumns>;
export type ImportMapping = z.infer<typeof ImportMapping>;
export type ImportPreview = z.infer<typeof ImportPreview>;
export type ImportResult = z.infer<typeof ImportResult>;
export type Resolutions = z.infer<typeof ResolveImport>["rows"];
