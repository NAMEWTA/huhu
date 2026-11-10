import path from "node:path/posix";

export interface RewriteContext {
  /** 本文件移动前/后的路径（未移动时相同）。 */
  filePath: string;
  newFilePath: string;
  /** 被改名/移动的文件：旧路径 → 新路径（含本文件自身若被移动）。 */
  moves: ReadonlyMap<string, string>;
  /** 操作前 Vault 内所有文件路径，用于裸名称唯一性判断。 */
  allPaths: readonly string[];
}

export interface RewriteResult {
  text: string;
  changes: number;
  /** 裸标题存在多个同名文件而无法判断的链接，原样保留。 */
  ambiguous: string[];
}

const stripExt = (p: string) => p.replace(/\.[^./]+$/, "");
const baseNoExt = (p: string) => stripExt(path.basename(p));

/** 找出代码区域（围栏与行内代码）的 [start,end) 区间，链接改写不触碰它们。 */
function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm)) out.push([m.index as number, (m.index as number) + m[0].length]);
  for (const m of text.matchAll(/`[^`\n]*`/g)) {
    const s = m.index as number;
    if (!out.some(([a, b]) => s >= a && s < b)) out.push([s, s + m[0].length]);
  }
  return out;
}

function uniqueByBasename(allPaths: readonly string[], name: string): string | null | "ambiguous" {
  const lower = name.toLowerCase();
  const hits = allPaths.filter((p) => /\.(md|txt)$/i.test(p) && baseNoExt(p).toLowerCase() === lower);
  if (hits.length === 0) return null;
  return hits.length === 1 ? (hits[0] as string) : "ambiguous";
}

/**
 * 重命名/移动后改写文件中的双链与标准 Markdown 链接：
 * `[[路径]]`、`[[名称]]`（唯一时）、`[[…#标题|别名]]`、`](相对路径)`；代码块与行内代码不改。
 */
export function rewriteLinks(text: string, ctx: RewriteContext): RewriteResult {
  const code = codeRanges(text);
  const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
  const ambiguous: string[] = [];
  let changes = 0;
  const after = new Set([...ctx.allPaths].map((p) => ctx.moves.get(p) ?? p));

  const wiki = text.replace(/\[\[([^[\]\n]+?)\]\]/g, (full, inner: string, offset: number) => {
    if (inCode(offset)) return full;
    const [left = "", alias] = inner.split("|", 2) as [string, string | undefined];
    const [target = "", heading] = left.split("#", 2) as [string, string | undefined];
    const t = target.trim();
    if (!t) return full;
    const isPath = t.includes("/");
    let resolved: string | null = null;
    if (isPath) {
      const withExt = ctx.allPaths.find((p) => p === t || stripExt(p) === t);
      resolved = withExt ?? null;
    } else {
      const u = uniqueByBasename(ctx.allPaths, t);
      if (u === "ambiguous") {
        ambiguous.push(t);
        return full;
      }
      resolved = u;
    }
    if (!resolved) return full;
    const moved = ctx.moves.get(resolved);
    if (!moved || moved === resolved) return full;
    const hadExt = isPath && /\.[^./]+$/.test(t) && t === resolved;
    let next: string;
    if (isPath) next = hadExt ? moved : stripExt(moved);
    else {
      const name = baseNoExt(moved);
      // 改名/移动后裸名称仍唯一才保留裸写法，否则退回路径写法
      const stillUnique = [...after].filter((p) => /\.(md|txt)$/i.test(p) && baseNoExt(p).toLowerCase() === name.toLowerCase()).length === 1;
      next = stillUnique ? name : stripExt(moved);
    }
    if (next === t) return full;
    changes++;
    return `[[${next}${heading !== undefined ? `#${heading}` : ""}${alias !== undefined ? `|${alias}` : ""}]]`;
  });

  // 标准链接在 wiki 替换后的文本上再扫描，需要重新计算代码区间
  const code2 = codeRanges(wiki);
  const inCode2 = (i: number) => code2.some(([a, b]) => i >= a && i < b);
  const out = wiki.replace(/(!?\[[^\]\n]*\]\()([^)\s]+)(\))/g, (full, open: string, href: string, close: string, offset: number) => {
    if (inCode2(offset) || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return full;
    const [rawPath = "", frag] = href.split("#", 2) as [string, string | undefined];
    let decoded: string;
    try {
      decoded = decodeURI(rawPath);
    } catch {
      return full;
    }
    const target = path.normalize(path.join(path.dirname(ctx.filePath), decoded));
    const moved = ctx.moves.get(target);
    const targetAfter = moved ?? target;
    // 目标没动、本文件也没动 → 不改
    if (!moved && ctx.filePath === ctx.newFilePath) return full;
    let rel = path.relative(path.dirname(ctx.newFilePath), targetAfter);
    if (!rel.startsWith(".") && decoded.startsWith("./")) rel = `./${rel}`;
    const encoded = rawPath.includes("%") ? encodeURI(rel) : rel;
    if (encoded === rawPath) return full;
    // 目标不在 Vault 已知文件中（死链）时不改写
    if (!ctx.allPaths.includes(target)) return full;
    changes++;
    return `${open}${encoded}${frag !== undefined ? `#${frag}` : ""}${close}`;
  });

  return { text: out, changes, ambiguous };
}
