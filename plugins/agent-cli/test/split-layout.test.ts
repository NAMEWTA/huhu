import { describe, expect, test } from "vitest";
import { choose, fillCells, reveal, type SplitSession } from "../src/ui/split-layout.js";

const s = (id: string, state = "running"): SplitSession => ({ id, name: id, state });

describe("分屏布局：各格的默认会话", () => {
  test("优先放当前选中的，其余按顺序补运行中的；不重复；已结束的不放", () => {
    const all = [s("a"), s("b"), s("c", "exited"), s("d"), s("e")];
    expect(fillCells(2, [], all, "d")).toEqual(["d", "a"]);
    expect(fillCells(4, [], all, null)).toEqual(["a", "b", "d", "e"]);
    expect(fillCells(4, [], [s("a")], "a")).toEqual(["a", null, null, null]);
  });
  test("保留已经选好的格子；已结束的会话所在格被清空后重新补", () => {
    const all = [s("a"), s("b", "exited"), s("c")];
    expect(fillCells(2, ["c", "b"], all, null)).toEqual(["c", "a"]);
    expect(fillCells(4, ["c"], all, "a")).toEqual(["c", "a", null, null]);
  });
  test("用户明确选的“空”（空串）不会被自动补满；选定的会话结束或不属于当前 Space 后，那一格退回自动", () => {
    const all = [s("a"), s("b"), s("c")];
    expect(fillCells(2, ["", null], all, null)).toEqual([null, "a"]);
    expect(fillCells(2, ["gone", "b"], all, null)).toEqual(["a", "b"]);
    expect(fillCells(2, ["x-other-space", null], all, "c")).toEqual(["c", "a"]);
  });
  test("选“空”后被移走的会话不会跳到别的格子；之后新建的会话仍会自动出现", () => {
    const all = [s("a"), s("b"), s("c")];
    let st = { picks: [] as (string | null)[], hidden: [] as string[] };
    const shown = fillCells(4, st.picks, all, "c", st.hidden); // [c, a, b, null]
    expect(shown).toEqual(["c", "a", "b", null]);
    st = choose(shown, st, 2, "");
    expect(fillCells(4, st.picks, all, "c", st.hidden)).toEqual(["c", "a", null, null]);
    const withNew = [...all, s("d")];
    expect(fillCells(4, st.picks, withNew, "c", st.hidden)).toEqual(["c", "a", null, "d"]);
    st = choose(fillCells(4, st.picks, withNew, "c", st.hidden), st, 2, "b"); // 再选回来
    expect(st.hidden).toEqual([]);
  });
  test("点会话标签：已显示不动并解除隐藏；有空格放进空格且不冻结其他空格；没有空格换掉最后一格", () => {
    const st = { picks: [] as (string | null)[], hidden: ["c"] };
    expect(reveal(2, ["a", "b"], st, "a").picks).toEqual([]);
    expect(reveal(4, ["a", null, "b", null], st, "c")).toEqual({ picks: ["a", "c", "b", null], hidden: [] });
    expect(reveal(2, ["a", "b"], st, "c").picks).toEqual(["a", "c"]);
  });
  test("4→2→4 时多出的格子选择保留", () => {
    const st = choose(["a", "b"], { picks: ["a", "b", "x", ""], hidden: [] }, 0, "b");
    expect(st.picks.slice(2)).toEqual(["x", ""]);
  });
  test("缩小布局只保留前几格", () => {
    const all = [s("a"), s("b"), s("c"), s("d")];
    expect(fillCells(2, ["a", "b", "c", "d"], all, null)).toEqual(["a", "b"]);
  });
  test("当前选中的不是运行中：忽略", () => {
    expect(fillCells(2, [], [s("a"), s("x", "exited")], "x")).toEqual(["a", null]);
  });
});
