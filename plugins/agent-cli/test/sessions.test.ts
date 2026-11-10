import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { HerdrClient } from "@huhu/herdr-client";
import { HerdrCore } from "../src/engine/herdr-core.js";
import { ProviderDetector } from "../src/engine/providers/index.js";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-ss-")); dirs.push(d); return d; };

function fakeClient(opts: { failRun?: "throw-after-create" | "throw" } = {}) {
  const terminals: { address: string; labels: Record<string, string> }[] = [];
  const calls: string[] = [];
  const client = {
    call: async (method: string, params: { labels?: Record<string, string>; terminal?: string }) => {
      calls.push(method);
      if (method === "terminal.run") {
        const t = { address: `t${terminals.length + 1}`, labels: params.labels ?? {} };
        if (opts.failRun === "throw") throw new Error("boom");
        terminals.push(t);
        if (opts.failRun === "throw-after-create") throw new Error("响应丢失");
        return { address: t.address };
      }
      if (method === "terminal.list") return { terminals: terminals.filter((t) => Object.entries(params.labels ?? {}).every(([k, v]) => t.labels[k] === v)) };
      return {};
    },
  } as unknown as HerdrClient;
  return { client, calls, terminals };
}

function setup(client: HerdrClient) {
  const root = tmp(); const work = tmp(); const bin = tmp();
  writeFileSync(path.join(bin, "claude"), "#!/bin/sh\necho 2.0.0\n"); chmodSync(path.join(bin, "claude"), 0o755);
  const spaces = new SpaceStore(path.join(root, "spaces"), "m1");
  const space = spaces.save({ name: "S", root: work });
  const svc = new SessionsService({ dir: path.join(root, "sessions"), vaultId: "vault-x", spaces, core: async () => client, detect: () => new ProviderDetector(() => 0, { PATH: bin }).detect(), now: () => new Date("2026-11-11T00:00:00Z") });
  return { svc, space, work };
}
const req = (space: { id: string; revision: number }, over: Record<string, unknown> = {}) => ({ spaceId: space.id, spaceRevision: space.revision, provider: "shell" as const, requestId: `req-${Math.random().toString(36).slice(2)}`, ...over });

describe("会话启动", () => {
  test("shell：不传 argv，cwd=Space 根，带四个标签；记录先持久化后 running", async () => {
    const f = fakeClient();
    const { svc, space, work } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(s).toMatchObject({ state: "running", terminalId: "t1", provider: "shell" });
    expect(f.terminals[0]?.labels).toMatchObject({ "huhu.vault": "vault-x", "huhu.space": space.id, "huhu.session": s.id });
    expect(s.cwd).toContain(path.basename(work));
    expect(svc.list(space.id)).toHaveLength(1);
  });
  test("同一 requestId 重复提交不会再次 run", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const r = req(space);
    const a = await svc.launch(r);
    const b = await svc.launch(r);
    expect(b.id).toBe(a.id);
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("响应丢失：按 huhu.launch 标签找回唯一终端，不重复 run", async () => {
    const f = fakeClient({ failRun: "throw-after-create" });
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(s).toMatchObject({ state: "running", terminalId: "t1" });
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("run 失败且找不到终端 → failed + HERDR_UNAVAILABLE", async () => {
    const f = fakeClient({ failRun: "throw" });
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space))).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
    expect(svc.list()[0]?.state).toBe("failed");
  });
  test("provider 未检测到 → PROVIDER_NOT_FOUND，且不创建终端；revision 变化 → SPACE_INVALID", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "codex" }))).rejects.toMatchObject({ code: "PROVIDER_NOT_FOUND" });
    await expect(svc.launch(req(space, { spaceRevision: 99 }))).rejects.toMatchObject({ code: "SPACE_INVALID" });
    expect(f.terminals).toHaveLength(0);
  });
  test("claude 启动带 argv；中断/结束调用 terminal.interrupt/kill；重命名", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space, { provider: "claude", model: "opus", prompt: "hi" }));
    expect(s.provider).toBe("claude");
    await svc.interrupt(s.id); await svc.kill(s.id);
    expect(f.calls).toEqual(expect.arrayContaining(["terminal.interrupt", "terminal.kill"]));
    expect(svc.rename(s.id, "我的会话").name).toBe("我的会话");
    expect(() => svc.rename(s.id, " ")).toThrow();
  });
});

const REAL = process.env["HUHU_HERDR_BIN"] ?? "/tmp/claude-1000/herdr-build/src/target/release/herdr-core";
describe.skipIf(!existsSync(REAL))("真实 Herdr Core（Linux）", () => {
  test("启动实例、launch shell 会话、按标签查回、结束会话；Core 实例相互隔离", async () => {
    const rt = tmp();
    const core = new HerdrCore({ bin: REAL, vaultId: "vault-realtest", machineId: "m1abc", runtimeDir: rt });
    try {
      expect((await core.status()).state).toBe("connected");
      const { svc, space } = setup(await core.ensure());
      const s = await svc.launch(req(space));
      expect(s.state).toBe("running");
      const c = await core.ensure();
      const found = await c.call<{ terminals: { address: string; cwd: string }[] }>("terminal.list", { labels: { "huhu.session": s.id } });
      expect(found.terminals).toHaveLength(1);
      expect(found.terminals[0]?.address).toBe(s.terminalId);
      await svc.kill(s.id);
    } finally {
      await core.stop();
    }
  }, 60_000);
});
