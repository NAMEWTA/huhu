import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { HomeStore } from "../src/capabilities/home.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(start = "2026-11-11T10:00:00Z", zone = "UTC") {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-home-"));
  dirs.push(dir);
  const clock = { t: new Date(start).getTime(), zone };
  const notes: { title: string; module: string }[] = [];
  const store = new HomeStore({ dir, now: () => new Date(clock.t), zone: () => clock.zone, notify: (n) => notes.push(n) });
  return {
    dir,
    store,
    clock,
    notes,
    advance: (sec: number) => {
      clock.t += sec * 1000;
    },
  };
}

describe("专注计时", () => {
  test("开始→过一会儿→暂停：保存剩余秒数；再开始继续倒数", () => {
    const { store, advance } = setup();
    expect(store.focus()).toMatchObject({ remainingSec: 1500, running: false, completedToday: 0, endsAt: null });
    expect(store.focusAction("start")).toMatchObject({ running: true, remainingSec: 1500 });
    advance(100);
    expect(store.focus().remainingSec).toBe(1400);
    expect(store.focusAction("pause")).toMatchObject({ running: false, remainingSec: 1400 });
    advance(500); // 暂停期间不走
    expect(store.focus().remainingSec).toBe(1400);
    store.focusAction("start");
    advance(400);
    expect(store.focus().remainingSec).toBe(1000);
  });

  test("到零（ACC-WB-06）：次数 +1、发一次“专注完成”通知、回到 25:00 未运行；重复结算不重复计数", () => {
    const { store, advance, notes } = setup();
    store.focusAction("start");
    advance(1499);
    expect(store.focus().remainingSec).toBe(1);
    expect(notes).toHaveLength(0);
    advance(2);
    expect(store.focus().remainingSec).toBe(0); // 读取不结算
    const done = store.focusAction("sync");
    expect(done).toMatchObject({ remainingSec: 1500, running: false, completedToday: 1 });
    expect(notes).toEqual([{ title: "专注完成", module: "home" }]);
    expect(store.focusAction("sync").completedToday).toBe(1);
    expect(notes).toHaveLength(1);
  });

  test("重置回到 25:00；在 0 秒时“开始”先结算再开始新的一轮", () => {
    const { store, advance, notes } = setup();
    store.focusAction("start");
    advance(10);
    expect(store.focusAction("reset")).toMatchObject({ remainingSec: 1500, running: false });
    store.focusAction("start");
    advance(1600);
    const v = store.focusAction("start"); // 先结算上一轮，再开始
    expect(v).toMatchObject({ running: true, completedToday: 1, remainingSec: 1500 });
    expect(notes).toHaveLength(1);
  });

  test("今日次数按设置的时区计算“今天”", () => {
    const { store, clock, advance } = setup("2026-11-11T10:00:00Z", "UTC");
    store.focusAction("start");
    advance(1600);
    store.focusAction("sync");
    expect(store.focus().completedToday).toBe(1);
    clock.zone = "Pacific/Kiritimati"; // UTC+14：此刻已是 11-12，与记录的 11-11 不同 → 清零
    expect(store.focus().completedToday).toBe(0);
    clock.zone = "UTC"; // 没有写入过，回到 UTC 仍是 11-11
    expect(store.focus().completedToday).toBe(1);
    advance(24 * 3600); // 次日
    expect(store.focus().completedToday).toBe(0);
  });

  test("文件损坏：按默认值，且原子写不留临时文件", () => {
    const { dir, store } = setup();
    writeFileSync(path.join(dir, "focus.json"), "{坏的");
    expect(store.focus()).toMatchObject({ remainingSec: 1500, running: false });
    store.focusAction("start");
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(dir, "focus.json"), "utf8")).running).toBe(true);
  });
});

describe("习惯", () => {
  test("添加、勾选、重命名、删除；名称校验与数量上限", () => {
    const { store } = setup();
    expect(store.habits().habits).toEqual([]);
    store.habitsAction({ action: "add", title: " 喝水 " });
    const id = store.habits().habits[0]!.id;
    expect(store.habits().habits[0]).toMatchObject({ title: "喝水", done: false });
    expect(store.habitsAction({ action: "toggle", id }).habits[0]!.done).toBe(true);
    expect(store.habitsAction({ action: "toggle", id }).habits[0]!.done).toBe(false);
    store.habitsAction({ action: "rename", id, title: "多喝水" });
    expect(store.habits().habits[0]!.title).toBe("多喝水");
    expect(() => store.habitsAction({ action: "add", title: "  " })).toThrow();
    expect(() => store.habitsAction({ action: "add", title: "长".repeat(61) })).toThrow();
    expect(() => store.habitsAction({ action: "toggle", id: "habit-none" })).toThrow();
    for (let i = 0; i < 19; i++) store.habitsAction({ action: "add", title: `h${i}` });
    expect(() => store.habitsAction({ action: "add", title: "第 21 个" })).toThrow();
    store.habitsAction({ action: "remove", id });
    expect(store.habits().habits).toHaveLength(19);
  });

  test("跨日（设置的时区）首次读取清空勾选，保留习惯本身", () => {
    const { store, advance } = setup("2026-11-11T20:00:00Z", "UTC");
    store.habitsAction({ action: "add", title: "读书" });
    const id = store.habits().habits[0]!.id;
    store.habitsAction({ action: "toggle", id });
    expect(store.habits().habits[0]!.done).toBe(true);
    advance(5 * 3600); // UTC 次日
    expect(store.habits().habits).toEqual([{ id, title: "读书", done: false }]);
  });
});

describe("损坏的数据", () => {
  test("习惯文件里个别条目损坏：只丢弃该条，其余保留；整个文件损坏时覆盖前留副本", () => {
    const { dir, store } = setup();
    writeFileSync(path.join(dir, "habits.json"), JSON.stringify({ dateKey: "2026-11-11", habits: [{ id: "a", title: "喝水" }, { id: "b" }, 7], doneToday: ["a", 3] }));
    expect(store.habits().habits).toEqual([{ id: "a", title: "喝水", done: true }]);
    writeFileSync(path.join(dir, "habits.json"), "{坏的");
    store.habitsAction({ action: "add", title: "读书" });
    expect(readdirSync(dir).filter((f) => f.startsWith("habits.json.corrupt-"))).toHaveLength(1);
  });
});

describe("首页卡片", () => {
  test("隐藏列表持久化；非法条目回退；文件缺失为空", () => {
    const { dir, store } = setup();
    expect(store.widgets()).toEqual({ hidden: [] });
    expect(store.setWidgets({ hidden: ["focus", "focus", "recent"] })).toEqual({ hidden: ["focus", "recent"], order: [] });
    expect(existsSync(path.join(dir, "widgets.json"))).toBe(true);
    expect(store.widgets().hidden).toEqual(["focus", "recent"]);
    writeFileSync(path.join(dir, "widgets.json"), JSON.stringify({ hidden: "bad" }));
    expect(store.widgets()).toEqual({ hidden: [] });
  });

  test("卡片顺序持久化（W18.1 显示/排序）：去重；非法条目回退为空", () => {
    const { dir, store } = setup();
    expect(store.setWidgets({ hidden: [], order: ["activity", "tasks", "activity"] }).order).toEqual(["activity", "tasks"]);
    expect(store.widgets().order).toEqual(["activity", "tasks"]);
    // 写入路径：未知 id 同样只丢掉它自己
    expect(store.setWidgets({ hidden: [], order: ["activity", "nope", "tasks"] }).order).toEqual(["activity", "tasks"]);
    writeFileSync(path.join(dir, "widgets.json"), JSON.stringify({ hidden: [], order: ["nope"] }));
    expect(store.widgets().order ?? []).toEqual([]);
    // 个别不认识的 id 只丢掉它自己，其余顺序保留
    writeFileSync(path.join(dir, "widgets.json"), JSON.stringify({ hidden: [], order: ["activity", "nope", "tasks"] }));
    expect(store.widgets().order).toEqual(["activity", "tasks"]);
  });
});
