import { useLayoutEffect, useRef } from "react";
import { GridStack, type GridItemHTMLElement, type GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import type { Placement } from "../../../packages/workbench/src/home/dashboard-layout";
import { Frame } from "./frame";
import { columns, definition, gap, rowHeight, sortLayout } from "./fixture";
import type { AdapterProps } from "./types";

function encode({ instanceId, x, y, w, h }: Placement): GridStackWidget {
  const def = definition(instanceId);
  return { id: instanceId, x, y, w, h, minW: def.minSize.w, minH: def.minSize.h, maxW: def.maxSize.w, maxH: def.maxSize.h };
}
function snapshot(grid: GridStack) {
  const widgets = grid.save(
    false,
    false,
    (node, saved) => {
      // The serialized form omits sizes equal to their minimum. Huhu's rectangle requires both.
      saved.w = node.w;
      saved.h = node.h;
    },
    columns,
  ) as GridStackWidget[];
  return widgets.map(({ id, x, y, w, h }) => ({ instanceId: id!, x: x!, y: y!, w: w!, h: h! }));
}

export function Stack(props: AdapterProps) {
  const node = useRef<HTMLDivElement>(null);
  const api = useRef<GridStack>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const { layout, editing, reorder } = props;

  useLayoutEffect(() => {
    const root = node.current!;
    const grid = GridStack.init(
      {
        column: columns,
        cellHeight: rowHeight + gap,
        margin: gap / 2,
        mode: "float",
        auto: false,
        animate: false,
        handle: ".fixture-move",
        draggable: { handle: ".fixture-move", cancel: "input, textarea, button:not(.fixture-move), select, option, [contenteditable]", scroll: false },
        resizable: { handles: "se" },
        alwaysShowResizeHandle: true,
        staticGrid: !editing,
      },
      root,
    );
    if (!grid) throw new Error("GridStack 初始化失败");
    api.current = grid;
    grid.batchUpdate();
    for (const child of root.querySelectorAll<GridItemHTMLElement>("[data-instance-id]")) {
      const item = callbacks.current.layout.find(({ instanceId }) => instanceId === child.dataset.instanceId)!;
      grid.makeWidget(child, encode(item));
    }
    grid.batchUpdate(false);
    let active: GridItemHTMLElement | undefined;
    for (const name of ["dragstart", "resizestart"] as const) {
      grid.on(name, (_event, element) => {
        active = element;
      });
    }
    for (const name of ["drag", "resize"] as const) {
      grid.on(name, (_event, element) => callbacks.current.record(name, snapshot(grid), element.dataset.instanceId));
    }
    grid.on("dragstop resizestop", () => {
      active = undefined;
      // The event runs inside GridStack's native stop handler.
      queueMicrotask(() => {
        if (api.current === grid) callbacks.current.commit(snapshot(grid));
      });
    });
    return () => {
      api.current = null;
      // A dragged widget can leave the engine's node list before its DOM gesture ends.
      // Destroying the drag can synchronously clear active through dragstop.
      const item = active;
      if (item) GridStack.getDD().draggable(item, "destroy").resizable(item, "destroy");
      grid.destroy(false);
    };
  }, [editing]);

  useLayoutEffect(() => {
    const grid = api.current;
    if (!grid || JSON.stringify(sortLayout(snapshot(grid))) === JSON.stringify(layout)) return;
    grid.load(layout.map(encode), false);
  }, [layout, editing]);

  function request(item: Placement) {
    const grid = api.current;
    const element = grid?.getGridItems().find(({ dataset }) => dataset.instanceId === item.instanceId);
    if (!grid || !element || item.x < 0 || item.y < 0 || item.x + item.w > columns) {
      props.commit(undefined);
      return;
    }
    grid.update(element, encode(item));
    props.commit(snapshot(grid));
  }

  return (
    <div data-fixture-grid className="grid-stack" ref={node}>
      {layout.map((item) => (
        <div key={item.instanceId} className="grid-stack-item fixture-tile" data-instance-id={item.instanceId}>
          <div className="grid-stack-item-content">
            <Frame item={item} editing={editing} narrow={false} request={request} reorder={reorder} />
          </div>
        </div>
      ))}
    </div>
  );
}
