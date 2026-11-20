export type MailPeriod = "all" | "today" | "yesterday" | "last3";

export function mailDayFormatter(zone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (date: Date) => formatter.format(date);
}

export function mailDayWindow(period: MailPeriod, zone: string, now: Date) {
  if (period === "all") return undefined;
  const today = mailDayFormatter(zone)(now);
  const previous = new Date(`${today}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - (period === "last3" ? 2 : period === "yesterday" ? 1 : 0));
  const from = previous.toISOString().slice(0, 10);
  return { zone, from, through: period === "yesterday" ? from : today };
}
