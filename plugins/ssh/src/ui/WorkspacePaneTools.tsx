import { Button, IconButton } from "@huhu/ui";
import { GripHorizontal } from "lucide-react";
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { DevicePreferences } from "./device-preferences.js";

type Dock = Exclude<DevicePreferences["paneTools"], "hidden">;
type Tool = "move" | "files" | "monitor";
const dockName: Record<Dock, string> = { top: "上方", bottom: "下方" };
const dragThreshold = 4;

export function WorkspacePaneTools({
  label,
  visible,
  position,
  size,
  order,
  onMove,
  onStatus,
  onFiles,
  onMonitor,
  children,
}: {
  label: string;
  visible: boolean;
  position: DevicePreferences["paneTools"];
  size: DevicePreferences["paneToolSize"];
  order: DevicePreferences["paneToolOrder"];
  onMove(dock: Dock): boolean;
  onStatus(message: string): void;
  onFiles(): void;
  onMonitor(): void;
  children: ReactNode;
}) {
  const view = useRef<HTMLDivElement>(null);
  const dropTarget = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const ignorePointerClick = useRef(false);
  const restoreHandle = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [focused, setFocused] = useState<Tool>("move");
  const nativeFocusGroup = typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;
  const actions = order === "files-first" ? (["files", "monitor"] as const) : (["monitor", "files"] as const);

  useLayoutEffect(() => {
    if (!restoreHandle.current) return;
    restoreHandle.current = false;
    view.current?.querySelector<HTMLButtonElement>('[data-tool="move"]')?.focus({ preventScroll: true });
  }, [position]);

  function move(dock: Dock, handle: HTMLElement | null) {
    if (!visible || position === dock) return;
    restoreHandle.current = handle === document.activeElement;
    if (!onMove(dock)) restoreHandle.current = false;
  }

  function clearDrag() {
    drag.current = null;
    setDragging(false);
    setOver(false);
  }

  function cancelDrag() {
    if (drag.current?.active) onStatus("已取消工具栏移动。");
    clearDrag();
  }

  function isOverDropTarget(event: PointerEvent<HTMLButtonElement>) {
    return visible && (dropTarget.current?.contains(document.elementFromPoint(event.clientX, event.clientY)) ?? false);
  }

  function slot(dock: Dock) {
    if (position !== dock) {
      if (!visible || !dragging) return null;
      return (
        <div
          ref={dropTarget}
          className="ssh-pane-toolbar-drop"
          data-toolbar-drop={dock}
          data-over={over}
          aria-hidden="true"
        >
          移至分栏{dockName[dock]}
        </div>
      );
    }

    const other = dock === "top" ? "bottom" : "top";
    return (
      <div
        role="toolbar"
        aria-label={`${label}终端工具栏`}
        {...{ focusgroup: "toolbar wrap" }}
        className="ssh-workspace-controls ssh-pane-toolbar"
        data-testid="ssh-pane-tools"
        data-position={dock}
        data-size={size}
        onFocusCapture={(event) => {
          if (!nativeFocusGroup && event.target instanceof HTMLButtonElement) setFocused(event.target.dataset.tool as Tool);
        }}
        onKeyDown={(event) => {
          if (nativeFocusGroup || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tool]")];
          const index = controls.findIndex((button) => button === event.target);
          if (index < 0) return;
          event.preventDefault();
          const reverse = getComputedStyle(event.currentTarget).direction === "rtl";
          const delta = (event.key === "ArrowRight") !== reverse ? 1 : -1;
          const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + delta + controls.length) % controls.length;
          controls[next]?.focus();
        }}
      >
        <IconButton
          icon={GripHorizontal}
          label={`移至分栏${dockName[other]}`}
          className="ssh-pane-toolbar-handle"
          data-tool="move"
          data-pane-layout-control
          tabIndex={nativeFocusGroup ? undefined : focused === "move" ? 0 : -1}
          onClick={(event) => {
            if (event.detail === 0 || !ignorePointerClick.current) move(other, event.currentTarget);
          }}
          onPointerDown={(event) => {
            if (!visible || !event.isPrimary || event.button !== 0 || drag.current) return;
            ignorePointerClick.current = false;
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
          }}
          onPointerMove={(event) => {
            const started = drag.current;
            if (started?.id !== event.pointerId) return;
            if (!started.active) {
              if (Math.hypot(event.clientX - started.x, event.clientY - started.y) < dragThreshold) return;
              started.active = true;
              ignorePointerClick.current = true;
              setDragging(true);
            }
            setOver(isOverDropTarget(event));
          }}
          onPointerUp={(event) => {
            const started = drag.current;
            if (started?.id !== event.pointerId) return;
            if (started.active && !isOverDropTarget(event)) {
              cancelDrag();
              return;
            }
            clearDrag();
            if (started.active) move(other, event.currentTarget);
          }}
          onLostPointerCapture={(event) => {
            if (drag.current?.id === event.pointerId) cancelDrag();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !drag.current?.active) return;
            event.preventDefault();
            event.stopPropagation();
            cancelDrag();
          }}
        />
        <div className="ssh-workspace-controls" role="group" aria-label="分栏工具">
          {actions.map((tool) => (
            <Button key={tool} data-tool={tool} tabIndex={nativeFocusGroup ? undefined : focused === tool ? 0 : -1} onClick={tool === "files" ? onFiles : onMonitor}>
              {tool === "files" ? "分栏文件" : "分栏监控"}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={view}>
      {slot("top")}
      {children}
      {slot("bottom")}
    </div>
  );
}
