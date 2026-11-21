import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import type { FileProperties, FileSession } from "../src/shared/files.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import { startFakeSsh } from "./fake-server.js";

test("bound SFTP properties, mutations, conflict and denial stay on the original loopback server", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-file-properties-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create: true });
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  const primary = await startFakeSsh({ denySetAttributes: (file) => file.endsWith("/protected") });
  const other = await startFakeSsh({
    noSftp: true,
    onExec: (cmd) => {
      throw Error(`unexpected session exec: ${cmd}`);
    },
  });
  const write = { write: true };
  const home = "/home/test";
  const source = `${home}/original`;
  const protectedFile = `${home}/protected`;
  async function connect(port: number) {
    const { hostId } = await client.call<{ hostId: string }>(
      "ssh.hosts.configure",
      {
        name: `fixture ${port}`,
        host: "127.0.0.1",
        port,
        user: "fixture",
        authKind: "password",
        expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      },
      write,
    );
    const status = async () => (await client.call<ConnectionStatus[]>("ssh.connections.status")).find((rec) => rec.hostId === hostId);
    await client.call("ssh.connect", { hostId, background: true }, write);
    const prompt = await vi.waitFor(async () => {
      const state = await status();
      if (state?.state !== "waiting") throw Error("waiting for host trust");
      return state.prompt;
    });
    const { attemptId, hop, promptId } = prompt;
    expect(await client.call("ssh.hostKey.decide", { attemptId, hop, promptId, accept: true }, write)).toEqual({ applied: true });
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    return client.call<FileSession>("ssh.fileSessions.open", { hostId }, write);
  }
  try {
    const a = await connect(primary.port);
    const b = await connect(other.port);
    primary.fs.dirs.add(`${home}/sub`);
    primary.fs.files.set(source, Buffer.from("payload"));
    primary.fs.files.set(protectedFile, Buffer.from("must stay"));
    other.fs.files.set(source, Buffer.from("other server"));
    const call = <T>(method: string, p: string, input = {}) => client.call<T>(`ssh.fileSessions.${method}`, { fileSessionId: a.fileSessionId, path: p, ...input }, write);
    const properties = (p: string) => call<FileProperties>("properties", p);
    const change = (p: string, expectedRevision: string, attrs: unknown) => call<FileProperties>("changeProperties", p, { expectedRevision, change: attrs });

    const first = await properties(source);
    expect(first).toMatchObject({ type: "file", size: 7, mode: "644", uid: 1000, gid: 1000, mtime: 1_700_000_000_000 });
    const updates = await Promise.allSettled(["640", "600"].map((mode) => change(source, first.revision, { mode })));
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(updates.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    const withMode = await properties(source);
    await expect(change(source, withMode.revision, { mode: "400", owner: { uid: 42, gid: 43 } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await change(source, withMode.revision, { owner: { uid: 42, gid: 43 } })).toMatchObject({ mode: withMode.mode, uid: 42, gid: 43 });
    const subdirectory = await properties(`${home}/sub`);
    expect(await change(subdirectory.path, subdirectory.revision, { mode: "750" })).toMatchObject({ type: "dir", mode: "750" });
    expect(other.fs.owners.size).toBe(0);

    const denied = await properties(protectedFile);
    await expect(change(protectedFile, denied.revision, { mode: "600" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await properties(protectedFile)).toEqual(denied);
    const empty = `${home}/new`;
    await call("createEntry", empty, { entry: { kind: "file" } });
    expect(await properties(empty)).toMatchObject({ size: 0, mode: "600" });
    await expect(call("createEntry", source, { entry: { kind: "file" } })).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    const link = `${home}/link`;
    await call("createEntry", link, { entry: { kind: "link", target: "original" } });
    const linked = await properties(link);
    expect(linked).toMatchObject({ type: "link", linkTarget: "original" });
    await expect(change(link, linked.revision, { mode: "600" })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const current = await properties(source);
    await expect(call("moveEntry", source, { expectedRevision: current.revision, destination: empty })).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    const destination = `${home}/sub/moved`;
    await call("moveEntry", source, { expectedRevision: current.revision, destination });
    expect(primary.fs.files.has(source)).toBe(false);
    expect(primary.fs.files.get(destination)?.toString()).toBe("payload");
    expect(other.fs.files.get(source)?.toString()).toBe("other server");

    await expect(client.call("ssh.sftp.list", { fileSessionId: b.fileSessionId }, write)).rejects.toMatchObject({ details: { reason: "sftp-unavailable" } });
    await client.call("ssh.fileSessions.close", { fileSessionId: a.fileSessionId }, write);
    await expect(properties(destination)).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await engine.shutdown();
    await Promise.all([primary.close(), other.close()]);
    await rm(root, { recursive: true, force: true, maxRetries: 4 });
  }
});
