import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult } from "@huhu/contracts";
import { expect, test } from "vitest";
import { WebSocket } from "ws";
import { boot } from "../src/boot.js";

function openStream(base: string, route: string, headers: Record<string, string>, bearer?: string) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + route, bearer ? [`bearer.${bearer}`] : [], { headers });
  const messages: unknown[] = [];
  ws.on("message", (frame) => messages.push(JSON.parse(String(frame))));
  const closed = new Promise<number>((resolve) => ws.once("close", resolve));
  return new Promise<{ ws: WebSocket; messages: unknown[]; closed: Promise<number> }>((resolve, reject) => {
    ws.on("error", reject);
    ws.once("unexpected-response", (_request, response) => {
      response.resume();
      reject(new Error(`WebSocket HTTP ${response.statusCode}`));
    });
    ws.once("open", () => resolve({ ws, messages, closed }));
  });
}

test("桌面启用分享后，独立浏览器会话可访问同一 Vault 并按邀请撤销", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-web-share-"));
  const webAssetsDir = path.join(fixture, "web");
  const vaultPath = path.join(fixture, "vault");
  mkdirSync(webAssetsDir);
  mkdirSync(vaultPath);
  writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>已打包工作台</title>");
  const e = await boot({ vaultPath, webAssetsDir, create: true });
  const control = `http://127.0.0.1:${e.port}`;
  const call = (base: string, capability: string, input: unknown = {}, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/v1/call`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ capability, input, requestId: "web-share-test", idempotencyKey: "web-share-test-intent", caller: "desktop" }),
    });
  const desktop = async <T = unknown>(capability: string, input: unknown = {}): Promise<CapabilityResult<T>> => {
    const response = await call(control, capability, input, { authorization: `Bearer ${e.rendererToken}` });
    expect(response.status).toBe(200);
    return (await response.json()) as CapabilityResult<T>;
  };

  try {
    expect(await desktop("web.share.status")).toEqual({ ok: true, data: { state: "stopped" } });
    expect(await (await call(control, "web.share.start", { mode: "local" }, { authorization: `Bearer ${e.cliToken}` })).json()).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    const started = await desktop<{ addresses: { url: string }[]; generation: string }>("web.share.start", { mode: "local" });
    expect(started).toMatchObject({ ok: true, data: { state: "running" } });
    if (!started.ok) throw new Error(started.error.message);
    const origin = started.data.addresses[0]!.url;
    expect(origin).not.toBe(control);
    expect(await (await fetch(`${origin}/notes/intro.md`)).text()).toContain("已打包工作台");
    expect((await fetch(`${origin}/mcp`)).status).toBe(404);
    expect((await call(origin, "vault.info", {}, { origin, authorization: `Bearer ${e.rendererToken}` })).status).toBe(401);

    const invitation = async () => {
      const result = await desktop<{ id: string; links: string[] }>("web.invitations.create");
      expect(result).toMatchObject({ ok: true, data: { id: expect.any(String), links: [expect.any(String)] } });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    };
    const a = await invitation();
    const b = await invitation();
    expect(await desktop("web.invitations.get", { id: a.id })).toMatchObject({ ok: true, data: a });
    const join = (link: string) => {
      const invite = new URLSearchParams(new URL(link).hash.slice(1)).get("invite");
      return fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${invite}` } });
    };
    const cookies: string[] = [];
    for (const link of [a.links[0]!, a.links[0]!, b.links[0]!]) {
      const response = await join(link);
      expect(response.status).toBe(204);
      cookies.push(response.headers.get("set-cookie")!.split(";")[0]!);
    }

    const user = (index: number) => ({ origin, cookie: cookies[index]! });
    const bootstrapped = await fetch(`${origin}/api/v1/bootstrap`, { headers: { cookie: cookies[0]! } });
    expect(await bootstrapped.json()).toMatchObject({ vaultId: e.vault.id, generation: started.data.generation });
    const discovered = (await (await fetch(`${origin}/api/v1/capabilities`, { headers: user(0) })).json()) as { name: string }[];
    expect(discovered.some(({ name }) => name === "tasks.create")).toBe(true);
    expect(discovered.some(({ name }) => name.startsWith("web.share.") || name.startsWith("web.invitations."))).toBe(false);
    await expect(openStream(origin, "/ws/events", { origin: "http://example.invalid", cookie: cookies[0]! })).rejects.toThrow("403");
    await expect(openStream(origin, "/ws/events", { origin }, e.rendererToken)).rejects.toThrow("401");
    const streams = await Promise.all([0, 1, 2].map((i) => openStream(origin, "/ws/events", user(i))));
    const desktopStream = await openStream(control, "/ws/events", {}, e.rendererToken);
    const terminal = await openStream(origin, "/ws/terminal/missing-session", user(0));
    expect(await terminal.closed).toBe(4404);
    expect(terminal.messages).toEqual([]);
    expect(await (await call(origin, "web.invitations.create", {}, user(0))).json()).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const create = (await (await call(origin, "tasks.create", { title: "Web 任务", body: "同一个 Vault" }, user(0))).json()) as CapabilityResult<{ id: string }>;
    expect(create).toMatchObject({ ok: true, data: { title: "Web 任务" } });
    if (!create.ok) throw new Error(create.error.message);
    expect(await desktop("tasks.read", { id: create.data.id })).toMatchObject({ ok: true, data: { title: "Web 任务" } });
    await expect.poll(() => [...streams, desktopStream].map(({ messages }) => messages.some((frame) => (frame as { type?: string }).type === "entity.changed"))).toEqual([true, true, true, true]);

    expect(await desktop("web.invitations.revoke", { id: a.id })).toMatchObject({ ok: true, data: { revoked: true } });
    await Promise.all([streams[0]!.closed, streams[1]!.closed]);
    expect(streams[2]!.ws.readyState).toBe(WebSocket.OPEN);
    expect(desktopStream.ws.readyState).toBe(WebSocket.OPEN);
    expect((await join(a.links[0]!)).status).toBe(401);
    await expect(openStream(origin, "/ws/events", user(0))).rejects.toThrow("401");
    expect((await call(origin, "vault.info", {}, user(0))).status).toBe(401);
    expect((await call(origin, "vault.info", {}, user(1))).status).toBe(401);
    expect(await (await call(origin, "vault.info", {}, user(2))).json()).toMatchObject({ ok: true, data: { id: e.vault.id } });

    expect(await desktop("web.share.stop")).toEqual({ ok: true, data: { state: "stopped" } });
    await streams[2]!.closed;
    expect(desktopStream.ws.readyState).toBe(WebSocket.OPEN);
    expect(await desktop("vault.info")).toMatchObject({ ok: true, data: { id: e.vault.id } });
    expect((await fetch(`${control}/healthz`)).status).toBe(200);
  } finally {
    await e.shutdown();
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
});
