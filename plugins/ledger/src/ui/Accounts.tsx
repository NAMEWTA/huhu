import { LedgerAccount, ledgerDecimalToMinor, ledgerMinorToDecimal } from "@huhu/contracts";
import { Button, DataTable, Dialog, Select } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import type { Book } from "../shared/books.js";
import type { AccountsView, BasePreview, DictionaryItem } from "../shared/entries.js";
import { bookVersion, currencies, displayMoney, fieldValue, LedgerField, useLedgerAction } from "./primitives.js";

type AccountRow = AccountsView["accounts"][number];
const accountTypes: Record<AccountRow["type"], string> = {
  bank: "银行账户", cash: "现金", wallet: "电子钱包", credit: "信用卡", investment: "投资账户", other: "其他",
};
const dictionaryKinds: Record<DictionaryItem["kind"], string> = {
  "account-type": "账户类型", bank: "银行", category: "流水分类", tag: "流水标签",
};
type Editor = { kind: "account"; book: Book; row?: AccountRow }
  | { kind: "balance"; book: Book; row: AccountRow }
  | { kind: "dictionary"; book: Book; row?: DictionaryItem };

export function AccountsSection({ book, readOnly }: { book: Book; readOnly: boolean }) {
  const query = useCapability<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const action = useLedgerAction();
  const [editor, setEditor] = useState<Editor>();
  const [preview, setPreview] = useState<BasePreview>();
  const formId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  if (query.isPending) return <p role="status">正在读取资金账户…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const view = query.data;
  const disabled = readOnly || book.status === "archived" || action.working;

  function open(next: Editor) {
    action.clearError();
    setPreview(undefined);
    setEditor(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const version = bookVersion(editor.book);
    try {
      if (editor.kind === "account") {
        const account = {
          name: fieldValue(form, "name"),
          currency: editor.row?.currency ?? fieldValue(form, "currency"),
          type: fieldValue(form, "type"),
          labels: { accountTypeId: fieldValue(form, "accountTypeId") || null, bankId: fieldValue(form, "bankId") || null },
        };
        const payload = editor.row
          ? { ...version, account, accountId: editor.row.id }
          : { ...version, account, effectiveBusinessDate: fieldValue(form, "day"), openingMinor: ledgerDecimalToMinor(fieldValue(form, "balance"), account.currency) };
        if (await action.run(editor.row ? "ledger.accounts.update" : "ledger.accounts.create", payload)) setEditor(undefined);
      } else if (editor.kind === "dictionary") {
        if (await action.run("ledger.dictionaries.save", {
          ...version, id: editor.row?.id, kind: editor.row?.kind ?? fieldValue(form, "kind"), name: fieldValue(form, "name"), status: editor.row?.status ?? "active",
        })) setEditor(undefined);
      } else if (preview) {
        const { currentBalanceMinor: _balance, ...confirm } = preview;
        if (await action.run("ledger.accounts.confirmBalance", confirm)) setEditor(undefined);
      } else {
        const data = await action.run<BasePreview>("ledger.accounts.previewBalance", {
          ...version, accountId: editor.row.id, effectiveBusinessDate: fieldValue(form, "day"),
          balanceMinor: ledgerDecimalToMinor(fieldValue(form, "balance"), editor.row.currency),
        }, false);
        if (data) setPreview(data);
      }
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "请输入有效金额");
    }
  }

  return <section className="hu-stack" aria-label="资金账户">
    <div className="hu-toolbar"><h2>资金账户</h2>
      <Button icon={Plus} disabled={disabled} onClick={() => open({ kind: "account", book: view.book })}>新增账户</Button>
    </div>
    {!editor && action.error && <p role="alert">{action.error}</p>}
    <DataTable label="资金账户" rows={view.accounts} rowKey={(row) => row.id} columns={[
      { id: "name", header: "账户", cell: (row) => row.name },
      { id: "type", header: "类型", cell: (row) => view.dictionary.find(({ id }) => id === row.labels.accountTypeId)?.name ?? accountTypes[row.type] },
      { id: "bank", header: "银行", cell: (row) => view.dictionary.find(({ id }) => id === row.labels.bankId)?.name ?? "—" },
      { id: "balance", header: "余额", cell: (row) => displayMoney(row.balanceMinor, row.currency) },
      { id: "status", header: "状态", cell: (row) => row.status === "active" ? "使用中" : "已归档" },
      { id: "actions", header: "操作", cell: (row) => <div className="hu-toolbar">
        <Button disabled={disabled} aria-label={`编辑账户 ${row.name}`} onClick={() => open({ kind: "account", book: view.book, row })}>编辑</Button>
        <Button disabled={disabled || row.status === "archived"} aria-label={`校准余额 ${row.name}`} onClick={() => open({ kind: "balance", book: view.book, row })}>校准余额</Button>
        <Button disabled={disabled} onClick={() => void action.run("ledger.accounts.setStatus", {
          ...bookVersion(view.book), accountId: row.id, status: row.status === "active" ? "archived" : "active",
        })}>{row.status === "active" ? "归档" : "恢复"}</Button>
      </div> },
    ]} />
    <section className="hu-stack" aria-label="账本字典">
      <div className="hu-toolbar"><h2>账本字典</h2>
        <Button icon={Plus} disabled={disabled} onClick={() => open({ kind: "dictionary", book: view.book })}>新增字典条目</Button>
      </div>
      {view.dictionary.length === 0 ? <p>还没有自定义字典条目。</p> : <DataTable label="账本字典" rows={view.dictionary} rowKey={(row) => row.id} columns={[
        { id: "kind", header: "分类", cell: (row) => dictionaryKinds[row.kind] },
        { id: "name", header: "名称", cell: (row) => row.name },
        { id: "status", header: "状态", cell: (row) => row.status === "active" ? "使用中" : "已归档" },
        { id: "actions", header: "操作", cell: (row) => <div className="hu-toolbar">
          <Button disabled={disabled} aria-label={`编辑字典 ${row.name}`} onClick={() => open({ kind: "dictionary", book: view.book, row })}>编辑</Button>
          <Button disabled={disabled} onClick={() => void action.run("ledger.dictionaries.save", {
            ...bookVersion(view.book), id: row.id, kind: row.kind, name: row.name, status: row.status === "active" ? "archived" : "active",
          })}>{row.status === "active" ? "归档" : "恢复"}</Button>
        </div> },
      ]} />}
    </section>
    {editor && <Dialog open title={editor.kind === "balance" ? "校准余额" : editor.kind === "dictionary" ? "编辑账本字典" : editor.row ? "编辑资金账户" : "新增资金账户"}
      onClose={() => { if (!action.working) setEditor(undefined); }} error={action.error}
      {...(preview && { initialFocusRef: cancel })}
      actions={<>
        <Button ref={cancel} disabled={action.working} onClick={() => setEditor(undefined)}>取消</Button>
        <Button type="submit" form={formId} variant="primary" disabled={disabled}>
          {editor.kind === "balance" ? preview ? "确认校准" : "预览校准" : editor.kind === "account" ? "保存账户" : "保存字典条目"}
        </Button>
      </>}>
      <form id={formId} className="hu-stack" onSubmit={submit}>
        {editor.kind === "dictionary" ? <>
          <LedgerField label="字典类别"><Select name="kind" disabled={!!editor.row} defaultValue={editor.row?.kind}>
            {Object.entries(dictionaryKinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </Select></LedgerField>
          <LedgerField label="字典名称"><input name="name" required maxLength={100} defaultValue={editor.row?.name} /></LedgerField>
        </> : editor.kind === "balance" ? preview ? <>
          <p>{preview.effectiveBusinessDate} 的现有余额为 {displayMoney(preview.currentBalanceMinor, editor.row.currency)}。</p>
          <p>新日初基准为 {displayMoney(preview.balanceMinor, editor.row.currency)}。{preview.replacedRevision && "同日旧基准将保留在历史中。"}</p>
          <Button onClick={() => setPreview(undefined)}>修改校准</Button>
        </> : <>
          <p>{editor.row.name} · {editor.row.currency}</p>
          <LedgerField label="生效业务日"><input name="day" type="date" required defaultValue={view.businessDate} /></LedgerField>
          <LedgerField label="日初校准余额"><input name="balance" inputMode="decimal" required defaultValue={ledgerMinorToDecimal(editor.row.balanceMinor, editor.row.currency)} /></LedgerField>
          <ul aria-label="余额基准历史">{editor.row.bases.map((base) => <li key={base.revision}>{base.effectiveBusinessDate} · {displayMoney(base.balanceMinor, editor.row.currency)}</li>)}</ul>
        </> : <>
          <LedgerField label="账户名称"><input name="name" required maxLength={100} defaultValue={editor.row?.name} /></LedgerField>
          <LedgerField label="账户币种"><Select name="currency" defaultValue={editor.row?.currency ?? book.defaultCurrency} disabled={!!editor.row}>
            {[...new Set([book.defaultCurrency, editor.row?.currency ?? book.defaultCurrency, ...currencies])].map((value) => <option key={value}>{value}</option>)}
          </Select></LedgerField>
          <LedgerField label="账户类型"><Select name="type" defaultValue={editor.row?.type ?? "bank"}>
            {LedgerAccount.shape.type.options.map((type) => <option key={type} value={type}>{accountTypes[type]}</option>)}
          </Select></LedgerField>
          {(["accountTypeId", "bankId"] as const).map((key) => <LedgerField key={key} label={key === "accountTypeId" ? "自定义账户类型" : "银行"}>
            <Select name={key} defaultValue={editor.row?.labels[key] ?? ""}><option value="">未选择</option>
              {view.dictionary.filter((item) => item.kind === (key === "accountTypeId" ? "account-type" : "bank") && (item.status === "active" || item.id === editor.row?.labels[key])).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select></LedgerField>)}
          {!editor.row && <>
            <LedgerField label="期初余额"><input name="balance" inputMode="decimal" required defaultValue="0" /></LedgerField>
            <LedgerField label="期初业务日"><input name="day" type="date" required defaultValue={view.businessDate} /></LedgerField>
          </>}
        </>}
      </form>
    </Dialog>}
  </section>;
}
