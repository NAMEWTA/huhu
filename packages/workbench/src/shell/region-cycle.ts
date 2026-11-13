import { useEffect } from "react";

/** 外壳的焦点区域（DOM 顺序）：功能图标栏 → 模块侧栏 → 内容 → 详情面板。元素用 `data-region` 标记。 */
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], .cm-content';
/** 区域里优先落在“当前项”上：选中的导航项、当前页、已打开的标签。 */
const PREFERRED = '[aria-current="page"], [aria-selected="true"], button.active, [data-region-focus]';

export function nextIndex(count: number, current: number, backwards: boolean): number {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

export function cycleRegion(root: ParentNode, active: Element | null, backwards: boolean): boolean {
  const regions = [...root.querySelectorAll<HTMLElement>("[data-region]")].filter(visible);
  const cur = regions.findIndex((r) => active !== null && r.contains(active));
  const target = regions[nextIndex(regions.length, cur, backwards)];
  if (!target) return false;
  const el = target.querySelector<HTMLElement>(PREFERRED) ?? target.querySelector<HTMLElement>(FOCUSABLE);
  if (el) el.focus();
  else {
    target.tabIndex = -1;
    target.focus();
  }
  return true;
}

/** F6 / Shift+F6 在外壳区域间循环（design-system.md：侧栏 → 内容 → 详情）。 */
export function useRegionCycle(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F6" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return; // 对话框打开时焦点留在对话框里
      if (cycleRegion(document, document.activeElement, e.shiftKey)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
