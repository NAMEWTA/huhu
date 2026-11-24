import { useRef, useState, type PointerEvent } from "react";
import { LOGICAL_GRID_PITCH } from "virtual:huhu-homarr/constants";
import { getLayoutRowCount, getLogicalItemStyle } from "virtual:huhu-homarr/geometry";
import { placeGridItem, sortGridPlacementsForReadingOrder } from "virtual:huhu-homarr/reflow";
import type { Placement } from "../../../packages/workbench/src/home/dashboard-layout";
import { Frame } from "./frame";
import { columns, definition, sortLayout } from "./fixture";
import type { AdapterProps } from "./types";

interface Drag {
  pointerId: number;
  item: Placement;
  kind: "drag" | "resize";
  originX: number;
  originY: number;
}

function place(items: Placement[], item: Placement): Placement[] | undefined {
  if (item.x < 0 || item.y < 0 || item.x + item.w > columns) return;
  const result = placeGridItem(
    items.map((p) => ({ ...p, id: p.instanceId })),
    { ...item, id: item.instanceId },
    columns,
  );
  return sortGridPlacementsForReadingOrder(result).map(({ id, x, y, w, h }) => ({ instanceId: id, x, y, w, h }));
}

export function Homarr({ layout, width, editing, commit, record, reorder }: AdapterProps) {
  const drag = useRef<Drag>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ id: string; layout: Placement[] }>();
  const logicalWidth = LOGICAL_GRID_PITCH * columns;
  const scale = width / logicalWidth;

  function begin(event: PointerEvent<HTMLButtonElement>, item: Placement, kind: Drag["kind"]) {
    if (event.button !== 0 || drag.current || !grid.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    grid.current.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, item, kind, originX: event.clientX, originY: event.clientY };
  }
  function action(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const pitch = event.currentTarget.getBoundingClientRect().width / columns;
    const dx = Math.round((event.clientX - active.originX) / pitch);
    const dy = Math.round((event.clientY - active.originY) / pitch);
    const p = active.item;
    const def = definition(p.instanceId);
    const item =
      active.kind === "drag"
        ? { ...p, x: p.x + dx, y: p.y + dy }
        : {
            ...p,
            w: Math.max(def.minSize.w, Math.min(def.maxSize.w, columns - p.x, p.w + dx)),
            h: Math.max(def.minSize.h, Math.min(def.maxSize.h, p.h + dy)),
          };
    const next = JSON.stringify(p) === JSON.stringify(item) ? layout : place(layout, item);
    return { active, next };
  }
  function cancel() {
    drag.current = null;
    setPreview(undefined);
  }

  const shown = preview?.layout ?? layout;
  const height = getLayoutRowCount(shown) * LOGICAL_GRID_PITCH;
  return (
    <div style={{ height: height * scale }}>
      <div
        data-fixture-grid
        className="fixture-absolute"
        style={{ width: logicalWidth, height, transform: `scale(${scale})` }}
        ref={grid}
        onPointerMove={(event) => {
          const result = action(event);
          if (!result) return;
          record(result.active.kind, result.next ?? layout, result.active.item.instanceId);
          setPreview(result.next && { id: result.active.item.instanceId, layout: result.next });
        }}
        onPointerUp={(event) => {
          const result = action(event);
          if (!result) return;
          cancel();
          commit(result.next);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      >
        {sortLayout(shown).map((item) => {
          const id = item.instanceId;
          const name = definition(id).title;
          return (
            <div key={id} className="fixture-tile" data-instance-id={id} data-placement-preview={id === preview?.id || undefined} style={getLogicalItemStyle(item)}>
              <Frame
                item={item}
                editing={editing}
                narrow={false}
                request={(next) => commit(place(layout, next))}
                reorder={reorder}
                gestureHandle={
                  <button type="button" aria-label={`移动 ${name}`} className="fixture-move" onPointerDown={(event) => begin(event, item, "drag")}>
                    移
                  </button>
                }
              />
              {editing && (
                <button
                  type="button"
                  className="fixture-size"
                  aria-label={`拖动调整 ${name} 尺寸`}
                  style={{ position: "absolute", bottom: 4, right: 4 }}
                  onPointerDown={(event) => begin(event, item, "resize")}
                >
                  调
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
