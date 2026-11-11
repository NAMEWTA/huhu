import { describe, expect, test } from "vitest";
import { missedRun, nextRuns, validateSchedule } from "../src/shared/cron.js";
import { Scheduler } from "../src/engine/scheduler.js";

describe("cron", () => {
  test("校验与下三次激活（含时区）", () => {
    expect(() => validateSchedule("*/5 * * * *", "Asia/Taipei")).not.toThrow();
    expect(() => validateSchedule("not a cron", "Asia/Taipei")).toThrowError(/定时设置无效/);
    expect(() => validateSchedule("* * * * *", "Mars/Base")).toThrow();
    expect(nextRuns("0 9 * * *", "Asia/Taipei", 2, new Date("2026-11-10T00:00:00Z"))).toEqual(["2026-11-10T01:00:00.000Z", "2026-11-11T01:00:00.000Z"]);
  });
  test("ACC-AU-09 每分钟、关闭 3 小时、宽限 30 分钟：只补最近一次；超出宽限不补", () => {
    const last = new Date("2026-11-10T06:00:00Z");
    const now = new Date("2026-11-10T09:00:20Z");
    expect(missedRun("* * * * *", "UTC", last, now, 30)?.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    // 关闭更久：最近一次计划时间在宽限之外
    expect(missedRun("0 6 * * *", "UTC", last, new Date("2026-11-10T10:00:00Z"), 30)).toBeNull();
    // 宽限内
    expect(missedRun("0 9 * * *", "UTC", last, new Date("2026-11-10T09:10:00Z"), 30)?.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    // 从未激活 / 没有错过
    expect(missedRun("* * * * *", "UTC", null, now, 30)).toBeNull();
    expect(missedRun("0 12 * * *", "UTC", last, now, 30)).toBeNull();
  });
});

describe("Scheduler", () => {
  const rule = (id: string, over: Partial<{ enabled: boolean; cron: string }> = {}) => ({ id, enabled: true, cron: "* * * * * *", zone: "UTC", missedRunGraceMinutes: 30, ...over });

  test("只为启用的规则建作业；重建清理旧作业；stop 后不再激活", async () => {
    const fired: string[] = [];
    const s = new Scheduler({
      activate: (id) => {
        fired.push(id);
      },
      lastActivatedFor: () => null,
      now: () => new Date(),
    });
    s.sync([rule("a"), rule("b", { enabled: false })]);
    expect(s.active()).toEqual(["a"]);
    await new Promise((r) => setTimeout(r, 1300));
    expect(fired.length).toBeGreaterThan(0);
    expect(new Set(fired)).toEqual(new Set(["a"]));
    s.sync([rule("c")]);
    expect(s.active()).toEqual(["c"]);
    s.stop();
    const n = fired.length;
    await new Promise((r) => setTimeout(r, 1200));
    expect(fired.length).toBe(n);
  });
  test("启动时补激活最近一次错过的计划", async () => {
    const calls: [string, string][] = [];
    const s = new Scheduler({
      activate: (id, at) => {
        calls.push([id, at.toISOString()]);
      },
      lastActivatedFor: () => new Date("2026-11-10T06:00:00Z"),
      now: () => new Date("2026-11-10T09:00:20Z"),
    });
    s.sync([{ id: "m", enabled: true, cron: "* * * * *", zone: "UTC", missedRunGraceMinutes: 30 }]);
    await new Promise((r) => setTimeout(r, 20));
    s.stop();
    expect(calls).toEqual([["m", "2026-11-10T09:00:00.000Z"]]);
  });
  test("编辑 / 启用规则之后：只补编辑时间之后错过的计划，不会立刻补跑改动之前的“错过”", async () => {
    const calls: string[] = [];
    const last = new Date("2026-11-10T09:00:00Z"); // 今天 09:00 已激活
    const mk = () =>
      new Scheduler({
        activate: (id, at) => {
          calls.push(`${id}@${at.toISOString()}`);
        },
        lastActivatedFor: () => last,
        now: () => new Date("2026-11-10T09:10:00Z"),
      });
    // 把每天 09:00 改成 09:05，09:10 保存：09:05 在保存之前，不补
    const a = mk();
    a.sync([{ id: "edited", enabled: true, cron: "5 9 * * *", zone: "UTC", missedRunGraceMinutes: 30, updatedAt: "2026-11-10T09:10:00Z" }]);
    // 对照：没有编辑记录（或编辑早于上次激活）时，照常补
    const b = mk();
    b.sync([
      { id: "plain", enabled: true, cron: "5 9 * * *", zone: "UTC", missedRunGraceMinutes: 30 },
      { id: "old-edit", enabled: true, cron: "5 9 * * *", zone: "UTC", missedRunGraceMinutes: 30, updatedAt: "2026-11-01T00:00:00Z" },
    ]);
    await new Promise((r) => setTimeout(r, 20));
    a.stop();
    b.stop();
    expect(calls.filter((c) => c.startsWith("edited"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("plain"))).toEqual(["plain@2026-11-10T09:05:00.000Z"]);
    expect(calls.filter((c) => c.startsWith("old-edit"))).toEqual(["old-edit@2026-11-10T09:05:00.000Z"]);
  });
  test("protect：长任务不重叠", async () => {
    let running = 0,
      max = 0,
      total = 0;
    const s = new Scheduler({
      activate: async () => {
        total++;
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 2500));
        running--;
      },
      lastActivatedFor: () => null,
      now: () => new Date(),
    });
    s.sync([rule("p")]);
    await new Promise((r) => setTimeout(r, 3300));
    s.stop();
    expect(max).toBe(1);
    expect(total).toBeGreaterThanOrEqual(1);
  }, 15000);
});
