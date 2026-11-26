import { useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useRef } from "react";
import type { WorkspaceRun } from "../shared/workspace.js";
import { lastWorkspace } from "./device-preferences.js";
import { readStartupPreferences, restoredRuns } from "./startup-preferences.js";

export function SshStartup() {
  const engine = useEngine();
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  const started = useRef<typeof engine>(undefined);
  const enabled = plugins.data?.some(({ id, state }) => id === "ssh" && state === "active");
  useEffect(() => {
    if (!enabled || started.current === engine) return;
    started.current = engine;
    const { hostIds, restore } = readStartupPreferences(engine.vaultId);
    async function start() {
      const pending = restore === "manual" ? [] : await engine.call<WorkspaceRun[]>("ssh.workspace.runs.list").catch(() => []);
      const restored = restoredRuns(restore, pending, lastWorkspace(engine.vaultId));
      const restoredHosts = new Set(restored.flatMap(({ panes }) => panes.map(({ hostId }) => hostId)));
      await Promise.allSettled([
        ...restored.map(({ id }) => engine.call("ssh.workspace.runs.reconnect", { id }, { write: true })),
        ...hostIds.filter((hostId) => !restoredHosts.has(hostId)).map((hostId) => engine.call("ssh.connect", { hostId, background: true }, { write: true })),
      ]);
    }
    void start();
  }, [enabled, engine]);
  return null;
}
