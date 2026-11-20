import { z } from "zod";

export const SpaceBindingSchema = z.discriminatedUnion("status", [z.strictObject({ status: z.literal("bound") }), z.strictObject({ status: z.literal("needs-binding"), reason: z.enum(["external", "legacy", "missing", "unsafe"]) })]);

export const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  machineId: z.string(),
  createdAt: z.string(),
  revision: z.number(),
  binding: SpaceBindingSchema.optional(),
});

export type Space = z.infer<typeof SpaceSchema>;

export function spaceCanLaunch(space: Pick<Space, "root" | "binding"> | null | undefined): boolean {
  return !!space?.root && space.binding?.status !== "needs-binding";
}
