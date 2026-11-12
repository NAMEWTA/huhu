import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { HerdrCore } from "../src/engine/herdr-core.js";
import { ProviderDetector } from "../src/engine/providers/index.js";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-ss-"));
  dirs.push(d);
  return d;
};

function fakeClient(opts: { failRun?: "throw-after-create" | "throw"; failSend?: string; failSendTransport?: boolean } = {}) {
  const terminals: { address: string; labels: Record<string, string>; state?: string; exit_code?: number | null; finished_ms?: number | null }[] = [];
  const calls: string[] = [];
  const runs: { argv?: string[]; cwd?: string }[] = [];
  const sends: { terminal?: string; text?: string }[] = [];
  const client = {
    call: async (method: string, params: { labels?: Record<string, string>; terminal?: string; argv?: string[]; cwd?: string; text?: string }) => {
      calls.push(method);
      if (method === "terminal.send") {
        if (opts.failSend) throw new HerdrError({ code: -32000, message: opts.failSend, data: { kind: "not_found" } });
        if (opts.failSendTransport) throw new Error("timeout");
        sends.push({ terminal: params.terminal as string, text: params.text as string });
        return {};
      }
      if (method === "terminal.run") {
        runs.push({ ...(params.argv ? { argv: params.argv } : {}), ...(params.cwd ? { cwd: params.cwd } : {}) });
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
  const finish = (address: string, code: number | null) => {
    const x = terminals.find((y) => y.address === address);
    if (x) {
      x.state = "finished";
      x.exit_code = code;
      x.finished_ms = Date.parse("2026-11-11T00:30:00Z");
    }
  };
  return { client, calls, terminals, runs, sends, finish };
}

function setup(client: HerdrClient, over: Partial<ConstructorParameters<typeof SessionsService>[0]> = {}) {
  const root = tmp();
  const work = tmp();
  const bin = tmp();
  writeFileSync(path.join(bin, "claude"), "#!/bin/sh\necho 2.0.0\n");
  chmodSync(path.join(bin, "claude"), 0o755);
  const spaces = new SpaceStore(path.join(root, "spaces"), "m1");
  const space = spaces.save({ name: "S", root: work });
  const svc = new SessionsService({
    dir: path.join(root, "sessions"),
    vaultId: "vault-x",
    spaces,
    core: async () => client,
    detect: () => new ProviderDetector(() => 0, { PATH: bin }).detect(),
    now: () => new Date("2026-11-11T00:00:00Z"),
    ...over,
  });
  return { svc, space, work };
}
const req = (space: { id: string; revision: number }, over: Record<string, unknown> = {}) => ({
  spaceId: space.id,
  spaceRevision: space.revision,
  provider: "shell" as const,
  requestId: `req-${Math.random().toString(36).slice(2)}`,
  ...over,
});

describe("HerdrCore.peek（不 mock：真实端点检查）", () => {
  test("没有任何 Core 在监听：peek 返回 absent，且不会启动它（二进制不存在也不报错）", async () => {
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    expect(await core.peek()).toBe("absent");
  });
  test.skipIf(process.platform === "win32")("并发 peek：只保留一个连接，被丢弃的重复连接关闭后不会把保留的那个清掉", async () => {
    const net = await import("node:net");
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    const srv = net.createServer((s) => {
      s.on("error", () => undefined);
    });
    await new Promise<void>((r) => srv.listen(core.endpoint, r));
    try {
      const [a, b] = await Promise.all([core.peek(), core.peek()]);
      expect(a).not.toBe("absent");
      expect(a).not.toBeNull();
      expect(b).toBe(a);
      await new Promise((r) => setTimeout(r, 300)); // 等被丢弃的那条连接的关闭事件
      expect(await core.peek()).toBe(a); // 仍是同一个，没有重新建连
      core.dispose();
    } finally {
      srv.close();
    }
  });
  test("接线到 SessionsService：Core 不在时，记录为 running 的会话对账后变成 exited", async () => {
    const f = fakeClient();
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    const { svc, space } = setup(f.client, { peekCore: () => core.peek() });
    const s = await svc.launch(req(space));
    expect(svc.get(s.id).state).toBe("running");
    await svc.reconcile();
    expect(svc.get(s.id)).toMatchObject({ state: "exited", error: expect.stringContaining("没有在运行") });
  });
});

describe("会话对账（终端是否已结束）", () => {
  test("程序退出：记录变为 exited 并带退出码与结束时间；仍在运行的不动；之后发送审查意见被拒绝", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    const b = await svc.launch(req(space));
    f.finish(a.terminalId as string, 3);
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "exited", exitCode: 3, exitedAt: "2026-11-11T00:30:00.000Z" });
    expect(svc.get(b.id).state).toBe("running");
    svc.addComment(a.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(svc.sendComments(a.id)).rejects.toThrow(/恢复会话/);
  });
  test("终端已不存在（Core 重启过）：exited 并说明原因；Core 连不上：保持原状", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    f.terminals.length = 0; // Core 里已经没有这个终端
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "exited", exitCode: null, error: expect.stringContaining("不存在") });
  });
  test("Core 暂时连不上（判断不了）：保持 running 不动；确认没有 Core 在监听（absent）：全部标为已结束并说明", async () => {
    let mode: "up" | "unknown" | "absent" = "up";
    const f = fakeClient();
    const { svc, space } = setup(f.client, { peekCore: async () => (mode === "up" ? f.client : mode === "unknown" ? null : "absent") });
    const a = await svc.launch(req(space));
    mode = "unknown";
    await svc.reconcile();
    expect(svc.get(a.id).state).toBe("running");
    mode = "absent";
    await new Promise((r) => setTimeout(r, 2100)); // 过了节流窗口
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "exited", error: expect.stringContaining("没有在运行") });
  });
  test("地址被别的终端占用（标签不是这个会话）：不能把旧会话当成还在运行", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    f.terminals[0]!.labels = { ...f.terminals[0]!.labels, "huhu.session": "sess-someone-else" }; // Core 重置后 t1 被别的会话的终端复用
    await svc.reconcile();
    expect(svc.get(a.id).state).toBe("exited");
  });
  test("2 秒内重复对账直接跳过（不反复打 Core）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await svc.launch(req(space));
    await svc.reconcile();
    await svc.reconcile();
    await svc.reconcile();
    expect(f.calls.filter((c) => c === "terminal.list")).toHaveLength(1);
  });
});

describe("变更审查意见", () => {
  test("添加/删除/校验；发送：格式为“文件:新|旧行 — 意见”，成功后才标记已发送，只发未发送的", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const a = svc.addComment(s.id, { path: "src/a.md", side: "new", line: 12, text: "这里\n需要处理空值" });
    svc.addComment(s.id, { path: "b.md", side: "old", line: 3, text: "旧逻辑为什么删了？" });
    expect(a.text).toBe("这里 需要处理空值"); // 换行压缩
    expect(() => svc.addComment(s.id, { path: "../x", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "/abs", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 0, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 1, text: "  " })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 1, text: "长".repeat(2001) })).toThrow();
    const r = await svc.sendComments(s.id);
    expect(r.sent).toBe(2);
    expect(f.sends).toHaveLength(1);
    expect(f.sends[0]).toMatchObject({ terminal: s.terminalId, text: "请根据以下审查意见继续工作：\nsrc/a.md:新12 — 这里 需要处理空值\nb.md:旧3 — 旧逻辑为什么删了？" });
    expect(svc.comments(s.id).every((c) => c.sentAt !== null && !c.sending)).toBe(true);
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 没有待发送的
    const c = svc.addComment(s.id, { path: "c.md", side: "new", line: 1, text: "新增的" });
    expect((await svc.sendComments(s.id)).sent).toBe(1); // 只发新增的
    expect(f.sends[1]!.text).not.toContain("src/a.md");
    svc.deleteComment(s.id, c.id);
    expect(svc.comments(s.id)).toHaveLength(2);
    expect(() => svc.deleteComment(s.id, "rc-none")).toThrow();
  });
  test("发送失败：意见保持未发送且不留“发送中”；终端已不存在 → 提示恢复会话；会话没在运行 → 拒绝", async () => {
    const f = fakeClient({ failSend: "terminal not found" });
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(svc.sendComments(s.id)).rejects.toThrow(/恢复会话/);
    expect(svc.comments(s.id)[0]).toMatchObject({ sentAt: null });
    expect(svc.comments(s.id)[0]!.sending).toBeUndefined();
    const g = fakeClient({ failRun: "throw" });
    const other = setup(g.client);
    const failed = await other.svc.launch(req(other.space)).catch(() => null);
    expect(failed).toBeNull();
    const rec = other.svc.list(other.space.id)[0]!;
    other.svc.addComment(rec.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(other.svc.sendComments(rec.id)).rejects.toThrow(/恢复会话/); // 状态 failed：没有运行中的会话
  });
  test("路径里的控制字符被拒绝；写进终端的路径把 shell 元字符换成 _；dryRun 只预览不发送、不改状态", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(() => svc.addComment(s.id, { path: "a\nrm -rf ~", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a\u0085b", side: "new", line: 1, text: "x" })).toThrow();
    svc.addComment(s.id, { path: "笔记/a.md;echo INJECT $(id) `x` | y", side: "new", line: 2, text: "注意" });
    const dry = await svc.sendComments(s.id, undefined, true);
    expect(dry.sent).toBe(0);
    expect(dry.text).toBe("请根据以下审查意见继续工作：\n笔记/a.md_echo INJECT __id_ _x_ _ y:新2 — 注意");
    expect(f.sends).toHaveLength(0);
    expect(svc.comments(s.id)[0]).toMatchObject({ sentAt: null });
    await svc.sendComments(s.id);
    expect(f.sends[0]!.text).toBe(dry.text);
  });
  test("已发送的意见不能通过显式 ids 再发；传输层错误（超时/断开）保留“发送状态未知”，Core 明确拒绝则清除", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await svc.sendComments(s.id);
    await expect(svc.sendComments(s.id, [c.id])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.sends).toHaveLength(1);
    const g = fakeClient({ failSendTransport: true });
    const o = setup(g.client);
    const os = await o.svc.launch(req(o.space));
    const oc = o.svc.addComment(os.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(o.svc.sendComments(os.id)).rejects.toThrow(/发送结果未知/);
    expect(o.svc.comments(os.id)[0]).toMatchObject({ id: oc.id, sentAt: null, sending: true });
    await expect(o.svc.sendComments(os.id)).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 默认不会自动重发
  });
  test("损坏的会话记录不拖垮列表", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await svc.launch(req(space));
    const dir = (svc as unknown as { d: { dir: string } }).d.dir;
    writeFileSync(path.join(dir, "sess-broken.json"), "{坏的");
    expect(svc.list(space.id)).toHaveLength(1);
  });
  test("意见正文里的 C0/C1 控制字符被替换成空格（不会作为转义序列进入终端）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "前\u001b[31m红\u009b后\u0007" });
    expect(c.text).toBe("前 [31m红 后");
  });
  test("并发发送同一会话：第二次被拒绝，不会重复写入终端", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    const [a, b] = await Promise.allSettled([svc.sendComments(s.id), svc.sendComments(s.id)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(f.sends).toHaveLength(1);
  });
  test("上一次发送中断（记录里停留在发送中）：默认不重发，需要明确选择", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    const rec = svc.get(s.id);
    (svc as unknown as { save(r: unknown): void }).save({ ...rec, reviewComments: [{ ...c, sending: true }] });
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await svc.sendComments(s.id, [c.id])).sent).toBe(1);
  });
});

describe("恢复历史会话", () => {
  test.skipIf(process.platform === "win32")("claude：argv 为 --resume <id>，在原会话的子目录启动，记录保存原生 id", async () => {
    const f = fakeClient();
    const { svc, space, work } = setup(f.client);
    mkdirSync(path.join(work, "sub"));
    const s = await svc.launch(req(space, { provider: "claude", resumeSessionId: "abc-123", cwd: path.join(work, "sub") }));
    const run = f.runs[0];
    expect(run?.argv?.slice(1)).toEqual(["--resume", "abc-123"]);
    expect(run?.cwd).toBe(path.join(work, "sub"));
    expect(s).toMatchObject({ nativeSessionId: "abc-123", state: "running" });
    expect(s.cwd).toBe(path.join(work, "sub"));
  });
  test.skipIf(process.platform === "win32")("非法的原生会话 id 被拒绝（不能以 - 开头）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "claude", resumeSessionId: "--dangerously-skip-permissions" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.calls).not.toContain("terminal.run");
  });
  test.skipIf(process.platform === "win32")("启动目录不在 Space 之内 → 拒绝，且不启动", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "claude", resumeSessionId: "abc", cwd: tmp() }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.calls).not.toContain("terminal.run");
  });
});

describe("会话启动", () => {
  test("ACC-AG-02 shell：不传 argv，cwd=Space 根，带四个标签；记录先持久化后 running", async () => {
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
  test("ACC-AG-07 响应丢失：按 huhu.launch 标签找回唯一终端，不重复 run", async () => {
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
  test.skipIf(process.platform === "win32")("claude 启动带 argv；中断/结束调用 terminal.interrupt/kill；重命名", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space, { provider: "claude", model: "opus", prompt: "hi" }));
    expect(s.provider).toBe("claude");
    await svc.interrupt(s.id);
    await svc.kill(s.id);
    expect(f.calls).toEqual(expect.arrayContaining(["terminal.interrupt", "terminal.kill"]));
    expect(svc.rename(s.id, "我的会话").name).toBe("我的会话");
    expect(() => svc.rename(s.id, " ")).toThrow();
  });
});

const REAL = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");
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

describe("审计回归", () => {
  test("相同 requestId 并发提交只 run 一次", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const r = req(space);
    const [a, b] = await Promise.all([svc.launch(r), svc.launch(r)]);
    expect(a.id).toBe(b.id);
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("prompt / model / effort 不能以 - 开头（避免被 CLI 当作选项）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    for (const over of [{ prompt: "--dangerously-skip-permissions" }, { model: "-x" }, { effort: "--high" }]) {
      await expect(svc.launch(req(space, { provider: "claude", ...over }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(f.terminals).toHaveLength(0);
  });
});
