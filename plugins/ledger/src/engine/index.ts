import { LedgerBook } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor as descriptor, durableExternal, type PluginEntry } from "@huhu/kernel";
import { z } from "zod";
import { BookList, BookName, BookRef, BookVersion, CreateBook, RemovalPreview } from "../shared/books.js";
import { LedgerStore } from "./store.js";

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
};

export const ledgerCapabilityDescriptors = Object.values(descriptors);

export const apply: PluginEntry["apply"] = (ctx, api) => {
  const store = new LedgerStore(api.vault.files, api.events);
  ctx.effect(() => () => store.idle());
  api.defineCapability(bindCapability(descriptors.list, () => store.list()));
  api.defineCapability(bindCapability(descriptors.create, (context, input) => store.create(context, input)));
  api.defineCapability(bindCapability(descriptors.open, (context, { bookId }) => store.open(context, bookId)));
  api.defineCapability(bindCapability(descriptors.update, (context, { bookId, expectedRevision, name }) => store.rename(context, bookId, expectedRevision, name)));
  api.defineCapability(bindCapability(descriptors.archive, (context, { bookId, expectedRevision }) => store.setStatus(context, bookId, expectedRevision, "archived")));
  api.defineCapability(bindCapability(descriptors.restore, (context, { bookId, expectedRevision }) => store.setStatus(context, bookId, expectedRevision, "active")));
  api.defineCapability(bindCapability(descriptors.previewRemoval, (_context, { bookId }) => store.previewRemoval(bookId)));
  api.defineCapability(bindCapability(descriptors.remove, (context, { bookId, expectedRevision, confirmedName }) => store.remove(context, bookId, expectedRevision, confirmedName)));
};
