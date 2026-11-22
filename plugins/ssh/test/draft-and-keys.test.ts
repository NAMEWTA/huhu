import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import ssh2 from "ssh2";
import { afterEach, expect, test } from "vitest";
import { Vault } from "../../../packages/vault/src/index.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { ConfigureHost } from "../src/engine/auth-profile.js";
import { testSshDraft } from "../src/engine/draft-connection.js";
import { HostConfigurations } from "../src/engine/host-configurations.js";
import { HostStore } from "../src/engine/hosts.js";
import { KnownHosts } from "../src/engine/known-hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { genHostKey, startFakeSsh } from "./fake-server.js";

const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ssh-draft-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const volume = path.join(root, "vault");
  const localRoot = path.join(root, "keys");
  mkdirSync(volume);
  mkdirSync(localRoot);
  const vault = await Vault.open(volume, { create: true });
  cleanups.push(() => vault.close());
  const hosts = new HostConfigurations(new HostStore(path.join(vault.stateDir, "ssh", "hosts")), { vault, localRoot, localVaultInstanceId: "fixture", protection: new TestProtection(localRoot) });
  const knownHostsFile = path.join(root, "known_hosts");
  const manager = new SshManager({ hosts, knownHostsFile, auditDir: path.join(root, "audit"), now: () => new Date(), withManagedAuth: (host, connect) => hosts.withAuthentication(host, connect), publish: () => undefined });
  cleanups.push(() => manager.disposeAll());
  const run = (input: ConfigureHost, signal = new AbortController().signal) => testSshDraft(hosts, manager, input, signal);
  const remember = async (port: number, hostKey: string) => {
    const key = ssh2.utils.parseKey(hostKey);
    if (key instanceof Error) throw key;
    await new KnownHosts(knownHostsFile).approve("127.0.0.1", port, key.type, key.getPublicSSH(), true, new AbortController().signal);
  };
  return { root, vault, hosts, manager, run, remember };
}

const configuration = (port: number) => ConfigureHost.parse({ name: "loopback fixture", host: "127.0.0.1", port, user: "fixture", expectedRevision: null, authKind: "password" });

test("密钥库只列公开摘要，引用的加密 Ed25519 密钥可认证且禁止删除", async () => {
  const { hosts, vault, run, remember } = await setup();
  const signal = new AbortController().signal;
  const passphrase = "synthetic test passphrase";
  const key = await hosts.addKey({ action: "generate", name: "loopback key", passphrase }, signal);
  expect(key).toMatchObject({ keyType: "ssh-ed25519", encrypted: true, available: true, referenced: false });
  const hostKey = genHostKey();
  const server = await startFakeSsh({ hostKey, publicKey: key.publicKey });
  cleanups.push(server.close);
  await remember(server.port, hostKey);
  const draft = { ...configuration(server.port), authKind: "key" as const, keyId: key.id };
  const { hostId, revision } = await hosts.configure(draft, signal);
  expect(await hosts.listKeys()).toEqual([{ ...key, referenced: true }]);
  await expect(hosts.removeKey(key.id, key.revision, signal)).rejects.toThrow("引用");
  await expect(run({ ...configuration(server.port), authKind: "key", hostId, expectedRevision: revision })).resolves.toEqual({ state: "authenticated" });
  const portable = path.join(vault.root, ".huhu", "module-credentials");
  const serialized = readdirSync(portable).map((name) => readFileSync(path.join(portable, name), "utf8")).join("\n");
  expect(serialized).not.toContain(passphrase);
  expect(serialized).not.toContain("PRIVATE KEY");
  await hosts.remove({ hostId, expectedRevision: revision }, signal);
  await expect(hosts.removeKey(key.id, key.revision, signal)).resolves.toBeUndefined();
});

test("导入的公钥匹配，公钥或带错误口令的私钥无法导入", async () => {
  const { hosts } = await setup();
  const signal = new AbortController().signal;
  const pair = ssh2.utils.generateKeyPairSync("ed25519", { passphrase: "synthetic passphrase", cipher: "aes256-ctr", rounds: 16 });
  await expect(hosts.addKey({ action: "import", name: "public", privateKey: pair.public }, signal)).rejects.toThrow();
  await expect(hosts.addKey({ action: "import", name: "wrong", privateKey: pair.private, passphrase: "wrong" }, signal)).rejects.toThrow();
  const imported = await hosts.addKey({ action: "import", name: "imported", privateKey: pair.private.replaceAll("\n", "\r\n  "), passphrase: "synthetic passphrase" }, signal);
  expect(imported.publicKey).toBe(pair.public.trim());
  expect(await hosts.listKeys()).toHaveLength(1);
});

test("草稿测试区分待核对、成功、待认证和拒绝，不写入信任或创建会话", async () => {
  const { hosts, manager, run, remember } = await setup();
  const hostKey = genHostKey();
  const server = await startFakeSsh({ hostKey, password: "fixture password" });
  cleanups.push(server.close);
  const input = { ...configuration(server.port), credentials: [{ action: "replace" as const, purpose: "password" as const, value: "fixture password" }] };
  await expect(run(input)).resolves.toEqual({ state: "reachable", hop: 0, reason: "host-key" });
  expect(manager.knownHosts()).toEqual([]);
  await remember(server.port, hostKey);
  await expect(run(input)).resolves.toEqual({ state: "authenticated" });
  await expect(run(configuration(server.port))).resolves.toEqual({ state: "reachable", hop: 0, reason: "authentication-required" });
  await expect(run({ ...input, credentials: [{ action: "replace", purpose: "password", value: "wrong" }] })).resolves.toMatchObject({ state: "failed", hop: 0 });
  expect(await hosts.list()).toEqual([]);
  expect(manager.connectionStatuses()).toEqual([]);
  expect(manager.listShells()).toEqual([]);
  expect(manager.auditList()).toEqual([]);
  await expect.poll(() => server.closed()).toBe(4);
});

test("取消挂起的草稿立即关闭测试传输", async () => {
  const { manager, run } = await setup();
  const listener = net.createServer();
  const accepted = new Promise<net.Socket>((resolve) => listener.once("connection", resolve));
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => { listener.close(); });
  const port = (listener.address() as net.AddressInfo).port;
  const cancel = new AbortController();
  const pending = run(configuration(port), cancel.signal);
  const socket = await accepted;
  cleanups.push(() => { socket.destroy(); });
  socket.resume();
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  cancel.abort();
  await expect(pending).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
  await closed;
  expect(manager.connectionStatuses()).toEqual([]);
});

test("停用路由只影响下次拨号，现有连接保留实际跳点", async () => {
  const { hosts, manager, remember } = await setup();
  const signal = new AbortController().signal;
  const jumpKey = genHostKey();
  const targetKey = genHostKey();
  const jump = await startFakeSsh({ hostKey: jumpKey });
  const target = await startFakeSsh({ hostKey: targetKey });
  cleanups.push(jump.close, target.close);
  await remember(jump.port, jumpKey);
  await remember(target.port, targetKey);
  const credentials = [{ action: "replace" as const, purpose: "password" as const, value: "pw" }];
  const jumpHost = await hosts.configure({ ...configuration(jump.port), credentials }, signal);
  const profile = { ...configuration(target.port), jumpHostIds: [jumpHost.hostId] };
  const host = await hosts.configure({ ...profile, credentials }, signal);
  await manager.connect(host.hostId, signal);
  const active = manager.connectionStatuses()[0]!;
  expect(active.route?.map(({ id, stage }) => [id, stage])).toEqual([[jumpHost.hostId, "connected"], [host.hostId, "connected"]]);
  await expect(hosts.configure({ ...configuration(jump.port), hostId: jumpHost.hostId, expectedRevision: jumpHost.revision, jumpHostIds: [host.hostId] }, signal)).rejects.toThrow("循环");
  await hosts.configure({ ...profile, hostId: host.hostId, expectedRevision: host.revision, routeDisabled: true }, signal);
  expect(await hosts.list()).toContainEqual(expect.objectContaining({ id: host.hostId, routeDisabled: true, jumpHostIds: [jumpHost.hostId] }));
  expect(manager.connectionStatuses()).toEqual([active]);
  await manager.connect(host.hostId, signal);
  expect(manager.connectionStatuses()[0]?.route?.map(({ id }) => id)).toEqual([host.hostId]);
  expect(manager.connectionStatuses()[0]?.connectionId).not.toBe(active.connectionId);
});
