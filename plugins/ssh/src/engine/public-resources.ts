import { createHash } from "node:crypto";
import { errors } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { HostDefinition, ManagedHostView, OwnedHostId, purposes } from "./auth-profile.js";
import type { ManagedHost } from "./host-configurations.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";

export const ResourceHostId = z.strictObject({ hostId: OwnedHostId });
const revision = ManagedHostView.shape.revision;
const routeRevision = z.string().regex(/^[0-9a-f]{64}$/);
const routeHop = z.strictObject({
  hostId: OwnedHostId,
  revision,
  host: ManagedHostView.shape.host,
  port: ManagedHostView.shape.port,
});

export const ResourceHost = routeHop.extend({
  name: ManagedHostView.shape.name,
  authKind: ManagedHostView.shape.auth.shape.kind,
  routeRevision,
  route: z.array(routeHop),
});

type Files = HuhuApi["vault"]["files"];

export function externalSshOwner({ caller, subject }: CapabilityContext): string {
  if (!subject || (caller !== "cli" && caller !== "mcp" && caller !== "http") || (caller === "http" && caller === subject)) {
    throw errors.permissionDenied("SSH 外部资源");
  }
  return JSON.stringify([caller, subject]);
}

export function readBoundRoute(files: Files, { hostId, routeRevision }: Pick<z.infer<typeof ResourceHost>, "hostId" | "routeRevision">): ManagedHost[] {
  const route = readResourceRoute(files, hostId);
  if (route.view.routeRevision !== routeRevision) throw errors.versionConflict(route.view.routeRevision);
  return route.chain;
}

/** Reads only portable definitions. HostConfigurations.list checks private credential material. */
export function readResourceRoute(files: Files, hostId: string) {
  let chain: ManagedHost[];
  try {
    chain = routeForHost(
      {
        get(id) {
          if (!OwnedHostId.safeParse(id).success) return undefined;
          const row = ModuleCredentials.readPortableDefinition(files, "ssh", HostDefinition, id);
          if (!row) return undefined;
          const { format: _format, authKind, ...profile } = row.definition;
          // Portable flags choose the required purposes. The actual credential
          // and its availability are checked only when the executor takes a lease.
          const required = purposes[authKind];
          const authState: ManagedHost["authState"] = Object.fromEntries(required.map((purpose) => [purpose, row.configured.includes(purpose) ? "configured" : "unconfigured"]));
          const configured = required.every((purpose) => purpose === "passphrase" || row.configured.includes(purpose));
          return { ...profile, id, revision: row.revision, auth: { kind: authKind, source: "ssh" }, authState, configured };
        },
      },
      hostId,
    );
  } catch (error) {
    if (error instanceof CredentialError) throw errors.invalidInput("SSH 可移植配置无法读取");
    throw error;
  }
  const resourceRoute = chain.map(({ id, revision, host, port }) => ({ hostId: id, revision, host, port }));
  const boundRevision = createHash("sha256")
    .update(JSON.stringify([workspaceTarget(chain), chain.map(({ revision, configId }) => [revision, configId])]))
    .digest("hex");
  const target = chain.at(-1)!;
  const view: z.infer<typeof ResourceHost> = { ...resourceRoute.at(-1)!, name: target.name, authKind: target.auth.kind, routeRevision: boundRevision, route: resourceRoute };
  return { chain, view };
}
