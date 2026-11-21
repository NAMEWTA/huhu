import { errors, type CapabilityScope } from "@huhu/contracts";
import { z } from "zod";
import type { WebShareService } from "../server/web-share.js";
import type { CapabilityRegistry } from "./define.js";
import { registerKernelCapability } from "./system.js";

const Config = z.strictObject({ mode: z.enum(["local", "lan"]).default("lan"), port: z.int().min(0).max(65535).default(0) });
const Status = z.discriminatedUnion("state", [
  z.object({ state: z.literal("stopped") }),
  z.object({ state: z.literal("error"), config: Config, reason: z.enum(["port-in-use", "address-unavailable", "permission-denied", "browser-blocked-port", "bind-failed", "assets-unavailable"]) }),
  z.object({ state: z.literal("running"), config: Config, generation: z.string(), port: z.int(), addresses: z.array(z.object({ url: z.url(), interfaceName: z.string().nullable() })) }),
]);
const Empty = z.strictObject({});
const InvitationId = z.strictObject({ id: z.uuidv4() });
const Invitation = z.object({ id: z.uuidv4(), links: z.array(z.url()) });

export function registerWebShareCapabilities(registry: CapabilityRegistry, share: WebShareService): void {
  function register<I, O>(name: string, title: string, scope: CapabilityScope, exposable: boolean, input: z.ZodType<I>, output: z.ZodType<O>, handler: (input: I) => O | Promise<O>) {
    registerKernelCapability(registry, {
      name,
      title,
      scope,
      input,
      output,
      plugin: "kernel",
      risk: exposable ? "normal" : "high",
      exposable,
      defaultExposed: false,
      desktopOnly: true,
      handler: ({ caller }, i) => {
        if (caller !== "desktop" && !exposable) throw errors.permissionDenied(name);
        return handler(i);
      },
    });
  }

  register("web.share.status", "读取 Web 分享状态", "read", true, Empty, Status, () => share.status());
  register("web.share.start", "启动 Web 分享", "admin", false, Config, Status, (config) => share.start(config));
  register("web.share.stop", "停止 Web 分享", "admin", false, Empty, Status, () => share.stop());
  register("web.invitations.list", "读取 Web 邀请列表", "read", true, Empty, z.array(z.object({ id: z.uuidv4(), sessions: z.int().nonnegative() })), () => share.invitationsList().map(({ id, sessions }) => ({ id, sessions })));
  register("web.invitations.get", "取回 Web 邀请链接", "read", false, InvitationId, Invitation, ({ id }) => share.invitation(id));
  register("web.invitations.create", "创建 Web 邀请", "admin", false, Empty, Invitation, () => share.createInvitation());
  register("web.invitations.revoke", "撤销 Web 邀请", "admin", false, InvitationId, z.object({ revoked: z.boolean() }), ({ id }) => ({ revoked: share.revokeInvitation(id) }));
}
