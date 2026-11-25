export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function today(): DateParts {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function dateParts(value: string | null): DateParts {
  if (!value) return today();
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? { year, month, day } : today();
}

export function dateValue({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0);
  return last.getUTCDate();
}
