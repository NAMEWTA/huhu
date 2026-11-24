import { createHash } from "node:crypto";
import { once } from "node:events";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, DashboardView } from "@huhu/contracts";
import { HerdrCore } from "@huhu/herdr-client";
import { endpointRootBinding } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { boot } from "../src/boot.js";

function openStream(base: string, route: string, headers: Record<string, string>, bearer?: string) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + route, bearer ? [`bearer.${bearer}`] : [], { headers });
  const messages: unknown[] = [];
  const output: Buffer[] = [];
  ws.on("message", (frame, binary) => {
    if (binary) output.push(Array.isArray(frame) ? Buffer.concat(frame) : Buffer.from(frame as Buffer));
    else messages.push(JSON.parse(String(frame)));
  });
  const closed = new Promise<number>((resolve) => ws.once("close", resolve));
  return new Promise<{ ws: WebSocket; messages: unknown[]; output: Buffer[]; closed: Promise<number> }>((resolve, reject) => {
    ws.on("error", reject);
    ws.once("unexpected-response", (_request, response) => {
      response.resume();
      reject(new Error(`WebSocket HTTP ${response.statusCode}`));
    });
    ws.once("open", () => resolve({ ws, messages, output, closed }));
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
  const call = (base: string, capability: string, input: unknown = {}, headers: Record<string, string> = {}, idempotencyKey = "web-share-test-intent") =>
    fetch(`${base}/api/v1/call`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ capability, input, requestId: "web-share-test", idempotencyKey, caller: "desktop" }),
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
    const bootstrap = async (index: number) => {
      const response = await fetch(`${origin}/api/v1/bootstrap`, { headers: user(index) });
      expect(response.status).toBe(200);
      return (await response.json()) as { sessionId: string };
    };
    const bootstrapped = await bootstrap(0);
    expect(bootstrapped).toMatchObject({ vaultId: e.vault.id, generation: started.data.generation, sessionId: expect.any(String) });
    expect(await bootstrap(0)).toEqual(bootstrapped);
    expect((await bootstrap(1)).sessionId).not.toBe(bootstrapped.sessionId);
    expect(cookies[0]).not.toContain(bootstrapped.sessionId);
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

    const readBoard = async (index: number) => (await (await call(origin, "home.dashboard.get", {}, user(index))).json()) as CapabilityResult<DashboardView>;
    const startingBoard = await readBoard(0);
    if (!startingBoard.ok) throw new Error(startingBoard.error.message);
    expect(await readBoard(1)).toEqual(startingBoard);
    const { revision, layout, instances } = startingBoard.data.board;
    const input = { baseRevision: revision, instances, layout: layout.map((placement) => (placement.instanceId === "default-focus" ? { ...placement, x: 2 } : placement)) };
    const saved = await (await call(origin, "home.dashboard.update", input, user(0), "dashboard-save")).json();
    expect(saved).toMatchObject({ ok: true, data: { source: "stored", board: { layout: input.layout } } });
    expect(await (await call(origin, "home.dashboard.update", { ...input, layout }, user(1), "stale-dashboard-save")).json()).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await readBoard(2)).toEqual(saved);
    expect(await desktop("home.dashboard.get")).toEqual(saved);
    await expect.poll(() => [...streams, desktopStream].map(({ messages }) => messages.some((frame) => (frame as { payload?: { kind?: string } }).payload?.kind === "home-dashboard"))).toEqual([true, true, true, true]);

    expect(await desktop("web.invitations.revoke", { id: a.id })).toMatchObject({ ok: true, data: { revoked: true } });
    await Promise.all([streams[0]!.closed, streams[1]!.closed]);
    expect(streams[2]!.ws.readyState).toBe(WebSocket.OPEN);
    expect(desktopStream.ws.readyState).toBe(WebSocket.OPEN);
    expect((await join(a.links[0]!)).status).toBe(401);
    await expect(openStream(origin, "/ws/events", user(0))).rejects.toThrow("401");
    expect((await call(origin, "vault.info", {}, user(0))).status).toBe(401);
    expect((await call(origin, "vault.info", {}, user(1))).status).toBe(401);
    expect(await (await call(origin, "vault.info", {}, user(2))).json()).toMatchObject({ ok: true, data: { id: e.vault.id } });
    expect(await readBoard(2)).toEqual(saved);

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

const herdrBin = path.resolve(import.meta.dirname, "../../desktop/resources/herdr", process.platform + "-" + process.arch, "herdr-core");

test.skipIf(process.platform === "win32")("停用 SSH 后可见本机资源回收结果待核对，确认后可重新启用", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-ssh-stop-"));
  const runtime = path.join(fixture, "run");
  const vaultPath = path.join(fixture, "vault");
  mkdirSync(runtime, { mode: 0o700 });
  mkdirSync(vaultPath);
  vi.stubEnv("XDG_RUNTIME_DIR", runtime);
  const orphan = createServer();
  let engine: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    const running = (engine = await boot({ vaultPath, create: true }));
    const digest = createHash("sha256").update(endpointRootBinding(running.vault.root)).digest("hex").slice(0, 20);
    const core = new HerdrCore({ vaultId: running.vault.id, machineId: "fixture", runtimeDir: runtime, bin: "unused", socketName: `huhu-ssh-${digest}` });
    mkdirSync(path.dirname(core.endpoint), { mode: 0o700, recursive: true });
    const holder = core.endpoint.replace(/\.sock$/u, ".holder.1234abcd.sock");
    orphan.listen(holder);
    await once(orphan, "listening");

    const desktop = (capability: string, input: unknown = {}) => running.dispatcher.call("desktop", { capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
    const deactivate = { id: "ssh", enabled: false };
    const unconfirmed = { ok: false, error: { code: "HERDR_UNAVAILABLE", details: { outcome: "unknown", state: "disabled" } } };
    expect(await desktop("plugins.setEnabled", deactivate)).toMatchObject(unconfirmed);
    expect(await desktop("plugins.list")).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: "ssh", state: "disabled", error: expect.stringContaining("无法确认") })]) });
    expect(await desktop("ssh.local.environments")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await desktop("plugins.setEnabled", { ...deactivate, enabled: true })).toMatchObject(unconfirmed);
    expect(orphan.listening).toBe(true);

    const closed = once(orphan, "close");
    orphan.close();
    await closed;
    expect(existsSync(holder)).toBe(false);
    expect(await desktop("plugins.setEnabled", deactivate)).toEqual({ ok: true, data: { state: "disabled", alsoDisabled: [] } });
    expect(await desktop("plugins.setEnabled", { ...deactivate, enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
  } finally {
    if (orphan.listening) {
      const closed = once(orphan, "close");
      orphan.close();
      await closed;
    }
    try {
      await engine?.shutdown();
    } finally {
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
    }
  }
});

test.skipIf(process.platform !== "linux" || !existsSync(herdrBin)).each(["随包绝对路径", "PATH"] as const)("SSH 本地 PTY 在 Agent 停用时可重挂，Web 无法访问，SSH 停用后释放进程（%s）", { timeout: 30_000 }, async (source) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-ssh-local-"));
  const runtime = path.join(fixture, "run");
  const home = path.join(fixture, "home");
  const webAssetsDir = path.join(fixture, "web");
  const vaultPath = path.join(fixture, "vault");
  for (const directory of [runtime, home, webAssetsDir, vaultPath]) mkdirSync(directory);
  chmodSync(runtime, 0o1777);
  writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>SSH test</title>");
  vi.stubEnv("HUHU_HERDR_BIN", source === "PATH" ? undefined : herdrBin);
  vi.stubEnv("XDG_RUNTIME_DIR", runtime);
  vi.stubEnv("HOME", home);
  vi.stubEnv("SHELL", "/bin/sh");
  let engine: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    const running = (engine = await boot({ vaultPath, webAssetsDir, create: true }));
    const desktop = async <T>(capability: string, input: unknown = {}): Promise<T> => {
      const result = await running.dispatcher.call("desktop", { capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      if (!result.ok) throw new Error(capability + " " + result.error.code + " " + result.error.message);
      return result.data as T;
    };
    await desktop("plugins.setEnabled", { id: "agent-cli", enabled: false });
    const environments = await desktop<{ id: string; name: string }[]>("ssh.local.environments");
    const shell = environments.find(({ name }) => name === "sh");
    expect(shell).toBeDefined();
    expect(readdirSync(runtime)).toEqual([]);
    const open = { action: "launch", environmentId: shell!.id };
    if (source === "PATH") {
      const bin = path.join(fixture, "bin");
      mkdirSync(bin);
      const previousPath = process.env["PATH"];
      vi.stubEnv("PATH", bin);
      await expect(desktop("ssh.local.open", open)).rejects.toThrow(/HERDR_UNAVAILABLE/u);
      expect(readdirSync(runtime)).toEqual([]);
      symlinkSync(herdrBin, path.join(bin, "herdr-core"));
      vi.stubEnv("PATH", [bin, previousPath].filter(Boolean).join(path.delimiter));
    }
    const session = await desktop<{ id: string; state: string }>("ssh.local.open", open);
    expect(session.state).toBe("running");
    const coreSocket = readdirSync(runtime, { recursive: true, encoding: "utf8" }).find((file) => /^huhu-ssh-[a-f0-9]{20}\.sock$/u.test(path.basename(file)));
    expect(coreSocket).toBeDefined();
    expect(statSync(path.dirname(path.join(runtime, coreSocket!))).mode & 0o077).toBe(0);
    const route = "/ws/terminal/" + session.id + "?cols=101&rows=29";
    const control = "http://127.0.0.1:" + running.port;
    const terminal = await openStream(control, route, {}, running.rendererToken);
    await expect.poll(() => terminal.messages).toContainEqual({ type: "mode", mode: "control" });
    terminal.ws.send(Buffer.from('printf \'huhu-pty-%s-%s\\n\' "$$" "$((6 * 7))"\nstty size\n'));
    const output = () => Buffer.concat(terminal.output).toString("utf8");
    const marker = /huhu-pty-(\d+)-42/u;
    await expect.poll(output).toMatch(marker);
    await expect.poll(output).toMatch(/\b29 101\b/u);
    const pid = Number(output().match(marker)![1]);
    terminal.ws.close();
    await terminal.closed;

    const reattached = await openStream(control, route, {}, running.rendererToken);
    await expect.poll(() => reattached.messages).toContainEqual({ type: "mode", mode: "control" });
    reattached.ws.send(Buffer.from("printf 'huhu-reattach-%s\\n' \"$$\"\n"));
    await expect.poll(() => Buffer.concat(reattached.output).toString("utf8")).toContain("huhu-reattach-" + pid);

    const sharing = await desktop<{ addresses: { url: string }[] }>("web.share.start", { mode: "local" });
    const origin = sharing.addresses[0]!.url;
    const invitation = await desktop<{ links: string[] }>("web.invitations.create");
    const invite = new URLSearchParams(new URL(invitation.links[0]!).hash.slice(1)).get("invite");
    const joined = await fetch(origin + "/api/v1/session", { method: "POST", headers: { origin, authorization: "Bearer " + invite } });
    expect(joined.status).toBe(204);
    const cookie = joined.headers.get("set-cookie")!.split(";")[0]!;
    const browser = await openStream(origin, route, { origin, cookie });
    expect(await browser.closed).toBe(4404);
    expect(browser.output).toEqual([]);
    expect(reattached.ws.readyState).toBe(WebSocket.OPEN);

    if (source === "PATH") vi.stubEnv("PATH", path.join(fixture, "bin-no-longer-in-use"));
    await desktop("plugins.setEnabled", { id: "ssh", enabled: false });
    expect(await reattached.closed).toBe(1000);
    await expect
      .poll(() => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
          throw error;
        }
      })
      .toBe(false);
    expect(readdirSync(runtime, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".sock"))).toEqual([]);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
    }
  }
});
