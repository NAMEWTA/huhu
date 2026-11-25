const dailyFile = /^日记\/(\d{4}-\d{2}-\d{2}) · 每日笔记\.md$/;

export function dailyNotePath(date: string): string {
  return `日记/${date} · 每日笔记.md`;
}

export function dailyNoteDate(path: string): string | undefined {
  return dailyFile.exec(path)?.[1];
}

export function todayInZone(value: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${field("year").padStart(4, "0")}-${field("month")}-${field("day")}`;
}
