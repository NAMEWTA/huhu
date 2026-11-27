import { LedgerBusinessDate, LedgerCurrency } from "@huhu/contracts";
import { z } from "zod";
import { BookRef, BookVersion } from "./books.js";
import { EntryId } from "./entries.js";

export const ReportQuery = BookRef.extend({
  from: LedgerBusinessDate,
  to: LedgerBusinessDate,
  currency: LedgerCurrency.optional(),
  includeOffset: z.boolean().default(false),
  chartDetail: z.boolean().optional(),
}).refine(({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) < 366 * 86_400_000, "报表期间最多 366 天");
const integral = z.string().regex(/^-?\d+$/u);
const totals = z.strictObject({
  count: z.int().nonnegative(),
  incomeMinor: integral,
  expenseMinor: integral,
  transferInMinor: integral,
  transferOutMinor: integral,
});
const balancePoint = z.strictObject({ date: LedgerBusinessDate, amountMinor: integral });
const categoryTotal = z.strictObject({ id: EntryId.nullable(), label: z.string(), kind: z.enum(["income", "expense"]), amountMinor: integral, count: z.int().positive() });
const healthMetric = z.strictObject({ label: z.string(), rule: z.string(), score: z.int().min(0).max(100).nullable() });
export const ReportView = z.strictObject({
  from: LedgerBusinessDate,
  to: LedgerBusinessDate,
  currencies: z.array(LedgerCurrency),
  series: z.array(
    totals.extend({
      currency: LedgerCurrency,
      days: z.array(totals.extend({ date: LedgerBusinessDate })),
      accounts: z.array(totals.extend({ id: EntryId, label: z.string(), balanceMinor: integral })),
      categories: z.array(categoryTotal),
      balance: z.array(balancePoint),
      savingsScore: z.int().min(0).max(100).nullable(),
      charts: z
        .strictObject({
          months: z.array(totals.extend({ from: LedgerBusinessDate, to: LedgerBusinessDate })),
          periods: z.array(z.strictObject({ from: LedgerBusinessDate, to: LedgerBusinessDate, categories: z.array(categoryTotal) })),
          accounts: z.array(z.strictObject({ id: EntryId, label: z.string(), points: z.array(balancePoint) })),
          netWorth: z.array(balancePoint.extend({ assetsMinor: integral, liabilitiesMinor: integral })),
          health: z.array(healthMetric),
          periodHealth: z.array(healthMetric),
        })
        .optional(),
    }),
  ),
});
export const ReportCards = z
  .array(
    z.strictObject({
      id: z.enum(["summary", "recent", "balances"]),
      visible: z.boolean(),
    }),
  )
  .length(3)
  .refine((cards) => new Set(cards.map(({ id }) => id)).size === 3, "卡片必须各出现一次");
export type ReportCards = z.infer<typeof ReportCards>;
export const defaultCards: ReportCards = [
  { id: "summary", visible: true },
  { id: "recent", visible: true },
  { id: "balances", visible: true },
];
export const ReportsPreferences = z.strictObject({ revision: z.string(), cards: ReportCards });
export const SaveReportsPreferences = BookVersion.extend({ cards: ReportCards });

export const HolidayYear = z.string().regex(/^\d{4}$/u);
export const HolidayData = z
  .strictObject({
    year: HolidayYear,
    source: z.string().trim().min(1).max(160),
    entries: z
      .array(
        z.strictObject({
          date: LedgerBusinessDate,
          name: z.string().trim().min(1).max(100),
          isWorkday: z.boolean(),
        }),
      )
      .max(366),
  })
  .refine(({ year, entries }) => entries.every(({ date }) => date.startsWith(year + "-")) && new Set(entries.map(({ date }) => date)).size === entries.length, "节假日须属于同一年且日期不能重复");
export const HolidayQuery = BookRef.extend({ year: HolidayYear });
export const SaveHolidayData = BookVersion.extend({ data: HolidayData });
export type HolidayData = z.infer<typeof HolidayData>;
export type ReportView = z.infer<typeof ReportView>;

export function calendarMonth(month: string) {
  const from = month + "-01";
  const next = new Date(from + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1, 0);
  return { from, to: next.toISOString().slice(0, 10) };
}

export function shiftMonth(month: string, offset: number) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function reportPeriods(from: string, to: string, daily: boolean) {
  const periods: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    const end = daily ? start : calendarMonth(start.slice(0, 7)).to;
    periods.push({ from: start, to: end < to ? end : to });
    if (end >= to) break;
    start = new Date(Date.parse(end) + 86_400_000).toISOString().slice(0, 10);
  }
  return periods;
}
