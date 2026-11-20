import type { DocTab } from "@huhu/contracts";
import { archiveNoteRoute } from "../archives/route.js";

/**
 * 标签模型（design §7，OP-D12）：`DocTab` 联合标签 + 纯 reducer。只落模型，不改 UI（S6 接 UI）。
 * 标签带 `vaultId`；切 Vault 时 `epoch` 递增，迟到的异步结果据此丢弃。
 */

export interface DocTabsState {
  readonly vaultId: string;
  readonly tabs: readonly DocTab[];
  readonly activeKey: string | null;
  readonly epoch: number;
}

export type DocTabsAction =
  | { type: "open"; tab: DocTab }
  | { type: "focus"; key: string }
  | { type: "close"; key: string }
  | { type: "restore"; vaultId: string; tabs: readonly DocTab[]; activeKey: string | null }
  | { type: "switchVault"; vaultId: string }
  /** 改名 / 移动：文件与档案记录标签按同一文件路径重定位。 */
  | { type: "remap"; from: string; to: string }
  /** 文件已不存在（回收 / 删除）：对应标签消失；档案首页与类型视图没有文件路径。 */
  | { type: "prune"; alive: ReadonlySet<string> };

export function createDocTabsState(vaultId: string): DocTabsState {
  return { vaultId, tabs: [], activeKey: null, epoch: 0 };
}

/** 标签的稳定唯一键：同一资源只有一个标签。 */
export function tabKey(tab: DocTab): string {
  switch (tab.kind) {
    case "file":
      return `file:${tab.vaultId}:${tab.path}`;
    case "archives-home":
      return `archives-home:${tab.vaultId}`;
    case "archive-type":
      return `archive-type:${tab.vaultId}:${tab.type}`;
    case "archive-record":
      return `archive-record:${tab.vaultId}:${tab.type}:${tab.name}`;
  }
}

/** 档案记录对应的真实文件（同一文件同一 DocumentSession，E04）。 */
export function archiveRecordPath(tab: Extract<DocTab, { kind: "archive-record" }>): string {
  return `Archives/${tab.type}/${tab.name}/index.md`;
}

/** 标签对应的文件路径（档案首页 / 类型视图没有单个文件）。 */
export function tabFilePath(tab: DocTab): string | null {
  if (tab.kind === "file") return tab.path;
  if (tab.kind === "archive-record") return archiveRecordPath(tab);
  return null;
}

const remapPath = (s: string, from: string, to: string): string => (s === from ? to : s.startsWith(`${from}/`) ? `${to}${s.slice(from.length)}` : s);

function remapTab(t: DocTab, from: string, to: string): DocTab {
  const oldPath = tabFilePath(t);
  if (oldPath === null) return t;
  const path = remapPath(oldPath, from, to);
  if (path === oldPath) return t;
  if (t.kind === "file") return { ...t, path };
  const route = archiveNoteRoute(path);
  if (route?.kind === "archive") {
    const [, type, name] = route.path.split("/");
    if (type && name) return { kind: "archive-record", vaultId: t.vaultId, type, name };
  }
  return { kind: "file", vaultId: t.vaultId, path, view: "rich" };
}

function neighbour(tabs: readonly DocTab[], index: number): string | null {
  const next = tabs[index + 1] ?? tabs[index - 1];
  return next ? tabKey(next) : null;
}

export function docTabsReducer(state: DocTabsState, action: DocTabsAction): DocTabsState {
  switch (action.type) {
    case "open": {
      if (action.tab.vaultId !== state.vaultId) return state; // 他库的标签不进入当前库的标签条
      const key = tabKey(action.tab);
      const exists = state.tabs.some((t) => tabKey(t) === key);
      if (exists) {
        // 已打开：聚焦；文件标签的视图以最新请求为准（rich / source / read）
        const tabs = state.tabs.map((t) => (tabKey(t) === key ? action.tab : t));
        return { ...state, tabs, activeKey: key };
      }
      return { ...state, tabs: [...state.tabs, action.tab], activeKey: key };
    }
    case "focus":
      return state.tabs.some((t) => tabKey(t) === action.key) ? { ...state, activeKey: action.key } : state;
    case "close": {
      const i = state.tabs.findIndex((t) => tabKey(t) === action.key);
      if (i < 0) return state;
      const tabs = state.tabs.filter((_, j) => j !== i);
      const activeKey = state.activeKey === action.key ? neighbour(state.tabs, i) : state.activeKey;
      return { ...state, tabs, activeKey };
    }
    case "restore": {
      const tabs = action.tabs.filter((t) => t.vaultId === action.vaultId);
      const keys = new Set(tabs.map(tabKey));
      const activeKey = action.activeKey && keys.has(action.activeKey) ? action.activeKey : tabs[0] ? tabKey(tabs[0]) : null;
      return { vaultId: action.vaultId, tabs, activeKey, epoch: state.epoch + 1 };
    }
    case "switchVault":
      if (action.vaultId === state.vaultId) return state;
      return { vaultId: action.vaultId, tabs: [], activeKey: null, epoch: state.epoch + 1 };
    case "remap": {
      const tabs = new Map<string, DocTab>();
      let activeKey = state.activeKey;
      for (const t of state.tabs) {
        const next = remapTab(t, action.from, action.to);
        const key = tabKey(next);
        if (!tabs.has(key)) tabs.set(key, next);
        if (tabKey(t) === state.activeKey) activeKey = key;
      }
      return { ...state, tabs: [...tabs.values()], activeKey };
    }
    case "prune": {
      const tabs = state.tabs.filter((t) => {
        const path = tabFilePath(t);
        return path === null || action.alive.has(path) || (t.kind === "file" && t.view === "viewer");
      });
      if (tabs.length === state.tabs.length) return state;
      const activeKey = state.activeKey && tabs.some((t) => tabKey(t) === state.activeKey) ? state.activeKey : tabs[0] ? tabKey(tabs[0]) : null;
      return { ...state, tabs, activeKey };
    }
  }
}

export function activeTab(state: DocTabsState): DocTab | null {
  return state.tabs.find((t) => tabKey(t) === state.activeKey) ?? null;
}
