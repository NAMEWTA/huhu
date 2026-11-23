import type { Placement } from "../../../packages/workbench/src/home/dashboard-layout";
import { definition } from "./fixture";
import type { ReactNode } from "react";

export function EditContent({ id }: { id: string }) {
  const name = definition(id).title;
  return (
    <div className="fixture-fields">
      <label>
        输入 <input aria-label={`示例输入 ${name}`} defaultValue="示例输入" />
      </label>
      <p data-selectable={id}>这行文字可以选择。移动卡片请使用把手。</p>
    </div>
  );
}

export function BodyContent({ id }: { id: string }) {
  return (
    <section className="fixture-body">
      <h2>{definition(id).title}</h2>
      {id === "tasks" && (
        <label>
          完成示例任务 <input type="checkbox" />
        </label>
      )}
      <p>合成看板样本</p>
      <div className="fixture-detail">卡片可用宽度较大时显示详细内容。</div>
    </section>
  );
}

type FrameProps = {
  item: Placement;
  editing: boolean;
  narrow: boolean;
  request: (item: Placement) => void;
  reorder: (id: string, delta: -1 | 1) => void;
  gestureHandle?: ReactNode;
};

export function Frame({ item, editing, narrow, request, reorder, gestureHandle }: FrameProps) {
  const id = item.instanceId;
  const def = definition(id);
  const name = def.title;
  const sizes = [
    ["w", "宽度"],
    ["h", "高度"],
  ] as const;
  return (
    <>
      {editing && (
        <div className="fixture-editor">
          <div className="fixture-controls">
            {!narrow &&
              (gestureHandle ?? (
                <button type="button" className="fixture-move" aria-label={`移动 ${name}`}>
                  移
                </button>
              ))}
            {narrow
              ? ([-1, 1] as const).map((delta) => (
                  <button type="button" key={delta} aria-label={`${delta === -1 ? "前移" : "后移"} ${name}`} onClick={() => reorder(id, delta)}>
                    {delta === -1 ? "前移" : "后移"}
                  </button>
                ))
              : (
                  [
                    ["向左", -1, 0],
                    ["向右", 1, 0],
                    ["向上", 0, -1],
                    ["向下", 0, 1],
                  ] as const
                ).map(([direction, dx, dy]) => (
                  <button type="button" key={direction} aria-label={`${direction}移动 ${name}`} onClick={() => request({ ...item, x: item.x + dx, y: item.y + dy })}>
                    {direction}
                  </button>
                ))}
          </div>
          <div className="fixture-controls">
            {sizes.map(([dimension, label]) => (
              <label key={dimension}>
                {label}
                <select aria-label={`${name} ${label}`} value={item[dimension]} onChange={(event) => request({ ...item, [dimension]: Number(event.target.value) })}>
                  {Array.from({ length: def.maxSize[dimension] - def.minSize[dimension] + 1 }, (_, index) => index + def.minSize[dimension]).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <EditContent id={id} />
        </div>
      )}
      <div inert={editing}>
        <BodyContent id={id} />
      </div>
    </>
  );
}
