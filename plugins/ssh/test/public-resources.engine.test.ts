import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

const hostGet = "ssh.resources.host.get";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-resource-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const engine = await boot({ vaultPath, desktopUserData, create: true });
  const url = `http://127.0.0.1:${engine.port}`;
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  async function call<T = unknown>(token: string, capability: string, input: unknown = {}, idempotencyKey = randomUUID()) {
    const response = await fetch(`${url}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey }),
    });
    if (response.status === 401) return { ok: false, error: { code: "HTTP_401" } } as const;
    return CapabilityResultSchema.parse(await response.json()) as CapabilityResult<T>;
  }
  async function desktop<T = unknown>(capability: string, input?: unknown) {
    const result = await call<T>(engine.rendererToken, capability, input);
    if (!result.ok) throw new Error(`${capability}: ${result.error.code}`);
    return result.data;
  }
  return {
    engine,
    call,
    desktop,
    allow: (capability: string, exposed = true) => desktop("gateway.update", { capability, exposed }),
    async mcp(token: string, method: string, params = {}) {
      const response = await fetch(`${url}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
      });
      expect(response.status).toBe(200);
      return (await response.json()).result;
    },
    async cli(capability: string, input: unknown) {
      const output: string[] = [];
      await run(["call", capability, "--vault", vaultPath, "--input-json", JSON.stringify(input), "--json"], {
        out: (line) => output.push(line),
        err: (line) => {
          throw new Error(line);
        },
      });
      return CapabilityResultSchema.parse(JSON.parse(output.join("")));
    },
    async host(name: string, jumpHostIds: string[] = [], opts: FakeSshOptions = {}) {
      const password = `synthetic-${randomUUID()}`;
      const server = await startFakeSsh({ ...opts, password });
      servers.push(server);
      const profile = { name, host: "127.0.0.1", port: server.port, user: "fixture-login", authKind: "password", jumpHostIds };
      const saved = await desktop<{ hostId: string; revision: string }>("ssh.hosts.configure", { ...profile, expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: password }] });
      return { server, password, profile, ...saved };
    },
    async close() {
      await engine.shutdown();
      await Promise.all(servers.map((server) => server.close()));
      await rm(root, { recursive: true, force: true, maxRetries: 4 });
    },
  };
}

test("only authorized Engine, CLI and MCP resolve the same portable SSH host and route without credentials or a dial", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const jump = await f.host("jump fixture");
    const target = await f.host("target fixture", [jump.hostId]);
    const { hostId } = target;
    const { cliToken, mcpToken } = f.engine;
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    const enabled = await f.allow(hostGet);
    expect(enabled).toMatchObject({ exposed: true });
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const using = vi.spyOn(ModuleCredentials.prototype, "use");
    const checking = vi.spyOn(ModuleCredentials.prototype, "list");
    try {
      const projected = await f.desktop(hostGet, { hostId });
      expect(projected).toEqual({
        hostId,
        name: target.profile.name,
        authKind: "password",
        host: target.profile.host,
        port: target.profile.port,
        revision: target.revision,
        routeRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
        route: [jump, target].map((hop) => ({ hostId: hop.hostId, revision: hop.revision, host: hop.profile.host, port: hop.profile.port })),
      });
      expect(await f.cli(hostGet, { hostId })).toEqual({ ok: true, data: projected });
      expect(await f.mcp(mcpToken, "tools/call", { name: "ssh_resources_host_get", arguments: { hostId } })).toMatchObject({ structuredContent: { data: projected } });
      expect(await f.call(cliToken, hostGet, { hostId: `host-owned-${"a".repeat(32)}` })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await f.call(cliToken, hostGet, { hostId, includeSecrets: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      for (const srv of [jump, target]) expect(srv.server.conns).toHaveLength(0);
      expect(using).not.toHaveBeenCalled();
      expect(checking).not.toHaveBeenCalled();
    } finally {
      using.mockRestore();
      checking.mockRestore();
    }
    await f.allow(hostGet, false);
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(hostGet);
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: false });
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await f.desktop("capabilities.list", { includeInactive: true })).toContainEqual(expect.objectContaining({ name: hostGet, scope: "read", availability: "plugin-disabled", selected: true }));
  } finally {
    await f.close();
  }
});
