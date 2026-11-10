import { describe, expect, test } from "vitest";
import { LatestOnly, rankItems, scoreText, type PaletteItem } from "../src/command-palette/palette-model.js";

const item = (id: string, title: string, group: PaletteItem["group"] = "module"): PaletteItem => ({ id, title, group, run: () => undefined });

describe("scoreText", () => {
  test("连续子串优先于分散字符；不匹配为 -1；空查询为 0；中文子串可匹配", () => {
    expect(scoreText("任务", "任务")).toBeGreaterThan(scoreText("任务", "我的任务清单"));
    expect(scoreText("tsk", "Tasks")).toBeGreaterThan(0);
    expect(scoreText("xyz", "Tasks")).toBe(-1);
    expect(scoreText("", "任意")).toBe(0);
    expect(scoreText("清单", "我的任务清单")).toBeGreaterThan(0);
  });
});

describe("rankItems", () => {
  const all = [item("a", "任务"), item("b", "知识库"), item("c", "新建任务", "command"), item("d", "收件箱")];
  test("有查询时按匹配度；无匹配的被过滤", () => {
    expect(rankItems(all, "任务").map((i) => i.id)).toEqual(["a", "c"]);
    expect(rankItems(all, "zzz")).toEqual([]);
  });
  test("空查询：最近使用置顶，其余按 模块→命令→结果 分组、组内按标题", () => {
    const en = [item("m1", "Tasks"), item("m2", "Notes"), item("c1", "New task", "command"), item("m3", "Inbox")];
    expect(rankItems(en, "", ["m3"]).map((i) => i.id)).toEqual(["m3", "m2", "m1", "c1"]);
    expect(rankItems(en, "").map((i) => i.id)).toEqual(["m3", "m2", "m1", "c1"]);
  });
});

describe("LatestOnly（ACC-WB-07：过期搜索结果丢弃）", () => {
  test("只有最新一次请求被采纳", () => {
    const l = new LatestOnly();
    const first = l.next();
    const second = l.next();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
    l.next();
    expect(second()).toBe(false);
  });
});
