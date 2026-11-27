import { z } from "zod";
import type { WorkspaceRun } from "../shared/workspace.js";

const startup = z.strictObject({
  hostIds: z
    .array(z.string().regex(/^host-owned-[a-f0-9]{32}$/u))
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length),
  restore: z.enum(["manual", "last", "all"]),
});
export type StartupPreferences = z.infer<typeof startup>;
export const defaultStartupPreferences: StartupPreferences = { hostIds: [], restore: "manual" };
const key = (vaultId: string) => `huhu.ssh.startup.v1.${vaultId}`;

export function readStartupPreferences(vaultId: string): StartupPreferences {
  try {
    return startup.safeParse(JSON.parse(localStorage.getItem(key(vaultId)) ?? "null")).data ?? defaultStartupPreferences;
  } catch {
    return defaultStartupPreferences;
  }
}

export function saveStartupPreferences(vaultId: string, values: StartupPreferences) {
  localStorage.setItem(key(vaultId), JSON.stringify(startup.parse(values)));
}

export function restoredRuns(policy: StartupPreferences["restore"], runs: readonly WorkspaceRun[], last: string) {
  let panes = 0;
  return runs.filter((run) => {
    if (policy === "manual" || (policy === "last" && run.id !== last) || run.source === "external" || !run.panes.every(({ phase }) => phase === "reconnect")) return false;
    if (panes + run.panes.length > 12) return false;
    panes += run.panes.length;
    return true;
  });
}
