import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ledgerBusinessDayRange } from "@huhu/contracts";
import { afterEach, expect, test } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, BasePreview, RecordsPage } from "../src/shared/entries.js";
import type { Loan, LoanHistory } from "../src/shared/loans.js";
import { type ReportView } from "../src/shared/reports.js";
import { ledgerEngine } from "./fixture.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-reports-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const engine = await ledgerEngine(root);
  cleanup.push(engine.close);
  const book = await engine.call<Book>("ledger.books.create", {
    name: "报表夹具",
    defaultCurrency: "CNY",
    timeZone: "Asia/Taipei",
    firstAccount: { name: "银行" },
  });
  const accounts = () => engine.call<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const snapshot = await accounts();
  const day = snapshot.businessDate;
  return { engine, root, book, accounts, day, first: snapshot.accounts[0]! };
}

test("L5 midnight and currency filters agree across daily data, drill-down selection and the balance checkpoints", async () => {
  const { engine, book, accounts, day, first } = await setup();
  const usd = await engine.call<{ id: string }>("ledger.accounts.create", {
    bookId: book.id,
    expectedRevision: (await accounts()).book.revision,
    openingMinor: "1500",
    effectiveBusinessDate: day,
    account: { name: "美元", type: "bank", currency: "USD", labels: { accountTypeId: null, bankId: null } },
  });
  const midnight = ledgerBusinessDayRange(day, book.timeZone).from;
  const earlier = new Date(Date.parse(midnight) - 1).toISOString();
  for (const [title, accountId, currency, occurredAt, amountMinor, type] of [
    ["前日一毫秒", first.id, "CNY", earlier, "900", "income"],
    ["午夜收入", first.id, "CNY", midnight, "1200", "income"],
    ["同日支出", first.id, "CNY", midnight, "600", "expense"],
    ["美元收入", usd.id, "USD", midnight, "300", "income"],
  ] as const) {
    await engine.call("ledger.records.create", {
      bookId: book.id,
      expectedRevision: (await accounts()).book.revision,
      title,
      intentKey: randomUUID(),
      record: { type, accountId, occurredAt, amountMinor, currency, categoryId: null, tagIds: [], payee: null, memo: null, attachmentIds: [] },
    });
  }
  const period = { from: day, to: day };
  const result = await engine.call<ReportView>("ledger.reports.query", { bookId: book.id, ...period });
  expect(result.series).toMatchObject([
    { currency: "CNY", count: 2, incomeMinor: "1200", expenseMinor: "600", days: [{ date: day, count: 2 }], savingsScore: 100 },
    { currency: "USD", count: 1, incomeMinor: "300", expenseMinor: "0", days: [{ date: day, count: 1 }] },
  ]);
  const live = (await accounts()).accounts;
  for (const row of result.series) {
    expect(row.accounts.map(({ balanceMinor }) => balanceMinor)).toEqual(live.filter(({ currency }) => currency === row.currency).map(({ balanceMinor }) => balanceMinor));
    expect(row.balance).toEqual([{ date: day, amountMinor: row.currency === "CNY" ? "600" : "1800" }]);
    expect(await engine.call<RecordsPage>("ledger.records.list", { bookId: book.id, filters: { ...period, currency: row.currency, type: "income", uncategorized: true, offset: false } })).toMatchObject({
      total: 1,
      rows: [{ businessDate: day, title: row.currency === "CNY" ? "午夜收入" : "美元收入" }],
    });
  }
});

test("L5 empty score, exact year holiday status and card order are durable", async () => {
  const { engine, book, root, day, accounts } = await setup();
  const year = day.slice(0, 4);
  const query = { bookId: book.id, year };
  expect(await engine.call("ledger.calendar.holidays", query)).toBeNull();
  expect(await engine.call("ledger.reports.query", { bookId: book.id, from: day, to: day })).toMatchObject({ series: [{ count: 0, savingsScore: null }] });
  const data = { year, source: "离线夹具", entries: [{ date: day, name: "补班", isWorkday: true }] };
  const revision = async () => ({ bookId: book.id, expectedRevision: (await accounts()).book.revision });
  expect(await engine.invoke("ledger.calendar.importHolidays", { ...(await revision()), data: { ...data, entries: [...data.entries, ...data.entries] } })).toMatchObject({ ok: false });
  expect(await engine.call("ledger.calendar.importHolidays", { ...(await revision()), data })).toEqual(data);
  const cards = [
    { id: "balances", visible: true },
    { id: "summary", visible: false },
    { id: "recent", visible: true },
  ];
  await engine.call("ledger.reports.savePreferences", { ...(await revision()), cards });
  await engine.close();

  const reopened = await ledgerEngine(root);
  cleanup.push(reopened.close);
  expect(await reopened.call("ledger.calendar.holidays", query)).toEqual(data);
  expect(await reopened.call("ledger.calendar.holidays", { ...query, year: String(Number(year) + 1) })).toBeNull();
  expect(await reopened.call("ledger.reports.preferences", { bookId: book.id })).toMatchObject({ cards });
});

test("chart months fill empty periods, isolate currencies and reconcile loan and account checkpoints", async () => {
  const { engine, book, accounts, first } = await setup();
  const version = async () => ({ bookId: book.id, expectedRevision: (await accounts()).book.revision });
  const date = "2026-03-01";
  const addAccount = async (name: string, type: "bank" | "credit", openingMinor: string, currency: "CNY" | "USD" = "CNY") =>
    engine.call<{ id: string }>("ledger.accounts.create", {
      ...(await version()),
      openingMinor,
      effectiveBusinessDate: date,
      account: { name, type, currency, labels: { accountTypeId: null, bankId: null } },
    });
  const bank = await addAccount("存款", "bank", "9007199254740993");
  const credit = await addAccount("欠款", "credit", "-5000");
  await addAccount("信用卡溢缴", "credit", "3000");
  const foreign = await addAccount("外币", "bank", "8700", "USD");
  const add = async (title: string, type: "income" | "expense", amountMinor: string, businessDate: string, accountId = bank.id, currency: "CNY" | "USD" = "CNY") =>
    engine.call<{ id: string; revision: string }>("ledger.records.create", {
      ...(await version()),
      intentKey: randomUUID(),
      title,
      record: { type, amountMinor, occurredAt: ledgerBusinessDayRange(businessDate, book.timeZone).from, accountId, currency, categoryId: null, tagIds: [], payee: null, memo: null, attachmentIds: [] },
    });
  await add("三月收入", "income", "2000", date);
  await add("五月支出", "expense", "1000", "2026-05-04");
  await add("五月外币收入", "income", "10000", "2026-05-04", foreign.id, "USD");
  const refund = await add("退款", "income", "200", "2026-05-05");
  const expense = await add("已退款支出", "expense", "200", "2026-05-05");
  const offset = { ...(await version()), members: [refund, expense].map(({ id, revision }) => ({ recordId: id, recordRevision: revision })) };
  const { previewId } = await engine.call<{ previewId: string }>("ledger.reconciliation.previewOffset", offset);
  await engine.call("ledger.reconciliation.confirmOffset", { ...offset, previewId });

  const loan = await engine.call<Loan>("ledger.loans.create", {
    ...(await version()),
    definition: { name: "分期贷款", accountId: bank.id, currency: "CNY", principalMinor: "6000", annualRatePercent: "0", months: 3, method: "equal-principal", startOn: "2026-04-01" },
  });
  const scope = { bookId: book.id, from: "2025-12-01", to: "2026-05-10", chartDetail: true };
  const result = await engine.call<ReportView>("ledger.reports.query", scope);
  const cny = result.series.find(({ currency }) => currency === "CNY")!;
  const usd = result.series.find(({ currency }) => currency === "USD")!;
  expect(cny.charts?.months.map(({ from, incomeMinor, expenseMinor }) => [from.slice(0, 7), incomeMinor, expenseMinor])).toEqual([
    ["2025-12", "0", "0"],
    ["2026-01", "0", "0"],
    ["2026-02", "0", "0"],
    ["2026-03", "2000", "0"],
    ["2026-04", "0", "0"],
    ["2026-05", "0", "1000"],
  ]);
  // Month-bucketed periods carry that month's category totals (keyed by month, not by business day).
  expect(cny.charts?.periods.map(({ from, categories }) => [from.slice(0, 7), categories.map(({ kind, amountMinor }) => [kind, amountMinor])])).toEqual([
    ["2025-12", []],
    ["2026-01", []],
    ["2026-02", []],
    ["2026-03", [["income", "2000"]]],
    ["2026-04", []],
    ["2026-05", [["expense", "1000"]]],
  ]);
  expect(cny.charts?.netWorth.find(({ date }) => date === "2026-03-31")).toMatchObject({ liabilitiesMinor: "5000" });
  expect(cny.charts?.netWorth.at(-1)).toEqual({ date: scope.to, assetsMinor: "9007199254744993", liabilitiesMinor: "11000", amountMinor: "9007199254733993" });
  expect(cny.charts?.accounts.find(({ id }) => id === credit.id)?.points.at(-1)?.amountMinor).toBe("-5000");
  expect(cny.charts?.accounts.find(({ id }) => id === first.id)?.points.at(-1)?.amountMinor).toBe("0");
  expect(usd.charts?.netWorth.at(-1)).toMatchObject({ assetsMinor: "18700", liabilitiesMinor: "0", amountMinor: "18700" });
  expect(usd.charts?.accounts.map(({ id }) => id)).toEqual([foreign.id]);
  expect(cny.charts?.health.find(({ label }) => label === "储蓄能力")?.score).toBe(100);

  const days = { from: "2026-05-04", to: "2026-05-06", currency: "CNY" as const };
  const chart = (await engine.call<ReportView>("ledger.reports.query", { bookId: book.id, ...days, chartDetail: true })).series[0]?.charts;
  expect(chart?.periods.map(({ from, categories }) => [from, categories.map(({ amountMinor }) => amountMinor)])).toEqual([
    ["2026-05-04", ["1000"]],
    ["2026-05-05", []],
    ["2026-05-06", []],
  ]);
  expect(chart?.health.every(({ score }) => score === null)).toBe(true);
  expect(chart?.periodHealth.every(({ score }) => score === null)).toBe(true);
  const listed = await engine.call<RecordsPage>("ledger.records.list", { bookId: book.id, filters: { ...days, type: "expense", uncategorized: true, offset: false } });
  expect(listed.rows.map(({ title }) => title)).toEqual(["五月支出"]);
  const includingOffset = (await engine.call<ReportView>("ledger.reports.query", { bookId: book.id, ...days, includeOffset: true, chartDetail: true })).series[0]?.charts;
  expect(includingOffset?.periods[1]?.categories.map(({ amountMinor }) => amountMinor)).toEqual(["200", "200"]);
  expect(includingOffset?.netWorth).toEqual(chart?.netWorth);

  const history = await engine.call<LoanHistory>("ledger.loans.previewHistory", { bookId: book.id, loanId: loan.id });
  const closingBefore = cny.charts?.netWorth.at(-1);
  await engine.call("ledger.loans.confirmHistory", { ...history.preview, selected: [1] });
  const closingAfter = (await engine.call<ReportView>("ledger.reports.query", { ...scope, currency: "CNY" })).series[0]?.charts?.netWorth.at(-1);
  expect(closingAfter).toMatchObject({ liabilitiesMinor: "9000", amountMinor: closingBefore?.amountMinor });

  const preview = await engine.call<BasePreview>("ledger.accounts.previewBalance", { ...(await version()), accountId: bank.id, effectiveBusinessDate: "2026-05-05", balanceMinor: "7000" });
  expect(preview.currentBalanceMinor).toBe("9007199254739993");
  const { currentBalanceMinor: _, ...confirmation } = preview;
  await engine.call("ledger.accounts.confirmBalance", confirmation);
  await engine.call("ledger.records.create", {
    ...(await version()),
    title: "换汇",
    intentKey: randomUUID(),
    record: {
      type: "transfer",
      occurredAt: ledgerBusinessDayRange("2026-05-06", book.timeZone).from,
      fromAccountId: bank.id,
      fromCurrency: "CNY",
      fromAmountMinor: "200",
      toAccountId: foreign.id,
      toCurrency: "USD",
      toAmountMinor: "30",
      categoryId: null,
      tagIds: [],
      payee: null,
      memo: null,
      attachmentIds: [],
    },
  });
  const checked = await engine.call<ReportView>("ledger.reports.query", { bookId: book.id, from: days.from, to: days.to, chartDetail: true });
  expect(
    checked.series
      .find(({ currency }) => currency === "CNY")
      ?.charts?.accounts.find(({ id }) => id === bank.id)
      ?.points.map(({ amountMinor }) => amountMinor),
  ).toEqual(["9007199254739993", "7000", "6800"]);
  expect(
    checked.series
      .find(({ currency }) => currency === "USD")
      ?.charts?.accounts.find(({ id }) => id === foreign.id)
      ?.points.map(({ amountMinor }) => amountMinor),
  ).toEqual(["18700", "18700", "18730"]);
});
