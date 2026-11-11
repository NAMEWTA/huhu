const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO（UTC）→ datetime-local 控件需要的本地时间 "YYYY-MM-DDTHH:mm"。 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 的本地时间 → ISO（UTC，秒精度，Z 结尾）。 */
export function localInputToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
