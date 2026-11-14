/**
 * 找出 Markdown 中的代码区域，返回 [start, end) 区间（按字符偏移，升序、不重叠）：
 * - 围栏代码块：``` 或 ~~~，最多 3 个空格缩进；关闭围栏必须同一字符、长度不小于开启围栏、后面只能有空白；没有关闭就一直到文末。
 * - 缩进代码块：前一行是空行（或文首）、本行缩进 4 个空格或 1 个 tab 的连续行（空行并入，只要后面还有缩进行）。
 * - 行内代码：同一行内成对的反引号串（长度相同）。
 * 结构标签识别、双链解析、链接改写都用它，避免各自维护一份相近的正则。
 * 写法参照 open-knowledge 的 fence-regions（MIT 同源思路），补齐波浪线围栏、围栏长度匹配与缩进代码块。
 */
export function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const lines: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i <= text.length;) {
    const nl = text.indexOf("\n", i);
    const end = nl === -1 ? text.length : nl;
    lines.push({ start: i, end: nl === -1 ? text.length : nl + 1, text: text.slice(i, end).replace(/\r$/, "") });
    if (nl === -1) break;
    i = nl + 1;
  }

  const fenced = new Set<number>();
  for (let n = 0; n < lines.length; n++) {
    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[n]!.text);
    if (!open || (open[2]![0] === "`" && open[3]!.includes("`"))) continue; // ``` 的信息串里不能有反引号
    const fence = open[2]!;
    let close = lines.length - 1; // 没有关闭：到文末
    for (let m = n + 1; m < lines.length; m++) {
      const c = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(lines[m]!.text);
      if (c && c[2]![0] === fence[0] && c[2]!.length >= fence.length) {
        close = m;
        break;
      }
    }
    out.push([lines[n]!.start, lines[close]!.end]);
    for (let k = n; k <= close; k++) fenced.add(k);
    n = close;
  }

  // 缩进代码块（不在围栏内）
  let prevBlank = true;
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n]!;
    if (fenced.has(n)) {
      prevBlank = false;
      continue;
    }
    const blank = l.text.trim() === "";
    if (prevBlank && !blank && /^( {4}|\t)/.test(l.text)) {
      let last = n;
      for (let m = n + 1; m < lines.length && !fenced.has(m); m++) {
        if (/^( {4}|\t)/.test(lines[m]!.text)) last = m;
        else if (lines[m]!.text.trim() !== "") break;
      }
      out.push([l.start, lines[last]!.end]);
      n = last;
      prevBlank = false;
      continue;
    }
    prevBlank = blank;
  }

  // 行内代码（不在上面的区域内）
  const inBlock = (i: number) => out.some(([a, b]) => i >= a && i < b);
  for (const m of text.matchAll(/(`+)([^`\n]|[^`\n][^\n]*?[^`\n])\1(?!`)/g)) {
    const s = m.index!;
    if (!inBlock(s)) out.push([s, s + m[0].length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** `pos` 是否落在代码区域内。 */
export const inCodeRange = (ranges: readonly [number, number][], pos: number): boolean => ranges.some(([a, b]) => pos >= a && pos < b);
