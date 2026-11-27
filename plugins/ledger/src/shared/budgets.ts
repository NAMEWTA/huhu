import { LedgerBusinessDate, LedgerCurrency, LedgerMinorUnits } from "@huhu/contracts";
import { z } from "zod";
import { BookId, BookName, BookRef, BookVersion } from "./books.js";
import { EntryId, RecordView, RecordsQuery } from "./entries.js";
import { HolidayYear } from "./reports.js";

const monthNumber = z.string().regex(/^(0[1-9]|1[0-2])$/u);
const BudgetMonth = z.templateLiteral([HolidayYear, "-", monthNumber]);
const dimensions = z
  .array(EntryId)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "分类或标签不能重复");
const common = z.strictObject({
  name: BookName,
  currency: LedgerCurrency,
  limitMinor: LedgerMinorUnits.refine((value) => value !== "0" && !value.startsWith("-"), "预算额度必须大于零"),
});
const fixed = common.extend({
  type: z.literal("fixed"),
  month: BudgetMonth,
  direction: z.enum(["income", "expense"]),
  categoryIds: dimensions,
});
const free = common
  .extend({
    type: z.literal("free"),
    tagIds: dimensions.min(1),
    from: LedgerBusinessDate.optional(),
    to: LedgerBusinessDate.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, "开始日期须早于或等于结束日期");
const definition = z.discriminatedUnion("type", [fixed, free]);
const identities = { id: EntryId, bookId: BookId, revision: z.string().min(1) };
export const Budget = z.strictObject({ ...identities, definition });

const totals = z.strictObject({
  limitMinor: z.string().regex(/^\d+$/u),
  actualMinor: z.string().regex(/^\d+$/u),
  remainingMinor: z.string().regex(/^-?\d+$/u),
});
const progress = totals.extend({ count: z.int().nonnegative() });
const period = z.strictObject({ year: HolidayYear, month: monthNumber.optional(), currency: LedgerCurrency.optional() });
export const BudgetQuery = BookRef.extend(period.shape);
const budgetProgress = Budget.extend(progress.shape);
export const BudgetOverview = z.strictObject({
  revision: z.string(),
  budgets: z.array(budgetProgress),
  totals: z.array(totals.extend({ currency: LedgerCurrency, type: z.enum(["fixed", "free"]), direction: fixed.shape.direction })),
});
export const BudgetDetailQuery = BudgetQuery.extend({
  budgetId: EntryId,
  page: RecordsQuery.shape.page,
  pageSize: RecordsQuery.shape.pageSize,
  slice: z
    .strictObject({
      from: LedgerBusinessDate.optional(),
      to: LedgerBusinessDate.optional(),
      categoryId: EntryId.nullable().optional(),
    })
    .optional(),
});
const budgetCategory = z.strictObject({ id: EntryId.nullable(), label: z.string(), amountMinor: totals.shape.actualMinor });
export const BudgetDetail = budgetProgress.extend({
  page: z.int().positive(),
  pageSize: z.int().positive(),
  rows: z.array(RecordView),
  filteredCount: z.int().nonnegative(),
  categories: z.array(budgetCategory),
  periods: z.array(z.strictObject({ from: LedgerBusinessDate, to: LedgerBusinessDate, categories: z.array(budgetCategory) })),
});
export const SaveBudgets = BookVersion.extend({
  budgets: z
    .array(z.strictObject({ id: EntryId.optional(), definition }))
    .min(1)
    .max(200),
});
export const RemoveBudget = BookVersion.extend({ budgetId: EntryId });
export const CopyBudgets = BookVersion.extend({
  source: BudgetMonth,
  targets: z
    .array(BudgetMonth)
    .min(1)
    .max(120)
    .refine((months) => new Set(months).size === months.length, "目标月份不能重复"),
});
export const CopyBudgetResult = z.strictObject({
  created: z.int().nonnegative(),
  skipped: z.array(z.strictObject({ month: BudgetMonth, name: BookName, existingId: EntryId })),
});

export type Budget = z.infer<typeof Budget>;
export type BudgetDetail = z.infer<typeof BudgetDetail>;
export type BudgetOverview = z.infer<typeof BudgetOverview>;
export type CopyBudgetResult = z.infer<typeof CopyBudgetResult>;
