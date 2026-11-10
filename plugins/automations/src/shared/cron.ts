import { Cron } from "croner";

export const PRESETS: Record<string, string> = { every5: "*/5 * * * *", every15: "*/15 * * * *", hourly: "0 * * * *", daily9: "0 9 * * *", weekdays9: "0 9 * * 1-5" };

/** 校验 cron + 时区；非法抛 Error（含面向用户的说明）。 */
export function validateSchedule(cron: string, zone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }); // 非法时区在这里抛 RangeError
    const job = new Cron(cron, { timezone: zone, paused: true });
    job.nextRun(); // 触发 cron 表达式与时区的完整解析
    job.stop();
  } catch (e) {
    throw new Error(`定时设置无效：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 之后 n 次激活时间（ISO，UTC）。 */
export function nextRuns(cron: string, zone: string, n: number, from: Date = new Date()): string[] {
  const job = new Cron(cron, { timezone: zone, paused: true });
  const out = job.nextRuns(n, from).map((d) => d.toISOString());
  job.stop();
  return out;
}

/**
 * 错过激活：在 (lastActivatedFor, now] 内最近的一次计划时间，且距今不超过宽限分钟；更早的不补。
 * lastActivatedFor 为空（从未激活）时不补。
 */
export function missedRun(cron: string, zone: string, lastActivatedFor: Date | null, now: Date, graceMinutes: number): Date | null {
  if (!lastActivatedFor) return null;
  const job = new Cron(cron, { timezone: zone, paused: true });
  let latest: Date | null = null;
  let t: Date | null = job.nextRun(lastActivatedFor);
  let guard = 0;
  while (t && t.getTime() <= now.getTime() && guard++ < 100_000) {
    latest = t;
    t = job.nextRun(t);
  }
  job.stop();
  if (!latest) return null;
  return now.getTime() - latest.getTime() <= graceMinutes * 60_000 ? latest : null;
}
