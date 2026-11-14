const quote = (s: string): string => (s === "" || /[^\w@%+=:,./-]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s);

/** 把解析结果渲染成一行可读命令：`KEY=… cmd arg …`（设置页预览用）。 */
export function renderCommandLine(r: { command: string; argv: string[]; env: Record<string, string> }): string {
  const envs = Object.entries(r.env).map(([k, v]) => `${k}=${quote(v)}`);
  return [...envs, quote(r.command), ...r.argv.map(quote)].join(" ");
}
