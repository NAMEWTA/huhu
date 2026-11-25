import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { csvParseRows } from "d3-dsv";
import { afterEach, expect, test } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, RecordsPage } from "../src/shared/entries.js";
import type { BillSource, ImportPreview, ImportResult } from "../src/shared/imports.js";
import { ledgerEngine } from "./fixture.js";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const fixture = (name: string) => readFileSync(new URL(`../../../tests/fixtures/ledger/${name}`, import.meta.url));
const confirm = (preview: ImportPreview, ids = preview.rows.filter(({ state }) => state === "ready").map(({ rowId }) => rowId)) =>
  ({ bookId: preview.bookId, previewId: preview.previewId, expectedRevision: preview.expectedRevision, inputDigest: preview.inputDigest,
    mappingRevision: preview.mappingRevision, intentKey: randomUUID(), selectedRowIds: ids });

async function setup(zone = "Asia/Taipei") {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-ledger-imports-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const engine = await ledgerEngine(directory);
  cleanup.push(engine.close);
  const book = await engine.call<Book>("ledger.books.create", {
    name: "账单", defaultCurrency: "CNY", timeZone: zone, firstAccount: { name: "银行" },
  });
  const view = () => engine.call<AccountsView>("ledger.accounts.list", { bookId: book.id });
  for (const [name, type] of [["微信", "wallet"], ["花呗", "credit"]]) {
    const current = await view();
    await engine.call("ledger.accounts.create", {
      bookId: book.id, expectedRevision: current.book.revision, openingMinor: "0", effectiveBusinessDate: current.businessDate,
      account: { name, type, currency: "CNY", labels: { accountTypeId: null, bankId: null } },
    });
  }
  const prepare = (source: BillSource, fileName: string, base64 = fixture(fileName).toString("base64")) => engine.call<ImportPreview>("ledger.imports.preview", {
    bookId: book.id, source, sourceTimeZone: "Asia/Shanghai", fileName, base64,
  });
  return { directory, engine, book, view, prepare };
}

test("UTF-8 Alipay, GBK JD and WeChat XLSX preserve physical rows, business dates, transfers and refund direction", async () => {
  const f = await setup("America/New_York");
  const alipay = await f.prepare("alipay", "alipay.csv");
  expect(alipay).toMatchObject({ encoding: "UTF-8", rows: [
    { line: 3, kind: "expense", amount: "32.50", sourceDate: "2026-06-01 09:30:00", businessDate: "2026-05-31" },
    { line: 5, kind: "transfer", state: "ready", amount: "18.05", sourceDestination: "花呗" },
  ] });
  expect(await f.engine.call<ImportResult>("ledger.imports.confirm", confirm(alipay))).toMatchObject({ imported: 2 });
  const jd = await f.prepare("jd", "jd-gbk.csv");
  expect(jd).toMatchObject({ encoding: "GBK", rows: [{ title: "测试京东退款", kind: "income", amount: "20.01" }] });
  await f.engine.call("ledger.imports.confirm", confirm(jd));
  const wechat = await f.prepare("wechat", "wechat.xlsx");
  expect(wechat).toMatchObject({ encoding: "XLSX", rows: [
    { kind: "expense", originalNumber: "wx-sample-1", sourceDate: expect.stringMatching(/T12:00:00$/) },
    { kind: "income", originalNumber: "wx-sample-2" },
  ] });
  await f.engine.call("ledger.imports.confirm", confirm(wechat));
  const result = await f.engine.call<RecordsPage>("ledger.records.list", { bookId: f.book.id });
  expect(result.total).toBe(5);
  expect(result.totals).toMatchObject([{ currency: "CNY", incomeMinor: "7001", expenseMinor: "8250", transferOutMinor: "1805" }]);
});

test("cancel and stale mappings leave data unchanged; explicit repeated purchases commit once and remain replayable after reopen", async () => {
  const f = await setup();
  const first = await f.prepare("csv", "generic.csv");
  expect(first.counts).toMatchObject({ pending: 3, invalid: 1 });
  expect(first.proposedAccounts).toEqual(["待匹配账户"]);
  await f.engine.call("ledger.imports.cancel", { bookId: f.book.id, previewId: first.previewId });
  expect(await f.engine.invoke("ledger.imports.resolve", {
    bookId: f.book.id, previewId: first.previewId, rows: [{ rowId: first.rows[0]!.rowId, skip: true }],
  })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(await f.engine.call<RecordsPage>("ledger.records.list", { bookId: f.book.id })).toMatchObject({ total: 0 });

  const old = await f.prepare("csv", "generic.csv");
  const view = await f.view();
  const accountId = view.accounts[0]!.id;
  const mapping = await f.engine.call<{ rules: unknown[] }>("ledger.mappings.save", {
    bookId: f.book.id, expectedRevision: view.book.revision, rules: [
      { source: "csv", kind: "account", original: "　待匹配账户", targetId: accountId, descriptionContains: "　文具 " },
      { source: "csv", kind: "account", original: "待匹配账户", targetId: accountId, descriptionContains: "文具" },
    ],
  });
  expect(mapping.rules).toHaveLength(1);
  expect(await f.engine.invoke("ledger.imports.confirm", confirm(old, [old.rows[0]!.rowId]))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const review = await f.prepare("csv", "generic.csv");
  expect(review.counts).toMatchObject({ ready: 1, duplicate: 1, pending: 1, invalid: 1 });
  const resolved = await f.engine.call<ImportPreview>("ledger.imports.resolve", {
    bookId: f.book.id, previewId: review.previewId, rows: [{ rowId: review.rows[2]!.rowId, skip: true }],
  });
  expect(resolved.previewId).not.toBe(review.previewId);
  expect(resolved.counts.skipped).toBe(1);
  const input = confirm(resolved, resolved.rows.slice(0, 2).map(({ rowId }) => rowId));
  const concurrent = await Promise.all([
    f.engine.call<ImportResult>("ledger.imports.confirm", input),
    f.engine.call<ImportResult>("ledger.imports.confirm", input),
  ]);
  expect(concurrent[0]).toEqual(concurrent[1]);
  expect(concurrent[0]).toMatchObject({ imported: 2 });
  await f.engine.close();
  const reopened = await ledgerEngine(f.directory);
  cleanup.push(reopened.close);
  expect(await reopened.call<ImportResult>("ledger.imports.confirm", input)).toEqual(concurrent[0]);
  expect(await reopened.call("ledger.imports.status", { bookId: f.book.id, previewId: input.previewId })).toEqual(concurrent[0]);
  const preview = await reopened.call<ImportPreview>("ledger.imports.preview", {
    bookId: f.book.id, source: "csv", sourceTimeZone: "Asia/Shanghai", fileName: "generic.csv", base64: fixture("generic.csv").toString("base64"),
  });
  expect(preview.counts.imported).toBe(2);
  const filters = { query: "文具", minMinor: "425", maxMinor: "425", currency: "CNY" };
  const exportResult = await reopened.call<{ csv: string; count: number }>("ledger.exports.csv", { bookId: f.book.id, filters });
  const pageOne = await reopened.call<RecordsPage>("ledger.records.list", { bookId: f.book.id, filters, pageSize: 1 });
  const pageTwo = await reopened.call<RecordsPage>("ledger.records.list", { bookId: f.book.id, filters, pageSize: 1, page: 2 });
  expect(exportResult.count).toBe(2);
  expect(csvParseRows(exportResult.csv.slice(1)).slice(1).map((row) => row[0])).toEqual([...pageOne.rows, ...pageTwo.rows].map(({ record }) => record.id));
});

test("custom CSV column and type mappings keep exact minor units; oversized expanded archives are rejected", async () => {
  const f = await setup();
  const file = Buffer.from("备注列,名称列,数值列,时间列,账号列,类别列\n示例,=1+1,0.01,2026-06-01 01:02:03,银行,OUT\n");
  const preview = await f.engine.call<ImportPreview>("ledger.imports.preview", {
    bookId: f.book.id, source: "csv", sourceTimeZone: "UTC", fileName: "mapped.csv", base64: file.toString("base64"),
    columns: { headerLine: 1, date: 4, amount: 3, type: 6, account: 5, title: 2, memo: 1, typeValues: { expense: "OUT", income: "IN", transfer: "MOVE" } },
  });
  expect(preview.rows[0]).toMatchObject({ title: "=1+1", state: "ready", amount: "0.01" });
  await f.engine.call("ledger.imports.confirm", confirm(preview));
  const csv = await f.engine.call<{ csv: string }>("ledger.exports.csv", { bookId: f.book.id });
  expect(csvParseRows(csv.csv.slice(1))[1]).toContain("'=1+1");
  const data = fixture("wechat.xlsx");
  const directory = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  data.writeUInt32LE(33 * 1024 * 1024, directory + 24);
  await expect(f.prepare("wechat", "wechat.xlsx", data.toString("base64"))).rejects.toThrow("超出体积上限");
});
