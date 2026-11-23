import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { boot, type RunningEngine } from "../../../../../apps/engine/src/boot.js";
import { HerdrCore } from "../../../../../plugins/agent-cli/src/engine/herdr-core.js";
import { startFakeSsh } from "../../../../../plugins/ssh/test/fake-server.js";
import { machineId } from "../../../../../packages/vault/src/vault.js";

function call(engine: RunningEngine, token = engine.rendererToken) {
  return async (capability: string, input: unknown = {}) => {
    const response = await fetch("http://127.0.0.1:" + engine.port + "/api/v1/call", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
}

test("Notes reads through renderer and CLI keep source bytes, version and mtime", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "g11-notes-"));
  let engine: RunningEngine | undefined;
  try {
    const pathname = path.join(dir, "G11.md");
    const bytes = Buffer.from("# G11\nsynthetic note\n", "utf8");
    writeFileSync(pathname, bytes);
    engine = await boot({ vaultPath: dir, create: true });
    const before = statSync(pathname).mtimeMs;
    const readRenderer = call(engine);
    const readCli = call(engine, engine.cliToken);
    const first = await readRenderer("notes.read", { path: "G11.md" });
    expect(first).toMatchObject({ ok: true, data: { path: "G11.md", text: bytes.toString("utf8"), version: expect.any(String) } });
    expect(await readCli("notes.read", { path: "G11.md" })).toEqual(first);
    expect(await readRenderer("notes.read", { path: "G11.md" })).toEqual(first);
    expect(await readCli("notes.read", { path: "Missing.md" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(readFileSync(pathname)).toEqual(bytes);
    expect(statSync(pathname).mtimeMs).toBe(before);
  } finally {
    try { await engine?.shutdown(); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("Agent status, output and health can start a scoped Core; session listing cannot", async () => {
  const bin = process.env.HUHU_HERDR_BIN;
  expect(bin && existsSync(bin)).toBe(true);
  const dir = mkdtempSync(path.join(tmpdir(), "g11-core-"));
  let engine: RunningEngine | undefined;
  let core: HerdrCore | undefined;
  try {
    engine = await boot({ vaultPath: dir, create: true });
    const host = machineId();
    const runtimeDir = path.join(dir, ".huhu", "runtime", host, "herdr");
    core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: host, runtimeDir });
    const readEngine = call(engine);
    const cli = call(engine, engine.cliToken);
    const absent = async () => {
      expect(await core!.peek()).toBe("absent");
      core!.dispose();
    };
    const connected = async () => {
      const link = await core!.peek();
      expect(link).not.toBe("absent");
      expect(link).not.toBeNull();
      core!.dispose();
    };
    await absent();
    expect(await readEngine("agent.sessions.list")).toEqual({ ok: true, data: [] });
    expect(await cli("agent.core.status")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await absent();
    expect(await readEngine("agent.core.status")).toMatchObject({ ok: true, data: { state: "connected", version: expect.any(String) } });
    await connected();

    const spaces = await readEngine("agent.spaces.list");
    expect(spaces.ok).toBe(true);
    const space = spaces.data[0];
    const launch = await readEngine("agent.sessions.launch", {
      spaceId: space.id, spaceRevision: space.revision, provider: "shell", requestId: randomUUID(),
    });
    expect(launch).toMatchObject({ ok: true, data: { state: "running", terminalId: expect.any(String) } });
    const sessionId = launch.data.id;
    await core.stop();
    await absent();
    const output = await readEngine("agent.sessions.output", { id: sessionId, lines: 20 });
    await connected();
    console.info("G1.1 output after Core stop", output.ok ? "OK" : output.error.code);

    await core.stop();
    await absent();
    const listed = await readEngine("agent.sessions.list");
    expect(listed).toMatchObject({ ok: true, data: [expect.objectContaining({ id: sessionId, state: "exited" })] });
    await absent();

    expect(await readEngine("health.run")).toMatchObject({ ok: true, data: { checks: expect.arrayContaining([expect.objectContaining({ id: "herdr" })]) } });
    await connected();
    await core.stop();
    await absent();
    expect(await readEngine("health.exportDiagnostics")).toMatchObject({ ok: true, data: { checks: expect.arrayContaining([expect.objectContaining({ id: "herdr" })]) } });
    await connected();
  } finally {
    try { await engine?.shutdown(); } finally {
      try { await core?.stop(); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }
}, 90_000);

test("SFTP file reads require an existing SSH connection and leave both copies unchanged", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "g11-ssh-"));
  let engine: RunningEngine | undefined;
  let server: Awaited<ReturnType<typeof startFakeSsh>> | undefined;
  try {
    const password = "g11-synthetic-fixture";
    let authAttempts = 0;
    server = await startFakeSsh({ password, onAuth: () => { authAttempts += 1; } });
    engine = await boot({ vaultPath: dir, create: true });
    const run = call(engine);
    const cli = call(engine, engine.cliToken);
    const prompts: { attemptId: string; hop: number }[] = [];
    engine.events.subscribe((event) => {
      if (event.type === "ssh.hostKeyPrompt") prompts.push(event.payload as typeof prompts[number]);
    });
    expect((await run("safe.setup", { password })).ok).toBe(true);
    const item = await run("safe.items.save", { name: "fixture", type: "password", allowedModules: ["ssh"], value: password });
    expect(item.ok).toBe(true);
    const host = await run("ssh.hosts.save", {
      name: "local-fixture", host: "127.0.0.1", port: server.port, user: "test",
      auth: { kind: "password", secretRef: "safe://" + item.data.id }, connectTimeoutSec: 5,
    });
    expect(host.ok).toBe(true);
    const hostId = host.data.id;
    const remotePath = "/home/test/g11.txt";
    const input = { hostId, path: remotePath };
    expect(await run("ssh.sftp.read", input)).toMatchObject({ ok: false, error: { code: "SSH_DISCONNECTED" } });
    expect(prompts).toHaveLength(0);
    expect(authAttempts).toBe(0);
    const connecting = run("ssh.connect", { hostId });
    try {
      await expect.poll(() => prompts.length, { timeout: 5000 }).toBe(1);
      const { attemptId, hop } = prompts[0]!;
      expect(await run("ssh.hostKey.decide", { attemptId, hop, accept: true })).toMatchObject({ ok: true, data: { applied: true } });
    } finally {
      expect(await connecting).toMatchObject({ ok: true, data: { attemptId: expect.any(String) } });
    }
    const connectedAttempts = authAttempts;
    expect(connectedAttempts).toBeGreaterThan(0);
    const localPath = path.join(dir, "source.txt");
    const downloadPath = path.join(dir, "download.txt");
    const content = Buffer.from("G11 synthetic SFTP\n");
    writeFileSync(localPath, content);
    expect(await run("ssh.sftp.upload", { hostId, localPath, remotePath })).toMatchObject({ ok: true, data: { size: content.length } });
    const list = await run("ssh.sftp.list", { hostId, path: "" });
    expect(list).toMatchObject({ ok: true, data: { path: "/home/test", entries: [expect.objectContaining({ name: "g11.txt" })] } });
    expect(await run("ssh.sftp.read", input)).toMatchObject({ ok: true, data: { text: content.toString("utf8"), size: content.length } });
    expect(await cli("ssh.sftp.read", input)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await run("ssh.sftp.list", { hostId, path: "" })).toEqual(list);
    expect(authAttempts).toBe(connectedAttempts);
    expect(prompts).toHaveLength(1);
    expect(await run("ssh.audit.list", { hostId })).toMatchObject({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({ action: "sftp.list", result: "ok" }),
        expect.objectContaining({ action: "sftp.read", result: "ok" }),
      ]),
    });
    expect(existsSync(downloadPath)).toBe(false);
    expect(readFileSync(localPath)).toEqual(content);
    expect(await run("ssh.sftp.download", { hostId, remotePath, localPath: downloadPath })).toMatchObject({ ok: true, data: { size: content.length } });
    expect(readFileSync(downloadPath)).toEqual(content);
    expect(await run("ssh.sftp.download", { hostId, remotePath, localPath: downloadPath })).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT" } });
    expect(readFileSync(downloadPath)).toEqual(content);
  } finally {
    try { await engine?.shutdown(); } finally {
      try { await server?.close(); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }
}, 30_000);
