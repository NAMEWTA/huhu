import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { defaultVaultPreferences, type UpdateVaultPreferences, type VaultPreferencesSnapshot } from "../src/shared/preferences.js";
import type { FileSession } from "../src/shared/files.js";
import type { WorkspaceRun } from "../src/shared/workspace.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import { startFakeSsh } from "./fake-server.js";

test("SSH default settings are revisioned per Vault and drive the next handshake and transfer queue", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-preferences-"));
  const data = path.join(root, "device");
  await mkdir(data);
  const engines: Awaited<ReturnType<typeof boot>>[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  async function open(name: string, create: boolean) {
    const vaultPath = path.join(root, name);
    if (create) await mkdir(vaultPath);
    const engine = await boot({ vaultPath, desktopUserData: data, moduleCredentialProtection: new TestProtection(data), create });
    engines.push(engine);
    return new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  }
  const get = (client: EngineClient) => client.call<VaultPreferencesSnapshot>("ssh.settings.get");
  const update = (client: EngineClient, expectedRevision: string | null, change: UpdateVaultPreferences["change"]) => client.call<VaultPreferencesSnapshot>("ssh.settings.update", { expectedRevision, change }, { write: true });
  try {
    const client = await open("primary", true);
    expect(await get(client)).toEqual({ revision: null, values: defaultVaultPreferences });
    const connection = { ...defaultVaultPreferences.connection, connectTimeoutSec: 1, keepaliveIntervalSec: 0, keepaliveCountMax: 0, shareConnections: false };
    const saved = await update(client, null, { section: "connection", values: connection });
    const outcomes = await Promise.allSettled([3, 4].map((parallel) => update(client, saved.revision, { section: "transfer", values: { parallel } })));
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    const next = await get(client);
    expect(next.values.connection).toEqual(connection);
    expect(await client.call("ssh.transfers.list")).toMatchObject({ parallel: next.values.transfer.parallel });
    await expect(update(client, next.revision, { section: "transfer", values: { parallel: 0 } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(update(client, next.revision, { section: "connection", values: { ...connection, reconnect: { attempts: 2, intervalSec: 5, maxDelaySec: 1 } } })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as net.AddressInfo).port;
    async function dial(name: string, connectTimeoutSec?: number) {
      const { hostId } = await client.call<{ hostId: string }>(
        "ssh.hosts.configure",
        {
          name,
          host: "127.0.0.1",
          port,
          user: "fixture",
          authKind: "password",
          expectedRevision: null,
          credentials: [{ action: "replace", purpose: "password", value: "fixture-password" }],
          ...(connectTimeoutSec === undefined ? {} : { connectTimeoutSec }),
        },
        { write: true },
      );
      const start = performance.now();
      await expect(client.call("ssh.connect", { hostId }, { write: true })).rejects.toMatchObject({ code: "SSH_TIMEOUT" });
      return performance.now() - start;
    }
    const inherited = await dial("inherits timeout");
    const explicit = await dial("host override", 2);
    expect(inherited).toBeGreaterThanOrEqual(850);
    expect(inherited).toBeLessThan(1800);
    expect(explicit - inherited).toBeGreaterThan(650);

    await engines.pop()!.shutdown();
    expect(await get(await open("primary", false))).toEqual(next);
    expect(await get(await open("other", true))).toEqual({ revision: null, values: defaultVaultPreferences });
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.all(engines.map((engine) => engine.shutdown()));
    await rm(root, { recursive: true, force: true });
  }
}, 12_000);

test("saved auto-reconnect and recording preferences change subsequent transport and capture behavior", { timeout: 16_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-saved-policies-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create: true });
  const server = await startFakeSsh();
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  const write = { write: true };
  try {
    const { hostId } = await client.call<{ hostId: string }>(
      "ssh.hosts.configure",
      {
        name: "saved policy fixture",
        host: "127.0.0.1",
        port: server.port,
        user: "fixture",
        authKind: "password",
        expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      },
      write,
    );
    const live = async () => (await client.call<ConnectionStatus[]>("ssh.connections.status")).find((entry) => entry.hostId === hostId);
    await client.call("ssh.connect", { hostId, background: true }, write);
    await expect.poll(async () => (await live())?.state).toBe("waiting");
    const waiting = await live();
    if (waiting?.state !== "waiting") throw new Error("Missing loopback fingerprint");
    await client.call("ssh.hostKey.decide", { attemptId: waiting.attemptId, hop: 0, promptId: waiting.prompt.promptId, accept: true }, write);
    await expect.poll(async () => (await live())?.state).toBe("connected");
    const { id: shellId } = await client.call<{ id: string }>("ssh.shells.open", { hostId }, write);
    const original = await live();
    const save = (expectedRevision: string | null, change: UpdateVaultPreferences["change"]) => client.call<VaultPreferencesSnapshot>("ssh.settings.update", { expectedRevision, change }, write);
    const enabled = await save(null, { section: "connection", values: { ...defaultVaultPreferences.connection, autoReconnect: true } });
    const limits = await save(enabled.revision, { section: "recording", values: { enabled: true, savedLimit: 1 } });
    for (let i = 0; i < 2; i++) {
      await client.call("ssh.recordings.start", { shellId }, write);
      await client.call("ssh.recordings.stop", { shellId }, write);
    }
    expect(await client.call("ssh.recordings.list", { shellId })).toHaveLength(1);
    await save(limits.revision, { section: "recording", values: { enabled: false, savedLimit: 1 } });
    await expect(client.call("ssh.recordings.start", { shellId }, write)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    server.conns[0]!.end();
    await expect
      .poll(
        async () => {
          const current = await live();
          return current?.state === "connected" && current.attemptId !== original?.attemptId;
        },
        { timeout: 5000 },
      )
      .toBe(true);
    expect(server.conns).toHaveLength(2);
    expect(await client.call("ssh.shells.list", { hostId })).toContainEqual(expect.objectContaining({ id: shellId, state: "ended" }));
    await client.call("ssh.disconnect", { hostId }, write);
    await expect.poll(async () => (await live())?.state).toBe("disconnected");
    expect(server.conns).toHaveLength(2);

    const saved = await client.call<VaultPreferencesSnapshot>("ssh.settings.get");
    await save(saved.revision, { section: "connection", values: { ...saved.values.connection, shareConnections: false } });
    const workspace = await client.call<WorkspaceRun>("ssh.workspace.runs.start", { name: "isolated recovery", layout: { kind: "one" }, panes: [{ hostId }] }, write);
    const readPane = async () => (await client.call<WorkspaceRun[]>("ssh.workspace.runs.list")).find(({ id }) => id === workspace.id)?.panes[0];
    await expect.poll(async () => (await readPane())?.phase).toBe("ready");
    const oldShell = (await readPane())!.sessionId!;
    const oldFiles = await client.call<FileSession>("ssh.fileSessions.open", { hostId, shellId: oldShell }, write);
    expect(server.conns).toHaveLength(3);
    server.conns[2]!.end();
    await expect
      .poll(
        async () => {
          const pane = await readPane();
          return pane?.phase === "ready" && pane.sessionId !== oldShell;
        },
        { timeout: 5000 },
      )
      .toBe(true);
    const newFiles = await client.call<FileSession>("ssh.fileSessions.open", { hostId, shellId: (await readPane())!.sessionId! }, write);
    expect(newFiles.connectionId).not.toBe(oldFiles.connectionId);
    expect(await client.call<FileSession[]>("ssh.fileSessions.list")).toContainEqual(expect.objectContaining({ fileSessionId: oldFiles.fileSessionId, state: "disconnected" }));
    expect(server.conns).toHaveLength(4);
    server.conns[3]!.end();
    await expect.poll(async () => (await readPane())?.phase).toBe("ended");
    expect(server.conns).toHaveLength(4);
  } finally {
    await engine.shutdown();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
