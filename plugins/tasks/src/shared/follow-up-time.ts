import { TZDate, tzOffset, tzScan } from "@date-fns/tz";
import { format } from "date-fns";

const inputFormat = "yyyy-MM-dd'T'HH:mm";
const day = 86_400_000;

export function followUpWallTime(instant: string | number, zone: string): string {
  return format(new TZDate(typeof instant === "string" ? Date.parse(instant) : instant, zone), inputFormat);
}

/** A gap has no match. A repeated wall-clock minute has two distinct instants. */
export function followUpInstants(wall: string, zone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return [];
  const clock = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(clock)) return [];
  const start = new Date(clock - day);
  const end = new Date(clock + day);
  const offsets = new Set([tzOffset(zone, start), ...tzScan(zone, { start, end }).map(({ offset }) => offset)]);
  return [...offsets]
    .map((offset) => clock - offset * 60_000)
    .filter((instant) => Number.isFinite(instant) && followUpWallTime(instant, zone) === wall)
    .sort((a, b) => a - b)
    .map((instant) => new Date(instant).toISOString());
}
