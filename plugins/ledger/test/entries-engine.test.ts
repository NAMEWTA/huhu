import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ledgerBusinessDayRange, type LedgerRecord } from "@huhu/contracts";
import { OperationLog } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { attachmentPath, bookDirectory } from "../src/engine/store.js";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, Attachment, BasePreview, BatchPreview, DictionaryItem, RecordsPage, RecordView } from "../src/shared/entries.js";
import { ledgerEngine } from "./fixture.js";

const teardown: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const done of teardown.splice(0).reverse()) await done();
});

const version = (book: Book) => ({ bookId: book.id, expectedRevision: book.revision });

async function session(directory: string) {
  const engine = await ledgerEngine(directory);
  teardown.push(engine.close);
  return engine;
}

async function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-ledger-entries-"));
  teardown.push(() => rmSync(directory, { recursive: true, force: true }));
  const engine = await session(directory);
  const book = await engine.call<Book>("ledger.books.create", {
    name: "账本", defaultCurrency: "CNY", timeZone: "Asia/Taipei", firstAccount: { name: "银行" },
  });
  const view = () => engine.call<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const initial = await view();
  const first = initial.accounts[0]!;
  const day = initial.businessDate;
  const occurredAt = ledgerBusinessDayRange(day, book.timeZone).from;
  const base = await engine.call<BasePreview>("ledger.accounts.previewBalance", {
    ...version(initial.book), accountId: first.id, effectiveBusinessDate: day, balanceMinor: "10000",
  });
  expect(base).toMatchObject({ currentBalanceMinor: "0", replacedRevision: expect.any(String) });
  const { currentBalanceMinor: _current, ...confirm } = base;
  await engine.call("ledger.accounts.confirmBalance", confirm);
  const latest = await view();
  const second = await engine.call<{ id: string }>("ledger.accounts.create", {
    ...version(latest.book), account: { name: "钱包", type: "wallet", currency: "CNY", labels: { accountTypeId: null, bankId: null } },
    openingMinor: "10000", effectiveBusinessDate: day,
  });
  const common = { occurredAt, payee: "测试商户", memo: null, categoryId: null, tagIds: [], attachmentIds: [] };
  const income = { ...common, type: "income", accountId: first.id, currency: "CNY", amountMinor: "3000" };
  const expense = { ...common, type: "expense", accountId: first.id, currency: "CNY", amountMinor: "1000" };
  const transfer = {
    ...common, type: "transfer", fromAccountId: first.id, toAccountId: second.id, fromCurrency: "CNY", toCurrency: "CNY", fromAmountMinor: "2500", toAmountMinor: "2500",
  };
  async function create(title: string, record: unknown) {
    return engine.call<LedgerRecord>("ledger.records.create", { ...version((await view()).book), title, intentKey: randomUUID(), record });
  }
  return { directory, engine, book, view, first, second, day, income, expense, transfer, create };
}

test("calibration, income, expense and one exact transfer produce 95 and 125; filtered totals cover all pages", async () => {
  const f = await setup();
  await f.create("收入", f.income);
  await f.create("支出", f.expense);
  await f.create("转账", f.transfer);
  const accounts = (await f.view()).accounts;
  expect(accounts.map(({ balanceMinor }) => balanceMinor)).toEqual(["9500", "12500"]);
  expect(accounts[0]?.bases.map(({ balanceMinor }) => balanceMinor)).toEqual(["0", "10000"]);

  const request = { bookId: f.book.id, filters: { from: f.day, to: f.day, accountId: f.first.id, currency: "CNY", minMinor: "1000", maxMinor: "3000", payee: "商户" }, pageSize: 1 };
  const page = await f.engine.call<RecordsPage>("ledger.records.list", request);
  const next = await f.engine.call<RecordsPage>("ledger.records.list", { ...request, page: 2 });
  expect(page.total).toBe(3);
  expect(page.rows).toHaveLength(1);
  expect(next.rows[0]?.record.id).not.toBe(page.rows[0]?.record.id);
  expect(page.totals).toEqual([{ currency: "CNY", incomeMinor: "3000", expenseMinor: "1000", netMinor: "2000", transferInMinor: "2500", transferOutMinor: "2500" }]);
  expect(next.totals).toEqual(page.totals);
  expect(await f.engine.call<RecordsPage>("ledger.records.list", {
    bookId: f.book.id, filters: { toAccountId: f.second.id, minMinor: "2500", type: "transfer" },
  })).toMatchObject({ total: 1, rows: [{ title: "转账" }] });
});

test("failed transfer publication leaves both balances intact across reopen; racing versions permit one complete transfer", async () => {
  const f = await setup();
  const prior = await f.view();
  vi.spyOn(f.engine.vault.files, "write").mockRejectedValueOnce(new Error("fixture commit interruption"));
  const payload = { ...version(prior.book), title: "转账失败", intentKey: randomUUID(), record: f.transfer };
  expect((await f.engine.invoke("ledger.records.create", payload)).ok).toBe(false);
  await f.engine.close();

  const reopened = await session(f.directory);
  expect(await reopened.call<AccountsView>("ledger.accounts.list", { bookId: f.book.id })).toMatchObject({
    book: { revision: prior.book.revision },
    accounts: [{ balanceMinor: "10000" }, { balanceMinor: "10000" }],
  });
  expect(await reopened.call<RecordsPage>("ledger.records.list", { bookId: f.book.id })).toMatchObject({ total: 0 });
  const results = await Promise.all([reopened.invoke("ledger.records.create", payload), reopened.invoke("ledger.records.create", { ...payload, title: "竞争提交", intentKey: randomUUID() })]);
  expect(results.filter(({ ok }) => ok)).toHaveLength(1);
  expect(results.find(({ ok }) => !ok)).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  expect(await reopened.call<AccountsView>("ledger.accounts.list", { bookId: f.book.id })).toMatchObject({
    accounts: [{ balanceMinor: "7500" }, { balanceMinor: "12500" }],
  });
});

test("filters match both account identities and the destination amount of a cross-currency transfer", async () => {
  const f = await setup();
  const jpy = await f.engine.call<{ id: string }>("ledger.accounts.create", {
    ...version((await f.view()).book),
    account: { name: "日元", type: "cash", currency: "JPY", labels: { accountTypeId: null, bankId: null } },
    openingMinor: "500", effectiveBusinessDate: f.day,
  });
  await f.create("兑换", { ...f.transfer, toAccountId: jpy.id, toCurrency: "JPY", toAmountMinor: "520" });
  const all = await f.engine.call<RecordsPage>("ledger.records.list", { bookId: f.book.id });
  expect(all.totals).toMatchObject([
    { currency: "CNY", transferOutMinor: "2500", transferInMinor: "0" },
    { currency: "JPY", transferOutMinor: "0", transferInMinor: "520" },
  ]);
  const filtered = await f.engine.call<RecordsPage>("ledger.records.list", {
    bookId: f.book.id, filters: { accountId: f.first.id, toAccountId: jpy.id, currency: "JPY", minMinor: "510", maxMinor: "530" },
  });
  expect(filtered).toMatchObject({ total: 1, totals: [{ currency: "JPY", transferInMinor: "520" }] });
});

test("archive blocks new category references and batch edits or deletion must match a fresh preview", async () => {
  const f = await setup();
  const category = await f.engine.call<DictionaryItem>("ledger.dictionaries.save", {
    ...version((await f.view()).book), kind: "category", name: "交通",
  });
  const a = await f.create("第一笔", { ...f.expense, categoryId: category.id });
  const b = await f.create("第二笔", { ...f.expense, categoryId: category.id });
  await f.engine.call("ledger.dictionaries.save", { ...version((await f.view()).book), id: category.id, kind: category.kind, name: "交通", status: "archived" });
  const blocked = await f.engine.invoke("ledger.records.create", {
    ...version((await f.view()).book), title: "新引用", intentKey: randomUUID(), record: { ...f.expense, categoryId: category.id },
  });
  expect(blocked).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const selection = [a, b].map((entry) => ({ recordId: entry.id, recordRevision: entry.revision }));
  const batch = { ...version((await f.view()).book), selection, action: { kind: "update", patch: { memo: "集体修改" } } };
  const preview = await f.engine.call<BatchPreview>("ledger.records.previewBatch", batch);
  expect(preview.count).toBe(2);
  expect(await f.engine.call("ledger.records.confirmBatch", { ...batch, previewId: preview.previewId })).toEqual({ count: 2 });
  expect(await f.engine.invoke("ledger.records.confirmBatch", { ...batch, previewId: preview.previewId })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const result = await f.engine.call<RecordsPage>("ledger.records.list", { bookId: f.book.id, filters: { memo: "修改", categoryId: category.id } });
  expect(result.total).toBe(2);
  const remove = {
    ...version(result.book),
    selection: result.rows.map(({ record }) => ({ recordId: record.id, recordRevision: record.revision })),
    action: { kind: "delete" },
  };
  const removal = await f.engine.call<BatchPreview>("ledger.records.previewBatch", remove);
  expect(await f.engine.call("ledger.records.confirmBatch", { ...remove, previewId: removal.previewId })).toEqual({ count: 2 });
  expect(await f.engine.call<RecordsPage>("ledger.records.list", { bookId: f.book.id })).toMatchObject({ total: 0 });
});

test("managed attachment commits with its reference, survives reopen and edit, clones by identity and reports missing bytes", async () => {
  const f = await setup();
  const record = await f.create("带凭证支出", f.expense);
  const data = Buffer.from("fixture receipt").toString("base64");
  const upload = {
    ...version((await f.view()).book), recordId: record.id, recordRevision: record.revision,
    fileName: "receipt.txt", mediaType: "text/plain", base64: data,
  };
  const run = OperationLog.prototype.run;
  vi.spyOn(OperationLog.prototype, "run").mockImplementationOnce(function (this: OperationLog, id, kind, steps, hooks) {
    return run.call(this, id, kind, steps, {
      ...hooks, afterPublish: (index) => { if (index === 0) throw new Error("interrupted after publishing the attachment"); },
    });
  });
  expect(await f.engine.invoke("ledger.attachments.upload", upload)).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
  const files = f.engine.vault.files.abs(bookDirectory(f.book.id) + "/attachments");
  expect(existsSync(files) ? readdirSync(files) : []).toEqual([]);
  expect(await f.engine.call<RecordView>("ledger.records.get", { bookId: f.book.id, recordId: record.id })).toMatchObject({ attachments: [] });
  const attachment = await f.engine.call<Attachment>("ledger.attachments.upload", upload);
  await f.engine.close();

  const reopened = await session(f.directory);
  expect(await reopened.call("ledger.attachments.read", { bookId: f.book.id, attachmentId: attachment.id })).toEqual({ status: "available", attachment, base64: data });
  const existing = await reopened.call<RecordView>("ledger.records.get", { bookId: f.book.id, recordId: record.id });
  let current = (await reopened.call<AccountsView>("ledger.accounts.list", { bookId: f.book.id })).book;
  const edited = await reopened.call<LedgerRecord>("ledger.records.update", {
    ...version(current), recordId: record.id, recordRevision: existing.record.revision, title: "已编辑",
    record: { ...f.expense, memo: "重开后修改", attachmentIds: [attachment.id] },
  });
  current = (await reopened.call<AccountsView>("ledger.accounts.list", { bookId: f.book.id })).book;
  const clone = await reopened.call<LedgerRecord>("ledger.records.clone", {
    ...version(current), recordId: record.id, recordRevision: edited.revision,
  });
  expect(clone.id).not.toBe(record.id);
  expect(clone.attachmentIds).toEqual([attachment.id]);
  rmSync(reopened.vault.files.abs(attachmentPath(f.book.id, attachment.id)));
  expect(await reopened.call("ledger.attachments.read", { bookId: f.book.id, attachmentId: attachment.id })).toEqual({ status: "missing", attachment });
  expect(await reopened.call("ledger.records.get", { bookId: f.book.id, recordId: clone.id })).toMatchObject({ attachments: [{ id: attachment.id, missing: true }] });
});
