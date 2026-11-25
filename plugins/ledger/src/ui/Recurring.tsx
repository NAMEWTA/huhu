import { ledgerBusinessDate, ledgerDecimalToMinor, type PlanSummary, type PlanWrite, type PlanWriteResult } from "@huhu/contracts";
import { Badge, Button, Dialog, Select } from "@huhu/ui";
import { useCapability, useEngine, type ModuleProps } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import type { Book } from "../shared/books.js";
import type { AccountsView } from "../shared/entries.js";
import { RecurringInput, recurringLabels, type RecurringList, type RecurringPeriod, type RecurringPreview, type RecurringRow } from "../shared/recurring.js";
import { displayMoney, fieldValue, LedgerField, useLedgerAction } from "./primitives.js";

export function LedgerRecurringPage({ book, readOnly, onNavigate }: { book: Book; readOnly: boolean; onNavigate: ModuleProps["onNavigate"] }) {
  const engine = useEngine();
  const result = useCapability<RecurringList>("ledger.recurring.list", { bookId: book.id });
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId: book.id });
  const [draft, setDraft] = useState<{ id: string; revision: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pending, setPending] = useState<PlanWrite | null>(null);
  const [feedback, setFeedback] = useState("");
  const action = useLedgerAction();
  const createForm = useId();
  const writable = !readOnly && book.status === "active";
  const formAccounts = accounts.data?.accounts.filter(({ status }) => status === "active") ?? [];
  const day = accounts.data?.businessDate;

  function center(plan: PlanSummary) {
    if (!onNavigate) return;
    const url = new URL(location.href);
    url.searchParams.set("automation-plan", plan.planId);
    url.searchParams.set("automation-vault", engine.vaultId);
    history.replaceState(history.state, "", url);
    onNavigate("automations");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const form = new FormData(event.currentTarget);
    const account = formAccounts.find(({ id }) => id === fieldValue(form, "account"));
    if (!account) return;
    try {
      const rule = RecurringInput.parse({
        id: draft.id,
        title: fieldValue(form, "title"),
        type: fieldValue(form, "type"),
        accountId: account.id,
        currency: account.currency,
        amountMinor: ledgerDecimalToMinor(fieldValue(form, "amount"), account.currency),
        startOn: fieldValue(form, "date"),
        frequency: fieldValue(form, "frequency"),
        memo: fieldValue(form, "memo") || null,
      });
      if (await action.run("ledger.recurring.create", { bookId: book.id, expectedRevision: draft.revision, rule })) {
        setDraft(null);
        setFeedback("固定收支已创建，计划为暂停状态。");
      }
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "请检查固定收支配置");
    }
  }

  async function writePlan(intent: PlanWrite) {
    setPending(intent);
    const reply = await action.run<PlanWriteResult>("automations.plans.submit", intent, true, intent.intentId);
    if (!reply || reply.outcome === "unknown") return;
    setPending(null);
    if (reply.outcome === "not-accepted") action.setError(reply.error.message);
    else setFeedback(reply.plan.intent === "enabled" ? "原计划已启用。" : "原计划已暂停。");
  }

  async function retry(ruleId: string, periodId: string) {
    if (!result.data) return;
    const period = await action.run<RecurringPeriod>("ledger.recurring.retry", { bookId: book.id, ruleId, periodId, expectedRevision: result.data.revision });
    if (period) setFeedback(period.state === "generated" ? `${period.date} 期次已生成` : (period.error ?? "期次仍无法生成"));
  }

  return (
    <section className="hu-stack" aria-label="固定收支">
      <div className="hu-toolbar">
        <h2>固定收支</h2>
        {result.data && writable ? (
          <Button
            disabled={!formAccounts.length}
            onClick={() => {
              action.clearError();
              setDraft({ id: crypto.randomUUID(), revision: result.data!.revision });
            }}
          >
            新建固定收支
          </Button>
        ) : null}
      </div>
      <p>业务时区 {book.timeZone}</p>
      {feedback ? <p role="status">{feedback}</p> : null}
      {result.isPending ? <p role="status">正在读取固定收支…</p> : null}
      {result.error || (!draft && action.error) ? <p role="alert">{result.error?.message ?? action.error}</p> : null}
      {pending ? (
        <Button disabled={action.working} onClick={() => void writePlan(pending)}>
          核对原计划操作
        </Button>
      ) : null}
      {result.data?.rows.length === 0 ? <p>还没有固定收支。</p> : null}
      {result.data?.rows.map(({ rule, plan, periods }: RecurringRow) => (
        <article key={rule.id} className="hu-stack" data-testid="ledger-recurring-row">
          <h3>{rule.title}</h3>
          <p>
            {recurringLabels[rule.frequency]} · {rule.startOn} 起 · {displayMoney(rule.amountMinor, rule.currency)}
          </p>
          <p>
            <Badge>{plan?.intent === "enabled" ? "已启用" : plan?.intent === "deleted" ? "已删除" : plan ? "已暂停" : "计划待核对"}</Badge> {plan?.nextAt ? `下次或待补 ${ledgerBusinessDate(plan.nextAt, book.timeZone)}` : "暂无下次"}
          </p>
          <div className="hu-toolbar">
            <Button onClick={() => setPreviewId(rule.id)}>预览固定收支补期</Button>
            {plan && onNavigate && plan.intent !== "deleted" ? <Button onClick={() => center(plan)}>在自动化中心管理计划</Button> : null}
            {writable && !plan ? (
              <Button disabled={action.working} onClick={() => void action.run("ledger.recurring.ensurePlan", { bookId: book.id, ruleId: rule.id })}>
                核对并补全原计划
              </Button>
            ) : null}
            {writable && plan && (plan.actions.includes("pause") || plan.actions.includes("resume")) ? (
              <Button
                disabled={action.working || !!pending}
                onClick={() =>
                  void writePlan({
                    change: "set-intent",
                    planId: plan.planId,
                    expectedRevision: plan.revision,
                    intent: plan.intent === "enabled" ? "paused" : "enabled",
                    intentId: crypto.randomUUID(),
                  })
                }
              >
                {plan.intent === "enabled" ? "暂停计划" : "启用计划"}
              </Button>
            ) : null}
          </div>
          {periods.length ? (
            <details>
              <summary>期次与回执（{periods.length}）</summary>
              <ul>
                {periods.map((period) => (
                  <li key={period.periodId}>
                    <time dateTime={period.date}>{period.date}</time> · {period.state === "generated" ? "已生成" : "待处理"} {period.recordId ? <code>{period.recordId}</code> : period.error}
                    {period.state === "failed" && writable && plan?.intent === "enabled" ? (
                      <Button disabled={action.working} onClick={() => void retry(rule.id, period.periodId)}>
                        重试原期次
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </article>
      ))}
      {previewId ? <Preview bookId={book.id} ruleId={previewId} close={() => setPreviewId(null)} /> : null}
      {draft ? (
        <Dialog
          open
          title="新建固定收支"
          error={action.error}
          onClose={() => {
            if (!action.working) setDraft(null);
          }}
          actions={
            <Button type="submit" form={createForm} loading={action.working}>
              创建暂停计划
            </Button>
          }
        >
          <form id={createForm} className="hu-stack" onSubmit={(event) => void create(event)}>
            <LedgerField label="固定收支名称">
              <input name="title" required maxLength={150} />
            </LedgerField>
            <LedgerField label="收支方向">
              <Select name="type" defaultValue="expense">
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </Select>
            </LedgerField>
            <LedgerField label="资金账户">
              <Select name="account" required>
                {formAccounts.map(({ id, name, currency }) => (
                  <option key={id} value={id}>
                    {name} · {currency}
                  </option>
                ))}
              </Select>
            </LedgerField>
            <LedgerField label="金额">
              <input name="amount" required inputMode="decimal" />
            </LedgerField>
            <LedgerField label="起始业务日">
              <input type="date" name="date" required defaultValue={day} />
            </LedgerField>
            <LedgerField label="重复周期">
              <Select name="frequency" defaultValue="monthly">
                {Object.entries(recurringLabels).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </Select>
            </LedgerField>
            <LedgerField label="备注">
              <input name="memo" maxLength={500} />
            </LedgerField>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

function Preview({ bookId, ruleId, close }: { bookId: string; ruleId: string; close(): void }) {
  const preview = useCapability<RecurringPreview>("ledger.recurring.preview", { bookId, ruleId });
  return (
    <Dialog open title="预览固定收支补期" onClose={close} error={preview.error?.message}>
      {preview.isPending ? <p role="status">正在读取原期次…</p> : null}
      {preview.data ? (
        <>
          <p>{preview.data.nextDate ? `下一业务日 ${preview.data.nextDate}` : "暂无下一期"}</p>
          {preview.data.pending.length ? (
            <ul>
              {preview.data.pending.map(({ periodId, date }) => (
                <li key={periodId}>{date} · 等待统一计划处理</li>
              ))}
            </ul>
          ) : (
            <p>没有待补期次。</p>
          )}
          {preview.data.truncated ? <p>仍有较早期次等待补齐。</p> : null}
        </>
      ) : null}
    </Dialog>
  );
}
