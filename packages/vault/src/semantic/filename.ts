const ILLEGAL = /[\\/:*?"<>|]/g;
const isControl = (c: string) => c.charCodeAt(0) < 32;

/** 清理标题用于文件名：去非法字符与首尾空白/点，限长，空则回退。 */
export function sanitizeTitle(title: string, fallback = "未命名"): string {
  const cleaned = [...title].map((c) => (isControl(c) ? " " : c)).join("").replace(ILLEGAL, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").trim();
  const cut = [...cleaned].slice(0, 80).join("").trim();
  return cut || fallback;
}

/** 语义文件名 `<标题>--<id>.md`。 */
export function semanticFilename(title: string, id: string): string {
  return `${sanitizeTitle(title)}--${id}.md`;
}

/** 从文件名取出 id（标题部分可能含 `--`，取最后一段）。 */
export function idFromFilename(name: string): string | null {
  const m = /--([A-Za-z0-9]+-[0-9a-z]+)\.md$/.exec(name);
  return m?.[1] ?? null;
}
