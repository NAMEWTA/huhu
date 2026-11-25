import { createHash, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { checkLedgerReference, errors, LedgerRecord, ledgerBusinessDate, ledgerBusinessDayRange } from "@huhu/contracts";
import { canonicalJson } from "@huhu/kernel";
import type { z } from "zod";
import type { CreateRecord, InputBatch, RecordFilters, RecordsPage, RecordsQuery, RecordView } from "../shared/entries.js";
import { loanPeriodId } from "../shared/loans.js";
import { validateLedgerAccount } from "./accounts.js";
import { attachmentPath, type BookState, type LedgerStore } from "./store.js";

type Input = z.infer<typeof CreateRecord>["record"];
type Currency = RecordsPage["totals"][number]["currency"];
type MoneyLeg = { accountId: string; currency: Currency; amount: bigint; column: "incomeMinor" | "expenseMinor" | "transferInMinor" | "transferOutMinor" };
export const recordTitle = (state: BookState, row: LedgerRecord) => state.recordTitles[row.id] ?? row.payee ?? "流水";

export function findRecord(state: BookState, id: string, revision?: string): LedgerRecord {
  const found = state.records.find((row) => row.id === id);
  if (!found || found.bookId !== state.book.id) throw errors.notFound("账本没有这笔流水");
  if (revision !== undefined && found.revision !== revision) throw errors.versionConflict(found.revision);
  return found;
}

function validateDimensions(state: BookState, input: Pick<Input, "categoryId" | "tagIds">, previous?: LedgerRecord) {
  const seen = new Set(input.tagIds);
  if (seen.size !== input.tagIds.length || seen.size > 50) throw errors.invalidInput("流水标签重复或过多");
  const refs = [
    ...(input.categoryId ? [{ kind: "category" as const, id: input.categoryId, keep: input.categoryId === previous?.categoryId }] : []),
    ...input.tagIds.map((id) => ({ kind: "tag" as const, id, keep: previous?.tagIds.includes(id) })),
  ];
  for (const { kind, id, keep } of refs) {
    const item = state.dictionary.find((entry) => entry.kind === kind && entry.id === id);
    if (checkLedgerReference(state.book.id, kind, item ?? null, keep ? "existing" : "new").state === "unavailable" && !keep) {
      throw errors.invalidInput("请选择当前账本中可用的分类和标签");
    }
  }
}

export function saveRecord(state: BookState, input: Input, title: string, previous?: LedgerRecord) {
  if ((input.memo?.length ?? 0) > 500 || (input.payee?.length ?? 0) > 500) throw errors.invalidInput("备注和交易对方最多 500 字");
  validateDimensions(state, input, previous);
  if (input.type === "transfer") {
    if (input.fromAccountId === input.toAccountId) throw errors.invalidInput("转入和转出账户须不同");
    validateLedgerAccount(state, input.fromAccountId, input.fromCurrency, previous?.type === "transfer" ? previous.fromAccountId : undefined);
    validateLedgerAccount(state, input.toAccountId, input.toCurrency, previous?.type === "transfer" ? previous.toAccountId : undefined);
  } else {
    validateLedgerAccount(state, input.accountId, input.currency, previous?.type === input.type ? previous.accountId : undefined);
  }
  const attachments = new Set(input.attachmentIds);
  if (attachments.size > 20 || attachments.size !== input.attachmentIds.length ||
      input.attachmentIds.some((id) => !state.attachments.some((item) => item.id === id))) throw errors.invalidInput("请选择当前账本中受管的凭证");
  const row = LedgerRecord.parse({
    ...input, occurredAt: new Date(input.occurredAt).toISOString(),
    id: previous?.id ?? randomUUID(), bookId: state.book.id, revision: randomUUID(),
  });
  if (previous) {
    if (offsets(state).has(previous.id) && (row.type === "transfer" || previous.type === "transfer" || row.type !== previous.type ||
        row.amountMinor !== previous.amountMinor || row.accountId !== previous.accountId || row.currency !== previous.currency ||
        Date.parse(row.occurredAt) !== Date.parse(previous.occurredAt))) {
      throw errors.invalidInput("修改已平账流水的金额、账户或日期前，须先撤销整组平账");
    }
    state.records[state.records.indexOf(previous)] = row;
  } else state.records.push(row);
  state.recordTitles[row.id] = title;
  return row;
}

function offsets(state: BookState) { return new Set(state.offsets.flatMap((group) => group.memberRecordIds)); }
function requireNoOffset(state: BookState, row: LedgerRecord) {
  if (offsets(state).has(row.id)) throw errors.invalidInput("请先撤销这笔流水所在的平账组");
}

export function recordView(store: LedgerStore, state: BookState, record: LedgerRecord, offset: boolean): RecordView {
  const attachments = state.attachments.filter((entry) => record.attachmentIds.includes(entry.id)).map((entry) => {
    const file = statSync(store.files.abs(attachmentPath(state.book.id, entry.id)), { throwIfNoEntry: false });
    return { ...entry, missing: !file?.isFile() || file.size !== entry.size };
  });
  return { record, title: recordTitle(state, record), businessDate: ledgerBusinessDate(record.occurredAt, state.book.timeZone), offset, attachments };
}

export function legs(row: LedgerRecord): MoneyLeg[] {
  return row.type === "transfer" ? [
    { accountId: row.fromAccountId, currency: row.fromCurrency, amount: BigInt(row.fromAmountMinor), column: "transferOutMinor" },
    { accountId: row.toAccountId, currency: row.toCurrency, amount: BigInt(row.toAmountMinor), column: "transferInMinor" },
  ] : [{ accountId: row.accountId, currency: row.currency, amount: BigInt(row.amountMinor), column: row.type === "income" ? "incomeMinor" : "expenseMinor" }];
}

const contains = (value: string | null | undefined, query: string) => value?.toLowerCase().includes(query.toLowerCase()) ?? false;

function compareMoney(filters: RecordFilters, row: LedgerRecord, samples: MoneyLeg[]) {
  if (!filters.currency && filters.minMinor === undefined && filters.maxMinor === undefined) return true;
  const min = filters.minMinor === undefined ? undefined : BigInt(filters.minMinor);
  const max = filters.maxMinor === undefined ? undefined : BigInt(filters.maxMinor);
  return samples.some(({ currency, amount, column }) =>
    (!filters.currency || filters.currency === currency) && (min === undefined || amount >= min) && (max === undefined || amount <= max) &&
    (filters.toAccountId ? column === "transferInMinor" :
      (row.type !== "transfer" || !filters.accountId || filters.accountId === (column === "transferInMinor" ? row.toAccountId : row.fromAccountId))));
}

export function filteredRecords(state: BookState, filters: RecordFilters) {
  const { book, records, dictionary } = state;
  const from = filters.from ? Date.parse(ledgerBusinessDayRange(filters.from, book.timeZone).from) : -Infinity;
  const until = filters.to ? Date.parse(ledgerBusinessDayRange(filters.to, book.timeZone).until) : Infinity;
  const offsetRows = offsets(state);
  const categories = new Map(dictionary.filter((item) => item.kind === "category").map((item) => [item.id, item.name]));
  return records.filter((row) => {
    const when = Date.parse(row.occurredAt);
    if (when < from || when >= until || (filters.type && row.type !== filters.type) ||
        (filters.offset !== undefined && filters.offset !== offsetRows.has(row.id)) ||
        (filters.categoryId && row.categoryId !== filters.categoryId) ||
        (filters.uncategorized && row.categoryId !== null) ||
        (filters.tagId && !row.tagIds.includes(filters.tagId)) ||
        (filters.payee && !contains(row.payee, filters.payee)) ||
        (filters.memo && !contains(row.memo, filters.memo))) return false;
    if (filters.accountId && (row.type === "transfer" ? ![row.fromAccountId, row.toAccountId].includes(filters.accountId) : row.accountId !== filters.accountId)) return false;
    if (filters.toAccountId && (row.type !== "transfer" || row.toAccountId !== filters.toAccountId)) return false;
    if (filters.query && ![recordTitle(state, row), row.memo, row.payee, categories.get(row.categoryId ?? "")].some((value) => contains(value, filters.query!))) return false;
    return compareMoney(filters, row, legs(row));
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}

export function recordsPage(store: LedgerStore, state: BookState, { filters, page, pageSize }: z.infer<typeof RecordsQuery>): RecordsPage {
  const { book } = state;
  const offsetRows = offsets(state);
  const sums = new Map<Currency, Record<MoneyLeg["column"], bigint>>();
  const matching = filteredRecords(state, filters);
  for (const row of matching) {
    if (offsetRows.has(row.id)) continue;
    for (const { currency, amount, column } of legs(row)) {
      if (filters.currency && currency !== filters.currency) continue;
      const sum = sums.get(currency) ?? { incomeMinor: 0n, expenseMinor: 0n, transferOutMinor: 0n, transferInMinor: 0n };
      sum[column] += amount;
      sums.set(currency, sum);
    }
  }
  const totals = [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({
    currency,
    incomeMinor: value.incomeMinor.toString(), expenseMinor: value.expenseMinor.toString(),
    netMinor: (value.incomeMinor - value.expenseMinor).toString(),
    transferOutMinor: value.transferOutMinor.toString(), transferInMinor: value.transferInMinor.toString(),
  }));
  const start = (page - 1) * pageSize;
  return { book, total: matching.length, page, pageSize, totals, rows: matching.slice(start, start + pageSize).map((row) => recordView(store, state, row, offsetRows.has(row.id))) };
}

export function viewRecord(store: LedgerStore, state: BookState, id: string) {
  return recordView(store, state, findRecord(state, id), offsets(state).has(id));
}

export function duplicateRecord(state: BookState, original: LedgerRecord) {
  const { id: _id, bookId: _bookId, revision: _revision, ...draft } = original;
  return saveRecord(state, draft, recordTitle(state, original));
}

export function previewBatch(state: BookState, input: z.infer<typeof InputBatch>) {
  const selection = input.selection.map(({ recordId, recordRevision }) => findRecord(state, recordId, recordRevision));
  const generated = new Set([
    ...state.recurringPeriods.filter(({ state }) => state === "generated").map(({ periodId }) => periodId),
    ...state.loanPayments.map(({ loanId, number }) => loanPeriodId(loanId, number)),
  ]);
  for (const row of selection) {
    if (input.action.kind === "delete") {
      requireNoOffset(state, row);
      if (state.recordReferences.some(({ recordId, kind, targetId }) => recordId === row.id &&
        (kind !== "occurrence" || !generated.has(targetId)))) {
        throw errors.invalidInput("删除前请先解除流水的笔记或期次关联");
      }
    } else {
      const { patch } = input.action;
      validateDimensions(state, { categoryId: patch.categoryId === undefined ? row.categoryId : patch.categoryId, tagIds: patch.tagIds ?? row.tagIds }, row);
    }
  }
  const previewId = createHash("sha256").update(canonicalJson(input)).digest("hex");
  return { previewId, revision: input.expectedRevision, count: selection.length, attachmentCount: new Set(selection.flatMap((row) => row.attachmentIds)).size };
}

export function applyBatch(state: BookState, input: z.infer<typeof InputBatch>) {
  const action = input.action;
  const ids = new Set(input.selection.map(({ recordId }) => recordId));
  if (action.kind === "delete") {
    state.records = state.records.filter(({ id }) => !ids.has(id));
    state.recordReferences = state.recordReferences.filter(({ recordId }) => !ids.has(recordId));
    for (const id of ids) delete state.recordTitles[id];
  } else {
    for (const row of state.records) {
      if (ids.has(row.id)) Object.assign(row, action.patch, { revision: randomUUID() });
    }
  }
  return { count: ids.size };
}
