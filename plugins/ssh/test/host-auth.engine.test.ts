import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EVENT_PAYLOADS } from "@huhu/contracts";
import ssh2 from "ssh2";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { exportPackage, importPackage } from "../../../packages/vault/src/package/package.js";
import { CapabilityError, EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { startFakeSsh } from "./fake-server.js";

type Summary = { hostId: string; revision: string; authKind: string; configured: boolean; authState: Record<string, string> };
type HostRow = { id: string; revision?: string; authState?: Record<string, string> };
const roots: string[] = [];
const engines: Array<{ engine: RunningEngine; client: EngineClient }> = [];
const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
const testWindows = test.skipIf(process.platform !== "win32" || process.arch !== "x64");

async function start(vaultPath: string, desktopUserData: string, create = false) {
  const engine = await boot({ vaultPath, desktopUserData, create });
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  engines.push({ engine, client });
  return { engine, client };
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ssh-owner-"));
  roots.push(root);
  const vaultPath = path.join(root, "vault");
  const userData = path.join(root, "user-data");
  mkdirSync(vaultPath);
  mkdirSync(userData);
  return { ...(await start(vaultPath, userData, true)), root, vaultPath, userData };
}

async function server(options: Parameters<typeof startFakeSsh>[0]) {
  const value = await startFakeSsh(options);
  servers.push(value);
  return value;
}

async function code(pending: Promise<unknown>) {
  try {
    await pending;
    return "OK";
  } catch (error) {
    if (error instanceof CapabilityError) return error.code;
    throw new Error("Test client failed before receiving an SSH result");
  }
}

async function connect(client: EngineClient, engine: RunningEngine, hostId: string, trust = true) {
  const off = engine.events.subscribe((event) => {
    if (event.type !== "ssh.hostKeyPrompt") return;
    const prompt = EVENT_PAYLOADS["ssh.hostKeyPrompt"].parse(event.payload);
    if (prompt.reason === "first" && prompt.hostId === hostId) void client.call("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, accept: trust }, { write: true }).catch(() => undefined);
  });
  try {
    return await code(client.call("ssh.connect", { hostId }, { write: true }));
  } finally {
    off();
  }
}

function hasMarker(root: string, secrets: string[]): boolean {
  return readdirSync(root, { recursive: true, withFileTypes: true }).some((entry) => {
    if (!entry.isFile()) return false;
    const bytes = readFileSync(path.join(entry.parentPath, entry.name));
    return secrets.some((secret) => bytes.includes(secret));
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  try {
    for (const { engine, client } of engines.splice(0).reverse()) {
      try {
        const rows = await client.call<HostRow[]>("ssh.hosts.list").catch(() => []);
        for (const host of rows) {
          if (host.revision) await client.call("ssh.hosts.remove", { hostId: host.id, expectedRevision: host.revision });
        }
      } finally {
        await engine.shutdown();
      }
    }
  } finally {
    await Promise.all(servers.splice(0).map((value) => value.close()));
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

testWindows("旧主机仅显示修复标记，跳板及转发均不拨号，旧条目与文件保留", async () => {
  const live = await fixture();
  const remote = await server({});
  const password = randomUUID();
  const vaultPassword = randomUUID();
  await live.client.call("safe.setup", { password: vaultPassword }, { write: true });
  const item = await live.client.call<{ id: string }>("safe.items.save", { name: "legacy synthetic", type: "password", value: password, allowedModules: ["ssh"] }, { write: true });
  const folder = path.join(live.vaultPath, ".huhu", "ssh", "hosts");
  mkdirSync(folder, { recursive: true });
  const legacy = { id: "host-legacy-test", name: "legacy loopback", host: "127.0.0.1", port: remote.port, user: "fixture", auth: { kind: "password", secretRef: `safe://${item.id}` } };
  const profile = path.join(folder, `${legacy.id}.json`);
  const original = JSON.stringify(legacy);
  writeFileSync(profile, original);
  const records = await live.client.call("ssh.hosts.list");
  expect(records).toEqual([expect.objectContaining({ id: legacy.id, repairRequired: true, auth: { kind: "password", source: "legacy" } })]);
  expect(JSON.stringify(records)).not.toContain(item.id);
  const catalog = await live.client.call<Array<{ name: string }>>("capabilities.list", { includeInactive: true });
  expect(catalog.map(({ name }) => name)).not.toContain("ssh.hosts.save");
  expect(catalog.map(({ name }) => name)).not.toContain("ssh.hosts.delete");
  await expect(live.client.call("ssh.connect", { hostId: legacy.id }, { write: true })).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
  const attached = await live.client.call<Summary>(
    "ssh.hosts.configure",
    {
      name: "owner behind legacy jump",
      host: "127.0.0.1",
      port: remote.port,
      user: "fixture",
      authKind: "agent",
      jumpHostIds: [legacy.id],
      expectedRevision: null,
    },
    { write: true },
  );
  await expect(live.client.call("ssh.connect", { hostId: attached.hostId }, { write: true })).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
  const rule = await live.client.call<{ id: string; revision: string }>(
    "ssh.forwarding.rules.save",
    {
      name: "legacy rule",
      hostId: legacy.id,
      mode: "local",
      listenPort: 43190,
      target: { host: "127.0.0.1", port: remote.port },
      resume: false,
    },
    { write: true },
  );
  await live.client.call("ssh.forwarding.runs.start", { id: rule.id, expectedRevision: rule.revision }, { write: true });
  await vi.waitFor(async () => {
    expect(await live.client.call("ssh.forwarding.runs.list")).toMatchObject([{ ruleId: rule.id, state: "failed", message: expect.stringContaining("重新配置凭据") }]);
  });
  expect(remote.conns).toHaveLength(0);
  expect(readFileSync(profile, "utf8")).toBe(original);
  expect(await live.client.call("safe.items.reveal", { id: item.id })).toMatchObject({ value: password });
});

testWindows(
  "Windows SSH 自有密码在 Safe 三种状态可用且备份只带可恢复定义",
  async () => {
    const live = await fixture();
    const secret = randomUUID();
    const remote = await server({ password: secret });
    const profile = { name: "loopback", host: "127.0.0.1", port: remote.port, user: "synthetic", authKind: "password", tags: ["loopback"], keepaliveIntervalSec: 0 };
    const input = { ...profile, expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: secret }] };
    expect(await live.client.call("safe.status")).toMatchObject({ initialized: false });
    const saving = live.client.call<Summary>("ssh.hosts.configure", input, { write: true });
    expect(await code(saving)).toBe("OK");
    const saved = await saving;
    expect(saved).toMatchObject({ authKind: "password", configured: true, authState: { password: "configured" } });
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
    await live.client.call("ssh.disconnect", { hostId: saved.hostId }, { write: true });
    await live.client.call("safe.setup", { password: randomUUID() });
    await live.client.call("safe.lock");
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
    await live.client.call("ssh.disconnect", { hostId: saved.hostId }, { write: true });
    await live.client.call("plugins.setEnabled", { id: "safe", enabled: false }, { write: true });
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");

    await live.client.call("gateway.mcp.update", { enabled: true, transport: "stdio" }, { write: true });
    for (const token of [live.engine.cliToken, live.engine.mcpToken]) {
      const caller = new EngineClient({ ...live.client.endpoint, token });
      expect(await code(caller.call("ssh.hosts.configure", input))).toBe("CAPABILITY_NOT_EXPOSED");
    }
    const web = await live.engine.dispatcher.call("web:synthetic", { capability: "ssh.hosts.configure", requestId: randomUUID(), input });
    expect(web).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const catalog = await live.client.call<unknown[]>("capabilities.list");
    expect(JSON.stringify(catalog).includes(secret)).toBe(false);
    const rows = await live.client.call<HostRow[]>("ssh.hosts.list");
    expect(rows).toContainEqual(expect.objectContaining({ id: saved.hostId, revision: saved.revision, tags: ["loopback"], keepaliveIntervalSec: 0 }));
    expect(JSON.stringify(rows).includes(secret)).toBe(false);
    type Directory = { version: string; groups: Array<{ groupId: string }>; hosts: Array<{ hostId: string; groupId: string | null }> };
    const directory = await live.client.call<Directory>("ssh.hosts.directory");
    expect(directory.hosts.some((host) => host.hostId === saved.hostId)).toBe(true);
    const grouped = await live.client.call<Directory>("ssh.hosts.organize", { expectedVersion: directory.version, operation: { type: "group.create", name: "fixture group", parentId: null } }, { write: true });
    const groupId = grouped.groups[0]?.groupId;
    expect(groupId).toBeTypeOf("string");
    await live.client.call("ssh.hosts.organize", { expectedVersion: grouped.version, operation: { type: "hosts.move", hostIds: [saved.hostId], groupId } }, { write: true });

    const archive = path.join(live.root, "vault.zip");
    const restoredPath = path.join(live.root, "restored");
    const exported = await exportPackage(live.vaultPath, archive);
    expect(exported.files.some((file) => file.path.startsWith(".huhu/module-credentials/"))).toBe(true);
    importPackage(archive, restoredPath);
    expect(hasMarker(restoredPath, [secret])).toBe(false);
    const restored = await start(restoredPath, live.userData);
    expect(await restored.client.call("ssh.hosts.list")).toContainEqual(expect.objectContaining({ id: saved.hostId, authState: { password: "needs-reconfiguration" } }));
    const priorConnections = remote.conns.length;
    expect(await connect(restored.client, restored.engine, saved.hostId)).toBe("SSH_AUTH_FAILED");
    expect(remote.conns.length).toBe(priorConnections);
    await restored.engine.shutdown();
    await live.engine.shutdown();
    const reopened = await start(live.vaultPath, live.userData);
    expect(await reopened.client.call("ssh.hosts.list")).toContainEqual(expect.objectContaining({ id: saved.hostId, revision: saved.revision, keepaliveIntervalSec: 0 }));
    expect((await reopened.client.call<Directory>("ssh.hosts.directory")).hosts).toContainEqual(expect.objectContaining({ hostId: saved.hostId, groupId }));
    expect(await connect(reopened.client, reopened.engine, saved.hostId)).toBe("OK");
    expect(readFileSync(path.join(reopened.engine.vault.runtimeDir, "idempotency.ndjson"), "utf8").includes("ssh.hosts.configure")).toBe(false);
    expect(hasMarker(live.vaultPath, [secret])).toBe(false);
    expect(hasMarker(live.userData, [secret])).toBe(false);
  },
  60_000,
);

testWindows(
  "受保护配置替换失败与过期编辑保持原凭据，重试可提交",
  async () => {
    const live = await fixture();
    const original = randomUUID();
    const replacement = randomUUID();
    const remote = await server({ password: original });
    const profile = { name: "loopback", host: "127.0.0.1", port: remote.port, user: "synthetic", authKind: "password" };
    const save = (expectedRevision: string | null, value: string, hostId?: string) =>
      live.client.call<Summary>("ssh.hosts.configure", { ...profile, hostId, expectedRevision, credentials: [{ purpose: "password", action: "replace", value }] });
    const creation = save(null, original);
    expect(await code(creation)).toBe("OK");
    const saved = await creation;
    const write = live.engine.vault.files.write.bind(live.engine.vault.files);
    const blocked = vi.spyOn(live.engine.vault.files, "write").mockImplementation((file, bytes, options) => {
      if (file.startsWith(".huhu/module-credentials/")) return Promise.reject(new Error("synthetic publication failure"));
      return write(file, bytes, options);
    });
    try {
      expect(await code(save(saved.revision, replacement, saved.hostId))).toBe("INTERNAL");
    } finally {
      blocked.mockRestore();
    }
    expect(await live.client.call("ssh.hosts.list")).toContainEqual(expect.objectContaining({ id: saved.hostId, revision: saved.revision }));
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
    const caller = new EngineClient(live.client.endpoint);
    const omitted = { ...profile, hostId: saved.hostId, expectedRevision: saved.revision };
    const results = await Promise.all([code(live.client.call("ssh.hosts.configure", omitted)), code(caller.call("ssh.hosts.configure", { ...omitted, name: "second" }))]);
    expect(results.sort()).toEqual(["OK", "VERSION_CONFLICT"]);
    const current = (await live.client.call<HostRow[]>("ssh.hosts.list")).find((row) => row.id === saved.hostId);
    expect(current?.revision).not.toBe(saved.revision);
    expect(await code(save(saved.revision, replacement, saved.hostId))).toBe("VERSION_CONFLICT");
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
    const cleared = await live.client.call<Summary>("ssh.hosts.configure", { ...profile, hostId: saved.hostId, expectedRevision: current?.revision, credentials: [{ purpose: "password", action: "clear" }] });
    expect(cleared.configured).toBe(false);
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("SSH_AUTH_FAILED");
    const replaced = await save(cleared.revision, original, saved.hostId);
    expect(replaced.configured).toBe(true);
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
    const otherTarget = await server({ password: original });
    const moved = await live.client.call<Summary>("ssh.hosts.configure", { ...profile, hostId: saved.hostId, expectedRevision: replaced.revision, port: otherTarget.port });
    expect(moved).toMatchObject({ configured: false, authState: { password: "needs-reconfiguration" } });
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("SSH_AUTH_FAILED");
    expect(otherTarget.conns).toHaveLength(0);
    const rebound = await live.client.call<Summary>("ssh.hosts.configure", {
      ...profile,
      hostId: saved.hostId,
      expectedRevision: moved.revision,
      port: otherTarget.port,
      credentials: [{ purpose: "password", action: "replace", value: original }],
    });
    expect(rebound.configured).toBe(true);
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("OK");
  },
  60_000,
);

testWindows(
  "加密私钥与本机身份文件验证口令和主机信任，复制与删除不跨主机取用凭据",
  async () => {
    const live = await fixture();
    const passphrase = randomUUID();
    const wrong = randomUUID();
    const key = ssh2.utils.generateKeyPairSync("ecdsa", { bits: 256, passphrase, cipher: "aes256-ctr" });
    let authAttempts = 0;
    const remote = await server({ publicKey: key.public, onAuth: () => authAttempts++ });
    const profile = { name: "key fixture", host: "127.0.0.1", port: remote.port, user: "synthetic", authKind: "key" };
    const save = (input: object) => live.client.call<Summary>("ssh.hosts.configure", { ...profile, ...input });
    const saved = await save({
      expectedRevision: null,
      credentials: [
        { purpose: "privateKey", action: "replace", value: key.private },
        { purpose: "passphrase", action: "replace", value: wrong },
      ],
    });
    expect(await connect(live.client, live.engine, saved.hostId)).toBe("SSH_AUTH_FAILED");
    expect(authAttempts).toBe(0);
    let repaired = await save({ hostId: saved.hostId, expectedRevision: saved.revision, credentials: [{ purpose: "passphrase", action: "replace", value: passphrase }] });
    expect(await connect(live.client, live.engine, repaired.hostId, false)).toBe("SSH_DISCONNECTED");
    expect(authAttempts).toBe(0);
    expect(await connect(live.client, live.engine, repaired.hostId)).toBe("OK");
    expect(authAttempts).toBeGreaterThan(0);
    await live.client.call("ssh.disconnect", { hostId: repaired.hostId }, { write: true });
    await live.client.call("safe.setup", { password: randomUUID() });
    await live.client.call("safe.lock");
    expect(await connect(live.client, live.engine, repaired.hostId)).toBe("OK");
    await live.client.call("ssh.disconnect", { hostId: repaired.hostId }, { write: true });
    await live.client.call("plugins.setEnabled", { id: "safe", enabled: false }, { write: true });
    expect(await connect(live.client, live.engine, repaired.hostId)).toBe("OK");
    const cleared = await save({ hostId: repaired.hostId, expectedRevision: repaired.revision, credentials: [{ purpose: "passphrase", action: "clear" }] });
    expect(cleared.authState).toMatchObject({ privateKey: "configured", passphrase: "unconfigured" });
    const attemptsBeforeClear = authAttempts;
    expect(await connect(live.client, live.engine, cleared.hostId)).toBe("SSH_AUTH_FAILED");
    expect(authAttempts).toBe(attemptsBeforeClear);
    repaired = await save({ hostId: cleared.hostId, expectedRevision: cleared.revision, credentials: [{ purpose: "passphrase", action: "replace", value: passphrase }] });
    expect(await connect(live.client, live.engine, repaired.hostId)).toBe("OK");

    const copy = await live.client.call<Summary>("ssh.hosts.copy", { hostId: repaired.hostId, expectedRevision: repaired.revision, name: "copy" });
    expect(copy.hostId).not.toBe(repaired.hostId);
    expect(copy).toMatchObject({ authKind: "key", configured: false, authState: { privateKey: "unconfigured", passphrase: "unconfigured" } });
    expect(await connect(live.client, live.engine, copy.hostId)).toBe("SSH_AUTH_FAILED");
    const identity = path.join(live.root, "fixture-key");
    writeFileSync(identity, key.private);
    const added = await save({
      name: "local file",
      authKind: "identity-file",
      expectedRevision: null,
      credentials: [
        { purpose: "identityFile", action: "replace", value: identity },
        { purpose: "passphrase", action: "replace", value: passphrase },
      ],
    });
    expect(await connect(live.client, live.engine, added.hostId)).toBe("OK");
    const rows = await live.client.call<HostRow[]>("ssh.hosts.list");
    expect(rows.find((row) => row.id === repaired.hostId)).not.toHaveProperty("keepaliveIntervalSec");
    const bytes = JSON.stringify(rows);
    expect([passphrase, wrong, identity, key.private].some((value) => bytes.includes(value))).toBe(false);
    expect(await code(live.client.call("ssh.hosts.remove", { hostId: copy.hostId, expectedRevision: copy.revision }))).toBe("OK");
    expect(await connect(live.client, live.engine, copy.hostId)).toBe("NOT_FOUND");
    expect(await connect(live.client, live.engine, repaired.hostId)).toBe("OK");
    const keyMarker = key.private.split("\n")[1]!;
    expect(hasMarker(live.vaultPath, [passphrase, wrong, identity, keyMarker])).toBe(false);
    expect(hasMarker(live.userData, [passphrase, wrong, identity, keyMarker])).toBe(false);
  },
  60_000,
);
