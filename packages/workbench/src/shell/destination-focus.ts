import type { StoreApi } from "zustand/vanilla";
import type { UiState } from "../state/ui-store.js";

/** Focus the destination after React renders the approved navigation and the palette exits. */
export function focusOpenedModule(ui: StoreApi<UiState>, module: string): void {
  requestAnimationFrame(() => {
    const state = ui.getState();
    if (state.activeModule !== module || state.paletteOpen || document.querySelector("dialog[open]")) return;
    document.querySelector<HTMLElement>('.hu-tab-list [aria-current="page"]')?.focus();
  });
}
