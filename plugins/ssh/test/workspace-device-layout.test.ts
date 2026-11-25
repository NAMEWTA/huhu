// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import type { ConnectionHop, ConnectionStatus } from "../src/shared/trust.js";
import { paneCount, resizeSplit, splitPaneAt, workspaceTree, type SplitTree, type WorkspaceRunPane } from "../src/shared/workspace.js";
import { deviceDefaults, saveDevicePreferences, type DevicePreferences } from "../src/ui/device-preferences.js";
import { groupWorkspaceTabs } from "../src/ui/workspace-tab-groups.js";

const preferenceKey = "huhu.ssh.device-preferences.v1";
afterEach(() => localStorage.clear());

test("resize only changes the targeted nested split and clamps its ratio", () => {
  const pane = { kind: "pane" } as const;
  const branch = { kind: "split", axis: "column", firstPercent: 65, first: pane, second: pane } as const;
  const tree: SplitTree = { kind: "split", axis: "row", firstPercent: 50, first: pane, second: branch };
  const moved = resizeSplit(tree, ["second"], 96);
  expect(moved).toMatchObject({ firstPercent: 50, first: pane, second: { ...branch, firstPercent: 90 } });
  expect(tree.second).toBe(branch);
  expect(resizeSplit(moved, [], 9)).toMatchObject({ firstPercent: 10, second: { firstPercent: 90 } });
});

test("a new split retains the existing layout around the chosen pane", () => {
  const baseline = workspaceTree({ kind: "main-right" }, 3);
  const result = splitPaneAt(baseline, 1, "row");
  expect(paneCount(result)).toBe(4);
  expect(result).toMatchObject({
    axis: "row", firstPercent: 60, first: { kind: "pane" },
    second: { axis: "column", firstPercent: 50, first: { axis: "row", firstPercent: 50 }, second: { kind: "pane" } },
  });
  expect(paneCount(baseline)).toBe(3);
});

test("旧设备记录保留已有偏好，新工具栏尺寸和顺序使用默认值", () => {
  localStorage.setItem(preferenceKey, JSON.stringify({ paneTools: "bottom", tabs: "left", fontSize: 17, showPaneFiles: true }));
  const next = saveDevicePreferences({ groupVerticalTabs: true });
  expect(next).toMatchObject({
    paneTools: "bottom",
    tabs: "left",
    fontSize: 17,
    showPaneFiles: true,
    groupVerticalTabs: true,
    paneToolSize: deviceDefaults.paneToolSize,
    paneToolOrder: deviceDefaults.paneToolOrder,
    terminalLineHeight: "normal",
    terminalCursor: "block",
    terminalCursorBlink: true,
    terminalScrollback: 5000,
  });
  expect(JSON.parse(localStorage.getItem(preferenceKey)!)).toEqual(next);
});

test("移动、隐藏和恢复工具栏不会覆盖标签及文件偏好", () => {
  saveDevicePreferences({ tabs: "left", groupVerticalTabs: true, fileSort: "size" });
  const moved = saveDevicePreferences({ paneTools: "bottom", paneToolOrder: "monitor-first", paneToolSize: "large" });
  expect(moved).toMatchObject({ paneTools: "bottom", paneToolOrder: "monitor-first", paneToolSize: "large" });
  expect(saveDevicePreferences({ paneTools: "hidden" })).toMatchObject({ paneTools: "hidden", paneToolOrder: "monitor-first", paneToolSize: "large" });
  const restored = saveDevicePreferences({ paneTools: deviceDefaults.paneTools, paneToolOrder: deviceDefaults.paneToolOrder, paneToolSize: deviceDefaults.paneToolSize });
  expect(restored).toMatchObject({ paneTools: "top", paneToolOrder: "files-first", paneToolSize: "small", tabs: "left", groupVerticalTabs: true, fileSort: "size" });
});

test("无效工具栏位置、顺序或尺寸不会写入设备偏好", () => {
  saveDevicePreferences({ paneTools: "bottom", paneToolOrder: "monitor-first" });
  const before = localStorage.getItem(preferenceKey);
  for (const patch of [{ paneTools: "outside" }, { paneToolOrder: "duplicate" }, { paneToolSize: "huge" }]) {
    expect(() => saveDevicePreferences(patch as Partial<DevicePreferences>)).toThrow();
    expect(localStorage.getItem(preferenceKey)).toBe(before);
  }
});

test("终端显示选项写入设备偏好，校验失败保留上一次保存", () => {
  const display = { terminalLineHeight: "roomy", terminalCursor: "underline", terminalCursorBlink: false, terminalScrollback: 10000 } as const;
  expect(saveDevicePreferences(display)).toMatchObject(display);
  const before = localStorage.getItem(preferenceKey)!;
  expect(JSON.parse(before)).toMatchObject(display);
  const invalidPatch: unknown = { terminalScrollback: 1 };
  expect(() => saveDevicePreferences(invalidPatch as Partial<DevicePreferences>)).toThrow();
  expect(localStorage.getItem(preferenceKey)).toBe(before);
});

const pane = (name: string, phase: WorkspaceRunPane["phase"] = "ready"): WorkspaceRunPane => ({
  paneId: `pane-${name}`,
  hostId: name,
  label: name,
  phase,
  ...(phase === "ready" ? { sessionId: `shell-${name}` } : {}),
});
const hop = (id: string, host: string, user = "fixture", port = 22): ConnectionHop => ({ id, name: id, host, port, user, auth: "agent", stage: "connected", timeline: [] });
const connected = (hostId: string, route: ConnectionHop[], source?: "external"): ConnectionStatus => ({ hostId, attemptId: `attempt-${hostId}`, state: "connected", route, source });

test("纵向分组按实际目标和完整链归并别名，保留分栏和会话身份", () => {
  const panes = [pane("first"), pane("different-jump"), pane("same-target"), pane("different-user"), pane("different-port"), pane("pending", "connecting"), pane("external"), pane("unrelated")];
  const jump = hop("jump", "proxy.invalid");
  const statuses = [
    connected("first", [jump, hop("first", "Target.Invalid.")]),
    connected("different-jump", [hop("other-jump", "other.invalid"), hop("different-jump", "target.invalid")]),
    connected("same-target", [hop("alias-jump", "PROXY.INVALID."), hop("same-target", "target.invalid")]),
    connected("different-user", [jump, hop("different-user", "target.invalid", "other")]),
    connected("different-port", [jump, hop("different-port", "target.invalid", "fixture", 2222)]),
    connected("pending", [jump, hop("pending", "target.invalid")]),
    connected("external", [jump, hop("external", "target.invalid")], "external"),
    connected("unrelated", [jump, hop("stale-target", "target.invalid")]),
  ];
  const groups = groupWorkspaceTabs(panes, statuses);
  expect(groups.map((group) => group.panes.map(({ paneId }) => paneId))).toEqual([
    ["pane-first", "pane-same-target"],
    ["pane-different-jump"],
    ["pane-different-user"],
    ["pane-different-port"],
    ["pane-pending"],
    ["pane-external"],
    ["pane-unrelated"],
  ]);
  expect(groups[0]?.label).toBe("fixture@target.invalid:22");
  expect(groups[0]?.panes[0]).toBe(panes[0]);
  expect(groups[0]?.panes[1]).toBe(panes[2]);
  expect(panes.map(({ sessionId }) => sessionId)).toEqual(["shell-first", "shell-different-jump", "shell-same-target", "shell-different-user", "shell-different-port", undefined, "shell-external", "shell-unrelated"]);
});
