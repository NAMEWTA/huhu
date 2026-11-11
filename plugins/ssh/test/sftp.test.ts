import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { HostStore } from "../src/engine/hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { normalizeRemote } from "../src/engine/sftp.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

const dirs: string[] = [];
const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-sftp-")); dirs.push(d); return d; };
const until = async (c: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!c() && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); };

async function connected(o: FakeSshOptions = {}) {
  const srv = await startFakeSsh(o); closers.push(srv.close);
  const root = tmp();
  const hosts = new HostStore(path.join(root, "hosts"));
  const prompts: { attemptId: string }[] = [];
  const mgr: SshManager = new SshManager({
    hosts, knownHostsFile: path.join(root, "known_hosts"), auditDir: path.join(root, "audit"), now: () => new Date("2026-11-11T00:00:00Z"),
    resolveSecret: () => "pw",
    publish: (type, payload) => { if (type === "ssh.hostKeyPrompt") prompts.push(payload as { attemptId: string }); },
    decisionTimeoutMs: 1000,
  });
  closers.push(() => mgr.disposeAll());
  const h = hosts.save({ name: "h", host: "127.0.0.1", port: srv.port, user: "u", auth: { kind: "password", secretRef: "safe://item-pw1" }, jumpHostIds: [], tags: [], connectTimeoutSec: 20 });
  const p = mgr.connect(h.id);
  await until(() => prompts.length > 0);
  mgr.decide(prompts[0]!.attemptId, 0, true);
  await p;
  return { srv, mgr, h, root };
}

describe("远端路径", () => {
  test("空串/~ 为登录目录；必须是 POSIX 绝对路径；拒绝 NUL；规范化", () => {
    expect(normalizeRemote("")).toBe(".");
    expect(normalizeRemote("~")).toBe(".");
    expect(normalizeRemote("/a/b/../c//d")).toBe("/a/c/d");
    expect(() => normalizeRemote("relative/x")).toThrow(/绝对路径/);
    expect(() => normalizeRemote("/a\0b")).toThrow(/空字符/);
  });
});

describe("SFTP 浏览与文本预览", () => {
  test("登录目录列表（目录在前、按名称），子目录，不存在 → NOT_FOUND；预览文本，二进制/过大被拒", async () => {
    const { srv, mgr, h } = await connected();
    srv.fs.dirs.add("/home/test/docs");
    srv.fs.files.set("/home/test/b.txt", Buffer.from("你好 SFTP"));
    srv.fs.files.set("/home/test/a.txt", Buffer.from("A"));
    srv.fs.files.set("/home/test/docs/n.md", Buffer.from("# n"));
    srv.fs.files.set("/home/test/bin.dat", Buffer.from([0, 1, 2, 3]));
    srv.fs.files.set("/home/test/big.txt", Buffer.alloc(2 * 1024 * 1024 + 1, 97));
    const root = await mgr.sftpList(h.id, "");
    expect(root.path).toBe("/home/test");
    expect(root.entries.map((e) => [e.name, e.type])).toEqual([["docs", "dir"], ["a.txt", "file"], ["b.txt", "file"], ["big.txt", "file"], ["bin.dat", "file"]]);
    expect((await mgr.sftpList(h.id, "/home/test/docs")).entries.map((e) => e.name)).toEqual(["n.md"]);
    await expect(mgr.sftpList(h.id, "/nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await mgr.sftpRead(h.id, "/home/test/b.txt")).toEqual({ text: "你好 SFTP", size: Buffer.byteLength("你好 SFTP") });
    await expect(mgr.sftpRead(h.id, "/home/test/bin.dat")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpRead(h.id, "/home/test/big.txt")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpRead(h.id, "/home/test/docs")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpList("host-none", "")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
  });
});

describe("SFTP 写入、覆盖确认（ACC-SH-08）、重命名、删除", () => {
  test("新建文件：先写临时文件再改名，远端不留 .huhu-upload-*；同名需要确认，取消则远端文件不变", async () => {
    const { srv, mgr, h } = await connected();
    await mgr.sftpWrite(h.id, "/home/test/n.txt", "第一版", false);
    expect(srv.fs.files.get("/home/test/n.txt")?.toString()).toBe("第一版");
    expect([...srv.fs.files.keys()].filter((k) => k.includes("huhu-upload"))).toEqual([]);
    await expect(mgr.sftpWrite(h.id, "/home/test/n.txt", "第二版", false)).rejects.toMatchObject({ code: "NAME_CONFLICT" }); // 未确认覆盖
    expect(srv.fs.files.get("/home/test/n.txt")?.toString()).toBe("第一版");
    await mgr.sftpWrite(h.id, "/home/test/n.txt", "第二版", true); // 用户确认覆盖（服务器无 posix-rename：先删后改名）
    expect(srv.fs.files.get("/home/test/n.txt")?.toString()).toBe("第二版");
    expect([...srv.fs.files.keys()].filter((k) => k.includes("huhu-upload"))).toEqual([]);
    await expect(mgr.sftpWrite(h.id, "/home/test", "x", true)).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 目标是目录
  });
  test("mkdir（已存在 → NAME_CONFLICT）、rename（覆盖需确认）、delete（文件 / 空目录；非空目录拒绝；根与登录目录拒绝）", async () => {
    const { srv, mgr, h } = await connected();
    await mgr.sftpMkdir(h.id, "/home/test/d");
    await expect(mgr.sftpMkdir(h.id, "/home/test/d")).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    srv.fs.files.set("/home/test/d/a.txt", Buffer.from("a")); srv.fs.files.set("/home/test/b.txt", Buffer.from("b"));
    await expect(mgr.sftpDelete(h.id, "/home/test/d")).rejects.toBeTruthy(); // 非空目录不递归删除
    expect(srv.fs.dirs.has("/home/test/d")).toBe(true);
    await expect(mgr.sftpRename(h.id, "/home/test/b.txt", "/home/test/d/a.txt", false)).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    await mgr.sftpRename(h.id, "/home/test/b.txt", "/home/test/d/a.txt", true);
    expect(srv.fs.files.get("/home/test/d/a.txt")?.toString()).toBe("b");
    expect(srv.fs.files.has("/home/test/b.txt")).toBe(false);
    await mgr.sftpDelete(h.id, "/home/test/d/a.txt");
    await mgr.sftpDelete(h.id, "/home/test/d");
    expect(srv.fs.dirs.has("/home/test/d")).toBe(false);
    await expect(mgr.sftpDelete(h.id, "/")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpDelete(h.id, "~")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpDelete(h.id, "/home/test/ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("SFTP 上传与下载", () => {
  test("上传本机文件（字节保真，含中文内容与二进制），下载回本机；同名需要确认；符号链接不上传", async () => {
    const { srv, mgr, h } = await connected();
    const local = tmp();
    const bytes = Buffer.concat([Buffer.from("中文\n"), Buffer.from([0, 255, 128]), Buffer.alloc(300_000, 3)]);
    writeFileSync(path.join(local, "up.bin"), bytes);
    const r = await mgr.sftpUpload(h.id, path.join(local, "up.bin"), "/home/test/up.bin", false);
    expect(r.size).toBe(bytes.length);
    expect(srv.fs.files.get("/home/test/up.bin")!.equals(bytes)).toBe(true);
    await expect(mgr.sftpUpload(h.id, path.join(local, "up.bin"), "/home/test/up.bin", false)).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    symlinkSync(path.join(local, "up.bin"), path.join(local, "link.bin"));
    await expect(mgr.sftpUpload(h.id, path.join(local, "link.bin"), "/home/test/l.bin", false)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(mgr.sftpUpload(h.id, "relative.bin", "/home/test/r.bin", false)).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const dest = path.join(local, "down.bin");
    expect((await mgr.sftpDownload(h.id, "/home/test/up.bin", dest, false)).size).toBe(bytes.length);
    expect(readFileSync(dest).equals(bytes)).toBe(true);
    await expect(mgr.sftpDownload(h.id, "/home/test/up.bin", dest, false)).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    await mgr.sftpDownload(h.id, "/home/test/up.bin", dest, true);
    await expect(mgr.sftpDownload(h.id, "/home/test", path.join(local, "d2"), false)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(readdirSync(local).filter((f) => f.includes("huhu-download"))).toEqual([]);
  });
  test("取消：下载中止后本机不留临时文件和半个文件", async () => {
    const { srv, mgr, h } = await connected();
    srv.fs.files.set("/home/test/big.bin", Buffer.alloc(8 * 1024 * 1024, 1));
    const local = tmp();
    const ac = new AbortController(); ac.abort();
    await expect(mgr.sftpDownload(h.id, "/home/test/big.bin", path.join(local, "big.bin"), false, ac.signal)).rejects.toThrow();
    expect(readdirSync(local)).toEqual([]);
  });
  test("传输中途断线：远端的 .huhu-upload 临时文件不会被当成成品，错误是 SSH_DISCONNECTED 或明确的失败；目标文件不存在", async () => {
    const { srv, mgr, h } = await connected({ dropAfterWrites: 3 });
    const local = tmp();
    writeFileSync(path.join(local, "big.bin"), Buffer.alloc(4 * 1024 * 1024, 9));
    await expect(mgr.sftpUpload(h.id, path.join(local, "big.bin"), "/home/test/big.bin", false)).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    expect(srv.fs.files.has("/home/test/big.bin")).toBe(false); // 没有 rename 成成品
  }, 20_000);
  test("同一主机同时只传一个文件", async () => {
    const { srv, mgr, h } = await connected();
    srv.fs.files.set("/home/test/x.bin", Buffer.alloc(2 * 1024 * 1024, 1));
    const local = tmp();
    const first = mgr.sftpDownload(h.id, "/home/test/x.bin", path.join(local, "1.bin"), false);
    await expect(mgr.sftpDownload(h.id, "/home/test/x.bin", path.join(local, "2.bin"), false)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await first;
    await mgr.sftpDownload(h.id, "/home/test/x.bin", path.join(local, "3.bin"), false); // 完成后可再传
    expect(existsSync(path.join(local, "3.bin"))).toBe(true);
  });
});

describe("取消、超时与覆盖的安全", () => {
  test("用户取消传输：立即返回、互斥释放、可以马上再传；ssh.sftp.cancel 无传输时返回 false", async () => {
    const { srv, mgr, h } = await connected();
    srv.fs.files.set("/home/test/x.bin", Buffer.alloc(8 * 1024 * 1024, 1));
    const local = tmp();
    expect(mgr.sftpCancel(h.id)).toBe(false);
    const p = mgr.sftpDownload(h.id, "/home/test/x.bin", path.join(local, "x.bin"), false);
    await until(() => mgr.sftpCancel(h.id), 2000);
    await expect(p).rejects.toThrow();
    expect(readdirSync(local)).toEqual([]);
    await mgr.sftpDownload(h.id, "/home/test/x.bin", path.join(local, "y.bin"), false); // 互斥已释放
    expect(existsSync(path.join(local, "y.bin"))).toBe(true);
  });
  test("覆盖降级路径（服务器没有 posix-rename）：先备份旧文件再替换，成功后备份与临时文件都被清掉", async () => {
    const { srv, mgr, h } = await connected();
    srv.fs.files.set("/home/test/keep.txt", Buffer.from("旧内容"));
    await mgr.sftpWrite(h.id, "/home/test/keep.txt", "新内容", true);
    expect(srv.fs.files.get("/home/test/keep.txt")?.toString()).toBe("新内容");
    expect([...srv.fs.files.keys()].filter((k) => k.includes("huhu-old") || k.includes("huhu-upload"))).toEqual([]); // 备份与临时文件都清掉了
  });
});

describe("SFTP 不可用与审计", () => {
  test("服务器没有 SFTP 子系统 → 明确提示；审计记录动作与远端路径，不含文件内容", async () => {
    const { mgr, h } = await connected({ noSftp: true });
    await expect(mgr.sftpList(h.id, "")).rejects.toMatchObject({ message: expect.stringContaining("SFTP") });
    const ok = await connected();
    await ok.mgr.sftpWrite(ok.h.id, "/home/test/secret.txt", "TOP-SECRET-CONTENT", false);
    const log = ok.mgr.auditList(ok.h.id);
    expect(log.some((a) => a.action === "sftp.write" && a.result === "ok" && a.detail === "/home/test/secret.txt")).toBe(true);
    expect(JSON.stringify(log)).not.toContain("TOP-SECRET-CONTENT");
    expect(mgr.auditList(h.id).some((a) => a.action === "sftp.list" && a.result === "failed")).toBe(true);
  });
});
