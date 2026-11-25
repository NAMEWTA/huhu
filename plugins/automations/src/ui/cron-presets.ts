// 触发预设 ↔ cron：纯函数，界面和测试共用。
export type PresetId = "every5" | "every15" | "hourly" | "daily" | "weekdays" | "monday" | "weekly" | "custom";
export const PRESETS: { id: PresetId; time: boolean }[] = [
  { id: "every5", time: false },
  { id: "every15", time: false },
  { id: "hourly", time: false },
  { id: "daily", time: true },
  { id: "weekdays", time: true },
  { id: "monday", time: true },
  { id: "weekly", time: true },
  { id: "custom", time: false },
];

/** 预设 + 时刻 → cron。 */
export function cronFor(preset: PresetId, time: string, custom: string, days: readonly number[] = []): string {
  const ok = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = ok && Number(ok[1]) < 24 ? Number(ok[1]) : 9;
  const m = ok && Number(ok[2]) < 60 ? Number(ok[2]) : 0;
  const hm = `${m} ${h}`;
  switch (preset) {
    case "every5":
      return "*/5 * * * *";
    case "every15":
      return "*/15 * * * *";
    case "hourly":
      return "0 * * * *";
    case "daily":
      return `${hm} * * *`;
    case "weekdays":
      return `${hm} * * 1-5`;
    case "monday":
      return `${hm} * * 1`;
    case "weekly":
      return days.length ? `${hm} * * ${[...days].sort().join(",")}` : "";
    default:
      return custom.trim();
  }
}

/** 从已有 cron 还原预设与时刻；认不出来的当作自定义。 */
export function presetOf(cron: string): { preset: PresetId; time: string; days?: number[] } {
  const c = cron.trim();
  if (c === "*/5 * * * *") return { preset: "every5", time: "09:00" };
  if (c === "*/15 * * * *") return { preset: "every15", time: "09:00" };
  if (c === "0 * * * *") return { preset: "hourly", time: "09:00" };
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|[0-6](?:,[0-6])*)$/.exec(c);
  if (m && Number(m[1]) < 60 && Number(m[2]) < 24) {
    const time = `${String(m[2]).padStart(2, "0")}:${String(m[1]).padStart(2, "0")}`;
    const weekday = m[3];
    if (weekday === "*" || weekday === "1-5" || weekday === "1") {
      return { preset: weekday === "*" ? "daily" : weekday === "1-5" ? "weekdays" : "monday", time };
    }
    const days = weekday!.split(",").map(Number);
    if (new Set(days).size === days.length) return { preset: "weekly", time, days };
  }
  return { preset: "custom", time: "09:00" };
}
