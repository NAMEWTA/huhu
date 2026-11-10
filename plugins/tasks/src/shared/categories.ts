import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export type TaskCategory = "all" | "today" | "tomorrow" | "week" | "ended";

/** 以给定时区计算"今天"（YYYY-MM-DD）。 */
export function todayIn(zone: string, now: Date = new Date()): string {
  return format(new TZDate(now, zone), "yyyy-MM-dd");
}

function plusDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return format(addDays(new Date(Date.UTC(y, m - 1, d, 12)), n), "yyyy-MM-dd");
}

export interface CategorizableTask {
  due: string | null;
  completed: boolean;
}

/** 分类判定（modules/tasks.md §5）：today=due==T；tomorrow=T+1；week=T≤due≤T+6；ended=已完成；all=全部。 */
export function inCategory(task: CategorizableTask, category: TaskCategory, today: string): boolean {
  switch (category) {
    case "all":
      return true;
    case "ended":
      return task.completed;
    case "today":
      return task.due === today;
    case "tomorrow":
      return task.due === plusDays(today, 1);
    case "week":
      return task.due !== null && task.due >= today && task.due <= plusDays(today, 6);
  }
}

/** 侧栏计数：已结束 = 已完成总数，其余 = 该分类下未完成数。 */
export function categoryCount<T extends CategorizableTask>(tasks: readonly T[], category: TaskCategory, today: string): number {
  if (category === "ended") return tasks.filter((t) => t.completed).length;
  return tasks.filter((t) => !t.completed && inCategory(t, category, today)).length;
}

/** 未来 7 天范围（页头显示）。 */
export function weekRange(today: string): { from: string; to: string } {
  return { from: today, to: plusDays(today, 6) };
}

export function isOverdue(task: CategorizableTask, today: string): boolean {
  return !task.completed && task.due !== null && task.due < today;
}
