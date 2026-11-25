import { Button, Dialog, Select } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { AccountsView, RecordFilters } from "../shared/entries.js";
import type { CandidateGroups, MergeInput, MergePreview, OffsetGroupView, OffsetInput, OffsetPreview, ReconciliationRow } from "../shared/reconciliation.js";
import { recordKinds } from "./RecordEditor.js";
import { displayMoney, fieldValue, LedgerField, useLedgerAction } from "./primitives.js";

export type ReconciliationTarget = { mode: "merge" } | { mode: "offset"; recordId?: string } | { mode: "undo"; recordId: string };
type Review = { mode: "merge"; input: MergeInput; preview: MergePreview } | { mode: "offset"; input: OffsetInput; preview: OffsetPreview };

function memberRefs(rows: ReconciliationRow[]) {
  return rows.map(({ record }) => ({ recordId: record.id, recordRevision: record.revision }));
}

export function ReconciliationDialog({ target, view, filters, onClose }: {
  target: ReconciliationTarget; view: AccountsView; filters: RecordFilters; onClose(): void;
}) {
  const { book } = view;
  const action = useLedgerAction();
  const [candidates, setCandidates] = useState<CandidateGroups>();
  const [selected, setSelected] = useState<ReconciliationRow[]>();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [review, setReview] = useState<Review>();
  const formId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const removing = useCapability<OffsetGroupView>("ledger.reconciliation.offsetGroup", {
    bookId: book.id, recordId: target.mode === "undo" ? target.recordId : "",
  }, { enabled: target.mode === "undo" });
  const undo = removing.data;
  const name = (id: string) => view.accounts.find((row) => row.id === id)?.name ?? id;
  const category = (id: string | null) => id ? view.dictionary.find((row) => row.id === id)?.name ?? id : "未分类";
  const describe = ({ record, title }: ReconciliationRow) => record.type === "transfer"
    ? `${title} · 转账 · ${name(record.fromAccountId)} → ${name(record.toAccountId)} · ${displayMoney(record.fromAmountMinor, record.fromCurrency)}`
    : `${title} · ${recordKinds[record.type]} · ${name(record.accountId)} · ${displayMoney(record.amountMinor, record.currency)}`;

  async function search(form: FormData) {
    const memoSimilarity = Number(form.get("similarity"));
    const sameAccount = Boolean(form.get("sameAccount"));
    const request = target.mode === "merge"
      ? { filters, bookId: book.id, memoSimilarity, sameAccount, samePayee: Boolean(form.get("samePayee")), precision: fieldValue(form, "precision") }
      : target.mode === "offset" && { filters, bookId: book.id, memoSimilarity, sameAccount, windowDays: Number(form.get("windowDays")),
        ...(target.recordId && { recordId: target.recordId }) };
    if (!request) return;
    const now = await action.run<CandidateGroups>(target.mode === "merge" ? "ledger.reconciliation.duplicates" : "ledger.reconciliation.offsetCandidates", request, false);
    if (now) setCandidates(now);
  }

  async function inspect(form: FormData, selectedRows: ReconciliationRow[]) {
    if (!candidates) return;
    const input = { bookId: book.id, expectedRevision: candidates.expectedRevision, members: memberRefs(selectedRows) };
    if (target.mode === "merge") {
      const merge = { ...input, keepRecordId: fieldValue(form, "keeper") };
      const preview = await action.run<MergePreview>("ledger.reconciliation.previewMerge", merge, false);
      if (preview) setReview({ mode: "merge", input: merge, preview });
    } else {
      const preview = await action.run<OffsetPreview>("ledger.reconciliation.previewOffset", input, false);
      if (preview) setReview({ mode: "offset", input, preview });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (target.mode === "undo") {
      if (undo && await action.run("ledger.reconciliation.undoOffset", {
        bookId: book.id, expectedRevision: undo.expectedRevision, offsetId: undo.group.id, offsetRevision: undo.group.revision,
      })) onClose();
      return;
    }
    if (!selected) return search(form);
    if (!review) return inspect(form, selected.filter(({ record }) => !excluded.includes(record.id)));
    if (review.mode === "offset") {
      if (await action.run("ledger.reconciliation.confirmOffset", { ...review.input, previewId: review.preview.previewId })) onClose();
      return;
    }
    const source = fieldValue(form, "account");
    const destination = fieldValue(form, "dest");
    const categoryId = form.get("category");
    if (await action.run("ledger.reconciliation.confirmMerge", {
      ...review.input, previewId: review.preview.previewId,
      ...(source && { accountId: source }), ...(destination && { toAccountId: destination }),
      ...(categoryId !== null && { categoryId: categoryId === "none" ? null : categoryId }), memo: fieldValue(form, "memo") || null,
    })) onClose();
  }

  function back() {
    action.clearError();
    if (review) setReview(undefined);
    else setSelected(undefined);
  }

  const title = target.mode === "merge" ? "去重与合并" : target.mode === "offset" ? "流水平账" : "撤销整组平账";
  const group = review?.preview.rows ?? selected;
  const confirmed = !!review || target.mode === "undo";
  const blockedMerge = review?.mode === "merge" && review.preview.references.conflictingOccurrences.length !== 0;
  return <Dialog open wide title={title} error={action.error ?? removing.error?.message} onClose={() => { if (!action.working) onClose(); }}
    {...(confirmed && { initialFocusRef: cancel })}
    actions={<>
      {selected && <Button disabled={action.working} onClick={back}>返回</Button>}
      <Button ref={cancel} disabled={action.working} onClick={onClose}>取消</Button>
      <Button form={formId} type="submit" variant={confirmed ? "danger" : "primary"}
        disabled={action.working || (target.mode === "undo" && !undo) || blockedMerge || (!!selected && !review && selected.length - excluded.length < 2)}>
        {target.mode === "undo" ? "确认撤销" : review ? review.mode === "merge" ? "确认合并" : "确认平账" : selected ? "预览确认" : "查找候选"}
      </Button>
    </>}>
    <form id={formId} className="hu-stack" onSubmit={submit}>
      {target.mode === "undo" ? removing.isPending ? <p role="status">正在读取平账组…</p> : undo && <>
        <p>撤销后这 {undo.rows.length} 笔流水将重新计入收支统计。</p>
        <ul>{undo.rows.map((row) => <li key={row.record.id}>{describe(row)}</li>)}</ul>
      </> : group ? <>
        <ul aria-label="待处理流水">{group.map((row) => <li key={row.record.id}>
          {!review && target.mode === "merge" ? <label>
            <input type="checkbox" checked={!excluded.includes(row.record.id)} onChange={(event) => setExcluded(
              event.currentTarget.checked ? excluded.filter((id) => id !== row.record.id) : [...excluded, row.record.id],
            )} /> {describe(row)}
          </label> : describe(row)}
        </li>)}</ul>
        {!review && target.mode === "merge" && <LedgerField label="保留流水"><Select name="keeper" required defaultValue={group[0]?.record.id}>
          {group.filter(({ record }) => !excluded.includes(record.id)).map((row) => <option key={row.record.id} value={row.record.id}>{describe(row)}</option>)}
        </Select></LedgerField>}
        {review?.mode === "offset" && <p>平账金额 {displayMoney(review.preview.amountMinor, review.preview.currency)}。整组从收支统计排除。</p>}
        {review?.mode === "merge" && <>
          <p>合并迁移 {review.preview.references.attachments} 份凭证、{review.preview.references.notes} 个笔记关联和 {review.preview.references.occurrences} 个期次关联。</p>
          {blockedMerge && <p role="alert">选中流水关联了不同计划期次，请保留独立流水。</p>}
          {review.preview.accounts.length > 1 && <LedgerField label="保留账户"><Select name="account" required defaultValue="">
            <option value="" disabled>选择账户</option>{review.preview.accounts.map((id) => <option key={id} value={id}>{name(id)}</option>)}
          </Select></LedgerField>}
          {review.preview.toAccounts.length > 1 && <LedgerField label="保留转入账户"><Select name="dest" required defaultValue="">
            <option value="" disabled>选择转入账户</option>{review.preview.toAccounts.map((id) => <option key={id} value={id}>{name(id)}</option>)}
          </Select></LedgerField>}
          {review.preview.categories.length > 1 && <LedgerField label="保留分类"><Select name="category" required defaultValue="">
            <option value="" disabled>选择分类</option>{review.preview.categories.map((id) => <option key={id ?? "none"} value={id ?? "none"}>{category(id)}</option>)}
          </Select></LedgerField>}
          {review.preview.memoOverflow && <p>合并备注超过 500 字，请复核要保留的内容。</p>}
          <LedgerField label="合并备注"><textarea name="memo" rows={3} maxLength={500} defaultValue={review.preview.suggestedMemo ?? ""} /></LedgerField>
        </>}
      </> : <>
        {target.mode === "merge" ? <>
          <LedgerField label="时间匹配精度"><Select name="precision" defaultValue="minute">
            <option value="second">同一秒</option><option value="minute">同一分钟</option><option value="day">同一业务日</option><option value="any">不限</option>
          </Select></LedgerField>
          <label><input name="samePayee" type="checkbox" defaultChecked /> 交易对方相同</label>
        </> : <LedgerField label="最大相隔天数"><input name="windowDays" required type="number" min={1} max={365} defaultValue={30} /></LedgerField>}
        <label><input name="sameAccount" type="checkbox" defaultChecked={target.mode === "merge"} /> 资金账户相同</label>
        <LedgerField label="最低备注相似度"><input name="similarity" required type="number" min={0} max={100} defaultValue={0} /></LedgerField>
        {candidates && <>
          <p role="status">{candidates.groups.length ? `找到 ${candidates.groups.length} 组候选。` : "当前范围没有匹配候选。"}{candidates.truncated && "缩小查询范围可继续查找。"}</p>
          {candidates.groups.map((rows) => <section className="hu-stack" key={rows.map(({ record }) => record.id).join(",")}>
            <ul>{rows.map((row) => <li key={row.record.id}>{describe(row)}</li>)}</ul>
            <Button onClick={() => { setExcluded([]); setSelected(rows); }}>{target.mode === "merge" ? "选择合并组" : "选择平账组"}</Button>
          </section>)}
        </>}
      </>}
    </form>
  </Dialog>;
}
