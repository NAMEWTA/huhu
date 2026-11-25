import { DASHBOARD_COLUMNS, type DashboardBoard, type HomeWidgetDefinition } from "@huhu/contracts";

export type Placement = DashboardBoard["layout"][number];

export function orderPlacements(layout: readonly Placement[]): Placement[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}

function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function samePlacement(a: Placement, b: Placement): boolean {
  return a.instanceId === b.instanceId && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function placementAnnouncement(name: string, { x, y, w, h }: Placement): string {
  return `${name}，第 ${x + 1} 列，第 ${y + 1} 行，${w} × ${h}。`;
}

export function movePlacement(layout: readonly Placement[], candidate: Placement): Placement[] | undefined {
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.w > DASHBOARD_COLUMNS) return;
  const placed = [candidate];
  for (const item of orderPlacements(layout)) {
    if (item.instanceId === candidate.instanceId) continue;
    const next = { ...item };
    let colliding = placed.find((other) => overlaps(next, other));
    while (colliding) {
      next.y = colliding.y + colliding.h;
      colliding = placed.find((other) => overlaps(next, other));
    }
    if (!Number.isSafeInteger(next.y + next.h)) return;
    placed.push(next);
  }
  return orderPlacements(placed);
}

export function resizePlacement(layout: readonly Placement[], candidate: Placement, { minSize, maxSize }: Pick<HomeWidgetDefinition, "minSize" | "maxSize">, narrow: boolean): Placement[] | undefined {
  if (candidate.w < minSize.w || candidate.w > maxSize.w || candidate.h < minSize.h || candidate.h > maxSize.h) return;
  if (!narrow) return movePlacement(layout, candidate);
  return packPlacements(orderPlacements(layout).map((item) => item.instanceId === candidate.instanceId ? candidate : item));
}

export function appendPlacement(layout: readonly Placement[], item: Pick<Placement, "instanceId" | "w" | "h">): Placement {
  return { ...item, x: 0, y: layout.reduce((bottom, p) => Math.max(bottom, p.y + p.h), 0) };
}

export function reorderPlacement(layout: readonly Placement[], id: string, offset: -1 | 1): Placement[] | undefined {
  const ordered = orderPlacements(layout);
  const from = ordered.findIndex((item) => item.instanceId === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ordered.length) return;
  const [item] = ordered.splice(from, 1);
  ordered.splice(to, 0, item!);
  return packPlacements(ordered);
}

export function packPlacements(ordered: readonly Placement[]): Placement[] {
  let row = 0;
  let column = 0;
  let rowHeight = 0;
  return ordered.map((placement) => {
    if (column + placement.w > DASHBOARD_COLUMNS) {
      row += rowHeight;
      column = 0;
      rowHeight = 0;
    }
    const next = { ...placement, x: column, y: row };
    column += placement.w;
    rowHeight = Math.max(rowHeight, placement.h);
    return next;
  });
}
