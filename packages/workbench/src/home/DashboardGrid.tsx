import { DASHBOARD_COLUMNS, type HomeWidgetDefinition } from "@huhu/contracts";
import { calcGridItemPosition, cloneLayout, GridLayout, noCompactor, type EventCallback, type Layout, type LayoutItem } from "react-grid-layout";
import { defaultConstraints, transformStrategy, type LayoutConstraint, type PositionStrategy } from "react-grid-layout/core";
import { cloneElement, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type TouchEvent as ReactTouchEvent } from "react";
import { movePlacement, orderPlacements, samePlacement, type Placement } from "./dashboard-layout.js";

export const DASHBOARD_NARROW_WIDTH = 620;
const gridConfig = { cols: DASHBOARD_COLUMNS, maxRows: Infinity, rowHeight: 100, margin: [12, 12] as const, containerPadding: [0, 0] as const };
const flow: PositionStrategy = { type: "absolute", scale: 1, calcStyle: () => ({ position: "static" }) };

function placement({ i, x, y, w, h }: LayoutItem): Placement {
  return { instanceId: i, x, y, w, h };
}

interface Gesture {
  kind: "move" | "resize";
  id: string;
  start: Layout;
  touch?: Touch;
  proposed?: { x: number; y: number };
  movePreview?: { input: Layout; result: Layout };
  outside: boolean;
  cancelled: boolean;
}

function projectGesture(layout: Layout, active: Gesture): Layout {
  if (active.cancelled || active.outside) return cloneLayout(active.start);
  const item = layout.find(({ i }) => i === active.id);
  if (!item) return cloneLayout(active.start);
  // Use the requested grid cell and the pre-gesture draft so the pointer and keyboard use the same collision policy.
  const shifted = movePlacement(active.start.map(placement), { ...placement(item), ...active.proposed });
  if (!shifted) return cloneLayout(active.start);
  const positions = new Map(shifted.map(({ instanceId, x, y, w, h }) => [instanceId, { x, y, w, h }]));
  return layout.map((item) => ({ ...item, ...positions.get(item.i) }));
}

interface DashboardGridProps {
  width: number;
  narrow: boolean;
  editable: boolean;
  items: Placement[];
  definitionFor(id: string): HomeWidgetDefinition | undefined;
  onChange(next: Placement[] | undefined, id: string): void;
  onCancel(): void;
  children: ReactElement[];
}

export function DashboardGrid({ width, narrow, editable, items, definitionFor, onChange, onCancel, children }: DashboardGridProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<{ id: string; drop?: LayoutItem } | null>(null);
  const interactive = editable && !narrow;
  const drop = interactive ? preview?.drop : undefined;
  const encoded: Layout = useMemo(
    () =>
      items.map(({ instanceId, x, y, w, h }) => {
        const def = definitionFor(instanceId);
        const size = def ? { minW: def.minSize.w, minH: def.minSize.h, maxW: def.maxSize.w, maxH: def.maxSize.h } : { isResizable: false };
        return { i: instanceId, x, y, w, h, ...size };
      }),
    [definitionFor, items],
  );

  useLayoutEffect(() => {
    if (!interactive && gesture.current) gesture.current.cancelled = true;
    return () => {
      if (gesture.current) gesture.current.cancelled = true;
    };
  }, [interactive]);

  useLayoutEffect(() => {
    const doc = canvas.current?.ownerDocument;
    const browser = doc?.defaultView;
    if (!interactive || !doc || !browser) return;
    const onEscape = (event: KeyboardEvent) => {
      const active = gesture.current;
      if (event.key !== "Escape" || !active || active.cancelled) return;
      event.preventDefault();
      event.stopPropagation();
      active.cancelled = true;
      onCancel();
      // RGL has no cancel callback. Release the active sensor through its regular stop event.
      doc.dispatchEvent(active.touch ? new browser.TouchEvent("touchend", { changedTouches: [active.touch] }) : new browser.MouseEvent("mouseup"));
    };
    doc.addEventListener("keydown", onEscape, true);
    return () => doc.removeEventListener("keydown", onEscape, true);
  }, [interactive, onCancel]);

  const constraints = useMemo<LayoutConstraint[]>(
    () => [
      {
        name: "dashboard-drop-bounds",
        constrainPosition(item, x, y, { cols }) {
          const active = gesture.current;
          if (active?.kind === "move" && active.id === item.i) {
            active.proposed = { x, y };
            active.outside = x < 0 || y < 0 || x + item.w > cols;
          }
          return { x, y };
        },
      },
      ...defaultConstraints,
    ],
    [],
  );
  const compactor = useMemo(
    () => ({
      ...noCompactor,
      compact(layout: Layout, cols: number): Layout {
        const active = gesture.current;
        if (!active) return noCompactor.compact(layout, cols);
        const preview = active.movePreview;
        delete active.movePreview;
        return preview?.input === layout ? preview.result : projectGesture(layout, active);
      },
    }),
    [],
  );

  function begin(kind: Gesture["kind"], item: LayoutItem | null, event: Event) {
    if (!interactive || !item) return;
    const touch = (event as TouchEvent).targetTouches?.[0] ?? (event as TouchEvent).changedTouches?.[0];
    gesture.current = { kind, id: item.i, start: cloneLayout(encoded), ...(touch && { touch }), outside: false, cancelled: false };
  }

  const refreshPreview = useCallback<EventCallback>((layout) => {
    const active = gesture.current;
    if (!active) return;
    if (active.kind === "resize") {
      setPreview({ id: active.id });
      return;
    }
    // RGL builds its drag placeholder from the old cell and compacts this layout immediately after onDrag.
    const result = projectGesture(layout, active);
    active.movePreview = { input: layout, result };
    const drop = result.find(({ i }) => i === active.id);
    setPreview({ id: active.id, ...(drop && { drop }) });
  }, []);

  const finish = useCallback(
    (layout: Layout) => {
      const active = gesture.current;
      gesture.current = null;
      setPreview(null);
      if (!interactive || !active || active.cancelled) return;
      const original = active.start.map(placement);
      if (original.length !== items.length || original.some((item, index) => !samePlacement(item, items[index]!))) return;
      if (active.outside) {
        onChange(undefined, active.id);
        return;
      }
      const proposed = orderPlacements(layout.map(placement));
      if (proposed.some((item, index) => !samePlacement(item, original[index]!))) onChange(proposed, active.id);
    },
    [interactive, items, onChange],
  );

  function cancelTouch(event: ReactTouchEvent<HTMLDivElement>) {
    const doc = event.currentTarget.ownerDocument;
    const browser = doc.defaultView;
    const touches = Array.from(event.nativeEvent.changedTouches);
    if (!browser || touches.length === 0) return;
    const active = gesture.current;
    if (active) {
      if (!touches.some(({ identifier }) => identifier === active.touch?.identifier)) return;
      if (!active.cancelled) {
        active.cancelled = true;
        onCancel();
      }
    } else if (!interactive || !(event.target instanceof browser.Element) || !event.target.closest(".hu-dashboard-drag")) {
      return;
    }
    // A cancelled touch never emits touchend. Also release drags interrupted before the start threshold.
    doc.dispatchEvent(new browser.TouchEvent("touchend", { changedTouches: touches }));
  }

  return (
    <div ref={canvas} className="hu-dashboard-canvas" data-dashboard-narrow={narrow || undefined} data-dashboard-drop-preview={Boolean(drop) || undefined} onTouchCancel={cancelTouch}>
      <GridLayout
        className="hu-dashboard-grid"
        width={width}
        gridConfig={gridConfig}
        layout={encoded}
        autoSize={!narrow}
        positionStrategy={narrow ? flow : transformStrategy}
        constraints={constraints}
        compactor={compactor}
        dragConfig={{ enabled: interactive, handle: ".hu-dashboard-drag", allowMobileScroll: true }}
        resizeConfig={{ enabled: interactive, handles: ["se"] }}
        onDragStart={(_layout, _old, item, _placeholder, event) => begin("move", item, event)}
        onResizeStart={(_layout, _old, item, _placeholder, event) => begin("resize", item, event)}
        onDrag={refreshPreview}
        onResize={refreshPreview}
        onDragStop={finish}
        onResizeStop={finish}
      >
        {/* RGL keeps pixel offsets in refs. Refresh its memoized active item between snapped grid units, keeping the tile key and DOM. */}
        {preview ? children.map((child) => (child.key === preview.id ? cloneElement(child) : child)) : children}
      </GridLayout>
      {drop && <div aria-hidden className="hu-dashboard-drop-preview" style={transformStrategy.calcStyle(calcGridItemPosition({ ...gridConfig, containerWidth: width }, drop.x, drop.y, drop.w, drop.h))} />}
    </div>
  );
}
