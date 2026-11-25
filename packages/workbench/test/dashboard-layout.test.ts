import { describe, expect, it } from "vitest";
import { movePlacement, orderPlacements, placementAnnouncement, reorderPlacement, resizePlacement, samePlacement, type Placement } from "../src/home/dashboard-layout.js";

const focus: Placement = { instanceId: "focus", x: 0, y: 0, w: 3, h: 2 };
const tasks: Placement = { instanceId: "tasks", x: 3, y: 2, w: 3, h: 3 };
const activity: Placement = { instanceId: "activity", x: 0, y: 7, w: 3, h: 3 };
const original = [focus, tasks, activity];
const limits = { minSize: { w: 2, h: 2 }, maxSize: { w: 6, h: 6 } };

describe("Dashboard grid geometry", () => {
  it("keeps a moved or resized card in the requested grid cells and shifts the other card", () => {
    const moved = { ...focus, x: 3, y: 2 };
    const resized = { ...focus, w: 6, h: 6 };
    expect(movePlacement(original, moved)).toEqual([moved, { ...tasks, y: 4 }, activity]);
    expect(movePlacement(original, resized)).toEqual([resized, { ...tasks, y: 6 }, activity]);
    expect(original).toEqual([focus, tasks, activity]);
  });

  it("keeps free cells and rejects an illegal destination", () => {
    expect(movePlacement(original, focus)).toEqual(original);
    expect(movePlacement(original, { ...focus, x: 4 })).toBeUndefined();
    expect(movePlacement(original, { ...focus, y: -1 })).toBeUndefined();
    expect(samePlacement(focus, { ...focus })).toBe(true);
    expect(samePlacement(focus, { ...focus, x: 1 })).toBe(false);
  });

  it("keeps narrow reordering and size changes in the same grid coordinates", () => {
    const reordered = reorderPlacement(original, tasks.instanceId, -1)!;
    const updated = resizePlacement(reordered, { ...reordered[0]!, h: 4 }, limits, true)!;
    expect(orderPlacements(updated)).toEqual([
      { ...tasks, x: 0, y: 0, h: 4 },
      { ...focus, x: 3 },
      { ...activity, y: 4 },
    ]);
    expect(placementAnnouncement("我的任务", updated[0]!)).toBe("我的任务，第 1 列，第 1 行，3 × 4。");
  });

  it("honours widget and board size limits for keyboard resizing", () => {
    const expanded = { ...focus, w: 6, h: 4 };
    expect(resizePlacement(original, expanded, limits, false)).toEqual([expanded, { ...tasks, y: 4 }, activity]);
    expect(resizePlacement(original, { ...focus, h: 1 }, limits, true)).toBeUndefined();
    expect(resizePlacement(original, { ...tasks, w: 4 }, limits, false)).toBeUndefined();
    expect(resizePlacement(original, { ...tasks, h: 7 }, limits, false)).toBeUndefined();
  });
});
