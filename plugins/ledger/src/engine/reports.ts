import { ledgerBusinessDate, type LedgerRecord } from "@huhu/contracts";
import type { z } from "zod";
import { financialHealth, scoreSavings } from "../domain/financial-health.js";
import { loanSchedule } from "../domain/loans.js";
import { reportPeriods, type ReportQuery, type ReportView } from "../shared/reports.js";
import { balanceCheckpoints } from "./accounts.js";
import { expenseBudgetTotals } from "./budgets.js";
import { filteredRecords, legs } from "./records.js";
import type { BookState } from "./store.js";

type Currency = ReportView["currencies"][number];
type Amounts = Record<ReturnType<typeof legs>[number]["column"], bigint>;
type Bucket = { count: number } & Amounts;

const bucket = (): Bucket => ({ count: 0, incomeMinor: 0n, expenseMinor: 0n, transferOutMinor: 0n, transferInMinor: 0n });
const amounts = ({ count, incomeMinor, expenseMinor, transferOutMinor, transferInMinor }: Bucket) => ({
  count,
  incomeMinor: incomeMinor.toString(),
  expenseMinor: expenseMinor.toString(),
  transferOutMinor: transferOutMinor.toString(),
  transferInMinor: transferInMinor.toString(),
});

function at<Key, Value>(map: Map<Key, Value>, key: Key, make: () => Value) {
  const current = map.get(key);
  if (current !== undefined) return current;
  const added = make();
  map.set(key, added);
  return added;
}

type Category = { id: string | null; kind: "income" | "expense"; amount: bigint; count: number };

function sumCategory(categories: Map<string, Category>, row: Extract<LedgerRecord, { type: "income" | "expense" }>, amount: bigint) {
  const key = JSON.stringify([row.type, row.categoryId]);
  const category = at(categories, key, () => ({ id: row.categoryId, kind: row.type, amount: 0n, count: 0 }));
  category.amount += amount;
  category.count++;
}

function chartLoans(state: BookState, currency: Currency, through: string) {
  const businessDates = new Map(state.records.map((record) => [record.id, record.occurredAt]));
  return state.loans
    .filter(({ definition }) => definition.currency === currency && definition.startOn <= through)
    .map(({ id, definition }) => {
      const paidOn = new Map(
        state.loanPayments
          .filter(({ loanId }) => loanId === id)
          .flatMap(({ number, recordId }) => {
            const occurredAt = businessDates.get(recordId);
            return occurredAt ? [[number, ledgerBusinessDate(occurredAt, state.book.timeZone)] as const] : [];
          }),
      );
      const schedule = loanSchedule(definition).filter(({ paymentMinor }) => paymentMinor !== "0");
      return { startOn: definition.startOn, schedule, paidOn };
    });
}

export function report(state: BookState, { from, to, currency, includeOffset, chartDetail }: z.output<typeof ReportQuery>): ReportView {
  const available = [...new Set(state.accounts.map((account) => account.currency).concat(state.book.defaultCurrency))].sort();
  const selected = currency ? [currency] : available;
  const months = reportPeriods(from, to, false);
  const daily = Date.parse(to) - Date.parse(from) < 31 * 86_400_000;
  const periods = chartDetail ? reportPeriods(from, to, daily) : months;
  const groups = new Map(
    selected.map((value) => [
      value,
      {
        aggregate: bucket(),
        days: new Map<string, Bucket>(),
        accounts: new Map<string, Bucket>(),
        categories: new Map<string, Category>(),
        monthTotals: new Map<string, Bucket>(),
        periodCategories: new Map<string, Map<string, Category>>(),
        flows: [] as { record: Exclude<LedgerRecord, { type: "transfer" }>; date: string }[],
      },
    ]),
  );
  for (const row of filteredRecords(state, { from, to, ...(currency && { currency }), ...(!includeOffset && { offset: false }) })) {
    const day = ledgerBusinessDate(row.occurredAt, state.book.timeZone);
    const counted = new Set<Currency>();
    for (const { currency: code, amount, column, accountId } of legs(row)) {
      const group = groups.get(code);
      if (!group) continue;
      const dayTotals = at(group.days, day, bucket);
      const account = at(group.accounts, accountId, bucket);
      const monthly = chartDetail ? at(group.monthTotals, day.slice(0, 7), bucket) : undefined;
      if (!counted.has(code)) {
        group.aggregate.count++;
        dayTotals.count++;
        if (monthly) monthly.count++;
        counted.add(code);
      }
      account.count++;
      group.aggregate[column] += amount;
      dayTotals[column] += amount;
      account[column] += amount;
      if (monthly) monthly[column] += amount;
      if (row.type !== "transfer") {
        sumCategory(group.categories, row, amount);
        if (chartDetail) {
          const period = daily ? day : day.slice(0, 7);
          sumCategory(
            at(group.periodCategories, period, () => new Map()),
            row,
            amount,
          );
          group.flows.push({ record: row, date: day });
        }
      }
    }
  }

  const checkpoints = balanceCheckpoints(
    state,
    periods.map(({ to }) => to),
  );
  const monthEnds = new Set(months.map(({ to }) => to));
  const lastAccounts = checkpoints.at(-1)!.accounts;
  const categories = new Map(state.dictionary.filter(({ kind }) => kind === "category").map(({ id, name }) => [id, name]));
  function categoryTotals(entries: Map<string, Category> | undefined) {
    return [...(entries?.values() ?? [])]
      .sort((a, b) => (a.amount === b.amount ? (a.id ?? "").localeCompare(b.id ?? "") : a.amount > b.amount ? -1 : 1))
      .map(({ id, kind, amount, count }) => ({ id, kind, count, label: id ? (categories.get(id) ?? "已移除的分类") : "未分类", amountMinor: amount.toString() }));
  }

  return {
    from,
    to,
    currencies: available,
    series: [...groups].map(([currency, group]) => {
      const accounts = lastAccounts.filter((account) => account.currency === currency);
      const balance = checkpoints
        .filter(({ date }) => monthEnds.has(date))
        .map(({ date, accounts }) => ({
          date,
          amountMinor: accounts
            .filter((account) => account.currency === currency)
            .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)
            .toString(),
        }));
      const summary = {
        ...amounts(group.aggregate),
        currency,
        days: [...group.days].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, ...amounts(total) })),
        accounts: accounts.map(({ id, name, balanceMinor }) => ({ id, label: name, balanceMinor, ...amounts(group.accounts.get(id) ?? bucket()) })),
        categories: categoryTotals(group.categories),
        balance,
        savingsScore: scoreSavings(group.aggregate.incomeMinor, group.aggregate.expenseMinor),
      };
      if (!chartDetail) return summary;

      const loans = chartLoans(state, currency, to);
      const netWorth = checkpoints.map(({ date, accounts }) => {
        let assets = 0n;
        let liabilities = 0n;
        for (const account of accounts) {
          if (account.currency !== currency) continue;
          const value = BigInt(account.balanceMinor);
          if (value < 0n) liabilities -= value;
          else assets += value;
        }
        for (const { startOn, schedule, paidOn } of loans) {
          if (startOn > date) continue;
          for (const installment of schedule) {
            const paid = paidOn.get(installment.number);
            if (!paid || paid > date) liabilities += BigInt(installment.principalMinor);
          }
        }
        return { date, assetsMinor: assets.toString(), liabilitiesMinor: liabilities.toString(), amountMinor: (assets - liabilities).toString() };
      });
      const closing = netWorth.at(-1)!;
      const byCategory = (kind: Category["kind"], names: string[]) => [...group.categories.values()].reduce((sum, entry) => (entry.kind === kind && entry.id && names.includes(categories.get(entry.id) ?? "") ? sum + entry.amount : sum), 0n);
      const sumBalances = (types: string[]) => accounts.reduce((sum, account) => (types.includes(account.type) ? sum + BigInt(account.balanceMinor) : sum), 0n);
      const monthlyPayment = loans.reduce((sum, { schedule, paidOn }) => {
        const next = schedule.find(({ number }) => {
          const paid = paidOn.get(number);
          return !paid || paid > to;
        });
        return sum + BigInt(next?.paymentMinor ?? "0");
      }, 0n);

      return {
        ...summary,
        charts: {
          months: months.map((period) => ({ ...period, ...amounts(group.monthTotals.get(period.from.slice(0, 7)) ?? bucket()) })),
          periods: periods.map((period) => ({ ...period, categories: categoryTotals(group.periodCategories.get(daily ? period.from : period.from.slice(0, 7))) })),
          accounts: accounts.map(({ id, name }) => ({
            id,
            label: name,
            points: checkpoints.map(({ date, accounts }) => ({ date, amountMinor: accounts.find((account) => account.id === id)!.balanceMinor })),
          })),
          netWorth,
          ...financialHealth({
            income: group.aggregate.incomeMinor,
            expense: group.aggregate.expenseMinor,
            months: BigInt(months.length),
            assets: BigInt(closing.assetsMinor),
            liabilities: BigInt(closing.liabilitiesMinor),
            liquid: sumBalances(["cash", "bank", "wallet"]),
            investment: sumBalances(["investment"]),
            monthlyPayment,
            passiveIncome: byCategory("income", ["投资收益", "分红"]),
            insurance: byCategory("expense", ["保险"]),
            ...expenseBudgetTotals(state, group.flows, currency, from, to),
          }),
        },
      };
    }),
  };
}
