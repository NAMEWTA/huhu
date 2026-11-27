import { z } from "zod";
import { CapabilityIntentKeySchema } from "./capability.js";
import { errors } from "./errors.js";

// The ledger format owns its scales. An ICU upgrade must not change stored amounts.
const currencyScales = Object.freeze({
  AED: 2,
  AUD: 2,
  BHD: 3,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  COP: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PHP: 2,
  PLN: 2,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TND: 3,
  TRY: 2,
  TWD: 2,
  USD: 2,
  VND: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  ZAR: 2,
});
type LedgerCurrencyCode = keyof typeof currencyScales;

export const LedgerCurrency = z.string().refine((code): code is LedgerCurrencyCode => Object.hasOwn(currencyScales, code), "账本尚未登记此币种的精度");
export const LedgerMinorUnits = z
  .string()
  .max(64)
  .regex(/^(?:0|-?[1-9]\d*)$/);
const positiveMinor = LedgerMinorUnits.refine((value) => !value.startsWith("-") && value !== "0");
export const LedgerBusinessDate = z.iso.date();
const id = z.string().min(1).max(256);
const revision = z.string().min(1).max(256);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const localTimestamp = z.templateLiteral([LedgerBusinessDate, "T", z.iso.time()]).refine((value) => !/\.\d{4}/.test(value), "来源时刻最多保留到毫秒");
const instant = z.iso.datetime({ offset: true });

export const LedgerTimeZone = z
  .string()
  .min(1)
  .max(128)
  .refine((zone) => {
    if (/^[+-]/.test(zone)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "请输入 IANA 时区");

export function ledgerDecimalToMinor(decimal: string, currency: string): string {
  const scale = currencyScales[LedgerCurrency.parse(currency) as LedgerCurrencyCode];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match || decimal.length > 65 || (match[3]?.length ?? 0) > scale) {
    throw errors.invalidInput("金额不是该币种可精确表示的小数");
  }
  const units = BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
  return LedgerMinorUnits.parse(units.toString());
}

export function ledgerMinorToDecimal(amountMinor: string, currency: string): string {
  LedgerMinorUnits.parse(amountMinor);
  const scale = currencyScales[LedgerCurrency.parse(currency) as LedgerCurrencyCode];
  if (scale === 0) return amountMinor;
  const sign = amountMinor.startsWith("-") ? "-" : "";
  const digits = amountMinor.slice(sign.length).padStart(scale + 1, "0");
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export const LedgerBook = z.strictObject({
  id,
  name: z.string().min(1).max(150),
  defaultCurrency: LedgerCurrency,
  timeZone: LedgerTimeZone,
  status: z.enum(["active", "archived"]),
  schemaVersion: z.literal(1),
  revision,
});
export const LedgerAccount = z.strictObject({
  id,
  bookId: id,
  name: z.string().min(1).max(150),
  type: z.enum(["cash", "bank", "credit", "wallet", "investment", "other"]),
  currency: LedgerCurrency,
  status: z.enum(["active", "archived"]),
});
export const LedgerBalanceBase = z.strictObject({
  bookId: id,
  accountId: id,
  effectiveBusinessDate: LedgerBusinessDate,
  balanceMinor: LedgerMinorUnits,
  revision,
});
const recordBase = z.strictObject({
  id,
  bookId: id,
  occurredAt: instant,
  categoryId: id.nullable(),
  tagIds: z.array(id),
  payee: z.string().nullable(),
  memo: z.string().nullable(),
  attachmentIds: z.array(id),
  revision,
});
const single = recordBase.extend({ type: z.enum(["income", "expense"]), accountId: id, amountMinor: positiveMinor, currency: LedgerCurrency });
const transfer = recordBase.extend({
  type: z.literal("transfer"),
  fromAccountId: id,
  toAccountId: id,
  fromAmountMinor: positiveMinor,
  toAmountMinor: positiveMinor,
  fromCurrency: LedgerCurrency,
  toCurrency: LedgerCurrency,
});
export const LedgerRecord = z.discriminatedUnion("type", [single, transfer]).refine((row) => row.type !== "transfer" || row.fromCurrency !== row.toCurrency || row.fromAmountMinor === row.toAmountMinor, "同币种转账的两端金额须一致");
export type LedgerRecord = z.infer<typeof LedgerRecord>;

export const LedgerOffsetGroup = z.strictObject({
  id,
  bookId: id,
  currency: LedgerCurrency,
  memberRecordIds: z
    .array(id)
    .min(2)
    .max(6)
    .refine((ids) => ids.length === new Set(ids).size),
  createdAt: instant,
  revision,
});

const commitBase = z.strictObject({ bookId: id, expectedRevision: revision, intentKey: CapabilityIntentKeySchema });
export const LedgerCreateRecord = commitBase.extend({
  record: z
    .discriminatedUnion("type", [single.omit({ id: true, bookId: true, revision: true }), transfer.omit({ id: true, bookId: true, revision: true })])
    .refine((row) => row.type !== "transfer" || (row.fromAccountId !== row.toAccountId && (row.fromCurrency !== row.toCurrency || row.fromAmountMinor === row.toAmountMinor)), "新转账需要不同账户，同币种两端金额须一致"),
});
export const LedgerConfirmImport = commitBase.extend({
  previewId: id,
  inputDigest: sha256,
  mappingRevision: revision,
  selectedRowIds: z
    .array(id)
    .min(1)
    .refine((ids) => ids.length === new Set(ids).size),
});

const day = 86_400_000;

function localClock(zone: string) {
  LedgerTimeZone.parse(zone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  });
  return (milliseconds: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(milliseconds).map(({ type, value }) => [type, value]));
    return `${parts["year"]?.padStart(4, "0")}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}:${parts["second"]}.${parts["fractionalSecond"]}`;
  };
}

export function ledgerBusinessDate(occurredAt: string, bookZone: string): string {
  return LedgerBusinessDate.parse(localClock(bookZone)(Date.parse(instant.parse(occurredAt))).slice(0, 10));
}

function matchingClockTimes(reading: number, clock: (point: number) => string) {
  const target = new Date(reading).toISOString().slice(0, -1);
  const offsets = new Set([reading - day, reading, reading + day].map((point) => Date.parse(`${clock(point)}Z`) - point));
  return [...offsets]
    .map((offset) => reading - offset)
    .filter((point) => clock(point) === target)
    .sort((a, b) => a - b);
}

export function ledgerSourceTime(local: string, sourceZone: string, bookZone: string, disambiguation?: "earlier" | "later") {
  const wall = localTimestamp.parse(local);
  const reading = Date.parse(`${wall}Z`);
  if (!Number.isFinite(reading)) throw errors.invalidInput("无法解释来源的本地日期时间");
  const options = matchingClockTimes(reading, localClock(sourceZone));
  const [first, ...rest] = options;
  if (first === undefined) return { state: "gap" as const };
  if (rest.length && !disambiguation) return { state: "ambiguous" as const, instants: options.map((point) => new Date(point).toISOString()) };
  const occurredAt = new Date(disambiguation === "later" ? (rest.at(-1) ?? first) : first).toISOString();
  return { state: "ready" as const, occurredAt, businessDate: ledgerBusinessDate(occurredAt, bookZone) };
}

/** Midnight need not exist. The bound is the first instant whose local date reaches the requested date. */
export function ledgerBusinessDayRange(date: string, bookZone: string) {
  LedgerBusinessDate.parse(date);
  const nominal = Date.parse(`${date}T00:00:00Z`);
  const clock = localClock(bookZone);
  function firstAtOrAfter(utc: number) {
    const midnight = matchingClockTimes(utc, clock)[0];
    if (midnight !== undefined) return new Date(midnight).toISOString();
    const target = new Date(utc).toISOString().slice(0, 10);
    let low = utc - 2 * day;
    let high = utc + 2 * day;
    while (high - low > 1) {
      const middle = low + Math.floor((high - low) / 2);
      if (clock(middle).slice(0, 10) >= target) high = middle;
      else low = middle;
    }
    return new Date(high).toISOString();
  }
  return { from: firstAtOrAfter(nominal), until: firstAtOrAfter(nominal + day) };
}

export function ledgerBalanceFromBase(book: z.infer<typeof LedgerBook>, account: z.infer<typeof LedgerAccount>, base: z.infer<typeof LedgerBalanceBase>, records: readonly LedgerRecord[]): string {
  if (book.id !== account.bookId || base.bookId !== book.id || base.accountId !== account.id) {
    throw errors.invalidInput("余额基准与账本账户不匹配");
  }
  const clock = localClock(book.timeZone);
  let balance = BigInt(base.balanceMinor);
  const change = (currency: string, value: string, sign: bigint) => {
    if (currency !== account.currency) throw errors.invalidInput("流水币种与账户币种不匹配");
    balance += sign * BigInt(value);
  };
  for (const record of records) {
    if (record.bookId !== book.id || clock(Date.parse(record.occurredAt)).slice(0, 10) < base.effectiveBusinessDate) continue;
    if (record.type === "transfer") {
      if (record.fromAccountId === account.id) change(record.fromCurrency, record.fromAmountMinor, -1n);
      if (record.toAccountId === account.id) change(record.toCurrency, record.toAmountMinor, 1n);
    } else if (record.accountId === account.id) {
      change(record.currency, record.amountMinor, record.type === "income" ? 1n : -1n);
    }
  }
  return balance.toString();
}

export type LedgerReferenceKind = "account" | "category" | "tag" | "attachment" | "note" | "archive";
type LedgerReferenceCheck = { state: "ready" } | { state: "unavailable"; reason: "missing" | "archived" | "wrong-book"; blocksCommit: boolean };

export function checkLedgerReference(bookId: string, kind: LedgerReferenceKind, target: { bookId?: string; status: "active" | "archived" } | null, view: "existing" | "new"): LedgerReferenceCheck {
  const local = kind !== "note" && kind !== "archive";
  if (target && local && target.bookId !== bookId) return { state: "unavailable", reason: "wrong-book", blocksCommit: view === "new" };
  if (!target) return { state: "unavailable", reason: "missing", blocksCommit: view === "new" && local };
  if (target.status === "archived" && view === "new") return { state: "unavailable", reason: "archived", blocksCommit: local };
  return { state: "ready" };
}
