import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ledgerBusinessDayRange, type LedgerRecord } from "@huhu/contracts";
import { csvParseRows } from "d3-dsv";
import { afterEach, expect, test } from "vitest";
import { bookDirectory, stateSchema } from "../src/engine/store.js";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, Attachment, DictionaryItem, RecordsPage } from "../src/shared/entries.js";
import type { BudgetOverview } from "../src/shared/budgets.js";
import type { ImportPreview } from "../src/shared/imports.js";
import type { CandidateGroups, MergePreview, OffsetGroupView, OffsetPreview } from "../src/shared/reconciliation.js";
import { ledgerEngine } from "./fixture.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const selection = (rows: LedgerRecord[]) => rows.map(({ id, revision }) => ({ recordId: id, recordRevision: revision }));

async function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-ledger-reconcile-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const engine = await ledgerEngine(directory);
  cleanup.push(engine.close);
  const book = await engine.call<Book>("ledger.books.create", {
    name: "对账账本", defaultCurrency: "CNY", timeZone: "Asia/Taipei", firstAccount: { name: "银行" },
  });
  const accounts = () => engine.call<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const initial = await accounts();
  const today = initial.businessDate;
  const first = initial.accounts[0]!;
  const second = await engine.call<{ id: string }>("ledger.accounts.create", {
    bookId: book.id, expectedRevision: initial.book.revision, openingMinor: "0", effectiveBusinessDate: today,
    account: { name: "钱包", currency: "CNY", type: "wallet", labels: { accountTypeId: null, bankId: null } },
  });
  const occurredAt = ledgerBusinessDayRange(today, book.timeZone).from;
  const version = async () => ({ bookId: book.id, expectedRevision: (await accounts()).book.revision });
  const records = () => engine.call<RecordsPage>("ledger.records.list", { bookId: book.id });
  function input(type: "income" | "expense", accountId: string, amountMinor: string) {
    return { type, accountId, amountMinor, currency: "CNY", occurredAt, categoryId: null, tagIds: [], attachmentIds: [], payee: "测试商户", memo: "演练" };
  }
  const create = async (title: string, draft: unknown) => engine.call<LedgerRecord>("ledger.records.create", { ...await version(), title, intentKey: randomUUID(), record: draft });
  async function category(name: string) {
    return (await engine.call<DictionaryItem>("ledger.dictionaries.save", { ...await version(), kind: "category", name })).id;
  }
  const statePath = bookDirectory(book.id) + "/state.json";
  const stored = () => stateSchema.parse(JSON.parse(engine.vault.files.read(statePath)!.bytes.toString("utf8")));
  async function references(items: ReturnType<typeof stored>["recordReferences"], importRows: Record<string, string> = {}) {
    const current = engine.vault.files.read(statePath)!;
    await engine.vault.files.write(statePath, Buffer.from(JSON.stringify({ ...stored(), recordReferences: items, importRows })), { expectedVersion: current.version });
  }
  return { engine, book, first, second, version, accounts, records, input, create, category, stored, references };
}

test("100 expense and 60+40 refunds form one cross-account group; rollback restores gross reports without changing balances", async () => {
  const f = await setup();
  const charge = await f.create("原支出", f.input("expense", f.first.id, "10000"));
  const refund1 = await f.create("首笔退款", f.input("income", f.second.id, "6000"));
  const refund2 = await f.create("次笔退款", f.input("income", f.second.id, "4000"));
  const original = await f.records();
  expect(original.totals).toMatchObject([{ expenseMinor: "10000", incomeMinor: "10000" }]);
  const balances = (await f.accounts()).accounts.map(({ balanceMinor }) => balanceMinor);
  expect(balances).toEqual(["-10000", "10000"]);
  expect(await f.engine.call<CandidateGroups>("ledger.reconciliation.offsetCandidates", {
    bookId: f.book.id, recordId: charge.id, sameAccount: true,
  })).toMatchObject({ groups: [] });
  const candidates = await f.engine.call<CandidateGroups>("ledger.reconciliation.offsetCandidates", { bookId: f.book.id, recordId: charge.id });
  expect(candidates.groups).toHaveLength(1);
  expect(new Set(candidates.groups[0]!.map(({ record }) => record.id))).toEqual(new Set([charge.id, refund1.id, refund2.id]));
  const input = { ...await f.version(), members: selection([charge, refund1, refund2]) };
  const preview = await f.engine.call<OffsetPreview>("ledger.reconciliation.previewOffset", input);
  expect(preview).toMatchObject({ currency: "CNY", amountMinor: "10000" });
  await f.engine.call("ledger.reconciliation.confirmOffset", { ...input, previewId: preview.previewId });
  expect(await f.records()).toMatchObject({ total: 3, totals: [], rows: [{ offset: true }, { offset: true }, { offset: true }] });
  expect((await f.accounts()).accounts.map(({ balanceMinor }) => balanceMinor)).toEqual(balances);

  const write = {
    ...await f.version(), recordId: charge.id, recordRevision: charge.revision, title: "原支出",
    record: f.input("expense", f.first.id, "9900"),
  };
  expect(await f.engine.invoke("ledger.records.update", write)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  await f.engine.call("ledger.records.update", { ...write, record: { ...f.input("expense", f.first.id, "10000"), memo: "已核对" } });
  const group = await f.engine.call<OffsetGroupView>("ledger.reconciliation.offsetGroup", { bookId: f.book.id, recordId: refund1.id });
  expect(group.rows).toHaveLength(3);
  expect(await f.engine.call("ledger.reconciliation.undoOffset", {
    ...await f.version(), offsetId: group.group.id, offsetRevision: group.group.revision,
  })).toEqual({ restored: 3 });
  expect((await f.records()).totals).toEqual(original.totals);
  expect((await f.accounts()).accounts.map(({ balanceMinor }) => balanceMinor)).toEqual(balances);
});

test("L11 导入、平账、预算、总览、报表与 CSV 共用业务日和流水集合", async () => {
  const f = await setup();
  const { call } = f.engine;
  const bookId = f.book.id;
  const { businessDate } = await f.accounts();
  const period = { from: businessDate, to: businessDate };
  const budgetQuery = { bookId, year: businessDate.slice(0, 4), month: businessDate.slice(5, 7) };
  const preview = await call<ImportPreview>("ledger.imports.preview", {
    bookId, fileName: "一条账单.csv", source: "csv", sourceTimeZone: f.book.timeZone,
    base64: Buffer.from(`日期,事项,金额,类型,账户,交易单号\n${businessDate} 00:00:00,报销支出,100.00,支出,银行,upstream-charge\n`).toString("base64"),
  });
  expect(preview.rows[0]).toMatchObject({ businessDate, state: "ready" });
  await call("ledger.imports.confirm", {
    ...await f.version(), previewId: preview.previewId, inputDigest: preview.inputDigest,
    mappingRevision: preview.mappingRevision, intentKey: randomUUID(), selectedRowIds: [preview.rows[0]!.rowId],
  });
  const charge = (await f.records()).rows[0]!.record;
  const refund = await f.create("报销退款", f.input("income", f.second.id, "10000"));
  const { id: yen } = await call<{ id: string }>("ledger.accounts.create", {
    ...await f.version(), openingMinor: "0", effectiveBusinessDate: businessDate,
    account: { name: "日元账户", currency: "JPY", type: "bank", labels: { accountTypeId: null, bankId: null } },
  });
  const deposit = await f.create("日元收入", { ...f.input("income", yen, "750"), currency: "JPY" });
  await call("ledger.budgets.saveBatch", {
    ...await f.version(), budgets: [{ definition: { type: "fixed", name: "报销预算", month: businessDate.slice(0, 7),
      currency: "CNY", direction: "expense", categoryIds: [], limitMinor: "15000" } }],
  });
  const budgets = () => call<BudgetOverview>("ledger.budgets.list", budgetQuery);
  expect((await budgets()).totals).toMatchObject([{ currency: "CNY", actualMinor: "10000", remainingMinor: "5000" }]);
  const before = (await f.accounts()).accounts.map(({ id, balanceMinor }) => [id, balanceMinor]);
  const offset = { ...await f.version(), members: selection([charge, refund]) };
  const group = await call<OffsetPreview>("ledger.reconciliation.previewOffset", offset);
  await call("ledger.reconciliation.confirmOffset", { ...offset, previewId: group.previewId });

  expect((await f.accounts()).accounts.map(({ id, balanceMinor }) => [id, balanceMinor])).toEqual(before);
  const monthly = await budgets();
  expect(monthly.totals).toMatchObject([{ currency: "CNY", actualMinor: "0", remainingMinor: "15000" }]);
  expect(await call("ledger.overview.activity", { bookId })).toMatchObject({ businessDate, revision: monthly.revision, budgetTotals: monthly.totals });
  const report = await call("ledger.reports.query", { bookId, ...period });
  expect(report).toMatchObject({ series: [
    { currency: "CNY", incomeMinor: "0", expenseMinor: "0", count: 0 },
    { currency: "JPY", incomeMinor: "750", expenseMinor: "0", count: 1 },
  ]});
  const filters = { ...period, offset: false };
  const page = await call<RecordsPage>("ledger.records.list", { bookId, filters });
  expect(page.rows.map(({ record }) => record.id)).toEqual([deposit.id]);
  const csv = await call<{ count: number; csv: string }>("ledger.exports.csv", { bookId, filters });
  expect(csv.count).toBe(page.total);
  expect(csvParseRows(csv.csv.slice(1)).slice(1).map(([id]) => id)).toEqual([deposit.id]);
});

test("merge checks current member versions, resolves account/category conflicts and migrates real attachments and contract references", async () => {
  const f = await setup();
  const originalCategory = await f.category("交通");
  const duplicateCategory = await f.category("差旅");
  const keep = await f.create("原流水", { ...f.input("expense", f.first.id, "4230"), categoryId: originalCategory, memo: "原备注" });
  const duplicate = await f.create("另一个来源", { ...f.input("expense", f.second.id, "4230"), categoryId: duplicateCategory, memo: "补充凭证" });
  const base64 = Buffer.from("真实受管凭证").toString("base64");
  const receipt = await f.engine.call<Attachment>("ledger.attachments.upload", {
    ...await f.version(), recordId: duplicate.id, recordRevision: duplicate.revision, fileName: "receipt.txt", mediaType: "text/plain", base64,
  });
  await f.references([
    { kind: "note", targetId: "note-sample", recordId: duplicate.id },
    { kind: "note", targetId: "note-sample", recordId: keep.id },
    { kind: "occurrence", targetId: "plan-1:2026-11", recordId: duplicate.id },
  ], { "fixture-import": duplicate.id });
  const defaults = await f.engine.call<CandidateGroups>("ledger.reconciliation.duplicates", { bookId: f.book.id });
  expect(defaults.groups).toEqual([]);
  const search = await f.engine.call<CandidateGroups>("ledger.reconciliation.duplicates", { bookId: f.book.id, sameAccount: false, samePayee: true });
  expect(search.groups).toHaveLength(1);
  const input = { ...await f.version(), members: selection(search.groups[0]!.map(({ record }) => record)), keepRecordId: keep.id };
  const preview = await f.engine.call<MergePreview>("ledger.reconciliation.previewMerge", input);
  expect(preview).toMatchObject({ references: { attachments: 1, notes: 1, occurrences: 1, conflictingOccurrences: [] }, memoOverflow: false });
  expect(preview.accounts).toHaveLength(2);
  expect(preview.categories).toHaveLength(2);
  expect(await f.engine.invoke("ledger.reconciliation.confirmMerge", { ...input, previewId: preview.previewId })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  await f.category("使预览过期的写入");
  expect(await f.engine.invoke("ledger.reconciliation.confirmMerge", {
    ...input, previewId: preview.previewId, accountId: f.first.id, categoryId: originalCategory,
  })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect((await f.records()).total).toBe(2);

  const current = { ...input, ...await f.version() };
  const renewed = await f.engine.call<MergePreview>("ledger.reconciliation.previewMerge", current);
  const result = await f.engine.call<{ retained: LedgerRecord; removed: string[] }>("ledger.reconciliation.confirmMerge", {
    ...current, previewId: renewed.previewId, accountId: f.first.id, categoryId: originalCategory, memo: "核对过的备注",
  });
  expect(result).toMatchObject({ retained: { id: keep.id, accountId: f.first.id, categoryId: originalCategory, attachmentIds: [receipt.id] }, removed: [duplicate.id] });
  expect(await f.engine.call("ledger.attachments.read", { bookId: f.book.id, attachmentId: receipt.id })).toEqual({ status: "available", attachment: receipt, base64 });
  expect(f.stored().recordReferences).toEqual([
    { kind: "note", targetId: "note-sample", recordId: keep.id },
    { kind: "occurrence", targetId: "plan-1:2026-11", recordId: keep.id },
  ]);
  expect(f.stored().importRows).toEqual({ "fixture-import": keep.id });
  expect((await f.records()).total).toBe(1);
});

test("one-to-one candidates precede splits and a merge cannot collapse distinct plan occurrences", async () => {
  const f = await setup();
  const anchor = await f.create("支出", f.input("expense", f.first.id, "10000"));
  const exact = await f.create("全额退款", f.input("income", f.first.id, "10000"));
  await f.create("拆分一", f.input("income", f.first.id, "6000"));
  await f.create("拆分二", f.input("income", f.first.id, "4000"));
  const groups = await f.engine.call<CandidateGroups>("ledger.reconciliation.offsetCandidates", { bookId: f.book.id, recordId: anchor.id });
  expect(groups.groups.map((group) => group.length)).toEqual([2, 3]);
  expect(groups.groups[0]?.[1]?.record.id).toBe(exact.id);

  const copy = await f.create("另一笔支出", f.input("expense", f.first.id, "10000"));
  await f.references([
    { kind: "occurrence", targetId: "plan:period-a", recordId: anchor.id },
    { kind: "occurrence", targetId: "plan:period-b", recordId: copy.id },
  ]);
  const input = { ...await f.version(), keepRecordId: anchor.id, members: selection([anchor, copy]) };
  const preview = await f.engine.call<MergePreview>("ledger.reconciliation.previewMerge", input);
  expect(preview.references.conflictingOccurrences).toEqual(["plan:period-a", "plan:period-b"]);
  expect(await f.engine.invoke("ledger.reconciliation.confirmMerge", { ...input, previewId: preview.previewId })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect((await f.records()).total).toBe(5);
});
