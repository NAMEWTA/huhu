/** 月历：周一为一周的第一天，固定 6 行 × 7 列；日期都是 YYYY-MM-DD，纯 UTC 日历运算（与进程时区无关）。 */
export interface CalendarCell {
  date: string;
  inMonth: boolean;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** month: 1–12。 */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // 周一 = 0
  const start = Date.UTC(year, month - 1, 1 - offset);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start + (w * 7 + d) * 86_400_000);
      return { date: ymd(day), inMonth: day.getUTCMonth() === month - 1 };
    }),
  );
}

/** "YYYY-MM" 加减月份。 */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 按 due 把任务投影到日期格：date → 任务。无截止日的任务不出现。 */
export function groupByDue<T extends { due: string | null }>(tasks: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of tasks) if (t.due) m.set(t.due, [...(m.get(t.due) ?? []), t]);
  return m;
}
