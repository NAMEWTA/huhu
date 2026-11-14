import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { categoryCount, inCategory, inputChanged, inputHash, isOverdue, processingKey, todayIn, weekRange } from "../src/shared/index.js";

const T = "2026-11-10";
const t = (due: string | null, completed = false) => ({ due, status: completed ? ("completed" as const) : ("not_started" as const) });

describe("分类", () => {
  test("ACC-TK-05：today / tomorrow / week / ended / all", () => {
    expect(inCategory(t(T), "today", T)).toBe(true);
    expect(inCategory(t("2026-11-11"), "today", T)).toBe(false);
    expect(inCategory(t("2026-11-11"), "tomorrow", T)).toBe(true);
    expect(inCategory(t("2026-11-16"), "week", T)).toBe(true); // 第 7 天
    expect(inCategory(t("2026-11-17"), "week", T)).toBe(false); // 第 8 天
    expect(inCategory(t("2026-11-09"), "week", T)).toBe(false); // 逾期不在 week
    expect(inCategory(t(null), "week", T)).toBe(false);
    expect(inCategory(t(null, true), "ended", T)).toBe(true);
    expect(inCategory(t(T, true), "today", T)).toBe(true); // 已完成仍在分类中，主区分组
    expect(inCategory(t(null), "all", T)).toBe(true);
  });
  test("跨月/跨年", () => {
    expect(inCategory(t("2027-01-01"), "tomorrow", "2026-12-31")).toBe(true);
    expect(inCategory(t("2026-03-01"), "tomorrow", "2026-02-28")).toBe(true);
  });
  test("计数：已结束=已完成总数，其余=未完成数", () => {
    const tasks = [t(T), t(T, true), t("2026-11-11"), t(null, true), t(null)];
    expect(categoryCount(tasks, "today", T)).toBe(1);
    expect(categoryCount(tasks, "ended", T)).toBe(2);
    expect(categoryCount(tasks, "all", T)).toBe(3);
    expect(categoryCount(tasks, "week", T)).toBe(2);
  });
  test("时区：ACC-TK-04 当地 00:00 后今天变化", () => {
    const beforeMidnight = new Date("2026-11-11T07:59:00Z"); // 洛杉矶 23:59（UTC-8）
    const afterMidnight = new Date("2026-11-11T08:01:00Z");
    expect(todayIn("America/Los_Angeles", beforeMidnight)).toBe("2026-11-10");
    expect(todayIn("America/Los_Angeles", afterMidnight)).toBe("2026-11-11");
    expect(inCategory(t("2026-11-10"), "today", todayIn("America/Los_Angeles", afterMidnight))).toBe(false);
    expect(isOverdue(t("2026-11-10"), "2026-11-11")).toBe(true);
    expect(isOverdue(t("2026-11-10", true), "2026-11-11")).toBe(false);
  });
  test("未来 7 天范围", () => {
    expect(weekRange(T)).toEqual({ from: "2026-11-10", to: "2026-11-16" });
  });
});

describe("输入版本", () => {
  const base = { body: "正文 [[设计/]]", execution: { spaceId: "s1", provider: "codex", model: null, effort: null, fast: false } };
  test("键顺序无关；长度 16", () => {
    expect(inputHash(base)).toBe(inputHash({ body: base.body, execution: { fast: false, effort: null, model: null, provider: "codex", spaceId: "s1" } }));
    expect(inputHash(base)).toHaveLength(16);
  });
  test("正文/执行任一变化 → 变化；标题不在输入里", () => {
    for (const next of [
      { ...base, body: "x" },
      { ...base, execution: null },
      { ...base, execution: { ...base.execution, provider: "claude" } },
    ])
      expect(inputChanged(base, next)).toBe(true);
    expect(inputChanged(base, { ...base })).toBe(false);
  });
  test("processingKey", () => {
    expect(processingKey("task-1", 2, "abc")).toBe("task-1:2:abc");
  });

  describe("审计回归", () => {
    test("正文与执行配置之间移动内容，inputHash 必须变化", () => {
      expect(inputChanged({ body: "ab", execution: null }, { body: "a", execution: "b" })).toBe(true);
    });
    test("日期运算与进程时区无关", async () => {
      const { execFileSync } = await import("node:child_process");
      const code = `import('${new URL("../src/shared/categories.ts", import.meta.url).href}').then(m=>console.log(JSON.stringify([m.inCategory({due:'2026-11-11',status:'not_started'},'tomorrow','2026-11-10'),m.weekRange('2026-11-10').to])))`;
      for (const tz of ["Pacific/Auckland", "America/Los_Angeles", "UTC"]) {
        const out = execFileSync(process.execPath, [createRequire(import.meta.url).resolve("tsx/cli"), "-e", code], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
        expect(JSON.parse(out.trim().split("\n").pop() as string)).toEqual([true, "2026-11-16"]);
      }
    }, 60_000);
  });
});
