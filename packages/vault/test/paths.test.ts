import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { normalizeRelPath, resolveInVault } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-v-")); dirs.push(d); return d; };

describe("路径守卫", () => {
  test("拒绝 .. 绝对路径 反斜杠 保留名", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "C:/x", "a\\b", "CON", "a/nul.txt", "a/b?.md", "a/b.", "x\0y", "", ".", "./"]) {
      expect(() => normalizeRelPath(bad), bad).toThrowError(/路径越界/);
    }
  });
  test("规范化合法路径", () => {
    expect(normalizeRelPath("./a//b/c.md")).toBe("a/b/c.md");
    expect(normalizeRelPath("笔记/日记 2026.md")).toBe("笔记/日记 2026.md");
  });
  test("不存在的目标按祖先校验", () => {
    const v = tmp();
    expect(resolveInVault(v, "new/dir/file.md").endsWith(path.join("new", "dir", "file.md"))).toBe(true);
  });
  test("符号链接逃逸被拒绝", () => {
    const v = tmp(); const outside = tmp();
    writeFileSync(path.join(outside, "secret.txt"), "x");
    try { symlinkSync(outside, path.join(v, "link"), "dir"); } catch { return; /* 无符号链接权限（Windows 非开发者模式）时跳过 */ }
    expect(() => resolveInVault(v, "link/secret.txt")).toThrowError(/路径越界/);
    expect(() => resolveInVault(v, "link/newfile.txt")).toThrowError(/路径越界/);
  });
  test("Vault 内的符号链接允许", () => {
    const v = tmp();
    mkdirSync(path.join(v, "real"));
    try { symlinkSync(path.join(v, "real"), path.join(v, "alias"), "dir"); } catch { return; }
    expect(() => resolveInVault(v, "alias/x.md")).not.toThrow();
  });
});
