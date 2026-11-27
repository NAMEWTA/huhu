import { CapabilityIntentKeySchema } from "@huhu/contracts";
import { z } from "zod";
import { HostRevision, OwnedHostId } from "./auth-profile.js";
import { maxRouteEditTargets } from "../shared/route.js";
import { RouteBinding } from "./public-resources.js";

export { maxRouteEditTargets };

export const EditHostRoutes = z.strictObject({
  targets: z
    .array(HostRevision)
    .min(1)
    .max(maxRouteEditTargets)
    .refine((targets) => new Set(targets.map(({ hostId }) => hostId)).size === targets.length, "批量路由目标不能重复"),
  change: z.discriminatedUnion("action", [z.strictObject({ action: z.literal("associate"), jumpHostId: OwnedHostId, ifExists: z.enum(["skip", "replace"]) }), z.strictObject({ action: z.literal("setEnabled"), enabled: z.boolean() })]),
});
export type EditHostRoutes = z.infer<typeof EditHostRoutes>;
export const EditOwnedRoutes = EditHostRoutes.extend({
  intentKey: CapabilityIntentKeySchema,
  bindings: z
    .array(RouteBinding)
    .min(1)
    .max(2 * maxRouteEditTargets),
});

export const HostRouteEditResult = z.strictObject({ updated: z.array(OwnedHostId), skipped: z.array(OwnedHostId) });
export type HostRouteEditResult = z.infer<typeof HostRouteEditResult>;
