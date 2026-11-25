import { ledgerBusinessDate } from "@huhu/contracts";
import { Button, Dialog, Select } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useId, useState, type ReactNode } from "react";
import type { Book } from "../shared/books.js";
import type { RecordFilters, RecordsPage } from "../shared/entries.js";
import { calendarMonth, HolidayData, ReportQuery, type ReportView } from "../shared/reports.js";
import { PeriodReview } from "./FinancialNotes.js";
import { displayMoney, LedgerField, useLedgerAction } from "./primitives.js";

type Currency = ReportView["currencies"][number];
type Flow = ReportView["series"][number];
type Filter = { currency: Currency; includeOffset: boolean };
type Drill = { title: string; filters: RecordFilters };
const day = 86_400_000;

function useScope(book: Book) {
  const today = ledgerBusinessDate(new Date().toISOString(), book.timeZone);
  const [scope, setScope] = useState<Filter>({ currency: book.defaultCurrency, includeOffset: false });
  return { today, scope, setScope };
}

function ScopeFields({ scope, setScope, currencies }: { scope: Filter; setScope(scope: Filter): void; currencies: Currency[] }) {
  return (
    <>
      <LedgerField label="报表币种">
        <Select
          value={scope.currency}
          onChange={(event) => {
            const currency = currencies.find((value) => value === event.currentTarget.value);
            if (currency) setScope({ ...scope, currency });
          }}
        >
          {currencies.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </LedgerField>
      <label>
        <input type="checkbox" checked={scope.includeOffset} onChange={(event) => setScope({ ...scope, includeOffset: event.currentTarget.checked })} /> 包含已平账流水
      </label>
    </>
  );
}

function ReportTable({ title, children }: { title: string; children: ReactNode }) {
  const caption = useId();
  return (
    <div className="hu-data-table-scroll" role="region" aria-labelledby={caption} tabIndex={0}>
      <table className="hu-table">
        <caption id={caption}>{title}</caption>
        {children}
      </table>
    </div>
  );
}

function RecordDrill({ book, drill, close }: { book: Book; drill: Drill; close(): void }) {
  const [page, setPage] = useState(1);
  const data = useCapability<RecordsPage>("ledger.records.list", { bookId: book.id, filters: drill.filters, page });
  return (
    <Dialog open title={drill.title} wide onClose={close}>
      {data.isPending ? <p role="status">正在读取明细…</p> : null}
      {data.error ? <p role="alert">{data.error.message}</p> : null}
      {data.data ? (
        <>
          <p role="status">{data.data.total} 笔</p>
          <ReportTable title={drill.title}>
            <thead>
              <tr>
                <th scope="col">业务日期</th>
                <th scope="col">事项</th>
                <th scope="col">金额</th>
              </tr>
            </thead>
            <tbody>
              {data.data.rows.map(({ businessDate, title, record }) => (
                <tr key={record.id}>
                  <td>{businessDate}</td>
                  <th scope="row">{title}</th>
                  <td>{record.type === "transfer" ? `${displayMoney(record.fromAmountMinor, record.fromCurrency)} → ${displayMoney(record.toAmountMinor, record.toCurrency)}` : displayMoney(record.amountMinor, record.currency)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
          {data.data.total > data.data.pageSize ? (
            <nav className="hu-toolbar" aria-label="流水明细分页">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button disabled={page * data.data.pageSize >= data.data.total} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}

function MoneySummary({ row }: { row: Flow }) {
  return (
    <dl className="hu-toolbar" aria-label="期间汇总">
      <div>
        <dt>期间收入</dt>
        <dd>{displayMoney(row.incomeMinor, row.currency)}</dd>
      </div>
      <div>
        <dt>期间支出</dt>
        <dd>{displayMoney(row.expenseMinor, row.currency)}</dd>
      </div>
      <div>
        <dt>期间净收入</dt>
        <dd>{displayMoney((BigInt(row.incomeMinor) - BigInt(row.expenseMinor)).toString(), row.currency)}</dd>
      </div>
    </dl>
  );
}

export function LedgerReports({ book, readOnly, openResource }: { book: Book; readOnly: boolean; openResource(path: string): void }) {
  const { today, scope, setScope } = useScope(book);
  const [dates, setDates] = useState({ from: today.slice(0, 7) + "-01", to: today });
  const [drill, setDrill] = useState<Drill | null>(null);
  const [review, setReview] = useState(false);
  const input = { bookId: book.id, ...dates, ...scope };
  const valid = ReportQuery.safeParse(input).success;
  const result = useCapability<ReportView>("ledger.reports.query", input, { enabled: valid });
  const row = result.data?.series[0];
  const currencies = result.data?.currencies ?? [scope.currency];
  const filters: RecordFilters = { ...dates, currency: scope.currency, ...(!scope.includeOffset && { offset: false }) };
  const open = (title: string, extra: RecordFilters = {}) => setDrill({ title, filters: { ...filters, ...extra } });
  const top = row?.categories.reduce((maximum, { amountMinor }) => (BigInt(amountMinor) > maximum ? BigInt(amountMinor) : maximum), 1n) ?? 1n;
  return (
    <section className="hu-stack" aria-label="账本报表">
      <div className="hu-toolbar">
        <h2>账本报表</h2>
        <Button onClick={() => setReview(true)}>期间复盘</Button>
      </div>
      <p>业务时区 {book.timeZone}</p>
      {review && <PeriodReview book={book} readOnly={readOnly} initial={{ ...dates, ...scope }} currencies={currencies}
        close={() => setReview(false)} openResource={openResource} />}
      <search aria-label="筛选报表" className="hu-toolbar">
        <LedgerField label="开始日期">
          <input type="date" value={dates.from} onChange={(event) => setDates({ ...dates, from: event.currentTarget.value })} />
        </LedgerField>
        <LedgerField label="结束日期">
          <input type="date" value={dates.to} onChange={(event) => setDates({ ...dates, to: event.currentTarget.value })} />
        </LedgerField>
        <ScopeFields scope={scope} setScope={setScope} currencies={currencies} />
        <Button onClick={() => setDates({ from: today.slice(0, 7) + "-01", to: today })}>本月</Button>
      </search>
      {!valid ? <p role="alert">请选择顺序正确且不超过 366 天的期间。</p> : null}
      {valid && result.isPending ? <p role="status">正在计算报表…</p> : null}
      {result.error ? <p role="alert">{result.error.message}</p> : null}
      {row ? (
        <>
          <MoneySummary row={row} />
          {row.count ? (
            <>
              <div className="hu-toolbar">
                <Button onClick={() => open("收入明细", { type: "income" })}>查看收入明细</Button>
                <Button onClick={() => open("支出明细", { type: "expense" })}>查看支出明细</Button>
                <Button onClick={() => open("转账明细", { type: "transfer" })}>查看转账明细</Button>
              </div>
              <details open>
                <summary>收支趋势</summary>
                <ReportTable title="有流水的业务日期">
                  <thead>
                    <tr>
                      <th scope="col">日期</th>
                      <th scope="col">收入</th>
                      <th scope="col">支出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.days.map((entry) => (
                      <tr key={entry.date}>
                        <th scope="row">
                          <Button variant="ghost" onClick={() => open(`${entry.date} 流水`, { from: entry.date, to: entry.date })}>
                            {entry.date}
                          </Button>
                        </th>
                        <td>{displayMoney(entry.incomeMinor, row.currency)}</td>
                        <td>{displayMoney(entry.expenseMinor, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
              </details>
              {row.categories.length ? (
                <details open>
                  <summary>分类分布</summary>
                  <ul>
                    {row.categories.map((category) => (
                      <li key={`${category.kind}:${category.id}`}>
                        <Button variant="ghost" onClick={() => open(category.label, { type: category.kind, ...(category.id ? { categoryId: category.id } : { uncategorized: true }) })}>
                          {category.label}
                        </Button>{" "}
                        {category.kind === "income" ? "收入" : "支出"} · {displayMoney(category.amountMinor, row.currency)}{" "}
                        <meter max={100} value={Number((BigInt(category.amountMinor) * 10_000n) / top) / 100} aria-label={`${category.label}金额相对最大分类的比例`} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <p role="status">所选期间没有流水。</p>
          )}
          <details open>
            <summary>账户分布与余额</summary>
            <ReportTable title="期末账户余额">
              <thead>
                <tr>
                  <th scope="col">账户</th>
                  <th scope="col">期间流水</th>
                  <th scope="col">余额</th>
                </tr>
              </thead>
              <tbody>
                {row.accounts.map((account) => (
                  <tr key={account.id}>
                    <th scope="row">
                      <Button variant="ghost" onClick={() => open(account.label, { accountId: account.id })}>
                        {account.label}
                      </Button>
                    </th>
                    <td>{account.count} 笔</td>
                    <td>{displayMoney(account.balanceMinor, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
            <dl>
              {row.balance.map(({ date, amountMinor }) => (
                <div key={date}>
                  <dt>{date} 净资产</dt>
                  <dd>{displayMoney(amountMinor, row.currency)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <p>储蓄能力 {row.savingsScore === null ? "数据不足" : `${row.savingsScore} / 100`}</p>
        </>
      ) : null}
      {drill ? <RecordDrill book={book} drill={drill} close={() => setDrill(null)} /> : null}
    </section>
  );
}

export function LedgerCalendar({ book, readOnly }: { book: Book; readOnly: boolean }) {
  const { today, scope, setScope } = useScope(book);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [drill, setDrill] = useState<Drill | null>(null);
  const [feedback, setFeedback] = useState("");
  const action = useLedgerAction();
  const dates = calendarMonth(month);
  const year = month.slice(0, 4);
  const holiday = useCapability<HolidayData | null>("ledger.calendar.holidays", { bookId: book.id, year });
  const report = useCapability<ReportView>("ledger.reports.query", { bookId: book.id, ...dates, ...scope });
  const days = new Map(report.data?.series[0]?.days.map((row) => [row.date, row]));
  const holidays = new Map(holiday.data?.entries.map((row) => [row.date, row]));
  const first = Date.parse(dates.from);
  const before = (new Date(first).getUTCDay() + 6) % 7;
  const count = Number(dates.to.slice(-2));
  const cells = Array.from({ length: Math.ceil((before + count) / 7) * 7 }, (_, i) => (i < before || i >= before + count ? null : new Date(first + (i - before) * day).toISOString().slice(0, 10)));

  function step(delta: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
    setFeedback("");
  }
  async function importHolidays(file: File) {
    setFeedback("");
    try {
      if (file.size > 512_000) throw new Error("节假日年份文件最多 512 KB");
      const data = HolidayData.parse(JSON.parse(await file.text()));
      if (data.year !== year) throw new Error(`请选择 ${year} 年的节假日文件`);
      if (await action.run("ledger.calendar.importHolidays", { bookId: book.id, expectedRevision: book.revision, data })) setFeedback(`${year} 年节假日已保存`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "无法读取节假日文件");
    }
  }

  return (
    <section className="hu-stack" aria-label="账本日历">
      <h2>账本日历</h2>
      <div className="hu-toolbar">
        <Button onClick={() => step(-1)}>上个月</Button>
        <strong>
          {month} · {book.timeZone}
        </strong>
        <Button onClick={() => step(1)}>下个月</Button>
        <Button
          onClick={() => {
            setMonth(today.slice(0, 7));
            setFeedback("");
          }}
        >
          本月
        </Button>
        <ScopeFields scope={scope} setScope={setScope} currencies={report.data?.currencies ?? [scope.currency]} />
      </div>
      {report.error || holiday.error || action.error ? <p role="alert">{report.error?.message ?? holiday.error?.message ?? action.error}</p> : null}
      {holiday.isPending ? <p role="status">正在读取节假日…</p> : null}
      {holiday.data === null ? <p role="status">{year} 年节假日未配置</p> : null}
      {holiday.data ? (
        <p>
          {year} 年节假日 · {holiday.data.source}
        </p>
      ) : null}
      {!readOnly && book.status === "active" ? (
        <LedgerField label="导入离线节假日 JSON">
          <input
            type="file"
            accept=".json,application/json"
            disabled={action.working}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importHolidays(file);
            }}
          />
        </LedgerField>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      <ReportTable title={month + " 业务日历"}>
        <thead>
          <tr>
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((value) => (
              <th key={value} scope="col">
                {value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, i) => (
            <tr key={i}>
              {cells.slice(i * 7, i * 7 + 7).map((date, column) => {
                const activity = date ? days.get(date) : undefined;
                const marking = date ? holidays.get(date) : undefined;
                return (
                  <td key={date ?? column}>
                    {date ? (
                      <>
                        <Button
                          variant="ghost"
                          aria-label={date}
                          onClick={() =>
                            setDrill({
                              title: `${date} 流水`,
                              filters: { from: date, to: date, currency: scope.currency, ...(!scope.includeOffset && { offset: false }) },
                            })
                          }
                        >
                          {Number(date.slice(-2))}
                        </Button>
                        {marking ? (
                          <small>
                            {marking.name}
                            {marking.isWorkday ? " · 工作日" : ""}
                          </small>
                        ) : null}
                        {activity ? <p>{activity.count} 笔</p> : null}
                      </>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </ReportTable>
      {drill ? <RecordDrill book={book} drill={drill} close={() => setDrill(null)} /> : null}
    </section>
  );
}
