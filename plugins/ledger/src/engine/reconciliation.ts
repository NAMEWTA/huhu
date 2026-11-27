import { createHash, randomUUID } from "node:crypto";
import { errors, LedgerOffsetGroup, LedgerRecord, type LedgerRecord as RecordRow } from "@huhu/contracts";
import { canonicalJson } from "@huhu/kernel";
import type { z } from "zod";
import type { ConfirmMerge, MergeInput, MergePreview, OffsetGroupView, OffsetInput, OffsetPreview, UndoOffset } from "../shared/reconciliation.js";
import { monetaryShape } from "./reconciliation-matches.js";
import { findRecord, recordTitle } from "./records.js";
import { documentKey } from "./references.js";
import type { BookState } from "./store.js";

const distinct = <T>(values: T[]) => [...new Set(values)];
const project = (state: BookState, records: RecordRow[]) => records.map((record) => ({ title: recordTitle(state, record), record }));

function identity(mode: "merge" | "offset", input: MergeInput | OffsetInput) {
  const members = input.members.map(({ recordId, recordRevision }) => [recordId, recordRevision]).sort(([a], [b]) => a!.localeCompare(b!));
  return createHash("sha256")
    .update(canonicalJson([mode, input.bookId, input.expectedRevision, members, "keepRecordId" in input ? input.keepRecordId : null]))
    .digest("hex");
}

function ungrouped(state: BookState, input: MergeInput | OffsetInput) {
  const ids = new Set(state.offsets.flatMap(({ memberRecordIds }) => memberRecordIds));
  return input.members.map(({ recordId, recordRevision }) => {
    if (ids.has(recordId)) throw errors.invalidInput("请先撤销成员原有的整组平账");
    return findRecord(state, recordId, recordRevision);
  });
}

export function previewMerge(state: BookState, input: MergeInput): MergePreview {
  const records = ungrouped(state, input);
  const keeper = records.find((row) => row.id === input.keepRecordId);
  if (!keeper) throw errors.invalidInput("保留行必须位于待合并组内");
  const vector = canonicalJson(monetaryShape(keeper));
  if (records.some((row) => canonicalJson(monetaryShape(row)) !== vector)) {
    throw errors.invalidInput("合并组必须为同方向、同币种和同金额的流水");
  }
  const ids = new Set(records.map(({ id }) => id));
  const notes = distinct([
    ...state.recordReferences.filter(({ kind, recordId }) => kind === "note" && ids.has(recordId)).map(({ targetId }) => targetId),
    ...state.resourceReferences.flatMap(({ owner, resource }) => (owner.kind === "record" && ids.has(owner.id) ? [documentKey(resource)] : [])),
  ]);
  const occurrences = distinct(state.recordReferences.filter(({ kind, recordId }) => kind === "occurrence" && ids.has(recordId)).map(({ targetId }) => targetId));
  const combined = distinct([keeper, ...records.filter((row) => row !== keeper)].map(({ memo }) => memo?.trim()).filter(Boolean)).join(" / ");
  return {
    expectedRevision: input.expectedRevision,
    previewId: identity("merge", input),
    keepRecordId: keeper.id,
    rows: project(state, records),
    accounts: distinct(records.map((row) => (row.type === "transfer" ? row.fromAccountId : row.accountId))),
    toAccounts: distinct(records.flatMap((row) => (row.type === "transfer" ? [row.toAccountId] : []))),
    categories: distinct(records.map(({ categoryId }) => categoryId)),
    suggestedMemo: combined.slice(0, 500) || null,
    memoOverflow: combined.length > 500,
    references: {
      attachments: distinct(records.flatMap(({ attachmentIds }) => attachmentIds)).length,
      notes: notes.length,
      occurrences: occurrences.length,
      conflictingOccurrences: occurrences.length > 1 ? occurrences : [],
    },
  };
}

function choice<T>(available: T[], provided: T | undefined, label: string): T {
  if (provided !== undefined && available.includes(provided)) return provided;
  if (provided === undefined && available.length === 1) return available[0]!;
  throw errors.invalidInput(`请在合并预览中选择${label}`);
}

export function merge(state: BookState, input: z.infer<typeof ConfirmMerge>) {
  const preview = previewMerge(state, input);
  if (input.previewId !== preview.previewId) throw errors.invalidInput("合并组已变化，请重新预览");
  if (preview.references.conflictingOccurrences.length > 0) throw errors.invalidInput("不同计划期次须保留独立流水");
  if (preview.memoOverflow && input.memo === undefined) throw errors.invalidInput("合并备注超长，请确认保留的内容");
  const records = preview.rows.map(({ record }) => record);
  const previous = findRecord(state, input.keepRecordId);
  const { id } = previous;
  const removed = records.filter((row) => row.id !== id).map((row) => row.id);
  const retired = new Set(removed);
  const source = choice(preview.accounts, input.accountId, "保留的资金账户");
  const categoryId = choice(preview.categories, input.categoryId, "保留的分类");
  const tags = distinct(records.flatMap(({ tagIds }) => tagIds));
  const attachments = distinct(records.flatMap(({ attachmentIds }) => attachmentIds));
  if (tags.length > 50 || attachments.length > 20) throw errors.invalidInput("标签或凭证超出单笔上限，合并会丢失引用");
  const fields = {
    ...previous,
    categoryId,
    tagIds: tags,
    attachmentIds: attachments,
    revision: randomUUID(),
    memo: input.memo === undefined ? preview.suggestedMemo : input.memo,
  };
  let retained: RecordRow;
  if (previous.type === "transfer") {
    const destination = choice(preview.toAccounts, input.toAccountId, "保留的转入账户");
    if (source === destination) throw errors.invalidInput("转入和转出账户须不同");
    retained = LedgerRecord.parse({ ...fields, fromAccountId: source, toAccountId: destination });
  } else {
    retained = LedgerRecord.parse({ ...fields, accountId: source });
  }
  state.records = state.records.flatMap((row) => (retired.has(row.id) ? [] : [row.id === id ? retained : row]));
  state.legacyOffsetRecordIds = state.legacyOffsetRecordIds.filter((recordId) => !retired.has(recordId));
  for (const removedId of removed) delete state.recordTitles[removedId];
  const references = new Map(
    state.recordReferences.map((row) => {
      const next = retired.has(row.recordId) ? { ...row, recordId: id } : row;
      return [canonicalJson([next.kind, next.targetId, next.recordId]), next];
    }),
  );
  state.recordReferences = [...references.values()];
  const keptResources = new Set(state.resourceReferences.flatMap(({ owner, resource }) => (owner.kind === "record" && owner.id === id ? [documentKey(resource)] : [])));
  state.resourceReferences = state.resourceReferences.flatMap((row) => {
    if (row.owner.kind !== "record" || !retired.has(row.owner.id)) return [row];
    const key = documentKey(row.resource);
    if (keptResources.has(key)) return [];
    keptResources.add(key);
    return [{ ...row, owner: { kind: "record" as const, id } }];
  });
  for (const [key, recordId] of Object.entries(state.importRows)) {
    if (retired.has(recordId)) state.importRows[key] = id;
  }
  return { retained, removed };
}

export function previewOffset(state: BookState, input: OffsetInput): OffsetPreview {
  const rows = ungrouped(state, input);
  const first = rows[0]!;
  if (first.type === "transfer") throw errors.invalidInput("转账不能参与平账");
  const currency = first.currency;
  let income = 0n;
  let expense = 0n;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const row of rows) {
    if (row.type === "transfer" || row.currency !== currency) throw errors.invalidInput("平账须选择同币种的收入与支出");
    if (row.type === "income") {
      income += BigInt(row.amountMinor);
      incomeCount++;
    } else {
      expense += BigInt(row.amountMinor);
      expenseCount++;
    }
  }
  if (Math.min(incomeCount, expenseCount) !== 1 || income !== expense) {
    throw errors.invalidInput("平账须由一笔流水与一至五笔反向等额流水组成");
  }
  return {
    expectedRevision: input.expectedRevision,
    previewId: identity("offset", input),
    rows: project(state, rows),
    currency,
    amountMinor: income.toString(),
  };
}

export function addOffset(state: BookState, input: OffsetInput & { previewId: string }) {
  const preview = previewOffset(state, input);
  if (input.previewId !== preview.previewId) throw errors.invalidInput("平账组已变化，请重新预览");
  const group = LedgerOffsetGroup.parse({
    id: randomUUID(),
    bookId: state.book.id,
    currency: preview.currency,
    memberRecordIds: preview.rows.map(({ record }) => record.id),
    createdAt: new Date().toISOString(),
    revision: randomUUID(),
  });
  state.offsets.push(group);
  return group;
}

export function groupView(state: BookState, recordId: string): OffsetGroupView {
  const group = state.offsets.find((entry) => entry.memberRecordIds.includes(recordId));
  if (!group) throw errors.notFound("流水不属于任何平账组");
  return {
    group,
    expectedRevision: state.book.revision,
    rows: project(
      state,
      group.memberRecordIds.map((id) => findRecord(state, id)),
    ),
  };
}

export function undoOffset(state: BookState, input: z.infer<typeof UndoOffset>) {
  const group = state.offsets.find(({ id }) => id === input.offsetId);
  if (!group) throw errors.notFound("平账组不存在");
  if (group.revision !== input.offsetRevision) throw errors.versionConflict(group.revision);
  state.offsets = state.offsets.filter(({ id }) => id !== group.id);
  return { restored: group.memberRecordIds.length };
}
