import { LedgerCurrency, LedgerMinorUnits, LedgerOffsetGroup, LedgerRecord } from "@huhu/contracts";
import { z } from "zod";
import { BookRef, BookVersion } from "./books.js";
import { EntryId, RecordFilters } from "./entries.js";

const revision = z.string().min(1);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const member = z.strictObject({ recordId: EntryId, recordRevision: revision });
const selection = (max: number) =>
  z
    .array(member)
    .min(2)
    .max(max)
    .refine((members) => new Set(members.map(({ recordId }) => recordId)).size === members.length);

export const ReconciliationRow = z.strictObject({ title: z.string(), record: LedgerRecord });
export const DuplicateSearch = BookRef.extend({
  filters: RecordFilters.default({}),
  precision: z.enum(["second", "minute", "day", "any"]).default("minute"),
  sameAccount: z.boolean().default(true),
  samePayee: z.boolean().default(true),
  memoSimilarity: z.int().min(0).max(100).default(0),
});
export const OffsetSearch = BookRef.extend({
  recordId: EntryId.optional(),
  filters: RecordFilters.default({}),
  windowDays: z.int().min(1).max(365).default(30),
  sameAccount: z.boolean().default(false),
  memoSimilarity: z.int().min(0).max(100).default(0),
});
export const CandidateGroups = z.strictObject({
  expectedRevision: revision,
  groups: z.array(z.array(ReconciliationRow)),
  truncated: z.boolean(),
});

export const MergeInput = BookVersion.extend({ members: selection(50), keepRecordId: EntryId });
const references = z.strictObject({
  attachments: z.int().nonnegative(),
  notes: z.int().nonnegative(),
  occurrences: z.int().nonnegative(),
  conflictingOccurrences: z.array(z.string()),
});
export const MergePreview = z.strictObject({
  previewId: digest,
  expectedRevision: revision,
  rows: z.array(ReconciliationRow),
  keepRecordId: EntryId,
  accounts: z.array(EntryId),
  toAccounts: z.array(EntryId),
  categories: z.array(EntryId.nullable()),
  suggestedMemo: z.string().nullable(),
  memoOverflow: z.boolean(),
  references,
});
export const ConfirmMerge = MergeInput.extend({
  previewId: digest,
  accountId: EntryId.optional(),
  toAccountId: EntryId.optional(),
  categoryId: EntryId.nullable().optional(),
  memo: z.string().trim().max(500).nullable().optional(),
});
export const MergeResult = z.strictObject({ retained: LedgerRecord, removed: z.array(EntryId) });

export const OffsetInput = BookVersion.extend({ members: selection(6) });
export const OffsetPreview = z.strictObject({
  previewId: digest,
  expectedRevision: revision,
  rows: z.array(ReconciliationRow),
  currency: LedgerCurrency,
  amountMinor: LedgerMinorUnits,
});
export const ConfirmOffset = OffsetInput.extend({ previewId: digest });
export const OffsetGroupView = z.strictObject({ group: LedgerOffsetGroup, rows: z.array(ReconciliationRow), expectedRevision: revision });
export const UndoOffset = BookVersion.extend({ offsetId: EntryId, offsetRevision: revision });

// Other ledger owners attach their stable identities here. Merging moves the association without editing those entities.
export const RecordReference = z.strictObject({
  kind: z.enum(["note", "occurrence"]),
  targetId: z.string().min(1).max(256),
  recordId: EntryId,
});
export type CandidateGroups = z.infer<typeof CandidateGroups>;
export type ReconciliationRow = z.infer<typeof ReconciliationRow>;
export type MergeInput = z.infer<typeof MergeInput>;
export type MergePreview = z.infer<typeof MergePreview>;
export type OffsetInput = z.infer<typeof OffsetInput>;
export type OffsetPreview = z.infer<typeof OffsetPreview>;
export type OffsetGroupView = z.infer<typeof OffsetGroupView>;
