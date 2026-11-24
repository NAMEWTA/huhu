import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bearerFrom, hasForwardingHeaders } from "./ingress.js";
import type { WebInvitations } from "./web-invitations.js";

export const WEB_SESSION_COOKIE = "huhu-workbench-session";

interface WebSessionHttpOptions {
  invitations(): WebInvitations | null;
  origins(): readonly string[];
}

export function acceptsWebOrigin(origins: readonly string[], header: (name: string) => string | string[] | undefined, requireOrigin: boolean): boolean {
  const host = String(header("host") ?? "").toLowerCase();
  const expected = origins.map((value) => new URL(value)).find((value) => value.host === host)?.origin;
  const origin = header("origin");
  return expected !== undefined && !hasForwardingHeaders(header) && (origin === undefined && !requireOrigin ? true : origin === expected);
}

/** Web listener 的引导入口，认证事实来自当前服务代次。 */
export function webSessionRoutes(options: WebSessionHttpOptions) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    // 同源读取可能没有 Origin，写操作必须带当前来源。
    const read = c.req.method === "GET" || c.req.method === "HEAD";
    if (!acceptsWebOrigin(options.origins(), (name) => c.req.header(name), !read)) {
      return c.json({ error: "来源不被允许" }, 403);
    }
    await next();
  });

  app.post("/api/v1/session", (c) => {
    const invitation = bearerFrom(c.req.header("authorization"));
    const session = invitation ? options.invitations()?.join(invitation) : null;
    if (!session) return c.json({ error: "邀请不可用" }, 401);
    setCookie(c, WEB_SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "Strict", path: "/", secure: c.req.header("origin")?.startsWith("https://") ?? false });
    return c.body(null, 204);
  });

  app.get("/api/v1/bootstrap", (c) => {
    const session = options.invitations()?.authenticate(getCookie(c, WEB_SESSION_COOKIE));
    if (!session) return c.json({ error: "会话不可用" }, 401);
    return c.json({ vaultId: session.vaultId, generation: session.generation, sessionId: session.id });
  });

  return app;
}
