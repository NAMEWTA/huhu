import type { DocTab, SidebarContext } from "@huhu/contracts";
import { tabKey } from "./docTabs.js";

/**
 * 侧栏上下文：由活动标签推导 + 用户手动切换（design §7，E02）。
 * 纯 reducer：活动标签变化是一次显式事件（`activate`），手动点击是另一次显式事件（`choose`）；
 * 没有互相触发的 effect，所以手动切换不会被“推导”弹回，推导也不会被手动状态卡住。
 * 两种上下文的展开 / 选中状态分别存。
 */

export interface ContextView {
  expanded: readonly string[];
  selected: string | null;
}
export interface SidebarState {
  readonly context: SidebarContext;
  /** 最近一次 activate 对应的标签键：同一标签重复 activate 不覆盖用户的手动选择。 */
  readonly lastActiveKey: string | null;
  readonly views: Readonly<Record<SidebarContext, ContextView>>;
}

export type SidebarAction =
  | { type: "activate"; tab: DocTab | null }
  | { type: "choose"; context: SidebarContext }
  /** `context` 缺省 = 当前上下文；跨上下文写入（例如在档案上下文里展开文件树的父目录）必须显式指定。 */
  | { type: "expand"; path: string; open: boolean; context?: SidebarContext }
  | { type: "select"; path: string | null; context?: SidebarContext }
  /** 改名 / 移动：文件树的展开 / 选中路径跟着变（按前缀）。 */
  | { type: "remap"; from: string; to: string };

export function contextOfTab(tab: DocTab | null): SidebarContext {
  return tab && tab.kind !== "file" ? "archives" : "files";
}

export const initialSidebarState: SidebarState = {
  context: "files",
  lastActiveKey: null,
  views: { files: { expanded: [], selected: null }, archives: { expanded: [], selected: null } },
};

const patchView = (s: SidebarState, context: SidebarContext, f: (v: ContextView) => ContextView): SidebarState => ({ ...s, views: { ...s.views, [context]: f(s.views[context]) } });
const remapPath = (p: string, from: string, to: string): string => (p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p);

export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "activate": {
      const key = action.tab ? tabKey(action.tab) : null;
      if (key === state.lastActiveKey) return state; // 同一标签：不覆盖手动选择
      return { ...state, lastActiveKey: key, context: contextOfTab(action.tab) };
    }
    case "choose":
      return state.context === action.context ? state : { ...state, context: action.context };
    case "expand":
      return patchView(state, action.context ?? state.context, (v) => ({ ...v, expanded: action.open ? (v.expanded.includes(action.path) ? v.expanded : [...v.expanded, action.path]) : v.expanded.filter((p) => p !== action.path) }));
    case "select":
      return patchView(state, action.context ?? state.context, (v) => ({ ...v, selected: action.path }));
    case "remap":
      return patchView(state, "files", (v) => ({ expanded: v.expanded.map((p) => remapPath(p, action.from, action.to)), selected: v.selected === null ? null : remapPath(v.selected, action.from, action.to) }));
  }
}
