import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { FORWARD_BIND, type ForwardRule, type ForwardRun, type SaveForward } from "../src/shared/forwarding.js";
import type { ConnectionStatus, HostKeyPrompt } from "../src/shared/trust.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

async function api(vaultPath: string, desktopUserData: string, create: boolean) {
  const engine = await boot({ vaultPath, desktopUserData, create });
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  return { engine, client };
}

async function bind(server: net.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, FORWARD_BIND, () => {
      server.removeListener("error", reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

const close = (server: net.Server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
const save = (client: EngineClient, draft: SaveForward) => client.call<ForwardRule>("ssh.forwarding.rules.save", draft, { write: true });
const rev = (rule: ForwardRule) => ({ id: rule.id, expectedRevision: rule.revision });
const command = (client: EngineClient, action: "start" | "stop" | "resume", rule: ForwardRule) => client.call<ForwardRun>(`ssh.forwarding.runs.${action}`, rev(rule), { write: true });
const findRun = async (client: EngineClient, rule: ForwardRule) => (await client.call<ForwardRun[]>("ssh.forwarding.runs.list")).find(({ ruleId }) => rule.id === ruleId);
const state = (client: EngineClient, rule: ForwardRule, wanted: ForwardRun["state"]) =>
  vi.waitFor(
    async () => {
      const run = await findRun(client, rule);
      expect(run?.state).toBe(wanted);
      return run!;
    },
    { timeout: 5000, interval: 20 },
  );

async function freePort() {
  const server = net.createServer();
  const port = await bind(server);
  await close(server);
  return port;
}

function read(socket: net.Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const onClose = () => {
      cleanup();
      reject(new Error("loopback socket closed during read"));
    };
    const onAvailable = () => {
      const bytes = socket.read(length) as Buffer | null;
      if (bytes) {
        cleanup();
        resolve(bytes);
      }
    };
    const cleanup = () => {
      socket.off("readable", onAvailable);
      socket.off("close", onClose);
    };
    if (socket.destroyed) return onClose();
    socket.on("readable", onAvailable);
    socket.on("close", onClose);
    onAvailable();
  });
}

async function networkFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-forward-network-"));
  const vault = path.join(root, "vault");
  const userData = path.join(root, "data");
  await Promise.all([mkdir(vault), mkdir(userData)]);
  const { engine, client } = await api(vault, userData, true);
  const sockets = new Set<net.Socket>();
  const servers: net.Server[] = [];
  const ssh: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  function track(socket: net.Socket) {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    return socket;
  }
  return {
    client,
    engine,
    async host(options: FakeSshOptions = {}, jumpHostIds: string[] = []) {
      const password = `pw-fixture-${ssh.length}`;
      const server = await startFakeSsh({ ...options, password });
      ssh.push(server);
      const profile = { name: `loopback ${ssh.length}`, host: FORWARD_BIND, port: server.port, user: "fixture", jumpHostIds, authKind: "password", connectTimeoutSec: 3 };
      const saved = await client.call<{ hostId: string; revision: string }>(
        "ssh.hosts.configure",
        {
          ...profile,
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: password }],
        },
        { write: true },
      );
      return { server, ...saved, profile };
    },
    async echo() {
      const server = net.createServer((socket) => track(socket).pipe(socket));
      const port = await bind(server);
      servers.push(server);
      return { host: FORWARD_BIND, port };
    },
    async socket(port: number) {
      const socket = track(net.createConnection({ host: FORWARD_BIND, port, timeout: 4_000 }));
      socket.on("timeout", () => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      return socket;
    },
    async heldPort() {
      const server = net.createServer((socket) => track(socket).destroy());
      const port = await bind(server);
      servers.push(server);
      return port;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await engine.shutdown();
      await Promise.all([...servers.map(close), ...ssh.map((server) => server.close())]);
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

async function trust(client: EngineClient, prompt: HostKeyPrompt, accept = true) {
  const { attemptId, hop, promptId } = prompt;
  expect(await client.call("ssh.hostKey.decide", { attemptId, hop, promptId, accept, remember: true }, { write: true })).toEqual({ applied: true });
}

async function echo(socket: net.Socket, bytes: Buffer) {
  socket.write(bytes);
  expect(await read(socket, bytes.length)).toEqual(bytes);
}

test("four forwarding configurations persist by revision without opening a socket", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-forward-config-"));
  const vault = path.join(root, "vault");
  const userData = path.join(root, "data");
  let engine: RunningEngine | undefined;
  try {
    await Promise.all([mkdir(vault), mkdir(userData)]);
    const live = await api(vault, userData, true);
    engine = live.engine;
    const host = await live.client.call<{ id: string }>("ssh.hosts.save", { name: "fixture", host: FORWARD_BIND, user: "fixture", auth: { kind: "agent" } }, { write: true });
    const probe = net.createServer();
    const listenPort = await bind(probe);
    await close(probe);
    const shared = { hostId: host.id, listenPort, resume: true };
    const target = { host: FORWARD_BIND, port: 1234 };
    const drafts: SaveForward[] = [
      { ...shared, name: "Local", mode: "local", target },
      { ...shared, name: "Remote", mode: "remote", target },
      { ...shared, name: "SOCKS5", mode: "socks5" },
      { ...shared, name: "HTTP CONNECT", mode: "http-connect" },
    ];
    const rules = [];
    for (const draft of drafts) rules.push(await save(live.client, draft));
    expect(await bind(probe, listenPort)).toBe(listenPort);
    await close(probe);
    const [local] = rules;
    const previous = { id: local!.id, expectedRevision: local!.revision };
    const modified = await save(live.client, { ...shared, name: "Local edited", mode: "local", target, previous });
    expect(modified).toMatchObject({ id: local!.id, boundTarget: local!.boundTarget, name: "Local edited" });
    expect(modified.revision).not.toBe(local!.revision);
    await expect(save(live.client, { ...shared, mode: "local", name: "stale", target, previous })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    for (const invalid of [
      { ...drafts[0], listenPort: 65536 },
      { ...drafts[0], listenHost: "0.0.0.0" },
      { ...drafts[1], relay: "shell" },
      { ...drafts[2], target },
      { ...drafts[3], relay: "shell" },
    ]) {
      await expect(live.client.call("ssh.forwarding.rules.save", invalid, { write: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(live.client.call("ssh.hosts.delete", { id: host.id }, { write: true })).rejects.toThrow(/转发规则引用/);
    const cli = new EngineClient({ ...live.client.endpoint, token: engine.cliToken });
    await expect(cli.call("ssh.forwarding.rules.list")).rejects.toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    expect(await engine.dispatcher.call("web:synthetic", { capability: "ssh.forwarding.rules.list", requestId: "forwarding-test", input: {} })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await engine.shutdown();
    const reopened = await api(vault, userData, false);
    engine = reopened.engine;
    expect(await reopened.client.call<ForwardRule[]>("ssh.forwarding.rules.list")).toEqual(expect.arrayContaining([modified, ...rules.slice(1)]));
    expect(await bind(probe, listenPort)).toBe(listenPort);
    await close(probe);
    await reopened.client.call("ssh.forwarding.rules.delete", { id: modified.id, expectedRevision: modified.revision }, { write: true });
    expect(await reopened.client.call<ForwardRule[]>("ssh.forwarding.rules.list")).toHaveLength(3);
  } finally {
    await engine?.shutdown();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("all four modes forward real TCP, publish after acknowledgement and share one dedicated connection", { timeout: 35_000 }, async () => {
  const f = await networkFixture();
  let releaseBind!: () => void;
  const bindGate = new Promise<void>((resolve) => {
    releaseBind = resolve;
  });
  let requested = false;
  try {
    const { client } = f;
    const { hostId, server } = await f.host({
      remoteForwarding: true,
      waitRemoteBind: () => {
        requested = true;
        return bindGate;
      },
    });
    const destination = await f.echo();
    const local = await save(client, { name: "Local", mode: "local", hostId, listenPort: await freePort(), target: destination, resume: true });
    const remote = await save(client, { name: "Remote", mode: "remote", hostId, listenPort: await freePort(), target: destination, resume: false });
    const socks = await save(client, { name: "SOCKS5", mode: "socks5", hostId, listenPort: await freePort(), resume: false });
    const http = await save(client, { name: "HTTP CONNECT", mode: "http-connect", hostId, listenPort: await freePort(), resume: false });
    const started = await command(client, "start", local);
    expect(started.listener).toBeUndefined();
    const pending = await state(client, local, "waiting");
    expect(pending.listener).toBeUndefined();
    await expect(f.socket(local.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect((await command(client, "start", local)).id).toBe(started.id);
    const socksStart = await command(client, "start", socks);
    const sharedPrompt = await state(client, socks, "waiting");
    expect(sharedPrompt.id).toBe(socksStart.id);
    expect(sharedPrompt.prompt).toEqual(pending.prompt);
    await trust(client, pending.prompt!);
    const first = await state(client, local, "running");
    await state(client, socks, "running");
    expect((await command(client, "start", local)).id).toBe(first.id);

    await command(client, "start", remote);
    await vi.waitFor(() => expect(requested).toBe(true));
    expect(await findRun(client, remote)).toMatchObject({ state: "starting" });
    expect((await findRun(client, remote))?.listener).toBeUndefined();
    (await f.socket(remote.listenPort)).destroy();
    releaseBind();
    expect(await state(client, remote, "running")).toMatchObject({ listener: { device: "remote", host: FORWARD_BIND, port: remote.listenPort } });
    await command(client, "start", http);
    await state(client, http, "running");

    const localSocket = await f.socket(local.listenPort);
    const remoteSocket = await f.socket(remote.listenPort);
    const socksSocket = await f.socket(socks.listenPort);
    const httpSocket = await f.socket(http.listenPort);
    const payload = Buffer.from("fixture TCP bytes");
    await echo(localSocket, payload);
    await echo(remoteSocket, payload);
    socksSocket.write(Buffer.from([5, 1, 0]));
    expect(await read(socksSocket, 2)).toEqual(Buffer.from([5, 0]));
    socksSocket.write(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, destination.port >>> 8, destination.port & 255]));
    expect((await read(socksSocket, 10))[1]).toBe(0);
    await echo(socksSocket, payload);
    httpSocket.write(Buffer.concat([Buffer.from(`CONNECT ${FORWARD_BIND}:${destination.port} HTTP/1.1\r\nHost: ${FORWARD_BIND}:${destination.port}\r\n\r\n`), payload]));
    const response = Buffer.from("HTTP/1.1 200 Connection Established\r\n\r\n");
    expect(await read(httpSocket, response.length)).toEqual(response);
    expect(await read(httpSocket, payload.length)).toEqual(payload);

    expect(server.conns).toHaveLength(1);
    expect(await client.call<ConnectionStatus[]>("ssh.connections.status")).toEqual([]);
    for (const rule of [local, remote, socks, http]) {
      expect(await findRun(client, rule)).toMatchObject({ connection: { id: first.connection!.id, kind: "dedicated", holders: 4 }, active: 1, accepted: 1, uploaded: payload.length, downloaded: payload.length });
    }

    expect(await command(client, "stop", local)).toMatchObject({ state: "stopped", active: 0 });
    await expect(f.socket(local.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(await findRun(client, socks)).toMatchObject({ connection: { id: first.connection!.id, holders: 3 } });
    await echo(socksSocket, payload);
    expect(await command(client, "stop", remote)).toMatchObject({ state: "stopped" });
    await expect(f.socket(remote.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    const edited = await save(client, { mode: "socks5", name: "SOCKS5 changed", hostId, resume: false, listenPort: await freePort(), previous: rev(socks) });
    await expect(f.socket(socks.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(f.socket(edited.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(command(client, "start", socks)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(server.closed()).toBe(0);
    await client.call("ssh.forwarding.rules.delete", rev(http), { write: true });
    await expect(f.socket(http.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    const restarted = await command(client, "start", local);
    expect(restarted.id).not.toBe(started.id);
    await state(client, local, "running");
    await echo(await f.socket(local.listenPort), payload);
    await command(client, "stop", local);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
  } finally {
    releaseBind();
    await f.close();
  }
});

test("a borrowed SSH connection stays owned by its session through denial, conflict and forward stop", { timeout: 25_000 }, async () => {
  const f = await networkFixture();
  let denyStop = true;
  let denyDirect = false;
  try {
    const { client } = f;
    const host = await f.host({ remoteForwarding: true, denyRemoteStop: () => denyStop, denyDirectTcp: () => denyDirect });
    const target = await f.echo();
    await client.call("ssh.connect", { hostId: host.hostId, background: true }, { write: true });
    await vi.waitFor(async () => {
      const [pending] = await client.call<ConnectionStatus[]>("ssh.connections.status");
      expect(pending?.state).toBe("waiting");
      if (pending?.state === "waiting") await trust(client, pending.prompt);
    });
    await vi.waitFor(async () => expect(await client.call("ssh.connections.status")).toMatchObject([{ state: "connected" }]));
    const options = { hostId: host.hostId, target, resume: false };
    const remote = await save(client, { ...options, name: "Borrowed", mode: "remote", listenPort: await freePort() });
    const occupied = await f.heldPort();
    const conflict = await save(client, { ...options, name: "Conflict", mode: "local", listenPort: occupied });
    const remoteConflict = await save(client, { ...options, name: "Remote denied", mode: "remote", listenPort: occupied });
    await command(client, "start", conflict);
    expect(await state(client, conflict, "failed")).toMatchObject({ message: "本机回环端口已被占用" });
    await command(client, "start", remoteConflict);
    expect((await state(client, remoteConflict, "failed")).message).toContain("远端拒绝监听");
    await command(client, "start", remote);
    expect(await state(client, remote, "running")).toMatchObject({ connection: { kind: "borrowed", holders: 1 } });
    await echo(await f.socket(remote.listenPort), Buffer.from("borrowed connection"));
    await expect(command(client, "stop", remote)).rejects.toBeDefined();
    expect((await state(client, remote, "stop-failed")).message).toContain("未确认远端已释放端口");
    await expect(command(client, "start", remote)).rejects.toBeDefined();
    await expect(client.call("ssh.forwarding.rules.delete", rev(remote), { write: true })).rejects.toBeDefined();
    expect(await client.call<ForwardRule[]>("ssh.forwarding.rules.list")).toContainEqual(remote);
    denyStop = false;
    expect(await command(client, "stop", remote)).toMatchObject({ state: "stopped", connection: { kind: "borrowed", holders: 0 } });
    await expect(f.socket(remote.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(host.server.conns).toHaveLength(1);
    expect(host.server.closed()).toBe(0);
    expect(await client.call("ssh.connections.status")).toMatchObject([{ state: "connected" }]);
    const local = await save(client, { ...options, name: "Direct refused", mode: "local", listenPort: await freePort() });
    denyDirect = true;
    await command(client, "start", local);
    await state(client, local, "running");
    const rejected = await f.socket(local.listenPort);
    await expect(read(rejected, 1)).rejects.toThrow(/closed during read/);
    expect(await findRun(client, local)).toMatchObject({ active: 0, accepted: 0, uploaded: 0, downloaded: 0, lastError: "SSH 拒绝打开 TCP 出口或目的地不可达" });
    await client.call("plugins.setEnabled", { id: "ssh", enabled: false }, { write: true });
    await vi.waitFor(async () => await expect(f.socket(local.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" }));
    await vi.waitFor(() => expect(host.server.closed()).toBe(1));
    await client.call("plugins.setEnabled", { id: "ssh", enabled: true }, { write: true });
    expect(await client.call("ssh.forwarding.runs.list")).toEqual([]);
    await expect(f.socket(local.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  } finally {
    await f.close();
  }
});

test("a jump failure releases the listener, explicit resume opens a fresh route and stop stays stopped", { timeout: 25_000 }, async () => {
  const f = await networkFixture();
  try {
    const { client } = f;
    const jump = await f.host();
    const host = await f.host({}, [jump.hostId]);
    const target = await f.echo();
    const rule = await save(client, { hostId: host.hostId, name: "Bound route", mode: "local", listenPort: await freePort(), target, resume: true });
    await command(client, "start", rule);
    const jumpPrompt = (await state(client, rule, "waiting")).prompt!;
    expect(jumpPrompt).toMatchObject({ hop: 0, server: { id: jump.hostId } });
    await trust(client, jumpPrompt);
    const endPrompt = await vi.waitFor(async () => {
      const prompt = (await findRun(client, rule))?.prompt;
      expect(prompt).toMatchObject({ hop: 1, server: { id: host.hostId } });
      return prompt!;
    });
    await trust(client, endPrompt);
    const running = await state(client, rule, "running");
    await echo(await f.socket(rule.listenPort), Buffer.from("jump tunnel"));
    jump.server.conns[0]!.end();
    expect(await state(client, rule, "interrupted")).toMatchObject({ active: 0 });
    await expect(f.socket(rule.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(command(client, "start", rule)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(jump.server.conns).toHaveLength(1);
    await command(client, "resume", rule);
    const resumed = await state(client, rule, "running");
    expect(resumed.connection?.id).not.toBe(running.connection?.id);
    expect(resumed.id).not.toBe(running.id);
    await echo(await f.socket(rule.listenPort), Buffer.from("resumed route"));
    await command(client, "stop", rule);
    await expect(f.socket(rule.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(command(client, "resume", rule)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(jump.server.conns).toHaveLength(2);

    await client.call("ssh.hosts.configure", { ...host.profile, hostId: host.hostId, expectedRevision: host.revision, user: "changed", credentials: [] }, { write: true });
    await command(client, "start", rule);
    expect((await state(client, rule, "failed")).message).toContain("绑定");
    expect(jump.server.conns).toHaveLength(2);
    await expect(f.socket(rule.listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  } finally {
    await f.close();
  }
});
