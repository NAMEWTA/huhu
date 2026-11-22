import { z } from "zod";
import { HostKeyPrompt, SshAuthenticationPrompt } from "./trust.js";

export const MAX_WORKSPACE_PANES = 12;
export const PRESETS = ["one", "two", "three", "main-right", "main-bottom", "tabs"] as const;
export const Preset = z.enum(PRESETS);
export type SplitTree = { kind: "pane" } | { kind: "split"; axis: "row" | "column"; firstPercent: number; first: SplitTree; second: SplitTree };

const Leaf = z.strictObject({ kind: z.literal("pane") });
function treeSchema(depth: number): z.ZodType<SplitTree> {
  if (depth === 1) return Leaf;
  const child = treeSchema(depth - 1);
  return z.discriminatedUnion("kind", [Leaf, z.strictObject({ kind: z.literal("split"), axis: z.enum(["row", "column"]), firstPercent: z.number().int().min(10).max(90), first: child, second: child })]);
}

export const WorkspaceLayout = z.discriminatedUnion("kind", [z.strictObject({ kind: Preset }), z.strictObject({ kind: z.literal("custom"), tree: treeSchema(MAX_WORKSPACE_PANES) })]);
export type WorkspaceLayout = z.infer<typeof WorkspaceLayout>;

export const WorkspacePane = z.strictObject({
  hostId: z.string().min(1).max(200),
  loginCommand: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((command) => [...command].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), "登录命令必须是单行"),
});
const Pane = WorkspacePane.partial({ loginCommand: true });
export type WorkspacePane = z.infer<typeof Pane>;
export const BoundWorkspacePane = Pane.extend({ target: z.string().regex(/^[a-f0-9]{64}$/) });
export const WorkspaceName = z.string().trim().min(1).max(100);

export function paneCount(tree: SplitTree): number {
  return tree.kind === "pane" ? 1 : paneCount(tree.first) + paneCount(tree.second);
}

export function removePaneAt(tree: SplitTree, index: number): SplitTree | undefined {
  if (tree.kind === "pane") return undefined;
  const firstCount = paneCount(tree.first);
  if (index < firstCount) {
    const first = removePaneAt(tree.first, index);
    return first ? { ...tree, first } : tree.second;
  }
  const second = removePaneAt(tree.second, index - firstCount);
  return second ? { ...tree, second } : tree.first;
}

export function layoutProblem(panes: readonly WorkspacePane[], layout: WorkspaceLayout): string | undefined {
  if (panes.length < 1 || panes.length > MAX_WORKSPACE_PANES) return "请选择 1 至 12 台主机";
  if (new Set(panes.map(({ hostId }) => hostId)).size !== panes.length) return "同一台主机只能选择一次";
  if (layout.kind === "custom" && paneCount(layout.tree) !== panes.length) return "自定义布局必须为每台主机保留一个分栏";
}

export const WorkspaceDraft = z.strictObject({ panes: z.array(Pane).min(1).max(MAX_WORKSPACE_PANES), layout: WorkspaceLayout });
export const WorkspaceTemplate = WorkspaceDraft.extend({
  id: z.uuid(),
  revision: z.uuid(),
  name: WorkspaceName,
  panes: z.array(BoundWorkspacePane).min(1).max(MAX_WORKSPACE_PANES),
}).superRefine(({ panes, layout }, ctx) => {
  const problem = layoutProblem(panes, layout);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});
export type WorkspaceTemplate = z.infer<typeof WorkspaceTemplate>;
export type WorkspaceDraft = z.infer<typeof WorkspaceDraft>;

const RunPane = z.object({
  paneId: z.uuid(),
  hostId: z.string(),
  label: z.string(),
  phase: z.enum(["reconnect", "connecting", "trust", "authentication", "ready", "failed", "ended"]),
  sessionId: z.string().optional(),
  prompt: HostKeyPrompt.optional(),
  authPrompt: SshAuthenticationPrompt.optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export const WorkspaceRun = z.object({
  id: z.uuid(),
  source: z.literal("external").optional(),
  templateId: z.uuid().optional(),
  name: WorkspaceName,
  generation: z.number().int().min(1),
  layoutRevision: z.uuid().optional(),
  layout: WorkspaceLayout,
  panes: z.array(RunPane).min(1).max(MAX_WORKSPACE_PANES),
});
export type WorkspaceRun = z.infer<typeof WorkspaceRun>;
export type WorkspaceRunPane = WorkspaceRun["panes"][number];

const runChange = z.strictObject({ id: z.uuid(), expectedLayoutRevision: z.uuid() });
export const ChangeWorkspaceRun = runChange.extend({
  change: z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("layout"), layout: WorkspaceLayout, paneIds: z.array(z.uuid()).min(1).max(MAX_WORKSPACE_PANES) }),
    z.strictObject({ action: z.literal("close"), paneId: z.uuid() }),
  ]),
});
export type ChangeWorkspaceRun = z.infer<typeof ChangeWorkspaceRun>;

// Leaves correspond to panes in reading order, as in Motty workspace/spec.go.
export function splitTree(count: number): SplitTree {
  return count < 2 ? { kind: "pane" } : { kind: "split", axis: "row", firstPercent: Math.max(10, Math.round(100 / count)), first: { kind: "pane" }, second: splitTree(count - 1) };
}
