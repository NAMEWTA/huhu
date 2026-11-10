import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VaultIndex } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function vault(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ix-")); dirs.push(root);
  for (const [p, c] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); writeFileSync(path.join(root, p), c); }
  return root;
}

describe("VaultIndex", () => {
  test("树、检索、反链、标签", async () => {
    const root = vault({
      "a/研究摘要.md": "# 研究摘要\n本周进展 #工作 参见 [[读书笔记]]\n",
      "读书笔记.md": "---\ntitle: 读书笔记\ntags: [阅读]\n---\n内容 [[研究摘要|摘要]]\n",
      ".huhu/vault.json": "{}",
      "img.png": "binary",
    });
    const ix = new VaultIndex(root);
    expect(await ix.build()).toBe(true);
    expect(ix.entries().map((e) => e.path)).toEqual(["a", "a/研究摘要.md", "img.png", "读书笔记.md"]);
    expect(ix.query("本周进展").hits[0]?.path).toBe("a/研究摘要.md");
    expect(ix.backlinks("读书笔记.md")).toEqual([{ path: "a/研究摘要.md", title: "研究摘要" }]);
    expect(ix.backlinks("a/研究摘要.md").map((b) => b.path)).toEqual(["读书笔记.md"]);
    expect(ix.tagsOf("读书笔记.md")).toEqual(["阅读"]);
    expect(ix.tagsOf("a/研究摘要.md")).toEqual(["工作"]);
    expect(ix.counts()).toEqual({ files: 3, notes: 2 });
  });
  test("语义文件带 kind 过滤且不当作普通笔记", async () => {
    const root = vault({ "Tasks/t--task-1.md": "---\nhuhu: {kind: task, id: task-1, schema: 1}\ntitle: 写周报\n---\n" });
    const ix = new VaultIndex(root); await ix.build();
    expect(ix.query("周报", { kind: "task" }).hits).toHaveLength(1);
    expect(ix.counts().notes).toBe(0);
  });
  test("增量更新：新增/修改/重命名/删除", async () => {
    const root = vault({ "a.md": "苹果" });
    const ix = new VaultIndex(root); await ix.build();
    writeFileSync(path.join(root, "b.md"), "香蕉");
    ix.applyChanges([{ path: "b.md", change: "created" }]);
    expect(ix.query("香蕉").hits[0]?.path).toBe("b.md");
    writeFileSync(path.join(root, "a.md"), "橙子");
    ix.applyChanges([{ path: "a.md", change: "modified" }]);
    expect(ix.query("苹果").hits).toEqual([]);
    expect(ix.query("橙子").hits).toHaveLength(1);
    const { renameSync, rmSync: rm } = await import("node:fs");
    renameSync(path.join(root, "b.md"), path.join(root, "c.md"));
    ix.applyChanges([{ path: "c.md", change: "renamed", from: "b.md" }]);
    expect(ix.query("香蕉").hits[0]?.path).toBe("c.md");
    rm(path.join(root, "c.md"));
    ix.applyChanges([{ path: "c.md", change: "deleted" }]);
    expect(ix.query("香蕉").hits).toEqual([]);
    expect(ix.entries().map((e) => e.path)).toEqual(["a.md"]);
  });
  test("超过 10 MiB 的文本只索引元数据", async () => {
    const root = vault({ "big.md": "稀有词".repeat(4_000_000) });
    const ix = new VaultIndex(root); await ix.build();
    expect(ix.query("稀有词").hits.map((h) => h.path)).toEqual([]);
    expect(ix.query("big").hits[0]?.path).toBe("big.md");
  });
  test("取消重建保留旧索引，且构建期间 indexing=true", async () => {
    const files: Record<string, string> = { "keep.md": "旧内容" };
    for (let i = 0; i < 400; i++) files[`n/${i}.md`] = `内容 ${i}`;
    const root = vault(files);
    const ix = new VaultIndex(root); await ix.build();
    const p = ix.reindex();
    expect(ix.indexing).toBe(true);
    ix.cancel();
    expect(await p).toBe(false);
    expect(ix.indexing).toBe(false);
    expect(ix.query("旧内容").hits[0]?.path).toBe("keep.md");
  });

describe("增量更新目录", () => {
  test("新建深层文件时补全祖先目录", async () => {
    const root = vault({ "a.md": "x" });
    const ix = new VaultIndex(root); await ix.build();
    mkdirSync(path.join(root, "new/deep"), { recursive: true });
    writeFileSync(path.join(root, "new/deep/y.md"), "y");
    ix.applyChanges([{ path: "new/deep/y.md", change: "created" }]);
    expect(ix.entries().map((e) => e.path)).toEqual(["a.md", "new", "new/deep", "new/deep/y.md"]);
  });
});
});
