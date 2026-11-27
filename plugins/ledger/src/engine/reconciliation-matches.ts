import { errors, ledgerBusinessDate, type LedgerRecord } from "@huhu/contracts";
import { canonicalJson } from "@huhu/kernel";
import type { z } from "zod";
import type { CandidateGroups, DuplicateSearch, OffsetSearch } from "../shared/reconciliation.js";
import { filteredRecords, findRecord, recordTitle } from "./records.js";
import type { BookState } from "./store.js";

const maxGroups = 30;
const maxAnchorRows = 150;
const maxSplitCandidates = 20;
const maxSplit = 5;
type Single = Extract<LedgerRecord, { type: "income" | "expense" }>;
const single = (row: LedgerRecord): row is Single => row.type !== "transfer";
const pegged = (state: BookState) => new Set(state.offsets.flatMap(({ memberRecordIds }) => memberRecordIds));
const normalize = (value: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, "");
const project = (state: BookState, groups: LedgerRecord[][], truncated: boolean): CandidateGroups => ({
  expectedRevision: state.book.revision,
  groups: groups.map((group) => group.map((record) => ({ record, title: recordTitle(state, record) }))),
  truncated,
});

function grams(text: string): Set<string> {
  const points = Array.from(text);
  if (points.length === 1) return new Set(points);
  return new Set(points.flatMap((point, index) => (index + 1 < points.length ? [point + points[index + 1]] : [])));
}

function similarity(a: string, b: string, minimum: number): boolean {
  if (minimum === 0 || a === b) return true;
  const first = grams(a);
  const second = grams(b);
  const overlap = [...first].filter((item) => second.has(item)).length;
  return 100 * overlap >= minimum * (first.size + second.size - overlap);
}

export function monetaryShape(row: LedgerRecord) {
  return row.type === "transfer" ? [row.type, row.fromCurrency, row.fromAmountMinor, row.toCurrency, row.toAmountMinor] : [row.type, row.currency, row.amountMinor];
}

export function duplicateCandidates(state: BookState, options: z.infer<typeof DuplicateSearch>): CandidateGroups {
  const occupied = pegged(state);
  const buckets = new Map<string, LedgerRecord[][]>();
  for (const row of filteredRecords(state, options.filters)) {
    if (occupied.has(row.id)) continue;
    const time = Date.parse(row.occurredAt);
    const timestamp = options.precision === "minute" ? Math.floor(time / 60_000) : options.precision === "second" ? Math.floor(time / 1000) : options.precision === "day" ? ledgerBusinessDate(row.occurredAt, state.book.timeZone) : null;
    const account = !options.sameAccount ? null : row.type === "transfer" ? [row.fromAccountId, row.toAccountId] : row.accountId;
    const key = canonicalJson([timestamp, monetaryShape(row), account, options.samePayee ? normalize(row.payee) : null]);
    const groups = buckets.get(key) ?? [];
    const group = groups.find(([first]) => first && similarity(normalize(first.memo), normalize(row.memo), options.memoSimilarity));
    if (group) group.push(row);
    else groups.push([row]);
    buckets.set(key, groups);
  }
  const candidates = Array.from(buckets.values())
    .flat()
    .filter((group) => group.length > 1);
  return project(
    state,
    candidates.slice(0, maxGroups).map((group) => group.slice(0, 50)),
    candidates.length > maxGroups || candidates.some((group) => group.length > 50),
  );
}

function exactSplits(pool: Single[], target: bigint, limit: number): Single[][] {
  const values = pool.map((row) => ({ row, amount: BigInt(row.amountMinor) }));
  const result: Single[][] = [];
  const chosen: Single[] = [];
  function visit(start: number, remaining: bigint) {
    if (remaining === 0n) {
      result.push([...chosen]);
      return;
    }
    if (chosen.length >= maxSplit || result.length >= limit) return;
    for (let index = start; index < values.length && result.length < limit; index++) {
      const entry = values[index]!;
      if (entry.amount > remaining) continue;
      chosen.push(entry.row);
      visit(index + 1, remaining - entry.amount);
      chosen.pop();
    }
  }
  visit(0, target);
  return result;
}

export function offsetCandidates(state: BookState, input: z.infer<typeof OffsetSearch>): CandidateGroups {
  const occupied = pegged(state);
  const opposite = filteredRecords(state, input.recordId ? {} : input.filters).filter((row): row is Single => single(row) && !occupied.has(row.id));
  const anchor = input.recordId ? findRecord(state, input.recordId) : undefined;
  if (anchor && (!single(anchor) || occupied.has(anchor.id))) throw errors.invalidInput("请选择一笔尚未平账的收入或支出");
  const anchors = anchor && single(anchor) ? [anchor] : opposite.slice(0, maxAnchorRows);
  const results: LedgerRecord[][] = [];
  const known = new Set<string>();
  let truncated = !anchor && opposite.length > maxAnchorRows;
  const work = anchors.map((source) => {
    const time = Date.parse(source.occurredAt);
    const sourceMemo = normalize(source.memo ?? recordTitle(state, source));
    const target = BigInt(source.amountMinor);
    const candidates = opposite.filter(
      (row) =>
        row.type !== source.type &&
        row.currency === source.currency &&
        BigInt(row.amountMinor) <= target &&
        (!input.sameAccount || row.accountId === source.accountId) &&
        Math.abs(Date.parse(row.occurredAt) - time) <= input.windowDays * 86_400_000 &&
        similarity(sourceMemo, normalize(row.memo ?? recordTitle(state, row)), input.memoSimilarity),
    );
    const oneToOne = candidates.filter((row) => row.amountMinor === source.amountMinor);
    const splits = candidates.filter((row) => row.amountMinor !== source.amountMinor);
    if (splits.length > maxSplitCandidates || oneToOne.length > maxGroups + 1) truncated = true;
    return { source, target, oneToOne: oneToOne.slice(0, maxGroups + 1), splits: splits.slice(0, maxSplitCandidates) };
  });
  for (const split of [false, true]) {
    for (const { source, target, oneToOne, splits } of work) {
      const groups = split ? exactSplits(splits, target, maxGroups + 1) : oneToOne.map((row) => [row]);
      for (const group of groups) {
        const rows = [source, ...group];
        const times = rows.map((row) => Date.parse(row.occurredAt));
        if (Math.max(...times) - Math.min(...times) > input.windowDays * 86_400_000) continue;
        const key = rows
          .map(({ id }) => id)
          .sort()
          .join(",");
        if (known.has(key)) continue;
        if (results.length >= maxGroups) return project(state, results, true);
        known.add(key);
        results.push(rows);
      }
    }
  }
  return project(state, results, truncated);
}
