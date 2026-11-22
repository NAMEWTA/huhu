import { z } from "zod";

export const DraftConnectionResult = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("authenticated") }),
  z.strictObject({ state: z.literal("reachable"), hop: z.int().nonnegative(), reason: z.enum(["host-key", "authentication-required"]) }),
  z.strictObject({ state: z.literal("failed"), hop: z.int().nonnegative().optional(), message: z.string() }),
]);
export type DraftConnectionResult = z.infer<typeof DraftConnectionResult>;
