import { codeRanges } from "@huhu/vault/markdown";
import path from "node:path/posix";

export interface RewriteContext {
  /** 本文件移动前/后的路径（未移动时相同）。 */
  filePath: string;
  newFilePath: string;
  /** 被改名/移动的文件：旧路径 → 新路径（含本文件自身若被移动）。 */
  moves: ReadonlyMap<string, string>;
  /** 操作前 Vault 内所有文件路径，用于裸名称唯一性判断。 */
  allPaths: readonly string[];
  /** 被改名/移动的文件夹：旧路径 → 新路径（不带结尾 /）。用于改写 `[[旧目录/]]` 这类指向文件夹本身的链接。 */
  folderMoves?: ReadonlyMap<string, string>;
}

export interface RewriteResult {
  text: string;
  changes: number;
  /** 裸标题存在多个同名文件而无法判断的链接，原样保留。 */
  ambiguous: string[];
}

const stripExt = (p: string) => p.replace(/\.[^./]+$/, "");
const baseNoExt = (p: string) => stripExt(path.basename(p));

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
    // 只在第一个分隔符处切开：别名/标题里的后续 | 与 # 属于文本本身
    const bar = inner.indexOf("|");
    const left = bar >= 0 ? inner.slice(0, bar) : inner;
    const alias = bar >= 0 ? inner.slice(bar + 1) : undefined;
    const hash = left.indexOf("#");
    const target = hash >= 0 ? left.slice(0, hash) : left;
    const heading = hash >= 0 ? left.slice(hash + 1) : undefined;
    const t = target.trim();
    if (!t) return full;
    // 指向文件夹的链接 `[[目录/]]`：文件夹改名或移动后跟着改（含其子文件夹）
    if (t.endsWith("/") && ctx.folderMoves) {
      const dir = t.replace(/\/+$/, "");
      for (const [from, to] of ctx.folderMoves) {
        if (dir === from || dir.startsWith(`${from}/`)) {
          changes++;
          return `[[${to}${dir.slice(from.length)}/${heading !== undefined ? `#${heading}` : ""}${alias !== undefined ? `|${alias}` : ""}]]`;
        }
      }
      return full;
    }
    const isPath = t.includes("/");
    const bareHasMd = !isPath && /\.md$/i.test(t); // `[[名称.md]]`：带扩展名的裸写法
    let resolved: string | null = null;
    if (isPath) {
      const withExt = ctx.allPaths.find((p) => p === t || stripExt(p) === t);
      resolved = withExt ?? null;
    } else {
      const u = uniqueByBasename(ctx.allPaths, bareHasMd ? t.slice(0, -3) : t);
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
      if (bareHasMd) next += ".md";
    }
    if (next === t) return full;
    changes++;
    return `[[${next}${heading !== undefined ? `#${heading}` : ""}${alias !== undefined ? `|${alias}` : ""}]]`;
  });

  // 标准链接在 wiki 替换后的文本上再扫描，需要重新计算代码区间
  const code2 = codeRanges(wiki);
  const inCode2 = (i: number) => code2.some(([a, b]) => i >= a && i < b);
  const out = wiki.replace(/(!?\[[^\]\n]*\]\()((?:[^()\s]|\([^()\s]*\))+)(\))/g, (full, open: string, href: string, close: string, offset: number) => {
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
