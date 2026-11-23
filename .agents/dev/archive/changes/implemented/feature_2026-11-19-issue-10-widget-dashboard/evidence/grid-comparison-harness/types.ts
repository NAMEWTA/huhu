import type { Placement } from "../../../packages/workbench/src/home/dashboard-layout";

export interface AdapterProps {
  width: number;
  layout: Placement[];
  editing: boolean;
  commit(next: Placement[] | undefined): void;
  record(kind: "drag" | "resize", layout: Placement[], activeId?: string): void;
  reorder(id: string, delta: -1 | 1): void;
}
