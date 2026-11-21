import { createHash } from "node:crypto";
import { errors } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type HuhuApi } from "@huhu/kernel";
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
          const authState: ManagedHost["authState"] = Object.fromEntries(purposes[authKind].map((purpose) => [purpose, row.configured.includes(purpose) ? "configured" : "unconfigured"]));
          return { ...profile, id, revision: row.revision, auth: { kind: authKind, source: "ssh" }, authState, configured: false };
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
