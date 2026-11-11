// 触发预设 ↔ cron：纯函数，界面和测试共用。
export type PresetId = "every5" | "hourly" | "daily" | "weekdays" | "monday" | "custom";
export const PRESETS: { id: PresetId; time: boolean }[] = [
  { id: "every5", time: false },
  { id: "hourly", time: false },
  { id: "daily", time: true },
  { id: "weekdays", time: true },
  { id: "monday", time: true },
  { id: "custom", time: false },
];

/** 预设 + 时刻 → cron。 */
export function cronFor(preset: PresetId, time: string, custom: string): string {
  const ok = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = ok && Number(ok[1]) < 24 ? Number(ok[1]) : 9;
  const m = ok && Number(ok[2]) < 60 ? Number(ok[2]) : 0;
  const hm = `${m} ${h}`;
  switch (preset) {
    case "every5":
      return "*/5 * * * *";
    case "hourly":
      return "0 * * * *";
    case "daily":
      return `${hm} * * *`;
    case "weekdays":
      return `${hm} * * 1-5`;
    case "monday":
      return `${hm} * * 1`;
    default:
      return custom.trim();
  }
}

/** 从已有 cron 还原预设与时刻；认不出来的当作自定义。 */
export function presetOf(cron: string): { preset: PresetId; time: string } {
  const c = cron.trim();
  if (c === "*/5 * * * *") return { preset: "every5", time: "09:00" };
  if (c === "0 * * * *") return { preset: "hourly", time: "09:00" };
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|1)$/.exec(c);
  if (m && Number(m[1]) < 60 && Number(m[2]) < 24) {
    const time = `${String(m[2]).padStart(2, "0")}:${String(m[1]).padStart(2, "0")}`;
    return { preset: m[3] === "*" ? "daily" : m[3] === "1-5" ? "weekdays" : "monday", time };
  }
  return { preset: "custom", time: "09:00" };
}
