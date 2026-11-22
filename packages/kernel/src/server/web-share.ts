import { statSync } from "node:fs";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { errors, HuhuError } from "@huhu/contracts";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { parse as parseCookie } from "hono/utils/cookie";
import type { EventBus } from "../context.js";
import type { Dispatcher } from "../dispatcher.js";
import { registerCapabilityHttp, type CapabilityHttpEnv } from "./capability-http.js";
import { webAssetRoutes } from "./web-assets.js";
import { WebInvitations } from "./web-invitations.js";
import { WebListener, type WebListenerConfig, type WebListenerStatus } from "./web-listener.js";
import { acceptsWebOrigin, WEB_SESSION_COOKIE, webSessionRoutes } from "./web-session-http.js";
import { attachWorkbenchStreams, type TerminalBridge } from "./ws-workbench.js";

export type WebShareStatus = WebListenerStatus | { state: "error"; config: WebListenerConfig; reason: "assets-unavailable" };
type MailAttachmentUpload = (caller: string, handle: string, body: ReadableStream<Uint8Array>, contentLength: number | undefined, signal: AbortSignal) => Promise<unknown>;

/** 当前 Vault 的共享入口。控制 listener 和桌面／CLI／MCP 凭据保持独立。 */
export class WebShareService {
  private readonly listener: WebListener;
  private invitations: WebInvitations | null = null;
  private unavailable: WebListenerConfig | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly vaultId: string,
    private readonly assetRoot: string | undefined,
    dispatcher: Dispatcher,
    events: EventBus,
    terminal: TerminalBridge,
    uploadMailAttachment?: MailAttachmentUpload,
  ) {
    const app = new Hono<CapabilityHttpEnv>();
    app.route("/", webSessionRoutes({ invitations: () => this.currentInvitations(), origins: () => this.origins() }));
    registerCapabilityHttp(app, dispatcher, (c) => {
      const session = this.currentInvitations()?.authenticate(getCookie(c, WEB_SESSION_COOKIE));
      return session ? { caller: `web:${session.id}`, signal: session.signal } : c.json({ error: "会话不可用" }, 401);
    });
    if (uploadMailAttachment) {
      app.post("/api/v1/mail/attachments/:handle", async (c) => {
        const { caller, signal: session } = c.get("principal");
        const handle = c.req.param("handle");
        const { body, signal } = c.req.raw;
        if (!session || session.aborted) return c.json({ error: "会话不可用" }, 401);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(handle)) return c.json({ error: "上传句柄无效" }, 400);
        if (!body || c.req.header("content-type") !== "application/octet-stream") return c.json({ error: "需要二进制附件内容" }, 415);
        const length = c.req.header("content-length");
        try {
          const data = await uploadMailAttachment(caller, handle, body, length === undefined ? undefined : Number(length), AbortSignal.any([signal, session]));
          if (session.aborted) return c.json({ error: "会话不可用" }, 401);
          return c.json({ ok: true, data });
        } catch (cause) {
          if (session.aborted) return c.json({ error: "会话不可用" }, 401);
          const error = cause instanceof HuhuError ? cause : new HuhuError("INTERNAL", "无法上传邮件附件。");
          const status = error.code === "NOT_FOUND" ? 404 : error.code === "VERSION_CONFLICT" ? 409 : error.code === "INVALID_INPUT" ? 400 : error.code === "INTERNAL" ? 500 : 403;
          return c.json({ ok: false, error: error.toJSON() }, status);
        }
      });
    }
    if (assetRoot) app.route("/", webAssetRoutes(assetRoot));
    this.listener = new WebListener(getRequestListener(app.fetch), undefined, (server, generation) => {
      const owner = new WebInvitations(this.vaultId, generation);
      const streams = attachWorkbenchStreams(server, {
        events,
        terminal,
        authorize: (req) => {
          if (!acceptsWebOrigin(this.origins(), (name) => req.headers[name], true)) return { status: 403 };
          const cookie = parseCookie(req.headers.cookie ?? "", WEB_SESSION_COOKIE)[WEB_SESSION_COOKIE];
          const session = owner.authenticate(cookie);
          return session ? { caller: `web:${session.id}`, signal: session.signal } : { status: 401 };
        },
      });
      this.invitations = owner;
      return () => {
        owner.close();
        this.invitations = null;
        streams.close();
      };
    });
  }

  private origins(): string[] {
    const state = this.listener.status();
    return state.state === "running" ? state.addresses.map(({ url }) => url) : [];
  }

  private currentInvitations(): WebInvitations | null {
    const state = this.listener.status();
    return state.state === "running" && this.invitations?.generation === state.generation ? this.invitations : null;
  }

  status(): WebShareStatus {
    return this.unavailable ? { state: "error", config: { ...this.unavailable }, reason: "assets-unavailable" } : this.listener.status();
  }

  start(config: WebListenerConfig): Promise<WebShareStatus> {
    const wanted = { ...config };
    return this.enqueue(async () => {
      if (!this.assetRoot || !statSync(path.join(this.assetRoot, "index.html"), { throwIfNoEntry: false })?.isFile()) {
        await this.stopListening();
        this.unavailable = wanted;
        return this.status();
      }
      this.unavailable = undefined;
      return this.listener.start(wanted);
    });
  }

  stop(): Promise<WebShareStatus> {
    return this.enqueue(async () => {
      await this.stopListening();
      return this.status();
    });
  }

  private async stopListening(): Promise<void> {
    this.unavailable = undefined;
    await this.listener.stop();
  }

  createInvitation() {
    const owner = this.currentInvitations();
    if (!owner) throw errors.invalidInput("请先启动 Web 分享");
    return this.invitation(owner.create().id);
  }

  invitation(id: string) {
    const invite = this.currentInvitations()?.link(id);
    if (!invite) throw errors.notFound("没有这份有效邀请");
    return {
      id,
      links: this.origins().map((origin) => {
        const url = new URL(origin);
        url.hash = new URLSearchParams({ invite: invite.token }).toString();
        return url.href;
      }),
    };
  }

  invitationsList(): { id: string; sessions: number }[] {
    return this.currentInvitations()?.list() ?? [];
  }

  revokeInvitation(id: string): boolean {
    return this.currentInvitations()?.revoke(id) ?? false;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => undefined);
    return next;
  }
}
