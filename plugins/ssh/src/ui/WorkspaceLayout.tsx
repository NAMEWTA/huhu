import { useState, type ReactNode } from "react";
import { paneCount, type SplitTree, type WorkspaceLayout as Layout } from "../shared/workspace.js";

export const LAYOUT_LABELS: Record<Layout["kind"], string> = {
  one: "1 列",
  two: "2 列",
  three: "3 列",
  "main-right": "左主右辅",
  "main-bottom": "上主下辅",
  tabs: "内部标签",
  custom: "自定义分割",
};

export function WorkspaceLayout({ layout, labels, pane, active, onActive }: { layout: Layout; labels: string[]; pane: (index: number) => ReactNode; active?: number; onActive?: (index: number) => void }) {
  const [localActive, setLocalActive] = useState(0);
  const current = Math.min(active ?? localActive, labels.length - 1);
  const activate = onActive ?? setLocalActive;
  function tree(node: SplitTree, index: number): ReactNode {
    if (node.kind === "pane") return pane(index);
    const tracks = `minmax(0, ${node.firstPercent}fr) minmax(0, ${100 - node.firstPercent}fr)`;
    return (
      <div className="ssh-workspace-grid" style={node.axis === "row" ? { gridTemplateColumns: tracks } : { gridTemplateRows: tracks }}>
        {tree(node.first, index)}
        {tree(node.second, index + paneCount(node.first))}
      </div>
    );
  }

  if (!labels.length) return null;
  if (layout.kind === "custom") return tree(layout.tree, 0);
  if (layout.kind === "tabs") {
    return (
      <div className="ssh-workspace-tabs">
        <div className="ssh-workspace-tabstrip" aria-label="内部标签">
          {labels.map((label, index) => (
            <button key={index} type="button" aria-pressed={index === current} onClick={() => activate(index)}>
              {label}
            </button>
          ))}
        </div>
        {pane(current)}
      </div>
    );
  }
  if (labels.length > 1 && (layout.kind === "main-right" || layout.kind === "main-bottom")) {
    return (
      <div className={`ssh-workspace-grid ssh-workspace-${layout.kind}`}>
        {pane(0)}
        <div className="ssh-workspace-grid ssh-workspace-secondary">{labels.slice(1).map((_, index) => pane(index + 1))}</div>
      </div>
    );
  }
  const columns = layout.kind === "three" ? 3 : layout.kind === "two" ? 2 : 1;
  return (
    <div className="ssh-workspace-grid" style={{ gridTemplateColumns: `repeat(${Math.min(columns, labels.length)}, minmax(0, 1fr))` }}>
      {labels.map((_, index) => pane(index))}
    </div>
  );
}
