import { useSyncExternalStore } from "react";
import { z } from "zod";
import { LocalEnvironment } from "../shared/local-shell.js";
import { AuthKind } from "../shared/host-auth.js";
import { validTerminalPattern } from "@huhu/ui";

export const terminalLineHeights = { normal: 1, roomy: 1.25 } as const;
export const terminalScrollbackChoices = [1000, 5000, 10000] as const;
export const fileColumnDefaults = { name: 200, size: 88, mtime: 160, mode: 96 };
export type FileColumn = keyof typeof fileColumnDefaults;
export const fileColumnLimits = { min: 64, max: 640 };
const fileColumn = z.enum(["name", "size", "mtime", "mode"]);
export const sshNavigation = {
  workspaces: "工作区",
  files: "独立文件会话",
  forwarding: "端口转发",
  monitoring: "监控",
  keys: "密钥",
  routes: "跳板路由",
  recordings: "会话日志",
  shortcuts: "快捷命令",
  audit: "全部连接审计",
} as const;
const navigationPage = z.enum(Object.keys(sshNavigation) as (keyof typeof sshNavigation)[]);
export const maxHighlightRules = 16;
const highlightRule = z
  .object({
    id: z.uuid(),
    pattern: z.string().max(160),
    mode: z.enum(["literal", "regex"]),
    enabled: z.boolean(),
  })
  .refine(validTerminalPattern, "高亮规则为空或正则表达式无效");

const schema = z.object({
  tabs: z.enum(["top", "left"]),
  paneTools: z.enum(["top", "bottom", "hidden"]),
  paneToolSize: z.enum(["small", "medium", "large"]),
  paneToolOrder: z.enum(["files-first", "monitor-first"]),
  paneToolsMovable: z.boolean(),
  groupVerticalTabs: z.boolean(),
  collapseVerticalGroups: z.boolean(),
  restoreWorkspace: z.boolean(),
  hiddenNavigation: z.array(navigationPage),
  fontSize: z.number().int().min(9).max(28),
  font: z.enum(["theme", "jetbrains", "system"]),
  terminalLineHeight: z.enum(["normal", "roomy"]),
  terminalCursor: z.enum(["block", "bar", "underline"]),
  terminalCursorBlink: z.boolean(),
  terminalScrollback: z.literal(terminalScrollbackChoices),
  terminalWordSeparator: z
    .string()
    .max(100)
    .regex(/^[^\p{Cc}]*$/u),
  terminalLinkActivation: z.boolean(),
  terminalCopyOnSelect: z.boolean(),
  terminalRightClickWord: z.boolean(),
  terminalScrollOnInput: z.boolean(),
  terminalHighlightRules: z.array(highlightRule).max(maxHighlightRules),
  terminalCompletion: z.boolean(),
  terminalBellNotice: z.boolean(),
  defaultAuthKind: AuthKind,
  localShellEnvironment: z.union([z.literal(""), LocalEnvironment.shape.id]),
  showDotFiles: z.boolean(),
  fileSort: z.enum(["name", "modified", "size"]),
  remoteOnLeft: z.boolean(),
  fileOpenMode: z.enum(["tab", "window"]),
  showPaneFiles: z.boolean(),
  paneFilePosition: z.enum(["below", "left", "right"]),
  filePathMode: z.enum(["input", "breadcrumbs"]),
  showFileTree: z.boolean(),
  hiddenFileColumns: z.array(z.enum(["size", "mtime", "mode"])),
  fileColumnWidths: z.partialRecord(fileColumn, z.int().min(fileColumnLimits.min).max(fileColumnLimits.max)),
  downloadDirectory: z
    .string()
    .max(4096)
    .regex(/^(?:$|\/(?!\/)[^\p{Cc}]*|[A-Za-z]:[\\/][^\p{Cc}]*)$/u),
  initialRemoteDirectory: z
    .string()
    .max(4096)
    .regex(/^(?:$|\/[^\p{Cc}]*)$/u),
  followShellDirectory: z.boolean(),
  followFileDirectory: z.boolean(),
});
export type DevicePreferences = z.infer<typeof schema>;
export const deviceDefaults: DevicePreferences = {
  tabs: "top",
  paneTools: "top",
  paneToolSize: "small",
  paneToolOrder: "files-first",
  paneToolsMovable: true,
  groupVerticalTabs: false,
  collapseVerticalGroups: false,
  restoreWorkspace: false,
  hiddenNavigation: [],
  fontSize: 13,
  font: "theme",
  terminalLineHeight: "normal",
  terminalCursor: "block",
  terminalCursorBlink: true,
  terminalScrollback: 5000,
  terminalWordSeparator: " ()[]{}',\"`",
  terminalLinkActivation: true,
  terminalCopyOnSelect: false,
  terminalRightClickWord: false,
  terminalScrollOnInput: true,
  terminalHighlightRules: [],
  terminalCompletion: false,
  terminalBellNotice: false,
  defaultAuthKind: "password",
  localShellEnvironment: "",
  showDotFiles: true,
  fileSort: "name",
  remoteOnLeft: false,
  fileOpenMode: "tab",
  showPaneFiles: false,
  paneFilePosition: "below",
  filePathMode: "input",
  showFileTree: false,
  hiddenFileColumns: [],
  fileColumnWidths: {},
  downloadDirectory: "",
  initialRemoteDirectory: "",
  followShellDirectory: true,
  followFileDirectory: false,
};

const KEY = "huhu.ssh.device-preferences.v1";
const EVENT = "huhu:ssh-device-preferences";
let raw: string | null | undefined;
let snapshot = deviceDefaults;

function read(): DevicePreferences {
  try {
    const next = window.localStorage.getItem(KEY);
    if (next !== raw) {
      raw = next;
      const stored = next === null ? {} : JSON.parse(next);
      const preferences = schema.partial().parse(stored);
      const legacy = z.string().trim().min(1).max(80).safeParse(stored.terminalHighlight);
      const migrated = legacy.success && preferences.terminalHighlightRules === undefined ? { terminalHighlightRules: [{ id: "00000000-0000-4000-8000-000000000001", pattern: legacy.data, mode: "literal" as const, enabled: true }] } : {};
      snapshot = next === null ? deviceDefaults : schema.parse({ ...deviceDefaults, ...preferences, ...migrated });
    }
  } catch {
    snapshot = deviceDefaults;
  }
  return snapshot;
}

function subscribe(changed: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) changed();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, changed);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, changed);
  };
}

export function useDevicePreferences() {
  return useSyncExternalStore(subscribe, read, () => deviceDefaults);
}

export function saveDevicePreferences(patch: Partial<DevicePreferences>) {
  const next = schema.parse({ ...read(), ...patch });
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function saveFileColumnWidth(column: FileColumn, width: number) {
  return saveDevicePreferences({ fileColumnWidths: { ...read().fileColumnWidths, [column]: width } });
}

export function lastWorkspace(vaultId: string) {
  try {
    return window.localStorage.getItem(`${KEY}.workspace.${vaultId}`) ?? "";
  } catch {
    return "";
  }
}

export function rememberWorkspace(vaultId: string, runId: string) {
  try {
    const key = `${KEY}.workspace.${vaultId}`;
    if (runId) window.localStorage.setItem(key, runId);
    else window.localStorage.removeItem(key);
  } catch {
    // The open workspace remains usable when local preferences cannot be written.
  }
}
