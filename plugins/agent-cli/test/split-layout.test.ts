import { expect, test } from "vitest";
import { emptyLayout, leaves, removePane, SpaceLayoutSchema, splitPane, type Pane, type PaneLeaf, type SplitDirection } from "../src/shared/workspace-layout.js";

const leaf = (id: string, sessionId: string | null = id): PaneLeaf => ({ kind: "leaf", id, sessionId });

test.each([
  ["left", "columns", ["b", "a"]],
  ["right", "columns", ["a", "b"]],
  ["up", "rows", ["b", "a"]],
  ["down", "rows", ["a", "b"]],
] as const)("向 %s 分栏只插入新叶子，关闭时恢复兄弟叶", (direction: SplitDirection, axis, order) => {
  const a = leaf("a");
  const b = leaf("b");
  const result = splitPane(a, a.id, direction, "divider", b);
  expect(result).toMatchObject({ axis, ratio: 0.5 });
  expect(leaves(result).map(({ id }) => id)).toEqual(order);
  expect(removePane(result, b.id)).toBe(a);
  expect(removePane(result, "unknown")).toBe(result);
});

test("拒绝跨 Tab 复用同一会话、重复节点及过深的持久化树", () => {
  const layout = (...panes: Pane[]) => ({ tabs: panes.map((pane, index) => ({ id: `tab-${index}`, pane })) });
  expect(SpaceLayoutSchema.safeParse(emptyLayout("space")).success).toBe(true);
  expect(SpaceLayoutSchema.safeParse(layout(leaf("a", "same"), leaf("b", "same"))).success).toBe(false);
  expect(SpaceLayoutSchema.safeParse(layout(leaf("a", null), leaf("a", null))).success).toBe(false);
  let nested: Pane = leaf("root");
  for (let index = 0; index < 17; index++) {
    nested = splitPane(nested, "root", "right", `edge-${index}`, leaf(`nested-${index}`));
  }
  expect(SpaceLayoutSchema.safeParse(layout(nested)).success).toBe(false);
});
