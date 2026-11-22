import { z } from "zod";
import { HostKeyPrompt } from "./trust.js";

export const FORWARD_BIND = "127.0.0.1";
export const ForwardMode = z.enum(["local", "remote", "socks5", "http-connect"]);
export type ForwardMode = z.infer<typeof ForwardMode>;
export const ForwardPort = z.number().int().min(1).max(65535);
export const ForwardDestination = z.strictObject({
  host: z.union([z.ipv4(), z.ipv6(), z.hostname()]),
  port: ForwardPort,
});
export type ForwardDestination = z.infer<typeof ForwardDestination>;
const options = {
  name: z.string().trim().min(1).max(80),
  hostId: z.string().min(1).max(128),
  listenPort: ForwardPort.min(1024),
  resume: z.boolean(),
  relay: z.literal("ssh").optional(),
};
const identity = { id: z.uuid(), revision: z.uuid(), boundTarget: z.string().regex(/^[a-f0-9]{64}$/) };
export const ForwardRevision = z.strictObject({ id: z.uuid(), expectedRevision: z.uuid() });
export type ForwardRevision = z.infer<typeof ForwardRevision>;

function rule<Shape extends z.ZodRawShape>(extra: Shape) {
  return z.discriminatedUnion("mode", [
    z.strictObject({ ...options, ...extra, mode: z.literal("local"), target: ForwardDestination }),
    z.strictObject({ ...options, ...extra, mode: z.literal("remote"), target: ForwardDestination }),
    z.strictObject({ ...options, ...extra, mode: z.literal("socks5") }),
    z.strictObject({ ...options, ...extra, mode: z.literal("http-connect") }),
  ]);
}

export const SaveForward = rule({ previous: ForwardRevision.optional(), rebind: z.boolean().optional() });
export type SaveForward = z.infer<typeof SaveForward>;
export const ForwardRule = rule(identity);
export type ForwardRule = z.infer<typeof ForwardRule>;

export const forwardLabels: Record<ForwardMode, string> = { local: "Local", remote: "Remote", socks5: "SOCKS5", "http-connect": "HTTP CONNECT" };
const ForwardListenerView = z.discriminatedUnion("device", [
  z.strictObject({ device: z.literal("local"), host: z.literal(FORWARD_BIND), port: ForwardPort }),
  z.strictObject({ device: z.literal("remote"), requestedHost: z.literal(FORWARD_BIND), requestedPort: ForwardPort, binding: z.literal("server-policy-unknown") }),
]);
export type ForwardListenerView = z.infer<typeof ForwardListenerView>;

export const ForwardRun = z.object({
  id: z.uuid(),
  ruleId: z.uuid(),
  revision: z.uuid(),
  source: z.literal("external").optional(),
  state: z.enum(["starting", "waiting", "running", "stopping", "stop-failed", "failed", "interrupted", "stopped"]),
  listener: ForwardListenerView.optional(),
  connection: z.object({ id: z.string(), kind: z.enum(["borrowed", "dedicated"]), holders: z.number().int().nonnegative() }).optional(),
  prompt: HostKeyPrompt.optional(),
  message: z.string().optional(),
  lastError: z.string().optional(),
  active: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  uploaded: z.number().int().nonnegative(),
  downloaded: z.number().int().nonnegative(),
});
export type ForwardRun = z.infer<typeof ForwardRun>;
