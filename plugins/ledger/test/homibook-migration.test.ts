import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeBoundedZip } from "@huhu/vault";
import { expect, test } from "vitest";
import type { BackupPreview } from "../src/shared/backups.js";
import type { Book, BookList } from "../src/shared/books.js";
import type { AccountsView, RecordsPage } from "../src/shared/entries.js";
import type { ReportView } from "../src/shared/reports.js";
import { ledgerEngine } from "./fixture.js";

test("L9 HomiBook v1 requires explicit decisions for old offsets, missing attachments and inexact amounts", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-homibook-"));
  const engine = await ledgerEngine(root);
  try {
    const account = { id: "a", accountBookId: "old", name: "银行", type: "BANK", currency: "CNY", initialBalance: 100, createdAt: "2024-01-01T00:00:00Z" };
    const row = { id: "r", accountBookId: "old", type: "EXPENSE", accountId: "a", amount: 20, date: "2024-02-01T00:00:00Z", remark: "旧收据" };
    const entries = new Map(Object.entries({
      "manifest.json": { formatVersion: 1, scope: "full", modules: ["accountBook", "account", "record", "attachments"] },
      "data/accountBook.json": [{ id: "old", name: "旧账本" }, { id: "other", name: "另一个账本" }],
      "data/account.json": [account, { ...account, id: "other-account", accountBookId: "other" }],
      "data/record.json": [ { ...row, offsetAt: "2024-02-02T00:00:00Z" }, { ...row, id: "bad-amount", amount: 1.005 } ],
      "data/recordAttachment.json": [
        { id: "missing", path: "/uploads/missing.pdf", originalFilename: "missing.pdf", recordIds: ["r"] },
        { id: "present", path: "/uploads/existing.txt", originalFilename: "existing.txt", recordIds: ["r"] },
      ],
    }).map(([key, value]) => [key, Buffer.from(JSON.stringify(value))]));
    entries.set("attachments/existing.txt", Buffer.from("original bytes"));
    const zip = writeBoundedZip(entries, { archiveBytes: 1_000_000, entryBytes: 1_000_000, totalBytes: 1_000_000, entries: 50 });
    const preview = await engine.call<BackupPreview>("ledger.backups.preview", { base64: Buffer.from(zip).toString("base64"), sourceBookId: "old", timeZone: "Asia/Taipei" });
    expect(preview.sourceBooks.map(({ id }) => id)).toEqual(["old", "other"]);
    expect(preview.counts).toEqual({ accounts: 1, records: 1, attachments: 1 });
    const offset = preview.issues.find((issue) => issue.choices.includes("retain-offset"))!;
    const amount = preview.issues.find((issue) => issue.choices.includes("skip-row"))!;
    const missing = preview.issues.find((issue) => issue.choices.includes("drop-link"))!;
    expect(amount.row).toBe("bad-amount");
    expect(missing.module).toBe("attachments");
    const input = { previewId: preview.previewId, name: "迁入账本", modules: preview.modules };
    expect(await engine.invoke("ledger.backups.confirm", input)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect((await engine.call<BookList>("ledger.books.list")).books).toEqual([]);
    const book = await engine.call<Book>("ledger.backups.confirm", { ...input, decisions: {
      [offset.id]: "retain-offset", [amount.id]: "skip-row", [missing.id]: "drop-link",
    } });
    const ref = { bookId: book.id };
    const records = await engine.call<RecordsPage>("ledger.records.list", ref);
    expect(records).toMatchObject({ total: 1, totals: [], rows: [{ offset: false, legacyOffset: true, attachments: [{ fileName: "existing.txt", missing: false }] }] });
    const accounts = await engine.call<AccountsView>("ledger.accounts.list", ref);
    expect(accounts.accounts[0]?.balanceMinor).toBe("8000");
    const stats = { ...ref, from: "2024-02-01", to: "2024-02-01" };
    expect(await engine.call<ReportView>("ledger.reports.query", stats)).toMatchObject({ series: [{ count: 0, expenseMinor: "0" }] });
    await engine.call("ledger.reconciliation.clearLegacyOffset", { ...ref, expectedRevision: accounts.book.revision, recordId: records.rows[0]!.record.id });
    expect(await engine.call<ReportView>("ledger.reports.query", stats)).toMatchObject({ series: [{ count: 1, expenseMinor: "2000" }] });
    expect((await engine.call<AccountsView>("ledger.accounts.list", ref)).accounts[0]?.balanceMinor).toBe("8000");
  } finally {
    await engine.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("L9 HomiBook portable rules, matched loan periods and unambiguous mappings keep their restored references", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-homibook-cycles-"));
  const engine = await ledgerEngine(root);
  try {
    const stamp = "2024-01-31T00:00:00Z";
    const payment = "2024-02-29T00:00:00Z";
    const base = { accountBookId: "one", accountId: "bank", type: "EXPENSE", amount: 10, createdAt: stamp };
    const entries = new Map(Object.entries({
      "manifest.json": { formatVersion: 1, scope: "full", modules: ["accountBook", "account", "record", "recurring", "importMapping"] },
      "data/accountBook.json": [{ id: "one", name: "备份" }],
      "data/account.json": [{ id: "bank", accountBookId: "one", name: "银行", type: "BANK", currency: "CNY", initialBalance: 200 }],
      "data/record.json": [{ ...base, id: "already-recorded", date: payment, remark: "旧贷款已记账" }],
      "data/recurringTransaction.json": [
        { ...base, id: "daily", name: "日常费用", recurringType: "PERIODIC", cron: "0 0 * * *" },
        { ...base, id: "old-run", name: "无法核对的固定收支", recurringType: "PERIODIC", cron: "0 0 * * *", lastGeneratedAt: payment },
        { ...base, id: "loan", name: "设备贷款", recurringType: "LOAN", cron: "0 0 * * *", loanTotalAmount: 10,
          loanInterestRate: 0, loanInterestMethod: "EQUAL_PRINCIPAL", loanStartDate: stamp, loanTermMonths: 1 },
      ],
      "data/repaymentPlan.json": [{ recurringTransactionId: "loan", period: 1, dueDate: payment, totalPayment: 10,
        principal: 10, interest: 0, remainingPrincipal: 0, status: "GENERATED", generatedRecordId: "already-recorded" }],
      "data/importAccountMapping.json": [{ source: "csv", sourceAccountName: "旧账户名", targetAccountName: "银行" }],
      "data/importCategoryMapping.json": [],
    }).map(([key, value]) => [key, Buffer.from(JSON.stringify(value))]));
    const archive = writeBoundedZip(entries, { archiveBytes: 1_000_000, entryBytes: 1_000_000, totalBytes: 1_000_000, entries: 50 });
    const preview = await engine.call<BackupPreview>("ledger.backups.preview", { base64: Buffer.from(archive).toString("base64"), timeZone: "UTC" });
    expect(preview.issues).toMatchObject([{ module: "cycles", row: "无法核对的固定收支", choices: ["skip-row"] }]);
    const book = await engine.call<Book>("ledger.backups.confirm", { previewId: preview.previewId, name: "迁入周期",
      modules: preview.modules, decisions: { [preview.issues[0]!.id]: "skip-row" } });
    const ref = { bookId: book.id };
    const records = await engine.call<RecordsPage>("ledger.records.list", ref);
    const { rows: [loan] } = await engine.call<{ rows: { id: string }[] }>("ledger.loans.list", ref);
    expect(await engine.call("ledger.loans.previewHistory", { ...ref, loanId: loan!.id })).toMatchObject({
      installments: [{ status: "generated", recordId: records.rows[0]?.record.id, date: "2024-02-29" }],
    });
    expect(await engine.call("ledger.recurring.list", ref)).toMatchObject({ rows: [{ rule: { title: "日常费用", frequency: "daily" }, plan: null }] });
    const { accounts: [account] } = await engine.call<AccountsView>("ledger.accounts.list", ref);
    expect(await engine.call("ledger.mappings.list", ref)).toMatchObject({ rules: [{ targetId: account?.id }] });
  } finally {
    await engine.close();
    rmSync(root, { recursive: true, force: true });
  }
});
