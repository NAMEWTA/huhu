import { describe, expect, test } from "vitest";
import { cronFor, presetOf } from "../src/ui/cron-presets.js";

describe("触发预设与 cron", () => {
  test("预设 + 时刻 → cron", () => {
    expect(cronFor("every5", "09:00", "")).toBe("*/5 * * * *");
    expect(cronFor("hourly", "09:00", "")).toBe("0 * * * *");
    expect(cronFor("daily", "09:30", "")).toBe("30 9 * * *");
    expect(cronFor("weekdays", "18:05", "")).toBe("5 18 * * 1-5");
    expect(cronFor("monday", "00:00", "")).toBe("0 0 * * 1");
    expect(cronFor("custom", "09:00", "  0 */2 * * *  ")).toBe("0 */2 * * *");
    expect(cronFor("daily", "", "")).toBe("0 9 * * *"); // 时刻为空：回到默认 9:00
  });
  test("cron → 预设：认得出的还原成预设和时刻；认不出的是自定义", () => {
    expect(presetOf("*/5 * * * *")).toEqual({ preset: "every5", time: "09:00" });
    expect(presetOf("30 9 * * *")).toEqual({ preset: "daily", time: "09:30" });
    expect(presetOf("5 18 * * 1-5")).toEqual({ preset: "weekdays", time: "18:05" });
    expect(presetOf("0 0 * * 1")).toEqual({ preset: "monday", time: "00:00" });
    expect(presetOf("0 */2 * * *").preset).toBe("custom");
    expect(presetOf("61 9 * * *").preset).toBe("custom");
    expect(presetOf("0 24 * * *").preset).toBe("custom");
  });
  test("往返：预设生成的 cron 再还原得到同一预设与时刻", () => {
    for (const p of ["daily", "weekdays", "monday"] as const) {
      const c = cronFor(p, "07:45", "");
      expect(presetOf(c)).toEqual({ preset: p, time: "07:45" });
    }
  });
});
