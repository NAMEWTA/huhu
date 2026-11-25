import { LedgerCurrency, LedgerTimeZone } from "@huhu/contracts";
import { z } from "zod";
import { BookName, BookRef, BookVersion } from "./books.js";
import { EntryId } from "./entries.js";

export const backupModules = ["accounts", "records", "budgets", "cycles", "mappings", "attachments"] as const;
export const backupModule = z.enum(backupModules);
export type BackupModule = z.infer<typeof backupModule>;
export const moduleSelection = z.array(backupModule).max(backupModules.length).refine((rows) => new Set(rows).size === rows.length);
export const backupModuleLabels: Record<BackupModule, string> = {
  accounts: "账户、期初余额与字典", records: "流水及关系", budgets: "预算",
  cycles: "固定收支、贷款与期次", mappings: "导入映射", attachments: "流水凭证",
};
const requires: Record<BackupModule, readonly BackupModule[]> = {
  accounts: [], records: ["accounts"], budgets: ["accounts"], cycles: ["accounts", "records"],
  mappings: ["accounts"], attachments: ["accounts", "records"],
};

export function missingBackupModules(modules: readonly BackupModule[]): BackupModule[] {
  return [...new Set(modules.flatMap((entry) => requires[entry]))].filter((entry) => !modules.includes(entry));
}

export const maxLedgerArchiveBytes = 5 * 1024 * 1024;
const archiveBase64 = z.string().min(4).max(4 * Math.ceil(maxLedgerArchiveBytes / 3)).regex(/^[A-Za-z0-9+/]+={0,2}$/u);
export const ExportBackup = BookRef.extend({ modules: moduleSelection });
export const ExportedBackup = z.strictObject({ fileName: z.string(), base64: archiveBase64 });
export const InspectBackup = z.strictObject({
  base64: archiveBase64,
  sourceBookId: z.string().min(1).max(256).optional(),
  timeZone: LedgerTimeZone.optional(),
});
const choice = z.enum(["skip-row", "drop-link", "retain-offset", "clear-offset"]);
const issue = z.strictObject({
  id: z.string().min(1).max(160), module: backupModule, row: z.string().max(150), message: z.string().max(240), choices: z.array(choice).min(1),
});
export const BackupPreview = z.strictObject({
  previewId: EntryId, source: z.enum(["huhu", "homibook"]),
  sourceBookId: z.string(), sourceBooks: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  suggestedName: BookName, timeZone: LedgerTimeZone, currency: LedgerCurrency, modules: moduleSelection,
  counts: z.strictObject({ accounts: z.int().nonnegative(), records: z.int().nonnegative(), attachments: z.int().nonnegative() }),
  issues: z.array(issue),
  warnings: z.array(z.string()),
});
export const BackupRef = z.strictObject({ previewId: EntryId });
export const ConfirmBackup = BackupRef.extend({
  name: BookName, modules: moduleSelection, decisions: z.record(issue.shape.id, choice).default({}),
});
export const ClearLegacyOffset = BookVersion.extend({ recordId: EntryId });

export type BackupPreview = z.infer<typeof BackupPreview>;
export type ExportedBackup = z.infer<typeof ExportedBackup>;
export type BackupIssue = z.infer<typeof issue>;
export type BackupDecision = z.infer<typeof choice>;
