import { Button, Dialog, Select } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient, type ModuleContribution, type ModuleProps } from "@huhu/workbench";
import { BookOpen, Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Book, BookList, RemovalPreview } from "../shared/books.js";

export const currencies = ["CNY", "TWD", "USD", "JPY"];
const zones = ["Asia/Taipei", "Asia/Shanghai", "America/New_York", "UTC"];

export function LedgerField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="hu-field"><span className="hu-field-label">{label}</span>{children}</label>;
}

export function useLedgerAction() {
  const engine = useEngine();
  const queries = useQueryClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  async function run<T>(capability: string, input: unknown, write = true): Promise<T | undefined> {
    setError(undefined);
    setWorking(true);
    try {
      const reply = await engine.call<T>(capability, input, { write });
      if (write) await queries.invalidateQueries({ predicate: ({ queryKey: [vault, name] }) =>
        vault === engine.vaultId && typeof name === "string" && name.startsWith("ledger.") });
      return reply;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "账本操作失败");
      return undefined;
    } finally {
      setWorking(false);
    }
  }
  return { run, working, error, clearError: () => setError(undefined) };
}

const version = (book: Book) => ({ bookId: book.id, expectedRevision: book.revision });
type Editor = { mode: "create" } | { mode: "rename"; book: Book } | { mode: "remove"; preview: RemovalPreview };

function LedgerModule(props: ModuleProps) {
  const engine = useEngine();
  return <LedgerPage key={engine.vaultId} {...props} />;
}

function LedgerPage({ section, onSection }: ModuleProps) {
  const list = useCapability<BookList>("ledger.books.list", {});
  const { run, working, error, clearError } = useLedgerAction();
  const [ephemeralBook, setEphemeralBook] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [confirmedName, setConfirmedName] = useState("");
  const [notice, setNotice] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  const formId = useId();
  if (list.isPending) return <p role="status">正在读取账本…</p>;
  if (list.isError) return <p role="alert">{list.error.message}</p>;
  const { books, activeBookId, readOnly } = list.data;
  const current = books.find(({ id }) => id === (readOnly && ephemeralBook ? ephemeralBook : activeBookId));
  const locked = readOnly || working;

  function edit(next: Editor) {
    clearError();
    setConfirmedName("");
    setEditor(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!editor) return;
    if (editor.mode === "create") {
      const book = await run<Book>("ledger.books.create", {
        name: form.get("name"), defaultCurrency: form.get("currency"), timeZone: form.get("zone"),
        firstAccount: { name: form.get("account") },
      });
      if (!book) return;
      onSection("overview");
      setNotice("账本已创建。");
    } else if (editor.mode === "rename") {
      if (!await run("ledger.books.update", { ...version(editor.book), name: form.get("name") })) return;
      setNotice("账本已重命名。");
    } else {
      if (!await run("ledger.books.remove", { ...version(editor.preview.book), confirmedName })) return;
      setNotice("账本已删除。");
    }
    setEditor(undefined);
  }

  return <div className="hu-module-layout" data-testid="ledger-module">
    <div className="hu-stack">
      <div className="hu-toolbar">
        <LedgerField label="当前账本">
          <Select value={current?.id ?? ""} disabled={working || books.length === 0} onChange={(event) => {
            const bookId = event.currentTarget.value;
            if (readOnly) setEphemeralBook(bookId);
            else if (bookId) void run("ledger.books.open", { bookId });
          }}>
            <option value="" disabled>选择账本</option>
            {books.map((book) => <option key={book.id} value={book.id}>{book.name}{book.status === "archived" ? "（已归档）" : ""}</option>)}
          </Select>
        </LedgerField>
        <Button icon={Plus} disabled={locked} onClick={() => edit({ mode: "create" })}>新建账本</Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {readOnly && <p role="status">当前 Vault 为只读。</p>}
      {!editor && error && <p role="alert">{error}</p>}
      {books.length === 0 ? <section className="hu-stack">
        <h2>还没有账本</h2>
        <p>先建立账本，选择业务时区和第一项资金账户。</p>
        <div><Button icon={Plus} variant="primary" disabled={locked} onClick={() => edit({ mode: "create" })}>创建第一个账本</Button></div>
      </section> : section === "books" ? <section className="hu-stack" aria-label="账本设置">
        <h2>账本设置</h2>
        {books.map((book) => <article key={book.id} className="hu-stack">
          <h3>{book.name}</h3>
          <p>{book.defaultCurrency} · {book.timeZone} · {book.status === "archived" ? "已归档" : "使用中"}</p>
          <div className="hu-toolbar">
            <Button disabled={locked} onClick={() => edit({ mode: "rename", book })}>重命名</Button>
            <Button disabled={locked} onClick={() => void run(book.status === "archived" ? "ledger.books.restore" : "ledger.books.archive", version(book))}>
              {book.status === "archived" ? "恢复账本" : "归档账本"}
            </Button>
            <Button disabled={working} onClick={async () => {
              const preview = await run<RemovalPreview>("ledger.books.previewRemoval", { bookId: book.id }, false);
              if (preview) edit({ mode: "remove", preview });
            }}>预览删除</Button>
          </div>
        </article>)}
      </section> : current && <section className="hu-stack" aria-label="账本总览">
        <h2>{current.name}</h2>
        <p>默认币种 {current.defaultCurrency} · 业务时区 {current.timeZone}{current.status === "archived" ? " · 已归档" : ""}</p>
      </section>}
    </div>
    {editor && <Dialog open title={editor.mode === "create" ? "创建账本" : editor.mode === "rename" ? "重命名账本" : "删除账本"}
      onClose={() => { if (!working) setEditor(undefined); }} error={error}
      {...(editor.mode === "remove" && { initialFocusRef: cancel })}
      actions={<>
        <Button ref={cancel} disabled={working} onClick={() => setEditor(undefined)}>取消</Button>
        <Button type="submit" form={formId} variant={editor.mode === "remove" ? "danger" : "primary"}
          disabled={locked || (editor.mode === "remove" && confirmedName !== editor.preview.book.name)}>
          {editor.mode === "create" ? "创建账本" : editor.mode === "rename" ? "保存名称" : "确认删除"}
        </Button>
      </>}>
      <form key={editor.mode} id={formId} className="hu-stack" onSubmit={submit}>
        {editor.mode === "remove" ? <>
          <p>「{editor.preview.book.name}」有 {editor.preview.accounts} 个账户、{editor.preview.records} 笔流水和 {editor.preview.attachments} 份凭证。</p>
          <LedgerField label="输入完整账本名称"><input required value={confirmedName} onChange={(event) => setConfirmedName(event.currentTarget.value)} /></LedgerField>
        </> : <>
          <LedgerField label="账本名称"><input name="name" maxLength={100} required defaultValue={editor.mode === "rename" ? editor.book.name : ""} /></LedgerField>
          {editor.mode === "create" && <>
            <LedgerField label="默认币种"><Select name="currency" defaultValue="CNY">{currencies.map((value) => <option key={value}>{value}</option>)}</Select></LedgerField>
            <LedgerField label="业务时区"><Select name="zone" defaultValue="Asia/Taipei">{zones.map((value) => <option key={value}>{value}</option>)}</Select></LedgerField>
            <LedgerField label="首个资金账户"><input name="account" maxLength={100} required placeholder="例如银行账户" /></LedgerField>
            <p className="small muted">账本始终以保存的业务时区归集日期。</p>
          </>}
        </>}
      </form>
    </Dialog>}
  </div>;
}

const module: ModuleContribution = {
  id: "ledger", plugin: "ledger", title: "账本", group: "primary", order: 55,
  icon: <BookOpen size={18} aria-hidden />, component: LedgerModule, nav: "shell",
  sections: [{ id: "overview", label: "总览" }, { id: "books", label: "账本设置" }],
};

export const contributions = { modules: [module] };
