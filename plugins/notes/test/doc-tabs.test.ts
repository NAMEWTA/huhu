import type { DocTab } from "@huhu/contracts";
import { isHiddenByRules } from "@huhu/contracts";
import { describe, expect, test } from "vitest";
import { activeTab, archiveRecordPath, createDocTabsState, docTabsReducer, tabFilePath, tabKey, type DocTabsState } from "../src/ui/tabs/docTabs.js";
import { contextOfTab, initialSidebarState, sidebarReducer } from "../src/ui/tabs/sidebarContext.js";

const f = (path: string, view: "rich" | "source" | "read" = "rich", vaultId = "v1"): DocTab => ({ kind: "file", vaultId, path, view });
const run = (s: DocTabsState, ...a: Parameters<typeof docTabsReducer>[1][]) => a.reduce(docTabsReducer, s);

describe("docTabs reducer", () => {
  test("打开 / 聚焦：同一资源只有一个标签，重复打开只聚焦并更新视图", () => {
    let s = run(createDocTabsState("v1"), { type: "open", tab: f("a.md") }, { type: "open", tab: f("b.md") });
    expect(s.tabs.map(tabKey)).toEqual(["file:v1:a.md", "file:v1:b.md"]);
    expect(s.activeKey).toBe("file:v1:b.md");
    s = run(s, { type: "open", tab: f("a.md", "source") });
    expect(s.tabs).toHaveLength(2);
    expect(s.activeKey).toBe("file:v1:a.md");
    expect(s.tabs[0]).toMatchObject({ view: "source" });
    s = run(s, { type: "focus", key: "file:v1:b.md" });
    expect(s.activeKey).toBe("file:v1:b.md");
    expect(run(s, { type: "focus", key: "nope" })).toBe(s);
  });

  test("关闭：活动标签关闭后取右邻，否则左邻；关闭非活动标签不改变活动", () => {
    let s = run(createDocTabsState("v1"), ...["a.md", "b.md", "c.md"].map((p) => ({ type: "open", tab: f(p) }) as const));
    s = run(s, { type: "focus", key: "file:v1:b.md" }, { type: "close", key: "file:v1:b.md" });
    expect(s.activeKey).toBe("file:v1:c.md");
    s = run(s, { type: "close", key: "file:v1:c.md" });
    expect(s.activeKey).toBe("file:v1:a.md");
    s = run(s, { type: "open", tab: f("z.md") }, { type: "close", key: "file:v1:a.md" });
    expect(s.activeKey).toBe("file:v1:z.md");
    s = run(s, { type: "close", key: "file:v1:z.md" });
    expect(s).toMatchObject({ tabs: [], activeKey: null });
  });

  test("三类档案标签与文件标签共存；档案记录对应真实 index.md（同一会话键）", () => {
    const rec: DocTab = { kind: "archive-record", vaultId: "v1", type: "人物", name: "张三" };
    const s = run(
      createDocTabsState("v1"),
      { type: "open", tab: { kind: "archives-home", vaultId: "v1" } },
      { type: "open", tab: { kind: "archive-type", vaultId: "v1", type: "人物" } },
      { type: "open", tab: rec },
      { type: "open", tab: f("Archives/人物/张三/index.md") },
    );
    expect(s.tabs).toHaveLength(4); // 记录标签与文件标签是两个视图标签，但共享同一文件
    expect(archiveRecordPath(rec as Extract<DocTab, { kind: "archive-record" }>)).toBe("Archives/人物/张三/index.md");
    expect(tabFilePath(rec)).toBe(tabFilePath(f("Archives/人物/张三/index.md")));
    expect(tabFilePath({ kind: "archives-home", vaultId: "v1" })).toBeNull();
  });

  test("切 Vault：清空并递增 epoch；他库标签不进入；restore 只保留本库标签", () => {
    let s = run(createDocTabsState("v1"), { type: "open", tab: f("a.md") });
    const same = docTabsReducer(s, { type: "switchVault", vaultId: "v1" });
    expect(same).toBe(s);
    s = run(s, { type: "switchVault", vaultId: "v2" });
    expect(s).toMatchObject({ vaultId: "v2", tabs: [], activeKey: null, epoch: 1 });
    expect(run(s, { type: "open", tab: f("x.md", "rich", "v1") })).toBe(s);
    s = run(s, { type: "restore", vaultId: "v2", tabs: [f("a.md", "rich", "v2"), f("b.md", "rich", "v1")], activeKey: "file:v2:a.md" });
    expect(s.tabs.map(tabKey)).toEqual(["file:v2:a.md"]);
    expect(s.activeKey).toBe("file:v2:a.md");
    expect(s.epoch).toBe(2);
    s = run(s, { type: "restore", vaultId: "v2", tabs: [f("a.md", "rich", "v2")], activeKey: "file:v2:gone.md" });
    expect(s.activeKey).toBe("file:v2:a.md"); // 活动键失效 → 回退到第一个
  });

  test("改名 / 移动：路径与目录前缀跟着变，活动标签保持；撞名去重", () => {
    let s = run(createDocTabsState("v1"), { type: "open", tab: f("d/a.md") }, { type: "open", tab: f("d/sub/b.md") }, { type: "open", tab: f("other.md") }, { type: "focus", key: "file:v1:d/a.md" });
    s = run(s, { type: "remap", from: "d", to: "e" });
    expect(s.tabs.map((t) => (t.kind === "file" ? t.path : ""))).toEqual(["e/a.md", "e/sub/b.md", "other.md"]);
    expect(s.activeKey).toBe("file:v1:e/a.md");
    s = run(s, { type: "remap", from: "other.md", to: "e/a.md" });
    expect(s.tabs).toHaveLength(2);
  });

  test("E04：记录视图与 Markdown 视图按同一 index 路径改名和删除", () => {
    const original = "Archives/人物/张三/index.md";
    const renamed = "Archives/人物/张 三/index.md";
    const record: DocTab = { kind: "archive-record", vaultId: "v1", type: "人物", name: "张三" };
    const home: DocTab = { kind: "archives-home", vaultId: "v1" };
    let s = run(createDocTabsState("v1"), { type: "open", tab: home }, { type: "open", tab: f(original) }, { type: "open", tab: record });
    s = run(s, { type: "remap", from: "Archives/人物/张三", to: "Archives/人物/张 三" });
    expect(s.tabs.map(tabFilePath)).toEqual([null, renamed, renamed]);
    expect(activeTab(s)).toMatchObject({ kind: "archive-record", name: "张 三" });
    expect(run(s, { type: "prune", alive: new Set([renamed]) })).toBe(s);
    expect(run(s, { type: "prune", alive: new Set() }).tabs).toEqual([home]);
  });

  test("prune：不存在的文件标签消失，档案视图标签保留；活动标签被移除则回退", () => {
    let s = run(createDocTabsState("v1"), { type: "open", tab: f("a.md") }, { type: "open", tab: { kind: "archives-home", vaultId: "v1" } }, { type: "open", tab: f("b.md") });
    s = run(s, { type: "prune", alive: new Set(["a.md"]) });
    expect(s.tabs.map(tabKey)).toEqual(["file:v1:a.md", "archives-home:v1"]);
    expect(s.activeKey).toBe("file:v1:a.md");
    expect(activeTab(s)).toMatchObject({ kind: "file", path: "a.md" });
    expect(run(s, { type: "prune", alive: new Set(["a.md"]) })).toBe(s);
  });
});

describe("sidebarContext reducer（E02）", () => {
  const home: DocTab = { kind: "archives-home", vaultId: "v1" };
  test("由活动标签推导：档案三类 → archives，文件 → files，无标签 → files", () => {
    expect(contextOfTab(home)).toBe("archives");
    expect(contextOfTab({ kind: "archive-type", vaultId: "v1", type: "x" })).toBe("archives");
    expect(contextOfTab({ kind: "archive-record", vaultId: "v1", type: "x", name: "y" })).toBe("archives");
    expect(contextOfTab(f("a.md"))).toBe("files");
    expect(contextOfTab(null)).toBe("files");
  });

  test("手动切换不被同一标签的重复 activate 弹回；切到另一标签才重新推导", () => {
    let s = sidebarReducer(initialSidebarState, { type: "activate", tab: home });
    expect(s.context).toBe("archives");
    s = sidebarReducer(s, { type: "choose", context: "files" }); // 用户点“文件”入口
    expect(s.context).toBe("files");
    expect(sidebarReducer(s, { type: "activate", tab: home })).toBe(s); // 渲染再触发同一 activate：不弹回
    s = sidebarReducer(s, { type: "activate", tab: f("a.md") });
    expect(s.context).toBe("files");
    s = sidebarReducer(s, { type: "activate", tab: home });
    expect(s.context).toBe("archives"); // 再次激活档案标签：恢复档案上下文
  });

  test("两种上下文的展开 / 选中分别存储，互不覆盖", () => {
    let s = initialSidebarState;
    s = sidebarReducer(s, { type: "expand", path: "docs", open: true });
    s = sidebarReducer(s, { type: "select", path: "docs/a.md" });
    s = sidebarReducer(s, { type: "choose", context: "archives" });
    s = sidebarReducer(s, { type: "expand", path: "Archives/人物", open: true });
    s = sidebarReducer(s, { type: "select", path: "Archives/人物" });
    expect(s.views.files).toEqual({ expanded: ["docs"], selected: "docs/a.md" });
    expect(s.views.archives).toEqual({ expanded: ["Archives/人物"], selected: "Archives/人物" });
    s = sidebarReducer(s, { type: "choose", context: "files" });
    s = sidebarReducer(s, { type: "expand", path: "docs", open: false });
    expect(s.views.files.expanded).toEqual([]);
    expect(s.views.archives.expanded).toEqual(["Archives/人物"]);
  });
});

describe("hiddenPaths 规则命中", () => {
  test("规则本身与其子树命中，同前缀兄弟不命中", () => {
    const rules = ["private", "notes/draft.md"];
    expect(isHiddenByRules("private", rules)).toBe(true);
    expect(isHiddenByRules("private/a/b.md", rules)).toBe(true);
    expect(isHiddenByRules("privateer/a.md", rules)).toBe(false);
    expect(isHiddenByRules("notes/draft.md", rules)).toBe(true);
    expect(isHiddenByRules("notes/draft.md.bak", rules)).toBe(false);
    expect(isHiddenByRules("a.md", [])).toBe(false);
  });
});
