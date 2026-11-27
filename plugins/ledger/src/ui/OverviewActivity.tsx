import { Button } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import type { z } from "zod";
import type { Book } from "../shared/books.js";
import type { OverviewActivity } from "../shared/overview.js";
import { shiftMonth, type ReportView } from "../shared/reports.js";
import { BudgetTotals } from "./Budgets.js";
import { DistributionChart, MonthlyTrend, categoryFilter, type OpenDrill } from "./ReportCharts.js";
import { RecordDrill, type Drill } from "./Reports.js";

export type CycleTarget = "fixed" | "loan";

export function OverviewReportCharts({ book, today }: { book: Book; today: string }) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const month = today.slice(0, 7);
  const from = shiftMonth(month, -5) + "-01";
  const result = useCapability<ReportView>("ledger.reports.query", { bookId: book.id, from, to: today, chartDetail: true });
  if (result.isPending) return <p role="status">正在读取近六个月的报表…</p>;
  if (result.isError) return <p role="alert">{result.error.message}</p>;
  const series = result.data.series.filter(({ count }) => count > 0);
  if (!series.length) return <p>近六个月暂无流水。</p>;
  return (
    <>
      {series.map(({ currency, charts }) => {
        if (!charts) return null;
        const latest = charts.periods.at(-1);
        const open: OpenDrill = (title, filters) => setDrill({ title, filters: { ...filters, currency, offset: false } });
        return (
          <section key={currency} className="ledger-chart-grid" aria-label={currency + " 总览图表"}>
            <div className="ledger-chart-section">
              <h4>近六个月收支趋势 · {currency}</h4>
              <MonthlyTrend id="overview-trend" currency={currency} months={charts.months} open={open} compact />
            </div>
            <DistributionChart
              id="overview-spending"
              title={`本月支出分类 · ${currency}`}
              currency={currency}
              entries={latest?.categories.filter(({ kind }) => kind === "expense") ?? []}
              open={(category) => open(category.label, { from: month + "-01", to: today, type: "expense", ...categoryFilter(category.id) })}
            />
          </section>
        );
      })}
      {drill && <RecordDrill book={book} drill={drill} close={() => setDrill(null)} />}
    </>
  );
}

export function OverviewActivityCards({ book, openBudgets, openCycles }: { book: Book; openBudgets(): void; openCycles(target: CycleTarget): void }) {
  const query = useCapability<z.infer<typeof OverviewActivity>>("ledger.overview.activity", { bookId: book.id });
  if (query.isPending) return <p role="status">正在读取预算和期次…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const { budgetTotals, recurring, loans } = query.data;
  const next = recurring.nextAt;
  const nextLabel =
    next &&
    new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: book.timeZone,
    }).format(new Date(next));

  return (
    <div className="ledger-activity-cards">
      <article className="hu-card-alt ledger-activity-card">
        <h3>当月预算</h3>
        {budgetTotals.length ? <BudgetTotals totals={budgetTotals} /> : <p>本月暂无预算。</p>}
        <div>
          <Button onClick={openBudgets}>查看本月预算</Button>
        </div>
      </article>
      <article className="hu-card-alt ledger-activity-card">
        <h3>固定收支下一期</h3>
        {next ? (
          <p>
            <time dateTime={next}>{nextLabel}</time> <span className="muted">{book.timeZone}</span>
          </p>
        ) : (
          <p>暂无已排定的下一期。</p>
        )}
        {(recurring.rules > 0 || recurring.failedPeriods > 0) && (
          <p className="muted">
            {recurring.enabled} 项启用 · {recurring.failedPeriods} 期需处理
          </p>
        )}
        <div>
          <Button onClick={() => openCycles("fixed")}>查看固定收支</Button>
        </div>
      </article>
      <article className="hu-card-alt ledger-activity-card">
        <h3>贷款补记</h3>
        {loans.count ? (
          <p>
            {loans.count} 项贷款 · 已补记 {loans.generated} / {loans.installments} 期
          </p>
        ) : (
          <p>暂无贷款。</p>
        )}
        <div>
          <Button onClick={() => openCycles("loan")}>查看贷款补记</Button>
        </div>
      </article>
    </div>
  );
}
