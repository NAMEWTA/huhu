import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import type { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import type { PublicProbeStatus } from "../src/engine/public-probes.js";
import type { ResourceHost } from "../src/engine/public-resources.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

const hostGet = "ssh.resources.host.get";
const probeStart = "ssh.resources.connection.start";
const probeGet = "ssh.resources.connection.get";
const probeList = "ssh.resources.connection.list";
const trustDecide = "ssh.resources.trust.decide";
type Probe = z.infer<typeof PublicProbeStatus>;
type Waiting = Extract<Probe, { prompt: unknown }>;

function data<T>(reply: { ok: true; data: T } | { ok: false; error: { code: string } }): T {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}

function decision({ hostId, attemptId, routeRevision, prompt }: Waiting) {
  return { hostId, attemptId, routeRevision, ...prompt, accept: true };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-resource-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create: true });
  const url = `http://127.0.0.1:${engine.port}`;
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const hosts: string[] = [];
  async function server(opts?: FakeSshOptions) {
    const item = await startFakeSsh(opts);
    servers.push(item);
    return item;
  }
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
    server,
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
      const ssh = await server({ ...opts, password });
      const profile = { name, host: "127.0.0.1", port: ssh.port, user: "fixture-login", authKind: "password", jumpHostIds };
      const saved = await desktop<{ hostId: string; revision: string }>("ssh.hosts.configure", { ...profile, expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: password }] });
      hosts.push(saved.hostId);
      return { server: ssh, password, profile, ...saved };
    },
    async close() {
      try {
        if (hosts.length) {
          await desktop("plugins.setEnabled", { id: "ssh", enabled: false });
          await desktop("plugins.setEnabled", { id: "ssh", enabled: true });
          for (const hostId of hosts.reverse()) {
            const { revision } = await desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
            await desktop("ssh.hosts.remove", { hostId, expectedRevision: revision });
          }
        }
      } finally {
        await engine.shutdown();
        await Promise.all(servers.map((server) => server.close()));
        await rm(root, { recursive: true, force: true, maxRetries: 4 });
      }
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

async function beginProbe(f: Awaited<ReturnType<typeof fixture>>, token: string, hostId: string) {
  const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
  const input = { hostId, routeRevision };
  const { attemptId } = data(await f.call<{ attemptId: string }>(token, probeStart, input));
  return { ...input, attemptId };
}

async function awaitPrompt(f: Awaited<ReturnType<typeof fixture>>, token: string, binding: { hostId: string; attemptId: string }, state: "waiting" | "key-changed" = "waiting", hop?: number) {
  return vi.waitFor(
    async () => {
      const probe = data(await f.call<Probe>(token, probeGet, binding));
      if (probe.state !== state || (hop !== undefined && probe.prompt.hop !== hop)) throw new Error("Waiting for the expected SSH hop");
      return probe;
    },
    { timeout: 5000 },
  );
}

test("first trust stays with the original attempt, route and external subject through policy and token revocation", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const auth: string[] = [];
  try {
    const { hostId, server } = await f.host("owner fixture", [], { onAuth: (_user, method) => auth.push(method) });
    const another = await f.host("other fixture");
    await f.desktop("plugins.setEnabled", { id: "safe", enabled: false });
    const a = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "fixture A" });
    const b = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "fixture B" });
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    await f.allow(probeGet);
    await f.allow(probeList);
    expect(await f.call(a.token, probeStart, { hostId, routeRevision })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await f.call(a.token, probeList)).toEqual({ ok: true, data: [] });
    expect(server.conns).toHaveLength(0);

    await f.allow(probeStart);
    const { attemptId } = await beginProbe(f, a.token, hostId);
    const key = { hostId, attemptId };
    const waiting = await awaitPrompt(f, a.token, key);
    const reply = decision(waiting);
    expect(waiting.prompt.fingerprint).toBe(server.fingerprint);
    expect(await f.call(a.token, probeStart, { hostId, routeRevision })).toEqual({ ok: true, data: { attemptId } });
    expect(await f.call(b.token, probeGet, key)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.call(b.token, probeList)).toEqual({ ok: true, data: [] });
    expect(await f.cli(probeGet, key)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.desktop("ssh.connections.status")).toEqual([]);
    expect(await f.desktop("ssh.hostKey.decide", { attemptId, hop: reply.hop, promptId: reply.promptId, accept: true, remember: false })).toEqual({ applied: false });
    expect(await f.call(a.token, trustDecide, reply)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(trustDecide);
    for (const invalid of [{ hostId: another.hostId }, { serverHostId: another.hostId }, { hop: reply.hop + 1 }, { promptRevision: "0".repeat(64) }, { routeRevision: "0".repeat(64) }, { promptId: "other" }]) {
      expect(await f.call(a.token, trustDecide, { ...reply, ...invalid })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await f.call(a.token, trustDecide, { ...reply, remember: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    expect(await f.mcp(a.token, "tools/call", { name: "ssh_resources_connection_get", arguments: key })).toMatchObject({ structuredContent: { data: waiting } });
    await f.allow(trustDecide, false);
    const idempotencyKey = randomUUID();
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(auth).not.toContain("password");
    await f.allow(trustDecide);
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toEqual({ ok: true, data: { applied: true } });
    expect(await f.call(b.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await vi.waitFor(async () => expect(await f.call(a.token, probeGet, key)).toMatchObject({ ok: true, data: { state: "verified" } }));
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(auth.filter((method) => method === "password")).toHaveLength(1);
    expect(await f.desktop("ssh.knownHosts.list")).toEqual([]);

    const refused = await beginProbe(f, a.token, hostId);
    const refusedPrompt = await awaitPrompt(f, a.token, { hostId, attemptId: refused.attemptId });
    expect(await f.mcp(a.token, "tools/call", { name: "ssh_resources_trust_decide", arguments: { ...decision(refusedPrompt), accept: false } })).toMatchObject({ structuredContent: { data: { applied: true } } });
    await vi.waitFor(async () => expect(await f.call(a.token, probeGet, { hostId, attemptId: refused.attemptId })).toMatchObject({ ok: true, data: { state: "failed" } }));

    const next = await beginProbe(f, a.token, hostId);
    const held = await awaitPrompt(f, a.token, { hostId, attemptId: next.attemptId });
    await f.desktop("gateway.tokens.revoke", { id: a.id });
    expect(await f.call(a.token, trustDecide, decision(held))).toMatchObject({ ok: false, error: { code: "HTTP_401" } });
    expect(auth.filter((method) => method === "password")).toHaveLength(1);
    expect(another.server.conns).toHaveLength(0);
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: false });
    await vi.waitFor(() => expect(server.closed()).toBe(3), { timeout: 5000 });
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: true });
    expect(await f.call(b.token, probeList)).toEqual({ ok: true, data: [] });
  } finally {
    await f.close();
  }
});

test("a changed jump revision invalidates the original pending target before authentication", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const targetAuth: string[] = [];
  try {
    const jump = await f.host("jump fixture");
    const target = await f.host("target fixture", [jump.hostId], { onAuth: (_user, method) => targetAuth.push(method) });
    for (const capability of [probeStart, probeGet, trustDecide]) await f.allow(capability);
    const { cliToken } = f.engine;
    const hostId = target.hostId;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const { attemptId } = data(await f.cli(probeStart, { hostId, routeRevision })) as { attemptId: string };
    const key = { hostId, attemptId };
    const first = await awaitPrompt(f, cliToken, key, "waiting", 0);
    expect(first.prompt).toMatchObject({ serverHostId: jump.hostId, fingerprint: jump.server.fingerprint });
    expect(await f.cli(trustDecide, decision(first))).toMatchObject({ ok: true });
    const second = await awaitPrompt(f, cliToken, key, "waiting", 1);
    expect(second.prompt).toMatchObject({ serverHostId: target.hostId, fingerprint: target.server.fingerprint });
    expect(await f.call(cliToken, trustDecide, decision(first))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(await f.desktop(hostGet, { hostId })).not.toMatchObject({ routeRevision });
    expect(await f.call(cliToken, trustDecide, decision(second))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(targetAuth).not.toContain("password");
  } finally {
    await f.close();
  }
});

test("changed SSH keys stay blocked for an external subject with trust decision enabled", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const auth: string[] = [];
  try {
    const old = await f.host("changed-key fixture");
    const { hostId } = old;
    for (const capability of [probeStart, probeGet, trustDecide]) await f.allow(capability);
    await f.desktop("ssh.connect", { hostId, background: true });
    const prompt = await vi.waitFor(async () => {
      const [status] = await f.desktop<ConnectionStatus[]>("ssh.connections.status");
      if (status?.state !== "waiting") throw new Error("Waiting for desktop trust");
      return status.prompt;
    });
    const { attemptId, hop, promptId } = prompt;
    expect(await f.desktop("ssh.hostKey.decide", { attemptId, hop, promptId, accept: true, remember: true })).toEqual({ applied: true });
    await vi.waitFor(async () => expect(await f.desktop("ssh.connections.status")).toMatchObject([{ state: "connected" }]));
    await old.server.close();
    const changed = await f.server({ port: old.server.port, password: old.password, onAuth: (_user, method) => auth.push(method) });
    const { cliToken } = f.engine;
    const next = await beginProbe(f, cliToken, hostId);
    const mismatch = await awaitPrompt(f, cliToken, { hostId, attemptId: next.attemptId }, "key-changed");
    expect(mismatch.prompt.fingerprint).toBe(changed.fingerprint);
    expect(await f.call(cliToken, trustDecide, decision(mismatch))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(auth).not.toContain("password");
    expect(await f.desktop("ssh.knownHosts.list")).toMatchObject([{ fingerprint: old.server.fingerprint }]);
  } finally {
    await f.close();
  }
});
