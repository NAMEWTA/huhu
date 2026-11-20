import { createStore, type StoreApi } from "zustand/vanilla";
import { localExitRequest, type ExitParticipant } from "./exit-participants.js";

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
  openModule(id: string): boolean | Promise<boolean>;
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

const leaveGuards = new WeakMap<StoreApi<UiState>, Map<string, ExitParticipant>>();

export function registerModuleLeaveGuard(store: StoreApi<UiState>, module: string, guard: ExitParticipant): () => void {
  const guards = leaveGuards.get(store) ?? new Map<string, ExitParticipant>();
  leaveGuards.set(store, guards);
  guards.set(module, guard);
  return () => {
    if (guards.get(module) === guard) guards.delete(module);
  };
}

/**
 * 界面状态，按 vaultId 分片（每个 Vault 一个 store）。
 * 点击当前已选模块切换侧栏折叠；每个模块最多一个标签。
 */
export function createUiStore(initial: Partial<UiPersisted> = {}, onPersist?: (s: UiPersisted) => void): StoreApi<UiState> {
  const leave = (from: string | null, action: () => void) => {
    const proceed = (allowed: boolean) => {
      if (!allowed || store.getState().activeModule !== from) return false;
      action();
      return true;
    };
    const result = from ? leaveGuards.get(store)?.get(from)?.(localExitRequest("navigation")) : undefined;
    return result instanceof Promise ? result.then(proceed, () => false) : proceed(result !== false);
  };
  const store: StoreApi<UiState> = createStore<UiState>((set, get) => ({
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
      if (s.activeModule === id) {
        set({ sidebarCollapsed: !s.sidebarCollapsed });
        return true;
      }
      return leave(s.activeModule, () => {
        const { openTabs } = get();
        set({ activeModule: id, openTabs: openTabs.includes(id) ? openTabs : [...openTabs, id], detailOpen: false });
      });
    },
    closeTab: (id) => {
      const s = get();
      leave(s.activeModule === id ? id : null, () => {
        const current = get();
        const tabs = current.openTabs.filter((t) => t !== id);
        const active = current.activeModule === id ? (tabs[tabs.length - 1] ?? null) : current.activeModule;
        set({ openTabs: tabs, activeModule: active });
      });
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
