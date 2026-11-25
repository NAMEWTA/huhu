import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, BatchPreview, RecordsPage } from "../src/shared/entries.js";
import type { Loan, LoanHistory, LoanPayment } from "../src/shared/loans.js";
import { ledgerEngine } from "./fixture.js";

test("L8 confirmation posts only selected due periods, retries after restart, and keeps durable facts after record deletion", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-loans-"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-04-10T00:00:00Z"));
  let engine: Awaited<ReturnType<typeof ledgerEngine>> | undefined;
  try {
    engine = await ledgerEngine(root);
    const book = await engine.call<Book>("ledger.books.create", {
      name: "贷款夹具", defaultCurrency: "CNY", timeZone: "Asia/Taipei", firstAccount: { name: "银行" },
    });
    const ref = { bookId: book.id };
    const accounts = () => engine!.call<AccountsView>("ledger.accounts.list", ref);
    const version = async () => ({ ...ref, expectedRevision: (await accounts()).book.revision });
    const account = (await accounts()).accounts[0]!;
    const loan = await engine.call<Loan>("ledger.loans.create", {
      ...await version(),
      definition: { name: "设备贷款", method: "equal-principal", principalMinor: "30000", currency: "CNY",
        annualRatePercent: "12", months: 3, startOn: "2026-01-31", accountId: account.id },
    });
    const query = { ...ref, loanId: loan.id };
    const history = () => engine!.call<LoanHistory>("ledger.loans.previewHistory", query);
    const records = () => engine!.call<RecordsPage>("ledger.records.list", ref);
    const preview = await history();
    expect(preview.installments.map(({ date, status }) => ({ date, status }))).toEqual([
      { date: "2026-02-28", status: "due" }, { date: "2026-03-31", status: "due" }, { date: "2026-04-30", status: "future" },
    ]);
    await engine.close();
    engine = await ledgerEngine(root);
    expect((await records()).total).toBe(0);
    expect(await engine.invoke("ledger.loans.confirmHistory", { ...preview.preview, selected: [1, 3] })).toMatchObject({ ok: false });
    expect((await records()).total).toBe(0);

    const confirm = { ...preview.preview, selected: [2] };
    const post = () => engine!.call<LoanPayment[]>("ledger.loans.confirmHistory", confirm);
    const [first, concurrent] = await Promise.all([post(), post()]);
    expect(concurrent).toEqual(first);
    expect(first).toMatchObject([{ loanId: loan.id, number: 2 }]);
    expect((await records()).rows).toMatchObject([{ businessDate: "2026-03-31", record: { id: first[0]!.recordId, amountMinor: "10200" } }]);
    expect((await history()).installments.map(({ status }) => status)).toEqual(["due", "generated", "future"]);

    await engine.close();
    engine = await ledgerEngine(root);
    expect(await post()).toEqual(first);
    const row = (await records()).rows[0]!;
    const input = { ...await version(), action: { kind: "delete" }, selection: [{ recordId: row.record.id, recordRevision: row.record.revision }] };
    const removal = await engine.call<BatchPreview>("ledger.records.previewBatch", input);
    await engine.call("ledger.records.confirmBatch", { ...input, previewId: removal.previewId });
    expect((await history()).installments[1]).toMatchObject({ status: "generated", recordId: null });
    expect(await post()).toEqual(first);
    expect((await records()).total).toBe(0);

    await engine.call("ledger.loans.confirmHistory", { ...(await history()).preview, selected: [1] });
    await engine.call("ledger.loans.remove", { ...await version(), loanId: loan.id });
    expect((await records()).rows).toMatchObject([{ businessDate: "2026-02-28", record: { amountMinor: "10300" } }]);
    expect(await engine.invoke("ledger.loans.confirmHistory", confirm)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  } finally {
    await engine?.close();
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  }
});
