// 分屏布局的纯逻辑：界面和测试共用。
export interface SplitSession {
  id: string;
  name: string;
  state: string;
}
export type Layout = 1 | 2 | 4;

/**
 * 各格显示哪个会话。输入的每一格：会话 id = 用户选定；"" = 用户明确选了“空”；null = 自动（由这里补）。
 * 选定的会话如果已经不在运行（或属于别的 Space），那一格退回自动。自动格先放当前选中的，再按顺序补运行中的；不重复。
 * hidden = 用户从某格里主动移走（选了“空”）的会话：不再被自动补回别的格子，直到用户再选它或点它的标签。
 * 返回值里 null 表示这一格没有会话。
 */
export function fillCells(layout: Layout, cells: (string | null)[], sessions: SplitSession[], active: string | null, hidden: readonly string[] = []): (string | null)[] {
  const running = sessions.filter((s) => s.state === "running").map((s) => s.id);
  const out: (string | null | "auto")[] = Array.from({ length: layout }, (_, i) => {
    const c = cells[i];
    if (c === "") return null;
    return c && running.includes(c) ? c : "auto";
  });
  const used = new Set(out.filter((x): x is string => typeof x === "string" && x !== "auto"));
  const queue = [...(active && running.includes(active) ? [active] : []), ...running].filter((id, i, arr) => arr.indexOf(id) === i && !used.has(id) && !hidden.includes(id));
  return out.map((x) => (x === "auto" ? (queue.shift() ?? null) : x));
}

/** 用户在分屏里的选择：picks 是各格的选定（见 fillCells），hidden 是被主动移走的会话。 */
export interface SplitState {
  picks: (string | null)[];
  hidden: string[];
}

/** 只冻结已有会话的格子（位置不跳）；自动的空格保持自动，之后新建的会话仍会自己出现。layout 变小再变大时，多出的选择保留。 */
function frozen(shown: (string | null)[], st: SplitState): (string | null)[] {
  const head = shown.map((c, j) => c ?? (st.picks[j] === "" ? "" : null));
  return [...head, ...st.picks.slice(shown.length)];
}

/** 第 i 格改选 v（会话 id，或 "" = 空）。选“空”时把原来的会话记进 hidden，避免它跳到别的格子里。 */
export function choose(shown: (string | null)[], st: SplitState, i: number, v: string): SplitState {
  const prev = shown[i] ?? null;
  const picks = frozen(shown, st);
  picks[i] = v;
  const hidden = st.hidden.filter((h) => h !== v);
  if (v === "" && prev && !hidden.includes(prev)) hidden.push(prev);
  return { picks, hidden };
}

/** 点会话标签时让它出现在分屏里：已经显示就不动；否则放进第一个空格（没有空格就换掉最后一格）。 */
export function reveal(layout: Layout, shown: (string | null)[], st: SplitState, id: string): SplitState {
  const hidden = st.hidden.filter((h) => h !== id);
  if (shown.includes(id)) return { picks: st.picks, hidden };
  const picks = frozen(shown, st);
  const slot = shown.findIndex((c) => c === null);
  picks[slot === -1 ? layout - 1 : slot] = id;
  return { picks, hidden };
}
