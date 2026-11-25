import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ledgerBusinessDayRange } from "@huhu/contracts";
import { afterEach, expect, test } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, RecordsPage } from "../src/shared/entries.js";
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
