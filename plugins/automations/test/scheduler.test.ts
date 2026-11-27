import { describe, expect, test, vi } from "vitest";
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
  test("每分钟和每秒规则离线 70 天，仍找到最近的计划点", () => {
    const last = new Date("2026-08-25T00:00:00Z");
    const now = new Date("2026-11-03T00:00:12.555Z");
    expect(missedRun("* * * * *", "UTC", last, now, 30)).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(missedRun("* * * * * *", "UTC", last, now, 30)).toEqual(new Date("2026-11-03T00:00:12Z"));
  });
  test("宽限下界包含等号，受理/修订时刻排除等号", () => {
    const cron = "0 9 * * *";
    const slot = new Date("2026-11-10T09:00:00Z");
    const before = new Date(slot.getTime() - 1);
    expect(missedRun(cron, "UTC", before, new Date("2026-11-10T09:30:00Z"), 30)).toEqual(slot);
    expect(missedRun(cron, "UTC", before, new Date("2026-11-10T09:30:00.001Z"), 30)).toBeNull();
    expect(missedRun(cron, "UTC", before, slot, 0)).toEqual(slot);
    expect(missedRun(cron, "UTC", slot, slot, 0)).toBeNull();
  });
  test.each([
    ["30 2 * * *", "2026-03-08T00:00:00Z", "2026-03-08T07:12:00Z", "2026-03-08T07:00:00Z"],
    ["30 1 * * *", "2026-11-01T00:00:00Z", "2026-11-01T06:40:00Z", "2026-11-01T05:30:00Z"],
  ])("恢复与在线 Croner 的 DST 计划一致（%s）", (cron, start, end, slot) => {
    const zone = "America/New_York";
    const last = new Date(start);
    expect(nextRuns(cron, zone, 1, last)).toEqual([new Date(slot).toISOString()]);
    expect(missedRun(cron, zone, last, new Date(end), 90)).toEqual(new Date(slot));
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
  test("重复收到相同规则不重建；禁用、启用和重启保留已受理计划点", () => {
    const saved = rule("m", { cron: "* * * * *" });
    const slot = new Date("2026-11-10T09:00:00Z");
    let last = new Date("2026-11-10T06:00:00Z");
    const history = vi.fn(() => last);
    const activate = vi.fn((_id: string, at: Date) => {
      last = at;
    });
    const start = () => new Scheduler({ activate, lastActivatedFor: history, now: () => slot });
    const first = start();
    const restarted = start();
    try {
      first.sync([saved]);
      first.sync([{ ...saved }]);
      expect(history).toHaveBeenCalledTimes(1);
      first.sync([{ ...saved, enabled: false }]);
      expect(first.active()).toEqual([]);
      first.sync([saved]);
      expect(first.active()).toEqual(["m"]);
      first.stop();
      restarted.sync([saved]);
      expect(activate).toHaveBeenCalledExactlyOnceWith("m", slot, "schedule");
    } finally {
      first.stop();
      restarted.stop();
    }
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

test("固定偏移时区在次日零点由在线调度触发，创建当天不提前派遣", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T13:02:40.000Z"));
  const calls: string[] = [];
  const zone = "+10:57";
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const createdDay = day(new Date());
  const scheduler = new Scheduler({
    activate: (_id, at, trigger) => {
      calls.push(`${trigger}:${at.toISOString()}`);
    },
    lastActivatedFor: () => null,
    now: () => new Date(),
  });
  try {
    validateSchedule("0 0 0 * * *", zone);
    expect(nextRuns("0 0 0 * * *", zone, 1)).toEqual(["2026-11-22T13:03:00.000Z"]);
    scheduler.sync([{ id: "next-day", enabled: true, cron: "0 0 0 * * *", zone, missedRunGraceMinutes: 0, updatedAt: new Date().toISOString() }]);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(calls).toEqual([]);
    expect(day(new Date())).toBe(createdDay);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["schedule:2026-11-22T13:03:00.000Z"]);
    expect(day(new Date())).toBe("2026-11-23");
    expect(createdDay).toBe("2026-11-22");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  } finally {
    scheduler.stop();
    vi.useRealTimers();
  }
});
