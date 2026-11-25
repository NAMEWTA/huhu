import { LedgerBusinessDate, LedgerCurrency, LedgerMinorUnits, PlanSummarySchema } from "@huhu/contracts";
import { z } from "zod";
import { BookRef, BookVersion } from "./books.js";
import { EntryId } from "./entries.js";

export const RecurringInput = z.strictObject({
  id: EntryId,
  title: z.string().trim().min(1).max(150),
  type: z.enum(["income", "expense"]),
  amountMinor: LedgerMinorUnits.refine((value) => BigInt(value) > 0n, "金额须为正数"),
  currency: LedgerCurrency,
  accountId: EntryId,
  startOn: LedgerBusinessDate,
  frequency: z.enum(["daily", "weekly", "monthly"]),
  memo: z.string().trim().max(500).nullable(),
});
export const RecurringRule = RecurringInput.extend({ planId: z.string() });
export const RecurringPeriod = z.strictObject({
  periodId: z.string(),
  ruleId: EntryId,
  date: LedgerBusinessDate,
  scheduledAt: z.iso.datetime(),
  occurrenceId: z.string(),
  state: z.enum(["generated", "failed"]),
  recordId: EntryId.nullable(),
  error: z.string().nullable(),
  attempts: z.int().positive(),
});
export const OpenRecurring = BookVersion.extend({ rule: RecurringInput });
export const RecurringKey = BookRef.extend({ ruleId: EntryId });
export const RetryRecurring = RecurringKey.extend({ expectedRevision: z.string(), periodId: z.string() });
export const RecurringRow = z.strictObject({
  rule: RecurringRule,
  plan: PlanSummarySchema.nullable(),
  periods: z.array(RecurringPeriod),
});
export const RecurringList = z.strictObject({ revision: z.string(), rows: z.array(RecurringRow) });
export const RecurringPreview = z.strictObject({
  nextDate: LedgerBusinessDate.nullable(),
  pending: z.array(RecurringPeriod.pick({ periodId: true, date: true, scheduledAt: true })),
  truncated: z.boolean(),
});
export type RecurringInput = z.infer<typeof RecurringInput>;
export type RecurringRule = z.infer<typeof RecurringRule>;
export type RecurringPeriod = z.infer<typeof RecurringPeriod>;
export type RecurringList = z.infer<typeof RecurringList>;
export type RecurringPreview = z.infer<typeof RecurringPreview>;
export type RecurringRow = z.infer<typeof RecurringRow>;

export const recurringLabels = { daily: "每日", weekly: "每周", monthly: "每月" };
