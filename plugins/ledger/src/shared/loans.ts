import { LedgerBusinessDate, LedgerCurrency, LedgerMinorUnits } from "@huhu/contracts";
import { z } from "zod";
import { BookId, BookName, BookRef, BookVersion } from "./books.js";
import { EntryId } from "./entries.js";

const term = z.int().min(1).max(360);
export const LoanTerms = z.strictObject({
  method: z.enum(["equal-payment", "equal-principal"]),
  principalMinor: LedgerMinorUnits.refine((value) => value !== "0" && !value.startsWith("-"), "贷款本金必须大于零"),
  annualRatePercent: z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,8})?$/u, "请输入非负年利率百分数，最多八位小数"),
  months: term,
  startOn: LedgerBusinessDate,
}).refine(({ startOn, months }) =>
  Number(startOn.slice(0, 4)) * 12 + Number(startOn.slice(5, 7)) + months <= 9999 * 12 + 12,
"末期日期须在有效年份内");
export const LoanDefinition = LoanTerms.safeExtend({
  name: BookName, accountId: EntryId, currency: LedgerCurrency,
});
export const Loan = z.strictObject({ id: EntryId, bookId: BookId, definition: LoanDefinition });
export const LoanInstallment = z.strictObject({
  number: term, date: LedgerBusinessDate, principalMinor: LedgerMinorUnits, interestMinor: LedgerMinorUnits,
  paymentMinor: LedgerMinorUnits, remainingMinor: LedgerMinorUnits,
});
export const LoanPayment = z.strictObject({ loanId: EntryId, number: term, recordId: EntryId });

export const SaveLoan = BookVersion.extend({ definition: LoanDefinition });
const LoanQuery = BookRef.extend({ loanId: EntryId });
export const RemoveLoan = BookVersion.extend({ loanId: EntryId });
export const LoanList = z.strictObject({
  revision: z.string(),
  businessDate: LedgerBusinessDate,
  rows: z.array(Loan.extend({ generated: z.int().nonnegative() })),
});
export const PreviewLoan = LoanQuery.extend({ accountId: EntryId.optional() });
export const LoanHistory = z.strictObject({
  loan: Loan,
  preview: BookVersion.extend({
    loanId: EntryId, accountId: EntryId, through: LedgerBusinessDate, previewId: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  accountAvailable: z.boolean(),
  installments: z.array(LoanInstallment.extend({
    status: z.enum(["due", "future", "generated", "no-payment"]),
    recordId: EntryId.nullable(),
  })),
});
export const ConfirmLoan = LoanHistory.shape.preview.extend({
  selected: z.array(term).min(1).max(360).refine((numbers) => new Set(numbers).size === numbers.length, "不能重复选择期次"),
});

export type Loan = z.infer<typeof Loan>;
export type LoanTerms = z.infer<typeof LoanTerms>;
export type LoanInstallment = z.infer<typeof LoanInstallment>;
export type LoanPayment = z.infer<typeof LoanPayment>;
export type LoanList = z.infer<typeof LoanList>;
export type LoanHistory = z.infer<typeof LoanHistory>;
export const loanPeriodId = (loanId: string, number: number) => `${loanId}:${number}`;
