import { Button, EmptyState, IconButton, TerminalView, type TerminalControl } from "@huhu/ui";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize, Minimize, Move, Plus, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { leaves, type Pane, type PaneLeaf, type SplitDirection } from "../shared/workspace-layout.js";
import { t } from "./i18n.js";

export interface WorkspaceSession {
  id: string;
  spaceId: string;
  provider: string;
  name: string;
  state: string;
  terminalId: string | null;
  exitCode?: number | null;
  error?: string;
  waiting?: { active: boolean; kind: string | null; msg: string | null };
}

const directions = [
  { id: "left", label: "向左分栏", icon: ArrowLeft },
  { id: "right", label: "向右分栏", icon: ArrowRight },
  { id: "up", label: "向上分栏", icon: ArrowUp },
  { id: "down", label: "向下分栏", icon: ArrowDown },
] as const;

const gap = 6;
const paneDrag = "application/x-huhu-agent-pane";
const minPane = { width: 230, height: 174 };
type Size = { width: number; height: number };
type Bounds = Size & { left: number; top: number };
type Cell = { pane: PaneLeaf; bounds: Bounds };
type Divider = { id: string; vertical: boolean; bounds: Bounds; span: number; ratio: number; savedRatio: number; min: number; max: number };
type Preview = { id: string; ratio: number };
function minimum(pane: Pane): Size {
  if (pane.kind === "leaf") return minPane;
  const a = minimum(pane.first);
  const b = minimum(pane.second);
  if (pane.axis === "columns") return { width: a.width + gap + b.width, height: Math.max(a.height, b.height) };
  return { width: Math.max(a.width, b.width), height: a.height + gap + b.height };
}

function positions(pane: Pane, bounds: Bounds, cells: Cell[], dividers: Divider[], preview: Preview | null) {
  if (pane.kind === "leaf") {
    cells.push({ pane, bounds });
    return;
  }
  const a = minimum(pane.first);
  const b = minimum(pane.second);
  const { left, top, width, height } = bounds;
  const vertical = pane.axis === "columns";
  const span = (vertical ? width : height) - gap;
  const min = (vertical ? a.width : a.height) / span;
  const max = 1 - (vertical ? b.width : b.height) / span;
  const first = Math.round(clamp(preview?.id === pane.id ? preview.ratio : pane.ratio, min, max) * span);
  const edge = vertical ? { left: left + first, top, width: gap, height } : { left, top: top + first, width, height: gap };
  dividers.push({ id: pane.id, vertical, bounds: edge, span, ratio: first / span, savedRatio: pane.ratio, min, max });
  const firstBounds = vertical ? { left, top, width: first, height } : { left, top, width, height: first };
  const secondBounds = vertical ? { left: edge.left + gap, top, width: span - first, height } : { left, top: edge.top + gap, width, height: span - first };
  positions(pane.first, firstBounds, cells, dividers, preview);
  positions(pane.second, secondBounds, cells, dividers, preview);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dropDirection(event: DragEvent<HTMLElement>): SplitDirection {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  return Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : y < 0 ? "up" : "down";
}

interface CanvasProps {
  pane: Pane;
  active: string | null;
  zoom: string | null;
  retained: PaneLeaf | null;
  sessions: WorkspaceSession[];
  endpoint: { baseUrl: string; token?: string | undefined };
  editable: boolean;
  launchable: boolean;
  showReview: boolean;
  onFocus(id: string, sessionId: string | null): void;
  onRequest(event: MouseEvent<HTMLButtonElement>, id: string, direction?: SplitDirection): void;
  onMoveStart(leaf: PaneLeaf): void;
  onMoveDrop(id: string, direction: SplitDirection): void;
  onMoveCancel(): void;
  onClose(id: string): void;
  onZoom(id: string): void;
  onResize(id: string, ratio: number): void;
  onReview(id: string): void;
  onTerminalControl(leafId: string, control: TerminalControl | undefined): void;
  onInterrupt(id: string): void;
  status(session: WorkspaceSession): ReactNode;
}

export function WorkspaceCanvas({
  pane,
  active,
  zoom,
  retained,
  sessions,
  endpoint,
  editable,
  launchable,
  showReview,
  onFocus,
  onRequest,
  onMoveStart,
  onMoveDrop,
  onMoveCancel,
  onClose,
  onZoom,
  onResize,
  onReview,
  onTerminalControl,
  onInterrupt,
  status,
}: CanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<Size>(minPane);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [drop, setDrop] = useState<{ id: string; direction: SplitDirection } | null>(null);
  const drag = useRef<{ divider: Divider; start: number; pointer: number; ratio: number; commit: CanvasProps["onResize"] } | null>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setAvailable({ width: element.clientWidth, height: element.clientHeight });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    measure();
    return () => resize.disconnect();
  }, []);
  const needed = zoom ? minPane : minimum(pane);
  const size = { width: Math.max(available.width, needed.width), height: Math.max(available.height, needed.height) };
  const bounds = { left: 0, top: 0, ...size };
  const cells: Cell[] = [];
  const dividers: Divider[] = [];
  if (zoom) {
    for (const leaf of leaves(pane)) cells.push({ pane: leaf, bounds });
  } else positions(pane, bounds, cells, dividers, preview);
  const paneCount = cells.length;
  if (retained && !cells.some(({ pane }) => pane.id === retained.id)) cells.push({ pane: retained, bounds });

  function cancelDrag() {
    drag.current = null;
    setPreview(null);
  }

  function resizeRatio(divider: Divider, ratio: number): number {
    return clamp(clamp(ratio, divider.min, divider.max), 0.05, 0.95);
  }
  return (
    <div className="agent-workspace-canvas" ref={host} data-testid="agent-workspace-canvas">
      <div className="agent-workspace-surface" style={size}>
        {cells.map(({ pane: leaf, bounds }, index) => {
          const session = sessions.find(({ id }) => id === leaf.sessionId);
          const name = session?.name ?? (leaf.sessionId ? "原会话" : leaf.unbound ? "未绑定终端" : "空分栏");
          const hidden = index >= paneCount || Boolean(zoom && zoom !== leaf.id);
          const isSource = retained?.id === leaf.id;
          return (
            <section
              key={leaf.id}
              className="agent-workspace-leaf"
              style={bounds}
              aria-label={`${index + 1} · ${name}`}
              data-active={active === leaf.id}
              data-testid={index < paneCount ? "workspace-pane" : undefined}
              data-pane-id={leaf.id}
              data-session-id={leaf.sessionId ?? undefined}
              tabIndex={-1}
              hidden={hidden}
              data-drop-edge={drop?.id === leaf.id ? drop.direction : undefined}
              onFocusCapture={() => onFocus(leaf.id, leaf.sessionId)}
              onPointerDown={() => onFocus(leaf.id, leaf.sessionId)}
              onDragOver={(event) => {
                if (!retained || isSource || !editable || !event.dataTransfer.types.includes(paneDrag)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDrop({ id: leaf.id, direction: dropDirection(event) });
              }}
              onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(null);
              }}
              onDrop={(event) => {
                if (isSource || !retained || !editable || event.dataTransfer.getData(paneDrag) !== retained.id) return;
                event.preventDefault();
                setDrop(null);
                onMoveDrop(leaf.id, dropDirection(event));
              }}
            >
              <div className="agent-workspace-pane-header">
                <strong title={name}>{name}</strong>
                {session ? status(session) : null}
                <span className="hu-flex-fill" />
                {paneCount > 1 ? <IconButton icon={zoom ? Minimize : Maximize} label={zoom ? "还原分栏" : "放大分栏"} onClick={() => onZoom(leaf.id)} /> : null}
                <IconButton icon={X} label="关闭分栏" data-testid="workspace-pane-close" disabled={!editable} onClick={() => onClose(leaf.id)} />
              </div>
              <div className="agent-workspace-pane-controls">
                <IconButton
                  icon={Move}
                  label="移动分栏"
                  aria-pressed={isSource}
                  disabled={!editable}
                  draggable={editable}
                  data-testid="workspace-pane-move"
                  onClick={() => (isSource ? onMoveCancel() : onMoveStart(leaf))}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(paneDrag, leaf.id);
                    event.dataTransfer.effectAllowed = "move";
                    onMoveStart(leaf);
                  }}
                  onDragEnd={() => {
                    setDrop(null);
                    onMoveCancel();
                  }}
                />
                {directions.map(({ id, label, icon }) => (
                  <IconButton
                    key={id}
                    icon={icon}
                    label={retained ? label.replace("分栏", "移动") : label}
                    data-testid={`workspace-split-${id}`}
                    disabled={!editable || isSource || (!retained && !launchable)}
                    onClick={(e) => onRequest(e, leaf.id, id)}
                  />
                ))}
                {session?.state === "running" ? (
                  <>
                    <Button onClick={() => onInterrupt(session.id)}>{t.interrupt}</Button>
                    <Button aria-expanded={active === leaf.id && showReview} data-testid="agent-review-toggle" onClick={() => onReview(session.id)}>
                      {active === leaf.id && showReview ? t.review.close : t.review.open}
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="agent-workspace-pane-body">
                {session?.state === "running" ? (
                  <TerminalView
                    key={session.id}
                    baseUrl={endpoint.baseUrl}
                    token={endpoint.token}
                    sessionId={session.id}
                    ariaLabel={paneCount === 1 ? t.terminalLabel : `${t.terminalLabel} ${session.name}`}
                    onTerminalControl={(control) => onTerminalControl(leaf.id, control)}
                  />
                ) : leaf.sessionId ? (
                  <EmptyState title={session?.state === "exited" ? t.exitedTitle(session.exitCode ?? null) : (session?.error ?? "原会话当前不可用")} />
                ) : (
                  <Button icon={Plus} disabled={!editable || !launchable} data-testid="workspace-pane-launch" onClick={(e) => onRequest(e, leaf.id)}>
                    在此处新建
                  </Button>
                )}
              </div>
            </section>
          );
        })}
        {dividers.map((divider) => (
          <div
            key={divider.id}
            className="agent-workspace-divider"
            role="separator"
            aria-label={divider.vertical ? "左右分栏宽度" : "上下分栏高度"}
            aria-orientation={divider.vertical ? "vertical" : "horizontal"}
            aria-valuenow={Math.round(100 * divider.ratio)}
            aria-valuemin={Math.round(100 * divider.min)}
            aria-valuemax={Math.round(100 * divider.max)}
            aria-disabled={!editable}
            tabIndex={0}
            style={divider.bounds}
            data-testid="workspace-divider"
            data-saved-ratio={Math.round(100 * divider.savedRatio)}
            onPointerDown={(event) => {
              if (!editable || !event.isPrimary || event.button !== 0) return;
              const start = divider.vertical ? event.clientX : event.clientY;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { divider, start, pointer: event.pointerId, ratio: divider.ratio, commit: onResize };
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.divider.id !== divider.id || current.pointer !== event.pointerId) return;
              const position = current.divider.vertical ? event.clientX : event.clientY;
              current.ratio = resizeRatio(current.divider, current.divider.ratio + (position - current.start) / current.divider.span);
              setPreview({ id: divider.id, ratio: current.ratio });
            }}
            onPointerUp={(event) => {
              const current = drag.current;
              if (!current || current.divider.id !== divider.id || current.pointer !== event.pointerId) return;
              cancelDrag();
              if (current.ratio !== current.divider.ratio) current.commit(divider.id, current.ratio);
            }}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onKeyDown={(event) => {
              if (event.key === "Escape" && drag.current) {
                const { pointer } = drag.current;
                cancelDrag();
                if (event.currentTarget.hasPointerCapture(pointer)) event.currentTarget.releasePointerCapture(pointer);
                return;
              }
              if (!editable || drag.current) return;
              const decrease = divider.vertical ? "ArrowLeft" : "ArrowUp";
              const increase = divider.vertical ? "ArrowRight" : "ArrowDown";
              if (![decrease, increase, "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const step = event.shiftKey ? 0.1 : 0.02;
              const desired = event.key === "Home" ? divider.min : event.key === "End" ? divider.max : divider.ratio + (event.key === increase ? step : -step);
              const ratio = resizeRatio(divider, desired);
              if (ratio !== divider.ratio) onResize(divider.id, ratio);
            }}
          />
        ))}
      </div>
    </div>
  );
}
