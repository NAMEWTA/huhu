import { describe, expect, test } from "vitest";
import { ContributionRegistry, SIDEBAR_MAX, SIDEBAR_MIN, createUiStore, openSettings, registerModuleLeaveGuard, type ModuleContribution } from "../src/index.js";

describe("openSettings", () => {
  test("打开设置并定位到某一页；已在设置时不切换侧栏折叠", () => {
    const s = createUiStore({ activeModule: "home", openTabs: ["home"] });
    openSettings(s, "agent-cli");
    expect(s.getState()).toMatchObject({ activeModule: "settings", sections: { settings: "agent-cli" }, sidebarCollapsed: false });
    openSettings(s, "safe");
    expect(s.getState()).toMatchObject({ activeModule: "settings", sections: { settings: "safe" }, sidebarCollapsed: false });
  });
});

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
  test("离场许可控制真实模块导航和首页标签的关闭", async () => {
    const store = createUiStore({ activeModule: "home", openTabs: ["home", "notes"] });
    let resolve!: (allowed: boolean) => void;
    let decision = new Promise<boolean>((done) => {
      resolve = done;
    });
    const unregister = registerModuleLeaveGuard(store, "home", () => decision);
    store.getState().closeTab("home");
    expect(store.getState().activeModule).toBe("home");
    resolve(false);
    await decision;
    expect(store.getState().openTabs).toEqual(["home", "notes"]);
    decision = new Promise<boolean>((done) => {
      resolve = done;
    });
    store.getState().openModule("notes");
    expect(store.getState().activeModule).toBe("home");
    resolve(true);
    await decision;
    expect(store.getState().activeModule).toBe("notes");
    unregister();
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
  test("命中请求等待离场许可，失效后取消，已打开模块直接接收后续请求", async () => {
    const store = createUiStore({ activeModule: "home", openTabs: ["home"] });
    const opened: string[] = [];
    let decide!: (allowed: boolean) => void;
    registerModuleLeaveGuard(store, "home", () => new Promise<boolean>((resolve) => { decide = resolve; }));
    let current = true;
    const open = (id: string) => store.getState().openModule("inbox", { onOpen: () => opened.push(id), isCurrent: () => current });
    const declined = open("first");
    expect(opened).toEqual([]);
    decide(false);
    await expect(declined).resolves.toBe(false);
    const stale = open("second");
    current = false;
    decide(true);
    await expect(stale).resolves.toBe(false);
    expect(store.getState().activeModule).toBe("home");
    expect(opened).toEqual([]);
    current = true;
    const allowed = open("third");
    decide(true);
    await expect(allowed).resolves.toBe(true);
    expect(open("fourth")).toBe(true);
    expect(opened).toEqual(["third", "fourth"]);
    expect(store.getState()).toMatchObject({ activeModule: "inbox", sidebarCollapsed: false });
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
