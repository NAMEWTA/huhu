import type { DocTab } from "@huhu/contracts";
import { activeTab, createDocTabsState, docTabsReducer, tabKey, type DocTabsAction, type DocTabsState } from "./docTabs.js";
import { initialSidebarState, sidebarReducer, type SidebarAction, type SidebarState } from "./sidebarContext.js";

/**
 * 标签 + 侧栏的组合状态（S6，design §7）：标签动作与侧栏推导在**同一个纯 reducer** 里完成，
 * 没有“标签变了 → effect → 改侧栏 → effect → 改标签”的回路（E02）。
 * - 标签变化（open / focus / close / remap / prune / restore / switchVault）之后，用新的活动标签 `activate` 侧栏；
 * - `open` / `focus` 是用户的显式激活：清掉 `lastActiveKey`，所以手动切到“文件”后再次点同一个档案标签会恢复档案上下文；
 * - 手动切换（`sidebar/choose`）只改显示上下文，不改标签。
 */
export interface ShellState {
  readonly tabs: DocTabsState;
  readonly sidebar: SidebarState;
}

export type ShellAction = DocTabsAction | { type: "sidebar"; action: SidebarAction };

export function createShellState(vaultId: string): ShellState {
  return { tabs: createDocTabsState(vaultId), sidebar: initialSidebarState };
}

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  if (action.type === "sidebar") {
    const sidebar = sidebarReducer(state.sidebar, action.action);
    return sidebar === state.sidebar ? state : { ...state, sidebar };
  }
  const tabs = docTabsReducer(state.tabs, action);
  const explicit = action.type === "open" || action.type === "focus";
  const base = explicit ? { ...state.sidebar, lastActiveKey: null } : state.sidebar;
  const sidebar = sidebarReducer(base, { type: "activate", tab: activeTab(tabs) });
  // 文件改名 / 移动：文件树的展开路径同步
  const remapped = action.type === "remap" ? sidebarReducer(sidebar, { type: "remap", from: action.from, to: action.to }) : sidebar;
  if (tabs === state.tabs && remapped === state.sidebar) return state;
  return { tabs, sidebar: remapped };
}

// ---- 档案标签构造（路径 ↔ 标签）----
const trim = (p: string): string => p.replace(/\/+$/, "");

export const archivesHomeTab = (vaultId: string): DocTab => ({ kind: "archives-home", vaultId });
/** 类型路径 `Archives/<类型>/` → 类型标签。 */
export function archiveTypeTab(vaultId: string, typePath: string): DocTab | null {
  const parts = trim(typePath).split("/");
  return parts.length === 2 && parts[0] === "Archives" && parts[1] ? { kind: "archive-type", vaultId, type: parts[1] } : null;
}
/** 档案路径 `Archives/<类型>/<名称>/`（或其 `index.md`）→ 记录标签。 */
export function archiveRecordTab(vaultId: string, archivePath: string): DocTab | null {
  const parts = trim(archivePath.replace(/\/index\.md$/i, "")).split("/");
  return parts.length === 3 && parts[0] === "Archives" && parts[1] && parts[2] ? { kind: "archive-record", vaultId, type: parts[1], name: parts[2] } : null;
}
export const fileTab = (vaultId: string, path: string, view: "rich" | "source" | "read" | "viewer" = "rich"): DocTab => ({ kind: "file", vaultId, path, view });

/** 档案标签在侧栏的“选中键”：记录 = `Archives/<类型>/<名称>`，类型 = `Archives/<类型>`，首页 = `Archives`。 */
export function archiveSelectionOf(tab: DocTab | null): string | null {
  if (!tab) return null;
  if (tab.kind === "archives-home") return "Archives";
  if (tab.kind === "archive-type") return `Archives/${tab.type}`;
  if (tab.kind === "archive-record") return `Archives/${tab.type}/${tab.name}`;
  return null;
}

// ---- 随 Vault 记录 / 恢复（localStorage；不可用时静默回退为空）----
const STORE_PREFIX = "huhu.notes.tabs.v1:";
export interface PersistedTabs {
  tabs: DocTab[];
  activeKey: string | null;
}
export function serializeTabs(state: DocTabsState): PersistedTabs {
  return { tabs: [...state.tabs], activeKey: state.activeKey };
}
export function parseTabs(raw: unknown, vaultId: string): PersistedTabs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { tabs?: unknown; activeKey?: unknown };
  if (!Array.isArray(r.tabs)) return null;
  const tabs: DocTab[] = [];
  for (const t of r.tabs) {
    if (!t || typeof t !== "object") continue;
    const x = t as Record<string, unknown>;
    if (x.vaultId !== vaultId) continue;
    if (x.kind === "file" && typeof x.path === "string" && x.path) tabs.push(fileTab(vaultId, x.path, x.view === "source" || x.view === "read" || x.view === "viewer" ? x.view : "rich"));
    else if (x.kind === "archives-home") tabs.push(archivesHomeTab(vaultId));
    else if (x.kind === "archive-type" && typeof x.type === "string" && x.type) tabs.push({ kind: "archive-type", vaultId, type: x.type });
    else if (x.kind === "archive-record" && typeof x.type === "string" && typeof x.name === "string" && x.type && x.name) tabs.push({ kind: "archive-record", vaultId, type: x.type, name: x.name });
  }
  return { tabs, activeKey: typeof r.activeKey === "string" ? r.activeKey : null };
}
export function loadTabs(vaultId: string): PersistedTabs | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_PREFIX + vaultId);
    return raw ? parseTabs(JSON.parse(raw), vaultId) : null;
  } catch {
    return null;
  }
}
export function saveTabs(vaultId: string, state: DocTabsState): void {
  try {
    globalThis.localStorage?.setItem(STORE_PREFIX + vaultId, JSON.stringify(serializeTabs(state)));
  } catch {
    /* 隐私模式 / 配额：标签只是便利，不影响数据 */
  }
}

/** 由持久化内容构造初始状态。 */
export function restoreShellState(vaultId: string, saved: PersistedTabs | null): ShellState {
  const base = createShellState(vaultId);
  if (!saved || saved.tabs.length === 0) return base;
  return shellReducer(base, { type: "restore", vaultId, tabs: saved.tabs, activeKey: saved.activeKey });
}

export { tabKey };
