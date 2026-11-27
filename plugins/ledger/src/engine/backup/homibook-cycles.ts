import { randomUUID } from "node:crypto";
import { errors, ledgerBusinessDate, ledgerDecimalToMinor, type LedgerRecord } from "@huhu/contracts";
import { z } from "zod";
import { loanSchedule } from "../../domain/loans.js";
import type { BackupDecision, BackupModule } from "../../shared/backups.js";
import { LoanDefinition, loanPeriodId } from "../../shared/loans.js";
import { RecurringRule, recurringPlanId } from "../../shared/recurring.js";
import type { BookState } from "../store.js";

const instant = z.iso.datetime({ offset: true });
const decimal = z.string().max(65);
const cycle = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string(),
  recurringType: z.enum(["PERIODIC", "LOAN"]),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: decimal,
  cron: z.string(),
  createdAt: instant,
  nextGenerateAt: instant.nullish(),
  lastGeneratedAt: instant.nullish(),
  categoryCode: z.string().nullish(),
  payer: z.string().nullish(),
  remark: z.string().nullish(),
  tags: z.string().optional(),
  loanTotalAmount: decimal.nullish(),
  loanInterestRate: decimal.nullish(),
  loanInterestMethod: z.enum(["EQUAL_INSTALLMENT", "EQUAL_PRINCIPAL"]).nullish(),
  loanStartDate: instant.nullish(),
  loanTermMonths: z.int().nullish(),
});
const repayment = z.object({
  period: z.int(),
  dueDate: instant,
  totalPayment: decimal,
  principal: decimal,
  interest: decimal,
  remainingPrincipal: decimal,
  status: z.enum(["PENDING", "GENERATED"]),
  generatedRecordId: z.string().nullish(),
});

function fixedCadence(cron: string, date: string) {
  const [minute, hour, day, month, week, extra] = cron.trim().split(/\s+/u);
  if (minute !== "0" || hour !== "0" || month !== "*" || extra !== undefined) throw errors.invalidInput("原 Cron 小时或月份规则需要手工重设");
  if (day === "*" && week === "*") return { frequency: "daily", startOn: date };
  if (day === "*" && /^[0-6]$/u.test(week ?? "")) {
    const anchor = new Date(date + "T00:00:00Z");
    anchor.setUTCDate(anchor.getUTCDate() + ((Number(week) + 7 - anchor.getUTCDay()) % 7));
    return { frequency: "weekly", startOn: anchor.toISOString().slice(0, 10) };
  }
  if (week === "*" && /^(?:[1-9]|1\d|2[0-8])$/u.test(day ?? "")) {
    const anchor = new Date(date + "T00:00:00Z");
    anchor.setUTCMonth(anchor.getUTCMonth() + Number(Number(day) < anchor.getUTCDate()), Number(day));
    return { frequency: "monthly", startOn: anchor.toISOString().slice(0, 10) };
  }
  throw errors.invalidInput("原 Cron 的日期语义需要手工重设");
}

export function restoreHomibookCycles(
  state: BookState,
  rules: Record<string, unknown>[],
  periods: Record<string, unknown>[],
  accounts: ReadonlyMap<string, BookState["accounts"][number]>,
  records: ReadonlyMap<string, LedgerRecord>,
  issue: (module: BackupModule, row: string, message: string, choices?: BackupDecision[]) => string,
) {
  const { id: bookId, timeZone } = state.book;
  const byRule = new Map<string, Record<string, unknown>[]>();
  for (const raw of periods) {
    if (typeof raw.recurringTransactionId !== "string") continue;
    const rows = byRule.get(raw.recurringTransactionId) ?? [];
    rows.push(raw);
    byRule.set(raw.recurringTransactionId, rows);
  }

  const seen = new Set<string>();
  for (const raw of rules) {
    const label = String(raw.name ?? raw.id ?? "周期规则");
    try {
      const row = cycle.parse(raw);
      if (seen.has(row.id)) throw errors.invalidInput("规则 ID 重复");
      seen.add(row.id);
      const account = accounts.get(row.accountId);
      if (!account) throw errors.invalidInput("规则所需的账户无法迁入");
      const { currency } = account;
      const id = randomUUID();
      if (row.recurringType === "PERIODIC") {
        if (row.type === "TRANSFER" || row.categoryCode || row.payer || (row.tags && row.tags !== "[]" && row.tags !== '["固定收支"]')) {
          throw errors.invalidInput("原固定收支包含需要手工设置的转账、分类或标签");
        }
        if (row.lastGeneratedAt) throw errors.invalidInput("原固定收支缺少逐期期次身份，请按原流水核对后建立新规则");
        const start = ledgerBusinessDate(row.nextGenerateAt ?? row.createdAt, timeZone);
        const amountMinor = ledgerDecimalToMinor(row.amount, currency);
        state.recurring.push(
          RecurringRule.parse({
            id,
            title: row.name,
            type: row.type === "EXPENSE" ? "expense" : "income",
            amountMinor,
            currency,
            accountId: account.id,
            memo: row.remark?.slice(0, 500) ?? null,
            ...fixedCadence(row.cron, start),
            planId: recurringPlanId(bookId, id),
          }),
        );
        continue;
      }
      if (!row.loanStartDate || row.loanTotalAmount == null || !row.loanInterestMethod) throw errors.invalidInput("贷款条件不完整");
      const definition = LoanDefinition.parse({
        name: row.name,
        accountId: account.id,
        currency,
        method: row.loanInterestMethod === "EQUAL_PRINCIPAL" ? "equal-principal" : "equal-payment",
        annualRatePercent: row.loanInterestRate ?? "0",
        principalMinor: ledgerDecimalToMinor(row.loanTotalAmount, currency),
        startOn: ledgerBusinessDate(row.loanStartDate, timeZone),
        months: row.loanTermMonths,
      });
      const schedule = loanSchedule(definition);
      const observed = new Set<number>();
      const receipts: Array<{ number: number; record: LedgerRecord | undefined }> = [];
      for (const source of byRule.get(row.id) ?? []) {
        const period = repayment.parse(source);
        const item = schedule[period.period - 1];
        if (
          !item ||
          observed.has(item.number) ||
          ledgerBusinessDate(period.dueDate, timeZone) !== item.date ||
          ledgerDecimalToMinor(period.totalPayment, currency) !== item.paymentMinor ||
          ledgerDecimalToMinor(period.principal, currency) !== item.principalMinor ||
          ledgerDecimalToMinor(period.interest, currency) !== item.interestMinor ||
          ledgerDecimalToMinor(period.remainingPrincipal, currency) !== item.remainingMinor
        ) {
          throw errors.invalidInput("原还款期次与当前精确摊还口径不一致，请参照原流水核对");
        }
        observed.add(item.number);
        if (period.status === "GENERATED") receipts.push({ number: item.number, record: records.get(period.generatedRecordId ?? "") });
      }
      if (!observed.size && row.lastGeneratedAt) throw errors.invalidInput("原贷款已生成流水但缺少逐期记录");
      state.loans.push({ id, bookId, definition });
      for (const { number, record } of receipts) {
        state.loanPayments.push({ loanId: id, number, recordId: record?.id ?? randomUUID() });
        if (record) state.recordReferences.push({ kind: "occurrence", targetId: loanPeriodId(id, number), recordId: record.id });
        else issue("cycles", label + " · 第 " + number + " 期", "原流水缺失，可保留已入账期次事实", ["drop-link"]);
      }
    } catch (failure) {
      issue("cycles", label, failure instanceof Error ? failure.message : "周期规则无法迁入");
    }
  }
}
