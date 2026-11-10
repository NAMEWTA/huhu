export interface WikiLink {
  target: string;
  alias: string | null;
  heading: string | null;
}

/** 去掉围栏代码块与行内代码，避免解析其中的 [[...]]。 */
export function stripCode(markdown: string): string {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/** 解析 [[目标]]、[[目标|别名]]、[[目标#标题]]。 */
export function parseWikiLinks(markdown: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of stripCode(markdown).matchAll(/\[\[([^[\]\n]+?)\]\]/g)) {
    const raw = m[1] ?? "";
    const [left = "", alias] = raw.split("|", 2) as [string, string | undefined];
    const [target = "", heading] = left.split("#", 2) as [string, string | undefined];
    if (target.trim()) out.push({ target: target.trim(), alias: alias?.trim() || null, heading: heading?.trim() || null });
  }
  return out;
}

/** 正文中的 #标签（不含代码、标题行 `# ` 与 URL 片段）。 */
export function parseTags(markdown: string): string[] {
  const tags = new Set<string>();
  for (const m of stripCode(markdown).matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
    const t = m[1] ?? "";
    if (!/^\d+$/.test(t)) tags.add(t);
  }
  return [...tags];
}
