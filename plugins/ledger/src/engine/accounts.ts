import { randomUUID } from "node:crypto";
import { checkLedgerReference, errors, ledgerBalanceFromBase, ledgerBusinessDayRange, type LedgerAccount, type LedgerBalanceBase, type LedgerRecord } from "@huhu/contracts";
import type { z } from "zod";
import type { AccountLabels, AccountsView, DictionaryInput, InputBase } from "../shared/entries.js";
import type { BookState } from "./store.js";

type Account = z.infer<typeof LedgerAccount>;
type Base = z.infer<typeof LedgerBalanceBase>;
export const noLabels: z.infer<typeof AccountLabels> = { accountTypeId: null, bankId: null };

export function requireActiveBook({ book }: BookState) {
  if (book.status === "archived") throw errors.invalidInput("账本已归档，请先恢复账本");
}

export function account(state: BookState, id: string): Account {
  const found = state.accounts.find((entry) => entry.id === id);
  if (!found || found.bookId !== state.book.id) throw errors.notFound("账本没有这个资金账户");
  return found;
}

type AccountInput = Pick<Account, "name" | "type" | "currency"> & { labels: z.infer<typeof AccountLabels> };

function validateAccountLabels(state: BookState, id: string, { accountTypeId, bankId }: AccountInput["labels"]) {
  const previous = state.accountLabels[id] ?? noLabels;
  for (const [kind, next, before] of [
    ["account-type", accountTypeId, previous.accountTypeId],
    ["bank", bankId, previous.bankId],
  ] as const) {
    if (next && next !== before && !state.dictionary.some((item) => item.kind === kind && item.id === next && item.status === "active" && item.bookId === state.book.id)) {
      throw errors.invalidInput("请使用该账本中可用的账户类型或银行");
    }
  }
}

export function addBase(state: BookState, accountId: string, effectiveBusinessDate: string, balanceMinor: string): Base {
  const base = { bookId: state.book.id, accountId, effectiveBusinessDate, balanceMinor, revision: randomUUID() };
  state.bases.push(base);
  return base;
}

export function createAccount(state: BookState, input: AccountInput, openingMinor: string, effectiveBusinessDate: string) {
  const id = randomUUID();
  const { labels, ...fields } = input;
  validateAccountLabels(state, id, labels);
  const row: Account = { ...fields, id, bookId: state.book.id, status: "active" };
  state.accounts.push(row);
  state.accountLabels[id] = labels;
  addBase(state, id, effectiveBusinessDate, openingMinor);
  return row;
}

export function updateAccount(state: BookState, accountId: string, input: AccountInput) {
  const row = account(state, accountId);
  if (input.currency !== row.currency) throw errors.invalidInput("资金账户的币种在建立后固定");
  const { labels, ...fields } = input;
  validateAccountLabels(state, accountId, labels);
  Object.assign(row, fields);
  state.accountLabels[accountId] = labels;
  return row;
}

function currentBase(bases: Base[], day: string) {
  return bases.reduce<Base | undefined>((chosen, base) => (base.effectiveBusinessDate <= day && (!chosen || base.effectiveBusinessDate >= chosen.effectiveBusinessDate) ? base : chosen), undefined);
}

function balance(state: BookState, row: Account, day: string) {
  const bases = state.bases.filter((base) => base.accountId === row.id);
  const applicable = currentBase(bases, day);
  const until = Date.parse(ledgerBusinessDayRange(day, state.book.timeZone).until);
  return {
    bases,
    balanceMinor: applicable
      ? ledgerBalanceFromBase(
          state.book,
          row,
          applicable,
          state.records.filter((record) => Date.parse(record.occurredAt) < until),
        )
      : "0",
  };
}

export function accountsView(state: BookState, businessDate: string): AccountsView {
  return {
    book: state.book,
    businessDate,
    dictionary: state.dictionary,
    accounts: state.accounts.map((row) => ({ ...row, labels: state.accountLabels[row.id] ?? noLabels, ...balance(state, row, businessDate) })),
  };
}

export function balanceCheckpoints(state: BookState, dates: string[]) {
  const indexed = new Map<string, { record: LedgerRecord; time: number }[]>();
  for (const record of state.records) {
    const ids = record.type === "transfer" ? new Set([record.fromAccountId, record.toAccountId]) : [record.accountId];
    const time = Date.parse(record.occurredAt);
    for (const id of ids) {
      const entries = indexed.get(id);
      if (entries) entries.push({ record, time });
      else indexed.set(id, [{ record, time }]);
    }
  }
  const checkpoints = dates.map((date) => ({
    date,
    until: Date.parse(ledgerBusinessDayRange(date, state.book.timeZone).until),
    accounts: [] as (Account & { balanceMinor: string })[],
  }));
  for (const account of state.accounts) {
    const records = indexed.get(account.id)?.sort((a, b) => a.time - b.time) ?? [];
    const bases = state.bases.filter(({ accountId }) => accountId === account.id);
    let applied: Base | undefined;
    let preceding = 0;
    let balanceMinor = "0";
    for (const { date, until, accounts } of checkpoints) {
      let end = preceding;
      while (end < records.length && records[end]!.time < until) end++;
      const base = currentBase(bases, date);
      if (base && (base !== applied || end > preceding)) {
        // Reapply the ledger's normal balance rule when a calibration takes effect.
        const sameBase = base === applied;
        const start = sameBase ? preceding : 0;
        balanceMinor = ledgerBalanceFromBase(
          state.book,
          account,
          sameBase ? { ...base, balanceMinor } : base,
          records.slice(start, end).map(({ record }) => record),
        );
      }
      applied = base;
      preceding = end;
      accounts.push({ ...account, balanceMinor });
    }
  }
  return checkpoints;
}

export function previewBalance(state: BookState, input: z.infer<typeof InputBase>) {
  const row = account(state, input.accountId);
  if (row.status !== "active") throw errors.invalidInput("已归档账户不能校准");
  const { balanceMinor, bases } = balance(state, row, input.effectiveBusinessDate);
  const replaced = bases.findLast((entry) => entry.effectiveBusinessDate === input.effectiveBusinessDate);
  return { ...input, expectedRevision: state.book.revision, currentBalanceMinor: balanceMinor, replacedRevision: replaced?.revision ?? null };
}

export function saveDictionary(state: BookState, input: z.infer<typeof DictionaryInput>) {
  const existing = state.dictionary.find((item) => item.id === input.id);
  if (input.id && (!existing || input.kind !== existing.kind)) throw errors.notFound("字典条目不存在");
  if (state.dictionary.some((row) => row !== existing && row.kind === input.kind && row.name === input.name)) throw errors.nameConflict(input.name);
  const fields = { name: input.name, status: input.status };
  if (existing) {
    Object.assign(existing, fields);
    return existing;
  }
  const row = { id: randomUUID(), bookId: state.book.id, kind: input.kind, ...fields };
  state.dictionary.push(row);
  return row;
}

export function validateLedgerAccount(state: BookState, id: string, currency: string, previousId?: string) {
  const row = account(state, id);
  const result = checkLedgerReference(state.book.id, "account", row, previousId === id ? "existing" : "new");
  if (result.state === "unavailable" || row.currency !== currency) throw errors.invalidInput("资金账户当前不可用或币种不符");
}
