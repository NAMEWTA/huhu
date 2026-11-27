import { Button } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import type { z } from "zod";
import type { Book } from "../shared/books.js";
import type { OverviewActivity } from "../shared/overview.js";
import { BudgetTotals } from "./Budgets.js";

export type CycleTarget = "fixed" | "loan";

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
