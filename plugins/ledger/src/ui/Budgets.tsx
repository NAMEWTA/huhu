import { ledgerDecimalToMinor, ledgerMinorToDecimal } from "@huhu/contracts";
import { Button, Dialog, Select } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import type { Book } from "../shared/books.js";
import { SaveBudgets, type Budget, type BudgetDetail, type BudgetOverview, type CopyBudgetResult } from "../shared/budgets.js";
import type { AccountsView } from "../shared/entries.js";
import { FinancialNotesButton } from "./FinancialNotes.js";
import { currencies, displayMoney, fieldValue, LedgerField, useLedgerAction } from "./primitives.js";
import "./ledger.css";

const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const monthPattern = "[0-9]{4}-(0[1-9]|1[0-2])";
const pageSize = 10;
const budgetKind = (type: "fixed" | "free", direction?: "income" | "expense") => (type === "free" ? "自由预算" : direction === "income" ? "固定收入预算" : "固定支出预算");
type Filter = { year: string; month: string; currency: string };
type Progress = BudgetOverview["budgets"][number];
type BudgetDialog = { kind: "detail"; budget: Progress } | { kind: "edit"; budgets: Progress[]; revision: string } | { kind: "copy"; revision: string };

export function BudgetTotals({ totals }: { totals: BudgetOverview["totals"] }) {
  return (
    <ul className="ledger-budget-totals">
      {totals.map(({ type, direction, currency, actualMinor, limitMinor }) => (
        <li key={`${type}/${direction}/${currency}`}>
          <span>{budgetKind(type, direction)}</span>
          <strong>
            {displayMoney(actualMinor, currency)} / {displayMoney(limitMinor, currency)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function BudgetProgress({ budget }: { budget: Progress }) {
  const { definition, actualMinor, limitMinor, remainingMinor, count } = budget;
  const ratio = (BigInt(actualMinor) * 100n) / BigInt(limitMinor);
  const difference = BigInt(remainingMinor);
  const income = definition.type === "fixed" && definition.direction === "income";
  const label = income ? (difference < 0n ? "超过目标" : "距目标") : difference < 0n ? "已超支" : "剩余";
  const actual = displayMoney(actualMinor, definition.currency);
  const limit = displayMoney(limitMinor, definition.currency);
  const remaining = displayMoney((difference < 0n ? -difference : difference).toString(), definition.currency);
  return (
    <div className="ledger-budget-progress">
      <progress max={100} value={Number(ratio > 100n ? 100n : ratio)} aria-label={`${definition.name}的预算进度`} aria-valuetext={`${actual} / ${limit}，${label} ${remaining}`} />
      <span>
        {actual} / {limit}
      </span>
      <small className="muted">
        {label} {remaining} · {count} 笔
      </small>
    </div>
  );
}

export function LedgerBudgets({ book, readOnly, openResource }: { book: Book; readOnly: boolean; openResource(path: string): void }) {
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId: book.id });
  if (accounts.isError) return <p role="alert">{accounts.error.message}</p>;
  if (!accounts.data) return <p role="status">正在读取预算设置…</p>;
  return <BudgetPage book={book} readOnly={readOnly} view={accounts.data} openResource={openResource} />;
}

function BudgetPage({ book, view, readOnly, openResource }: { book: Book; view: AccountsView; readOnly: boolean; openResource(path: string): void }) {
  const current = view.businessDate.slice(0, 7);
  const [filter, setFilter] = useState<Filter>({ year: current.slice(0, 4), month: current.slice(5), currency: "" });
  const [year, setYear] = useState(filter.year);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<BudgetDialog>();
  const [notice, setNotice] = useState("");
  const base = { bookId: book.id, year: filter.year, ...(filter.month && { month: filter.month }) };
  const all = useCapability<BudgetOverview>("ledger.budgets.list", base);
  const query = { ...base, ...(filter.currency && { currency: filter.currency }) };
  const filtered = useCapability<BudgetOverview>("ledger.budgets.list", query, { enabled: !!filter.currency });
  const { data, isError, error } = filter.currency ? filtered : all;
  const locked = readOnly || book.status !== "active";
  const period = `${filter.year}-${filter.month || current.slice(5)}`;
  const chosen = data?.budgets.filter(({ id }) => selected.includes(id)) ?? [];
  const options = [...new Set([...currencies, book.defaultCurrency, ...view.accounts.map(({ currency }) => currency), ...(all.data?.totals.map(({ currency }) => currency) ?? []), ...[filter.currency].filter(Boolean)])];

  function change(next: Partial<Filter>) {
    setFilter((previous) => ({ ...previous, ...next }));
    setSelected([]);
    setNotice("");
  }

  function edit(budgets: Progress[]) {
    if (data) {
      setNotice("");
      setDialog({ kind: "edit", budgets, revision: data.revision });
    }
  }

  return (
    <section className="hu-stack" aria-label="预算">
      <div className="hu-toolbar">
        <h2>预算</h2>
        <Button icon={Plus} variant="primary" disabled={locked || !data} onClick={() => edit([])}>
          新增预算
        </Button>
        <Button
          disabled={locked || !data}
          onClick={() => {
            if (data) setDialog({ kind: "copy", revision: data.revision });
          }}
        >
          跨月复制
        </Button>
      </div>
      <form
        className="hu-toolbar"
        aria-label="筛选预算"
        onSubmit={(event) => {
          event.preventDefault();
          if (/^\d{4}$/.test(year)) change({ year });
        }}
      >
        <LedgerField label="预算年份">
          <input
            inputMode="numeric"
            required
            pattern="[0-9]{4}"
            maxLength={4}
            value={year}
            onChange={(event) => setYear(event.currentTarget.value)}
            onBlur={() => {
              if (year !== filter.year && /^\d{4}$/.test(year)) change({ year });
              else setYear(filter.year);
            }}
          />
        </LedgerField>
        <LedgerField label="预算月份">
          <Select value={filter.month} onChange={(event) => change({ month: event.currentTarget.value })}>
            <option value="">全年</option>
            {months.map((month, index) => (
              <option key={month} value={month}>
                {index + 1} 月
              </option>
            ))}
          </Select>
        </LedgerField>
        <LedgerField label="预算币种">
          <Select value={filter.currency} onChange={(event) => change({ currency: event.currentTarget.value })}>
            <option value="">全部币种</option>
            {options.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </Select>
        </LedgerField>
      </form>
      {notice && <p role="status">{notice}</p>}
      {isError ? (
        <p role="alert">{error.message}</p>
      ) : !data ? (
        <p role="status">正在读取预算…</p>
      ) : (
        <>
          {data.totals.length > 0 && (
            <section className="hu-card-alt ledger-budget-card">
              <h3>{filter.month ? "月度汇总" : "年度汇总"}</h3>
              <BudgetTotals totals={data.totals} />
            </section>
          )}
          <section className="hu-card-alt ledger-budget-card">
            <div className="ledger-budget-heading">
              <h3>预算列表</h3>
              <Button disabled={locked || !chosen.length} onClick={() => edit(chosen)}>
                {chosen.length ? `批量编辑（${chosen.length}）` : "批量编辑"}
              </Button>
            </div>
            {data.budgets.length ? (
              <ul className="ledger-budget-list">
                {data.budgets.map((budget) => {
                  const { id, definition: def } = budget;
                  const fixed = def.type === "fixed";
                  return (
                    <li key={id} className="ledger-budget-row" data-testid={`ledger-budget-${id}`}>
                      <div className="ledger-budget-progress">
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.includes(id)}
                            disabled={locked}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setSelected((previous) => (checked ? [...previous, id] : previous.filter((key) => key !== id)));
                            }}
                          />{" "}
                          <strong>{def.name}</strong>
                        </label>
                        <span className="muted small">
                          {budgetKind(def.type, fixed ? def.direction : undefined)} · {fixed ? def.month : def.from && def.to ? `${def.from} 至 ${def.to}` : def.from ? `自 ${def.from}` : def.to ? `至 ${def.to}` : "不限期间"}
                        </span>
                      </div>
                      <BudgetProgress budget={budget} />
                      <div className="ledger-budget-options">
                        <Button aria-label={`查看 ${def.name} 明细`} onClick={() => setDialog({ kind: "detail", budget })}>
                          明细
                        </Button>
                        <FinancialNotesButton book={book} owner={{ kind: "budget", id }} title={def.name} readOnly={readOnly} openResource={openResource} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>所选期间和币种没有预算。</p>
            )}
          </section>
        </>
      )}
      {dialog?.kind === "detail" && <BudgetDetails query={{ ...query, budgetId: dialog.budget.id }} budget={dialog.budget} view={view} readOnly={readOnly} openResource={openResource} close={() => setDialog(undefined)} />}
      {dialog?.kind === "edit" && (
        <BudgetEditor
          view={view}
          budgets={dialog.budgets}
          revision={dialog.revision}
          period={period}
          options={options}
          locked={locked}
          close={() => setDialog(undefined)}
          saved={(count) => {
            setDialog(undefined);
            setSelected([]);
            setNotice(`已保存 ${count} 项预算。`);
          }}
        />
      )}
      {dialog?.kind === "copy" && <BudgetCopy bookId={book.id} revision={dialog.revision} period={period} locked={locked} close={() => setDialog(undefined)} />}
    </section>
  );
}

function BudgetDetails({
  query,
  budget,
  view,
  readOnly,
  openResource,
  close,
}: {
  query: { bookId: string; budgetId: string; year: string; month?: string; currency?: string };
  budget: Progress;
  view: AccountsView;
  readOnly: boolean;
  openResource(path: string): void;
  close(): void;
}) {
  const [page, setPage] = useState(1);
  const caption = useId();
  const done = useRef<HTMLButtonElement>(null);
  const detail = useCapability<BudgetDetail>("ledger.budgets.detail", { ...query, page, pageSize });
  const data = detail.data;
  const latest = data ?? budget;
  const last = Math.min(100_000, Math.max(1, Math.ceil(latest.count / pageSize)));
  const shownPage = Math.min(page, last);
  if (shownPage !== page) setPage(shownPage);
  return (
    <Dialog
      open
      wide
      title={`预算明细 · ${budget.definition.name}`}
      onClose={close}
      error={detail.error?.message}
      initialFocusRef={done}
      actions={
        <>
          <FinancialNotesButton book={view.book} owner={{ kind: "budget", id: budget.id }} title={budget.definition.name} readOnly={readOnly} openResource={openResource} />
          <Button ref={done} onClick={close}>
            完成
          </Button>
        </>
      }
    >
      <div className="hu-stack">
        <BudgetProgress budget={latest} />
        {detail.isPending && <p role="status">正在读取预算明细…</p>}
        {data &&
          (data.rows.length ? (
            <div className="ledger-budget-table" tabIndex={0} role="region" aria-labelledby={caption}>
              <table className="hu-table">
                <caption id={caption}>预算匹配流水</caption>
                <thead>
                  <tr>
                    <th scope="col">事项</th>
                    <th scope="col">业务日期</th>
                    <th scope="col">账户</th>
                    <th scope="col">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(
                    ({ record, title, businessDate }) =>
                      record.type !== "transfer" && (
                        <tr key={record.id}>
                          <th scope="row">{title}</th>
                          <td>
                            <time dateTime={businessDate}>{businessDate}</time>
                          </td>
                          <td>{view.accounts.find(({ id }) => id === record.accountId)?.name ?? "原账户已缺失"}</td>
                          <td>{displayMoney(record.amountMinor, record.currency)}</td>
                        </tr>
                      ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p>该预算没有匹配流水。</p>
          ))}
        <div className="hu-toolbar" aria-label="预算明细分页">
          <Button disabled={shownPage <= 1} onClick={() => setPage(shownPage - 1)}>
            上一页
          </Button>
          <span role="status">
            第 {shownPage} / {last} 页 · 共 {latest.count} 笔
          </span>
          <Button disabled={shownPage >= last} onClick={() => setPage(shownPage + 1)}>
            下一页
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BudgetEditor({
  view,
  budgets,
  revision,
  period,
  options,
  locked,
  close,
  saved,
}: {
  view: AccountsView;
  budgets: Budget[];
  revision: string;
  period: string;
  options: string[];
  locked: boolean;
  close(): void;
  saved(count: number): void;
}) {
  const formId = useId();
  const action = useLedgerAction();
  const drafts = budgets.length ? budgets : [{ id: undefined, definition: undefined }];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const input = SaveBudgets.safeParse({
        bookId: view.book.id,
        expectedRevision: revision,
        budgets: drafts.map(({ id }, index) => {
          const value = (name: string) => fieldValue(form, `${index}-${name}`);
          const chosen = (name: string) => form.getAll(`${index}-${name}`);
          const currency = value("currency");
          const type = value("type");
          const shared = { name: value("name"), currency, type, limitMinor: ledgerDecimalToMinor(value("limit"), currency) };
          const tags = chosen("tag");
          if (type === "free" && !tags.length) throw new Error("自由预算需要至少一个支出标签");
          const definition =
            type === "fixed" ? { ...shared, month: value("month"), direction: value("direction"), categoryIds: chosen("category") } : { ...shared, from: value("from") || undefined, to: value("to") || undefined, tagIds: tags };
          return { id, definition };
        }),
      });
      if (!input.success) {
        action.setError(input.error.issues[0]?.message ?? "请检查预算设置");
        return;
      }
      const result = await action.run<Budget[]>("ledger.budgets.saveBatch", input.data);
      if (result) saved(result.length);
    } catch (failure) {
      action.setError(failure instanceof Error ? failure.message : "请检查预算设置");
    }
  }
  const dismiss = () => {
    if (!action.working) close();
  };
  return (
    <Dialog
      open
      wide
      title={budgets.length ? "批量编辑预算" : "新增预算"}
      onClose={dismiss}
      error={action.error}
      actions={
        <>
          <Button disabled={action.working} onClick={dismiss}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={locked || action.working}>
            保存预算
          </Button>
        </>
      }
    >
      <form id={formId} className="hu-stack" onSubmit={submit}>
        {drafts.map(({ id, definition }, index) => (
          <BudgetFields key={id ?? "new"} definition={definition} index={index} view={view} period={period} options={options} />
        ))}
      </form>
    </Dialog>
  );
}

function BudgetFields({ definition, index, period, options, view }: { definition: Budget["definition"] | undefined; index: number; period: string; options: string[]; view: AccountsView }) {
  const [type, setType] = useState(definition?.type ?? "fixed");
  const field = (name: string) => `${index}-${name}`;
  const fixed = definition?.type === "fixed" ? definition : undefined;
  const free = definition?.type === "free" ? definition : undefined;
  const dimensionFields = (kind: "category" | "tag", selected: string[]) => {
    const items = view.dictionary.filter((entry) => entry.kind === kind && (entry.status === "active" || selected.includes(entry.id)));
    return items.length ? (
      items.map(({ id, name, status }) => (
        <label key={id}>
          <input type="checkbox" name={field(kind)} value={id} defaultChecked={selected.includes(id)} /> {name}
          {status === "archived" && "（已归档）"}
        </label>
      ))
    ) : (
      <span className="muted">{kind === "category" ? "暂无分类" : "请先在「账户」中新增标签"}</span>
    );
  };
  return (
    <fieldset className="ledger-budget-fields">
      <legend>{definition?.name ?? "预算规则"}</legend>
      <div className="ledger-budget-fields-grid">
        <LedgerField label="预算名称">
          <input name={field("name")} required maxLength={100} defaultValue={definition?.name} />
        </LedgerField>
        <LedgerField label="预算类型">
          <Select name={field("type")} value={type} onChange={(event) => setType(event.currentTarget.value === "free" ? "free" : "fixed")}>
            <option value="fixed">固定预算</option>
            <option value="free">自由预算</option>
          </Select>
        </LedgerField>
        <LedgerField label="币种">
          <Select name={field("currency")} defaultValue={definition?.currency ?? view.book.defaultCurrency}>
            {options.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </Select>
        </LedgerField>
        <LedgerField label="预算额度">
          <input name={field("limit")} inputMode="decimal" required defaultValue={definition && ledgerMinorToDecimal(definition.limitMinor, definition.currency)} />
        </LedgerField>
      </div>
      <fieldset disabled={type !== "fixed"} hidden={type !== "fixed"}>
        <legend>固定预算范围</legend>
        <div className="ledger-budget-fields-grid">
          <LedgerField label="预算所属月份">
            <input name={field("month")} required pattern={monthPattern} defaultValue={fixed?.month ?? period} />
          </LedgerField>
          <LedgerField label="收支方向">
            <Select name={field("direction")} defaultValue={fixed?.direction ?? "expense"}>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </Select>
          </LedgerField>
        </div>
        <fieldset className="ledger-budget-fields">
          <legend>匹配分类（留空匹配全部）</legend>
          <div className="ledger-budget-options">{dimensionFields("category", fixed?.categoryIds ?? [])}</div>
        </fieldset>
      </fieldset>
      <fieldset disabled={type !== "free"} hidden={type !== "free"}>
        <legend>自由预算范围</legend>
        <div className="ledger-budget-fields-grid">
          <LedgerField label="开始日期">
            <input name={field("from")} type="date" defaultValue={free?.from} />
          </LedgerField>
          <LedgerField label="结束日期">
            <input name={field("to")} type="date" defaultValue={free?.to} />
          </LedgerField>
        </div>
        <fieldset className="ledger-budget-fields">
          <legend>至少选择一个支出标签</legend>
          <div className="ledger-budget-options">{dimensionFields("tag", free?.tagIds ?? [])}</div>
        </fieldset>
      </fieldset>
    </fieldset>
  );
}

function nextMonth(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const monthIndex = month - 1 + offset;
  return `${String(year + Math.floor(monthIndex / 12)).padStart(4, "0")}-${months[monthIndex % 12]}`;
}

function BudgetCopy({ bookId, revision, period, locked, close }: { bookId: string; revision: string; period: string; locked: boolean; close(): void }) {
  const formId = useId();
  const action = useLedgerAction();
  const [targets, setTargets] = useState(1);
  const [result, setResult] = useState<CopyBudgetResult>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const destinations = form.getAll("target").map(String);
    if (new Set(destinations).size !== destinations.length) {
      action.setError("目标月份不能重复");
      return;
    }
    const reply = await action.run<CopyBudgetResult>("ledger.budgets.copy", {
      bookId,
      expectedRevision: revision,
      source: fieldValue(form, "source"),
      targets: destinations,
    });
    if (reply) setResult(reply);
  }
  const dismiss = () => {
    if (!action.working) close();
  };
  return (
    <Dialog
      open
      title="跨月复制固定预算"
      onClose={dismiss}
      error={action.error}
      actions={
        <>
          <Button disabled={action.working} onClick={dismiss}>
            {result ? "完成" : "取消"}
          </Button>
          {!result && (
            <Button type="submit" form={formId} variant="primary" disabled={locked || action.working}>
              确认复制
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <div role="status" className="hu-stack">
          {result.created || result.skipped.length ? (
            <p>
              已复制 {result.created} 项 · 跳过 {result.skipped.length} 项同名预算
            </p>
          ) : (
            <p>所选来源月没有固定预算。</p>
          )}
          {!!result.skipped.length && (
            <ul>
              {result.skipped.map(({ month, name, existingId }) => (
                <li key={existingId}>
                  {month} · {name}（保留已有规则）
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form id={formId} className="hu-stack" onSubmit={submit}>
          <LedgerField label="源月份">
            <input name="source" required pattern={monthPattern} defaultValue={period} />
          </LedgerField>
          {Array.from({ length: targets }, (_, index) => (
            <LedgerField key={index} label={index ? `目标月份 ${index + 1}` : "目标月份"}>
              <input name="target" required pattern={monthPattern} defaultValue={nextMonth(period, index + 1)} />
            </LedgerField>
          ))}
          <div>
            <Button disabled={targets >= 120} onClick={() => setTargets(targets + 1)}>
              添加目标月
            </Button>
          </div>
          <p className="muted">跳过目标月份同名的固定预算，保留已有规则。</p>
        </form>
      )}
    </Dialog>
  );
}
