import { ledgerDecimalToMinor, ledgerMinorToDecimal, ledgerSourceTime } from "@huhu/contracts";
import { Button, Dialog, Select } from "@huhu/ui";
import { createRequestId, useCapability } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { Book } from "../shared/books.js";
import { maxAttachmentBytes, type AccountsView, type AttachmentRead, type RecordView } from "../shared/entries.js";
import { bookVersion, downloadFile, fieldValue, fileBase64, LedgerField, useLedgerAction } from "./primitives.js";

export const recordKinds = { expense: "支出", income: "收入", transfer: "转账" };
type RecordKind = keyof typeof recordKinds;

export function RecordEditor({ book, view, row, onClose }: { book: Book; view: AccountsView; row?: RecordView; onClose(): void }) {
  const action = useLedgerAction();
  const previous = row?.record;
  const [type, setType] = useState<RecordKind>(previous?.type ?? "expense");
  const lastIntent = useRef<{ body: string; key: string }>(null);
  const formId = useId();
  const source = previous?.type === "transfer" ? previous.fromAccountId : previous?.accountId;
  const currentAmount = previous
    ? previous.type === "transfer" ? ledgerMinorToDecimal(previous.fromAmountMinor, previous.fromCurrency) : ledgerMinorToDecimal(previous.amountMinor, previous.currency)
    : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const metadata = {
        payee: fieldValue(form, "payee") || null, memo: fieldValue(form, "memo") || null,
        categoryId: fieldValue(form, "category") || null, tagIds: form.getAll("tag").map(String), attachmentIds: previous?.attachmentIds ?? [],
      };
      let record;
      if (row?.offset && previous) {
        const { id: _id, bookId: _bookId, revision: _revision, ...original } = previous;
        record = { ...original, ...metadata };
      } else {
        const account = view.accounts.find((entry) => entry.id === fieldValue(form, "account"));
        if (!account) throw new Error("请选择资金账户");
        const day = fieldValue(form, "date");
        const local = ledgerSourceTime(day + "T12:00", book.timeZone, book.timeZone);
        if (local.state !== "ready") throw new Error("该业务日需要明确有效的日期");
        const from = ledgerDecimalToMinor(fieldValue(form, "amount"), account.currency);
        if (BigInt(from) <= 0n) throw new Error("请输入该账户币种可精确表示的正数");
        const fields = { ...metadata, occurredAt: row?.businessDate === day && previous ? previous.occurredAt : local.occurredAt };
        if (type === "transfer") {
          const to = view.accounts.find((entry) => entry.id === fieldValue(form, "to"));
          if (!to || to.id === account.id) throw new Error("请选择不同的转出和转入账户");
          const raw = fieldValue(form, "toAmount");
          const amount = raw ? ledgerDecimalToMinor(raw, to.currency) : to.currency === account.currency ? from : "0";
          if (BigInt(amount) <= 0n || (to.currency === account.currency && amount !== from)) throw new Error("同币种转账金额须相同，跨币种须填写实际转入金额");
          record = { ...fields, type, fromAccountId: account.id, fromCurrency: account.currency, fromAmountMinor: from, toAccountId: to.id, toCurrency: to.currency, toAmountMinor: amount };
        } else record = { ...fields, type, accountId: account.id, currency: account.currency, amountMinor: from };
      }
      const payload = { ...bookVersion(book), record, title: fieldValue(form, "title") };
      const body = JSON.stringify(payload);
      if (lastIntent.current?.body !== body) lastIntent.current = { body, key: createRequestId() };
      const intent = lastIntent.current.key;
      const result = previous
        ? await action.run("ledger.records.update", { ...payload, recordId: previous.id, recordRevision: previous.revision }, true, intent)
        : await action.run("ledger.records.create", { ...payload, intentKey: intent }, true, intent);
      if (result) onClose();
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "请输入有效的金额和日期");
    }
  }

  const offered = (stored?: string) => view.accounts.filter(({ id, status }) => status === "active" || id === stored);
  const oldTo = previous?.type === "transfer" ? previous.toAccountId : undefined;
  return <Dialog open wide title={row ? "编辑流水" : "记一笔"} error={action.error} onClose={() => { if (!action.working) onClose(); }}
    actions={<><Button disabled={action.working} onClick={onClose}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={action.working}>保存流水</Button></>}>
    <form id={formId} className="hu-stack" onSubmit={submit}>
      <LedgerField label="事项"><input name="title" required maxLength={150} defaultValue={row?.title} /></LedgerField>
      {row?.offset ? <p>此笔流水已平账。撤销整组后可修改金额、账户、方向和日期。</p> : <>
      <LedgerField label="交易类型"><Select name="type" value={type} onChange={(event) => setType(event.currentTarget.value as RecordKind)}>
        {Object.entries(recordKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select></LedgerField>
      <LedgerField label={type === "transfer" ? "转出账户" : "资金账户"}><Select name="account" required defaultValue={source}>
        {offered(source).map(({ id, name, currency }) => <option key={id} value={id}>{name} · {currency}</option>)}
      </Select></LedgerField>
      <LedgerField label="金额"><input name="amount" inputMode="decimal" required defaultValue={currentAmount} /></LedgerField>
      {type === "transfer" && <>
        <LedgerField label="转入账户"><Select name="to" required defaultValue={oldTo ?? ""}>
          <option value="" disabled>选择转入账户</option>
          {offered(oldTo).map(({ id, name, currency }) => <option key={id} value={id}>{name} · {currency}</option>)}
        </Select></LedgerField>
        <LedgerField label="转入实际金额"><input name="toAmount" inputMode="decimal" defaultValue={previous?.type === "transfer" ? ledgerMinorToDecimal(previous.toAmountMinor, previous.toCurrency) : ""} /></LedgerField>
      </>}
      <LedgerField label="业务日期"><input name="date" type="date" required defaultValue={row?.businessDate ?? view.businessDate} /></LedgerField>
      </>}
      <LedgerField label="分类"><Select name="category" defaultValue={previous?.categoryId ?? ""}>
        <option value="">未分类</option>
        {view.dictionary.filter((item) => item.kind === "category" && (item.status === "active" || item.id === previous?.categoryId))
          .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select></LedgerField>
      {view.dictionary.some(({ kind }) => kind === "tag") && <fieldset>
        <legend>标签</legend>
        {view.dictionary.filter((item) => item.kind === "tag" && (item.status === "active" || previous?.tagIds.includes(item.id))).map(({ id, name }) =>
          <label key={id}><input type="checkbox" name="tag" value={id} defaultChecked={previous?.tagIds.includes(id)} /> {name}</label>)}
      </fieldset>}
      <LedgerField label="交易对方"><input name="payee" maxLength={500} defaultValue={previous?.payee ?? ""} /></LedgerField>
      <LedgerField label="备注"><textarea name="memo" rows={3} maxLength={500} defaultValue={previous?.memo ?? ""} /></LedgerField>
    </form>
  </Dialog>;
}

export function AttachmentsDialog({ book, recordId, readOnly, onClose }: { book: Book; recordId: string; readOnly: boolean; onClose(): void }) {
  const query = useCapability<RecordView>("ledger.records.get", { bookId: book.id, recordId });
  const action = useLedgerAction();
  const [file, setFile] = useState<File>();
  const [preparing, setPreparing] = useState(false);
  const formId = useId();
  const busy = preparing || action.working;
  const view = query.data;
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !view) return;
    if (!file.size || file.size > maxAttachmentBytes) {
      action.setError("请选择不超过 2 MiB 的文件");
      return;
    }
    setPreparing(true);
    try {
      const base64 = await fileBase64(file);
      if (await action.run("ledger.attachments.upload", {
        ...bookVersion(book), recordId, recordRevision: view.record.revision,
        fileName: file.name, mediaType: file.type || "application/octet-stream", base64,
      })) setFile(undefined);
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "无法读取凭证");
    } finally { setPreparing(false); }
  }

  async function download(attachmentId: string) {
    const result = await action.run<import("zod").infer<typeof AttachmentRead>>("ledger.attachments.read", { bookId: book.id, attachmentId }, false);
    if (!result) return;
    if (result.status === "missing") {
      action.setError("凭证文件缺失或内容已变化");
      return;
    }
    const bytes = Uint8Array.from(atob(result.base64), (value) => value.charCodeAt(0));
    downloadFile(result.attachment.fileName, new Blob([bytes], { type: "application/octet-stream" }));
  }

  return <Dialog open title="流水凭证" error={action.error ?? query.error?.message} onClose={() => { if (!busy) onClose(); }} actions={<>
    <Button disabled={busy} onClick={onClose}>完成</Button>
    {!readOnly && <Button form={formId} type="submit" variant="primary" disabled={busy || !file || !view}>上传凭证</Button>}
  </>}>
    {query.isPending ? <p role="status">正在读取凭证…</p> : view && <>
      <p>{view.title}</p>
      {view.attachments.length === 0 ? <p>尚无凭证。</p> : <ul className="hu-stack">{view.attachments.map((attachment) => <li key={attachment.id}>
        {attachment.fileName} {attachment.missing ? <span>· 文件缺失</span> : <Button disabled={busy} onClick={() => void download(attachment.id)} aria-label={`下载 ${attachment.fileName}`}>下载</Button>}
      </li>)}</ul>}
      {!readOnly && <form id={formId} onSubmit={upload}><LedgerField label="选择凭证文件">
        <input key={file ? "selected" : "empty"} name="attachment" type="file" onChange={(event) => setFile(event.currentTarget.files?.[0])} />
      </LedgerField>{file && <p>{file.name}</p>}</form>}
    </>}
  </Dialog>;
}
