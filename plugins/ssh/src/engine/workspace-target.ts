import { createHash } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { HostRecord } from "./host-configurations.js";

export function workspaceTarget(route: readonly HostRecord[]): string {
  return createHash("sha256")
    .update(JSON.stringify(route.map(({ id, host, port, user, jumpHostIds }) => [id, host.toLowerCase(), port, user, jumpHostIds])))
    .digest("hex");
}

export function routeForHost<T extends Pick<HostRecord, "id" | "jumpHostIds">>(hosts: Pick<ReadonlyMap<string, T>, "get">, hostId: string): T[] {
  const chain: T[] = [];
  const visiting = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw errors.invalidInput("SSH 跳板链不能形成循环");
    const host = hosts.get(id);
    if (!host) throw errors.notFound("SSH 主机或跳板已移除");
    visiting.add(id);
    for (const jump of host.jumpHostIds) visit(jump);
    visiting.delete(id);
    chain.push(host);
  }
  visit(hostId);
  return chain;
}
