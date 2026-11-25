import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ledgerBusinessDayRange, type LedgerRecord } from "@huhu/contracts";
import { exportPackage, importPackage, OperationLog, readBoundedZip, writeBoundedZip } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { ledgerPackageSelection, validateLedgerPackage, withLedgerSnapshot } from "../src/engine/index.js";
import { attachmentPath, bookPath, stateSchema } from "../src/engine/store.js";
import { backupModules, type BackupPreview, type ExportedBackup } from "../src/shared/backups.js";
import type { Book, BookList } from "../src/shared/books.js";
import type { BudgetOverview } from "../src/shared/budgets.js";
import type { AccountsView, Attachment, RecordsPage } from "../src/shared/entries.js";
import type { Loan, LoanHistory } from "../src/shared/loans.js";
import type { OffsetPreview } from "../src/shared/reconciliation.js";
import { ledgerEngine } from "./fixture.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function root() {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-ledger-backup-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
async function open(directory = root()) {
  const engine = await ledgerEngine(directory);
  cleanup.push(engine.close);
  return engine;
}
const allModules = [...backupModules];
const limits = { archiveBytes: 5 * 1024 * 1024, entryBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, entries: 1024 };

async function populate() {
  const engine = await open();
  const book = await engine.call<Book>("ledger.books.create", {
    name: "原账本", defaultCurrency: "CNY", timeZone: "Asia/Taipei", firstAccount: { name: "银行" },
  });
  const ref = { bookId: book.id };
  const accounts = () => engine.call<AccountsView>("ledger.accounts.list", ref);
  const { accounts: [account], businessDate } = await accounts();
  const version = async () => ({ ...ref, expectedRevision: (await accounts()).book.revision });
  const stamp = ledgerBusinessDayRange(businessDate, book.timeZone).from;
  const { id: tagId } = await engine.call<{ id: string }>("ledger.dictionaries.save", { ...await version(), kind: "tag", name: "旅行" });
  const create = async (type: "expense" | "income", title: string, amountMinor: string) => engine.call<LedgerRecord>("ledger.records.create", {
    ...await version(), title, intentKey: randomUUID(), record: { type, accountId: account!.id, currency: "CNY", amountMinor,
      occurredAt: stamp, categoryId: null, tagIds: [tagId], attachmentIds: [], payee: null, memo: null },
  });
  const booked = await create("expense", "旅行车票", "12500");
  const offset = [await create("expense", "预付款", "5000"), await create("income", "预付款退回", "5000")];
  const offsetInput = { ...await version(), members: offset.map(({ id, revision }) => ({ recordId: id, recordRevision: revision })) };
  const preview = await engine.call<OffsetPreview>("ledger.reconciliation.previewOffset", offsetInput);
  await engine.call("ledger.reconciliation.confirmOffset", { ...offsetInput, previewId: preview.previewId });
  const base64 = Buffer.from("small attachment").toString("base64");
  const file = await engine.call<Attachment>("ledger.attachments.upload", { ...await version(), recordId: booked.id,
    recordRevision: booked.revision, fileName: "ticket.txt", mediaType: "text/plain", base64 });
  await engine.call("ledger.budgets.saveBatch", { ...await version(), budgets: [
    { definition: { name: "旅费", type: "free", tagIds: [tagId], currency: "CNY", limitMinor: "60000" } },
  ] });
  await engine.call("ledger.mappings.save", { ...await version(), rules: [{ source: "csv", kind: "account", original: "银行卡", targetId: account!.id }] });
  const loan = await engine.call<Loan>("ledger.loans.create", { ...await version(), definition: {
    name: "设备", principalMinor: "1000", annualRatePercent: "0", months: 1, startOn: "2024-01-31",
    method: "equal-principal", currency: "CNY", accountId: account!.id,
  } });
  const loanHistory = await engine.call<LoanHistory>("ledger.loans.previewHistory", { ...ref, loanId: loan.id });
  await engine.call("ledger.loans.confirmHistory", { ...loanHistory.preview, selected: [1] });
  return { engine, book, file, ref, accounts, loan, base64, businessDate, account: account! };
}

test("L9 portable backup remaps financial relationships and preserves outcomes on another Vault", async () => {
  const source = await populate();
  expect(await source.engine.invoke("ledger.backups.export", { ...source.ref, modules: ["records"] })).toMatchObject({
    ok: false, error: { code: "INVALID_INPUT", details: { issues: { missing: ["accounts"] } } },
  });
  const archive = await source.engine.call<ExportedBackup>("ledger.backups.export", { ...source.ref, modules: allModules });
  const files = readBoundedZip(Buffer.from(archive.base64, "base64"), limits);
  expect(files.has("attachments/" + source.file.id)).toBe(true);

  const directory = root();
  let target = await open(directory);
  const tampered = new Map(files);
  tampered.set("book.json", Buffer.from("{}"));
  expect(await target.invoke("ledger.backups.preview", { base64: Buffer.from(writeBoundedZip(tampered, limits)).toString("base64") })).toMatchObject({ ok: false });
  expect(await target.invoke("ledger.backups.preview", { base64: Buffer.from("not a ZIP").toString("base64") })).toMatchObject({ ok: false });
  const preview = await target.call<BackupPreview>("ledger.backups.preview", { base64: archive.base64 });
  expect(preview).toMatchObject({ source: "huhu", counts: { accounts: 1, records: 4, attachments: 1 }, issues: [] });
  expect((await target.call<BookList>("ledger.books.list")).books).toHaveLength(0);
  const confirm = { previewId: preview.previewId, modules: allModules, name: "新账本" };
  const run = OperationLog.prototype.run;
  const failPublication = vi.spyOn(OperationLog.prototype, "run").mockImplementation(function (this: OperationLog, id, kind, steps, hooks) {
    return run.call(this, id, kind, steps, {
      ...hooks,
      afterPublish(index) {
        hooks?.afterPublish?.(index);
        if (kind === "ledger-restore" && index === steps.length - 2) throw new Error("fixture: interrupt before index publication");
      },
    });
  });
  try {
    expect(await target.invoke("ledger.backups.confirm", confirm)).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
  } finally { failPublication.mockRestore(); }
  expect((await target.call<BookList>("ledger.books.list")).books).toHaveLength(0);

  const restored = await target.call<Book>("ledger.backups.confirm", confirm);
  expect(restored.id).not.toBe(source.book.id);
  const targetRef = { bookId: restored.id };
  const [raw] = (await target.call<AccountsView>("ledger.accounts.list", targetRef)).accounts;
  expect(raw?.id).not.toBe(source.account.id);
  expect(raw?.balanceMinor).toBe((await source.accounts()).accounts[0]?.balanceMinor);
  const records = await target.call<RecordsPage>("ledger.records.list", targetRef);
  expect(records.rows.filter(({ offset }) => offset)).toHaveLength(2);
  const ticket = records.rows.find(({ title }) => title === "旅行车票")!;
  expect(ticket.attachments[0]?.id).not.toBe(source.file.id);
  expect(await target.call("ledger.attachments.read", { ...targetRef, attachmentId: ticket.attachments[0]!.id })).toMatchObject({ status: "available", base64: source.base64 });
  expect(await target.call<BudgetOverview>("ledger.budgets.list", { ...targetRef, year: source.businessDate.slice(0, 4) })).toMatchObject({
    budgets: [{ actualMinor: "12500", count: 1 }],
  });
  expect(await target.call("ledger.mappings.list", targetRef)).toMatchObject({ rules: [{ targetId: raw?.id }] });
  const { rows: [loan] } = await target.call<{ rows: Loan[] }>("ledger.loans.list", targetRef);
  expect(loan?.id).not.toBe(source.loan.id);
  const history = await target.call<LoanHistory>("ledger.loans.previewHistory", { ...targetRef, loanId: loan!.id });
  expect(history.installments[0]).toMatchObject({ status: "generated", recordId: expect.any(String), paymentMinor: "1000" });

  await target.close();
  target = await open(directory);
  expect(await target.call("ledger.backups.status", { previewId: preview.previewId })).toEqual(restored);
  expect(await target.call("ledger.backups.confirm", confirm)).toEqual(restored);
  expect((await target.call<BookList>("ledger.books.list")).books).toHaveLength(1);
  expect((await source.engine.call<BookList>("ledger.books.list")).books.map(({ id }) => id)).toEqual([source.book.id]);
});

test("L9 full Vault selection excludes journals and can omit ledger attachment bytes and their references", async () => {
  const source = await populate();
  const directory = root();
  const archive = path.join(directory, "vault.zip");
  await withLedgerSnapshot(source.engine.vault.files, () => {
    const selection = ledgerPackageSelection(source.engine.vault.files, false);
    return exportPackage(source.engine.vault.root, archive, {
      includeAttachments: false, computedFiles: selection.computedFiles, includeFile: selection.includeFile,
      verifyFiles: (rows) => selection.verifyFiles(new Map(rows.map(({ path, sha256 }) => [path, sha256]))),
    });
  });
  const targetRoot = path.join(directory, "restored-vault");
  importPackage(archive, targetRoot, { regenerateId: true, validateStaging: validateLedgerPackage });
  const target = await open(targetRoot);
  expect(target.vault.id).not.toBe(source.engine.vault.id);
  expect(target.vault.files.exists(attachmentPath(source.book.id, source.file.id))).toBe(false);
  const state = stateSchema.parse(JSON.parse(target.vault.files.read(bookPath(source.book.id))!.bytes.toString()));
  expect(state.records).toHaveLength(4);
  expect(state.records.every(({ attachmentIds }) => attachmentIds.length === 0)).toBe(true);
  expect(state.budgets).toHaveLength(1);
  expect(state.loanPayments).toHaveLength(1);
});
