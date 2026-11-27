import { z } from "zod";
import { OutboundProxySummary } from "./outbound-proxy.js";
import { ReconnectProgress } from "./preferences.js";

export const KnownHostKey = z.object({
  host: z.string().min(1),
  port: z.int().min(1).max(65535),
  keyType: z.string().min(1),
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
});
export type KnownHostKey = z.infer<typeof KnownHostKey>;
export const KnownHostAuthority = z.strictObject({ scope: z.string().min(1), keyType: KnownHostKey.shape.keyType, fingerprint: KnownHostKey.shape.fingerprint });
export type KnownHostAuthority = z.infer<typeof KnownHostAuthority>;
export const KnownHostAuthorities = z.strictObject({ revision: z.string().min(1).nullable(), authorities: z.array(KnownHostAuthority) });
export type KnownHostAuthorities = z.infer<typeof KnownHostAuthorities>;

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

export const SshAuthenticationPrompt = z.strictObject({
  promptId: z.string(),
  attemptId: z.string(),
  target: ConnectionHost,
  server: ConnectionHost,
  hop: z.int().nonnegative(),
  name: z.string().max(2048),
  instructions: z.string().max(4096),
  recovery: z.literal("identity-file-unavailable").optional(),
  questions: z
    .array(z.strictObject({ text: z.string().max(2048), echo: z.boolean() }))
    .min(1)
    .max(32),
});
export type SshAuthenticationPrompt = z.infer<typeof SshAuthenticationPrompt>;

const HopStage = z.enum(["dialing", "proxy", "trust", "authenticating", "answering", "forwarding", "connected", "failed"]);
export const ConnectionHop = ConnectionHost.extend({
  user: z.string(),
  auth: z.enum(["password", "key", "key-library", "agent", "identity-file", "keyboard-interactive"]),
  outboundProxy: OutboundProxySummary.optional(),
  viaShell: z.literal(true).optional(),
  verifiedHost: z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("fingerprint"), fingerprint: KnownHostKey.shape.fingerprint }),
      z.strictObject({ kind: z.literal("certificate"), fingerprint: KnownHostKey.shape.fingerprint, authority: KnownHostKey.shape.fingerprint }),
    ])
    .optional(),
  stage: HopStage,
  timeline: z.array(z.strictObject({ stage: HopStage, at: z.iso.datetime() })),
});
export type ConnectionHop = z.infer<typeof ConnectionHop>;

const connection = {
  hostId: z.string(),
  attemptId: z.string(),
  source: z.literal("external").optional(),
  purpose: z.enum(["pane", "shell", "files"]).optional(),
  route: z.array(ConnectionHop).optional(),
  connectionId: z.string().optional(),
  reconnect: ReconnectProgress.optional(),
};
export const ConnectionStatus = z.discriminatedUnion("state", [
  z.object({ ...connection, state: z.enum(["connecting", "connected", "disconnected"]) }),
  z.object({ ...connection, state: z.enum(["waiting", "key-changed"]), prompt: HostKeyPrompt, workspace: z.literal(true).optional() }),
  z.object({ ...connection, state: z.literal("auth-waiting"), authPrompt: SshAuthenticationPrompt, workspace: z.literal(true).optional() }),
  z.object({ ...connection, state: z.literal("failed"), message: z.string(), hop: z.int().nonnegative().optional(), server: ConnectionHost.optional() }),
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;
