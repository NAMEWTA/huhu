import { createStore, type StoreApi } from "zustand/vanilla";

export interface UiState {
  activeModule: string | null;
  openTabs: string[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  detailOpen: boolean;
  focusMode: boolean;
  openModule(id: string): void;
  closeTab(id: string): void;
  toggleSidebar(): void;
  setSidebarWidth(w: number): void;
  setDetailOpen(open: boolean): void;
  setFocusMode(on: boolean): void;
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 260;

export type UiPersisted = Pick<UiState, "activeModule" | "openTabs" | "sidebarCollapsed" | "sidebarWidth">;

/**
 * 界面状态，按 vaultId 分片（每个 Vault 一个 store）。
 * 点击当前已选模块切换侧栏折叠；每个模块最多一个标签。
 */
export function createUiStore(initial: Partial<UiPersisted> = {}, onPersist?: (s: UiPersisted) => void): StoreApi<UiState> {
  const store = createStore<UiState>((set, get) => ({
    activeModule: initial.activeModule ?? null,
    openTabs: initial.openTabs ?? [],
    sidebarCollapsed: initial.sidebarCollapsed ?? false,
    sidebarWidth: clampWidth(initial.sidebarWidth ?? SIDEBAR_DEFAULT),
    detailOpen: false,
    focusMode: false,
    openModule: (id) => {
      const s = get();
      if (s.activeModule === id) return set({ sidebarCollapsed: !s.sidebarCollapsed });
      set({ activeModule: id, openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id], detailOpen: false });
    },
    closeTab: (id) => {
      const s = get();
      const tabs = s.openTabs.filter((t) => t !== id);
      const active = s.activeModule === id ? (tabs[tabs.length - 1] ?? null) : s.activeModule;
      set({ openTabs: tabs, activeModule: active });
    },
    toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    setSidebarWidth: (w) => set({ sidebarWidth: clampWidth(w) }),
    setDetailOpen: (open) => set({ detailOpen: open }),
    setFocusMode: (on) => set({ focusMode: on }),
  }));
  if (onPersist) {
    store.subscribe((s) => onPersist({ activeModule: s.activeModule, openTabs: s.openTabs, sidebarCollapsed: s.sidebarCollapsed, sidebarWidth: s.sidebarWidth }));
  }
  return store;
}

function clampWidth(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
}
