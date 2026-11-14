import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { SessionsService, type SessionRecord } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";
import { WaitingWatcher } from "../src/engine/waiting.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-wt-"));
  dirs.push(d);
  const sdir = path.join(d, "sessions");
  mkdirSync(sdir);
  const rec: SessionRecord = { id: "sess-1", spaceId: "space-1", provider: "shell", model: null, state: "running", requestId: "req-12345", terminalId: "t1", name: "终端 1", cwd: d, createdAt: "2026-11-14T00:00:00Z" };
  writeFileSync(path.join(sdir, "sess-1.json"), JSON.stringify(rec));
  const svc = new SessionsService({
    dir: sdir,
    vaultId: "vault-x",
    spaces: new SpaceStore(path.join(d, "spaces"), "m1"),
    core: async () => {
      throw new Error("unused");
    },
    resolve: async () => {
      throw new Error("unused");
    },
    now: () => new Date("2026-11-14T01:00:00Z"),
  });
  return { svc, d };
}

describe("会话的等人工状态（applyStatus）", () => {
  test("进入 blocked 产生新的发生标识 n；同一次 blocked 重复到达不产生新的；离开后再进入 n+1", () => {
    const { svc } = setup();
    const a = svc.applyStatus("sess-1", { state: "blocked", kind: "permission" });
    expect(a.transition).toBe("blocked");
    expect(a.session.waiting).toMatchObject({ n: 1, active: true, kind: "permission" });
    expect(svc.applyStatus("sess-1", { state: "blocked", kind: "permission" }).transition).toBeNull(); // 重连后快照重复到达
    expect(svc.applyStatus("sess-1", { state: "working" }).transition).toBe("cleared");
    expect(svc.get("sess-1").waiting).toMatchObject({ n: 1, active: false });
    expect(svc.applyStatus("sess-1", { state: "working" }).transition).toBeNull();
    expect(svc.applyStatus("sess-1", { state: "blocked" }).session.waiting).toMatchObject({ n: 2, active: true });
  });
  test("没有状态（程序不上报）不产生任何等待；终端结束把未解除的等待标为过期；任务 id 与 handled 跨次保留", () => {
    const { svc } = setup();
    expect(svc.applyStatus("sess-1", null).transition).toBeNull();
    expect(svc.get("sess-1").waiting).toBeUndefined();
    svc.applyStatus("sess-1", { state: "blocked" });
    svc.setWaitingTask("sess-1", "task-abc");
    svc.markWaitingHandled("sess-1", 1);
    svc.expireWaiting("sess-1");
    expect(svc.get("sess-1").waiting).toMatchObject({ active: false, expired: true, taskId: "task-abc", handled: 1 });
    svc.applyStatus("sess-1", { state: "blocked" });
    expect(svc.get("sess-1").waiting).toMatchObject({ n: 2, active: true, taskId: "task-abc", handled: 1 });
  });
  test("byTerminal 只匹配运行中的会话，并核对 huhu.session 标签", () => {
    const { svc } = setup();
    expect(svc.byTerminal("t1", "sess-1")?.id).toBe("sess-1");
    expect(svc.byTerminal("t1", "other")).toBeNull();
    expect(svc.byTerminal("t9")).toBeNull();
  });
});

describe("WaitingWatcher", () => {
  test("Core 不存在时不报错、不启动任何东西；stop 后不再重试", async () => {
    if (process.platform === "win32") return;
    const { svc, d } = setup();
    const calls: string[] = [];
    const w = new WaitingWatcher({ endpoint: path.join(d, "missing.sock"), vaultId: "vault-x", sessions: svc, onBlocked: async (s) => void calls.push(s.id), backoffMs: { min: 10, max: 20 } });
    w.start();
    await new Promise((r) => setTimeout(r, 80));
    w.stop();
    expect(calls).toEqual([]);
  });
});
