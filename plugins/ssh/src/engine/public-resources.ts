import { createHash } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { HostDefinition, ManagedHostView, OwnedHostId, purposes, SshRouteRevision } from "./auth-profile.js";
import type { ManagedHost } from "./host-configurations.js";
import { connectionIdentity, routeForHost, workspaceTarget } from "./workspace-target.js";

export const ResourceHostId = z.strictObject({ hostId: OwnedHostId });
const revision = ManagedHostView.shape.revision;
const routeHop = z.strictObject({
  hostId: OwnedHostId,
  revision,
  host: ManagedHostView.shape.host,
  port: ManagedHostView.shape.port,
});

export const ResourceHost = routeHop.extend({
  name: ManagedHostView.shape.name,
  authKind: ManagedHostView.shape.auth.shape.kind,
  routeRevision: SshRouteRevision,
  route: z.array(routeHop),
});
export type ResourceHost = z.infer<typeof ResourceHost>;
const RouteBinding = ResourceHostId.extend({ routeRevision: ResourceHost.shape.routeRevision });
export const RouteIntentFields = {
  intentKey: CapabilityIntentKeySchema.optional(),
  bindings: z.array(RouteBinding).min(1).max(24).optional(),
};
export const PublicHostView = z.strictObject({
  id: OwnedHostId,
  ...ManagedHostView.pick({ name: true, host: true, port: true, user: true, tags: true, revision: true }).shape,
});

type Files = HuhuApi["vault"]["files"];

export function externalSshOwner({ caller, subject, session }: CapabilityContext): string {
  if (!subject || (caller !== "cli" && caller !== "mcp" && caller !== "http") || (caller === "http" && caller === subject) || (caller === "mcp" && !session)) {
    throw errors.permissionDenied("SSH 外部资源");
  }
  return JSON.stringify([caller, subject]);
}

export function selectedSshHosts(context: CapabilityContext): ReadonlySet<string> {
  const ids = new Set(context.toolResourceIds?.("ssh.hosts"));
  if (!ids.size) throw errors.permissionDenied("SSH 主机授权");
  return ids;
}

export function assertSshHosts(context: CapabilityContext, hostIds: readonly string[]): void {
  const selected = selectedSshHosts(context);
  if (hostIds.some((id) => !selected.has(id))) throw errors.permissionDenied("SSH 主机授权");
}

export function authorizedResourceRoute(files: Files, context: CapabilityContext, hostId: string) {
  if (isWorkbenchCaller(context.caller)) return readResourceRoute(files, hostId);
  assertSshHosts(context, [hostId]);
  const route = readResourceRoute(files, hostId);
  assertSshHosts(
    context,
    route.chain.map(({ id }) => id),
  );
  return route;
}

export function readBoundRoute(files: Files, context: CapabilityContext, { hostId, routeRevision }: Pick<z.infer<typeof ResourceHost>, "hostId" | "routeRevision">): ManagedHost[] {
  const route = authorizedResourceRoute(files, context, hostId);
  if (route.view.routeRevision !== routeRevision) throw errors.versionConflict(route.view.routeRevision);
  return route.chain;
}

/** Reads only portable definitions. HostConfigurations.list checks private credential material. */
export function readPortableHost(files: Files, id: string): ManagedHost | undefined {
  return readPortableHosts(files, new Set([id]))[0];
}

export function readPortableHosts(files: Files, ids: ReadonlySet<string>): ManagedHost[] {
  if (!ids.size) return [];
  try {
    return ModuleCredentials.readPortableDefinitions(files, "ssh", HostDefinition).flatMap((row) => {
      const id = row.entityId;
      if (!ids.has(id) || !OwnedHostId.safeParse(id).success) return [];
      const { format: _format, authKind, ...profile } = row.definition;
      const required = purposes[authKind];
      const authState: ManagedHost["authState"] = Object.fromEntries(required.map((purpose) => [purpose, row.configured.includes(purpose) ? "configured" : "unconfigured"]));
      const configured = required.every((purpose) => purpose === "passphrase" || row.configured.includes(purpose));
      return [{ ...profile, id, revision: row.revision, auth: { kind: authKind, source: "ssh" }, authState, configured }];
    });
  } catch (error) {
    if (error instanceof CredentialError) throw errors.invalidInput("SSH 可移植配置无法读取");
    throw error;
  }
}

export function readResourceRoute(files: Files, hostId: string) {
  const chain = routeForHost({ get: (id) => readPortableHost(files, id) }, hostId);
  return { chain, view: resourceView(chain) };
}

type VisibleSshRoute = ResourceHost & { user: string; targetIdentity: string; connectionIdentity: string };

export function boundSshRoutes(files: Files, context: CapabilityContext, bindings: readonly z.infer<typeof RouteBinding>[]) {
  const visible = visibleSshRoutes(files, context);
  const routes = new Map<string, VisibleSshRoute>();
  for (const { hostId, routeRevision } of bindings) {
    if (routes.has(hostId)) throw errors.invalidInput("主机路由绑定不能重复");
    const route = visible.get(hostId);
    if (!route) throw errors.permissionDenied("SSH 主机授权");
    if (route.routeRevision !== routeRevision) throw errors.versionConflict(route.routeRevision);
    routes.set(hostId, route);
  }
  return routes;
}

export function visibleSshRoutes(files: Files, context: CapabilityContext): ReadonlyMap<string, VisibleSshRoute> {
  externalSshOwner(context);
  const hosts = new Map(readPortableHosts(files, selectedSshHosts(context)).map((host) => [host.id, host]));
  const routes = new Map<string, VisibleSshRoute>();
  for (const id of hosts.keys()) {
    try {
      const chain = routeForHost(hosts, id);
      const targetIdentity = workspaceTarget(chain);
      routes.set(id, { ...resourceView(chain, targetIdentity), user: chain.at(-1)!.user, targetIdentity, connectionIdentity: connectionIdentity(chain) });
    } catch (error) {
      // Deleted, ungranted or invalid hops make the whole route unavailable.
      if (!(error instanceof HuhuError) || (error.code !== "NOT_FOUND" && error.code !== "INVALID_INPUT")) throw error;
    }
  }
  return routes;
}

function resourceView(chain: readonly ManagedHost[], targetIdentity = workspaceTarget(chain)): ResourceHost {
  const resourceRoute = chain.map(({ id, revision, host, port }) => ({ hostId: id, revision, host, port }));
  const boundRevision = createHash("sha256")
    .update(JSON.stringify([targetIdentity, chain.map(({ revision, configId }) => [revision, configId])]))
    .digest("hex");
  const target = chain.at(-1)!;
  return { ...resourceRoute.at(-1)!, name: target.name, authKind: target.auth.kind, routeRevision: boundRevision, route: resourceRoute };
}
