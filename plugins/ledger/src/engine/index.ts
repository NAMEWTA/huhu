import { errors, LedgerAccount, LedgerBalanceBase, LedgerBook, LedgerOffsetGroup, LedgerRecord, PERIODIC_PLANS_SERVICE, periodicPlanSourceService, type PeriodicPlanControl } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor as descriptor, durableExternal, type CapabilityContext, type PluginEntry } from "@huhu/kernel";
import type { OpStep } from "@huhu/vault";
import { z } from "zod";
import { BookList, BookName, BookRef, BookVersion, CreateBook, RemovalPreview } from "../shared/books.js";
import {
  AccountsView, AccountState, Attachment, AttachmentRead, AttachmentRef, BasePreview, BatchPreview, ConfirmBase, ConfirmBatch,
  CreateAccount, CreateRecord, DictionaryInput, DictionaryItem, InputBase, InputBatch,
  RecordRef, RecordVersion, RecordsPage, RecordsQuery, RecordView, UpdateAccount, UpdateRecord, UploadAttachment,
} from "../shared/entries.js";
import { account, accountsView, addBase, createAccount, previewBalance, requireActiveBook, saveDictionary, updateAccount } from "./accounts.js";
import { readAttachment, uploadAttachment } from "./attachments.js";
import { applyBatch, duplicateRecord, findRecord, previewBatch, recordsPage, saveRecord, viewRecord } from "./records.js";
import { LedgerStore, type BookState } from "./store.js";
import { ConfirmImport, CsvResult, ExportCsv, ImportFile, ImportPreview, ImportReference, ImportResult, MappingList, ResolveImport, SaveMapping } from "../shared/imports.js";
import { LedgerImports } from "./imports.js";
import { exportCsv } from "./csv-export.js";
import { CandidateGroups, ConfirmMerge, ConfirmOffset, DuplicateSearch, MergeInput, MergePreview, MergeResult,
  OffsetGroupView, OffsetInput, OffsetPreview, OffsetSearch, UndoOffset } from "../shared/reconciliation.js";
import { duplicateCandidates, offsetCandidates } from "./reconciliation-matches.js";
import { addOffset, groupView, merge, previewMerge, previewOffset, undoOffset } from "./reconciliation.js";
import { HolidayData, HolidayQuery, ReportQuery, ReportView, ReportsPreferences, SaveHolidayData, SaveReportsPreferences } from "../shared/reports.js";
import { report } from "./reports.js";
import { OpenRecurring, RecurringKey, RecurringList, RecurringPeriod, RecurringPreview, RecurringRow, RetryRecurring } from "../shared/recurring.js";
import { LedgerRecurring } from "./recurring.js";
import { Budget, BudgetDetail, BudgetDetailQuery, BudgetOverview, BudgetQuery, CopyBudgetResult, CopyBudgets, RemoveBudget, SaveBudgets } from "../shared/budgets.js";
import { budgetDetail, budgetOverview, copyBudgets, removeBudget, saveBudgets } from "./budgets.js";
import { ConfirmLoan, Loan, LoanHistory, LoanInstallment, LoanList, LoanPayment, LoanTerms, PreviewLoan, RemoveLoan, SaveLoan } from "../shared/loans.js";
import { loanSchedule } from "../domain/loans.js";
import { confirmLoan, loanList, previewLoan, removeLoan, saveLoan } from "./loans.js";
import { BackupPreview, BackupRef, ClearLegacyOffset, ConfirmBackup, ExportBackup, ExportedBackup, InspectBackup } from "../shared/backups.js";
import { LedgerBackups } from "./backup/index.js";
export { ledgerPackageSelection, validateLedgerPackage } from "./backup/snapshot.js";
export { withLedgerSnapshot } from "./store.js";

const publicTool = { plugin: "ledger", risk: "normal", exposable: true, defaultExposed: false } as const;
const read = { ...publicTool, scope: "read" } as const;
const write = { ...publicTool, scope: "write", ...durableExternal } as const;
const backupRead = { ...read, risk: "high", exposable: false } as const;
const descriptors = {
  list: descriptor({ ...read, name: "ledger.books.list", title: "列出账本", description: "列出当前 Vault 的账本及当前选择", input: z.strictObject({}), output: BookList }),
  create: descriptor({ ...write, name: "ledger.books.create", title: "创建账本", description: "创建账本及其首个资金账户", input: CreateBook, output: LedgerBook }),
  open: descriptor({ ...write, name: "ledger.books.open", title: "切换账本", description: "记住当前 Vault 选中的账本", input: BookRef, output: LedgerBook }),
  update: descriptor({ ...write, name: "ledger.books.update", title: "重命名账本", description: "按现有版本重命名账本", input: BookVersion.extend({ name: BookName }), output: LedgerBook }),
  archive: descriptor({ ...write, name: "ledger.books.archive", title: "归档账本", description: "归档账本并保留历史数据", input: BookVersion, output: LedgerBook }),
  restore: descriptor({ ...write, name: "ledger.books.restore", title: "恢复账本", description: "恢复已归档账本", input: BookVersion, output: LedgerBook }),
  previewRemoval: descriptor({ ...read, name: "ledger.books.previewRemoval", title: "预览删除账本", description: "查看删除账本的影响和当前版本", input: BookRef, output: RemovalPreview }),
  remove: descriptor({
    ...write, risk: "high", name: "ledger.books.remove", title: "删除账本", description: "按预览的版本和名称确认删除",
    input: BookVersion.extend({ confirmedName: z.string() }), output: z.strictObject({ ok: z.literal(true) }),
  }),
  accounts: descriptor({ ...read, name: "ledger.accounts.list", title: "列出账户和余额", description: "查询账户、余额基准和字典", input: BookRef, output: AccountsView }),
  report: descriptor({ ...read, name: "ledger.reports.query", title: "查询账本报表", description: "按业务日期、币种和平账口径查询收支与余额。", input: ReportQuery, output: ReportView }),
  reportPreferences: descriptor({ ...read, name: "ledger.reports.preferences", title: "读取总览卡片", description: "读取卡片顺序和可见性。", input: BookRef, output: ReportsPreferences }),
  saveReportPreferences: descriptor({ ...write, name: "ledger.reports.savePreferences", title: "保存总览卡片", description: "按账本版本保存卡片顺序和可见性。", input: SaveReportsPreferences, output: ReportsPreferences }),
  holidays: descriptor({ ...read, name: "ledger.calendar.holidays", title: "读取节假日", description: "读取本地已配置的节假日年份。", input: HolidayQuery, output: HolidayData.nullable() }),
  saveHolidays: descriptor({ ...write, name: "ledger.calendar.importHolidays", title: "导入离线节假日", description: "在当前账本保存指定年份的离线节假日和补班日期。", input: SaveHolidayData, output: HolidayData }),
  budgets: descriptor({ ...read, name: "ledger.budgets.list", title: "查看预算进度", description: "按年或月查看预算及各方向、币种的汇总。", input: BudgetQuery, output: BudgetOverview }),
  budgetDetail: descriptor({ ...read, name: "ledger.budgets.detail", title: "查看预算流水", description: "查询和预算进度同一范围的流水明细。", input: BudgetDetailQuery, output: BudgetDetail }),
  saveBudgets: descriptor({ ...write, name: "ledger.budgets.saveBatch", title: "批量保存预算", description: "创建或修改当前账本的一批预算。", input: SaveBudgets, output: z.array(Budget) }),
  removeBudget: descriptor({ ...write, name: "ledger.budgets.remove", title: "删除预算", description: "删除指定预算规则。", input: RemoveBudget, output: Budget }),
  copyBudgets: descriptor({ ...write, name: "ledger.budgets.copy", title: "复制月度预算", description: "复制固定预算到目标月份，保留已有同名项。", input: CopyBudgets, output: CopyBudgetResult }),
  recurring: descriptor({ ...read, name: "ledger.recurring.list", title: "查询固定收支", description: "读取账本规则、统一计划及原期次回执。", input: BookRef, output: RecurringList }),
  createRecurring: descriptor({ ...publicTool, scope: "write", idempotency: "handler", name: "ledger.recurring.create", title: "创建固定收支", description: "按稳定规则身份建立暂停的统一计划。", input: OpenRecurring, output: RecurringRow }),
  ensureRecurring: descriptor({ ...publicTool, scope: "write", idempotency: "handler", name: "ledger.recurring.ensurePlan", title: "补全固定收支计划", description: "核对原规则并补全缺失的暂停计划。", input: RecurringKey, output: RecurringRow }),
  previewRecurring: descriptor({ ...read, name: "ledger.recurring.preview", title: "预览固定收支", description: "读取原计划启用区间内的未处理期次。", input: RecurringKey, output: RecurringPreview }),
  retryRecurring: descriptor({ ...publicTool, scope: "write", idempotency: "handler", name: "ledger.recurring.retry", title: "重试固定收支期次", description: "按原计划和期次时间重试已证失败。", input: RetryRecurring, output: RecurringPeriod }),
  loans: descriptor({ ...read, name: "ledger.loans.list", title: "查看贷款", description: "列出当前账本的贷款和已生成期数。", input: BookRef, output: LoanList }),
  quoteLoan: descriptor({ ...read, name: "ledger.loans.quote", title: "试算还款计划", description: "按贷款条件逐期计算本金、利息和到期业务日。", input: LoanTerms, output: z.array(LoanInstallment) }),
  createLoan: descriptor({ ...write, name: "ledger.loans.create", title: "保存贷款", description: "保存试算条件，供后续预览。", input: SaveLoan, output: Loan }),
  previewLoan: descriptor({ ...read, name: "ledger.loans.previewHistory", title: "预览贷款历史补记", description: "读取还款计划、到期状态、入账账户及已生成流水。", input: PreviewLoan, output: LoanHistory }),
  confirmLoan: descriptor({ ...write, idempotency: "handler", name: "ledger.loans.confirmHistory", title: "确认所选贷款期次", description: "按原业务日记录明确选中的到期期次。", input: ConfirmLoan, output: z.array(LoanPayment) }),
  removeLoan: descriptor({ ...write, name: "ledger.loans.remove", title: "删除贷款规则", description: "移除贷款规则，保留已生成流水及期次事实。", input: RemoveLoan, output: Loan }),
  exportBackup: descriptor({ ...backupRead, name: "ledger.backups.export", title: "导出账本包", description: "按所选模块导出一致快照。", input: ExportBackup, output: ExportedBackup }),
  inspectBackup: descriptor({ ...backupRead, name: "ledger.backups.preview", title: "预览账本恢复", description: "校验本地备份并查看可迁入模块及待决条目。", input: InspectBackup, output: BackupPreview }),
  cancelBackup: descriptor({ ...backupRead, name: "ledger.backups.cancel", title: "取消账本恢复预览", description: "放弃当前会话中尚未提交的恢复。", input: BackupRef, output: z.strictObject({ cancelled: z.literal(true) }) }),
  backupStatus: descriptor({ ...backupRead, name: "ledger.backups.status", title: "读取账本恢复结果", description: "按原预览核对已提交结果。", input: BackupRef, output: LedgerBook.nullable() }),
  confirmBackup: descriptor({ ...backupRead, scope: "write", idempotency: "handler", name: "ledger.backups.confirm", title: "恢复到新账本", description: "按同一预览及用户选择一致提交。", input: ConfirmBackup, output: LedgerBook }),
  addAccount: descriptor({ ...write, name: "ledger.accounts.create", title: "新增资金账户", description: "创建账户和期初余额", input: CreateAccount, output: LedgerAccount }),
  updateAccount: descriptor({ ...write, name: "ledger.accounts.update", title: "编辑资金账户", description: "更新账户名称、类型和银行", input: UpdateAccount, output: LedgerAccount }),
  accountState: descriptor({ ...write, name: "ledger.accounts.setStatus", title: "更改账户状态", description: "归档或恢复账户并保留历史", input: AccountState, output: LedgerAccount }),
  previewBase: descriptor({ ...read, name: "ledger.accounts.previewBalance", title: "预览余额校准", description: "核对业务日期、当前余额及同日基准", input: InputBase, output: BasePreview }),
  confirmBase: descriptor({ ...write, name: "ledger.accounts.confirmBalance", title: "确认余额校准", description: "确认独立余额基准，保留此前历史", input: ConfirmBase, output: LedgerBalanceBase }),
  dictionary: descriptor({ ...write, name: "ledger.dictionaries.save", title: "维护账本字典", description: "创建、重命名或归档类型、银行、分类或标签", input: DictionaryInput, output: DictionaryItem }),
  records: descriptor({ ...read, name: "ledger.records.list", title: "查询流水", description: "按筛选返回分页明细与全结果币种汇总", input: RecordsQuery, output: RecordsPage }),
  record: descriptor({ ...read, name: "ledger.records.get", title: "查看流水", description: "查看流水与凭证状态", input: RecordRef, output: RecordView }),
  createRecord: descriptor({ ...write, name: "ledger.records.create", title: "记一笔", description: "记录收入、支出或一次两端同时提交的转账", input: CreateRecord, output: LedgerRecord }),
  updateRecord: descriptor({ ...write, name: "ledger.records.update", title: "编辑流水", description: "按版本修改已有流水", input: UpdateRecord, output: LedgerRecord }),
  cloneRecord: descriptor({ ...write, name: "ledger.records.clone", title: "复制流水", description: "复制一笔流水并复用其受管凭证", input: RecordVersion, output: LedgerRecord }),
  previewBatch: descriptor({ ...read, name: "ledger.records.previewBatch", title: "预览批量编辑", description: "核对整批流水的版本与影响范围", input: InputBatch, output: BatchPreview }),
  confirmBatch: descriptor({
    ...write, risk: "high", name: "ledger.records.confirmBatch", title: "提交批量编辑", description: "按预览一次提交批量编辑或删除",
    input: ConfirmBatch, output: z.strictObject({ count: z.int().positive() }),
  }),
  upload: descriptor({ ...write, risk: "high", name: "ledger.attachments.upload", title: "上传流水凭证", description: "将受管凭证和流水引用一并保存", input: UploadAttachment, output: Attachment }),
  attachment: descriptor({ ...read, risk: "high", name: "ledger.attachments.read", title: "读取流水凭证", description: "按账本和凭证标识读取，或报告凭证缺失", input: AttachmentRef, output: AttachmentRead }),
  importPreview: descriptor({ ...read, risk: "high", name: "ledger.imports.preview", title: "预览账单", description: "在当前账本预览来源、转换日期与待决行", input: ImportFile, output: ImportPreview }),
  importResolve: descriptor({ ...read, name: "ledger.imports.resolve", title: "解决账单待决行", description: "修正账户、分类、交易类型或选择跳过", input: ResolveImport, output: ImportPreview }),
  importCancel: descriptor({ ...read, name: "ledger.imports.cancel", title: "取消账单预览", description: "清理当前主体的账单预览", input: ImportReference, output: z.strictObject({ cancelled: z.literal(true) }) }),
  importConfirm: descriptor({ ...write, risk: "high", name: "ledger.imports.confirm", title: "确认导入账单", description: "核对版本并一次写入所选账单行与导入回执", input: ConfirmImport, output: ImportResult }),
  importStatus: descriptor({ ...read, name: "ledger.imports.status", title: "查询账单回执", description: "查询当前主体的已提交导入结果", input: ImportReference, output: ImportResult.nullable() }),
  mappings: descriptor({ ...read, name: "ledger.mappings.list", title: "列出账单映射", description: "列出本账本的来源账户和分类规则", input: BookRef, output: MappingList }),
  saveMappings: descriptor({ ...write, name: "ledger.mappings.save", title: "保存账单映射", description: "保存来源和条件的归一化映射", input: SaveMapping, output: MappingList }),
  exportCsv: descriptor({ ...read, risk: "high", name: "ledger.exports.csv", title: "导出筛选后的流水", description: "按流水明细同一筛选返回完整 CSV", input: ExportCsv, output: CsvResult }),
  duplicates: descriptor({ ...read, name: "ledger.reconciliation.duplicates", title: "查找重复流水候选", description: "按当前范围、时间精度和匹配条件分组", input: DuplicateSearch, output: CandidateGroups }),
  previewMerge: descriptor({ ...read, name: "ledger.reconciliation.previewMerge", title: "预览合并流水", description: "核对留存行、分类、账户和关联", input: MergeInput, output: MergePreview }),
  confirmMerge: descriptor({ ...write, risk: "high", name: "ledger.reconciliation.confirmMerge", title: "确认合并流水", description: "按预览版本迁移关联并合并流水", input: ConfirmMerge, output: MergeResult }),
  offsetCandidates: descriptor({ ...read, name: "ledger.reconciliation.offsetCandidates", title: "查找平账候选", description: "查找同币种等额反向的流水组合", input: OffsetSearch, output: CandidateGroups }),
  previewOffset: descriptor({ ...read, name: "ledger.reconciliation.previewOffset", title: "预览平账组", description: "核对选定成员与平账金额", input: OffsetInput, output: OffsetPreview }),
  confirmOffset: descriptor({ ...write, risk: "high", name: "ledger.reconciliation.confirmOffset", title: "确认整组平账", description: "记录版本化平账组，保留原资金流水", input: ConfirmOffset, output: LedgerOffsetGroup }),
  offsetGroup: descriptor({ ...read, name: "ledger.reconciliation.offsetGroup", title: "查看平账组", description: "按组员查看整组和平账版本", input: RecordRef, output: OffsetGroupView }),
  undoOffset: descriptor({ ...write, risk: "high", name: "ledger.reconciliation.undoOffset", title: "撤销整组平账", description: "按组版本恢复成员的收支统计", input: UndoOffset, output: z.strictObject({ restored: z.int().positive() }) }),
  clearLegacyOffset: descriptor({ ...write, name: "ledger.reconciliation.clearLegacyOffset", title: "清除旧平账标记", description: "移除迁入的报表排除标记，保留原始流水。", input: ClearLegacyOffset, output: z.strictObject({ cleared: z.boolean() }) }),
};

export const ledgerCapabilityDescriptors = Object.values(descriptors);

export const apply: PluginEntry["apply"] = (ctx, api) => {
  const store = new LedgerStore(api.vault.files, api.events);
  const imports = new LedgerImports(store);
  const backups = new LedgerBackups(store);
  const lifetime = new AbortController();
  const recurring = new LedgerRecurring(store, () => api.service<PeriodicPlanControl>(PERIODIC_PLANS_SERVICE), lifetime.signal);
  api.provide(periodicPlanSourceService("ledger"), recurring.source());
  ctx.effect(() => () => { lifetime.abort(); imports.dispose(); backups.dispose(); return store.idle(); });
  const snapshot = async (bookId: string) => { await store.idle(); return store.snapshot(bookId); };
  const currentSnapshot = async ({ bookId, expectedRevision }: { bookId: string; expectedRevision: string }) => {
    const state = await snapshot(bookId);
    if (state.book.revision !== expectedRevision) throw errors.versionConflict(state.book.revision);
    return state;
  };
  const change = <T>(context: CapabilityContext, input: { bookId: string; expectedRevision: string }, update: (state: BookState, steps: OpStep[]) => T) =>
    store.change(context, input.bookId, input.expectedRevision, (state, steps) => {
      requireActiveBook(state);
      return update(state, steps);
    });
  api.defineCapability(bindCapability(descriptors.list, async () => { await store.idle(); return store.list(); }));
  api.defineCapability(bindCapability(descriptors.create, (context, input) => store.create(context, input)));
  api.defineCapability(bindCapability(descriptors.open, (context, { bookId }) => store.open(context, bookId)));
  api.defineCapability(bindCapability(descriptors.update, (context, { bookId, expectedRevision, name }) => store.rename(context, bookId, expectedRevision, name)));
  api.defineCapability(bindCapability(descriptors.archive, (context, { bookId, expectedRevision }) => store.setStatus(context, bookId, expectedRevision, "archived")));
  api.defineCapability(bindCapability(descriptors.restore, (context, { bookId, expectedRevision }) => store.setStatus(context, bookId, expectedRevision, "active")));
  api.defineCapability(bindCapability(descriptors.previewRemoval, async (_context, { bookId }) => { await store.idle(); return store.previewRemoval(bookId); }));
  api.defineCapability(bindCapability(descriptors.remove, (context, { bookId, expectedRevision, confirmedName }) => store.remove(context, bookId, expectedRevision, confirmedName)));
  api.defineCapability(bindCapability(descriptors.accounts, async (_context, { bookId }) => {
    const state = await snapshot(bookId);
    return accountsView(state, store.businessDate(state.book));
  }));
  api.defineCapability(bindCapability(descriptors.report, async (_context, input) => report(await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.reportPreferences, async (_context, { bookId }) => {
    const state = await snapshot(bookId);
    return { revision: state.book.revision, cards: state.reportCards };
  }));
  api.defineCapability(bindCapability(descriptors.saveReportPreferences, (context, input) => change(context, input, (state) => {
    state.reportCards = input.cards;
    return { revision: state.book.revision, cards: state.reportCards };
  })));
  api.defineCapability(bindCapability(descriptors.holidays, async (_context, { bookId, year }) => (await snapshot(bookId)).holidays[year] ?? null));
  api.defineCapability(bindCapability(descriptors.saveHolidays, (context, input) => change(context, input, (state) => {
    state.holidays[input.data.year] = input.data;
    return input.data;
  })));
  api.defineCapability(bindCapability(descriptors.budgets, async (_context, input) => budgetOverview(await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.budgetDetail, async (_context, input) => budgetDetail(store, await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.saveBudgets, (context, input) => change(context, input, (state) => saveBudgets(state, input))));
  api.defineCapability(bindCapability(descriptors.removeBudget, (context, input) => change(context, input, (state) => removeBudget(state, input.budgetId))));
  api.defineCapability(bindCapability(descriptors.copyBudgets, (context, input) => change(context, input, (state) => copyBudgets(state, input))));
  api.defineCapability(bindCapability(descriptors.recurring, async (_context, { bookId }) => { await store.idle(); return recurring.list(bookId); }));
  api.defineCapability(bindCapability(descriptors.createRecurring, (context, input) => recurring.create(context, input)));
  api.defineCapability(bindCapability(descriptors.ensureRecurring, (context, { bookId, ruleId }) => recurring.ensure(context, bookId, ruleId)));
  api.defineCapability(bindCapability(descriptors.previewRecurring, async (_context, { bookId, ruleId }) => { await store.idle(); return recurring.preview(bookId, ruleId); }));
  api.defineCapability(bindCapability(descriptors.retryRecurring, (context, input) => recurring.retry(context, input)));
  api.defineCapability(bindCapability(descriptors.loans, async (_context, { bookId }) => loanList(store, await snapshot(bookId))));
  api.defineCapability(bindCapability(descriptors.quoteLoan, (_context, input) => loanSchedule(input)));
  api.defineCapability(bindCapability(descriptors.createLoan, (context, input) => change(context, input, (state) => saveLoan(state, input))));
  api.defineCapability(bindCapability(descriptors.previewLoan, async (_context, input) => previewLoan(store, await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.confirmLoan, (context, input) => confirmLoan(store, context, input)));
  api.defineCapability(bindCapability(descriptors.removeLoan, (context, input) => change(context, input, (state) => removeLoan(state, input.loanId))));
  api.defineCapability(bindCapability(descriptors.exportBackup, (context, input) => backups.export(context, input)));
  api.defineCapability(bindCapability(descriptors.inspectBackup, (context, input) => backups.preview(context, input)));
  api.defineCapability(bindCapability(descriptors.cancelBackup, (context, { previewId }) => backups.cancel(context, previewId)));
  api.defineCapability(bindCapability(descriptors.backupStatus, (context, { previewId }) => backups.status(context, previewId)));
  api.defineCapability(bindCapability(descriptors.confirmBackup, (context, input) => backups.confirm(context, input)));
  api.defineCapability(bindCapability(descriptors.addAccount, (context, input) =>
    change(context, input, (state) => createAccount(state, input.account, input.openingMinor, input.effectiveBusinessDate))));
  api.defineCapability(bindCapability(descriptors.updateAccount, (context, input) =>
    change(context, input, (state) => updateAccount(state, input.accountId, input.account))));
  api.defineCapability(bindCapability(descriptors.accountState, (context, input) => change(context, input, (state) => {
    const row = account(state, input.accountId);
    row.status = input.status;
    return row;
  })));
  api.defineCapability(bindCapability(descriptors.previewBase, async (_context, input) => previewBalance(await currentSnapshot(input), input)));
  api.defineCapability(bindCapability(descriptors.confirmBase, (context, input) => change(context, input, (state) => {
    const preview = previewBalance(state, input);
    if (preview.replacedRevision !== input.replacedRevision) throw errors.versionConflict(preview.replacedRevision ?? state.book.revision);
    return addBase(state, input.accountId, input.effectiveBusinessDate, input.balanceMinor);
  })));
  api.defineCapability(bindCapability(descriptors.dictionary, (context, input) => change(context, input, (state) => saveDictionary(state, input))));
  api.defineCapability(bindCapability(descriptors.records, async (_context, input) => recordsPage(store, await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.record, async (_context, { bookId, recordId }) => viewRecord(store, await snapshot(bookId), recordId)));
  api.defineCapability(bindCapability(descriptors.createRecord, (context, input) => change(context, input, (state) => saveRecord(state, input.record, input.title))));
  api.defineCapability(bindCapability(descriptors.updateRecord, (context, input) => change(context, input, (state) =>
    saveRecord(state, input.record, input.title, findRecord(state, input.recordId, input.recordRevision)))));
  api.defineCapability(bindCapability(descriptors.cloneRecord, (context, input) => change(context, input, (state) =>
    duplicateRecord(state, findRecord(state, input.recordId, input.recordRevision)))));
  api.defineCapability(bindCapability(descriptors.previewBatch, async (_context, input) => previewBatch(await currentSnapshot(input), input)));
  api.defineCapability(bindCapability(descriptors.confirmBatch, (context, { previewId, ...input }) => change(context, input, (state) => {
    if (previewBatch(state, input).previewId !== previewId) throw errors.invalidInput("请重新预览批量变更");
    return applyBatch(state, input);
  })));
  api.defineCapability(bindCapability(descriptors.upload, (context, input) => change(context, input, (state, steps) => uploadAttachment(state, steps, input))));
  api.defineCapability(bindCapability(descriptors.attachment, async (_context, { bookId, attachmentId }) => readAttachment(store, await snapshot(bookId), attachmentId)));
  api.defineCapability(bindCapability(descriptors.importPreview, (context, input) => imports.preview(context, input)));
  api.defineCapability(bindCapability(descriptors.importResolve, (context, input) => imports.resolve(context, input)));
  api.defineCapability(bindCapability(descriptors.importCancel, (context, input) => imports.cancel(context, input)));
  api.defineCapability(bindCapability(descriptors.importConfirm, (context, input) => imports.confirm(context, input)));
  api.defineCapability(bindCapability(descriptors.importStatus, (context, input) => imports.status(context, input)));
  api.defineCapability(bindCapability(descriptors.mappings, async (_context, { bookId }) => {
    const state = await snapshot(bookId);
    return { revision: state.mappingRevision, rules: state.mappings };
  }));
  api.defineCapability(bindCapability(descriptors.saveMappings, (context, input) => imports.saveMappings(context, input)));
  api.defineCapability(bindCapability(descriptors.exportCsv, async (_context, { bookId, filters }) => exportCsv(await snapshot(bookId), filters)));
  api.defineCapability(bindCapability(descriptors.duplicates, async (_context, input) => duplicateCandidates(await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.previewMerge, async (_context, input) => previewMerge(await currentSnapshot(input), input)));
  api.defineCapability(bindCapability(descriptors.confirmMerge, (context, input) => change(context, input, (state) => merge(state, input))));
  api.defineCapability(bindCapability(descriptors.offsetCandidates, async (_context, input) => offsetCandidates(await snapshot(input.bookId), input)));
  api.defineCapability(bindCapability(descriptors.previewOffset, async (_context, input) => previewOffset(await currentSnapshot(input), input)));
  api.defineCapability(bindCapability(descriptors.confirmOffset, (context, input) => change(context, input, (state) => addOffset(state, input))));
  api.defineCapability(bindCapability(descriptors.offsetGroup, async (_context, { bookId, recordId }) => groupView(await snapshot(bookId), recordId)));
  api.defineCapability(bindCapability(descriptors.undoOffset, (context, input) => change(context, input, (state) => undoOffset(state, input))));
  api.defineCapability(bindCapability(descriptors.clearLegacyOffset, (context, input) => change(context, input, (state) => {
    findRecord(state, input.recordId);
    const cleared = state.legacyOffsetRecordIds.includes(input.recordId);
    state.legacyOffsetRecordIds = state.legacyOffsetRecordIds.filter((id) => id !== input.recordId);
    return { cleared };
  })));
};
