import { Button } from "@huhu/ui";
import type { RecordFilters } from "../shared/entries.js";
import type { ReportView } from "../shared/reports.js";
import { LedgerChart, ReportTable } from "./LedgerChart.js";
import { displayMoney } from "./primitives.js";
import { cartesianOption, pieOption, radarOption, type ChartTheme } from "./report-chart-options.js";

type Flow = ReportView["series"][number];
type Charts = NonNullable<Flow["charts"]>;
export type OpenDrill = (title: string, filters: RecordFilters) => void;
type Period = { from: string; to: string };
type Category = { id: string | null; label: string; amountMinor: string };
type CategoryPeriod = Period & { categories: Category[] };

export const categoryFilter = (id: string | null): RecordFilters => (id ? { categoryId: id } : { uncategorized: true });
const periodLabel = ({ from, to }: Period) => (from === to ? from : from.slice(0, 7));
const periodRange = ({ from, to }: Period) => ({ from, to });

export function DistributionChart<T extends { label: string; amountMinor: string }>({ id, title, currency, entries, open }: { id: string; title: string; currency: string; entries: T[]; open(entry: T): void }) {
  if (!entries.length) return null;
  return (
    <div className="ledger-chart-section">
      <h4>{title}</h4>
      <LedgerChart
        id={id}
        build={(theme) =>
          pieOption(
            theme,
            currency,
            entries.map(({ label: name, amountMinor }) => ({ name, amountMinor })),
          )
        }
        onSelect={({ dataIndex }) => {
          const entry = entries[dataIndex];
          if (entry) open(entry);
        }}
      />
      <details>
        <summary>{title}数据</summary>
        <ReportTable title={title}>
          <thead>
            <tr>
              <th scope="col">项目</th>
              <th scope="col">金额</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={index}>
                <th scope="row">
                  <Button variant="ghost" onClick={() => open(entry)}>
                    {entry.label}
                  </Button>
                </th>
                <td>{displayMoney(entry.amountMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </details>
    </div>
  );
}

export function CategoryTrend({ id, currency, categories, periods, open }: { id: string; currency: string; categories: Category[]; periods: CategoryPeriod[]; open(category: Category, period: Period): void }) {
  if (!categories.length) return null;
  const keys = periods.map(periodLabel);
  const indexed = periods.map(({ categories }) => new Map(categories.map((row) => [row.id, row.amountMinor])));
  const series = categories.map(({ id, label: name }) => ({ name, amounts: indexed.map((period) => period.get(id) ?? "0") }));
  return (
    <div className="ledger-chart-section">
      <LedgerChart
        id={id}
        build={(theme) => cartesianOption(theme, currency, keys, series, "bar")}
        onSelect={({ dataIndex, seriesIndex }) => {
          const category = categories[seriesIndex];
          const period = periods[dataIndex];
          if (category && period && indexed[dataIndex]?.has(category.id)) open(category, period);
        }}
      />
      <details>
        <summary>分类趋势数据</summary>
        <ReportTable title="分类趋势数据">
          <thead>
            <tr>
              <th scope="col">期间</th>
              <th scope="col">分类</th>
              <th scope="col">金额</th>
            </tr>
          </thead>
          <tbody>
            {periods.flatMap((period, index) =>
              period.categories.map((category) => (
                <tr key={`${period.from}:${category.id}`}>
                  <th scope="row">{keys[index]}</th>
                  <td>
                    <Button variant="ghost" onClick={() => open(category, period)}>
                      {category.label}
                    </Button>
                  </td>
                  <td>{displayMoney(category.amountMinor, currency)}</td>
                </tr>
              )),
            )}
          </tbody>
        </ReportTable>
      </details>
    </div>
  );
}

export function MonthlyTrend({ id, currency, months, open, compact = false }: { id: string; currency: string; months: Charts["months"]; open: OpenDrill; compact?: boolean }) {
  const columns = [
    { name: "收入", kind: "income", amounts: months.map(({ incomeMinor }) => incomeMinor) },
    { name: "支出", kind: "expense", amounts: months.map(({ expenseMinor }) => expenseMinor) },
    ...(!compact ? [{ name: "结余", kind: undefined, amounts: months.map(({ incomeMinor, expenseMinor }) => (BigInt(incomeMinor) - BigInt(expenseMinor)).toString()) }] : []),
  ] as const;
  const labels = months.map(({ from }) => from.slice(0, 7));
  const drill = (index: number, column: number) => {
    const period = months[index];
    const item = columns[column];
    if (period && item) open(`${labels[index]} ${item.name}明细`, { ...periodRange(period), ...(item.kind && { type: item.kind }) });
  };
  const build = (theme: ChartTheme) =>
    cartesianOption(
      theme,
      currency,
      labels,
      columns.map((column, index) => ({
        ...column,
        color: [theme.income, theme.expense, theme.accent][index]!,
        area: compact,
        dashed: index === 2,
      })),
      compact ? "overview" : "line",
    );
  return (
    <div className="ledger-chart-section">
      <LedgerChart id={id} compact={compact} build={build} onSelect={({ dataIndex, seriesIndex }) => drill(dataIndex, seriesIndex)} />
      <details>
        <summary>月度趋势数据</summary>
        <ReportTable title="月度趋势数据">
          <thead>
            <tr>
              <th scope="col">月份</th>
              {columns.map(({ name }) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map(({ from }, index) => (
              <tr key={from}>
                <th scope="row">{labels[index]}</th>
                {columns.map(({ name, amounts }, column) => (
                  <td key={name}>
                    <Button variant="ghost" aria-label={`${labels[index]} ${name} ${displayMoney(amounts[index]!, currency)}`} onClick={() => drill(index, column)}>
                      {displayMoney(amounts[index]!, currency)}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </details>
    </div>
  );
}

export function BalanceCharts({ currency, charts, open }: { currency: string; charts: Charts; open: OpenDrill }) {
  const dates = charts.netWorth.map(({ date }) => date);
  const accounts = charts.accounts;
  const drill = (index: number, accountIndex?: number) => {
    const period = charts.periods[index];
    const account = accountIndex === undefined ? undefined : accounts[accountIndex];
    if (period) open(`${periodLabel(period)} ${account?.label ?? "净资产"}期间流水`, { ...periodRange(period), ...(account && { accountId: account.id }) });
  };
  return (
    <div className="ledger-chart-grid">
      <section className="ledger-chart-section">
        <h4>账户余额变化</h4>
        <LedgerChart
          id="account-balances"
          build={(theme) =>
            cartesianOption(
              theme,
              currency,
              dates,
              accounts.map(({ label: name, points }) => ({ name, amounts: points.map(({ amountMinor }) => amountMinor) })),
              "line",
            )
          }
          onSelect={({ dataIndex, seriesIndex }) => drill(dataIndex, seriesIndex)}
        />
        <details>
          <summary>账户余额曲线数据</summary>
          <ReportTable title="账户余额曲线数据">
            <thead>
              <tr>
                <th scope="col">时点</th>
                {accounts.map(({ id, label }) => (
                  <th scope="col" key={id}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, index) => (
                <tr key={date}>
                  <th scope="row">{date}</th>
                  {accounts.map(({ id, label, points }, account) => (
                    <td key={id}>
                      <Button variant="ghost" aria-label={`${date} ${label} ${displayMoney(points[index]!.amountMinor, currency)}`} onClick={() => drill(index, account)}>
                        {displayMoney(points[index]!.amountMinor, currency)}
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </details>
      </section>
      <section className="ledger-chart-section">
        <h4>资产净值趋势</h4>
        <LedgerChart
          id="net-worth"
          build={(theme) => cartesianOption(theme, currency, dates, [{ name: "资产净值", amounts: charts.netWorth.map(({ amountMinor }) => amountMinor), color: theme.accent, area: true }], "line")}
          onSelect={({ dataIndex }) => drill(dataIndex)}
        />
        <details>
          <summary>资产净值曲线数据</summary>
          <ReportTable title="资产净值曲线数据">
            <thead>
              <tr>
                <th scope="col">时点</th>
                <th scope="col">资产</th>
                <th scope="col">负债</th>
                <th scope="col">净资产</th>
              </tr>
            </thead>
            <tbody>
              {charts.netWorth.map(({ date, assetsMinor, liabilitiesMinor, amountMinor }, index) => (
                <tr key={date}>
                  <th scope="row">
                    <Button variant="ghost" onClick={() => drill(index)}>
                      {date}
                    </Button>
                  </th>
                  <td>{displayMoney(assetsMinor, currency)}</td>
                  <td>{displayMoney(liabilitiesMinor, currency)}</td>
                  <td>{displayMoney(amountMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        </details>
      </section>
    </div>
  );
}

export function HealthChart({ id, title, metrics }: { id: string; title: string; metrics: Charts["health"] }) {
  const available = metrics.filter(({ score }) => score !== null).length;
  return (
    <section className="ledger-chart-section">
      <h4>{title}</h4>
      {available === 0 && <p>数据不足</p>}
      {available >= 3 && <LedgerChart id={id} build={(theme) => radarOption(theme, metrics)} />}
      <details open={available > 0}>
        <summary>{title}评分依据</summary>
        <ReportTable title={title}>
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">得分</th>
              <th scope="col">规则</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ label, score, rule }) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{score === null ? "数据不足" : `${score} / 100`}</td>
                <td>{rule}</td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </details>
    </section>
  );
}
