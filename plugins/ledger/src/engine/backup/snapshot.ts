import { createHash, randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { missingBackupModules, type BackupModule } from "../../shared/backups.js";
import { EntryId, maxAttachmentBytes } from "../../shared/entries.js";
import { loanPeriodId } from "../../shared/loans.js";
import { recurringPlanId } from "../../shared/recurring.js";
import { attachmentPath, bookPath, indexPath, indexSchema, ledgerDirectory, ledgerOperations, stateSchema, type BookState } from "../store.js";

export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const json = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
const invalid = (detail: string) => errors.invalidInput("账本备份无效：" + detail);

function indexById<T extends { id: string }>(rows: readonly T[], label: string) {
  const index = new Map(rows.map((row) => [row.id, row]));
  if (index.size !== rows.length || rows.some(({ id }) => !EntryId.safeParse(id).success)) throw invalid(label + "身份重复或无效");
  return index;
}

export function validateBookRelations(state: BookState) {
  const bookId = state.book.id;
  const accounts = indexById(state.accounts, "账户");
  const records = indexById(state.records, "流水");
  const dictionary = indexById(state.dictionary, "字典");
  const attachments = indexById(state.attachments, "凭证");
  const budgets = indexById(state.budgets, "预算");
  indexById(state.resourceReferences, "财务笔记关联");
  const cycles = indexById(state.recurring, "固定收支");
  const loans = indexById(state.loans, "贷款");
  indexById(state.offsets, "平账组");
  if (!EntryId.safeParse(bookId).success || [...accounts.values(), ...records.values(), ...dictionary.values(), ...budgets.values(), ...loans.values(), ...state.bases, ...state.offsets].some((row) => row.bookId !== bookId)) {
    throw invalid("条目与账本身份不符");
  }
  const hasAccount = (id: string, currency: string) => accounts.get(id)?.currency === currency;
  const dimension = (id: string | null, kind: string) => id === null || dictionary.get(id)?.kind === kind;
  if (state.bases.some(({ accountId }) => !accounts.has(accountId)) ||
      Object.entries(state.accountLabels).some(([id, row]) => !accounts.has(id) || !dimension(row.bankId, "bank") || !dimension(row.accountTypeId, "account-type"))) throw invalid("账户基准或字典缺失");
  if ([...records.values()].some((row) =>
    !dimension(row.categoryId, "category") || row.tagIds.some((id) => !dimension(id, "tag")) || row.attachmentIds.some((id) => !attachments.has(id)) ||
    (row.type === "transfer" ? !hasAccount(row.fromAccountId, row.fromCurrency) || !hasAccount(row.toAccountId, row.toCurrency) : !hasAccount(row.accountId, row.currency)))) {
    throw invalid("流水的账户、币种、字典或凭证缺失");
  }
  if (state.budgets.some(({ definition }) => definition.type === "fixed"
    ? definition.categoryIds.some((id) => !dimension(id, "category"))
    : definition.tagIds.some((id) => !dimension(id, "tag"))) ||
    state.mappings.some(({ kind, targetId }) => kind === "account" ? !accounts.has(targetId) : !dimension(targetId, "category"))) throw invalid("预算或映射目标缺失");
  if (state.recurring.some((row) => !hasAccount(row.accountId, row.currency) || row.planId !== recurringPlanId(bookId, row.id)) ||
    state.loans.some(({ definition }) => !hasAccount(definition.accountId, definition.currency)) ||
    state.recurringPeriods.some(({ ruleId, date, periodId }) => !cycles.has(ruleId) || periodId !== ruleId + ":" + date) ||
    state.loanPayments.some((row) => loans.has(row.loanId) && row.number > loans.get(row.loanId)!.definition.months)) throw invalid("固定收支或贷款期次不匹配");

  const periodIds = [...state.recurringPeriods.map(({ periodId }) => periodId), ...state.loanPayments.map(({ loanId, number }) => loanPeriodId(loanId, number))];
  if (new Set(periodIds).size !== periodIds.length) throw invalid("期次重复");
  const periods = new Set(periodIds);
  if (state.recordReferences.some(({ recordId, kind, targetId }) => !records.has(recordId) || (kind === "occurrence" && !periods.has(targetId))) ||
    [...Object.keys(state.recordTitles), ...state.legacyOffsetRecordIds].some((id) => !records.has(id))) throw invalid("流水关系缺失");
  if (state.resourceReferences.some(({ owner }) => (owner.kind === "record" && !records.has(owner.id)) ||
    (owner.kind === "budget" && !budgets.has(owner.id)))) throw invalid("财务笔记关联对象缺失");

  const offsetMembers = new Set<string>();
  for (const group of state.offsets) {
    let income = 0n;
    let expense = 0n;
    let incomes = 0;
    let expenses = 0;
    for (const id of group.memberRecordIds) {
      const record = records.get(id);
      if (offsetMembers.has(id) || !record || record.type === "transfer" || record.currency !== group.currency) throw invalid("平账组成员不完整或重复");
      offsetMembers.add(id);
      if (record.type === "income") { income += BigInt(record.amountMinor); incomes++; }
      else { expense += BigInt(record.amountMinor); expenses++; }
    }
    if (income !== expense || Math.min(incomes, expenses) !== 1) throw invalid("平账组方向或金额不符");
  }
}

export function requireModules(modules: readonly BackupModule[]) {
  const missing = missingBackupModules(modules);
  if (missing.length) throw errors.invalidInput("所选备份模块缺少依赖", { missing });
}

export function selectModules(state: BookState, modules: readonly BackupModule[]): BookState {
  requireModules(modules);
  const has = (module: BackupModule) => modules.includes(module);
  const includeRecords = has("records");
  const includeFiles = has("attachments");
  return {
    ...state,
    accounts: has("accounts") ? state.accounts : [],
    bases: has("accounts") ? state.bases : [],
    dictionary: has("accounts") ? state.dictionary : [],
    accountLabels: has("accounts") ? state.accountLabels : {},
    records: includeRecords ? state.records.map((row) => includeFiles ? row : { ...row, attachmentIds: [] }) : [],
    recordTitles: includeRecords ? state.recordTitles : {},
    recordReferences: includeRecords ? state.recordReferences.filter(({ kind }) => kind !== "occurrence" || has("cycles")) : [],
    resourceReferences: state.resourceReferences.filter(({ owner }) =>
      owner.kind === "book" || (owner.kind === "record" ? includeRecords : has("budgets"))),
    offsets: includeRecords ? state.offsets : [],
    legacyOffsetRecordIds: includeRecords ? state.legacyOffsetRecordIds : [],
    importRows: includeRecords ? state.importRows : {},
    importReceipts: [],
    budgets: has("budgets") ? state.budgets : [],
    recurring: has("cycles") ? state.recurring : [],
    recurringPeriods: has("cycles") ? state.recurringPeriods : [],
    loans: has("cycles") ? state.loans : [],
    loanPayments: has("cycles") ? state.loanPayments : [],
    mappings: has("mappings") ? state.mappings : [],
    attachments: includeFiles ? state.attachments : [],
  };
}

export function remapBook(source: BookState, sourceAttachments: ReadonlyMap<string, Uint8Array>, name: string) {
  const state = structuredClone(source);
  const oldBookId = state.book.id;
  const bookId = randomUUID();
  const ids = new Map<string, string>([[oldBookId, bookId]]);
  const idFor = (id: string): string => {
    const prior = ids.get(id);
    if (prior) return prior;
    const next = randomUUID();
    ids.set(id, next);
    return next;
  };
  const nullable = (id: string | null) => id === null ? null : idFor(id);
  const rekey = <T>(rows: Record<string, T>) => Object.fromEntries(Object.entries(rows).map(([id, value]) => [idFor(id), value]));
  const periods = new Map<string, string>();
  state.book = { ...state.book, id: bookId, name, status: "active", revision: randomUUID() };
  state.accounts = state.accounts.map((row) => ({ ...row, id: idFor(row.id), bookId }));
  state.bases = state.bases.map((row) => ({ ...row, bookId, accountId: idFor(row.accountId), revision: randomUUID() }));
  state.dictionary = state.dictionary.map((row) => ({ ...row, id: idFor(row.id), bookId }));
  state.records = state.records.map((row) => {
    const common = { id: idFor(row.id), bookId, revision: randomUUID(), categoryId: nullable(row.categoryId), tagIds: row.tagIds.map(idFor), attachmentIds: row.attachmentIds.map(idFor) };
    return row.type === "transfer" ? { ...row, ...common, fromAccountId: idFor(row.fromAccountId), toAccountId: idFor(row.toAccountId) }
      : { ...row, ...common, accountId: idFor(row.accountId) };
  });
  state.accountLabels = rekey(Object.fromEntries(Object.entries(state.accountLabels).map(([id, row]) => [id, { bankId: nullable(row.bankId), accountTypeId: nullable(row.accountTypeId) }])));
  state.recordTitles = rekey(state.recordTitles);
  state.attachments = state.attachments.map((row) => ({ ...row, id: idFor(row.id) }));
  state.offsets = state.offsets.map((row) => ({ ...row, id: idFor(row.id), bookId, memberRecordIds: row.memberRecordIds.map(idFor), revision: randomUUID() }));
  state.legacyOffsetRecordIds = state.legacyOffsetRecordIds.map(idFor);
  state.importRows = Object.fromEntries(Object.entries(state.importRows).map(([key, id]) => [key, idFor(id)]));
  state.importReceipts = [];
  state.mappingRevision = randomUUID();
  state.mappings = state.mappings.map((row) => ({ ...row, targetId: idFor(row.targetId) }));
  state.budgets = state.budgets.map((row) => ({
    ...row, id: idFor(row.id), bookId, revision: randomUUID(),
    definition: row.definition.type === "fixed" ? { ...row.definition, categoryIds: row.definition.categoryIds.map(idFor) }
      : { ...row.definition, tagIds: row.definition.tagIds.map(idFor) },
  }));
  state.recurring = state.recurring.map((row) => ({ ...row, id: idFor(row.id), accountId: idFor(row.accountId), planId: recurringPlanId(bookId, idFor(row.id)) }));
  state.recurringPeriods = state.recurringPeriods.map((row) => {
    const ruleId = idFor(row.ruleId);
    const periodId = ruleId + ":" + row.date;
    periods.set(row.periodId, periodId);
    return { ...row, ruleId, periodId, recordId: nullable(row.recordId) };
  });
  state.loans = state.loans.map((row) => ({ ...row, id: idFor(row.id), bookId, definition: { ...row.definition, accountId: idFor(row.definition.accountId) } }));
  state.loanPayments = state.loanPayments.map((row) => {
    const loanId = idFor(row.loanId);
    periods.set(loanPeriodId(row.loanId, row.number), loanPeriodId(loanId, row.number));
    return { ...row, loanId, recordId: idFor(row.recordId) };
  });
  state.recordReferences = state.recordReferences.map((row) => ({ ...row, recordId: idFor(row.recordId),
    targetId: row.kind === "occurrence" ? periods.get(row.targetId)! : row.targetId }));
  state.resourceReferences = state.resourceReferences.map((row) => ({
    ...row, id: idFor(row.id), owner: row.owner.kind === "book" ? row.owner : { ...row.owner, id: idFor(row.owner.id) },
  }));
  const attachments = new Map([...sourceAttachments].map(([id, value]) => [idFor(id), value]));
  return { state, attachments };
}

export function requireAttachment(bytes: Uint8Array | undefined, metadata: BookState["attachments"][number]) {
  if (!bytes || bytes.byteLength !== metadata.size || metadata.size > maxAttachmentBytes || digest(bytes) !== metadata.sha256) {
    throw invalid("凭证文件缺失或完整性不符：" + metadata.fileName);
  }
  return bytes;
}

export function ledgerPackageSelection(files: VaultFiles, includeAttachments = true) {
  const expected = new Map<string, string>();
  const computedFiles = new Map<string, Uint8Array>();
  function ledgerEntry(relative: string) {
    const key = relative.toLowerCase();
    return key === ledgerDirectory || key.startsWith(ledgerDirectory + "/");
  }
  function read(relative: string) {
    const row = files.read(relative);
    if (!row) throw invalid("缺少账本文件：" + relative);
    expected.set(relative, digest(row.bytes));
    return row.bytes;
  }
  if (ledgerOperations(files).list().some(({ state }) => state === "prepared" || state === "needs_attention")) throw invalid("账本需要先完成事务恢复");
  if (files.exists(indexPath)) {
    const index = indexSchema.parse(JSON.parse(read(indexPath).toString("utf8")));
    if (new Set(index.ids).size !== index.ids.length || (index.activeBookId && !index.ids.includes(index.activeBookId))) throw invalid("账本索引不一致");
    for (const id of index.ids) {
      const relative = bookPath(id);
      const state = stateSchema.parse(JSON.parse(read(relative).toString("utf8")));
      if (state.book.id !== id) throw invalid("账本与索引身份不符");
      validateBookRelations(state);
      if (includeAttachments) {
        for (const attachment of state.attachments) requireAttachment(read(attachmentPath(id, attachment.id)), attachment);
      } else {
        const bytes = json({ ...state, attachments: [], records: state.records.map((row) => ({ ...row, attachmentIds: [] })) });
        computedFiles.set(relative, bytes);
        expected.set(relative, digest(bytes));
      }
    }
  }
  return {
    computedFiles,
    includeFile(relative: string) {
      return !ledgerEntry(relative) || expected.has(relative);
    },
    verifyFiles(written: ReadonlyMap<string, string>) {
      for (const [relative, value] of expected) if (written.get(relative) !== value) throw invalid("备份期间账本已变化");
      for (const relative of written.keys()) {
        if (ledgerEntry(relative) && !expected.has(relative) &&
          !relative.startsWith(ledgerDirectory + "/operations/")) throw invalid("存在账本索引以外的文件");
      }
    },
  };
}

export function validateLedgerPackage(files: VaultFiles, restored: ReadonlyMap<string, string>) {
  ledgerPackageSelection(files).verifyFiles(restored);
}
