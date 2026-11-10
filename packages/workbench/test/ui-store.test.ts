import { describe, expect, test } from "vitest";
import { ContributionRegistry, SIDEBAR_MAX, SIDEBAR_MIN, createUiStore, type ModuleContribution } from "../src/index.js";

describe("ui-store", () => {
  test("打开模块：每个模块最多一个标签；再点当前模块切换侧栏折叠", () => {
    const s = createUiStore();
    s.getState().openModule("tasks");
    s.getState().openModule("notes");
    s.getState().openModule("tasks");
    expect(s.getState().openTabs).toEqual(["tasks", "notes"]);
    expect(s.getState().sidebarCollapsed).toBe(false);
    s.getState().openModule("tasks");
    expect(s.getState().sidebarCollapsed).toBe(true);
  });
  test("关闭标签只关闭视图并切到相邻标签", () => {
    const s = createUiStore({ activeModule: "b", openTabs: ["a", "b"] });
    s.getState().closeTab("b");
    expect(s.getState()).toMatchObject({ activeModule: "a", openTabs: ["a"] });
    s.getState().closeTab("a");
    expect(s.getState().activeModule).toBeNull();
  });
  test("侧栏宽度钳制到 200–360 并持久化", () => {
    const saved: unknown[] = [];
    const s = createUiStore({}, (p) => saved.push(p));
    s.getState().setSidebarWidth(9999);
    expect(s.getState().sidebarWidth).toBe(SIDEBAR_MAX);
    s.getState().setSidebarWidth(1);
    expect(s.getState().sidebarWidth).toBe(SIDEBAR_MIN);
    expect(saved.length).toBe(2);
    expect(createUiStore({ sidebarWidth: 300 }).getState().sidebarWidth).toBe(300);
  });
});

describe("ContributionRegistry", () => {
  const mod = (id: string, plugin: string, order: number): ModuleContribution => ({ id, plugin, title: id, group: "primary", order, icon: null, component: () => null });
  test("注册、排序、注销、按插件移除；快照引用稳定", () => {
    const r = new ContributionRegistry();
    let notified = 0;
    r.subscribe(() => notified++);
    const off = r.register({ modules: [mod("b", "p2", 2), mod("a", "p1", 1)] });
    const snap = r.getSnapshot();
    expect(snap.modules.map((m) => m.id)).toEqual(["a", "b"]);
    expect(r.getSnapshot()).toBe(snap);
    r.removePlugin("p1");
    expect(r.getSnapshot().modules.map((m) => m.id)).toEqual(["b"]);
    off();
    expect(r.getSnapshot().modules).toEqual([]);
    expect(notified).toBe(3);
  });
});
