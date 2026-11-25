import { errors, LedgerAccount, LedgerBalanceBase, LedgerBook, LedgerRecord } from "@huhu/contracts";
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

const publicTool = { plugin: "ledger", risk: "normal", exposable: true, defaultExposed: false } as const;
const read = { ...publicTool, scope: "read" } as const;
const write = { ...publicTool, scope: "write", ...durableExternal } as const;
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
};

export const ledgerCapabilityDescriptors = Object.values(descriptors);

export const apply: PluginEntry["apply"] = (ctx, api) => {
  const store = new LedgerStore(api.vault.files, api.events);
  const imports = new LedgerImports(store);
  ctx.effect(() => () => { imports.dispose(); return store.idle(); });
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
};
