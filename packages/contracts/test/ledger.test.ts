import { describe, expect, it } from "vitest";
import {
  checkLedgerReference, ledgerBalanceFromBase, ledgerBusinessDate, ledgerBusinessDayRange, ledgerDecimalToMinor,
  ledgerMinorToDecimal, ledgerSourceTime, LedgerAccount, LedgerBalanceBase, LedgerBook, LedgerConfirmImport, LedgerCreateRecord, LedgerRecord,
} from "../src/index.js";

const book = LedgerBook.parse({
  id: "shore", name: "北岸账本", defaultCurrency: "CNY", timeZone: "Asia/Taipei", status: "active", schemaVersion: 1, revision: "r1",
});
const account = LedgerAccount.parse({ id: "cash", bookId: book.id, name: "备用金", type: "cash", currency: "CNY", status: "active" });
const base = LedgerBalanceBase.parse({
  bookId: book.id, accountId: account.id, effectiveBusinessDate: "2026-11-25", balanceMinor: "-10025", revision: "r1",
});
const common = {
  bookId: book.id, occurredAt: "2026-11-24T16:00:00Z", categoryId: null, tagIds: [], payee: null, memo: null, attachmentIds: [], revision: "r1",
};

describe("ledger domain fixtures", () => {
  it("round-trips exact minor units beyond the safe Number range", () => {
    expect(ledgerDecimalToMinor("9007199254740993.10", "CNY")).toBe("900719925474099310");
    expect(ledgerMinorToDecimal("900719925474099310", "CNY")).toBe("9007199254740993.10");
    expect(ledgerDecimalToMinor("-10.05", "TWD")).toBe("-1005");
    expect(ledgerMinorToDecimal("-5", "KWD")).toBe("-0.005");
    expect(ledgerDecimalToMinor("1200", "JPY")).toBe("1200");
    expect(ledgerDecimalToMinor("-00.00", "USD")).toBe("0");
  });

  it.each([["1.1", "JPY"], ["1.001", "CNY"], ["1e2", "CNY"], ["NaN", "CNY"], ["1.00", "XXX"], ["", "USD"]])(
    "rejects unrepresentable amount %s for %s",
    (decimal, currency) => expect(() => ledgerDecimalToMinor(decimal, currency)).toThrow(),
  );

  it("uses the explicit source zone, then attributes the instant to the ledger day", () => {
    expect(ledgerSourceTime("2026-11-24T09:00", "America/Los_Angeles", book.timeZone)).toEqual({
      state: "ready", occurredAt: "2026-11-24T17:00:00.000Z", businessDate: "2026-11-25",
    });
    expect(ledgerBusinessDate("2026-11-24T15:59:59.999Z", book.timeZone)).toBe("2026-11-24");
    expect(ledgerBusinessDate("2026-11-24T16:00:00Z", book.timeZone)).toBe("2026-11-25");
    expect(ledgerBusinessDate("2026-11-25T00:00:00+08:00", book.timeZone)).toBe("2026-11-25");
  });

  it("leaves gaps and folds for preview resolution", () => {
    expect(ledgerSourceTime("2026-03-08T02:30", "America/New_York", book.timeZone)).toEqual({ state: "gap" });
    expect(ledgerSourceTime("2026-11-01T01:30", "America/New_York", book.timeZone)).toEqual({
      state: "ambiguous", instants: ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"],
    });
    expect(ledgerSourceTime("2026-11-01T01:30:00.123", "America/New_York", book.timeZone, "later")).toMatchObject({
      state: "ready", occurredAt: "2026-11-01T06:30:00.123Z",
    });
    expect(() => ledgerSourceTime("2026-02-30T00:00", "UTC", book.timeZone)).toThrow();
    expect(() => ledgerSourceTime("2026-11-25T00:00", "+08:00", book.timeZone)).toThrow();
  });

  it("represents local business dates as half-open instant intervals", () => {
    expect(ledgerBusinessDayRange("2026-03-08", "America/New_York")).toEqual({
      from: "2026-03-08T05:00:00.000Z", until: "2026-03-09T04:00:00.000Z",
    });
    expect(ledgerBusinessDayRange("2026-11-01", "America/New_York")).toEqual({
      from: "2026-11-01T04:00:00.000Z", until: "2026-11-02T05:00:00.000Z",
    });
    expect(ledgerBusinessDayRange("2011-12-30", "Pacific/Apia")).toEqual({
      from: "2011-12-30T10:00:00.000Z", until: "2011-12-30T10:00:00.000Z",
    });
  });

  it("uses the business start of the calibration date and both actual transfer sides", () => {
    const old = LedgerRecord.parse({ ...common, occurredAt: "2026-11-24T15:59:59.999Z", id: "old", type: "income", accountId: "cash", amountMinor: "500", currency: "CNY" });
    const expense = LedgerRecord.parse({ ...common, id: "expense", type: "expense", accountId: "cash", amountMinor: "1000", currency: "CNY" });
    const foreign = LedgerRecord.parse({ ...expense, id: "other-vault", bookId: "other" });
    const transfer = LedgerRecord.parse({ ...common, id: "transfer", type: "transfer", fromAccountId: "cash", toAccountId: "yen", fromAmountMinor: "3800", fromCurrency: "CNY", toAmountMinor: "800", toCurrency: "JPY" });
    const legacy = LedgerRecord.parse({ ...transfer, id: "same-account", toAccountId: "cash", toAmountMinor: "3800", toCurrency: "CNY" });
    const yen = LedgerAccount.parse({ ...account, id: "yen", currency: "JPY" });
    expect(ledgerBalanceFromBase(book, account, base, [old, expense, foreign, transfer, legacy])).toBe("-14825");
    expect(ledgerBalanceFromBase(book, yen, { ...base, accountId: "yen", balanceMinor: "30" }, [transfer])).toBe("830");
    expect(() => ledgerBalanceFromBase(book, yen, base, [transfer])).toThrow("余额基准与账本账户不匹配");
    expect(LedgerRecord.safeParse({ ...transfer, toCurrency: "CNY" }).success).toBe(false);
  });

  it("pins new operations to a book and preview without trusting candidate rows from the UI", () => {
    const frame = { bookId: book.id, expectedRevision: book.revision, intentKey: "ledger-20261125-01" };
    const { bookId: _book, revision: _revision, ...record } = common;
    const transfer = { ...record, type: "transfer", fromAccountId: "cash", toAccountId: "cash", fromAmountMinor: "50", fromCurrency: "CNY", toAmountMinor: "50", toCurrency: "CNY" };
    expect(LedgerCreateRecord.safeParse({ ...frame, record: transfer }).success).toBe(false);
    expect(LedgerCreateRecord.safeParse({ ...frame, record: { ...transfer, toAccountId: "bank" } }).success).toBe(true);
    const confirmation = { ...frame, previewId: "import-one", inputDigest: "a".repeat(64), mappingRevision: "map-r1", selectedRowIds: ["row-7"] };
    expect(LedgerConfirmImport.parse(confirmation)).toEqual(confirmation);
    expect(LedgerConfirmImport.safeParse({ ...confirmation, sourcePath: "/tmp/bill.csv" }).success).toBe(false);
    expect(LedgerConfirmImport.safeParse({ ...confirmation, selectedRowIds: ["row-7", "row-7"] }).success).toBe(false);
  });

  it("keeps prior financial facts readable when references are archived, missing or outside the book", () => {
    const archived = { status: "archived", bookId: book.id } as const;
    expect(checkLedgerReference(book.id, "category", archived, "existing")).toEqual({ state: "ready" });
    expect(checkLedgerReference(book.id, "category", archived, "new")).toEqual({ state: "unavailable", reason: "archived", blocksCommit: true });
    expect(checkLedgerReference(book.id, "attachment", null, "existing")).toEqual({ state: "unavailable", reason: "missing", blocksCommit: false });
    expect(checkLedgerReference(book.id, "note", null, "new")).toEqual({ state: "unavailable", reason: "missing", blocksCommit: false });
    expect(checkLedgerReference(book.id, "account", { status: "active", bookId: "private" }, "new")).toEqual({ state: "unavailable", reason: "wrong-book", blocksCommit: true });
  });
});
