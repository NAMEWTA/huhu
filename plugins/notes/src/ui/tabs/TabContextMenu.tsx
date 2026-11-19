import { useLayoutEffect, useRef } from "react";
import { NoteMenu, type NoteMenuAction } from "../NoteContextMenu.js";

export interface TabMenuAnchor {
  x: number;
  y: number;
  trigger: HTMLButtonElement;
}

export function TabContextMenu({ anchor, title, actions, onClose }: { anchor: TabMenuAnchor; title: string; actions: readonly NoteMenuAction[]; onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    element.showPopover();
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !element?.contains(event.target)) onClose();
    }
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", onClose);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [anchor, onClose]);

  function restoreFocus() {
    onClose();
    anchor.trigger.focus();
  }

  return (
    <NoteMenu
      ref={menu}
      popover="manual"
      aria-label="标签页操作"
      style={{ margin: 0, inset: "auto", maxWidth: "calc(100vw - 16px)" }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key === "Escape") {
          if (event.key === "Escape") event.preventDefault();
          event.stopPropagation();
          restoreFocus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!items.length) return;
        const current = items.findIndex((item) => item === document.activeElement);
        const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        event.preventDefault();
        items[index]?.focus();
      }}
    >
      <div className="knowledge-menu-caption">{title}</div>
      {actions.map(({ label, disabled, run }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            restoreFocus();
            run();
          }}
        >
          {label}
        </button>
      ))}
    </NoteMenu>
  );
}
