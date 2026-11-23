import { useMemo, useRef } from "react";
import { GridLayout, cloneLayout, moveElement, noCompactor, type Layout } from "react-grid-layout";
import { defaultConstraints, type LayoutConstraint } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import { movePlacement, type Placement } from "../../../packages/workbench/src/home/dashboard-layout";
import { Frame } from "./frame";
import { columns, definition, gap, rowHeight } from "./fixture";
import type { AdapterProps } from "./types";

function encode(items: readonly Placement[]): Layout {
  return items.map(({ instanceId, x, y, w, h }) => {
    const { minSize, maxSize } = definition(instanceId);
    return { i: instanceId, x, y, w, h, minW: minSize.w, minH: minSize.h, maxW: maxSize.w, maxH: maxSize.h };
  });
}
function decode(items: Layout): Placement[] {
  return items.map(({ i, x, y, w, h }) => ({ instanceId: i, x, y, w, h }));
}

export function Rgl({ layout, width, editing, commit, record, reorder }: AdapterProps) {
  const drag = useRef<{ original: Layout; outside: boolean }>(null);
  const resize = useRef<{ original: Placement[]; id: string }>(null);
  const constraints = useMemo<LayoutConstraint[]>(
    () => [
      {
        name: "observe-unclamped-drop",
        constrainPosition(item, x, y, { cols }) {
          if (drag.current) drag.current.outside = x < 0 || y < 0 || x + item.w > cols;
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
      compact(items: Layout, cols: number): Layout {
        if (drag.current?.outside) return cloneLayout(drag.current.original);
        const active = resize.current;
        if (!active) return noCompactor.compact(items, cols);
        const resized = items.find(({ i }) => i === active.id);
        if (!resized) return noCompactor.compact(items, cols);
        // Keep the native resize dimensions and resolve neighbors from the pre-gesture draft.
        const placed = movePlacement(active.original, { instanceId: resized.i, x: resized.x, y: resized.y, w: resized.w, h: resized.h });
        if (!placed) return noCompactor.compact(items, cols);
        const positions = new Map(placed.map(({ instanceId, x, y, w, h }) => [instanceId, { x, y, w, h }]));
        return items.map((item) => ({ ...item, ...positions.get(item.i) }));
      },
    }),
    [],
  );

  function request(next: Placement) {
    if (next.x < 0 || next.y < 0 || next.x + next.w > columns) {
      commit(undefined);
      return;
    }
    const items = cloneLayout(encode(layout));
    const item = items.find(({ i }) => i === next.instanceId)!;
    if (item.w !== next.w || item.h !== next.h) {
      commit(movePlacement(layout, next));
      return;
    }
    const changed = moveElement(items, item, next.x, next.y, true, false, null, columns, false);
    commit(decode(noCompactor.compact(changed, columns)));
  }

  return (
    <div data-fixture-grid>
      <GridLayout
        width={width}
        gridConfig={{ cols: columns, rowHeight, margin: [gap, gap], containerPadding: [0, 0] }}
        layout={encode(layout)}
        compactor={compactor}
        constraints={constraints}
        dragConfig={{ enabled: editing, handle: ".fixture-move", allowMobileScroll: true, enableUserSelectHack: false }}
        resizeConfig={{ enabled: editing, handles: ["se"], enableUserSelectHack: false }}
        onDragStart={() => {
          drag.current = { original: encode(layout), outside: false };
        }}
        onDrag={(next, _old, _item, placeholder) => record("drag", decode(next), placeholder?.i)}
        onResizeStart={(_next, _old, item) => {
          if (item) resize.current = { original: layout, id: item.i };
        }}
        onResize={(next, _old, _item, placeholder) => record("resize", decode(next), placeholder?.i)}
        onDragStop={(next) => {
          const outside = drag.current?.outside;
          drag.current = null;
          commit(outside ? undefined : decode(next));
        }}
        onResizeStop={(next) => {
          resize.current = null;
          commit(decode(next));
        }}
      >
        {layout.map((item) => (
          <div key={item.instanceId} className="fixture-tile" data-instance-id={item.instanceId}>
            <Frame item={item} editing={editing} narrow={false} request={request} reorder={reorder} />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
