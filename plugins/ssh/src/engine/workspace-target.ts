import { createHash } from "node:crypto";
import type { HostRecord } from "./host-configurations.js";
import { directJumpIds } from "../shared/route.js";
export { routeForHost } from "../shared/route.js";

export function connectionIdentity(chain: readonly { id: string; revision: string }[], proxyVersion?: string): string {
  const hosts = chain.map(({ id, revision }) => [id, revision]);
  return JSON.stringify(proxyVersion === undefined ? hosts : [hosts, proxyVersion]);
}

export function workspaceTarget(route: readonly HostRecord[]): string {
  return createHash("sha256")
    .update(JSON.stringify(route.map((host) => [host.id, host.host.toLowerCase(), host.port, host.user, directJumpIds(host)])))
    .digest("hex");
}
