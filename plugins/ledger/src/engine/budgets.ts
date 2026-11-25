import { randomUUID } from "node:crypto";
import { checkLedgerReference, errors, ledgerBusinessDate } from "@huhu/contracts";
import type { z } from "zod";
import type { Budget, BudgetDetail, BudgetDetailQuery, BudgetOverview, BudgetQuery, CopyBudgetResult, CopyBudgets, SaveBudgets } from "../shared/budgets.js";
import { calendarMonth } from "../shared/reports.js";
import { filteredRecords, recordView } from "./records.js";
import type { BookState, LedgerStore } from "./store.js";

const key = ({ name, ...definition }: Budget["definition"]) =>
  JSON.stringify([definition.type, definition.type === "fixed" ? definition.month : null, name.normalize("NFKC").toLowerCase()]);

function readBudget(state: BookState, id: string) {
  const budget = state.budgets.find((row) => row.id === id && row.bookId === state.book.id);
  if (!budget) throw errors.notFound("当前账本没有这项预算");
  return budget;
}

function validateDimensions(state: BookState, definition: Budget["definition"], previous?: Budget["definition"]) {
  const kind = definition.type === "fixed" ? "category" : "tag";
  const ids = definition.type === "fixed" ? definition.categoryIds : definition.tagIds;
  const oldIds = previous?.type === "fixed" ? previous.categoryIds : previous?.tagIds;
  for (const id of ids) {
    const item = state.dictionary.find((entry) => entry.kind === kind && entry.id === id);
    const existing = previous?.type === definition.type && oldIds?.includes(id);
    if (!existing && checkLedgerReference(state.book.id, kind, item ?? null, "new").state === "unavailable") {
      throw errors.invalidInput("请选择当前账本可用的预算分类或标签");
    }
  }
}

export function saveBudgets(state: BookState, { budgets }: z.infer<typeof SaveBudgets>) {
  const replacing = new Set(budgets.flatMap(({ id }) => id ? [id] : []));
  if (replacing.size !== budgets.filter(({ id }) => id).length) throw errors.invalidInput("同一预算只能修改一次");
  const retained = state.budgets.filter(({ id }) => !replacing.has(id));
  const names = new Set(retained.map(({ definition }) => key(definition)));
  const saved = budgets.map(({ id, definition }): Budget => {
    const previous = id ? readBudget(state, id).definition : undefined;
    validateDimensions(state, definition, previous);
    const budgetKey = key(definition);
    if (names.has(budgetKey)) throw errors.nameConflict(definition.name);
    names.add(budgetKey);
    return { id: id ?? randomUUID(), bookId: state.book.id, revision: randomUUID(), definition };
  });
  state.budgets = [...retained, ...saved];
  return saved;
}

export function removeBudget(state: BookState, id: string) {
  const budget = readBudget(state, id);
  state.budgets = state.budgets.filter((row) => row !== budget);
  return budget;
}

export function copyBudgets(state: BookState, { source, targets }: z.infer<typeof CopyBudgets>): CopyBudgetResult {
  const originals = state.budgets.flatMap(({ definition }) => definition.type === "fixed" && definition.month === source ? [definition] : []);
  const names = new Map(state.budgets.map((budget) => [key(budget.definition), budget.id]));
  const result: CopyBudgetResult = { created: 0, skipped: [] };
  for (const month of targets) {
    for (const original of originals) {
      const definition = { ...original, month };
      const budgetKey = key(definition);
      const existingId = names.get(budgetKey);
      if (existingId) {
        result.skipped.push({ month, name: original.name, existingId });
      } else {
        const id = randomUUID();
        state.budgets.push({ id, bookId: state.book.id, revision: randomUUID(), definition });
        names.set(budgetKey, id);
        result.created++;
      }
    }
  }
  return result;
}

function selectPeriod(state: BookState, { year, month, currency }: z.infer<typeof BudgetQuery>) {
  const { from, to } = month ? calendarMonth(year + "-" + month) : { from: year + "-01-01", to: year + "-12-31" };
  const budgets = state.budgets.filter(({ definition }) => {
    if (currency && definition.currency !== currency) return false;
    if (definition.type === "fixed") return month ? definition.month === year + "-" + month : definition.month.startsWith(year + "-");
    return (!definition.from || definition.from <= to) && (!definition.to || definition.to >= from);
  });
  const records = filteredRecords(state, { from, to, currency, offset: false }).flatMap((record) =>
    record.type === "transfer" ? [] : [{ record, date: ledgerBusinessDate(record.occurredAt, state.book.timeZone) }]);
  return { budgets, records };
}

function match({ definition }: Budget, records: ReturnType<typeof selectPeriod>["records"]) {
  if (definition.type === "fixed") {
    const categories = new Set(definition.categoryIds);
    return records.filter(({ record, date }) => record.currency === definition.currency && record.type === definition.direction &&
      date.startsWith(definition.month + "-") && (categories.size === 0 || (record.categoryId !== null && categories.has(record.categoryId))));
  }
  const tags = new Set(definition.tagIds);
  return records.filter(({ record, date }) => record.currency === definition.currency && record.type === "expense" &&
    (!definition.from || date >= definition.from) && (!definition.to || date <= definition.to) &&
    record.tagIds.some((id) => tags.has(id)));
}

const amounts = (limit: bigint, actual: bigint) =>
  ({ limitMinor: limit.toString(), actualMinor: actual.toString(), remainingMinor: (limit - actual).toString() });
const actualAmount = (matched: ReturnType<typeof match>) => matched.reduce((sum, { record }) => sum + BigInt(record.amountMinor), 0n);

export function budgetOverview(state: BookState, query: z.infer<typeof BudgetQuery>): BudgetOverview {
  const { budgets, records } = selectPeriod(state, query);
  type Bucket = Pick<BudgetOverview["totals"][number], "type" | "direction" | "currency">;
  const groups = new Map<string, { bucket: Bucket; limit: bigint; actual: bigint }>();
  const rows = budgets.map((budget) => {
    const { definition } = budget;
    const matched = match(budget, records);
    const limit = BigInt(definition.limitMinor);
    const actual = actualAmount(matched);
    const bucket = { type: definition.type, direction: definition.type === "fixed" ? definition.direction : "expense", currency: definition.currency } as const;
    const groupKey = JSON.stringify(bucket);
    const group = groups.get(groupKey) ?? { bucket, limit: 0n, actual: 0n };
    // Each configured budget contributes its own progress, even when different budgets overlap.
    group.limit += limit;
    group.actual += actual;
    groups.set(groupKey, group);
    return { ...budget, ...amounts(limit, actual), count: matched.length };
  });
  return { revision: state.book.revision, budgets: rows, totals: [...groups.values()].map(({ bucket, limit, actual }) => ({ ...bucket, ...amounts(limit, actual) })) };
}

export function budgetDetail(store: LedgerStore, state: BookState, query: z.infer<typeof BudgetDetailQuery>): BudgetDetail {
  const budget = readBudget(state, query.budgetId);
  const { budgets, records } = selectPeriod(state, query);
  const matched = budgets.includes(budget) ? match(budget, records) : [];
  const { page, pageSize } = query;
  const start = (page - 1) * pageSize;
  return {
    ...budget, ...amounts(BigInt(budget.definition.limitMinor), actualAmount(matched)), count: matched.length, page, pageSize,
    rows: matched.slice(start, start + pageSize).map(({ record }) => recordView(store, state, record, false)),
  };
}
