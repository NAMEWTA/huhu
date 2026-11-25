import { Button, DataTable, Dialog, Select } from "@huhu/ui";
import { createRequestId, useCapability } from "@huhu/workbench";
import { useRef, useState } from "react";
import type { Book } from "../shared/books.js";
import type { AccountsView } from "../shared/entries.js";
import type { Loan, LoanHistory, LoanList, LoanPayment } from "../shared/loans.js";
import { displayMoney, LedgerField, useLedgerAction } from "./primitives.js";

export function LedgerLoans({ book, readOnly, onRecord }: { book: Book; readOnly: boolean; onRecord(recordId: string): void }) {
  const list = useCapability<LoanList>("ledger.loans.list", { bookId: book.id });
  const [preview, setPreview] = useState<Loan>();
  return (
    <section className="hu-stack" aria-label="贷款">
      <h2>贷款</h2>
      {list.isPending ? <p role="status">正在读取贷款…</p> : null}
      {list.error ? <p role="alert">{list.error.message}</p> : null}
      {list.data?.rows.length === 0 ? <p>还没有贷款。</p> : null}
      {list.data?.rows.map((loan) => (
        <article key={loan.id} className="hu-stack">
          <h3>{loan.definition.name}</h3>
          <p>{loan.definition.method === "equal-payment" ? "等额本息" : "等额本金"} · {loan.definition.months} 期 · {displayMoney(loan.definition.principalMinor, loan.definition.currency)}</p>
          <div><Button onClick={() => setPreview(loan)}>预览贷款历史补记</Button></div>
          <p>已补记 {loan.generated} 期</p>
        </article>
      ))}
      {preview && <History key={preview.id} loan={preview} readOnly={readOnly || book.status !== "active"}
        close={() => setPreview(undefined)} onRecord={onRecord} />}
    </section>
  );
}

function History({ loan, readOnly, close, onRecord }: { loan: Loan; readOnly: boolean; close(): void; onRecord(recordId: string): void }) {
  const { bookId, id, definition } = loan;
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId });
  const [accountId, setAccountId] = useState(definition.accountId);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState("");
  const history = useCapability<LoanHistory>("ledger.loans.previewHistory", { bookId, loanId: id, accountId });
  const action = useLedgerAction();
  const lastIntent = useRef<{ payload: string; key: string }>(null);
  const candidate = accounts.data?.accounts.filter(({ currency, status }) => currency === definition.currency && status === "active") ?? [];
  const activeAccount = candidate.some(({ id }) => id === accountId);
  const due = history.data?.installments.filter(({ status }) => status === "due").map(({ number }) => number) ?? [];
  const eligible = selected.filter((number) => due.includes(number));
  const canSelect = !readOnly && history.data?.accountAvailable && !action.working && !history.isFetching;

  async function confirm() {
    if (!history.data || !canSelect || !eligible.length) return;
    const input = { ...history.data.preview, selected: eligible };
    const payload = JSON.stringify(input);
    if (lastIntent.current?.payload !== payload) lastIntent.current = { payload, key: createRequestId() };
    const payments = await action.run<LoanPayment[]>("ledger.loans.confirmHistory", input, true, lastIntent.current.key);
    if (payments) {
      setSelected([]);
      setFeedback(`已确认 ${payments.length} 个所选期次。`);
    }
  }

  return (
    <Dialog open wide title="预览贷款历史补记" error={action.error ?? history.error?.message ?? accounts.error?.message}
      onClose={() => { if (!action.working) close(); }}
      actions={<>
        <Button disabled={action.working} onClick={close}>{readOnly ? "关闭" : "取消"}</Button>
        {!readOnly && <Button variant="primary" loading={action.working} disabled={!canSelect || eligible.length === 0} onClick={() => void confirm()}>确认所选期次</Button>}
      </>}>
      <div className="hu-stack">
        <h3>{definition.name}</h3>
        {!readOnly && <>
          <p>选中需要补记的到期期次。流水按各期原业务日入账。</p>
          <LedgerField label="入账账户">
            <Select value={accountId} disabled={action.working || accounts.isPending} onChange={(event) => {
              setAccountId(event.currentTarget.value);
              setSelected([]);
              setFeedback("");
              action.clearError();
            }}>
              {!activeAccount && <option value={accountId} disabled>原账户不可用</option>}
              {candidate.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </LedgerField>
          {history.data && !history.data.accountAvailable && <p role="status">请选择可用的同币种账户。</p>}
        </>}
        {history.isPending && <p role="status">正在读取还款计划…</p>}
        {feedback && <p role="status">{feedback}</p>}
        {history.data && (
          <fieldset className="hu-stack">
            <legend>还款期次</legend>
            <DataTable label="还款计划" rows={history.data.installments} rowKey={({ number }) => String(number)} columns={[
              { id: "date", header: "到期日", cell: ({ date }) => <time dateTime={date}>{date}</time> },
              { id: "payment", header: "应付", cell: ({ paymentMinor }) => displayMoney(paymentMinor, definition.currency) },
              { id: "principal", header: "本金", cell: ({ principalMinor }) => displayMoney(principalMinor, definition.currency) },
              { id: "interest", header: "利息", cell: ({ interestMinor }) => displayMoney(interestMinor, definition.currency) },
              { id: "remaining", header: "剩余本金", cell: ({ remainingMinor }) => displayMoney(remainingMinor, definition.currency) },
              { id: "status", header: "状态", cell: ({ status, number, date, recordId }) => {
                if (status === "generated") return recordId ? <Button disabled={action.working} onClick={() => onRecord(recordId)}>查看第 {number} 期流水</Button> : "已补记 · 流水已移除";
                if (status === "future") return "未到期";
                if (status === "no-payment") return "无需记账";
                if (readOnly) return "可补记";
                return <label>
                  <input type="checkbox" aria-label={`补记第 ${number} 期 ${date}`} disabled={!canSelect} checked={eligible.includes(number)}
                    onChange={(event) => setSelected(event.currentTarget.checked ? [...selected, number] : selected.filter((value) => value !== number))} />
                  可补记
                </label>;
              } },
            ]} />
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
