import { getRequestListener } from "@hono/node-server";
import { expect, test } from "vitest";
import { WebInvitations } from "../src/server/web-invitations.js";
import { WebListener } from "../src/server/web-listener.js";
import { WEB_SESSION_COOKIE, webSessionRoutes } from "../src/server/web-session-http.js";

test("两个邀请可建三个独立会话，仅撤回对应会话，同端口再监听也不能继续使用旧邀请", async () => {
  let origin = "";
  let owner: WebInvitations | null = null;
  const routes = webSessionRoutes({ invitations: () => owner, origins: () => (origin ? [origin] : []) });
  const web = new WebListener(getRequestListener(routes.fetch));
  const join = (token: string, requestOrigin = origin) => fetch(`${origin}/api/v1/session`, { method: "POST", headers: { connection: "close", origin: requestOrigin, authorization: `Bearer ${token}` } });
  const bootstrap = (cookie: string, extraHeaders: Record<string, string> = {}) => fetch(`${origin}/api/v1/bootstrap`, { headers: { connection: "close", cookie, ...extraHeaders } });

  try {
    const running = await web.start({ mode: "local", port: 0 });
    if (running.state !== "running") throw new Error("Web listener did not start");
    origin = `http://127.0.0.1:${running.port}`;
    owner = new WebInvitations("vault-web-a", running.generation);
    const a = owner.create();
    const b = owner.create();
    expect(owner.link(a.id)).toEqual(a);
    expect(owner.link(a.id)).toEqual(a);
    expect((await join(a.token, "http://other.example")).status).toBe(403);
    expect((await bootstrap("")).status).toBe(401);

    const cookies: string[] = [];
    for (const invitation of [a, a, b]) {
      const joined = await join(invitation.token);
      expect(joined.status).toBe(204);
      const cookie = joined.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).not.toContain(invitation.token);
      cookies.push(cookie!.split(";")[0]!);
    }
    expect(new Set(cookies).size).toBe(3);
    const sessions = cookies.map((cookie) => owner!.authenticate(cookie.slice(WEB_SESSION_COOKIE.length + 1))!);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(3);
    for (const [index, cookie] of cookies.entries()) {
      const ready = await bootstrap(cookie);
      expect(ready.status).toBe(200);
      expect(ready.headers.get("cache-control")).toBe("no-store");
      expect(await ready.json()).toEqual({ vaultId: "vault-web-a", generation: running.generation, sessionId: sessions[index]!.id });
    }
    expect((await bootstrap(cookies[2]!, { "x-forwarded-host": "other.example" })).status).toBe(403);

    expect(owner.revoke(a.id)).toBe(true);
    expect(owner.link(a.id)).toBeNull();
    expect((await join(a.token)).status).toBe(401);
    expect((await bootstrap(cookies[0]!)).status).toBe(401);
    expect((await bootstrap(cookies[1]!)).status).toBe(401);
    expect((await bootstrap(cookies[2]!)).status).toBe(200);
    expect(sessions.map((session) => session.signal.aborted)).toEqual([true, true, false]);

    owner.close();
    await web.stop();
    expect(sessions[2]?.signal.aborted).toBe(true);
    const reopened = await web.start({ mode: "local", port: running.port });
    if (reopened.state !== "running") throw new Error("Web listener did not restart");
    expect(reopened.generation).not.toBe(running.generation);
    owner = new WebInvitations("vault-web-b", reopened.generation);
    expect((await join(b.token)).status).toBe(401);
    expect((await bootstrap(cookies[2]!)).status).toBe(401);
  } finally {
    owner?.close();
    await web.stop();
  }
});
