export type QuickEndpoint = { user: string; host: string; port: number };

export function parseQuickEndpoint(value: string): QuickEndpoint | undefined {
  const match = /^([^@/:\s\p{Cc}\p{Cf}]{1,128})@(?:\[([a-z\d:.%_-]+)\]|([a-z\d][a-z\d.-]{0,252}))(?::(\d{1,5}))?$/iu.exec(value.trim());
  if (!match) return;
  const port = match[4] ? Number(match[4]) : 22;
  const host = match[2] ?? match[3]!;
  if (port < 1 || port > 65535 || host.length > 253 || (match[2] && !host.includes(":"))) return;
  return { user: match[1]!, host, port };
}
