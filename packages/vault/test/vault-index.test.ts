import { fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync, type PathLike } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ReceiptLog, VaultIndex, VaultWatcher } from "../src/index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    fstatSync: vi.fn(actual.fstatSync),
    lstatSync: vi.fn(actual.lstatSync),
    openSync: vi.fn(actual.openSync),
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
    readSync: vi.fn(actual.readSync),
    statSync: vi.fn(actual.statSync),
  };
});

const OVERSIZED = 10 * 1024 * 1024 + 1;
const dirs: string[] = [];
const watchers: VaultWatcher[] = [];
afterEach(async () => {
  for (const watcher of watchers.splice(0)) await watcher.close();
  vi.clearAllMocks();
  vi.mocked(lstatSync).mockReset();
  vi.mocked(openSync).mockReset();
  vi.mocked(readdirSync).mockReset();
  vi.mocked(readSync).mockReset();
  vi.mocked(readFileSync).mockReset();
  vi.mocked(statSync).mockReset();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function vault(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ix-"));
  dirs.push(root);
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), c);
  }
  return root;
}

describe("VaultIndex.refreshPaths", () => {
  test.each([
    { from: "notes/readme.md", to: "notes/README.md", children: [""], dirsRead: ["", "notes"] },
    { from: "docs", to: "DOCS", children: ["/deep/first.md", "/deep/second.md"], dirsRead: ["", "DOCS", "DOCS/deep"] },
  ])("大小写不敏感查找下将 $from 改名为 $to 后只保留新路径", async ({ from, to, children, dirsRead }) => {
    const oldPaths = children.map((child) => `${from}${child}`);
    const newPaths = children.map((child) => `${to}${child}`);
    const root = vault(Object.fromEntries(oldPaths.map((p) => [p, "改名正文词 #移转 [[去向]]"])));
    const ix = new VaultIndex(root);
    await ix.build();
    const watcher = new VaultWatcher({ root, receipts: new ReceiptLog(), forcePolling: true, pollMs: 100_000, onChanges: (changes) => ix.applyChanges(changes) });
    watchers.push(watcher);
    await watcher.start();
    const original = path.join(root, from);
    const renamed = path.join(root, to);
    const staging = path.join(root, "staging-case-rename");
    renameSync(original, staging);
    renameSync(staging, renamed);

    // 保留真实磁盘目录枚举。只有经旧拼写查找文件或其目录时，模拟卷解析到新拼写。
    const alias = (p: PathLike): PathLike => {
      if (typeof p !== "string") return p;
      return p === original || p.startsWith(`${original}${path.sep}`) ? renamed + p.slice(original.length) : p;
    };
    const { lstatSync: diskLstat, openSync: diskOpen, readdirSync: diskReaddir, statSync: diskStat, readFileSync: diskRead } = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(lstatSync).mockImplementation((file, ...args) => diskLstat(alias(file), ...args));
    vi.mocked(openSync).mockImplementation((file, ...args) => diskOpen(alias(file), ...args));
    vi.mocked(readdirSync).mockImplementation((dir, ...args) => diskReaddir(alias(dir), ...args));
    vi.mocked(statSync).mockImplementation((file, ...args) => diskStat(alias(file), ...args));
    vi.mocked(readFileSync).mockImplementation((file, ...args) => diskRead(typeof file === "number" ? file : alias(file), ...args));
    for (const p of oldPaths) expect(lstatSync(path.join(root, p)).isFile()).toBe(true);
    vi.clearAllMocks();

    ix.refreshPaths([...oldPaths, ...newPaths]);

    expect(ix.entries(from)).toEqual([]);
    expect(
      ix
        .entries()
        .filter(({ type }) => type === "file")
        .map(({ path: p }) => p),
    ).toEqual(newPaths);
    expect(
      ix
        .query("改名正文词")
        .hits.map((hit) => hit.path)
        .sort(),
    ).toEqual(newPaths);
    expect(
      ix
        .backlinks("去向.md")
        .map((hit) => hit.path)
        .sort(),
    ).toEqual(newPaths);
    expect(ix.allTags()).toEqual([{ tag: "移转", count: newPaths.length }]);
    expect(vi.mocked(openSync).mock.calls.map(([file]) => file)).toEqual(newPaths.map((p) => path.join(root, p)));
    expect(vi.mocked(readdirSync).mock.calls.map(([dir]) => dir)).toEqual(dirsRead.map((p) => path.join(root, p)));
    expect(statSync).not.toHaveBeenCalled();
    watcher.poll();
    for (const p of newPaths) writeFileSync(path.join(root, p), "后续编辑正文词 #移转 [[去向]]");
    watcher.poll();
    watcher.poll();
    expect(ix.entries(from)).toEqual([]);
    expect(
      ix
        .query("后续编辑正文词")
        .hits.map((hit) => hit.path)
        .sort(),
    ).toEqual(newPaths);
    expect(
      ix
        .backlinks("去向.md")
        .map((hit) => hit.path)
        .sort(),
    ).toEqual(newPaths);
    expect(ix.allTags()).toEqual([{ tag: "移转", count: newPaths.length }]);
  });
});

describe("VaultIndex.applyChanges", () => {
  test("同目录批量创建任务只读取变更文件", async () => {
    const root = vault({
      "Tasks/existing.md": "既有笔记",
      "Tasks/other.md": "其他笔记",
      "Tasks/sub/nested.md": "子目录笔记",
      "Tasks/.huhu/ignored.md": "内部文件",
    });
    const ix = new VaultIndex(root);
    await ix.build();
    const paths = Array.from({ length: 24 }, (_, i) => `Tasks/task-${i}.md`);
    for (const [i, p] of paths.entries()) {
      writeFileSync(path.join(root, p), `---\nhuhu: {kind: task, id: task-${i}, schema: 1}\n---\n批量创建任务\n`);
    }

    vi.clearAllMocks();
    ix.applyChanges(paths.map((p) => ({ path: p, change: "created" })));

    expect(
      ix
        .query("批量创建任务", { kind: "task" })
        .hits.map((h) => h.path)
        .sort(),
    ).toEqual([...paths].sort());
    expect(ix.counts()).toEqual({ files: 27, notes: 3 });
    expect(readdirSync).not.toHaveBeenCalled();
    expect(statSync).not.toHaveBeenCalled();
    expect(vi.mocked(lstatSync).mock.calls.map(([file]) => file)).toEqual(paths.map((p) => path.join(root, p)));
    expect(vi.mocked(openSync).mock.calls.map(([file]) => file)).toEqual(paths.map((p) => path.join(root, p)));
    expect(fstatSync).toHaveBeenCalledTimes(paths.length);
  });

  test("多层目录的同批变更只读取事件路径，路径树补全对应祖先", async () => {
    const root = vault({ "Tasks/untouched/deep/x.md": "保留原笔记" });
    const ix = new VaultIndex(root);
    await ix.build();
    const paths = ["root.md", "Tasks/top.md", "Tasks/new/deeper/leaf.md", "Other/new/leaf.txt"];
    for (const p of paths) {
      const abs = path.join(root, p);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, "跨层新增索引");
    }

    vi.clearAllMocks();
    ix.applyChanges(paths.map((p) => ({ path: p, change: "created" })));

    expect(readdirSync).not.toHaveBeenCalled();
    expect(statSync).not.toHaveBeenCalled();
    expect(vi.mocked(lstatSync).mock.calls.map(([file]) => file)).toEqual(paths.map((p) => path.join(root, p)));
    expect(
      ix
        .query("跨层新增索引")
        .hits.map((h) => h.path)
        .sort(),
    ).toEqual([...paths].sort());
    expect(ix.query("保留原笔记").hits.map((h) => h.path)).toEqual(["Tasks/untouched/deep/x.md"]);
    expect(
      ix
        .entries()
        .filter((e) => e.type === "dir")
        .map((e) => e.path),
    ).toEqual(["Other", "Other/new", "Tasks", "Tasks/new", "Tasks/new/deeper", "Tasks/untouched", "Tasks/untouched/deep"]);
  });

  test("批次之间跨越 10 MiB 时刷新文件大小、正文、标签和反链", async () => {
    const rel = "Tasks/limit.md";
    const root = vault({ [rel]: "限额前的正文 #旧标签 [[去向]]" });
    const ix = new VaultIndex(root);
    await ix.build();
    const abs = path.join(root, rel);
    truncateSync(abs, OVERSIZED);
    vi.clearAllMocks();

    ix.applyChanges([{ path: rel, change: "modified" }]);

    expect(openSync).not.toHaveBeenCalled();
    expect(ix.entries(rel)[0]?.size).toBe(OVERSIZED);
    expect(ix.query("limit", { kind: "note" }).hits.map((h) => h.path)).toEqual([rel]);
    expect(ix.query("限额前的正文").hits).toEqual([]);
    expect(ix.tagsOf(rel)).toEqual([]);
    expect(ix.backlinks("去向.md")).toEqual([]);
    expect(ix.counts()).toEqual({ files: 1, notes: 0 });

    const rewritten = "缩小后的正文 #新标签 [[新去向]]";
    writeFileSync(abs, rewritten);
    ix.applyChanges([{ path: rel, change: "modified" }]);
    expect(ix.entries(rel)[0]?.size).toBe(Buffer.byteLength(rewritten));
    expect(ix.query("缩小后的正文").hits.map((h) => h.path)).toEqual([rel]);
    expect(ix.tagsOf(rel)).toEqual(["新标签"]);
    expect(ix.backlinks("新去向.md").map((h) => h.path)).toEqual([rel]);
  });

  test("同批首个文件处理时第二个文件增长超限，后续事件读到最新大小", async () => {
    const first = "Tasks/first.md";
    const later = "Tasks/later.md";
    const root = vault({ [first]: "批内首个正文", [later]: "第二个文件的正文" });
    const ix = new VaultIndex(root);
    const firstAbs = path.join(root, first);
    const laterAbs = path.join(root, later);
    const { openSync: diskOpen } = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(openSync).mockImplementationOnce((...args) => {
      truncateSync(laterAbs, OVERSIZED);
      return diskOpen(...args);
    });

    ix.applyChanges([
      { path: first, change: "created" },
      { path: later, change: "created" },
    ]);

    expect(vi.mocked(openSync).mock.calls.map(([file]) => file)).toEqual([firstAbs]);
    expect(ix.entries(later)[0]?.size).toBe(OVERSIZED);
    expect(ix.query("批内首个正文").hits.map((h) => h.path)).toEqual([first]);
    expect(ix.query("第二个文件的正文").hits).toEqual([]);
    expect(ix.query("later", { kind: "note" }).hits.map((h) => h.path)).toEqual([later]);
  });

  test("正文读取开始时文件增长超限，读取有界且不索引截断内容", async () => {
    const rel = "growing.txt";
    const body = "增长前的正文";
    const root = vault({ [rel]: body });
    const ix = new VaultIndex(root);
    const { readSync: diskRead } = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(readSync).mockImplementationOnce((...args) => {
      truncateSync(path.join(root, rel), OVERSIZED);
      return diskRead(...args);
    });

    ix.applyChanges([{ path: rel, change: "created" }]);

    expect(readSync).toHaveBeenCalledTimes(1);
    expect(readSync).toHaveBeenCalledWith(expect.any(Number), expect.any(Buffer), 0, Buffer.byteLength(body) + 1, null);
    expect(ix.query(body).hits).toEqual([]);
    expect(ix.query("growing", { kind: "note" }).hits.map((h) => h.path)).toEqual([rel]);
  });

  test("增量事件忽略文件符号链接，自写刷新清理已替换为链接的文件", async ({ skip }) => {
    const root = vault({ "Tasks/old.md": "替换前的正文" });
    const target = path.join(vault({ "target.md": "链接目标正文" }), "target.md");
    const ix = new VaultIndex(root);
    await ix.build();
    const old = path.join(root, "Tasks/old.md");
    rmSync(old);
    try {
      symlinkSync(target, old, "file");
      symlinkSync(target, path.join(root, "Tasks/alias.md"), "file");
      symlinkSync(path.join(root, "missing.md"), path.join(root, "Tasks/broken.md"), "file");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        skip("缺少创建文件符号链接的权限");
        return;
      }
      throw error;
    }

    vi.clearAllMocks();
    ix.applyChanges([
      { path: "Tasks/alias.md", change: "created" },
      { path: "Tasks/broken.md", change: "created" },
    ]);
    ix.refreshPaths(["Tasks/old.md"]);

    expect(readdirSync).not.toHaveBeenCalled();
    expect(openSync).not.toHaveBeenCalled();
    expect(ix.entries().map((e) => e.path)).toEqual(["Tasks"]);
    expect(ix.query("链接目标正文").hits).toEqual([]);
    expect(ix.query("替换前的正文").hits).toEqual([]);
  });

  test("混合增量更新保留树、检索、反链和忽略规则，并在下批重读文件信息", async () => {
    const root = vault({ "Tasks/edit.md": "原来的内容 #旧标签", "Tasks/move.md": "待移动的笔记 #移动", "Tasks/delete.md": "待删除的笔记" });
    const ix = new VaultIndex(root);
    await ix.build();
    const edited = "全新的内容 [[Tasks/deep/moved]] #新标签";
    writeFileSync(path.join(root, "Tasks/edit.md"), edited);
    mkdirSync(path.join(root, "Tasks/deep/.huhu"), { recursive: true });
    renameSync(path.join(root, "Tasks/move.md"), path.join(root, "Tasks/deep/moved.md"));
    rmSync(path.join(root, "Tasks/delete.md"));
    writeFileSync(path.join(root, "Tasks/deep/.draft.md"), "隐藏草稿");
    writeFileSync(path.join(root, "Tasks/deep/.huhu/ignored.md"), "内部文件");
    writeFileSync(path.join(root, "Tasks/deep/.DS_Store"), "系统文件");

    ix.applyChanges([
      { path: "Tasks/edit.md", change: "modified" },
      { path: "Tasks/deep/moved.md", change: "renamed", from: "Tasks/move.md" },
      { path: "Tasks/delete.md", change: "deleted" },
      { path: "Tasks/deep/.draft.md", change: "created" },
      { path: "Tasks/deep/.huhu/ignored.md", change: "created" },
      { path: "Tasks/deep/.DS_Store", change: "created" },
    ]);

    expect(ix.entries().map((e) => [e.path, e.type])).toEqual([
      ["Tasks", "dir"],
      ["Tasks/deep", "dir"],
      ["Tasks/deep/.draft.md", "file"],
      ["Tasks/deep/moved.md", "file"],
      ["Tasks/edit.md", "file"],
    ]);
    expect(ix.query("原来的内容").hits).toEqual([]);
    expect(ix.query("待删除的笔记").hits).toEqual([]);
    expect(ix.query("待移动的笔记").hits.map((h) => h.path)).toEqual(["Tasks/deep/moved.md"]);
    expect(ix.query("隐藏草稿").hits.map((h) => h.path)).toEqual(["Tasks/deep/.draft.md"]);
    expect(ix.tagsOf("Tasks/edit.md")).toEqual(["新标签"]);
    expect(ix.tagsOf("Tasks/move.md")).toEqual([]);
    expect(ix.backlinks("Tasks/deep/moved.md").map((b) => b.path)).toEqual(["Tasks/edit.md"]);
    expect(ix.entries("Tasks/edit.md")[0]?.size).toBe(Buffer.byteLength(edited));

    const rewritten = "随后在下一批写入的笔记内容";
    writeFileSync(path.join(root, "Tasks/edit.md"), rewritten);
    ix.applyChanges([{ path: "Tasks/edit.md", change: "modified" }]);
    expect(ix.entries("Tasks/edit.md")[0]?.size).toBe(Buffer.byteLength(rewritten));
    expect(ix.query("下一批写入").hits.map((h) => h.path)).toEqual(["Tasks/edit.md"]);
  });
});

describe("VaultIndex.reconcile", () => {
  test("建立索引之后、监听器启动之前的写入（新建 / 修改 / 删除）由对账补上", async () => {
    const root = vault({ "旧.md": "# 旧\n", "删.md": "# 删\n", "改.md": "# 改\n" });
    const ix = new VaultIndex(root);
    await ix.build();
    writeFileSync(path.join(root, "新.md"), "# 新文件 独特词汇\n");
    writeFileSync(path.join(root, "改.md"), "# 改了很多\n正文变长了\n");
    rmSync(path.join(root, "删.md"));
    const changes = ix.reconcile();
    expect(changes.map((c) => `${c.change}:${c.path}`).sort()).toEqual(["created:新.md", "deleted:删.md", "modified:改.md"]);
    expect(ix.entries().map((e) => e.path)).toContain("新.md");
    expect(ix.entries().map((e) => e.path)).not.toContain("删.md");
    expect(ix.query("独特词汇").hits.map((h) => h.path)).toEqual(["新.md"]);
    expect(ix.reconcile()).toEqual([]); // 再对账没有变化
  });
});

describe("VaultIndex", () => {
  test("全文搜索按实体元数据携带任务和捕获的稳定 ID，普通文件保留字面路径", async () => {
    const root = vault({
      "Tasks/renamed.md": "---\nhuhu: { kind: task, id: task-original }\ntitle: 命中任务\n---\n",
      "Inbox/renamed.md": "---\nhuhu: { kind: capture, id: cap-original }\ntitle: 命中收件\n---\n",
      "命中#笔记.md": "普通正文",
    });
    const index = new VaultIndex(root);
    await index.build();
    expect(index.query("命中").hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "task", id: "task-original", path: "Tasks/renamed.md" }),
        expect.objectContaining({ kind: "capture", id: "cap-original", path: "Inbox/renamed.md" }),
        expect.objectContaining({ kind: "note", path: "命中#笔记.md" }),
      ]),
    );
  });
  test("树、检索、反链、标签", async () => {
    const root = vault({
      "a/研究摘要.md": "# 研究摘要\n本周进展 #工作 参见 [[读书笔记]]\n",
      "读书笔记.md": "---\ntitle: 读书笔记\ntags: [阅读]\n---\n内容 [[研究摘要|摘要]]\n",
      ".huhu/vault.json": "{}",
      "img.png": "binary",
    });
    const ix = new VaultIndex(root);
    expect(await ix.build()).toBe(true);
    const paths = ["a", "a/研究摘要.md", "img.png", "读书笔记.md"].sort((a, b) => a.localeCompare(b));
    expect(ix.entries().map((e) => e.path)).toEqual(paths);
    expect(ix.query("本周进展").hits[0]?.path).toBe("a/研究摘要.md");
    expect(ix.backlinks("读书笔记.md")).toEqual([{ path: "a/研究摘要.md", title: "研究摘要" }]);
    expect(ix.backlinks("a/研究摘要.md").map((b) => b.path)).toEqual(["读书笔记.md"]);
    expect(ix.tagsOf("读书笔记.md")).toEqual(["阅读"]);
    expect(ix.tagsOf("a/研究摘要.md")).toEqual(["工作"]);
    expect(ix.counts()).toEqual({ files: 3, notes: 2 });
  });
  test("语义文件带 kind 过滤且不当作普通笔记", async () => {
    const root = vault({ "Tasks/t--task-1.md": "---\nhuhu: {kind: task, id: task-1, schema: 1}\ntitle: 写周报\n---\n" });
    const ix = new VaultIndex(root);
    await ix.build();
    expect(ix.query("周报", { kind: "task" }).hits).toHaveLength(1);
    expect(ix.counts().notes).toBe(0);
  });
  test("增量更新：新增/修改/重命名/删除", async () => {
    const root = vault({ "a.md": "苹果" });
    const ix = new VaultIndex(root);
    await ix.build();
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
    const ix = new VaultIndex(root);
    await ix.build();
    expect(ix.query("稀有词").hits.map((h) => h.path)).toEqual([]);
    expect(ix.query("big").hits[0]?.path).toBe("big.md");
  });
  test("取消重建保留旧索引，且构建期间 indexing=true", async () => {
    const files: Record<string, string> = { "keep.md": "旧内容" };
    for (let i = 0; i < 400; i++) files[`n/${i}.md`] = `内容 ${i}`;
    const root = vault(files);
    const ix = new VaultIndex(root);
    await ix.build();
    const p = ix.reindex();
    expect(ix.indexing).toBe(true);
    ix.cancel();
    expect(await p).toBe(false);
    expect(ix.indexing).toBe(false);
    expect(ix.query("旧内容").hits[0]?.path).toBe("keep.md");
  });

  describe("重建期间的并发更新与首次建立", () => {
    test("重建期间被更新的文件在新索引换上后仍然可搜到（不被整体替换冲掉）", async () => {
      const files: Record<string, string> = { "早.md": "早已索引" };
      for (let i = 0; i < 400; i++) files[`n/${i}.md`] = `内容 ${i}`;
      const root = vault(files);
      const ix = new VaultIndex(root);
      await ix.build();
      const p = ix.reindex();
      writeFileSync(path.join(root, "早.md"), "重建期间新增的稀有词");
      ix.applyChanges([{ path: "早.md", change: "modified" }]);
      expect(await p).toBe(true);
      expect(ix.query("稀有词").hits.map((h) => h.path)).toEqual(["早.md"]);
    });
    test("首次建立索引不可取消（没有旧索引可保留）；完成后 hasContentIndex 为真，之后的重建可取消", async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 400; i++) files[`n/${i}.md`] = `内容 ${i}`;
      const root = vault(files);
      const ix = new VaultIndex(root);
      expect(ix.hasContentIndex).toBe(false);
      const first = ix.build();
      ix.cancel();
      expect(await first).toBe(true);
      expect(ix.query("内容").hits.length).toBeGreaterThan(0);
      expect(ix.hasContentIndex).toBe(true);
      const again = ix.reindex();
      ix.cancel();
      expect(await again).toBe(false);
    });
  });

  describe("增量更新目录", () => {
    test("新建深层文件时补全祖先目录", async () => {
      const root = vault({ "a.md": "x" });
      const ix = new VaultIndex(root);
      await ix.build();
      mkdirSync(path.join(root, "new/deep"), { recursive: true });
      writeFileSync(path.join(root, "new/deep/y.md"), "y");
      ix.applyChanges([{ path: "new/deep/y.md", change: "created" }]);
      expect(ix.entries().map((e) => e.path)).toEqual(["a.md", "new", "new/deep", "new/deep/y.md"]);
    });
  });
});

describe("VaultIndex.clearSearch", () => {
  test("清除搜索索引：搜索没有结果，路径树与笔记元数据不动；重建后恢复", async () => {
    const root = vault({ "甲.md": "# 甲\n独特词汇\n" });
    const ix = new VaultIndex(root);
    await ix.build();
    expect(ix.query("独特词汇").hits.length).toBe(1);
    expect(ix.clearSearch()).toBe(true);
    expect(ix.query("独特词汇").hits).toEqual([]);
    expect(ix.entries().map((e) => e.path)).toContain("甲.md");
    expect(ix.counts()["notes"]).toBe(1);
    await ix.reindex();
    expect(ix.query("独特词汇").hits.length).toBe(1);
  });
});

describe("文件夹笔记（AR-S1）", () => {
  const files = {
    "Archives/通讯录/index.md": "---\nicon: users\n---\n类型说明\n",
    "Archives/通讯录/张三/index.md": "---\n电话: '1'\n---\n# 不应取 H1\n正文\n",
    "Archives/通讯录/张三/资料.md": "# 资料\n内部链接 [[Archives/通讯录/张三/]]\n",
    "项目/年度计划.md": "# 年度计划\n见 [[Archives/通讯录/张三/]]\n",
    "项目/杂记.md": "# 杂记\n裸名 [[index]]\n",
    "项目/带标题/index.md": "---\ntitle: 显式标题\n---\n内容\n",
    "index.md": "# 根首页\n",
    "写法.md": "三种写法 [[Archives/通讯录/张三]] [[Archives/通讯录/张三/index.md]]\n",
  };
  test("标题：文件夹里的 index.md 取文件夹名（不取 H1）；有显式 title 取 title；根目录 index.md 沿用原规则", async () => {
    const ix = new VaultIndex(vault(files));
    await ix.build();
    const title = (q: string, p: string) => ix.query(q).hits.find((h) => h.path === p)?.title;
    expect(title("正文", "Archives/通讯录/张三/index.md")).toBe("张三");
    expect(title("类型说明", "Archives/通讯录/index.md")).toBe("通讯录");
    expect(title("内容", "项目/带标题/index.md")).toBe("显式标题");
    expect(title("根首页", "index.md")).toBe("根首页");
  });
  test("反链：[[目录/]]、[[目录]]、完整路径都算；裸 [[index]] 不算；文件夹内部文件之间的链接由调用方按路径过滤", async () => {
    const ix = new VaultIndex(vault(files));
    await ix.build();
    const back = ix
      .backlinks("Archives/通讯录/张三/index.md")
      .map((b) => b.path)
      .sort();
    expect(back).toEqual(["Archives/通讯录/张三/资料.md", "写法.md", "项目/年度计划.md"]);
    expect(back).not.toContain("项目/杂记.md");
    // 根目录的 index.md 仍然可以被裸名链接
    expect(ix.backlinks("index.md").map((b) => b.path)).toEqual(["项目/杂记.md"]);
  });
});
