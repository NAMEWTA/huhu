import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { listDir, protectedKindOf } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-list-"));
  dirs.push(d);
  return d;
};
const put = (root: string, rel: string, body = "x") => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), body);
};

describe("vault.list 的目录列举（A01 / A05 / A09 / A10）", () => {
  test("A01：笔记、Tasks、JSON、TXT、PDF、HTML、未知扩展名、点目录、空目录全部返回", () => {
    const v = tmp();
    for (const f of ["a.md", "Tasks/t.md", "Comments/c.md", "d.json", "e.txt", "f.pdf", "g.html", "h.weird", ".DS_Store", "Thumbs.db", ".obsidian/x.json"]) put(v, f);
    mkdirSync(path.join(v, "empty"));
    const r = listDir(v, "");
    const names = r.entries.map((e) => e.name);
    for (const n of ["a.md", "Tasks", "Comments", "d.json", "e.txt", "f.pdf", "g.html", "h.weird", ".DS_Store", "Thumbs.db", ".obsidian", "empty"]) expect(names, n).toContain(n);
    expect(r.entries.find((e) => e.name === "empty")?.kind).toBe("dir");
    expect(listDir(v, "empty").entries).toEqual([]);
  });

  test("目录在前、按名称稳定排序；嵌套 Tasks 不被特殊排除", () => {
    const v = tmp();
    put(v, "z.md");
    put(v, "b/Tasks/t.md");
    put(v, "a.md");
    expect(listDir(v, "").entries.map((e) => e.name)).toEqual(["b", "a.md", "z.md"]);
    expect(listDir(v, "b").entries.map((e) => e.name)).toEqual(["Tasks"]);
    expect(listDir(v, "b/Tasks").entries.map((e) => e.name)).toEqual(["t.md"]);
  });

  test("A09：分页游标；total / counts 仅在本目录全部列出时出现；文件与目录分开计数", () => {
    const v = tmp();
    mkdirSync(path.join(v, "d1"));
    mkdirSync(path.join(v, "d2"));
    for (const n of ["a", "b", "c", "d", "e"]) put(v, `${n}.md`);
    const p1 = listDir(v, "", { limit: 3 });
    expect(p1.entries.map((e) => e.name)).toEqual(["d1", "d2", "a.md"]);
    expect(p1.total).toBeUndefined();
    expect(p1.counts).toBeUndefined();
    expect(p1.nextCursor).toBeDefined();
    const p2 = listDir(v, "", { limit: 3, cursor: p1.nextCursor });
    expect(p2.entries.map((e) => e.name)).toEqual(["b.md", "c.md", "d.md"]);
    const p3 = listDir(v, "", { limit: 3, cursor: p2.nextCursor });
    expect(p3.entries.map((e) => e.name)).toEqual(["e.md"]);
    expect(p3.nextCursor).toBeUndefined();
    expect(p3.total).toBe(7);
    expect(p3.counts).toEqual({ files: 5, dirs: 2 });
  });

  test("A10：受保护目录默认不列；includeProtected 时列出并带标记；其内部子项同样标记", () => {
    const v = tmp();
    for (const f of [".huhu/state.json", ".git/HEAD", "node_modules/x/index.js", ".agents/dev/n.md", "a.md"]) put(v, f);
    expect(listDir(v, "").entries.map((e) => e.name)).toEqual(["a.md"]);
    const r = listDir(v, "", { includeProtected: true });
    const prot = Object.fromEntries(r.entries.filter((e) => e.protected).map((e) => [e.name, e.protected]));
    expect(prot).toEqual({ ".agents": "agents", ".git": "git", ".huhu": "internal", node_modules: "dependency" });
    expect(() => listDir(v, ".git")).toThrowError(/受保护/);
    expect(listDir(v, ".git", { includeProtected: true }).entries[0]).toMatchObject({ name: "HEAD", protected: "git" });
    expect(protectedKindOf("a/node_modules/b")).toBe("dependency");
    expect(protectedKindOf("Tasks/x.md")).toBeUndefined();
  });

  test("符号链接：Vault 内的按目标类型展示，越界 / 失效不跟随", () => {
    const v = tmp();
    const outside = tmp();
    put(outside, "secret.txt");
    put(v, "real/a.md");
    put(v, "file.md");
    try {
      symlinkSync(path.join(v, "real"), path.join(v, "link-in-dir"), "dir");
      symlinkSync(v, path.join(v, "real", "parent"), "dir");
      symlinkSync(path.join(v, "file.md"), path.join(v, "link-in-file"));
      symlinkSync(outside, path.join(v, "link-out"), "dir");
      symlinkSync(path.join(v, "missing"), path.join(v, "link-broken"));
    } catch {
      return; // 平台不允许创建符号链接（Windows 无权限）：跳过
    }
    const by = Object.fromEntries(listDir(v, "").entries.map((e) => [e.name, e]));
    expect(by["link-in-dir"]).toMatchObject({ kind: "dir", linkTarget: { inside: true } });
    expect(by["link-in-file"]).toMatchObject({ kind: "file", linkTarget: { inside: true } });
    expect(by["link-out"]).toMatchObject({ kind: "symlink", linkTarget: { inside: false } });
    expect(by["link-broken"]).toMatchObject({ kind: "symlink", linkTarget: { inside: false } });
    expect(() => listDir(v, "link-out")).toThrowError(/路径越界/);
    expect(listDir(v, "real").entries.find((e) => e.name === "parent")).toMatchObject({ kind: "symlink", linkTarget: { inside: true, cycle: true } });
    expect(() => listDir(v, "link-in-dir/parent/real")).toThrowError(/循环/);
  });

  test("越界与不存在的目录被拒绝", () => {
    const v = tmp();
    expect(() => listDir(v, "../x")).toThrowError(/路径越界/);
    expect(() => listDir(v, "nope")).toThrowError(/不存在/);
    put(v, "f.md");
    expect(() => listDir(v, "f.md")).toThrowError(/不是目录/);
  });

  test("创建 / 删除空目录后再次列举即时反映（A05 数据面）", () => {
    const v = tmp();
    expect(listDir(v, "").entries).toEqual([]);
    mkdirSync(path.join(v, "新目录"));
    expect(listDir(v, "").entries.map((e) => e.name)).toEqual(["新目录"]);
    rmSync(path.join(v, "新目录"), { recursive: true });
    expect(listDir(v, "").entries).toEqual([]);
  });
});
