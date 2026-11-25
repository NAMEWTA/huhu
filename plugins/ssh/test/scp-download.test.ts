import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import type { FileSession } from "../src/shared/files.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import { startFakeSsh } from "./fake-server.js";
import { localPosixCommand } from "./shell-relay-fixture.js";

test.skipIf(process.platform !== "linux" || !existsSync("/usr/bin/scp"))("desktop fallback downloads a single file with real SCP and refuses an unexpected protocol name", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-real-scp-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  const local = path.join(root, "downloads");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData), mkdir(local)]);
  const remote = path.join(root, "文件 'with quote'.bin");
  const wrong = path.join(root, "expected.bin");
  const bytes = Buffer.from([0x01, 0xff, 0, 127]);
  await writeFile(remote, bytes);
  const engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create: true });
  const server = await startFakeSsh({ noSftp: true, onInteractiveExec: (command, channel) => {
    if (command.includes(wrong)) {
      channel.once("data", () => channel.write("C0600 3 unrelated.bin\n"));
      return true;
    }
    if (command === "command -v scp >/dev/null 2>&1" || command.includes("exec scp -f -- ")) {
      localPosixCommand(channel, command);
      return true;
    }
    return false;
  } });
  try {
    const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
    const options = { write: true };
    const { hostId } = await client.call<{ hostId: string }>("ssh.hosts.configure", {
      name: "real SCP fixture", host: "127.0.0.1", port: server.port, user: "fixture", authKind: "password", expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: "pw" }],
    }, options);
    await client.call("ssh.connect", { hostId, background: true }, options);
    const status = async () => (await client.call<ConnectionStatus[]>("ssh.connections.status")).find((row) => row.hostId === hostId);
    await expect.poll(async () => (await status())?.state).toBe("waiting");
    const waiting = await status();
    if (waiting?.state !== "waiting") throw new Error("Expected the loopback trust prompt");
    expect(await client.call("ssh.hostKey.decide", { attemptId: waiting.attemptId, hop: 0, promptId: waiting.prompt.promptId, accept: true }, options)).toEqual({ applied: true });
    await expect.poll(async () => (await status())?.state).toBe("connected");
    const { fileSessionId } = await client.call<FileSession>("ssh.fileSessions.open", { hostId }, options);
    await expect(client.call("ssh.sftp.list", { fileSessionId }, options)).rejects.toMatchObject({ details: { reason: "sftp-unavailable" } });
    expect(await client.call("ssh.fileSessions.scp.support", { fileSessionId })).toEqual({ available: true });
    const transfer = (source: string, leaf: string) => client.call("ssh.fileSessions.scp.download", { fileSessionId, remote: source, local: path.join(local, leaf) }, options);
    expect(await transfer(remote, "copy.bin")).toEqual({ size: bytes.length });
    expect(await readFile(path.join(local, "copy.bin"))).toEqual(bytes);
    await expect(transfer(remote, "copy.bin")).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    await expect(transfer(wrong, "no-copy.bin")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await readdir(local)).toEqual(["copy.bin"]);
    await client.call("ssh.fileSessions.close", { fileSessionId }, options);
    await expect(transfer(remote, "after-close.bin")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(server.conns).toHaveLength(1);
  } finally {
    await engine.shutdown();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
