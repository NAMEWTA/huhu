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
  | { type: "expand"; path: string; open: boolean }
  | { type: "select"; path: string | null };

export function contextOfTab(tab: DocTab | null): SidebarContext {
  return tab && tab.kind !== "file" ? "archives" : "files";
}

export const initialSidebarState: SidebarState = {
  context: "files",
  lastActiveKey: null,
  views: { files: { expanded: [], selected: null }, archives: { expanded: [], selected: null } },
};

const patchView = (s: SidebarState, f: (v: ContextView) => ContextView): SidebarState => ({ ...s, views: { ...s.views, [s.context]: f(s.views[s.context]) } });

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
      return patchView(state, (v) => ({ ...v, expanded: action.open ? (v.expanded.includes(action.path) ? v.expanded : [...v.expanded, action.path]) : v.expanded.filter((p) => p !== action.path) }));
    case "select":
      return patchView(state, (v) => ({ ...v, selected: action.path }));
  }
}
