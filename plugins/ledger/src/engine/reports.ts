import { ledgerBusinessDate } from "@huhu/contracts";
import type { z } from "zod";
import { calendarMonth, type ReportQuery, type ReportView } from "../shared/reports.js";
import { accountsView } from "./accounts.js";
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

function balanceDates(from: string, to: string) {
  const dates: string[] = [];
  let monthEnd = calendarMonth(from.slice(0, 7)).to;
  while (monthEnd < to) {
    dates.push(monthEnd);
    const next = new Date(monthEnd + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    monthEnd = calendarMonth(next.toISOString().slice(0, 7)).to;
  }
  return [...dates, to];
}

/** HomiBook savings breakpoints, evaluated with integer ratios for the selected window. */
function savingsScore({ incomeMinor, expenseMinor }: Bucket) {
  if (!incomeMinor) return null;
  const net = incomeMinor - expenseMinor;
  const ratio = (net * 10_000n) / incomeMinor;
  const band = [
    { from: 0n, to: 1_000n, low: 20n, high: 40n },
    { from: 1_000n, to: 2_000n, low: 40n, high: 60n },
    { from: 2_000n, to: 3_000n, low: 60n, high: 80n },
    { from: 3_000n, to: 5_000n, low: 80n, high: 100n },
  ].find(({ to }) => ratio <= to);
  if (!band) return 100;
  if (ratio < 0n) return 20;
  const width = band.to - band.from;
  return Number(band.low + ((ratio - band.from) * (band.high - band.low) + width / 2n) / width);
}

export function report(state: BookState, { from, to, currency, includeOffset }: z.output<typeof ReportQuery>): ReportView {
  const available = [...new Set(state.accounts.map((account) => account.currency).concat(state.book.defaultCurrency))].sort();
  const selected = currency ? [currency] : available;
  const groups = new Map(
    selected.map((value) => [
      value,
      {
        aggregate: bucket(),
        days: new Map<string, Bucket>(),
        accounts: new Map<string, Bucket>(),
        categories: new Map<string, { id: string | null; kind: "income" | "expense"; amount: bigint; count: number }>(),
      },
    ]),
  );
  for (const row of filteredRecords(state, { from, to, ...(currency && { currency }), ...(!includeOffset && { offset: false }) })) {
    const day = ledgerBusinessDate(row.occurredAt, state.book.timeZone);
    const counted = new Set<Currency>();
    for (const { currency: code, amount, column, accountId } of legs(row)) {
      const group = groups.get(code);
      if (!group) continue;
      const daily = at(group.days, day, bucket);
      const account = at(group.accounts, accountId, bucket);
      if (!counted.has(code)) {
        group.aggregate.count++;
        daily.count++;
        counted.add(code);
      }
      account.count++;
      group.aggregate[column] += amount;
      daily[column] += amount;
      account[column] += amount;
      if (row.type !== "transfer") {
        const key = JSON.stringify([row.type, row.categoryId]);
        const category = at(group.categories, key, () => ({ id: row.categoryId, kind: row.type, amount: 0n, count: 0 }));
        category.amount += amount;
        category.count++;
      }
    }
  }

  const checkpoints = balanceDates(from, to).map((date) => ({ date, accounts: accountsView(state, date).accounts }));
  const lastAccounts = checkpoints.at(-1)!.accounts;
  const categories = new Map(state.dictionary.filter(({ kind }) => kind === "category").map(({ id, name }) => [id, name]));
  return {
    from,
    to,
    currencies: available,
    series: [...groups].map(([currency, group]) => ({
      ...amounts(group.aggregate),
      currency,
      days: [...group.days].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, ...amounts(total) })),
      accounts: lastAccounts
        .filter((account) => account.currency === currency)
        .map(({ id, name, balanceMinor }) => ({
          id,
          label: name,
          balanceMinor,
          ...amounts(group.accounts.get(id) ?? bucket()),
        })),
      categories: [...group.categories.values()]
        .sort((a, b) => (a.amount === b.amount ? (a.id ?? "").localeCompare(b.id ?? "") : a.amount > b.amount ? -1 : 1))
        .map(({ id, kind, amount, count }) => ({ id, kind, count, label: id ? (categories.get(id) ?? "已移除的分类") : "未分类", amountMinor: amount.toString() })),
      balance: checkpoints.map(({ date, accounts }) => ({
        date,
        amountMinor: accounts
          .filter((account) => account.currency === currency)
          .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)
          .toString(),
      })),
      savingsScore: savingsScore(group.aggregate),
    })),
  };
}
