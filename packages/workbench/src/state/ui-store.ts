import { createStore, type StoreApi } from "zustand/vanilla";

export interface UiState {
  activeModule: string | null;
  openTabs: string[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  detailOpen: boolean;
  focusMode: boolean;
  paletteOpen: boolean;
  /** 各模块当前分区（外壳导航 / 顶部标签用）。 */
  sections: Record<string, string>;
  setSection(module: string, id: string): void;
  openModule(id: string): void;
  closeTab(id: string): void;
  toggleSidebar(): void;
  setSidebarWidth(w: number): void;
  setDetailOpen(open: boolean): void;
  setFocusMode(on: boolean): void;
  setPaletteOpen(open: boolean): void;
}

export const SIDEBAR_MIN = 176; // 原型 navWidth：默认 220，范围 176–300
export const SIDEBAR_MAX = 300;
export const SIDEBAR_DEFAULT = 220;

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
    paletteOpen: false,
    sections: {},
    setSection: (module, id) => set({ sections: { ...get().sections, [module]: id } }),
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
    setPaletteOpen: (open) => set({ paletteOpen: open }),
  }));
  if (onPersist) {
    store.subscribe((s) => onPersist({ activeModule: s.activeModule, openTabs: s.openTabs, sidebarCollapsed: s.sidebarCollapsed, sidebarWidth: s.sidebarWidth }));
  }
  return store;
}

/** 打开设置并定位到某一页（不走 openModule 的“再次点击折叠侧栏”逻辑）。页不存在时由外壳回退到第一项。 */
export function openSettings(ui: StoreApi<UiState>, page?: string): void {
  const s = ui.getState();
  if (page) s.setSection("settings", page);
  if (s.activeModule !== "settings") s.openModule("settings");
}

function clampWidth(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
}
