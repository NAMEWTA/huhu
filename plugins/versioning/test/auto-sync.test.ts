import { describe, expect, test } from "vitest";
import { HuhuError } from "@huhu/contracts";
import { AutoSync, type AutoSyncConfig, type RunMode } from "../src/engine/auto-sync.js";
import { SyncAuthFailure, type LegacyAuth, type VersioningAuth } from "../src/engine/remote-auth.js";

function setup(cfg: Partial<AutoSyncConfig> = {}, runRepair?: (repair: VersioningAuth, isCurrent: () => boolean) => Promise<boolean>) {
  const config: AutoSyncConfig = { mode: "full", pullIntervalSec: 30, pushIntervalSec: 60, ...cfg };
  const timers: { id: number; ms: number; fn: () => void; live: boolean }[] = [];
  const calls: RunMode[] = [];
  const st = { fail: null as unknown, conflict: false, writable: true, target: "https://fixture.invalid/a.git" };
  const changes: unknown[] = [];
  const auto = new AutoSync({
    config: () => config,
    run: async (m, isCurrent, repair) => {
      calls.push(m);
      if (repair) return runRepair?.(repair, isCurrent) ?? true;
      if (st.fail) throw st.fail;
    },
    authTarget: () => st.target,
    canRun: () => st.writable,
    hasConflict: () => st.conflict,
    schedule: (fn, ms) => {
      const t = { id: timers.length, ms, fn, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
    onChange: (s) => changes.push(s),
  });
  const live = () => timers.filter((t) => t.live);
  /** 触发最近一个存活的、指定间隔的定时器，并等异步完成。 */
  const fire = async (ms: number) => {
    const t = [...live()].reverse().find((x) => x.ms === ms);
    if (!t) throw new Error(`没有 ${ms}ms 的定时器`);
    t.live = false;
    t.fn();
    await new Promise((r) => setImmediate(r));
  };
  return { auto, config, timers, calls, st, live, fire, changes };
}
const err = (code: string) => Object.assign(new Error(code), { code });

describe("自动同步调度", () => {
  test("off 不排程；follow 只有拉取定时器；full 有拉取和推送两个独立定时器（间隔钳制到 30–3600 秒）", () => {
    const a = setup({ mode: "off" });
    a.auto.restart();
    expect(a.live()).toHaveLength(0);
    const b = setup({ mode: "follow" });
    b.auto.restart();
    expect(b.live().map((t) => t.ms)).toEqual([30_000]);
    const c = setup({ mode: "full", pullIntervalSec: 5, pushIntervalSec: 99999 });
    c.auto.restart();
    expect(
      c
        .live()
        .map((t) => t.ms)
        .sort((x, y) => x - y),
    ).toEqual([30_000, 3_600_000]);
  });

  test("定时触发：拉取定时器执行 pull，推送定时器执行 sync；各自只重排自己，不重置另一方", async () => {
    const t = setup();
    t.auto.restart();
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
    const t = setup();
    t.auto.restart();
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

  test("保险箱锁定/凭据引用失效同样暂停自动同步（等用户解锁或重新配置）", async () => {
    for (const code of ["SAFE_LOCKED", "SECRET_REF_INVALID"]) {
      const t = setup();
      t.auto.restart();
      t.st.fail = err(code);
      await t.fire(30_000);
      expect(t.auto.state().pausedReason).toBe("auth-failed");
      expect(t.live()).toHaveLength(0);
    }
  });

  test("离线等其他失败：指数退避（每次翻倍，封顶 3600 秒），成功后恢复原间隔", async () => {
    const t = setup({ mode: "follow" });
    t.auto.restart();
    t.st.fail = err("GIT_OFFLINE");
    await t.fire(30_000);
    expect(t.live().map((x) => x.ms)).toEqual([60_000]);
    await t.fire(60_000);
    expect(t.live().map((x) => x.ms)).toEqual([120_000]);
    for (let i = 0; i < 10; i++) {
      const ms = t.live()[0]!.ms;
      await t.fire(ms);
    }
    expect(t.live()[0]!.ms).toBe(3_600_000);
    t.st.fail = null;
    await t.fire(3_600_000);
    expect(t.live().map((x) => x.ms)).toEqual([30_000]);
    expect(t.auto.state().failures).toBe(0);
  });

  test("已有冲突会话时不自动同步，直接暂停；手动失败（冲突/认证失败）也会暂停自动同步", async () => {
    const t = setup();
    t.auto.restart();
    t.st.conflict = true;
    await t.fire(30_000);
    expect(t.calls).toEqual([]);
    expect(t.auto.state().pausedReason).toBe("conflict");
    const u = setup();
    u.auto.restart();
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
      config: () => t.config,
      hasConflict: () => false,
      run: () =>
        new Promise<void>((r) => {
          release = r;
          t.calls.push("pull");
        }),
      schedule: (fn, ms) => {
        const x = { id: t.timers.length, ms, fn, live: true };
        t.timers.push(x);
        return () => {
          x.live = false;
        };
      },
    });
    slow.restart();
    const first = t.timers.at(-1)!;
    first.live = false;
    first.fn();
    const second = t.timers.at(-1)!; // 还在跑：再触发一次
    expect(second).toBe(first);
    first.fn();
    await new Promise((r) => setImmediate(r));
    expect(t.calls).toEqual(["pull"]);
    release();
    await new Promise((r) => setImmediate(r));
    slow.stop();
    expect(slow.state().active).toBe(false);
    const n = t.calls.length;
    t.timers.at(-1)!.fn();
    await new Promise((r) => setImmediate(r));
    expect(t.calls.length).toBe(n);
  });

  test("模式改为 off 后下一次触发不再执行并清除定时器", async () => {
    const t = setup({ mode: "follow" });
    t.auto.restart();
    t.config.mode = "off";
    await t.fire(30_000);
    expect(t.live()).toHaveLength(0);
  });

  test("推送 tick 进行中把 full 改成 follow：结束后不再为推送续排，也不会执行推送", async () => {
    const t = setup({ mode: "full" });
    let release: () => void = () => {};
    const auto = new AutoSync({
      config: () => t.config,
      hasConflict: () => false,
      run: (m) =>
        new Promise<void>((r) => {
          t.calls.push(m);
          release = r;
        }),
      schedule: (fn, ms) => {
        const x = { id: t.timers.length, ms, fn, live: true };
        t.timers.push(x);
        return () => {
          x.live = false;
        };
      },
    });
    auto.restart();
    const push = t.timers.find((x) => x.ms === 60_000)!;
    push.live = false;
    push.fn(); // 推送 tick 开始（sync）
    t.config.mode = "follow";
    auto.restart(); // 保存设置
    release();
    await new Promise((r) => setImmediate(r));
    expect(t.timers.filter((x) => x.live).map((x) => x.ms)).toEqual([30_000]);
    expect(t.calls).toEqual(["sync"]);
  });

  test("间隔不是数字（手改配置文件）时按默认值排程，不会变成 1ms 的紧循环", () => {
    const t = setup({ mode: "full", pullIntervalSec: Number.NaN, pushIntervalSec: Number.NaN });
    t.auto.restart();
    expect(
      t
        .live()
        .map((x) => x.ms)
        .sort((a, b) => a - b),
    ).toEqual([30_000, 60_000]);
  });

  test("并发保存只安排最新修订，迟到的旧失败和已取消定时器不能覆盖它", async () => {
    const handled: (string | null)[] = [];
    const t = setup({}, async (repair, isCurrent) => {
      if (!isCurrent()) return false;
      handled.push(repair.revision);
      return true;
    });
    const scope = (revision: string): VersioningAuth => ({ source: "versioning", target: t.st.target, revision });
    const failed = new SyncAuthFailure(new HuhuError("GIT_AUTH_FAILED", "fixture"), scope("r1"));
    t.auto.restart();
    t.auto.noteManualFailure(failed);
    t.auto.credentialsChanged("r1", scope("r2"), true);
    const obsolete = t.live()[0]!;
    t.auto.credentialsChanged("r2", scope("r3"), true);
    t.auto.credentialsChanged("r1", scope("late"), true);
    t.auto.noteManualFailure(failed);
    obsolete.fn();
    expect(t.live().map((timer) => timer.ms)).toEqual([0]);
    expect(t.auto.authPause()).toMatchObject({ revision: "r1" });
    await t.fire(0);
    expect(t.calls).toEqual(["sync"]);
    expect(handled).toEqual(["r3"]);
    expect(t.auto.authPause()).toBeUndefined();
    expect(t.live().map((timer) => timer.ms)).toEqual([30_000, 60_000]);
  });

  test("已排队的恢复等待实际发起条件；关闭、只读与冲突保留暂停原因", async () => {
    for (const block of ["off", "read-only", "conflict"] as const) {
      const starting = (() => {
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => {
          release = resolve;
        });
        return { waiting, release };
      })();
      const attempts: string[] = [];
      const t = setup({ mode: "follow" }, async (repair, isCurrent) => {
        await starting.waiting;
        if (!isCurrent()) return false;
        attempts.push(repair.target);
        return true;
      });
      const first: VersioningAuth = { source: "versioning", target: t.st.target, revision: "r1" };
      t.auto.restart();
      t.auto.noteManualFailure(new SyncAuthFailure(new HuhuError("GIT_AUTH_FAILED", "fixture"), first));
      t.auto.credentialsChanged("r1", { ...first, revision: "r2" }, true);
      const recovery = t.fire(0);
      if (block === "off") t.config.mode = "off";
      if (block === "read-only") t.st.writable = false;
      if (block === "conflict") t.st.conflict = true;
      starting.release();
      await recovery;
      expect(attempts).toEqual([]);
      expect(t.calls).toEqual(["pull"]);
      expect(t.auto.authPause()).toMatchObject({ revision: "r1", reason: "remote-rejected" });
      expect(t.live()).toHaveLength(0);
    }
  });

  test("Safe 解锁只恢复匹配旧引用的锁定暂停", () => {
    const t = setup();
    const legacy: LegacyAuth = { source: "legacy-safe", target: t.st.target, reference: "safe://item-fixture" };
    t.auto.restart();
    t.auto.noteManualFailure(new SyncAuthFailure(new HuhuError("SAFE_LOCKED", "fixture"), legacy));
    t.auto.legacyUnlocked(() => ({ ...legacy, reference: "safe://item-other" }));
    expect(t.live()).toHaveLength(0);
    t.auto.legacyUnlocked(() => legacy);
    expect(t.live()).toHaveLength(2);
    t.auto.noteManualFailure(new SyncAuthFailure(new HuhuError("GIT_AUTH_FAILED", "fixture"), legacy));
    const shouldNotReadLegacy = () => {
      throw new Error("远端拒绝不应解析旧引用");
    };
    t.auto.legacyUnlocked(shouldNotReadLegacy);
    expect(t.auto.authPause()).toMatchObject({ source: "legacy-safe", reason: "remote-rejected" });
    expect(t.live()).toHaveLength(0);
  });
});
