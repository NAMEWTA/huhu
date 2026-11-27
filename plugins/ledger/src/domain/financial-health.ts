import type { ReportView } from "../shared/reports.js";

type Charts = NonNullable<ReportView["series"][number]["charts"]>;
type Metric = Charts["health"][number];

// HomiBook financial-health.ts and StatsTimeView.tsx breakpoints, with exact integer ratios.
type Band = [basisPoints: bigint, score: bigint];
function score(value: bigint, denominator: bigint, bands: Band[]) {
  if (denominator <= 0n) return null;
  const scaled = value * 10_000n;
  for (let i = 1; i < bands.length; i++) {
    const [upper, high] = bands[i]!;
    if (scaled > upper * denominator) continue;
    const [lower, low] = bands[i - 1]!;
    const width = (upper - lower) * denominator;
    const position = scaled < lower * denominator ? 0n : scaled - lower * denominator;
    return Number((low * width + (high - low) * position + width / 2n) / width);
  }
  return Number(bands.at(-1)![1]);
}

export const scoreSavings = (income: bigint, expense: bigint) =>
  score(income - expense, income, [
    [0n, 20n],
    [1000n, 40n],
    [2000n, 60n],
    [3000n, 80n],
    [5000n, 100n],
  ]);

export function financialHealth(input: {
  income: bigint;
  expense: bigint;
  months: bigint;
  liquid: bigint;
  assets: bigint;
  liabilities: bigint;
  investment: bigint;
  monthlyPayment: bigint;
  passiveIncome: bigint;
  insurance: bigint;
  budgetActual: bigint;
  budgetLimit: bigint;
}): Pick<Charts, "health" | "periodHealth"> {
  const { income, expense, months, liquid, assets, liabilities, investment, monthlyPayment, passiveIncome, insurance, budgetActual, budgetLimit } = input;
  const metric = (label: string, rule: string, value: number | null): Metric => ({ label, rule, score: income > 0n ? value : null });
  const debt = metric(
    "偿债压力",
    "月供 ÷ 期间月均收入，比例越低分数越高",
    score(monthlyPayment * months, income, [
      [0n, 100n],
      [3500n, 90n],
      [5000n, 60n],
      [10000n, 20n],
    ]),
  );
  const savings = metric("储蓄能力", "（收入 − 支出）÷ 收入", scoreSavings(income, expense));
  const freedom = metric(
    "财务自由度",
    "投资收益及分红 ÷ 支出",
    score(passiveIncome, expense, [
      [0n, 20n],
      [2000n, 40n],
      [5000n, 60n],
      [10000n, 100n],
    ]),
  );
  return {
    health: [
      metric(
        "应急能力",
        "期末现金、银行存款及钱包余额 ÷ 期间月均支出",
        score(liquid * months, expense, [
          [0n, 20n],
          [30000n, 50n],
          [60000n, 80n],
          [120000n, 100n],
        ]),
      ),
      debt,
      metric(
        "杠杆水平",
        "期末负债 ÷ 期末资产，比例越低分数越高",
        score(liabilities, assets, [
          [0n, 100n],
          [5000n, 90n],
          [7000n, 60n],
          [10000n, 20n],
        ]),
      ),
      savings,
      metric(
        "投资积累",
        "期末投资账户余额 ÷ 期末净资产",
        score(investment, assets - liabilities, [
          [0n, 20n],
          [2000n, 50n],
          [5000n, 80n],
          [8000n, 100n],
        ]),
      ),
      freedom,
      metric(
        "保障充足度",
        "保险分类支出 ÷ 收入",
        score(insurance, income, [
          [0n, 20n],
          [300n, 50n],
          [500n, 80n],
          [1000n, 100n],
          [1500n, 90n],
          [2000n, 60n],
          [3000n, 20n],
        ]),
      ),
    ],
    periodHealth: [
      savings,
      metric(
        "收支平衡",
        "收入 ÷ 支出，收支持平及无支出时为满分",
        expense === 0n
          ? 100
          : score(income, expense, [
              [0n, 0n],
              [10000n, 100n],
            ]),
      ),
      metric(
        "预算执行",
        "固定支出预算未超支为满分，按超支比例扣分",
        score(budgetActual, budgetLimit, [
          [10000n, 100n],
          [20000n, 0n],
        ]),
      ),
      debt,
      freedom,
    ],
  };
}
