import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import type { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import type { ExecJobStatus, ExecOutputPage } from "../src/engine/public-jobs.js";
import type { PublicProbeStatus } from "../src/engine/public-probes.js";
import type { ResourceHost } from "../src/engine/public-resources.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

const hostGet = "ssh.resources.host.get";
const probeStart = "ssh.resources.connection.start";
const probeGet = "ssh.resources.connection.get";
const probeList = "ssh.resources.connection.list";
const trustDecide = "ssh.resources.trust.decide";
const jobPrepare = "ssh.jobs.prepare";
const jobStart = "ssh.jobs.start";
const jobGet = "ssh.jobs.get";
const jobOutput = "ssh.jobs.output.read";
const jobCancel = "ssh.jobs.cancel";
const jobCapabilities = [jobPrepare, jobStart, jobGet, jobOutput, jobCancel];
type Probe = z.infer<typeof PublicProbeStatus>;
type Waiting = Extract<Probe, { prompt: unknown }>;
type JobStatus = z.infer<typeof ExecJobStatus>;
type OutputPage = z.infer<typeof ExecOutputPage>;

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
  const protection = new TestProtection(desktopUserData);
  let engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
  const baseUrl = () => `http://127.0.0.1:${engine.port}`;
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const hosts: string[] = [];
  async function server(opts?: FakeSshOptions) {
    const item = await startFakeSsh(opts);
    servers.push(item);
    return item;
  }
  async function call<T = unknown>(token: string, capability: string, input: unknown = {}, idempotencyKey = randomUUID()) {
    const response = await fetch(`${baseUrl()}/api/v1/call`, {
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
    get engine() {
      return engine;
    },
    async restart(update?: () => Promise<unknown>) {
      await engine.shutdown();
      await update?.();
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
    },
    call,
    desktop,
    server,
    allow: (capability: string, exposed = true) => desktop("gateway.update", { capability, exposed }),
    async mcp(token: string, method: string, params = {}) {
      const response = await fetch(`${baseUrl()}/mcp`, {
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
      const ssh = await server({ ...opts, password: opts.password ?? password });
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

type Fixture = Awaited<ReturnType<typeof fixture>>;
type JobBinding = { hostId: string; routeRevision: string; jobId: string; sessionId: string };

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function allowJobs(f: Fixture) {
  for (const name of [...jobCapabilities, probeGet, trustDecide]) await f.allow(name);
}

async function readJob(f: Fixture, token: string, { jobId }: { jobId: string }) {
  return data(await f.call<JobStatus>(token, jobGet, { jobId }));
}

async function waitForJob(f: Fixture, token: string, job: { jobId: string }, state: JobStatus["state"]) {
  return vi.waitFor(
    async () => {
      const current = await readJob(f, token, job);
      expect(current.state).toBe(state);
      return current;
    },
    { timeout: 9000 },
  );
}

async function trustedJob(
  f: Fixture,
  token: string,
  hostId: string,
  jobId: string,
  trust = async (input: ReturnType<typeof decision>) => {
    expect(data(await f.call(token, trustDecide, input))).toEqual({ applied: true });
  },
): Promise<JobBinding> {
  const { attemptId } = await vi.waitFor(async () => {
    const current = await readJob(f, token, { jobId });
    if (!("attemptId" in current) || !current.attemptId) throw new Error("The job has no SSH attempt");
    return { attemptId: current.attemptId };
  });
  const prompt = await awaitPrompt(f, token, { hostId, attemptId });
  await trust(decision(prompt));
  const ready = await waitForJob(f, token, { jobId }, "ready");
  if (!("sessionId" in ready) || !ready.sessionId) throw new Error("The ready job has no session");
  return { hostId, jobId, routeRevision: ready.routeRevision, sessionId: ready.sessionId };
}

test("CLI owns a separate SSH job, reads split UTF-8 with byte cursors and retains a bounded tail", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const secondChunk = latch();
  const tail = latch();
  const command = "fixture-output";
  const executed: string[] = [];
  try {
    const { hostId, server, password } = await f.host("UTF-8 fixture", [], {
      onExecRequest: (received) => {
        executed.push(received);
        return undefined;
      },
      onInteractiveExec: (received, channel) => {
        if (received !== command) return false;
        const bytes = Buffer.from("A中文🙂");
        channel.write(bytes.subarray(0, 2));
        void secondChunk.promise.then(async () => {
          channel.write(bytes.subarray(2));
          channel.stderr.write("错误");
          await tail.promise;
          channel.write("界".repeat(25_000));
          channel.exit(7);
          channel.end();
        });
        return true;
      },
    });
    const { cliToken } = f.engine;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command, intentKey: randomUUID() };
    const catalog = await f.desktop<Array<{ name: string; selected: boolean }>>("capabilities.list", { includeInactive: true });
    expect(catalog.filter(({ name }) => jobCapabilities.includes(name))).toHaveLength(5);
    expect(catalog.filter(({ name }) => jobCapabilities.includes(name)).every(({ selected }) => !selected)).toBe(true);
    expect(await f.cli(jobPrepare, prepare)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await allowJobs(f);
    expect(await f.cli(jobGet, { jobId: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(server.conns).toHaveLength(0);

    await f.allow(probeStart);
    const probe = await beginProbe(f, cliToken, hostId);
    const probePrompt = await awaitPrompt(f, cliToken, { hostId, attemptId: probe.attemptId });
    expect(await f.cli(trustDecide, decision(probePrompt))).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    const [created, repeated] = await Promise.all([f.cli(jobPrepare, prepare), f.cli(jobPrepare, prepare)]);
    const { jobId } = data(created) as { jobId: string };
    expect(repeated).toEqual(created);
    expect(await f.cli(jobPrepare, { ...prepare, command: "different fixture intent" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    const start = await trustedJob(f, cliToken, hostId, jobId, async (input) => {
      expect(await f.cli(trustDecide, input)).toEqual({ ok: true, data: { applied: true } });
    });
    const ready = await readJob(f, cliToken, { jobId });
    expect(ready).toMatchObject({ state: "ready", jobId, hostId, routeRevision, attemptId: expect.any(String), sessionId: start.sessionId });
    expect(new Set([hostId, probe.attemptId, "attemptId" in ready && ready.attemptId, start.sessionId, jobId]).size).toBe(5);
    expect(server.conns).toHaveLength(2);
    expect(server.closed()).toBe(1);
    expect(executed).toEqual([]);
    expect(await f.cli(jobStart, { ...start, sessionId: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    const starts = await Promise.all([f.cli(jobStart, start), f.cli(jobStart, start)]);
    expect(starts).toEqual([created, created]);
    await waitForJob(f, cliToken, { jobId }, "running");
    const read = async (cursor = 0, limit = 4, stream = "stdout") => data(await f.cli(jobOutput, { jobId, stream, cursor, limit })) as OutputPage;
    await vi.waitFor(async () => expect(await read()).toEqual({ text: "A", fromCursor: 0, nextCursor: 1, endCursor: 1, skippedBytes: 0, truncated: false }));
    secondChunk.resolve();
    await vi.waitFor(async () => expect(await read()).toMatchObject({ text: "A中", nextCursor: 4, endCursor: 11 }));
    expect(await read(2)).toMatchObject({ text: "文", fromCursor: 4, nextCursor: 7, skippedBytes: 2, truncated: false });
    expect(await read(7)).toMatchObject({ text: "🙂", fromCursor: 7, nextCursor: 11 });
    expect(await read(0, 4096, "stderr")).toMatchObject({ text: "错误", endCursor: 6 });
    tail.resolve();

    const exited = await waitForJob(f, cliToken, { jobId }, "exited");
    expect(exited).toMatchObject({ state: "exited", reason: "exit-code", exitCode: 7, stdoutEnd: 75_011, stderrEnd: 6 });
    expect(JSON.stringify(exited)).not.toContain(password);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    const pages: OutputPage[] = [await read(0, 16_384)];
    expect(pages[0]).toMatchObject({ fromCursor: 9476, skippedBytes: 9476, truncated: true });
    while (pages.at(-1)!.nextCursor < 75_011) pages.push(await read(pages.at(-1)!.nextCursor, 16_384));
    expect(pages.map(({ text }) => text).join("")).toBe("界".repeat(21_845));
    expect(pages.every(({ text, fromCursor, nextCursor }) => Buffer.byteLength(text) === nextCursor - fromCursor && Buffer.byteLength(text) <= 16_384)).toBe(true);
    expect(await f.cli(jobOutput, { jobId, stream: "stdout", cursor: 75_012 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await f.cli(jobStart, start)).toEqual(created);
    expect(executed).toEqual([command]);

    const ledger = path.join(f.engine.vault.runtimeDir, "ssh-exec-intents.ndjson");
    const receipts = await readFile(ledger, "utf8");
    for (const secret of [command, password, prepare.intentKey, "界界", "错误"]) expect(receipts).not.toContain(secret);
    await f.restart();
    expect(await f.cli(jobPrepare, prepare)).toEqual(created);
    expect(await f.cli(jobGet, { jobId })).toEqual({ ok: true, data: exited });
    expect(await read()).toEqual({ text: "", fromCursor: 75_011, nextCursor: 75_011, endCursor: 75_011, skippedBytes: 75_011, truncated: true });
    expect(await f.cli(jobStart, start)).toEqual(created);
    expect(server.conns).toHaveLength(2);
    expect(executed).toEqual([command]);
  } finally {
    await f.close();
  }
});

test("MCP HTTP rechecks approval and ownership, and cancels only the original concurrent job", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  try {
    const { hostId, server } = await f.host("MCP job fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        return undefined;
      },
    });
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    await allowJobs(f);
    const a = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "jobs MCP A" });
    const b = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "jobs MCP B" });
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const mcp = (token: string, capability: string, input: unknown) => f.mcp(token, "tools/call", { name: capability.replaceAll(".", "_"), arguments: input });
    const prepare = { hostId, routeRevision, command: "sleep 25", intentKey: randomUUID() };
    expect(await f.mcp(a.token, "tools/list")).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "ssh_jobs_prepare" })]) });
    expect(await mcp(f.engine.mcpToken, jobPrepare, prepare)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("PERMISSION_DENIED") }] });
    expect(server.conns).toHaveLength(0);
    const prepared = await mcp(a.token, jobPrepare, prepare);
    expect(prepared).toMatchObject({ structuredContent: { data: { jobId: expect.any(String) } } });
    expect(await mcp(a.token, jobPrepare, prepare)).toEqual(prepared);
    const { jobId } = prepared.structuredContent.data as { jobId: string };
    const trust = async (input: ReturnType<typeof decision>) => {
      expect(await mcp(a.token, trustDecide, input)).toMatchObject({ structuredContent: { data: { applied: true } } });
    };
    const first = await trustedJob(f, a.token, hostId, jobId, trust);
    const other = await mcp(a.token, jobPrepare, { ...prepare, command: "sleep 26", intentKey: randomUUID() });
    const second = await trustedJob(f, a.token, hostId, other.structuredContent.data.jobId as string, trust);
    for (const [capability, input] of [
      [jobStart, first],
      [jobGet, { jobId }],
      [jobOutput, { jobId, stream: "stdout" }],
      [jobCancel, { jobId }],
    ] as const) {
      expect(await mcp(b.token, capability, input)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    }
    expect(await f.cli(jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await f.allow(jobStart, false);
    expect(await mcp(a.token, jobStart, first)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("CAPABILITY_NOT_EXPOSED") }] });
    expect(commands).toEqual([]);
    await f.allow(jobStart);
    expect(await mcp(a.token, jobStart, { ...first, sessionId: second.sessionId })).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    for (const result of await Promise.all([mcp(a.token, jobStart, first), mcp(a.token, jobStart, second), mcp(a.token, jobStart, first)])) {
      expect(result).toMatchObject({ structuredContent: { data: { jobId: expect.any(String) } } });
    }
    for (const job of [first, second]) await waitForJob(f, a.token, job, "running");
    // Stateless MCP closes the transport after each response. Subsequent polls observe
    // the same running job, even when its output and status are read concurrently.
    const observations = await Promise.all([mcp(a.token, jobOutput, { jobId, stream: "stdout" }), mcp(a.token, jobGet, { jobId })]);
    expect(observations[0]).toMatchObject({ structuredContent: { data: { text: "", endCursor: 0 } } });
    expect(observations[1]).toMatchObject({ structuredContent: { data: { state: "running" } } });
    expect(await mcp(a.token, jobCancel, { jobId })).toMatchObject({ structuredContent: { data: { requested: true } } });
    expect(await mcp(a.token, jobCancel, { jobId })).toMatchObject({ structuredContent: { data: { requested: false } } });
    expect(await waitForJob(f, a.token, first, "exited")).toMatchObject({ exitCode: 130, reason: "exit-code", stopRequested: "cancel" });
    expect(await readJob(f, a.token, second)).toMatchObject({ state: "running", stopRequested: null });
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(await mcp(a.token, jobStart, first)).toMatchObject({ structuredContent: { data: { jobId } } });
    expect(await mcp(a.token, jobCancel, { jobId: second.jobId })).toMatchObject({ structuredContent: { data: { requested: true } } });
    await waitForJob(f, a.token, second, "exited");
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    expect(commands.sort()).toEqual(["sleep 25", "sleep 26"]);
    await f.desktop("gateway.tokens.revoke", { id: a.id });
    expect(await f.call(a.token, jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "HTTP_401" } });
  } finally {
    await f.close();
  }
});

test("route edits and a second Vault cannot reuse the original job or its receipts", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  try {
    const host = await f.host("revision fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        return undefined;
      },
    });
    const { hostId } = host;
    await allowJobs(f);
    const token = f.engine.cliToken;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "fixture-stale", intentKey: randomUUID() };
    expect(await f.call(token, jobPrepare, { ...prepare, routeRevision: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(host.server.conns).toHaveLength(0);
    const { jobId } = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
    const start = await trustedJob(f, token, hostId, jobId);
    await f.desktop("ssh.hosts.configure", { ...host.profile, name: "revised fixture", hostId, expectedRevision: host.revision, credentials: [] });
    expect(await f.call(token, jobStart, start)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await readJob(f, token, { jobId })).toMatchObject({ state: "failed", reason: "route-changed", exitCode: null, routeRevision, sessionId: start.sessionId });
    expect(await f.call(token, jobPrepare, prepare)).toEqual({ ok: true, data: { jobId } });
    await vi.waitFor(() => expect(host.server.closed()).toBe(1));

    const other = await fixture();
    try {
      const filename = "ssh-exec-intents.ndjson";
      await other.restart(() => copyFile(path.join(f.engine.vault.runtimeDir, filename), path.join(other.engine.vault.runtimeDir, filename)));
      await allowJobs(other);
      const otherToken = other.engine.cliToken;
      expect(await other.call(otherToken, jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await other.call(otherToken, jobStart, start)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await other.call(otherToken, jobCancel, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(commands).toEqual([]);
    } finally {
      await other.close();
    }
  } finally {
    await f.close();
  }
});

test("SSH rejection, reported signals and missing replies preserve actual outcomes without replay", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  try {
    await allowJobs(f);
    const token = f.engine.cliToken;
    const { hostId, server } = await f.host("SSH exit fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        if (command === "fixture-rejected") return "reject";
        if (command === "fixture-no-ack") return "hold";
        return undefined;
      },
      onInteractiveExec: (command, channel) => {
        if (command === "fixture-signal") channel.exit("TERM");
        if (command === "fixture-ignores-stop") return true;
        channel.end();
        return true;
      },
    });
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    for (const [command, state, reason, exitSignal, stopRequested] of [
      ["fixture-rejected", "failed", "exec-rejected", null, null],
      ["fixture-signal", "exited", "remote-signal", "SIGTERM", null],
      ["fixture-no-status", "unknown", "exit-unreported", null, null],
      ["fixture-no-ack", "unknown", "dispatch-timeout", null, null],
      ["fixture-ignores-stop", "unknown", "timeout-unconfirmed", null, "timeout"],
    ] as const) {
      const prepare = { hostId, routeRevision, command, intentKey: randomUUID(), timeoutSec: 1 };
      const job = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
      const start = await trustedJob(f, token, hostId, job.jobId);
      expect(data(await f.call(token, jobStart, start))).toEqual(job);
      expect(await waitForJob(f, token, job, state)).toMatchObject({ state, reason, exitCode: null, exitSignal, stopRequested });
      expect(data(await f.call(token, jobPrepare, prepare))).toEqual(job);
      expect(data(await f.call(token, jobStart, start))).toEqual(job);
    }
    await vi.waitFor(() => expect(server.closed()).toBe(5));
    expect(commands).toEqual(["fixture-rejected", "fixture-signal", "fixture-no-status", "fixture-no-ack", "fixture-ignores-stop"]);
    const refused = await f.host("refused credentials fixture", [], { password: randomUUID() });
    const refusedRoute = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId: refused.hostId });
    const job = data(await f.call<{ jobId: string }>(token, jobPrepare, { hostId: refused.hostId, routeRevision: refusedRoute.routeRevision, command: "fixture-never-exec", intentKey: randomUUID() }));
    const attempting = await readJob(f, token, job);
    if (!("attemptId" in attempting) || !attempting.attemptId) throw new Error("The job has no SSH attempt");
    const waiting = await awaitPrompt(f, token, { hostId: refused.hostId, attemptId: attempting.attemptId });
    expect(data(await f.call(token, trustDecide, decision(waiting)))).toEqual({ applied: true });
    expect(await waitForJob(f, token, job, "failed")).toMatchObject({ reason: "authentication-failed", sessionId: null, exitCode: null });
    await vi.waitFor(() => expect(refused.server.closed()).toBe(1));
  } finally {
    await f.close();
  }
});

test("an admission left by an interrupted Engine remains unknown and cannot dial or dispatch again", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const executed: string[] = [];
  try {
    await allowJobs(f);
    const { hostId, server } = await f.host("interrupted fixture", [], {
      onExecRequest: (command) => {
        executed.push(command);
        return undefined;
      },
    });
    const token = f.engine.cliToken;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "sleep 25", intentKey: randomUUID() };
    const job = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
    const start = await trustedJob(f, token, hostId, job.jobId);
    await f.call(token, jobStart, start);
    await waitForJob(f, token, job, "running");

    const ledger = path.join(f.engine.vault.runtimeDir, "ssh-exec-intents.ndjson");
    const pendingReceipt = await readFile(ledger, "utf8");
    expect(pendingReceipt.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(pendingReceipt)).toMatchObject({ operationId: job.jobId, phase: "accepted" });
    // Reopen the exact durable state left by a crash before the terminal write.
    await f.restart(() => writeFile(ledger, pendingReceipt));
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(await f.cli(jobPrepare, prepare)).toEqual({ ok: true, data: job });
    expect(await f.cli(jobGet, job)).toEqual({ ok: true, data: { ...job, state: "unknown", reason: "engine-interrupted" } });
    expect(await f.cli(jobStart, start)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.cli(jobCancel, job)).toEqual({ ok: true, data: { requested: false } });
    expect(await f.cli(jobOutput, { ...job, stream: "stdout" })).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    expect(server.conns).toHaveLength(1);
    expect(executed).toEqual(["sleep 25"]);
  } finally {
    await f.close();
  }
});
