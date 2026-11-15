import { describe, expect, it } from "vitest";
import { activeTab, tabKey } from "../src/ui/tabs/docTabs.js";
import { archiveRecordTab, archiveSelectionOf, archiveTypeTab, archivesHomeTab, createShellState, fileTab, parseTabs, restoreShellState, shellReducer } from "../src/ui/tabs/shellState.js";

const V = "v1";
describe("shellState（标签 + 侧栏组合 reducer）", () => {
  it("档案首页标签唯一：再次点击聚焦而非堆叠（E01）", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: archivesHomeTab(V) });
    s = shellReducer(s, { type: "open", tab: fileTab(V, "a.md") });
    s = shellReducer(s, { type: "open", tab: archivesHomeTab(V) });
    expect(s.tabs.tabs.map(tabKey).filter((k) => k.startsWith("archives-home"))).toHaveLength(1);
    expect(activeTab(s.tabs)?.kind).toBe("archives-home");
  });

  it("活动标签推导侧栏上下文；两种上下文的展开状态分别存（E02）", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: fileTab(V, "a/b.md") });
    s = shellReducer(s, { type: "sidebar", action: { type: "expand", path: "a", open: true } });
    expect(s.sidebar.context).toBe("files");
    s = shellReducer(s, { type: "open", tab: archiveTypeTab(V, "Archives/通讯录/")! });
    expect(s.sidebar.context).toBe("archives");
    s = shellReducer(s, { type: "sidebar", action: { type: "expand", path: "Archives/通讯录", open: true } });
    expect(s.sidebar.views.files.expanded).toEqual(["a"]);
    expect(s.sidebar.views.archives.expanded).toEqual(["Archives/通讯录"]);
    s = shellReducer(s, { type: "focus", key: tabKey(fileTab(V, "a/b.md")) });
    expect(s.sidebar.context).toBe("files");
    expect(s.sidebar.views.files.expanded).toEqual(["a"]);
  });

  it("手动切到“文件”不被弹回；再次激活档案标签恢复档案上下文", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: archivesHomeTab(V) });
    s = shellReducer(s, { type: "sidebar", action: { type: "choose", context: "files" } });
    // 非激活类事件（例如重命名一个无关路径）不会把侧栏推回档案
    s = shellReducer(s, { type: "remap", from: "x", to: "y" });
    expect(s.sidebar.context).toBe("files");
    s = shellReducer(s, { type: "open", tab: archivesHomeTab(V) });
    expect(s.sidebar.context).toBe("archives");
  });

  it("连续手动切换 50 次：状态稳定，无抖动", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: archiveRecordTab(V, "Archives/项目/甲/")! });
    for (let i = 0; i < 50; i++) s = shellReducer(s, { type: "sidebar", action: { type: "choose", context: i % 2 ? "archives" : "files" } });
    expect(s.sidebar.context).toBe("archives");
    expect(s.tabs.tabs).toHaveLength(1);
  });

  it("在档案上下文里展开文件树父目录，写入文件上下文而不是当前上下文", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: archivesHomeTab(V) });
    s = shellReducer(s, { type: "sidebar", action: { type: "expand", path: "docs", open: true, context: "files" } });
    expect(s.sidebar.views.files.expanded).toEqual(["docs"]);
    expect(s.sidebar.views.archives.expanded).toEqual([]);
  });

  it("档案路径 ↔ 标签；index.md 与目录路径得到同一记录标签（同一文件同一会话）", () => {
    const a = archiveRecordTab(V, "Archives/通讯录/张三/")!;
    const b = archiveRecordTab(V, "Archives/通讯录/张三/index.md")!;
    expect(tabKey(a)).toBe(tabKey(b));
    expect(archiveRecordTab(V, "Archives/通讯录/")).toBeNull();
    expect(archiveRecordTab(V, "Notes/x/y/")).toBeNull();
    expect(archiveTypeTab(V, "Archives/通讯录/张三/")).toBeNull();
    expect(archiveSelectionOf(a)).toBe("Archives/通讯录/张三");
  });

  it("文件改名：文件树展开路径同步，档案标签不变", () => {
    let s = createShellState(V);
    s = shellReducer(s, { type: "open", tab: fileTab(V, "old/a.md") });
    s = shellReducer(s, { type: "sidebar", action: { type: "expand", path: "old", open: true } });
    s = shellReducer(s, { type: "remap", from: "old", to: "new" });
    expect(s.sidebar.views.files.expanded).toEqual(["new"]);
    expect(activeTab(s.tabs)).toMatchObject({ kind: "file", path: "new/a.md" });
  });

  it("持久化：只恢复本库、合法的标签；未知项丢弃", () => {
    const saved = parseTabs(
      { tabs: [{ kind: "file", vaultId: V, path: "a.md", view: "source" }, { kind: "file", vaultId: "other", path: "b.md" }, { kind: "archive-record", vaultId: V, type: "项目", name: "甲" }, { kind: "bogus", vaultId: V }, { kind: "archives-home", vaultId: V }], activeKey: "archives-home:v1" },
      V,
    )!;
    expect(saved.tabs).toHaveLength(3);
    const s = restoreShellState(V, saved);
    expect(activeTab(s.tabs)?.kind).toBe("archives-home");
    expect(s.sidebar.context).toBe("archives");
    expect(parseTabs("x", V)).toBeNull();
  });
});
