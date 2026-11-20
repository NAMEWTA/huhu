import type { TaskDispatchWindow } from "@huhu/contracts";
import { CronDate } from "croner";

/** 在规则当地的日历上求日期边界，再将各自的当地零点解析成 instant。 */
export function dispatchWindow(window: TaskDispatchWindow, zone: string, now: Date): { start: number; end: number } {
  if (window.kind === "custom") return { start: Date.parse(window.start), end: Date.parse(window.end) };
  const local = new CronDate(now, zone);
  const start = new Date(0);
  start.setUTCFullYear(local.year, local.month, local.day);
  let days = 1;
  if (window.kind === "week") {
    const sinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - sinceMonday);
    days = 7;
  } else if (window.kind === "next-seven-days") days = 7;
  else if (window.kind === "month") start.setUTCDate(1);
  const end = new Date(start);
  if (window.kind === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + days);
  const midnight = (calendar: Date) => new CronDate(calendar.toISOString().slice(0, 10) + "T00:00:00", zone).getTime();
  return { start: midnight(start), end: midnight(end) };
}
