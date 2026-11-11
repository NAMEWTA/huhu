/** 按行的三方分段：把"基线/本地/远端"拆成公共段与冲突块，逐块可选。纯函数，字节保真（保留 CRLF、末尾无换行）。 */
export type Segment = { kind: "common"; text: string } | { kind: "conflict"; base: string; ours: string; theirs: string };

export type Choice = "ours" | "theirs" | "both" | { custom: string };

interface Hunk {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/** LCS 表的单元上限（超过则放弃逐块，调用方按整文件处理）。 */
const MAX_CELLS = 4_000_000;

/** 按 \n 切行并保留行尾（"a\nb" → ["a\n","b"]）。 */
export function splitLines(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function diffHunks(a: string[], b: string[]): Hunk[] | null {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const n = ea - s;
  const m = eb - s;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0) return [{ a0: s, a1: ea, b0: s, b1: eb }];
  if (n * m > MAX_CELLS) return null;
  const w = m + 1;
  const L = new Uint16Array((n + 1) * w); // L[i*w+j] = LCS(a[s+i..ea), b[s+j..eb))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = a[s + i] === b[s + j] ? (L[(i + 1) * w + j + 1] as number) + 1 : Math.max(L[(i + 1) * w + j] as number, L[i * w + j + 1] as number);
    }
  }
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: Hunk | null = null;
  const close = () => {
    if (open) {
      out.push(open);
      open = null;
    }
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[s + i] === b[s + j]) {
      close();
      i++;
      j++;
      continue;
    }
    open ??= { a0: s + i, a1: s + i, b0: s + j, b1: s + j };
    if (j < m && (i === n || (L[i * w + j + 1] as number) >= (L[(i + 1) * w + j] as number))) {
      j++;
      open.b1 = s + j;
    } else {
      i++;
      open.a1 = s + i;
    }
  }
  close();
  return out;
}

/** 三方分段；任何一侧太大返回 null（调用方按整文件处理）。 */
export function splitThreeWay(base: string, ours: string, theirs: string): Segment[] | null {
  const A = splitLines(base);
  const O = splitLines(ours);
  const T = splitLines(theirs);
  const ho = diffHunks(A, O);
  const ht = diffHunks(A, T);
  if (!ho || !ht) return null;
  const all = [...ho.map((h) => ({ ...h, side: 0 as const })), ...ht.map((h) => ({ ...h, side: 1 as const }))].sort((x, y) => x.a0 - y.a0 || x.a1 - y.a1);
  const segs: Segment[] = [];
  const common = (text: string) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last?.kind === "common") last.text += text;
    else segs.push({ kind: "common", text });
  };
  const render = (side: string[], hunks: Hunk[], lo: number, hi: number): string => {
    let out = "";
    let cur = lo;
    for (const h of hunks) {
      out += A.slice(cur, h.a0).join("") + side.slice(h.b0, h.b1).join("");
      cur = h.a1;
    }
    return out + A.slice(cur, hi).join("");
  };
  let pos = 0;
  let k = 0;
  while (k < all.length) {
    const lo = (all[k] as { a0: number }).a0;
    let hi = (all[k] as { a1: number }).a1;
    const oursH: Hunk[] = [];
    const theirsH: Hunk[] = [];
    // 重叠或相邻的改动合成一簇（相邻也算冲突，与 git 一致）
    while (k < all.length && (all[k] as { a0: number }).a0 <= hi) {
      const h = all[k] as Hunk & { side: 0 | 1 };
      hi = Math.max(hi, h.a1);
      (h.side === 0 ? oursH : theirsH).push(h);
      k++;
    }
    common(A.slice(pos, lo).join(""));
    pos = hi;
    if (theirsH.length === 0) common(render(O, oursH, lo, hi));
    else if (oursH.length === 0) common(render(T, theirsH, lo, hi));
    else {
      const o = render(O, oursH, lo, hi);
      const t = render(T, theirsH, lo, hi);
      if (o === t) common(o);
      else segs.push({ kind: "conflict", base: A.slice(lo, hi).join(""), ours: o, theirs: t });
    }
  }
  common(A.slice(pos).join(""));
  return segs;
}

/** 按每个冲突块的选择拼出最终文本。选择数必须与冲突块数一致。 */
export function applyChoices(segs: readonly Segment[], choices: readonly Choice[]): string {
  let n = 0;
  let out = "";
  for (const s of segs) {
    if (s.kind === "common") {
      out += s.text;
      continue;
    }
    const c = choices[n++];
    if (c === undefined) throw new Error("冲突块选择数量不足");
    out += c === "ours" ? s.ours : c === "theirs" ? s.theirs : c === "both" ? s.ours + s.theirs : c.custom;
  }
  if (n !== choices.length) throw new Error("冲突块选择数量过多");
  return out;
}

export function countConflicts(segs: readonly Segment[]): number {
  return segs.filter((s) => s.kind === "conflict").length;
}
