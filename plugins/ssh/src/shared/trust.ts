import { z } from "zod";

export const KnownHostKey = z.object({
  host: z.string().min(1),
  port: z.int().min(1).max(65535),
  keyType: z.string().min(1),
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
});
export type KnownHostKey = z.infer<typeof KnownHostKey>;

const ConnectionHost = z.object({ id: z.string(), name: z.string(), host: z.string(), port: z.number() });

export const HostKeyPrompt = z.object({
  promptId: z.string(),
  attemptId: z.string(),
  target: ConnectionHost,
  server: ConnectionHost,
  hop: z.int().nonnegative(),
  keyType: z.string(),
  fingerprint: z.string(),
  recorded: z.array(z.string()),
});
export type HostKeyPrompt = z.infer<typeof HostKeyPrompt>;

const connection = { hostId: z.string(), attemptId: z.string(), source: z.literal("external").optional() };
export const ConnectionStatus = z.discriminatedUnion("state", [
  z.object({ ...connection, state: z.enum(["connecting", "connected", "disconnected"]) }),
  z.object({ ...connection, state: z.enum(["waiting", "key-changed"]), prompt: HostKeyPrompt, workspace: z.literal(true).optional() }),
  z.object({ ...connection, state: z.literal("failed"), message: z.string(), hop: z.int().nonnegative().optional(), server: ConnectionHost.optional() }),
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;
