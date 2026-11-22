import { z } from "zod";
import { HostRevision, OwnedHostId } from "./auth-profile.js";

export const maxRouteEditTargets = 100;
export const EditHostRoutes = z.strictObject({
  targets: z
    .array(HostRevision)
    .min(1)
    .max(maxRouteEditTargets)
    .refine((targets) => new Set(targets.map(({ hostId }) => hostId)).size === targets.length, "批量路由目标不能重复"),
  change: z.discriminatedUnion("action", [z.strictObject({ action: z.literal("associate"), jumpHostId: OwnedHostId, ifExists: z.enum(["skip", "replace"]) }), z.strictObject({ action: z.literal("setEnabled"), enabled: z.boolean() })]),
});
export type EditHostRoutes = z.infer<typeof EditHostRoutes>;

export const HostRouteEditResult = z.strictObject({ updated: z.array(OwnedHostId), skipped: z.array(OwnedHostId) });
export type HostRouteEditResult = z.infer<typeof HostRouteEditResult>;
