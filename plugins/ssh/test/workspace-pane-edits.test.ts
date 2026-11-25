import { expect, test } from "vitest";
import { editWorkspacePanes } from "../src/engine/workspace-runs.js";
import { paneCount, workspaceTree, type WorkspaceLayout } from "../src/shared/workspace.js";

test("renaming retains shell identity and closing multiple tabs removes only those panes", () => {
  const panes = ["left", "keep", "right", "last"].map((label) => ({ label, paneId: label, hostId: label, sessionId: "shell-" + label }));
  const layout: WorkspaceLayout = { kind: "custom", tree: workspaceTree({ kind: "main-right" }, panes.length) };
  const renamed = editWorkspacePanes({ panes, layout }, { action: "rename", paneId: "keep", label: "renamed" });
  expect(renamed.panes[1]).toEqual({ ...panes[1], label: "renamed" });
  expect(renamed.panes[0]).toBe(panes[0]);
  const closed = editWorkspacePanes(renamed, { action: "closeMany", paneIds: ["left", "last"] });
  expect(closed.panes).toEqual([renamed.panes[1], panes[2]]);
  expect(closed.layout.kind).toBe("custom");
  if (closed.layout.kind === "custom") expect(paneCount(closed.layout.tree)).toBe(2);
  expect(() => editWorkspacePanes(renamed, { action: "closeMany", paneIds: ["left", "left"] })).toThrow(/重复/u);
  expect(() => editWorkspacePanes(renamed, { action: "closeMany", paneIds: panes.map(({ paneId }) => paneId) })).toThrow(/最后一个/u);
  expect(renamed.panes).toHaveLength(4);
});
