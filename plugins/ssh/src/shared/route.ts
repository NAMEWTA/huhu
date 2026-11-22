import { errors } from "@huhu/contracts";

type RouteNode = { id: string; jumpHostIds: string[]; routeDisabled?: true | undefined };

export function directJumpIds(host: Pick<RouteNode, "jumpHostIds" | "routeDisabled">): readonly string[] {
  return host.routeDisabled ? [] : host.jumpHostIds;
}

export function routeForHost<T extends RouteNode>(hosts: Pick<ReadonlyMap<string, T>, "get">, hostId: string): T[] {
  const chain: T[] = [];
  const visiting = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw errors.invalidInput("SSH 跳板链不能形成循环");
    const host = hosts.get(id);
    if (!host) throw errors.notFound("SSH 主机或跳板已移除");
    visiting.add(id);
    for (const jump of directJumpIds(host)) visit(jump);
    visiting.delete(id);
    chain.push(host);
  }
  visit(hostId);
  return chain;
}
