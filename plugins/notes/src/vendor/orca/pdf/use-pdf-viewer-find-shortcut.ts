import { useEffect, type RefObject } from "react";

const editable = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']";

export function pdfViewerOwnsFind(root: HTMLElement | null, target: EventTarget | null, ownsCommands: boolean): boolean {
  if (!root || !ownsCommands || !(target instanceof Element)) return false;
  if (root.contains(target)) return true;
  const pane = root.closest("[data-notes-find-pane]");
  return pane !== null && pane.contains(target) && !target.closest(editable);
}

export function usePdfViewerFindShortcut({ rootRef, ownsCommands, matchesFind, openFind }: { rootRef: RefObject<HTMLElement | null>; ownsCommands: boolean; matchesFind: (event: KeyboardEvent) => boolean; openFind: () => void }): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !matchesFind(event)) return;
      if (!pdfViewerOwnsFind(rootRef.current, event.composedPath()[0] ?? event.target, ownsCommands)) return;
      event.preventDefault();
      event.stopPropagation();
      openFind();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [matchesFind, openFind, ownsCommands, rootRef]);
}
