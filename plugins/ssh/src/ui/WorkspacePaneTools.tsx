import { Button, IconButton } from "@huhu/ui";
import { GripHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { DevicePreferences } from "./device-preferences.js";

type Dock = Exclude<DevicePreferences["paneTools"], "hidden">;
type Tool = "move" | "files" | "monitor";
const dockName: Record<Dock, string> = { top: "上方", bottom: "下方" };
const dragType = "application/x-huhu-ssh-pane-toolbar";

export function WorkspacePaneTools({
  paneId,
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
  paneId: string;
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
  const sourceDock = useRef<Dock | undefined>(undefined);
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

  useEffect(() => {
    if (!dragging) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !sourceDock.current) return;
      event.preventDefault();
      event.stopPropagation();
      sourceDock.current = undefined;
      setDragging(false);
      setOver(false);
      onStatus("已取消工具栏移动。");
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  }, [dragging, onStatus]);

  function move(dock: Dock, handle: HTMLElement | null) {
    if (!visible || position === dock) return;
    restoreHandle.current = handle === document.activeElement;
    if (!onMove(dock)) restoreHandle.current = false;
  }

  function clearDrag() {
    sourceDock.current = undefined;
    setDragging(false);
    setOver(false);
  }

  function accepts(event: DragEvent<HTMLDivElement>) {
    return visible && sourceDock.current === position && event.dataTransfer.types.includes(dragType);
  }

  function hoverDrop(event: DragEvent<HTMLDivElement>) {
    if (!accepts(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOver(true);
  }

  function slot(dock: Dock) {
    if (position !== dock) {
      if (!visible || !dragging || sourceDock.current !== position) return null;
      return (
        <div
          className="ssh-pane-toolbar-drop"
          data-toolbar-drop={dock}
          data-over={over}
          aria-hidden="true"
          onDragEnter={hoverDrop}
          onDragOver={hoverDrop}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            if (!accepts(event) || event.dataTransfer.getData(dragType) !== paneId) return;
            event.preventDefault();
            event.stopPropagation();
            clearDrag();
            move(dock, view.current?.querySelector('[data-tool="move"]') ?? null);
          }}
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
          draggable={visible}
          onClick={(event) => move(other, event.currentTarget)}
          onDragStart={(event) => {
            if (!visible) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            sourceDock.current = dock;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(dragType, paneId);
            setDragging(true);
          }}
          onDragEnd={() => {
            if (sourceDock.current) onStatus("已取消工具栏移动。");
            clearDrag();
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
