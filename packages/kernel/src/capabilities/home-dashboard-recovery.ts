import { DASHBOARD_COLUMNS, DashboardBoardSchema, errors, type DashboardBoard, type DashboardRepairChange, type HomeWidgetDefinition } from "@huhu/contracts";
import { z } from "zod";

export type DashboardWidgetSizeRule = Pick<HomeWidgetDefinition, "minSize" | "defaultSize" | "maxSize">;
type Placement = DashboardBoard["layout"][number];
type Size = Pick<Placement, "w" | "h">;

const placementSchema = DashboardBoardSchema.shape.layout.element;
type Change = DashboardRepairChange;

export function placementsOverlap(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function comparePlacement(a: Placement, b: Placement): number {
  return a.y - b.y || a.x - b.x || (a.instanceId < b.instanceId ? -1 : a.instanceId === b.instanceId ? 0 : 1);
}

function firstFreePlacement(item: Placement, occupied: readonly Placement[]): Placement {
  const byRow = occupied.toSorted((a, b) => a.y - b.y);
  let best: Placement | undefined;
  for (let x = 0; x <= DASHBOARD_COLUMNS - item.w; x++) {
    let y = 0;
    for (const other of byRow) {
      if (y <= other.y - item.h) break;
      if (x >= other.x + other.w || other.x >= x + item.w) continue;
      y = Math.max(y, other.y + other.h);
    }
    if (y === 0) return { ...item, x, y };
    if (y <= Number.MAX_SAFE_INTEGER - item.h && (!best || y < best.y)) best = { ...item, x, y };
  }
  if (best) return best;
  throw errors.invalidInput("没有可用于修复看板的空位", [{ instanceId: item.instanceId }]);
}

const rawGeometrySchema = z.strictObject({ instanceId: placementSchema.shape.instanceId, x: z.unknown().optional(), y: z.unknown().optional(), w: z.unknown().optional(), h: z.unknown().optional() });
const repairSourceSchema = DashboardBoardSchema.extend({ layout: z.array(rawGeometrySchema) });

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validSize(w: number | null, h: number | null, rule?: DashboardWidgetSizeRule): Size | undefined {
  if (w === null || h === null || !Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || w > DASHBOARD_COLUMNS || h < 1) return undefined;
  if (rule && (w < rule.minSize.w || w > rule.maxSize.w || h < rule.minSize.h || h > rule.maxSize.h)) return undefined;
  return { w, h };
}

function clampPosition(value: number | null | undefined, max: number): number {
  return value == null ? 0 : Math.min(max, Math.max(0, Math.trunc(value)));
}

export function planDashboardRepair(value: unknown, widgets: ReadonlyMap<string, DashboardWidgetSizeRule>): { board: DashboardBoard; changes: Change[] } {
  const parsed = repairSourceSchema.safeParse(value);
  if (!parsed.success) throw errors.invalidInput("看板结构或实例关联键损坏", [{ reason: "invalid-structure" }]);
  const { instances, layout, ...metadata } = parsed.data;
  const ids = new Set(instances.map(({ instanceId }) => instanceId));
  const geometries = new Map<string, NonNullable<DashboardRepairChange["before"]>>();
  for (const { instanceId, x, y, w, h } of layout) {
    if (geometries.has(instanceId)) throw errors.invalidInput("看板几何关联键重复", [{ reason: "duplicate-placement", instanceId }]);
    geometries.set(instanceId, { x: finiteCoordinate(x), y: finiteCoordinate(y), w: finiteCoordinate(w), h: finiteCoordinate(h) });
  }
  if (ids.size !== instances.length) throw errors.invalidInput("看板实例关联键重复", [{ reason: "duplicate-instance" }]);

  const changes: Change[] = [];
  for (const [instanceId, before] of geometries) {
    if (!ids.has(instanceId)) changes.push({ instanceId, reasons: ["orphan"], before, after: null });
  }

  const candidates = instances.map(({ instanceId, widgetType }) => {
    const before = geometries.get(instanceId) ?? null;
    const rule = widgets.get(widgetType);
    const previousSize = before && validSize(before.w, before.h, rule);
    const size = previousSize || rule?.defaultSize;
    if (!size) throw errors.invalidInput("看板实例缺少可用的尺寸", [{ reason: "no-widget-size", instanceId }]);
    const x = clampPosition(before?.x, DASHBOARD_COLUMNS - size.w);
    const y = clampPosition(before?.y, Number.MAX_SAFE_INTEGER - size.h);
    const reasons: Change["reasons"] = [];
    if (!before) reasons.push("missing");
    else {
      if (!previousSize) reasons.push("size-reset");
      if (x !== before.x || y !== before.y) reasons.push("position-clamped");
    }
    return { before, reasons, placement: { instanceId, x, y, ...size } };
  });
  candidates.sort((a, b) => comparePlacement(a.placement, b.placement));

  // Reserve non-conflicting existing placements before relocating collisions and missing geometry.
  const occupied: Placement[] = [];
  const displaced: typeof candidates = [];
  for (const candidate of candidates) {
    if (!candidate.before) displaced.push(candidate);
    else if (occupied.some((other) => placementsOverlap(candidate.placement, other))) {
      candidate.reasons.push("collision");
      displaced.push(candidate);
    } else occupied.push(candidate.placement);
  }
  for (const candidate of displaced) {
    candidate.placement = firstFreePlacement(candidate.placement, occupied);
    occupied.push(candidate.placement);
  }
  for (const { before, reasons, placement } of candidates) {
    if (reasons.length) changes.push({ instanceId: placement.instanceId, reasons, before, after: placement });
  }
  return { board: { ...metadata, instances, layout: occupied.sort(comparePlacement) }, changes };
}
