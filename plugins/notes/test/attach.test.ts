import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, Trash, VaultFiles, VaultIndex } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { NotesService } from "../src/engine/service.js";
import { hasProtectedSegment, isAllowedAttachment, MAX_ATTACH_BYTES, sanitizeAttachmentName, uniqueName } from "../src/shared/attachments.js";
import { bytesToBase64, checkAttachable } from "../src/ui/attach.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup(files: Record<string, string> = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-att-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), c);
  }
  const vf = new VaultFiles(root);
  const index = new VaultIndex(root);
  await index.build();
  const ops = new OperationLog(vf, path.join(d, "ops"));
  const svc = new NotesService({ files: vf, stateDir: path.join(vf.root, ".huhu"), ops, index, trash: new Trash(vf), now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC" });
  return { svc, root, opsDir: path.join(d, "ops") };
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("附件规则（纯函数）", () => {
  test("类型白名单与文件名清理", () => {
    expect(isAllowedAttachment("a.PNG")).toBe(true);
    expect(isAllowedAttachment("a.pdf")).toBe(true);
    expect(isAllowedAttachment("a.exe")).toBe(false);
    expect(isAllowedAttachment("noext")).toBe(false);
    expect(sanitizeAttachmentName("../../etc/pass:wd.png")).toBe("passwd.png");
    expect(sanitizeAttachmentName("C:\\x\\图 1.png")).toBe("图 1.png");
    expect(sanitizeAttachmentName("...")).toBe("attachment");
  });
  test("去重命名与受保护目录", () => {
    const taken = new Set(["a.png", "a-1.png"]);
    expect(uniqueName("a.png", (n) => taken.has(n))).toBe("a-2.png");
    expect(uniqueName("b.png", (n) => taken.has(n))).toBe("b.png");
    expect(hasProtectedSegment("docs/.git/x")).toBe(true);
    expect(hasProtectedSegment("docs/attachments")).toBe(false);
  });
  test("客户端预检：空文件 / 超限 / 类型", () => {
    expect(checkAttachable({ name: "a.png", size: 0 })).toMatch(/空/);
    expect(checkAttachable({ name: "a.png", size: MAX_ATTACH_BYTES + 1 })).toMatch(/上限/);
    expect(checkAttachable({ name: "a.exe", size: 10 })).toMatch(/不支持/);
    expect(checkAttachable({ name: "a.png", size: 10 })).toBeNull();
  });
  test("base64 分块转换与 Buffer 解码一致（含 > 一个分块的数据）", () => {
    const big = new Uint8Array(0x8000 * 2 + 5).map((_, i) => i % 251);
    expect(Buffer.from(bytesToBase64(big), "base64").equals(Buffer.from(big))).toBe(true);
  });
});

describe("notes.attach（NotesService.attach）", () => {
  test("笔记旁的 attachments/：原子写入，字节一致，OperationLog 有记录", async () => {
    const { svc, root, opsDir } = await setup({ "docs/说明.md": "# 说明\n" });
    const r = await svc.attach({ notePath: "docs/说明.md", name: "截图.png", bytes: PNG });
    expect(r).toEqual({ path: "docs/attachments/截图.png", size: PNG.length, deduped: false });
    expect(readFileSync(path.join(root, r.path)).equals(PNG)).toBe(true);
    expect(readdirSync(opsDir).some((f) => f.endsWith(".json"))).toBe(true);
    expect(readdirSync(path.join(root, "docs/attachments")).filter((f) => f.includes(".tmp"))).toEqual([]);
  });
  test("同名同内容 → deduped（不新增文件）；同名不同内容 → -1", async () => {
    const { svc, root } = await setup({ "n.md": "x" });
    const a = await svc.attach({ notePath: "n.md", name: "a.png", bytes: PNG });
    const again = await svc.attach({ notePath: "n.md", name: "a.png", bytes: PNG });
    expect(again).toEqual({ path: a.path, size: PNG.length, deduped: true });
    const other = await svc.attach({ notePath: "n.md", name: "a.png", bytes: Buffer.concat([PNG, Buffer.from([1])]) });
    expect(other.path).toBe("attachments/a-1.png");
    expect(readdirSync(path.join(root, "attachments")).sort()).toEqual(["a-1.png", "a.png"]);
  });
  test("文件树拖入：dir 直接落在该目录", async () => {
    const { svc, root } = await setup({ "资料/x.md": "x" });
    const r = await svc.attach({ dir: "资料", name: "报告.pdf", bytes: Buffer.from("%PDF-1.4") });
    expect(r.path).toBe("资料/报告.pdf");
    expect(existsSync(path.join(root, r.path))).toBe(true);
  });
  test("拒绝：空文件、超限、未知类型、受保护目录、越界目录", async () => {
    const { svc } = await setup({ "n.md": "x" });
    await expect(svc.attach({ notePath: "n.md", name: "a.png", bytes: new Uint8Array(0) })).rejects.toThrow(/空/);
    await expect(svc.attach({ notePath: "n.md", name: "a.png", bytes: new Uint8Array(MAX_ATTACH_BYTES + 1) })).rejects.toThrow(/上限/);
    await expect(svc.attach({ notePath: "n.md", name: "a.exe", bytes: PNG })).rejects.toThrow(/不支持/);
    await expect(svc.attach({ dir: ".git", name: "a.png", bytes: PNG })).rejects.toThrow(/受保护/);
    await expect(svc.attach({ dir: ".huhu/notes", name: "a.png", bytes: PNG })).rejects.toThrow(/受保护/);
    await expect(svc.attach({ dir: "../outside", name: "a.png", bytes: PNG })).rejects.toThrow();
  });
  test("文件名里的路径片段被清理，不会逃出目标目录", async () => {
    const { svc, root } = await setup({ "n.md": "x" });
    const r = await svc.attach({ notePath: "n.md", name: "../../evil.png", bytes: PNG });
    expect(r.path).toBe("attachments/evil.png");
    expect(existsSync(path.join(root, "..", "evil.png"))).toBe(false);
  });
});
