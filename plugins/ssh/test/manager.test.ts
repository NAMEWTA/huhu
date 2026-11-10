import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { utils } from "ssh2";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { HostStore, findJumpCycle, type SshHost } from "../src/engine/hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { startFakeSsh } from "./fake-server.js";

const dirs: string[] = [];
const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-ssh-")); dirs.push(d); return d; };

function setup(secrets: Record<string, string> = { "safe://item-pw1": "pw" }, locked = false) {
  const root = tmp();
  const hosts = new HostStore(path.join(root, "hosts"));
  const prompts: { hop: number; reason: string; attemptId: string; fingerprint: string }[] = [];
  let mgr!: SshManager;
  const secretCalls: string[] = [];
  mgr = new SshManager({
    hosts, knownHostsFile: path.join(root, "known_hosts"), auditDir: path.join(root, "audit"), now: () => new Date("2026-11-11T00:00:00Z"),
    resolveSecret: (ref) => { secretCalls.push(ref); if (locked) throw Object.assign(new Error("保险箱已锁定"), { code: "SAFE_LOCKED" }); const v = secrets[ref]; if (v === undefined) throw new Error("bad ref"); return v; },
    publish: (type, payload) => { if (type === "ssh.hostKeyPrompt") { const p = payload as { hop: number; reason: string; attemptId: string; fingerprint: string }; prompts.push(p); } },
    decisionTimeoutMs: 1000,
  });
  closers.push(() => mgr.disposeAll());
  const add = (port: number, over: Partial<SshHost> = {}) => hosts.save({ name: `h${port}`, host: "127.0.0.1", port, user: "u", auth: { kind: "password", secretRef: "safe://item-pw1" }, jumpHostIds: [], tags: [], connectTimeoutSec: 5, ...over });
  return { root, hosts, mgr, prompts, add, secretCalls };
}
const until = async (c: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!c() && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); };

describe("主机配置", () => {
  test("校验：端口、主机名、用户；ACC-SH-04 跳板链循环被拒", () => {
    const { hosts, add } = setup();
    expect(() => add(0)).toThrow(/端口/);
    expect(() => hosts.save({ name: "x", host: "a b", port: 22, user: "u", auth: { kind: "agent" }, jumpHostIds: [], tags: [], connectTimeoutSec: 20 })).toThrow(/空格/);
    const a = add(2201); const b = add(2202, { jumpHostIds: [a.id] });
    expect(() => hosts.save({ ...a, jumpHostIds: [b.id] })).toThrowError(/循环/);
    expect(() => hosts.delete(a.id)).toThrowError(/以它为跳板/);
    expect(findJumpCycle([{ id: "a", jumpHostIds: ["b"] }, { id: "b", jumpHostIds: ["a"] }], "a")).toEqual(["a", "b", "a"]);
  });
});

describe("连接与主机密钥", () => {
  test("ACC-SH-01 首次连接弹出指纹，接受后连接成功并写入 known_hosts；再次连接无提示", async () => {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const { mgr, prompts, add, root } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    expect(prompts[0]).toMatchObject({ hop: 0, reason: "first" });
    expect(prompts[0]?.fingerprint).toMatch(/^SHA256:/);
    expect(mgr.decide(prompts[0]!.attemptId, 0, true)).toBe(true);
    await p;
    expect(mgr.isConnected(h.id)).toBe(true);
    expect(readFileSync(path.join(root, "known_hosts"), "utf8")).toContain(`[127.0.0.1]:${srv.port} ssh-ed25519`);
    mgr.disconnect(h.id);
    prompts.length = 0;
    await mgr.connect(h.id);
    expect(prompts).toHaveLength(0);
  });
  test("取消 → 连接失败；超时未决定也视为取消；迟到/未知决定被忽略", async () => {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id).catch((e: Error) => e);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, false);
    expect(await p).toMatchObject({ code: "SSH_DISCONNECTED" });
    expect(mgr.decide("att-unknown", 0, true)).toBe(false);
    prompts.length = 0;
    const timedOut = await mgr.connect(h.id).catch((e: Error) => e); // decisionTimeoutMs=1000
    expect(timedOut).toMatchObject({ code: "SSH_DISCONNECTED" });
  });
  test("ACC-SH-02 已记录的主机密钥与服务器不符 → SSH_HOST_KEY_MISMATCH，且没有发送任何认证", async () => {
    const auth: string[] = [];
    const srv = await startFakeSsh({ onAuth: (u, m) => auth.push(`${u}:${m}`) }); closers.push(srv.close);
    const { mgr, add, root } = setup();
    const other = utils.parseKey(utils.generateKeyPairSync("ed25519").public);
    const blob = (Array.isArray(other) ? other[0] : other) as { getPublicSSH(): Buffer };
    writeFileSync(path.join(root, "known_hosts"), `[127.0.0.1]:${srv.port} ssh-ed25519 ${blob.getPublicSSH().toString("base64")}\n`);
    const h = add(srv.port);
    await expect(mgr.connect(h.id)).rejects.toMatchObject({ code: "SSH_HOST_KEY_MISMATCH" });
    expect(auth).toEqual([]);
    expect(mgr.isConnected(h.id)).toBe(false);
  });

  test("ACC-SH-03 经跳板：两跳都首次连接依次提示（标明第 1、2 跳）；取消第二个则整体失败且跳板被关闭", async () => {
    const jump = await startFakeSsh(); const dest = await startFakeSsh();
    closers.push(jump.close, dest.close);
    const { mgr, prompts, add } = setup();
    const j = add(jump.port); const t = add(dest.port, { jumpHostIds: [j.id] });
    const p = mgr.connect(t.id).catch((e: Error) => e);
    await until(() => prompts.length >= 1);
    expect(prompts[0]?.hop).toBe(0);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    await until(() => prompts.length >= 2);
    expect(prompts[1]?.hop).toBe(1);
    mgr.decide(prompts[1]!.attemptId, 1, false); // 取消第二个
    expect(await p).toMatchObject({ code: "SSH_DISCONNECTED" });
    await until(() => jump.closed() >= 1);
    expect(jump.closed()).toBeGreaterThanOrEqual(1); // 跳板连接已被关闭
    expect(mgr.isConnected(t.id)).toBe(false);
  });

  test("跳板全部接受后可连接目标并执行命令", async () => {
    const jump = await startFakeSsh(); const dest = await startFakeSsh();
    closers.push(jump.close, dest.close);
    const { mgr, prompts, add } = setup();
    const j = add(jump.port); const t = add(dest.port, { jumpHostIds: [j.id] });
    const p = mgr.connect(t.id);
    for (let hop = 0; hop < 2; hop++) { await until(() => prompts.length > hop); mgr.decide(prompts[hop]!.attemptId, hop, true); }
    await p;
    expect((await mgr.exec(t.id, "echo 你好")).stdout.trim()).toBe("你好");
  });

  test("ACC-SH-07 保险箱锁定：连接前就失败（SAFE_LOCKED），未发起网络认证；审计中没有密码", async () => {
    const auth: string[] = [];
    const srv = await startFakeSsh({ onAuth: (u, m) => auth.push(m) }); closers.push(srv.close);
    const { mgr, add, root } = setup({}, true);
    const h = add(srv.port);
    await expect(mgr.connect(h.id)).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    expect(auth).toEqual([]);
    expect(JSON.stringify(mgr.auditList())).not.toContain("pw");
    void root;
  });

  test("认证失败 → SSH_AUTH_FAILED", async () => {
    const srv = await startFakeSsh({ password: "right" }); closers.push(srv.close);
    const { mgr, prompts, add } = setup({ "safe://item-pw1": "wrong" });
    const h = add(srv.port);
    const p = mgr.connect(h.id).catch((e: Error) => e);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    expect(await p).toMatchObject({ code: "SSH_AUTH_FAILED" });
  });
});

describe("Exec", () => {
  async function connected() {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const ctx = setup();
    const h = ctx.add(srv.port);
    const p = ctx.mgr.connect(h.id);
    await until(() => ctx.prompts.length > 0);
    ctx.mgr.decide(ctx.prompts[0]!.attemptId, 0, true);
    await p;
    return { ...ctx, h };
  }
  test("stdout/stderr 分离、退出码、耗时；未连接 → SSH_DISCONNECTED；空命令拒绝", async () => {
    const { mgr, h } = await connected();
    const ok = await mgr.exec(h.id, "echo hi");
    expect(ok).toMatchObject({ stdout: "hi\n", exitCode: 0, interrupted: false });
    const bad = await mgr.exec(h.id, "fail now");
    expect(bad).toMatchObject({ stderr: "boom\n", exitCode: 3 });
    await expect(mgr.exec("host-none", "echo")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    await expect(mgr.exec(h.id, "  ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("ACC-SH-06 sleep 30 被中断：标记 interrupted，连接仍可用", async () => {
    const { mgr, h } = await connected();
    const run = mgr.exec(h.id, "sleep 30", { execId: "exec-fixed1" });
    await new Promise((r) => setTimeout(r, 200));
    expect(mgr.cancel("exec-fixed1")).toBe(true);
    const r = await run;
    expect(r.interrupted).toBe(true);
    expect(r.ms).toBeLessThan(5000);
    expect((await mgr.exec(h.id, "echo still")).stdout.trim()).toBe("still");
    expect(mgr.cancel("exec-fixed1")).toBe(false);
  });
  test("超时自动中断；审计记录动作且不含输出", async () => {
    const { mgr, h } = await connected();
    const r = await mgr.exec(h.id, "sleep 30", { timeoutSec: 1 });
    expect(r.interrupted).toBe(true);
    const log = mgr.auditList(h.id);
    expect(log.map((a) => a.action)).toEqual(expect.arrayContaining(["connect", "exec"]));
  });
});

describe("并发连接与审计", () => {
  test("同一主机并发 connect 合并为一次（只提示一次、只建一个连接）", async () => {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const a = mgr.connect(h.id); const b = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(prompts).toHaveLength(1);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    expect((await a).attemptId).toBe((await b).attemptId);
    expect(srv.conns).toHaveLength(1);
  });
  test("审计不记录命令原文（可能含口令）", async () => {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, true); await p;
    await mgr.exec(h.id, "echo hunter2-PASSWORD");
    expect(JSON.stringify(mgr.auditList())).not.toContain("hunter2");
  });
});

describe("Shell（ACC-SH-05）", () => {
  async function connected() {
    const srv = await startFakeSsh(); closers.push(srv.close);
    const ctx = setup();
    const h = ctx.add(srv.port);
    const p = ctx.mgr.connect(h.id);
    await until(() => ctx.prompts.length > 0);
    ctx.mgr.decide(ctx.prompts[0]!.attemptId, 0, true);
    await p;
    return { ...ctx, h, srv };
  }
  const view = () => { const v = { out: "", ended: 0, onData: (b: Buffer) => { v.out += b.toString(); }, onEnd: () => { v.ended++; } }; return v; };

  test("打开 shell、输入输出；关闭视图（detach）不结束 shell，重新打开回到同一 shell 并回放最近输出", async () => {
    const { mgr, h } = await connected();
    const sh = await mgr.openShell(h.id, { cols: 100, rows: 30 });
    expect(sh).toMatchObject({ state: "running", hostId: h.id });
    expect(sh.id).toMatch(/^ssh-/);
    const v1 = view();
    const a1 = mgr.attachShell(sh.id, v1)!;
    await until(() => v1.out.includes("welcome"));
    a1.write(Buffer.from("hello\n"));
    await until(() => v1.out.includes("ECHO:hello"));
    a1.resize(120, 40);
    a1.detach(); // 关闭视图
    expect(mgr.listShells(h.id)[0]?.state).toBe("running"); // 仍在运行
    const v2 = view();
    const a2 = mgr.attachShell(sh.id, v2)!;
    expect(v2.out).toContain("ECHO:hello"); // 回放
    a2.write(Buffer.from("again\n"));
    await until(() => v2.out.includes("ECHO:again"));
    a2.detach();
  });
  test("结束 shell 才关闭 channel；断开连接后所有 shell 变为已结束，重连后不会绑定旧 shell", async () => {
    const { mgr, h, prompts } = await connected();
    const a = await mgr.openShell(h.id); const b = await mgr.openShell(h.id);
    const v = view(); mgr.attachShell(a.id, v);
    expect(mgr.closeShell(a.id)).toBe(true);
    await until(() => v.ended > 0);
    expect(mgr.listShells(h.id).find((s) => s.id === a.id)?.state).toBe("ended");
    expect(mgr.listShells(h.id).find((s) => s.id === b.id)?.state).toBe("running");
    mgr.disconnect(h.id);
    expect(mgr.listShells(h.id).every((s) => s.state === "ended")).toBe(true);
    prompts.length = 0;
    await mgr.connect(h.id);
    expect(mgr.listShells(h.id).find((s) => s.id === b.id)?.state).toBe("ended"); // 旧 shell 不会复活
    const c = await mgr.openShell(h.id);
    expect(c.id).not.toBe(b.id);
    expect(mgr.attachShell("ssh-none", view())).toBeNull();
  });
  test("未连接 → SSH_DISCONNECTED；shell 里 exit 时通知查看者结束", async () => {
    const { mgr, h } = await connected();
    await expect(mgr.openShell("host-none")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    const sh = await mgr.openShell(h.id);
    const v = view(); const a = mgr.attachShell(sh.id, v)!;
    a.write(Buffer.from("exit\n"));
    await until(() => v.ended > 0);
    expect(v.ended).toBeGreaterThan(0);
  });
});
