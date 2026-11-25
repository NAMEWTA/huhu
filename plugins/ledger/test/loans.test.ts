import { expect, test } from "vitest";
import { loanSchedule } from "../src/domain/loans.js";
import { LoanTerms } from "../src/shared/loans.js";

const base = { principalMinor: "10000", annualRatePercent: "12", startOn: "2024-01-31", months: 2 } as const;

test("L8 both amortization methods round in minor units and preserve a leap-year month-end anchor", () => {
  const payment = loanSchedule({ ...base, method: "equal-payment" });
  expect(payment).toEqual([
    { number: 1, date: "2024-02-29", principalMinor: "4975", interestMinor: "100", paymentMinor: "5075", remainingMinor: "5025" },
    { number: 2, date: "2024-03-31", principalMinor: "5025", interestMinor: "50", paymentMinor: "5075", remainingMinor: "0" },
  ]);
  expect(loanSchedule({ ...base, method: "equal-principal" })).toEqual([
    { number: 1, date: "2024-02-29", principalMinor: "5000", interestMinor: "100", paymentMinor: "5100", remainingMinor: "5000" },
    { number: 2, date: "2024-03-31", principalMinor: "5000", interestMinor: "50", paymentMinor: "5050", remainingMinor: "0" },
  ]);
});

test("L8 zero or fractional-positive rates, one or many periods and amounts beyond Number's integer precision", () => {
  const cases = [
    { ...base, principalMinor: "1", months: 5, annualRatePercent: "0" },
    { ...base, principalMinor: "100000000000000000000", months: 360, annualRatePercent: "0.00000001" },
    { ...base, principalMinor: "12001", months: 1, annualRatePercent: "0" },
    { ...base, principalMinor: "12001", months: 1, annualRatePercent: "12" },
  ];
  for (const terms of cases) {
    for (const method of ["equal-payment", "equal-principal"] as const) {
      const rows = loanSchedule({ ...terms, method });
      expect(rows).toHaveLength(terms.months);
      let remaining = BigInt(terms.principalMinor);
      for (const row of rows) {
        const principal = BigInt(row.principalMinor);
        expect(principal).toBeGreaterThanOrEqual(0n);
        expect(BigInt(row.paymentMinor)).toBe(principal + BigInt(row.interestMinor));
        remaining -= principal;
        expect(row.remainingMinor).toBe(remaining.toString());
      }
      expect(remaining).toBe(0n);
    }
  }
  expect(loanSchedule({ ...base, method: "equal-payment", principalMinor: "12000000", annualRatePercent: "4.2", months: 60 })[0]?.paymentMinor).toBe("222083");
  expect(LoanTerms.safeParse({ ...base, method: "equal-payment", annualRatePercent: "-0.01" }).success).toBe(false);
  expect(LoanTerms.safeParse({ ...base, method: "equal-payment", startOn: "2026-02-30" }).success).toBe(false);
});
