import { mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession, recoveryInitialize } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import type { ExecJobStatus, ExecOutputPage } from "../src/engine/public-jobs.js";
import { PublicProbeStatus } from "../src/engine/public-probes.js";
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
const execCancel = "ssh.exec.cancel";
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
  const chooseHosts = async (ids: readonly string[]) => {
    const resources = { "ssh.hosts": ids };
    const { revision, catalogRevision } = await desktop<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { resources });
    return desktop("gateway.policy.update", { resources, expectedRevision: revision, catalogRevision });
  };
  async function cliArgs(args: string[]) {
    const output: string[] = [];
    await run([...args, "--vault", vaultPath, "--json"], {
      out: (line) => output.push(line),
      err: (line) => {
        throw new Error(line);
      },
    });
    return JSON.parse(output.join(""));
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
    chooseHosts,
    server,
    allow: (capability: string, exposed = true) => desktop("gateway.update", { capability, exposed }),
    mcpEndpoint: () => `${baseUrl()}/mcp`,
    async mcp(token: string, method: string, params = {}, handle?: string) {
      const endpoint = `${baseUrl()}/mcp`;
      const session = handle ?? (await openMcpSession(endpoint, token));
      const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session);
      expect(response.status).toBe(200);
      return (await response.json()).result;
    },
    async cli(capability: string, input: unknown) {
      return CapabilityResultSchema.parse(await cliArgs(["call", capability, "--input-json", JSON.stringify(input)]));
    },
    async cliTools() {
      return z.object({ data: z.array(z.object({ name: z.string() })) }).parse(await cliArgs(["capabilities", "list"])).data;
    },
    async host(name: string, jumpHostIds: string[] = [], opts: FakeSshOptions = {}) {
      const password = `synthetic-${randomUUID()}`;
      const ssh = await server({ ...opts, password: opts.password ?? password });
      const profile = { name, host: "127.0.0.1", port: ssh.port, user: "fixture-login", authKind: "password", jumpHostIds };
      const saved = await desktop<{ hostId: string; revision: string }>("ssh.hosts.configure", { ...profile, expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: password }] });
      hosts.push(saved.hostId);
      await chooseHosts(hosts);
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

test.each(["cli", "mcp"] as const)("%s selects and revokes SSH hosts across all public entry points", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const hostList = "ssh.hosts.list";
  const directory = "ssh.hosts.directory";
  const tools = [hostList, directory, hostGet, probeStart, probeGet, probeList, trustDecide, ...jobCapabilities];
  const commands: string[] = [];
  const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const notGranted = { ok: false, error: { code: "PERMISSION_DENIED" } };
  try {
    const a = await f.host("visible fixture", [], {
      onExec: (command) => {
        commands.push(command);
        return { stdout: "fixture output", code: 0 };
      },
    });
    const b = await f.host("hidden fixture");
    const group = (name: string, expectedVersion: string) => f.desktop<{ version: string; groups: { name: string; groupId: string }[] }>("ssh.hosts.organize", { expectedVersion, operation: { type: "group.create", name, parentId: null } });
    const first = await group("selected group", "0");
    const second = await group("hidden group", first.version);
    const visible = second.groups.find(({ name }) => name === "selected group")!.groupId;
    const hidden = second.groups.find(({ name }) => name === "hidden group")!.groupId;
    const move = (hostId: string, groupId: string, expectedVersion: string) => f.desktop<{ version: string }>("ssh.hosts.organize", { expectedVersion, operation: { type: "hosts.move", hostIds: [hostId], groupId } });
    const placed = await move(a.hostId, visible, second.version);
    await move(b.hostId, hidden, placed.version);
    await f.chooseHosts([]);

    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "resource matrix" });
    let session = entry === "mcp" ? await openRecoverableMcpSession(f.mcpEndpoint(), token) : undefined;
    const name = (id: string) => (entry === "mcp" ? id.replaceAll(".", "_") : id);
    const discover = async () => {
      if (entry === "cli") return (await f.cliTools()).map(({ name }) => name);
      const result = await f.mcp(token, "tools/list", {}, session!.handle);
      return z
        .array(z.object({ name: z.string() }))
        .parse(result.tools)
        .map(({ name }) => name);
    };
    const invoke = async (id: string, args: object = {}): Promise<CapabilityResult<unknown>> => {
      if (entry === "cli") return f.cli(id, args);
      const result = await f.mcp(token, "tools/call", { name: name(id), arguments: args }, session!.handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const discardReply = async (id: string, args: object) => {
      if (entry === "cli") {
        await f.cli(id, args);
        return;
      }
      const response = await mcpRequest(f.mcpEndpoint(), token, mcpRpc("tools/call", { name: name(id), arguments: args }), session!.handle);
      expect(response.status).toBe(200);
      await response.body!.cancel();
    };
    expect((await discover()).filter((id) => tools.map(name).includes(id))).toEqual([]);
    for (const id of tools) {
      expect(await invoke(id), id).toMatchObject(notExposed);
      await f.allow(id);
    }
    expect(await discover()).toEqual(expect.arrayContaining(tools.map(name)));
    const host = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId: a.hostId });
    const binding = { hostId: a.hostId, routeRevision: host.routeRevision };
    const intent = { ...binding, intentKey: randomUUID() };
    const prepare = { ...binding, intentKey: randomUUID(), command: "fixture command" };
    for (const [id, input] of [
      [hostList, {}],
      [directory, {}],
      [hostGet, binding],
      [probeStart, intent],
      [jobPrepare, prepare],
    ] as const) {
      const args = id === hostGet ? { hostId: a.hostId } : input;
      expect(await invoke(id, args), id).toMatchObject(notGranted);
    }
    expect(a.server.conns).toHaveLength(0);
    await f.chooseHosts([a.hostId]);
    const version = () => f.engine.vault.files.currentVersion(".huhu/ssh/host-directory.json");
    const beforeRead = version();
    const sideEffects = [vi.spyOn(HerdrCore.prototype, "ensure"), vi.spyOn(ModuleCredentials.prototype, "list"), vi.spyOn(ModuleCredentials.prototype, "use")];
    try {
      const list = data(await invoke(hostList));
      expect(list).toEqual([{ id: a.hostId, name: a.profile.name, host: "127.0.0.1", port: a.server.port, user: "fixture-login", tags: [], revision: a.revision }]);
      expect(data(await invoke(directory))).toMatchObject({ groups: [{ groupId: visible }], hosts: [{ hostId: a.hostId }] });
      expect(await invoke(directory, { groupId: hidden })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(data(await invoke(hostGet, { hostId: a.hostId }))).toEqual(host);
      expect(await invoke(hostGet, { hostId: b.hostId })).toMatchObject(notGranted);
      expect(a.server.conns).toHaveLength(0);
      expect(b.server.conns).toHaveLength(0);
      expect(version()).toBe(beforeRead);
      for (const spy of sideEffects) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of sideEffects) spy.mockRestore();
    }

    const [left] = await Promise.all([invoke(probeStart, intent), discardReply(probeStart, intent)]);
    expect(await invoke(probeStart, intent)).toEqual(left);
    const probe = { hostId: a.hostId, ...z.object({ attemptId: z.string() }).parse(data(left)) };
    const waitForTrust = (address: typeof probe) =>
      vi.waitFor(async () => {
        const status = data(await invoke(probeGet, address));
        expect(status).toMatchObject({ state: "waiting" });
        return status as Waiting;
      });
    const prompt = await waitForTrust(probe);
    expect(data(await invoke(probeList))).toEqual(expect.arrayContaining([expect.objectContaining(probe)]));
    expect(data(await invoke(trustDecide, decision(prompt)))).toEqual({ applied: true });
    const [firstJob] = await Promise.all([invoke(jobPrepare, prepare), discardReply(jobPrepare, prepare)]);
    expect(await invoke(jobPrepare, prepare)).toEqual(firstJob);
    const job = z.object({ jobId: z.string() }).parse(data(firstJob));
    const field = async (key: "attemptId" | "sessionId") => vi.waitFor(async () => z.object({ [key]: z.string() }).parse(data(await invoke(jobGet, job)))[key]!);
    const jobPrompt = await waitForTrust({ hostId: a.hostId, attemptId: await field("attemptId") });
    expect(data(await invoke(trustDecide, decision(jobPrompt)))).toEqual({ applied: true });
    const start = { ...binding, ...job, sessionId: await field("sessionId") };
    const cursor = { ...job, stream: "stdout", cursor: 0 };
    expect(data(await invoke(jobStart, start))).toEqual(job);
    await vi.waitFor(async () => expect(data(await invoke(jobGet, job))).toMatchObject({ state: "exited" }));
    expect(data(await invoke(jobOutput, cursor))).toMatchObject({ text: "fixture output" });
    expect(data(await invoke(jobCancel, job))).toEqual({ requested: false });
    expect(commands).toEqual([prepare.command]);
    expect(a.server.conns).toHaveLength(2);

    const rows = [
      [hostList, {}],
      [directory, {}],
      [hostGet, { hostId: a.hostId }],
      [probeStart, intent],
      [probeGet, probe],
      [probeList, {}],
      [trustDecide, decision(prompt)],
      [jobPrepare, prepare],
      [jobStart, start],
      [jobGet, job],
      [jobOutput, cursor],
      [jobCancel, job],
    ] as const;
    for (const [id, input] of rows) {
      await f.allow(id, false);
      expect(await discover()).not.toContain(name(id));
      expect(await invoke(id, input), id).toMatchObject(notExposed);
      await f.allow(id, true);
    }
    await f.chooseHosts([b.hostId]);
    for (const [id, input] of rows.filter(([id]) => ![hostList, directory, probeList].includes(id))) expect(await invoke(id, input), id).toMatchObject(notGranted);
    expect(data(await invoke(probeList))).toEqual([]);
    await f.chooseHosts([a.hostId]);
    await f.restart();
    if (session) session = await openRecoverableMcpSession(f.mcpEndpoint(), token, session.recovery);
    expect(data(await invoke(jobGet, job))).toMatchObject({ state: "exited", exitCode: 0 });
    expect(await invoke(probeStart, intent)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    if (entry === "cli") expect(data(await invoke(jobPrepare, prepare))).toEqual(job);
    await f.chooseHosts([]);
    expect(await invoke(jobGet, job)).toMatchObject(notGranted);
    expect(await invoke(jobOutput, cursor)).toMatchObject(notGranted);
    expect(commands).toEqual([prepare.command]);
    expect(a.server.conns).toHaveLength(2);
    expect(b.server.conns).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s confines host edits, copies, directory changes and removal to the authorized SSH route", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const configure = "ssh.hosts.configure";
  const copy = "ssh.hosts.copy";
  const remove = "ssh.hosts.remove";
  const organize = "ssh.hosts.organize";
  const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
  const closed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  try {
    const jump = await f.host("granted jump");
    const target = await f.host("original target", [jump.hostId]);
    const hidden = await f.host("ungranted host");
    const describeRoute = (hostId: string) => f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const selectedRoute = await describeRoute(target.hostId);
    const jumpRoute = await describeRoute(jump.hostId);
    const targetBinding = { hostId: target.hostId, routeRevision: selectedRoute.routeRevision };
    const jumpBinding = { hostId: jump.hostId, routeRevision: jumpRoute.routeRevision, expectedRevision: jumpRoute.revision };
    const createGroup = (name: string, expectedVersion: string) => f.desktop<{ version: string; groups: { groupId: string; name: string }[] }>(organize, { expectedVersion, operation: { type: "group.create", name, parentId: null } });
    const { version: initial } = await createGroup("visible group", "0");
    const { version: withGroup, groups } = await createGroup("hidden group", initial);
    const visibleId = groups.find(({ name }) => name === "visible group")!.groupId;
    const hiddenId = groups.find(({ name }) => name === "hidden group")!.groupId;
    const place = (hostId: string, groupId: string, expectedVersion: string) => f.desktop<{ version: string }>(organize, { expectedVersion, operation: { type: "hosts.move", hostIds: [hostId], groupId } });
    const placedTarget = await place(target.hostId, visibleId, withGroup);
    const placedHidden = await place(hidden.hostId, hiddenId, placedTarget.version);

    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "host mutation fixture" });
    let session = entry === "mcp" ? await openRecoverableMcpSession(f.mcpEndpoint(), token) : undefined;
    const invoke = async (id: string, args: object = {}): Promise<CapabilityResult<unknown>> => {
      if (entry === "cli") return f.cli(id, args);
      const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: args }, session!.handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const capabilities = [configure, copy, remove, organize];
    for (const id of capabilities) {
      expect(await invoke(id), id).toMatchObject(closed);
      await f.allow(id);
    }
    if (entry === "cli") {
      expect((await f.cliTools()).map(({ name }) => name)).toEqual(expect.arrayContaining(capabilities));
    } else {
      const discovered = await f.mcp(token, "tools/list", {}, session!.handle);
      expect(discovered.tools).toEqual(expect.arrayContaining(capabilities.map((id) => expect.objectContaining({ name: id.replaceAll(".", "_"), inputSchema: expect.objectContaining({ type: "object" }) }))));
    }
    const secret = `synthetic-rotation-${randomUUID()}`;
    const edit = {
      ...target.profile,
      ...targetBinding,
      expectedRevision: target.revision,
      name: "revised target",
      intentKey: randomUUID(),
      credentials: [{ purpose: "password", action: "replace", value: secret }],
    };
    await f.chooseHosts([target.hostId]);
    expect(await invoke(configure, edit)).toMatchObject(denied);
    await f.chooseHosts([target.hostId, jump.hostId]);
    expect(await invoke(configure, { ...edit, port: hidden.server.port })).toMatchObject(denied);
    expect(await invoke(configure, { ...edit, credentials: [{ purpose: "identityFile", action: "replace", value: "/synthetic-fixture" }] })).toMatchObject(denied);
    expect(await invoke(configure, { ...edit, routeRevision: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });

    const pin = { expectedVersion: placedHidden.version, operation: { type: "hosts.pin", hostIds: [target.hostId], pinned: true }, bindings: [targetBinding], intentKey: randomUUID() };
    expect(await invoke(organize, { ...pin, operation: { type: "hosts.move", hostIds: [target.hostId], groupId: hiddenId } })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const scopedPin = { ...pin, intentKey: randomUUID() };
    const validPin = await invoke(organize, scopedPin);
    expect(validPin).toEqual({ ok: true, data: { version: expect.any(String) } });
    expect(await invoke(organize, scopedPin)).toEqual(validPin);
    expect(await invoke(organize, { ...scopedPin, operation: { type: "sort.set", sort: "manual" } })).toMatchObject(denied);
    const version = (reply: CapabilityResult<unknown>) => z.object({ version: z.string() }).parse(data(reply)).version;
    const jumpDirectoryBinding = { hostId: jump.hostId, routeRevision: jumpRoute.routeRevision };
    const moved = await invoke(organize, {
      expectedVersion: version(validPin),
      operation: { type: "hosts.move", hostIds: [jump.hostId], groupId: visibleId },
      bindings: [jumpDirectoryBinding],
      intentKey: randomUUID(),
    });
    const order = {
      expectedVersion: version(moved),
      operation: { type: "hosts.reorder", hostIds: [target.hostId, jump.hostId], groupId: visibleId },
      bindings: [targetBinding, jumpDirectoryBinding],
      intentKey: randomUUID(),
    };
    expect(await invoke(organize, order)).toEqual({ ok: true, data: { version: expect.any(String) } });
    const directory = await f.desktop<{ hosts: { hostId: string; pinned: boolean; groupId: string }[] }>("ssh.hosts.directory");
    expect(directory.hosts.find(({ hostId }) => hostId === target.hostId)).toMatchObject({ pinned: true, groupId: visibleId });
    expect(directory.hosts.find(({ hostId }) => hostId === jump.hostId)).toMatchObject({ groupId: visibleId });
    expect(directory.hosts.find(({ hostId }) => hostId === hidden.hostId)).toMatchObject({ pinned: false, groupId: hiddenId });

    const [firstEdit, repeatedEdit] = await Promise.all([invoke(configure, edit), invoke(configure, edit)]);
    expect(repeatedEdit).toEqual(firstEdit);
    const current = await describeRoute(target.hostId);
    expect(current).toMatchObject({ name: edit.name });
    expect(firstEdit).toEqual({ ok: true, data: { hostId: target.hostId, revision: current.revision } });
    expect(await invoke(configure, { ...edit, credentials: [{ purpose: "password", action: "replace", value: "other-synthetic-secret" }] })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(await invoke(configure, { ...edit, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });

    const copyRequest = { ...jumpBinding, name: "new independent host", intentKey: randomUUID() };
    const [copyResult, retryCopy] = await Promise.all([invoke(copy, copyRequest), invoke(copy, copyRequest)]);
    expect(retryCopy).toEqual(copyResult);
    const copied = z.object({ hostId: z.string(), revision: z.string() }).parse(data(copyResult));
    expect(copyResult).toEqual({ ok: true, data: copied });
    expect(copied.hostId).not.toBe(jump.hostId);
    const copiedRoute = await describeRoute(copied.hostId);
    const removingCopy = { hostId: copied.hostId, routeRevision: copiedRoute.routeRevision, expectedRevision: copied.revision, intentKey: randomUUID() };
    expect(await invoke(remove, removingCopy)).toMatchObject(denied);
    expect(await invoke(remove, { ...jumpBinding, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const workbench = await f.desktop<{ id: string; configured: boolean }[]>("ssh.hosts.list");
    expect(workbench.find(({ id }) => id === copied.hostId)?.configured).toBe(false);
    await f.chooseHosts([target.hostId, jump.hostId, copied.hostId]);
    expect(await invoke(remove, removingCopy)).toEqual({ ok: true, data: { ok: true } });
    expect(await invoke(remove, removingCopy)).toEqual({ ok: true, data: { ok: true } });

    for (const [id, request] of [
      [configure, edit],
      [copy, copyRequest],
      [remove, removingCopy],
      [organize, scopedPin],
    ] as const) {
      await f.allow(id, false);
      expect(await invoke(id, request), id).toMatchObject(closed);
      await f.allow(id, true);
    }
    await f.chooseHosts([target.hostId]);
    expect(await invoke(configure, edit)).toMatchObject(denied);
    expect(await invoke(organize, scopedPin)).toMatchObject(denied);
    expect(await invoke(copy, copyRequest)).toMatchObject(denied);
    expect(await invoke(remove, removingCopy)).toMatchObject(denied);
    await f.chooseHosts([target.hostId, jump.hostId]);
    const receipts = await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8");
    expect(receipts).not.toContain(secret);
    expect(receipts).not.toContain("authState");
    expect(receipts).not.toContain("configured");
    await f.restart();
    if (session) session = await openRecoverableMcpSession(f.mcpEndpoint(), token, session.recovery);
    if (entry === "cli") {
      expect(await invoke(configure, edit)).toEqual(firstEdit);
      expect(await invoke(copy, copyRequest)).toEqual(copyResult);
    } else {
      expect(await invoke(configure, edit)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
      expect(await invoke(copy, copyRequest)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    }
    expect((await describeRoute(target.hostId)).revision).toBe(current.revision);
    expect((await f.desktop<{ id: string }[]>("ssh.hosts.list")).some(({ id }) => id === copied.hostId)).toBe(false);
    for (const host of [target, jump, hidden]) expect(host.server.conns).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("the legacy policy defaults to no SSH access and resource changes share an atomic policy revision", async () => {
  const f = await fixture();
  try {
    const access = () => f.desktop<{ toolAccess: { revision: number; choices: Record<string, boolean>; resources?: { "ssh.hosts": string[] } } }>("gateway.get").then(({ toolAccess }) => toolAccess);
    expect(await access()).not.toHaveProperty("resources");
    const { hostId } = await f.host("resource revision fixture");
    const current = await access();
    const resources = { "ssh.hosts": [] };
    const changes = [{ capability: hostGet, exposed: true }];
    const preview = await f.desktop<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { changes, resources, expectedRevision: current.revision });
    const token = f.engine.rendererToken;
    const saved = { changes, resources, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision };
    const changeAgain = { ...saved, resources: { "ssh.hosts": [hostId] }, changes: [{ capability: probeGet, exposed: true }] };
    const outcomes = await Promise.all([f.call(token, "gateway.policy.update", saved), f.call(token, "gateway.policy.update", changeAgain)]);
    expect(outcomes.filter((reply) => reply.ok)).toHaveLength(1);
    expect(outcomes.find((reply) => !reply.ok)).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const committed = await access();
    expect(committed.revision).toBe(current.revision + 1);
    const granted = committed.resources?.["ssh.hosts"].includes(hostId);
    expect(committed.choices[hostGet]).toBe(!granted);
    expect(await f.call(token, "gateway.policy.preview", { resources: { "ssh.hosts": [`host-owned-${"e".repeat(32)}`] } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    await f.allow("gateway.get");
    await f.allow("gateway.policy.preview");
    const external = f.engine.cliToken;
    expect(data(await f.call<{ toolAccess: object }>(external, "gateway.get")).toolAccess).not.toHaveProperty("resources");
    expect(await f.call(external, "gateway.policy.preview", { resources })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await f.call(external, "gateway.policy.update", saved)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect((await access()).resources).toEqual(committed.resources);
  } finally {
    await f.close();
  }
});

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
    await f.chooseHosts([target.hostId]);
    expect(await f.cli(hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.chooseHosts([jump.hostId, target.hostId]);
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
      expect(await f.call(cliToken, hostGet, { hostId: `host-owned-${"a".repeat(32)}` })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
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
    expect(await f.mcp(a.token, "tools/call", { name: "ssh_resources_connection_get", arguments: key })).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
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
    expect(await f.call(a.token, trustDecide, { ...decision(refusedPrompt), accept: false })).toMatchObject({ ok: true, data: { applied: true } });
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

test.each(["cli", "mcp"] as const)("%s reads current SSH connection, known host and audit metadata within the authorized route", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const statuses = "ssh.connections.status";
  const keys = "ssh.knownHosts.list";
  const audit = "ssh.audit.list";
  const tools = [statuses, keys, audit];
  const notGranted = { ok: false, error: { code: "PERMISSION_DENIED" } };
  try {
    const jump = await f.host("metadata jump");
    const target = await f.host("metadata target", [jump.hostId]);
    const { hostId } = target;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "metadata fixture" });
    const session = await openMcpSession(f.mcpEndpoint(), token);
    const otherSession = await openMcpSession(f.mcpEndpoint(), token);
    const mcp = async (id: string, input: object, handle: string) => {
      const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: input }, handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const invoke = (id: string, input = {}) => (entry === "cli" ? f.cli(id, input) : mcp(id, input, session));
    const names = tools.map((name) => (entry === "cli" ? name : name.replaceAll(".", "_")));
    const discover = async () => (entry === "cli" ? await f.cliTools() : z.array(z.object({ name: z.string() })).parse((await f.mcp(token, "tools/list", {}, session)).tools)).map(({ name }) => name);

    expect((await discover()).filter((name) => names.includes(name))).toEqual([]);
    for (const tool of tools) {
      expect(await invoke(tool), tool).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await f.allow(tool);
    }
    expect(await discover()).toEqual(expect.arrayContaining(names));
    await f.chooseHosts([]);
    for (const tool of tools) expect(await invoke(tool), tool).toMatchObject(notGranted);
    await f.chooseHosts([hostId, jump.hostId]);

    for (const tool of [probeStart, trustDecide]) await f.allow(tool);
    const binding = { hostId, routeRevision };
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke(probeStart, { ...binding, intentKey: randomUUID() })));
    const waitForHop = (hop: number) =>
      vi.waitFor(async () => {
        const records = z.array(PublicProbeStatus).parse(data(await invoke(statuses)));
        const record = records.find((value) => value.attemptId === attemptId);
        if (record?.state !== "waiting" || record.prompt.hop !== hop) throw new Error("Waiting for SSH fingerprint");
        return record;
      });
    const first = await waitForHop(0);
    expect(first.prompt).toMatchObject({ serverHostId: jump.hostId, fingerprint: jump.server.fingerprint });
    expect(data(await mcp(statuses, {}, otherSession))).toEqual([]);
    expect(await f.desktop(statuses)).toEqual([]);
    expect(data(await invoke(trustDecide, decision(first)))).toEqual({ applied: true });
    const second = await waitForHop(1);
    expect(second.prompt).toMatchObject({ serverHostId: hostId, fingerprint: target.server.fingerprint });
    expect(data(await invoke(trustDecide, decision(second)))).toEqual({ applied: true });
    const auditEntry = { hostId, at: expect.any(String), action: "connect", result: "ok", detail: "" };
    await vi.waitFor(async () => expect(data(await invoke(audit, { hostId }))).toEqual([auditEntry]));
    expect(data(await mcp(audit, { hostId }, otherSession))).toEqual([]);
    expect(await f.desktop(audit, { hostId })).toEqual([]);

    await f.desktop("ssh.connect", { hostId, background: true });
    for (const hop of [0, 1]) {
      const { prompt } = await vi.waitFor(async () => {
        const records = await f.desktop<ConnectionStatus[]>(statuses);
        const pending = records.find((value) => value.hostId === hostId);
        if (pending?.state !== "waiting" || pending.prompt.hop !== hop) throw new Error("Waiting for desktop trust");
        return pending;
      });
      const { attemptId, promptId } = prompt;
      await f.desktop("ssh.hostKey.decide", { attemptId, hop, promptId, accept: true, remember: true });
    }
    await vi.waitFor(async () => expect(await f.desktop(statuses)).toMatchObject([{ state: "connected" }]));
    const credentials = [vi.spyOn(ModuleCredentials.prototype, "list"), vi.spyOn(ModuleCredentials.prototype, "use")];
    try {
      const counts = [jump.server.conns.length, target.server.conns.length];
      const knownHosts = data(await invoke(keys));
      expect(knownHosts).toEqual(
        expect.arrayContaining([expect.objectContaining({ port: jump.server.port, fingerprint: jump.server.fingerprint }), expect.objectContaining({ port: target.server.port, fingerprint: target.server.fingerprint })]),
      );
      expect(data(await invoke(statuses))).toEqual([{ ...binding, attemptId, state: "verified" }]);
      expect(data(await invoke(audit))).toEqual([auditEntry]);
      await f.chooseHosts([hostId]);
      expect(data(await invoke(keys))).toEqual([]);
      expect(data(await invoke(statuses))).toEqual([]);
      expect(data(await invoke(audit))).toEqual([]);
      expect(await invoke(audit, { hostId })).toMatchObject(notGranted);
      expect([jump.server.conns.length, target.server.conns.length]).toEqual(counts);
      for (const spy of credentials) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of credentials) spy.mockRestore();
    }
    await f.chooseHosts([hostId, jump.hostId]);
    expect(data(await invoke(statuses))).toEqual([{ ...binding, attemptId, state: "verified" }]);
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised metadata jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(data(await invoke(statuses))).toEqual([]);
    expect(data(await invoke(audit, { hostId }))).toEqual([]);
    for (const tool of tools) {
      await f.allow(tool, false);
      expect(await invoke(tool), tool).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    }
    expect((await discover()).filter((name) => names.includes(name))).toEqual([]);
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
    const audit = "ssh.audit.list";
    await f.allow(audit);
    const auditEntry = { at: expect.any(String), hostId, action: "exec", result: "failed", detail: "" };
    expect(data(await f.cli(audit, { limit: 1 }))).toEqual([auditEntry]);
    expect(await f.cli(execCancel, { jobId, hostId, routeRevision })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(execCancel);
    expect(await f.cli(execCancel, { execId: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await f.cli(execCancel, { jobId, hostId, routeRevision })).toEqual({ ok: true, data: { cancelled: false } });
    await f.restart();
    expect(data(await f.cli(audit, { limit: 1 }))).toEqual([auditEntry]);
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

test("HTTP MCP isolates SSH owners under one token and never replays a job after reconnect or restart", { timeout: 45_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  const notFound = { isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] };
  try {
    const { hostId, server } = await f.host("MCP job fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        return undefined;
      },
      onInteractiveExec: (_command, channel, session) => {
        channel.write("hello");
        session.on("signal", (ack) => {
          ack?.();
          channel.exit(130);
          channel.end();
        });
        return true;
      },
    });
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    await allowJobs(f);
    await f.allow(probeList);
    await f.allow(execCancel);
    const a = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "jobs MCP A" });
    const b = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "independent MCP token" });
    const original = await openRecoverableMcpSession(f.mcpEndpoint(), a.token);
    const sessionA = original.handle;
    const archive = path.join(path.dirname(f.engine.vault.root), "mcp-recovery-fixture.zip");
    await f.desktop("vault.exportPackage", { dest: archive });
    expect((await readFile(archive)).includes("mcp-recovery.json")).toBe(false);
    await f.desktop("git.init");
    const git = await f.desktop<{ files: { path: string }[] }>("git.status");
    expect(git.files.some(({ path }) => path.includes("mcp-recovery.json"))).toBe(false);
    const sessionB = await openMcpSession(f.mcpEndpoint(), a.token);
    const independent = await openMcpSession(f.mcpEndpoint(), b.token);
    const rpc = (token: string, handle: string, method: string, params = {}) => f.mcp(token, method, params, handle);
    const tool = (token: string, handle: string) => (capability: string, input: unknown) => rpc(token, handle, "tools/call", { name: capability.replaceAll(".", "_"), arguments: input });
    const invokeA = tool(a.token, sessionA);
    const invokeB = tool(a.token, sessionB);
    const invokeIndependent = tool(b.token, independent);
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "fixture-session-output", intentKey: randomUUID() };
    expect(await rpc(a.token, sessionA, "tools/list")).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "ssh_jobs_prepare" })]) });
    const prepared = await invokeA(jobPrepare, prepare);
    expect(prepared).toMatchObject({ structuredContent: { data: { jobId: expect.any(String) } } });
    expect(await invokeA(jobPrepare, prepare)).toEqual(prepared);
    const { jobId } = prepared.structuredContent.data as { jobId: string };
    const cancellation = { jobId, hostId, routeRevision };
    const status = (state: JobStatus["state"], targetJob = jobId) =>
      vi.waitFor(
        async () => {
          const reply = await invokeA(jobGet, { jobId: targetJob });
          expect(reply).toMatchObject({ structuredContent: { data: { state } } });
          return reply.structuredContent.data as JobStatus;
        },
        { timeout: 9000 },
      );
    const key = await vi.waitFor(async () => {
      const reply = await invokeA(jobGet, { jobId });
      const current = reply.structuredContent?.data as JobStatus;
      if (!current || !("attemptId" in current) || !current.attemptId) throw new Error("SSH job has no attempt");
      return { hostId, attemptId: current.attemptId };
    });
    const waiting = await vi.waitFor(async () => {
      const reply = await invokeA(probeGet, key);
      expect(reply).toMatchObject({ structuredContent: { data: { state: "waiting" } } });
      return reply.structuredContent.data as Waiting;
    });

    expect(await f.call(a.token, jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.cli(jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    for (const invoke of [invokeB, invokeIndependent]) {
      expect(await invoke(probeList, {})).toMatchObject({ structuredContent: { data: [] } });
      expect(await invoke(probeGet, key)).toMatchObject(notFound);
      expect(await invoke(trustDecide, decision(waiting))).toMatchObject(notFound);
      expect(await invoke(jobGet, { jobId })).toMatchObject(notFound);
      expect(await invoke(jobOutput, { jobId, stream: "stdout" })).toMatchObject(notFound);
      expect(await invoke(jobCancel, { jobId })).toMatchObject(notFound);
      expect(await invoke(execCancel, cancellation)).toMatchObject(notFound);
    }
    expect((await mcpRequest(f.mcpEndpoint(), b.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);

    // Drop the actual MCP response stream and resume with the original transport handle.
    const stream = await mcpRequest(f.mcpEndpoint(), a.token, undefined, sessionA, { method: "GET" });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    await stream.body!.cancel();
    expect(await invokeA(probeGet, key)).toMatchObject({ structuredContent: { data: waiting } });
    expect(await invokeA(trustDecide, decision(waiting))).toMatchObject({ structuredContent: { data: { applied: true } } });
    expect(await invokeA(trustDecide, decision(waiting))).toMatchObject(notFound);
    const ready = await status("ready");
    if (!("sessionId" in ready) || !ready.sessionId) throw new Error("SSH job has no connection");
    const start = { jobId, hostId, routeRevision, sessionId: ready.sessionId };
    expect(await invokeB(jobStart, start)).toMatchObject(notFound);
    const held = await invokeA(jobPrepare, { ...prepare, intentKey: randomUUID() });
    const heldId = held.structuredContent.data.jobId as string;
    const heldKey = await vi.waitFor(async () => {
      const reply = await invokeA(jobGet, { jobId: heldId });
      const current = reply.structuredContent?.data as JobStatus;
      if (!current || !("attemptId" in current) || !current.attemptId) throw new Error("SSH job has no attempt");
      return { hostId, attemptId: current.attemptId };
    });
    const heldProbe = await vi.waitFor(async () => {
      const reply = await invokeA(probeGet, heldKey);
      expect(reply).toMatchObject({ structuredContent: { data: { state: "waiting" } } });
      return reply.structuredContent.data as Waiting;
    });
    expect(await invokeA(trustDecide, decision(heldProbe))).toMatchObject({ structuredContent: { data: { applied: true } } });
    const heldReady = await status("ready", heldId);
    if (!("sessionId" in heldReady) || !heldReady.sessionId) throw new Error("SSH job has no connection");
    expect(await invokeA(jobStart, { ...start, sessionId: heldReady.sessionId })).toMatchObject(notFound);
    await f.allow(jobStart, false);
    expect(await invokeA(jobStart, start)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("CAPABILITY_NOT_EXPOSED") }] });
    expect(commands).toEqual([]);
    await f.allow(jobStart);
    for (const reply of await Promise.all([invokeA(jobStart, start), invokeA(jobStart, start)])) {
      expect(reply).toMatchObject({ structuredContent: { data: { jobId } } });
    }
    await status("running");
    const read = () => invokeA(jobOutput, { jobId, stream: "stdout", cursor: 0 });
    const page = await vi.waitFor(async () => {
      const reply = await read();
      expect(reply).toMatchObject({ structuredContent: { data: { text: "hello", nextCursor: 5 } } });
      return reply.structuredContent;
    });
    await f.chooseHosts([]);
    const resourceDenied = { isError: true, content: [{ text: expect.stringContaining("PERMISSION_DENIED") }] };
    expect(await invokeA(probeGet, key)).toMatchObject(resourceDenied);
    expect(await invokeA(probeList, {})).toMatchObject(resourceDenied);
    expect(await read()).toMatchObject(resourceDenied);
    expect(await invokeA(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeA(jobPrepare, prepare)).toMatchObject(resourceDenied);
    expect(await invokeA(jobCancel, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeA(execCancel, cancellation)).toMatchObject(resourceDenied);
    expect(commands).toEqual([prepare.command]);
    await f.chooseHosts([hostId]);
    const beforeReconnect = await mcpRequest(f.mcpEndpoint(), a.token, undefined, sessionA, { method: "GET" });
    expect(beforeReconnect.status).toBe(200);
    await beforeReconnect.body!.cancel();
    expect((await read()).structuredContent).toEqual(page);
    expect(await invokeA(execCancel, { ...cancellation, routeRevision: "0".repeat(64) })).toMatchObject(notFound);
    expect(await invokeA(execCancel, cancellation)).toMatchObject({ structuredContent: { data: { cancelled: true } } });
    expect(await invokeA(execCancel, cancellation)).toMatchObject({ structuredContent: { data: { cancelled: false } } });
    expect(await status("exited")).toMatchObject({ exitCode: 130, stopRequested: "cancel" });
    expect(await status("ready", heldId)).toMatchObject({ stopRequested: null });
    expect(await invokeA(jobCancel, { jobId: heldId })).toMatchObject({ structuredContent: { data: { requested: true } } });
    await status("cancelled", heldId);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    expect(await invokeA(jobPrepare, prepare)).toEqual(prepared);
    expect(commands).toEqual([prepare.command]);

    expect((await mcpRequest(f.mcpEndpoint(), b.token, undefined, independent, { method: "DELETE" })).status).toBe(200);
    expect((await mcpRequest(f.mcpEndpoint(), b.token, mcpRpc("tools/list"), independent)).status).toBe(404);
    const anotherVault = await fixture();
    try {
      await anotherVault.restart(() =>
        Promise.all([
          ...["gateways.json", "vault.json"].map((file) => copyFile(path.join(f.engine.vault.stateDir, file), path.join(anotherVault.engine.vault.stateDir, file))),
          copyFile(path.join(f.engine.vault.runtimeDir, "mcp-recovery.json"), path.join(anotherVault.engine.vault.runtimeDir, "mcp-recovery.json")),
        ]),
      );
      expect(anotherVault.engine.vault.id).toBe(f.engine.vault.id);
      expect((await mcpRequest(anotherVault.mcpEndpoint(), a.token, recoveryInitialize(original.recovery))).status).toBe(403);
      const otherHandle = await openMcpSession(anotherVault.mcpEndpoint(), a.token);
      expect(otherHandle).not.toBe(sessionA);
      expect((await mcpRequest(anotherVault.mcpEndpoint(), a.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);
    } finally {
      await anotherVault.close();
    }

    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);
    const afterRestart = await openMcpSession(f.mcpEndpoint(), a.token);
    const invokeAfterRestart = tool(a.token, afterRestart);
    expect(await invokeAfterRestart(jobGet, { jobId })).toMatchObject(notFound);
    expect(await invokeAfterRestart(jobStart, start)).toMatchObject(notFound);
    expect(await invokeAfterRestart(jobCancel, { jobId })).toMatchObject(notFound);
    const restored = await openRecoverableMcpSession(f.mcpEndpoint(), a.token, original.recovery);
    const invokeRestored = tool(a.token, restored.handle);
    expect(await invokeRestored(jobGet, { jobId })).toMatchObject({ structuredContent: { data: { jobId, state: "exited", exitCode: 130 } } });
    expect(await invokeRestored(jobOutput, { jobId, stream: "stdout", cursor: 0 })).toMatchObject({ structuredContent: { data: { text: "", nextCursor: 5, skippedBytes: 5, truncated: true } } });
    await f.chooseHosts([]);
    expect(await invokeRestored(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeRestored(jobOutput, { jobId, stream: "stdout", cursor: 0 })).toMatchObject(resourceDenied);
    await f.chooseHosts([hostId]);
    expect(await invokeRestored(jobStart, start)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('"outcome":"unknown"') }] });
    expect(commands).toEqual([prepare.command]);
    await f.desktop("gateway.mcp.update", { enabled: false, transport: "http" });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), afterRestart)).status).toBe(404);
    await f.desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), afterRestart)).status).toBe(404);
    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, recoveryInitialize(restored.recovery))).status).toBe(403);
    const beforeRevoke = await openRecoverableMcpSession(f.mcpEndpoint(), a.token);
    const revokedStream = await mcpRequest(f.mcpEndpoint(), a.token, undefined, beforeRevoke.handle, { method: "GET" });
    expect(revokedStream.status).toBe(200);
    await f.desktop("gateway.tokens.revoke", { id: a.id });
    expect(await revokedStream.body!.getReader().read()).toMatchObject({ done: true });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), beforeRevoke.handle)).status).toBe(401);
    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, recoveryInitialize(beforeRevoke.recovery))).status).toBe(401);
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
