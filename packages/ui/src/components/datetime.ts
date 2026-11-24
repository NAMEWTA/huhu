const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO（UTC）→ datetime-local 控件需要的本地时间 "YYYY-MM-DDTHH:mm:ss"。 */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** datetime-local 的本地时间 → ISO（UTC，秒精度，Z 结尾）。 */
export function localInputToIso(local: string): string {
  const d = new Date(local);
  const seconds = local.length === 16 ? `${local}:00` : local;
  if (!seconds || isoToLocalInput(local) !== seconds) return "";
  // A local clock edit can denote two instants when the browser's timezone falls back.
  const tomorrow = new Date(d.getTime() + 86_400_000);
  const offsetChange = tomorrow.getTimezoneOffset() - d.getTimezoneOffset();
  if (offsetChange > 0) {
    const later = new Date(d.getTime() + offsetChange * 60_000);
    if (isoToLocalInput(later.toISOString()) === seconds) return "";
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
