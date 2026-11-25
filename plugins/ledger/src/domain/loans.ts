import { errors } from "@huhu/contracts";
import { anchoredMonthDate } from "../shared/monthly-date.js";
import { LoanInstallment, type LoanTerms } from "../shared/loans.js";

const round = (numerator: bigint, denominator: bigint) => (numerator + denominator / 2n) / denominator;

export function loanSchedule(terms: LoanTerms): LoanInstallment[] {
  const principal = BigInt(terms.principalMinor);
  const months = BigInt(terms.months);
  const [integer, decimals = ""] = terms.annualRatePercent.split(".");
  const rate = BigInt(integer! + decimals);
  const unit = 1_200n * 10n ** BigInt(decimals.length);
  const principalTarget = round(principal, months);
  let paymentTarget = principalTarget;
  if (rate !== 0n && terms.method === "equal-payment") {
    // HomiBook's annuity formula with the monthly rate and exponent evaluated as exact ratios.
    const power = (unit + rate) ** months;
    paymentTarget = round(principal * rate * power, unit * (power - unit ** months));
  }

  let remaining = principal;
  return Array.from({ length: terms.months }, (_, index) => {
    const number = index + 1;
    const interest = round(remaining * rate, unit);
    const target = terms.method === "equal-principal" ? principalTarget : paymentTarget - interest;
    const installment = number === terms.months || target > remaining ? remaining : target > 0n ? target : 0n;
    remaining -= installment;
    const parsed = LoanInstallment.safeParse({
      number,
      date: anchoredMonthDate(terms.startOn, number),
      principalMinor: installment.toString(),
      interestMinor: interest.toString(),
      paymentMinor: (installment + interest).toString(),
      remainingMinor: remaining.toString(),
    });
    if (!parsed.success) throw errors.invalidInput("贷款期次金额或日期超出账本可记录的范围");
    return parsed.data;
  });
}
