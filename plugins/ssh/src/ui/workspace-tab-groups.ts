import type { ConnectionStatus } from "../shared/trust.js";
import type { WorkspaceRunPane } from "../shared/workspace.js";

type TabGroup = { key: string; label?: string; panes: WorkspaceRunPane[] };

function normalizedHost(host: string) {
  return host
    .trim()
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.$/u, "")
    .toLowerCase();
}

export function groupWorkspaceTabs(panes: readonly WorkspaceRunPane[], connections: readonly ConnectionStatus[]): TabGroup[] {
  const routes = new Map(connections.filter(({ state, source }) => state === "connected" && source !== "external").map(({ hostId, route }) => [hostId, route]));
  const groups = new Map<string, TabGroup>();
  for (const pane of panes) {
    const route = pane.phase === "ready" && pane.sessionId ? routes.get(pane.hostId) : undefined;
    const target = route?.at(-1);
    if (!route || target?.id !== pane.hostId) {
      groups.set(pane.paneId, { key: pane.paneId, panes: [pane] });
      continue;
    }
    const key = JSON.stringify(route.map(({ host, port, user }) => [normalizedHost(host), port, user]));
    let group = groups.get(key);
    if (!group) {
      const host = normalizedHost(target.host);
      group = { key, label: `${target.user}@${host.includes(":") ? `[${host}]` : host}:${target.port}`, panes: [] };
      groups.set(key, group);
    }
    group.panes.push(pane);
  }
  return [...groups.values()];
}
