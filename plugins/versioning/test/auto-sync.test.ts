import { describe, expect, test } from "vitest";
import { AutoSync, type AutoSyncConfig, type RunMode } from "../src/engine/auto-sync.js";

function setup(cfg: Partial<AutoSyncConfig> = {}) {
  const config: AutoSyncConfig = { mode: "full", pullIntervalSec: 30, pushIntervalSec: 60, ...cfg };
  const timers: { id: number; ms: number; fn: () => void; live: boolean }[] = [];
  const calls: RunMode[] = [];
  const st = { fail: null as unknown, conflict: false };
  const changes: unknown[] = [];
  const auto = new AutoSync({
    config: () => config,
    run: async (m) => { calls.push(m); if (st.fail) throw st.fail; },
    hasConflict: () => st.conflict,
    schedule: (fn, ms) => { const t = { id: timers.length, ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    onChange: (s) => changes.push(s),
  });
  const live = () => timers.filter((t) => t.live);
  /** 触发最近一个存活的、指定间隔的定时器，并等异步完成。 */
  const fire = async (ms: number) => { const t = [...live()].reverse().find((x) => x.ms === ms); if (!t) throw new Error(`没有 ${ms}ms 的定时器`); t.live = false; t.fn(); await new Promise((r) => setImmediate(r)); };
  return { auto, config, timers, calls, st, live, fire, changes };
}
const err = (code: string) => Object.assign(new Error(code), { code });

describe("自动同步调度", () => {
  test("off 不排程；follow 只有拉取定时器；full 有拉取和推送两个独立定时器（间隔钳制到 30–3600 秒）", () => {
    const a = setup({ mode: "off" }); a.auto.restart();
    expect(a.live()).toHaveLength(0);
    const b = setup({ mode: "follow" }); b.auto.restart();
    expect(b.live().map((t) => t.ms)).toEqual([30_000]);
    const c = setup({ mode: "full", pullIntervalSec: 5, pushIntervalSec: 99999 }); c.auto.restart();
    expect(c.live().map((t) => t.ms).sort((x, y) => x - y)).toEqual([30_000, 3_600_000]);
  });

  test("定时触发：拉取定时器执行 pull，推送定时器执行 sync；各自只重排自己，不重置另一方", async () => {
    const t = setup(); t.auto.restart();
    const before = t.live().find((x) => x.ms === 60_000);
    await t.fire(30_000);
    expect(t.calls).toEqual(["pull"]);
    expect(t.live().find((x) => x.ms === 60_000)).toBe(before); // 推送定时器没被重置
    await t.fire(30_000);
    await t.fire(60_000);
    expect(t.calls).toEqual(["pull", "pull", "sync"]);
    expect(t.live()).toHaveLength(2);
  });

  test("认证失败 → 暂停并停止所有定时器；冲突同理；restart（配置变更/手动成功/冲突解决后）恢复", async () => {
    const t = setup(); t.auto.restart();
    t.st.fail = err("GIT_AUTH_FAILED");
    await t.fire(30_000);
    expect(t.auto.state()).toMatchObject({ pausedReason: "auth-failed", active: false });
    expect(t.live()).toHaveLength(0);
    t.st.fail = null;
    t.auto.restart();
    expect(t.auto.state()).toMatchObject({ pausedReason: null, active: true });
    t.st.fail = err("GIT_CONFLICT");
    await t.fire(30_000);
    expect(t.auto.state().pausedReason).toBe("conflict");
    expect(t.live()).toHaveLength(0);
  });

  test("离线等其他失败：指数退避（每次翻倍，封顶 3600 秒），成功后恢复原间隔", async () => {
    const t = setup({ mode: "follow" }); t.auto.restart();
    t.st.fail = err("GIT_OFFLINE");
    await t.fire(30_000);
    expect(t.live().map((x) => x.ms)).toEqual([60_000]);
    await t.fire(60_000);
    expect(t.live().map((x) => x.ms)).toEqual([120_000]);
    for (let i = 0; i < 10; i++) { const ms = t.live()[0]!.ms; await t.fire(ms); }
    expect(t.live()[0]!.ms).toBe(3_600_000);
    t.st.fail = null;
    await t.fire(3_600_000);
    expect(t.live().map((x) => x.ms)).toEqual([30_000]);
    expect(t.auto.state().failures).toBe(0);
  });

  test("已有冲突会话时不自动同步，直接暂停；手动失败（冲突/认证失败）也会暂停自动同步", async () => {
    const t = setup(); t.auto.restart();
    t.st.conflict = true;
    await t.fire(30_000);
    expect(t.calls).toEqual([]);
    expect(t.auto.state().pausedReason).toBe("conflict");
    const u = setup(); u.auto.restart();
    u.auto.noteManualFailure(err("GIT_AUTH_FAILED"));
    expect(u.auto.state().pausedReason).toBe("auth-failed");
    u.auto.restart();
    u.auto.noteManualFailure(err("GIT_OFFLINE")); // 离线不暂停
    expect(u.auto.state().pausedReason).toBeNull();
  });

  test("上一次同步还没结束时，这一拍被跳过（不并发）；stop 之后不再触发", async () => {
    const t = setup({ mode: "follow" });
    let release: () => void = () => {};
    const slow = new AutoSync({
      config: () => t.config, hasConflict: () => false,
      run: () => new Promise<void>((r) => { release = r; t.calls.push("pull"); }),
      schedule: (fn, ms) => { const x = { id: t.timers.length, ms, fn, live: true }; t.timers.push(x); return () => { x.live = false; }; },
    });
    slow.restart();
    const first = t.timers.at(-1)!; first.live = false; first.fn();
    const second = t.timers.at(-1)!; // 还在跑：再触发一次
    expect(second).toBe(first);
    first.fn();
    await new Promise((r) => setImmediate(r));
    expect(t.calls).toEqual(["pull"]);
    release(); await new Promise((r) => setImmediate(r));
    slow.stop();
    expect(slow.state().active).toBe(false);
    const n = t.calls.length;
    t.timers.at(-1)!.fn();
    await new Promise((r) => setImmediate(r));
    expect(t.calls.length).toBe(n);
  });

  test("模式改为 off 后下一次触发不再执行并清除定时器", async () => {
    const t = setup({ mode: "follow" }); t.auto.restart();
    t.config.mode = "off";
    await t.fire(30_000);
    expect(t.live()).toHaveLength(0);
  });

  test("推送 tick 进行中把 full 改成 follow：结束后不再为推送续排，也不会执行推送", async () => {
    const t = setup({ mode: "full" });
    let release: () => void = () => {};
    const auto = new AutoSync({
      config: () => t.config, hasConflict: () => false,
      run: (m) => new Promise<void>((r) => { t.calls.push(m); release = r; }),
      schedule: (fn, ms) => { const x = { id: t.timers.length, ms, fn, live: true }; t.timers.push(x); return () => { x.live = false; }; },
    });
    auto.restart();
    const push = t.timers.find((x) => x.ms === 60_000)!;
    push.live = false; push.fn(); // 推送 tick 开始（sync）
    t.config.mode = "follow";
    auto.restart(); // 保存设置
    release(); await new Promise((r) => setImmediate(r));
    expect(t.timers.filter((x) => x.live).map((x) => x.ms)).toEqual([30_000]);
    expect(t.calls).toEqual(["sync"]);
  });

  test("间隔不是数字（手改配置文件）时按默认值排程，不会变成 1ms 的紧循环", () => {
    const t = setup({ mode: "full", pullIntervalSec: Number.NaN, pushIntervalSec: Number.NaN }); t.auto.restart();
    expect(t.live().map((x) => x.ms).sort((a, b) => a - b)).toEqual([30_000, 60_000]);
  });
});
