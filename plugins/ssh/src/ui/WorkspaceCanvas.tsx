import { Button } from "@huhu/ui";
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { ConnectionStatus } from "../shared/trust.js";
import type { SplitTree, WorkspaceLayout, WorkspaceRunPane } from "../shared/workspace.js";
import { groupWorkspaceTabs } from "./workspace-tab-groups.js";

type Cell = { x: number; y: number; w: number; h: number };
const canvas = { x: 0, y: 0, w: 1, h: 1 };
const fractions = (count: number) => Array.from({ length: count }, (_, index) => index / count);
const precision = (value: number) => Number(value.toFixed(12));

function customCells(node: SplitTree, cell: Cell): Cell[] {
  if (node.kind === "pane") return [cell];
  const fraction = node.firstPercent / 100;
  if (node.axis === "row") {
    const w = cell.w * fraction;
    return [...customCells(node.first, { ...cell, w }), ...customCells(node.second, { ...cell, x: cell.x + w, w: cell.w - w })];
  }
  const h = cell.h * fraction;
  return [...customCells(node.first, { ...cell, h }), ...customCells(node.second, { ...cell, y: cell.y + h, h: cell.h - h })];
}

function cellsFor(layout: WorkspaceLayout, count: number): Cell[] {
  if (layout.kind === "custom") return customCells(layout.tree, canvas);
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
  connections,
  onActive,
  onSwap,
  render,
}: {
  layout: WorkspaceLayout;
  panes: WorkspaceRunPane[];
  active: string | undefined;
  maximized: boolean;
  tabs: "top" | "left";
  groupVerticalTabs: boolean;
  connections: readonly ConnectionStatus[];
  onActive(id: string): void;
  onSwap(from: string, to: string): void;
  render(pane: WorkspaceRunPane, visible: boolean): ReactNode;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | undefined>(undefined);
  const refocus = useRef<{ id: string; order: string } | undefined>(undefined);
  const focusedTab = useRef<HTMLButtonElement | undefined>(undefined);
  const tabPrefix = useId();
  const order = panes.map((pane) => pane.paneId).join(",");
  const tabGroups = tabs === "left" && groupVerticalTabs ? groupWorkspaceTabs(panes, connections) : panes.map((pane) => ({ key: pane.paneId, label: undefined, panes: [pane] }));
  const tabOrder = tabGroups.flatMap((group) => group.panes.map(({ paneId }) => paneId)).join(",");
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
  const rects = maximized ? panes.map(() => canvas) : cellsFor(layout, panes.length);
  const x = boundaries(rects, "x", "w");
  const y = boundaries(rects, "y", "h");

  function navigate(direction: Direction) {
    const candidates = Array.from(parent.current?.querySelectorAll<HTMLElement>("[data-workspace-spot]") ?? []);
    const focused = candidates.find((candidate) => candidate.dataset.workspaceSpot === active);
    const next = focused && neighbor(focused, candidates, direction);
    if (!next) return;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
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
      <div className={layout.kind === "tabs" && !maximized ? "ssh-workspace-tabs" : undefined} data-tab-side={tabs}>
        {layout.kind === "tabs" && !maximized && (
          <div
            className="ssh-workspace-tabstrip"
            role="group"
            aria-label="内部标签"
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
                  <span key={group.key} id={heading} className="ssh-workspace-tab-group" data-testid="ssh-workspace-tab-group">
                    {group.label}
                  </span>
                ),
                ...group.panes.map((pane) => (
                  <button type="button" key={pane.paneId} aria-pressed={pane.paneId === active} aria-describedby={heading} data-grouped={Boolean(heading)} onClick={() => onActive(pane.paneId)}>
                    {pane.label}
                  </button>
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
                className="ssh-workspace-spot"
                data-workspace-spot={pane.paneId}
                data-active={pane.paneId === active}
                style={style}
                hidden={!visible}
                tabIndex={-1}
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
        </div>
      </div>
    </>
  );
}
