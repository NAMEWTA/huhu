import { z } from "zod";

export const LocalEnvironment = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string(),
  kind: z.enum(["shell", "wsl"]),
});
export type LocalEnvironment = z.infer<typeof LocalEnvironment>;
export const LocalSession = z.strictObject({
  id: z.string().regex(/^ssh-local-[a-f0-9-]{36}$/),
  environment: LocalEnvironment,
  state: z.enum(["running", "ended"]),
});
export type LocalSession = z.infer<typeof LocalSession>;
export const OpenLocalShell = z.discriminatedUnion("action", [z.strictObject({ action: z.literal("launch"), environmentId: LocalEnvironment.shape.id }), z.strictObject({ action: z.literal("restart"), sessionId: LocalSession.shape.id })]);
export type OpenLocalShell = z.infer<typeof OpenLocalShell>;
