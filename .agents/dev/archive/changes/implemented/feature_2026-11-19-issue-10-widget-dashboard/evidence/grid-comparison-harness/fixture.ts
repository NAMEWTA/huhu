import { DASHBOARD_COLUMNS, defaultDashboardBoard, homeWidgetType, kernelHomeWidgets, type DashboardBoard } from "../../../packages/contracts/src/home";
import { tasksHomeWidget } from "../../../plugins/tasks/src/shared/home-widget";
import { orderPlacements, type Placement } from "../../../packages/workbench/src/home/dashboard-layout";

export const columns = DASHBOARD_COLUMNS;
export const rowHeight = 100;
export const gap = 12;
export const narrowWidth = 620;
export const candidates = ["huhu", "rgl", "gridstack", "homarr"] as const;
export type Candidate = (typeof candidates)[number];

export const cards = {
  focus: kernelHomeWidgets.focus,
  tasks: tasksHomeWidget,
  activity: kernelHomeWidgets.activity,
};
export type CardId = keyof typeof cards;
export const definition = (id: string) => cards[id as CardId];
export const definitions = new Map(Object.values(cards).map((def) => [homeWidgetType(def.owner, def.id), def]));

const startingPositions: Record<CardId, { x: number; y: number }> = {
  focus: { x: 0, y: 0 },
  tasks: { x: 3, y: 2 },
  activity: { x: 0, y: 7 },
};

export function createBoard(): DashboardBoard {
  const ids = Object.keys(cards) as CardId[];
  return {
    ...defaultDashboardBoard(),
    instances: ids.map((instanceId) => {
      const def = cards[instanceId];
      return { instanceId, widgetType: homeWidgetType(def.owner, def.id), config: def.defaultConfig, hidden: false };
    }),
    layout: ids.map((instanceId) => ({ instanceId, ...startingPositions[instanceId], ...cards[instanceId].defaultSize })),
  };
}

export function verifyLayout(layout: readonly Placement[]): string | undefined {
  const ids = new Set(layout.map((item) => item.instanceId));
  if (layout.length !== Object.keys(cards).length || ids.size !== layout.length) return "实例丢失或重复";
  for (const item of layout) {
    const def = definition(item.instanceId);
    if (!def || ![item.x, item.y, item.w, item.h].every(Number.isSafeInteger)) return "实例或坐标无效";
    if (item.x < 0 || item.y < 0 || item.x + item.w > columns) return "位置超出画布";
    if (item.w < def.minSize.w || item.h < def.minSize.h || item.w > def.maxSize.w || item.h > def.maxSize.h) return "尺寸超出约束";
    if (layout.some((other) => other !== item && item.x < other.x + other.w && other.x < item.x + item.w && item.y < other.y + other.h && other.y < item.y + item.h))
      return "卡片重叠";
  }
}

export function sortLayout(layout: readonly Placement[]): Placement[] {
  return orderPlacements(layout.map(({ instanceId, x, y, w, h }) => ({ instanceId, x, y, w, h })));
}
