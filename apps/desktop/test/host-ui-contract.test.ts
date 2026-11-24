// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { dismissChildOnEscape, HostDateField, invokerOverlayContainer, overlayContainer } from "../../../packages/ui/src/components/host-ui.js";
import { isoToLocalInput, localInputToIso } from "../../../packages/ui/src/components/datetime.js";

afterEach(() => document.body.replaceChildren());

function showWorkbench() {
  const workbench = document.createElement("main");
  workbench.className = "ok-root";
  const dialog = document.createElement("dialog");
  dialog.open = true;
  const field = document.createElement("input");
  const editor = document.createElement("div");
  editor.tabIndex = 0;
  editor.contentEditable = "true";
  dialog.append(field);
  workbench.append(editor, dialog);
  document.body.append(workbench);
  return { workbench, dialog, field, editor };
}

test("Inbox 快速捕获从字段最近的对话框挂载命令，Esc 关闭命令并归还字段焦点", () => {
  const { workbench, dialog, field } = showWorkbench();
  const option = document.createElement("button");
  const parentEscape = vi.fn();
  dialog.addEventListener("keydown", parentEscape);
  expect(overlayContainer(workbench, field)).toBe(dialog);
  overlayContainer(workbench, field)!.append(option);
  option.focus();
  option.addEventListener("keydown", (event) => dismissChildOnEscape(event, field, () => option.remove()));
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  option.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(parentEscape).not.toHaveBeenCalled();
  expect(dialog.open).toBe(true);
  expect(document.activeElement).toBe(field);
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(parentEscape).toHaveBeenCalledTimes(1);
});

test("编辑器的普通文档使用主题工作台，内嵌编辑器使用最近的打开对话框", () => {
  const { workbench, dialog, editor } = showWorkbench();
  expect(overlayContainer(workbench, editor)).toBe(workbench);
  const nested = document.createElement("dialog");
  nested.open = true;
  dialog.append(nested);
  nested.append(editor);
  expect(overlayContainer(workbench, editor)).toBe(nested);
  editor.remove();
  expect(overlayContainer(workbench, editor)).toBeNull();
});

test("按实际触发项区分工作台和独立挂载，关闭的子对话框不会取得浮层", () => {
  const { workbench, dialog, field, editor } = showWorkbench();
  workbench.classList.add("hu-app");
  expect(invokerOverlayContainer(editor)).toBe(workbench);
  const nested = document.createElement("dialog");
  nested.append(field);
  dialog.append(nested);
  expect(invokerOverlayContainer(field)).toBe(dialog);
  nested.open = true;
  expect(invokerOverlayContainer(field)).toBe(nested);
  document.body.append(editor);
  expect(invokerOverlayContainer(editor)).toBe(document.body);
});

test("命令菜单让进行中的输入法组合保留 Escape，也允许上层处理无子菜单的事件", () => {
  const { editor } = showWorkbench();
  const close = vi.fn();
  const composing = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, isComposing: true });
  expect(dismissChildOnEscape(composing, editor, close)).toBe(false);
  expect(composing.defaultPrevented).toBe(false);
  expect(close).not.toHaveBeenCalled();
});

test("编辑器日期、Automation 排程和无日期值按三类输入落地", () => {
  expect(HostDateField.parse({ kind: "date", value: "2026-11-24" })).toEqual({ kind: "date", value: "2026-11-24" });
  expect(HostDateField.safeParse({ kind: "date", value: "2026-02-30" }).success).toBe(false);
  expect(HostDateField.safeParse({ kind: "date", value: "2026-11-24T00:00:00Z" }).success).toBe(false);
  expect(HostDateField.parse({ kind: "date", value: null })).toEqual({ kind: "date", value: null });
  expect(HostDateField.safeParse({ kind: "date", value: "" }).success).toBe(false);
  expect(HostDateField.parse({ kind: "instant", value: "2026-11-24T01:30:10Z" }).value).toBe("2026-11-24T01:30:10Z");
  const repeated = { kind: "local-date-time", zone: "America/New_York", value: { local: "2026-11-01T01:30:00", disambiguation: "later" } } as const;
  expect(HostDateField.parse(repeated)).toEqual(repeated);
  expect(HostDateField.parse({ ...repeated, value: null })).toEqual({ kind: "local-date-time", zone: repeated.zone, value: null });
  expect(HostDateField.safeParse({ ...repeated, value: { local: "2026-11-01T01:30:00Z" } }).success).toBe(false);
  expect(HostDateField.safeParse({ ...repeated, value: { local: "2026-11-01T01:30" } }).success).toBe(true);
  expect(HostDateField.safeParse({ ...repeated, zone: "fake-zone" }).success).toBe(false);
});

test("绝对时刻编辑保留非零秒，拒绝归一化后的无效日期与时间", () => {
  const instant = "2026-11-24T01:30:10Z";
  expect(isoToLocalInput(instant)).toMatch(/:10$/);
  expect(localInputToIso(isoToLocalInput(instant))).toBe(instant);
  expect(localInputToIso("2026-02-30T02:15")).toBe("");
  expect(localInputToIso("")).toBe("");
});

test("本地时钟无法唯一表示绝对时刻时必须由用户重新选择", () => {
  vi.stubEnv("TZ", "America/New_York");
  try {
    expect(localInputToIso("2026-03-08T02:30")).toBe("");
    expect(localInputToIso("2026-11-01T01:30")).toBe("");
    expect(localInputToIso("2026-11-01T02:30:10")).toBe("2026-11-01T07:30:10Z");
  } finally {
    vi.unstubAllEnvs();
  }
});
