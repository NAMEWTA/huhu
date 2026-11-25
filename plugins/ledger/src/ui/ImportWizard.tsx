import { Button, DataTable, Dialog, Select } from "@huhu/ui";
import { createRequestId } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AccountsView } from "../shared/entries.js";
import { maxStatementBytes, type BillSource, type CsvColumns, type ImportPreview, type ImportResult } from "../shared/imports.js";
import { recordKinds } from "./RecordEditor.js";
import { bookVersion, fieldValue, fileBase64, LedgerField, useLedgerAction } from "./primitives.js";

type Row = ImportPreview["rows"][number];
const names: Record<BillSource, string> = { csv: "通用 CSV", alipay: "支付宝 CSV", jd: "京东 CSV", wechat: "微信 XLSX" };
const statuses: Record<Row["state"], string> = {
  ready: "可导入", duplicate: "疑似重复", pending: "待处理", invalid: "无效", skipped: "跳过", imported: "已导入",
};
const canSelect = (row: Row) => row.state === "ready" || row.state === "duplicate";
const typeLabels = { date: "日期", amount: "金额", type: "方向", account: "账户", title: "事项", toAccount: "转入账户",
  toAmount: "转入金额", currency: "币种", category: "分类", payee: "交易对方", memo: "备注", number: "外部单号" };

export function ImportWizard({ view, onClose }: { view: AccountsView; onClose(): void }) {
  const action = useLedgerAction();
  const [source, setSource] = useState<BillSource>("csv");
  const [file, setFile] = useState<File>();
  const [custom, setCustom] = useState(false);
  const [staged, setStaged] = useState<{ fileName: string; base64: string; source: BillSource; sourceTimeZone: string; columns?: CsvColumns }>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [fix, setFix] = useState<Row>();
  const [result, setResult] = useState<ImportResult>();
  const [reading, setReading] = useState(false);
  const confirmKey = useRef<{ body: string; key: string }>(null);
  const formId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = reading || action.working;
  const { book } = view;
  const step = result ? "导入结果" : fix ? "处理账单行" : preview ? "核对账单" : "选择账单";
  const accounts = view.accounts.filter(({ status }) => status === "active");
  const categories = view.dictionary.filter(({ status, kind }) => status === "active" && kind === "category");
  useEffect(() => { heading.current?.focus(); }, [step]);

  function updatePreview(next: ImportPreview, preserveChoices: boolean) {
    setSelected((before) => {
      const choices = new Set(before);
      return next.rows.filter((row) => preserveChoices
        ? canSelect(row) && (choices.has(row.rowId) || (fix?.rowId === row.rowId && row.state === "ready"))
        : row.state === "ready").map(({ rowId }) => rowId);
    });
    setPreview(next);
    setFix(undefined);
  }

  async function close() {
    if (busy) return;
    if (preview && !result) await action.run("ledger.imports.cancel", { bookId: book.id, previewId: preview.previewId }, false);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!preview) {
      if (!file || file.size === 0 || file.size > maxStatementBytes) { action.setError("请选择不超过 4 MiB 的账单"); return; }
      setReading(true);
      try {
        const columns = source === "csv" && custom ? {
          ...Object.fromEntries(Object.keys(typeLabels).flatMap((key) => fieldValue(values, key) ? [[key, Number(fieldValue(values, key))]] : [])),
          headerLine: Number(values.get("headerLine")),
          typeValues: { income: fieldValue(values, "income"), expense: fieldValue(values, "expense"), transfer: fieldValue(values, "transfer") },
        } as CsvColumns : undefined;
        const input = { fileName: file.name, base64: await fileBase64(file), source, sourceTimeZone: fieldValue(values, "zone"), ...(columns && { columns }) };
        const next = await action.run<ImportPreview>("ledger.imports.preview", { bookId: book.id, ...input }, false);
        if (next) {
          setStaged(input);
          updatePreview(next, false);
        }
      } catch (error) { action.setError(error instanceof Error ? error.message : "无法读取账单"); }
      finally { setReading(false); }
      return;
    }
    if (fix) {
      let active = preview;
      const accountId = fieldValue(values, "accountId");
      const toAccountId = fieldValue(values, "toAccountId");
      const category = fieldValue(values, "categoryId");
      const kind = fieldValue(values, "kind");
      const disambiguation = fieldValue(values, "disambiguation");
      if (values.get("remember") && staged) {
        const rules = [
          { kind: "account", original: fix.sourceAccount, targetId: accountId },
          { kind: "account", original: fix.sourceDestination, targetId: toAccountId },
          { kind: "category", original: fix.sourceCategory, targetId: category },
        ].filter(({ original, targetId }) => original && targetId).map((rule) => ({ ...rule, source }));
        if (rules.length) {
          if (!await action.run("ledger.mappings.save", { ...bookVersion(book), rules })) return;
          await action.run("ledger.imports.cancel", { bookId: book.id, previewId: preview.previewId }, false);
          const repeated = await action.run<ImportPreview>("ledger.imports.preview", { bookId: book.id, ...staged }, false);
          if (!repeated) { setFix(undefined); setPreview(undefined); return; }
          active = repeated;
        }
      }
      const next = await action.run<ImportPreview>("ledger.imports.resolve", {
        bookId: book.id, previewId: active.previewId,
        rows: [{ rowId: fix.rowId, skip: Boolean(values.get("skip")), ...(kind && { kind }), ...(accountId && { accountId }),
          ...(toAccountId && { toAccountId }), categoryId: category || null, toAmount: fieldValue(values, "toAmount"), ...(disambiguation && { disambiguation }) }],
      }, false);
      if (next) updatePreview(next, true);
      return;
    }
    const input = { bookId: book.id, previewId: preview.previewId, expectedRevision: preview.expectedRevision,
      inputDigest: preview.inputDigest, mappingRevision: preview.mappingRevision, selectedRowIds: selected };
    const body = JSON.stringify(input);
    if (confirmKey.current?.body !== body) confirmKey.current = { body, key: createRequestId() };
    const intentKey = confirmKey.current.key;
    const outcome = await action.run<ImportResult>("ledger.imports.confirm", { ...input, intentKey }, true, intentKey);
    if (outcome) setResult(outcome);
  }

  return <Dialog open wide title="导入账单" error={action.error} onClose={() => void close()} actions={<>
    {preview && !fix && !result && <Button disabled={busy} onClick={async () => {
      await action.run("ledger.imports.cancel", { bookId: book.id, previewId: preview.previewId }, false);
      setPreview(undefined); setFix(undefined); setSelected([]);
    }}>重新选择文件</Button>}
    <Button disabled={busy} onClick={() => void close()}>{result ? "完成" : "取消导入"}</Button>
    {!result && <Button type="submit" form={formId} variant="primary" disabled={busy || (!preview ? !file : !fix && selected.length === 0)}>
      {fix ? "应用处理" : preview ? "确认导入" : "预览账单"}
    </Button>}
  </>}>
    <form id={formId} className="hu-stack" onSubmit={submit}>
      <h3 ref={heading} tabIndex={-1}>{step}</h3>
      {result ? <p role="status">已导入 {result.imported} 笔流水。</p> : !preview ? <>
        <LedgerField label="账单来源"><Select value={source} onChange={(event) => { setSource(event.currentTarget.value as BillSource); setFile(undefined); }}>
          {Object.entries(names).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select></LedgerField>
        <LedgerField label="来源时区"><input name="zone" required defaultValue={source === "csv" ? book.timeZone : "Asia/Shanghai"} key={source} /></LedgerField>
        <LedgerField label="账单文件"><input type="file" key={source} accept={source === "wechat" ? ".xlsx" : ".csv,text/csv"} onChange={(event) => setFile(event.currentTarget.files?.[0])} /></LedgerField>
        {file && <p>{file.name}</p>}
        {source === "csv" && <label><input type="checkbox" checked={custom} onChange={(event) => setCustom(event.currentTarget.checked)} /> 手工映射列和类型</label>}
        {source === "csv" && custom && <fieldset className="hu-stack"><legend>通用 CSV 列号（从 1 开始）</legend>
          <LedgerField label="表头所在行"><input name="headerLine" type="number" defaultValue={1} min={1} max={200} required /></LedgerField>
          <div className="hu-toolbar">{Object.entries(typeLabels).map(([key, label], index) => <LedgerField key={key} label={label + "列"}>
            <input name={key} type="number" min={1} max={128} required={index < 5} defaultValue={index < 5 ? index + 1 : undefined} />
          </LedgerField>)}</div>
          <div className="hu-toolbar">{Object.entries(recordKinds).map(([key, label]) => <LedgerField key={key} label={label + "字段值"}><input name={key} required defaultValue={label} /></LedgerField>)}</div>
        </fieldset>}
      </> : fix ? <>
        <p>第 {fix.line} 行 · {fix.title} · {fix.diagnostic}</p>
        <LedgerField label="交易类型"><Select name="kind" defaultValue={fix.kind ?? ""}><option value="">待选择</option>
          {Object.entries(recordKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></LedgerField>
        <LedgerField label="资金账户"><Select name="accountId" defaultValue={fix.accountId ?? ""}><option value="">待选择</option>
          {accounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</Select></LedgerField>
        <LedgerField label="转入账户"><Select name="toAccountId" defaultValue={fix.toAccountId ?? ""}><option value="">待选择</option>
          {accounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</Select></LedgerField>
        <LedgerField label="转入实际金额"><input name="toAmount" defaultValue={fix.toAmount} inputMode="decimal" /></LedgerField>
        <LedgerField label="分类"><Select name="categoryId" defaultValue={fix.categoryId ?? ""}><option value="">未分类</option>
          {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</Select></LedgerField>
        <LedgerField label="重复时刻"><Select name="disambiguation"><option value="">按来源时间核对</option><option value="earlier">采用较早时刻</option><option value="later">采用较晚时刻</option></Select></LedgerField>
        <label><input name="remember" type="checkbox" /> 保存所选账户和分类映射</label>
        <label><input name="skip" type="checkbox" defaultChecked={fix.state === "skipped"} /> 跳过此行</label>
        <Button onClick={() => setFix(undefined)}>返回核对</Button>
      </> : <>
        <p role="status">{preview.encoding} · {preview.counts.ready} 可导入 · {preview.counts.duplicate} 疑似重复 · {preview.counts.pending} 待处理 · {preview.counts.invalid} 无效 · {preview.counts.skipped} 跳过 · {preview.counts.imported} 已导入</p>
        {preview.proposedAccounts.length > 0 && <p>待映射账户 · {preview.proposedAccounts.join("、")}</p>}
        <DataTable label="账单预览" rows={preview.rows} rowKey={(row) => row.rowId} columns={[
          { id: "select", header: "选择", width: 65, cell: (row) => <input type="checkbox" aria-label={`导入第 ${row.line} 行`}
            checked={selected.includes(row.rowId)} disabled={!canSelect(row)} onChange={(event) => setSelected(event.currentTarget.checked ? [...selected, row.rowId] : selected.filter((id) => id !== row.rowId))} /> },
          { id: "title", header: "来源行", cell: (row) => `${row.line} · ${row.title}` },
          { id: "when", header: "来源日期 / 账本业务日", cell: (row) => row.sourceDate + " / " + (row.businessDate ?? "—") },
          { id: "amount", header: "原始金额", width: 105, cell: (row) => row.amount },
          { id: "state", header: "状态", cell: (row) => statuses[row.state] + (row.diagnostic ? " · " + row.diagnostic : "") },
          { id: "actions", header: "操作", width: 100, cell: (row) => row.state !== "imported" &&
            <Button aria-label={`处理第 ${row.line} 行`} onClick={() => setFix(row)}>处理</Button> },
        ]} />
      </>}
    </form>
  </Dialog>;
}
