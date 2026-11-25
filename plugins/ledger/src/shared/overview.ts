import { LedgerBusinessDate } from "@huhu/contracts";
import { z } from "zod";
import { BudgetOverview } from "./budgets.js";

export const OverviewActivity = z.strictObject({
  revision: z.string(),
  businessDate: LedgerBusinessDate,
  budgetTotals: BudgetOverview.shape.totals,
  recurring: z.strictObject({
    rules: z.int().nonnegative(),
    enabled: z.int().nonnegative(),
    failedPeriods: z.int().nonnegative(),
    nextAt: z.iso.datetime().nullable(),
  }),
  loans: z.strictObject({
    count: z.int().nonnegative(),
    installments: z.int().nonnegative(),
    generated: z.int().nonnegative(),
  }),
});
