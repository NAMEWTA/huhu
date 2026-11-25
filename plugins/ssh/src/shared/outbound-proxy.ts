import { z } from "zod";

const ProxyId = z.uuidv4();
export const OutboundProxyPolicy = z.discriminatedUnion("mode", [z.strictObject({ mode: z.literal("inherit") }), z.strictObject({ mode: z.literal("direct") }), z.strictObject({ mode: z.literal("profile"), profileId: ProxyId })]);
export type OutboundProxyPolicy = z.infer<typeof OutboundProxyPolicy>;

export const ProxyDefinition = z.strictObject({
  name: z.string().trim().min(1).max(120),
  protocol: z.enum(["socks5", "http-connect"]),
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[\w.:[\]%-]+$/u),
  port: z.int().min(1).max(65_535),
  authenticated: z.boolean(),
});
export type ProxyDefinition = z.infer<typeof ProxyDefinition>;
export const ProxyProfile = ProxyDefinition.extend({ id: ProxyId, revision: z.uuidv4(), available: z.boolean() });
export type ProxyProfile = z.infer<typeof ProxyProfile>;
export const OutboundProxySummary = z.strictObject({ source: z.enum(["inherit", "direct", "profile", "command"]), protocol: ProxyDefinition.shape.protocol.optional(), name: ProxyDefinition.shape.name.optional() });
export type OutboundProxySummary = z.infer<typeof OutboundProxySummary>;
export const SaveProxyProfile = ProxyDefinition.omit({ authenticated: true }).extend({
  id: ProxyId.optional(),
  expectedRevision: z.uuidv4().nullable(),
  authentication: z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("none") }),
    z.strictObject({ action: z.literal("keep") }),
    z.strictObject({ action: z.literal("replace"), username: z.string().min(1).max(255), password: z.string().min(1).max(1024) }),
  ]),
});
export const ProxyProfileRevision = ProxyProfile.pick({ id: true, revision: true });
export const ProxyRouting = z.strictObject({ defaultProfileId: ProxyId.nullable(), revision: z.string().nullable() });
export type ProxyRouting = z.infer<typeof ProxyRouting>;
export const SetDefaultProxy = ProxyRouting.pick({ defaultProfileId: true }).extend({ expectedRevision: ProxyRouting.shape.revision });
