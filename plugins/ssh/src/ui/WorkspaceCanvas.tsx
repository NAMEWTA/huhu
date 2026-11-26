import { Button, IconButton, Popover } from "@huhu/ui";
import { Ellipsis } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { ConnectionStatus } from "../shared/trust.js";
import { paneCount, resizeSplit, type SplitTree, type WorkspaceLayout, type WorkspaceRunPane } from "../shared/workspace.js";
import { groupWorkspaceTabs } from "./workspace-tab-groups.js";

type Cell = { x: number; y: number; w: number; h: number };
type SplitPath = ("first" | "second")[];
type Splitter = {
  path: SplitPath;
  cell: Cell;
  axis: "row" | "column";
  percent: number;
  firstIndex: number;
  firstCount: number;
  size: number;
};
type SplitDrag = {
  id: number;
  tree: SplitTree;
  revision: string;
  path: SplitPath;
  origin: number;
  start: number;
  next: number;
  length: number;
};
export type WorkspaceTabAction = { label: string; run(): void; disabled?: boolean };
const canvas = { x: 0, y: 0, w: 1, h: 1 };
const fractions = (count: number) => Array.from({ length: count }, (_, index) => index / count);
const precision = (value: number) => Number(value.toFixed(12));

function customCells(node: SplitTree, cell: Cell, splitters: Splitter[], path: SplitPath = [], firstIndex = 0): Cell[] {
  if (node.kind === "pane") return [cell];
  const fraction = node.firstPercent / 100;
  const firstCount = paneCount(node.first);
  splitters.push({ path, cell, axis: node.axis, percent: node.firstPercent, firstIndex, firstCount, size: firstCount + paneCount(node.second) });
  const children = (first: Cell, second: Cell) => [
    ...customCells(node.first, first, splitters, [...path, "first"], firstIndex),
    ...customCells(node.second, second, splitters, [...path, "second"], firstIndex + firstCount),
  ];
  if (node.axis === "row") {
    const w = cell.w * fraction;
    return children({ ...cell, w }, { ...cell, x: cell.x + w, w: cell.w - w });
  }
  const h = cell.h * fraction;
  return children({ ...cell, h }, { ...cell, y: cell.y + h, h: cell.h - h });
}

function cellsFor(layout: WorkspaceLayout, count: number, splitters: Splitter[]): Cell[] {
  if (layout.kind === "custom") return customCells(layout.tree, canvas, splitters);
  if (layout.kind === "tabs") return Array.from({ length: count }, () => canvas);
  if (count > 1 && layout.kind === "main-right") return [{ ...canvas, w: 0.6 }, ...fractions(count - 1).map((y) => ({ x: 0.6, y, w: 0.4, h: 1 / (count - 1) }))];
  if (count > 1 && layout.kind === "main-bottom") return [{ ...canvas, h: 0.6 }, ...fractions(count - 1).map((x) => ({ x, y: 0.6, w: 1 / (count - 1), h: 0.4 }))];
  const columns = Math.min(count, layout.kind === "three" ? 3 : layout.kind === "two" ? 2 : 1);
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => ({ x: (index % columns) / columns, y: Math.floor(index / columns) / rows, w: 1 / columns, h: 1 / rows }));
}

function boundaries(cells: Cell[], start: "x" | "y", size: "w" | "h"): number[] {
  return [...new Set(cells.flatMap((cell) => [precision(cell[start]), precision(cell[start] + cell[size])]))].sort((a, b) => a - b);
}
function tracks(edges: number[], type: "row" | "column"): string {
  return edges
    .slice(1)
    .map((edge, index) => `minmax(${type === "row" ? "18rem" : "0"}, ${precision(edge - edges[index]!)}fr)`)
    .join(" ");
}
function edge(edges: number[], point: number): number {
  return edges.indexOf(precision(point)) + 1;
}

type Direction = "left" | "right" | "up" | "down";
const directions: Record<Direction, string> = { left: "向左", right: "向右", up: "向上", down: "向下" };

function neighbor(view: HTMLElement, candidates: HTMLElement[], direction: Direction) {
  const a = view.getBoundingClientRect();
  const horizontal = direction === "left" || direction === "right";
  const reverse = direction === "left" || direction === "up";
  return candidates
    .flatMap((item) => {
      if (item === view || item.hidden) return [];
      const b = item.getBoundingClientRect();
      const gap = horizontal ? (reverse ? a.left - b.right : b.left - a.right) : reverse ? a.top - b.bottom : b.top - a.bottom;
      if (gap < -1) return [];
      const [aStart, aEnd, bStart, bEnd] = horizontal ? [a.top, a.bottom, b.top, b.bottom] : [a.left, a.right, b.left, b.right];
      const offset = Math.abs(aStart + aEnd - bStart - bEnd) / 2;
      const aligned = Math.min(aEnd, bEnd) > Math.max(aStart, bStart);
      return [{ item, gap, offset, aligned }];
    })
    .sort((l, r) => Number(r.aligned) - Number(l.aligned) || (l.aligned ? l.gap - r.gap || l.offset - r.offset : l.gap + 2 * l.offset - r.gap - 2 * r.offset))[0]?.item;
}

export function WorkspaceCanvas({
  layout,
  panes,
  active,
  maximized,
  tabs,
  groupVerticalTabs,
  collapseVerticalGroups,
  connections,
  layoutRevision,
  resizingDisabled,
  onActive,
  onSwap,
  onResize,
  tabActions,
  render,
}: {
  layout: WorkspaceLayout;
  panes: WorkspaceRunPane[];
  active: string | undefined;
  maximized: boolean;
  tabs: "top" | "left";
  groupVerticalTabs: boolean;
  collapseVerticalGroups: boolean;
  connections: readonly ConnectionStatus[];
  layoutRevision: string;
  resizingDisabled: boolean;
  onActive(id: string): void;
  onSwap(from: string, to: string): void;
  onResize(tree: SplitTree, revision: string): Promise<void>;
  tabActions(pane: WorkspaceRunPane, order: readonly string[]): WorkspaceTabAction[];
  render(pane: WorkspaceRunPane, visible: boolean): ReactNode;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | undefined>(undefined);
  const splitDrag = useRef<SplitDrag | undefined>(undefined);
  const [preview, setPreview] = useState<{ tree: SplitTree; revision: string }>();
  const [tabMenu, setTabMenu] = useState<string>();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const refocus = useRef<{ id: string; order: string } | undefined>(undefined);
  const focusedTab = useRef<HTMLButtonElement | undefined>(undefined);
  const tabPrefix = useId();
  const tabbed = layout.kind === "tabs" && !maximized;
  const order = panes.map((pane) => pane.paneId).join(",");
  const tabGroups = tabs === "left" && groupVerticalTabs ? groupWorkspaceTabs(panes, connections) : panes.map((pane) => ({ key: pane.paneId, label: undefined, panes: [pane] }));
  const groupCollapsed = (group: (typeof tabGroups)[number]) => collapseVerticalGroups && group.panes.length > 1 && !expandedGroups[group.key];
  const tabIds = tabGroups.flatMap((group) => group.panes.map(({ paneId }) => paneId));
  const tabOrder = tabIds.join(",");
  useLayoutEffect(() => {
    if (focusedTab.current?.isConnected && document.activeElement === document.body) focusedTab.current.focus({ preventScroll: true });
  }, [tabOrder, tabs]);
  useLayoutEffect(() => {
    const pending = refocus.current;
    if (!pending || pending.order === order) return;
    refocus.current = undefined;
    const slots = Array.from(parent.current?.querySelectorAll<HTMLElement>("[data-workspace-spot]") ?? []);
    slots.find((slot) => !slot.hidden && slot.dataset.workspaceSpot === pending.id)?.focus({ preventScroll: true });
  }, [order]);
  const currentTree = preview?.revision === layoutRevision ? preview.tree : layout.kind === "custom" ? layout.tree : undefined;
  const splitters: Splitter[] = [];
  const rects = maximized ? panes.map(() => canvas) : cellsFor(currentTree ? { kind: "custom", tree: currentTree } : layout, panes.length, splitters);
  const x = boundaries(rects, "x", "w");
  const y = boundaries(rects, "y", "h");
  const spotId = (pane: WorkspaceRunPane) => `${tabPrefix}-pane-${pane.paneId}`;

  function beginSplit(event: PointerEvent<HTMLElement>, splitter: Splitter) {
    if (event.button !== 0 || !event.isPrimary || resizingDisabled || splitDrag.current || layout.kind !== "custom") return;
    const slots = [...(parent.current?.querySelectorAll<HTMLElement>("[data-workspace-spot]") ?? [])];
    const bounds = slots.slice(splitter.firstIndex, splitter.firstIndex + splitter.size).map((slot) => slot.getBoundingClientRect());
    if (!bounds.length) return;
    const horizontal = splitter.axis === "row";
    const first = Math.min(...bounds.map((bound) => horizontal ? bound.left : bound.top));
    const last = Math.max(...bounds.map((bound) => horizontal ? bound.right : bound.bottom));
    if (last <= first) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    splitDrag.current = { id: event.pointerId, tree: layout.tree, revision: layoutRevision, path: splitter.path, origin: horizontal ? event.clientX : event.clientY, start: splitter.percent, next: splitter.percent, length: last - first };
  }

  function moveSplit(event: PointerEvent<HTMLElement>, axis: Splitter["axis"]) {
    const drag = splitDrag.current;
    if (!drag || drag.id !== event.pointerId || drag.revision !== layoutRevision) return;
    const position = axis === "row" ? event.clientX : event.clientY;
    drag.next = Math.max(10, Math.min(90, Math.round(drag.start + 100 * (position - drag.origin) / drag.length)));
    setPreview({ tree: resizeSplit(drag.tree, drag.path, drag.next), revision: drag.revision });
  }

  function finishSplit(id: number, commit: boolean) {
    const drag = splitDrag.current;
    if (!drag || drag.id !== id) return;
    splitDrag.current = undefined;
    if (commit && drag.revision === layoutRevision && drag.next !== drag.start) {
      const tree = resizeSplit(drag.tree, drag.path, drag.next);
      void onResize(tree, drag.revision).finally(() => setPreview(undefined));
    } else {
      setPreview(undefined);
    }
  }

  function resizeWithKey(event: KeyboardEvent<HTMLElement>, splitter: Splitter) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && splitDrag.current) {
      event.preventDefault();
      finishSplit(splitDrag.current.id, false);
      return;
    }
    if (resizingDisabled || splitDrag.current || layout.kind !== "custom") return;
    const previous = splitter.axis === "row" ? "ArrowLeft" : "ArrowUp";
    const next = splitter.axis === "row" ? "ArrowRight" : "ArrowDown";
    const values: Record<string, number> = { [previous]: splitter.percent - 5, [next]: splitter.percent + 5, Home: 10, End: 90 };
    const requested = values[event.key];
    if (requested === undefined) return;
    event.preventDefault();
    const percent = Math.max(10, Math.min(90, requested));
    if (percent === splitter.percent) return;
    void onResize(resizeSplit(layout.tree, splitter.path, percent), layoutRevision);
  }

  function navigate(direction: Direction) {
    const candidates = Array.from(parent.current?.querySelectorAll<HTMLElement>("[data-workspace-spot]") ?? []);
    const focused = candidates.find((candidate) => candidate.dataset.workspaceSpot === active);
    const next = focused && neighbor(focused, candidates, direction);
    if (!next) return;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const previous = tabs === "left" ? "ArrowUp" : "ArrowLeft";
    const next = tabs === "left" ? "ArrowDown" : "ArrowRight";
    if (![previous, next, "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = buttons.findIndex((button) => button === event.target);
    if (current < 0) return;
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === next ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[index]?.focus();
  }

  return (
    <>
      {layout.kind !== "tabs" && !maximized && panes.length > 1 && (
        <div className="ssh-workspace-controls" aria-label="分栏方向导航">
          {Object.entries(directions).map(([id, label]) => (
            <Button key={id} onClick={() => navigate(id as Direction)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      {tabbed && collapseVerticalGroups && tabs === "left" && groupVerticalTabs && (
        <div className="ssh-workspace-controls" aria-label="纵向标签组">
          {tabGroups.filter((group) => group.panes.length > 1).map((group) => (
            <Button key={group.key} aria-expanded={!groupCollapsed(group)} type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}>
              {group.label} · {group.panes.length} 个标签
            </Button>
          ))}
        </div>
      )}
      <div className={tabbed ? "ssh-workspace-tabs" : undefined} data-tab-side={tabs}>
        {tabbed && (
          <div
            className="ssh-workspace-tabstrip"
            role="tablist"
            aria-label="内部标签"
            aria-orientation={tabs === "left" ? "vertical" : "horizontal"}
            onKeyDown={navigateTabs}
            onFocusCapture={(event) => {
              if (event.target instanceof HTMLButtonElement) focusedTab.current = event.target;
            }}
            onBlurCapture={(event) => {
              if (event.relatedTarget) focusedTab.current = undefined;
            }}
          >
            {tabGroups.flatMap((group) => {
              const heading = group.label && group.panes.length > 1 ? `${tabPrefix}-${group.panes[0]!.paneId}` : undefined;
              return [
                heading && (
                  <span key={group.key} id={heading} aria-hidden="true" className="ssh-workspace-tab-group" data-testid="ssh-workspace-tab-group">
                    {group.label}
                  </span>
                ),
                ...group.panes.filter((pane) => !groupCollapsed(group) || pane.paneId === active).map((pane) => (
                  <span key={pane.paneId} className="ssh-workspace-tab-entry">
                    <button type="button" role="tab" id={`${tabPrefix}-tab-${pane.paneId}`}
                      aria-selected={pane.paneId === active} aria-describedby={heading} tabIndex={pane.paneId === active ? 0 : -1}
                      data-grouped={Boolean(heading)}
                      onFocus={() => onActive(pane.paneId)} onClick={() => onActive(pane.paneId)}
                      onContextMenu={(event) => { event.preventDefault(); setTabMenu(pane.paneId); }}
                      onKeyDown={(event) => {
                        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                        event.preventDefault();
                        setTabMenu(pane.paneId);
                      }}
                    >
                      {pane.label}
                    </button>
                    <Popover.Root open={tabMenu === pane.paneId} onOpenChange={(shown) => setTabMenu((current) => shown ? pane.paneId : current === pane.paneId ? undefined : current)}>
                      <Popover.Trigger asChild><IconButton icon={Ellipsis} label={`标签操作 ${pane.label}`} tabIndex={pane.paneId === active ? 0 : -1} /></Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content className="ssh-directory-actions" align="end" sideOffset={4} collisionPadding={8} aria-label={`${pane.label} 标签操作`}>
                          {tabActions(pane, tabIds).map(({ label, run, disabled }) => (
                            <Button key={label} type="button" variant="ghost" disabled={disabled} onClick={() => { setTabMenu(undefined); run(); }}>{label}</Button>
                          ))}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </span>
                )),
              ];
            })}
          </div>
        )}
        <div ref={parent} className="ssh-workspace-grid" style={{ gridTemplateColumns: tracks(x, "column"), gridTemplateRows: tracks(y, "row") }}>
          {panes.map((pane, index) => {
            const { x: left, y: top, w, h } = rects[index]!;
            const style: CSSProperties = { gridColumn: `${edge(x, left)} / ${edge(x, left + w)}`, gridRow: `${edge(y, top)} / ${edge(y, top + h)}` };
            const visible = (!maximized && layout.kind !== "tabs") || pane.paneId === active;
            return (
              <div
                key={pane.paneId}
                id={spotId(pane)}
                className="ssh-workspace-spot"
                role={tabbed ? "tabpanel" : undefined}
                aria-labelledby={tabbed ? `${tabPrefix}-tab-${pane.paneId}` : undefined}
                data-workspace-spot={pane.paneId}
                data-active={pane.paneId === active}
                style={style}
                hidden={!visible}
                tabIndex={tabbed && visible && (pane.phase === "failed" || pane.phase === "ended" || pane.phase === "connecting" || pane.phase === "reconnect") ? 0 : -1}
                onFocusCapture={(event) => {
                  if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-pane-layout-control]")) onActive(pane.paneId);
                }}
                onDragOver={(event) => {
                  if (dragging.current && dragging.current !== pane.paneId) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  const from = dragging.current;
                  if (!from || from === pane.paneId || !event.dataTransfer.types.includes("application/x-huhu-ssh-pane")) return;
                  event.preventDefault();
                  dragging.current = undefined;
                  refocus.current = { id: from, order };
                  onActive(from);
                  onSwap(from, pane.paneId);
                }}
              >
                {panes.length > 1 && visible && !maximized && (
                  <button
                    type="button"
                    className="ssh-pane-drag"
                    draggable
                    aria-label={`拖动${pane.label}分栏`}
                    onDragStart={(event) => {
                      dragging.current = pane.paneId;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-huhu-ssh-pane", pane.paneId);
                    }}
                    onDragEnd={() => {
                      dragging.current = undefined;
                    }}
                  >
                    拖动
                  </button>
                )}
                {render(pane, visible)}
              </div>
            );
          })}
          {splitters.map((splitter) => {
            const { cell, axis, path, percent, firstIndex, firstCount } = splitter;
            const across = axis === "row";
            const boundary = across ? edge(x, cell.x + cell.w * percent / 100) : edge(y, cell.y + cell.h * percent / 100);
            const first = panes.slice(firstIndex, firstIndex + firstCount);
            return (
              <div
                key={path.join("/") || "root"}
                className="ssh-workspace-splitter"
                role="separator"
                tabIndex={0}
                aria-label={`调整 ${first[0]?.label ?? "首段"} 的分隔线`}
                aria-controls={first.map(spotId).join(" ")}
                aria-orientation={across ? "vertical" : "horizontal"}
                aria-valuemin={10}
                aria-valuemax={90}
                aria-valuenow={percent}
                aria-disabled={resizingDisabled}
                style={{
                  gridColumn: across ? `${boundary - 1} / ${boundary}` : `${edge(x, cell.x)} / ${edge(x, cell.x + cell.w)}`,
                  gridRow: across ? `${edge(y, cell.y)} / ${edge(y, cell.y + cell.h)}` : `${boundary - 1} / ${boundary}`,
                }}
                onPointerDown={(event) => beginSplit(event, splitter)}
                onPointerMove={(event) => moveSplit(event, axis)}
                onPointerUp={(event) => finishSplit(event.pointerId, true)}
                onPointerCancel={(event) => finishSplit(event.pointerId, false)}
                onLostPointerCapture={(event) => finishSplit(event.pointerId, false)}
                onKeyDown={(event) => resizeWithKey(event, splitter)}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
