import { randomUUID } from "node:crypto";
import { errors, HuhuError, LedgerAccount, LedgerBalanceBase, LedgerBook, LedgerOffsetGroup, LedgerRecord, ledgerBusinessDate } from "@huhu/contracts";
import type { CapabilityContext, EventBus } from "@huhu/kernel";
import { OperationLog, type OpStep, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { BookId, type Book, type BookList, type CreateBook, type RemovalPreview } from "../shared/books.js";
import { AccountLabels, Attachment, DictionaryItem, EntryId } from "../shared/entries.js";

const directory = ".huhu/ledger";
const indexPath = directory + "/books.json";
export const bookDirectory = (id: string) => directory + "/books/" + BookId.parse(id);
const bookPath = (id: string) => bookDirectory(id) + "/state.json";
export const attachmentPath = (bookId: string, id: string) => bookDirectory(bookId) + "/attachments/" + EntryId.parse(id);
const indexSchema = z.strictObject({
  format: z.literal(1),
  ids: z.array(BookId),
  activeBookId: BookId.nullable(),
});
export const stateSchema = z.strictObject({
  book: LedgerBook,
  accounts: z.array(LedgerAccount),
  bases: z.array(LedgerBalanceBase),
  records: z.array(LedgerRecord),
  accountLabels: z.record(EntryId, AccountLabels).default({}),
  dictionary: z.array(DictionaryItem).default([]),
  recordTitles: z.record(EntryId, z.string().min(1).max(150)).default({}),
  attachments: z.array(Attachment).default([]),
  offsets: z.array(LedgerOffsetGroup).default([]),
});

type BookIndex = z.infer<typeof indexSchema>;
export type BookState = z.infer<typeof stateSchema>;
type Versioned<T> = { data: T; version: string };
type IndexSnapshot = { data: BookIndex; version: string | null };
type Context = Pick<CapabilityContext, "signal" | "assertCapabilityCurrent">;
const bytes = (data: unknown) => Buffer.from(JSON.stringify(data) + "\n");
const write = (path: string, data: unknown, expectedVersion: string | null): OpStep => ({ action: "write", path, bytes: bytes(data), expectedVersion });

export class LedgerStore {
  private readonly operations: OperationLog;
  private tail = Promise.resolve();
  private pending?: { index: IndexSnapshot; bookId: string; state: Versioned<BookState> | null };
  private recoveryRequired = false;

  constructor(readonly files: VaultFiles, private readonly events: Pick<EventBus, "publish">, private readonly now = () => new Date()) {
    this.operations = new OperationLog(files, files.abs(directory + "/operations"));
    try {
      if (!files.readOnly) this.operations.recover();
      this.inspectRecovery();
    } catch { this.recoveryRequired = true; }
  }

  idle(): Promise<void> { return this.tail; }

  private inspectRecovery() {
    this.recoveryRequired = this.operations.list().some(({ state }) => state === "prepared" || state === "needs_attention");
  }

  private requireReady() {
    if (this.recoveryRequired) throw new HuhuError("WRITE_PARTIAL", "账本需要在可写 Vault 中核实恢复记录");
  }

  private requireWrite(context: Context) {
    this.files.assertWritable();
    this.requireReady();
    context.signal.throwIfAborted();
    context.assertCapabilityCurrent?.();
  }

  private enqueue<T>(context: Context, task: () => Promise<T>): Promise<T> {
    const action = this.tail.then(() => {
      this.requireWrite(context);
      return task();
    });
    this.tail = action.then(() => undefined, () => undefined);
    return action;
  }

  private index(): IndexSnapshot {
    this.requireReady();
    if (this.pending) return this.pending.index;
    const current = this.files.read(indexPath);
    return current ? { data: indexSchema.parse(JSON.parse(current.bytes.toString("utf8"))), version: current.version } :
      { data: { format: 1, ids: [], activeBookId: null }, version: null };
  }

  private state(bookId: string): Versioned<BookState> {
    if (!this.index().data.ids.includes(bookId)) throw errors.notFound("找不到账本");
    if (this.pending?.bookId === bookId && this.pending.state) return this.pending.state;
    const saved = this.files.read(bookPath(bookId));
    if (!saved) throw new HuhuError("WRITE_PARTIAL", "缺少账本事实文件");
    const state = stateSchema.parse(JSON.parse(saved.bytes.toString("utf8")));
    if (state.book.id !== bookId) throw new HuhuError("WRITE_PARTIAL", "账本文件与索引不一致");
    return { data: state, version: saved.version };
  }

  snapshot(bookId: string): BookState { return this.state(bookId).data; }

  businessDate(book: Book): string { return ledgerBusinessDate(this.now().toISOString(), book.timeZone); }

  list(): BookList {
    const { data } = this.index();
    return { books: data.ids.map((id) => this.snapshot(id).book), activeBookId: data.activeBookId, readOnly: this.files.readOnly };
  }

  private emit(id: string, op: "created" | "updated" | "deleted") {
    this.events.publish("entity.changed", { kind: "ledger", id, op });
  }

  private async transaction(context: Context, kind: string, steps: OpStep[], prior: NonNullable<LedgerStore["pending"]>) {
    this.pending = prior;
    const verify = () => this.requireWrite(context);
    try {
      await this.operations.run(randomUUID(), kind, steps, { beforeCommit: verify, afterStep: verify });
    } catch (error) {
      try { this.inspectRecovery(); }
      catch { this.recoveryRequired = true; }
      throw error;
    } finally {
      delete this.pending;
    }
  }

  private ensureName(name: string, except?: string) {
    const key = (value: string) => value.normalize("NFKC").toLowerCase();
    if (this.list().books.some((book) => book.id !== except && key(book.name) === key(name))) throw errors.nameConflict(name);
  }

  create(context: Context, input: z.infer<typeof CreateBook>): Promise<Book> {
    return this.enqueue(context, async () => {
      const index = this.index();
      this.ensureName(input.name);
      const { defaultCurrency, timeZone, name, firstAccount } = input;
      const book: Book = { id: randomUUID(), name, defaultCurrency, timeZone, status: "active", schemaVersion: 1, revision: randomUUID() };
      const account = LedgerAccount.parse({ id: randomUUID(), bookId: book.id, name: firstAccount.name, type: firstAccount.type, currency: defaultCurrency, status: "active" });
      const base = LedgerBalanceBase.parse({
        bookId: book.id, accountId: account.id, effectiveBusinessDate: ledgerBusinessDate(this.now().toISOString(), timeZone), balanceMinor: "0", revision: randomUUID(),
      });
      const state = stateSchema.parse({ book, accounts: [account], bases: [base], records: [] });
      const next: BookIndex = { format: 1, ids: [...index.data.ids, book.id], activeBookId: book.id };
      await this.transaction(context, "ledger-book-create", [
        write(bookPath(book.id), state, null),
        write(indexPath, next, index.version),
      ], { index, bookId: book.id, state: null });
      this.emit(book.id, "created");
      return book;
    });
  }

  open(context: Context, bookId: string): Promise<Book> {
    return this.enqueue(context, async () => {
      const index = this.index();
      const book = this.snapshot(bookId).book;
      if (bookId !== index.data.activeBookId) {
        const next = { ...index.data, activeBookId: bookId };
        await this.files.write(indexPath, bytes(next), { expectedVersion: index.version, beforeCommit: () => this.requireWrite(context) });
        this.emit(bookId, "updated");
      }
      return book;
    });
  }

  change<T>(context: Context, bookId: string, expectedRevision: string, update: (state: BookState, steps: OpStep[]) => T): Promise<T> {
    return this.enqueue(context, async () => {
      const prior = this.state(bookId);
      this.assertRevision(prior.data.book, expectedRevision);
      const draft = structuredClone(prior.data);
      draft.book.revision = randomUUID();
      const steps: OpStep[] = [];
      const result = update(draft, steps);
      const state = stateSchema.parse(draft);
      if (steps.length > 0) {
        await this.transaction(context, "ledger-book-change", [...steps, write(bookPath(bookId), state, prior.version)], { index: this.index(), bookId, state: prior });
      } else {
        await this.files.write(bookPath(bookId), bytes(state), { expectedVersion: prior.version, beforeCommit: () => this.requireWrite(context) });
      }
      this.emit(bookId, "updated");
      return result;
    });
  }

  rename(context: Context, bookId: string, revision: string, name: string) {
    return this.change(context, bookId, revision, (state) => {
      this.ensureName(name, bookId);
      state.book.name = name;
      return state.book;
    });
  }

  setStatus(context: Context, bookId: string, revision: string, status: Book["status"]) {
    return this.change(context, bookId, revision, ({ book }) => {
      book.status = status;
      return book;
    });
  }

  private assertRevision(book: Book, expectedRevision: string) {
    if (book.revision !== expectedRevision) throw errors.versionConflict(book.revision);
  }

  previewRemoval(bookId: string): RemovalPreview {
    const { book, accounts, records, attachments } = this.snapshot(bookId);
    return { book, accounts: accounts.length, records: records.length, attachments: attachments.length };
  }

  remove(context: Context, bookId: string, revision: string, confirmedName: string) {
    return this.enqueue(context, async () => {
      const index = this.index();
      const state = this.state(bookId);
      const { book } = state.data;
      this.assertRevision(book, revision);
      if (book.name !== confirmedName) throw errors.invalidInput("请输入要删除的账本完整名称");
      const ids = index.data.ids.filter((id) => id !== bookId);
      const activeBookId = index.data.activeBookId === bookId ? (ids[0] ?? null) : index.data.activeBookId;
      const attachments = state.data.attachments.flatMap(({ id }): OpStep[] => {
        const target = attachmentPath(bookId, id);
        const expectedVersion = this.files.currentVersion(target);
        return expectedVersion === null ? [] : [{ action: "delete", path: target, expectedVersion }];
      });
      await this.transaction(context, "ledger-book-remove", [
        { action: "delete", path: bookPath(bookId), expectedVersion: state.version },
        write(indexPath, { ...index.data, ids, activeBookId }, index.version),
        ...attachments,
      ], { index, bookId, state });
      this.emit(bookId, "deleted");
      return { ok: true as const };
    });
  }
}
