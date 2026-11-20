import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const WORKSPACE_DOCUMENT = "huhu-agent-workspace";
export const MAX_PANES = 32;
const maxDepth = 16;

export type SplitDirection = "up" | "down" | "left" | "right";
export type PaneLeaf = { kind: "leaf"; id: string; sessionId: string | null };
export type PaneBranch = { kind: "split"; id: string; axis: "columns" | "rows"; ratio: number; first: Pane; second: Pane };
export type Pane = PaneLeaf | PaneBranch;

const leaf: z.ZodType<PaneLeaf> = z.strictObject({ kind: z.literal("leaf"), id, sessionId: id.nullable() });
const pane: z.ZodType<Pane> = z.lazy(() => z.union([leaf, z.strictObject({ kind: z.literal("split"), id, axis: z.enum(["columns", "rows"]), ratio: z.number().min(0.05).max(0.95), first: pane, second: pane })]));
const tab = z.strictObject({ id, pane });
const SpaceLayout = z.strictObject({ tabs: z.array(tab).max(64) });
export type SpaceLayout = z.infer<typeof SpaceLayout>;
export type WorkspaceView = { spaceId: string; version: number; layout: SpaceLayout; writable: boolean };

function hasBoundedTrees(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("tabs" in input) || !Array.isArray(input.tabs) || input.tabs.length > 64) return false;
  const todo = input.tabs.map((entry: { pane?: unknown }) => ({ node: entry?.pane, depth: 0 }));
  let leaves = 0;
  for (const { node, depth } of todo) {
    if (!node || typeof node !== "object" || depth > maxDepth || !("kind" in node)) return false;
    if (node.kind === "leaf") {
      if (++leaves > MAX_PANES) return false;
    } else if (node.kind === "split" && "first" in node && "second" in node) {
      todo.push({ node: node.first, depth: depth + 1 }, { node: node.second, depth: depth + 1 });
    } else return false;
  }
  return true;
}

export const SpaceLayoutSchema = z
  .unknown()
  .refine(hasBoundedTrees, "工作区标签页或分栏结构超限")
  .pipe(SpaceLayout)
  .refine(({ tabs }) => {
    const ids = new Set<string>();
    const sessions = new Set<string>();
    const unique = (key: string, entries: Set<string>) => {
      if (entries.has(key)) return false;
      entries.add(key);
      return true;
    };
    function walk(node: Pane): boolean {
      if (!unique(node.id, ids)) return false;
      if (node.kind === "split") return walk(node.first) && walk(node.second);
      return node.sessionId === null || unique(node.sessionId, sessions);
    }
    return tabs.every((item) => unique(item.id, ids) && walk(item.pane));
  }, "标签、分栏及会话绑定必须唯一");

export const WorkspaceDocumentSchema = z.strictObject({
  format: z.literal(1),
  spaces: z.record(id, SpaceLayoutSchema),
  revisions: z.record(id, z.int().nonnegative()).optional(),
});
export const WorkspaceViewSchema = z.strictObject({ spaceId: id, version: z.int().nonnegative(), layout: SpaceLayoutSchema, writable: z.boolean() });
export const WorkspaceEditSchema = z.strictObject({ spaceId: id, baseVersion: z.int().nonnegative(), layout: SpaceLayoutSchema });
export const WorkspaceTargetSchema = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("tab") }), z.strictObject({ kind: z.literal("leaf"), tab: id, leaf: id, direction: z.enum(["up", "down", "left", "right"]).optional() })]);
export type WorkspaceTarget = z.infer<typeof WorkspaceTargetSchema>;
export const WorkspaceLaunchViewSchema = z.strictObject({
  sessionId: id,
  workspace: WorkspaceViewSchema,
  placement: z.strictObject({ tab: id, leaf: id }).nullable(),
});
export type WorkspaceLaunchView = z.infer<typeof WorkspaceLaunchViewSchema>;

export function emptyLayout(space: string): SpaceLayout {
  return { tabs: [{ id: `tab-${space}`, pane: { kind: "leaf", id: `pane-${space}`, sessionId: null } }] };
}

export function leaves(pane: Pane): PaneLeaf[] {
  return pane.kind === "leaf" ? [pane] : [...leaves(pane.first), ...leaves(pane.second)];
}

export function replacePane(pane: Pane, id: string, edit: (current: Pane) => Pane): Pane {
  if (pane.id === id) return edit(pane);
  if (pane.kind === "leaf") return pane;
  const first = replacePane(pane.first, id, edit);
  const second = replacePane(pane.second, id, edit);
  return first === pane.first && second === pane.second ? pane : { ...pane, first, second };
}

export function splitPane(pane: Pane, target: string, direction: SplitDirection, dividerId: string, inserted: PaneLeaf): Pane {
  return replacePane(pane, target, (current) => {
    if (current.kind !== "leaf") return current;
    const before = direction === "up" || direction === "left";
    const axis = direction === "left" || direction === "right" ? "columns" : "rows";
    return { kind: "split", id: dividerId, axis, ratio: 0.5, first: before ? inserted : current, second: before ? current : inserted };
  });
}

export function removePane(pane: Pane, id: string): Pane | null {
  if (pane.id === id) return pane.kind === "leaf" ? null : pane;
  if (pane.kind === "leaf") return pane;
  const first = removePane(pane.first, id);
  const second = removePane(pane.second, id);
  if (first === null) return second;
  if (second === null) return first;
  return first === pane.first && second === pane.second ? pane : { ...pane, first, second };
}

export function sessionPlacement(layout: SpaceLayout, sessionId: string): { tab: string; leaf: string } | null {
  for (const { id, pane } of layout.tabs) {
    const leaf = leaves(pane).find((leaf) => leaf.sessionId === sessionId);
    if (leaf) return { tab: id, leaf: leaf.id };
  }
  return null;
}

export function placeSession(layout: SpaceLayout, target: WorkspaceTarget, sessionId: string, operationId: string): { layout: SpaceLayout; tab: string; leaf: string } | null {
  const opened: PaneLeaf = { kind: "leaf", id: `pane-${operationId}`, sessionId };
  if (target.kind === "tab") {
    const tab = `tab-${operationId}`;
    return { tab, leaf: opened.id, layout: { tabs: [...layout.tabs, { id: tab, pane: opened }] } };
  }
  const { tab, leaf, direction } = target;
  const entry = layout.tabs.find(({ id }) => id === tab);
  const existing = entry && leaves(entry.pane).find(({ id }) => id === leaf);
  if (!existing || (!direction && existing.sessionId !== null)) return null;
  return {
    tab,
    leaf: direction ? opened.id : leaf,
    layout: {
      tabs: layout.tabs.map((item) => {
        if (item.id !== tab) return item;
        const pane = direction ? splitPane(item.pane, leaf, direction, `split-${operationId}`, opened) : replacePane(item.pane, leaf, () => ({ ...existing, sessionId }));
        return { ...item, pane };
      }),
    },
  };
}
