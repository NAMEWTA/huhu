import { useSyncExternalStore } from "react";
import { z } from "zod";
import { LocalEnvironment } from "../shared/local-shell.js";

export const terminalLineHeights = { normal: 1, roomy: 1.25 } as const;
export const terminalScrollbackChoices = [1000, 5000, 10000] as const;

const schema = z.object({
  tabs: z.enum(["top", "left"]),
  paneTools: z.enum(["top", "bottom", "hidden"]),
  paneToolSize: z.enum(["small", "medium", "large"]),
  paneToolOrder: z.enum(["files-first", "monitor-first"]),
  groupVerticalTabs: z.boolean(),
  restoreWorkspace: z.boolean(),
  fontSize: z.number().int().min(9).max(28),
  font: z.enum(["theme", "jetbrains", "system"]),
  terminalLineHeight: z.enum(["normal", "roomy"]),
  terminalCursor: z.enum(["block", "bar", "underline"]),
  terminalCursorBlink: z.boolean(),
  terminalScrollback: z.literal(terminalScrollbackChoices),
  localShellEnvironment: z.union([z.literal(""), LocalEnvironment.shape.id]),
  showDotFiles: z.boolean(),
  fileSort: z.enum(["name", "modified", "size"]),
  remoteOnLeft: z.boolean(),
  showPaneFiles: z.boolean(),
  followShellDirectory: z.boolean(),
  followFileDirectory: z.boolean(),
});
export type DevicePreferences = z.infer<typeof schema>;
export const deviceDefaults: DevicePreferences = {
  tabs: "top",
  paneTools: "top",
  paneToolSize: "small",
  paneToolOrder: "files-first",
  groupVerticalTabs: false,
  restoreWorkspace: false,
  fontSize: 13,
  font: "theme",
  terminalLineHeight: "normal",
  terminalCursor: "block",
  terminalCursorBlink: true,
  terminalScrollback: 5000,
  localShellEnvironment: "",
  showDotFiles: true,
  fileSort: "name",
  remoteOnLeft: false,
  showPaneFiles: false,
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
      snapshot = next === null ? deviceDefaults : schema.parse({ ...deviceDefaults, ...schema.partial().parse(JSON.parse(next)) });
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
