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
  const { hosts, vault, manager, run, remember } = await setup();
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
  await manager.connect(hostId, signal);
  expect(manager.connectionStatuses()).toMatchObject([{ hostId, state: "connected", route: [{ auth: "key-library" }] }]);
  manager.disconnect(hostId);
  const portable = path.join(vault.root, ".huhu", "module-credentials");
  const serialized = readdirSync(portable)
    .map((name) => readFileSync(path.join(portable, name), "utf8"))
    .join("\n");
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
  cleanups.push(() => {
    listener.close();
  });
  const port = (listener.address() as net.AddressInfo).port;
  const cancel = new AbortController();
  const pending = run(configuration(port), cancel.signal);
  const socket = await accepted;
  cleanups.push(() => {
    socket.destroy();
  });
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
  expect(active.route?.map(({ id, stage }) => [id, stage])).toEqual([
    [jumpHost.hostId, "connected"],
    [host.hostId, "connected"],
  ]);
  await expect(hosts.configure({ ...configuration(jump.port), hostId: jumpHost.hostId, expectedRevision: jumpHost.revision, jumpHostIds: [host.hostId] }, signal)).rejects.toThrow("循环");
  await hosts.configure({ ...profile, hostId: host.hostId, expectedRevision: host.revision, routeDisabled: true }, signal);
  expect(await hosts.list()).toContainEqual(expect.objectContaining({ id: host.hostId, routeDisabled: true, jumpHostIds: [jumpHost.hostId] }));
  expect(manager.connectionStatuses()).toEqual([active]);
  await manager.connect(host.hostId, signal);
  expect(manager.connectionStatuses()[0]?.route?.map(({ id }) => id)).toEqual([host.hostId]);
  expect(manager.connectionStatuses()[0]?.connectionId).not.toBe(active.connectionId);
});

test("OpenSSH 同步保留两侧冲突，按版本写回并保留无关命令文本", async () => {
  const { SshConfigSync } = await import("../src/engine/config-sync.js");
  const { writeFileSync } = await import("node:fs");
  const { root, vault, hosts } = await setup();
  const signal = new AbortController().signal;
  const jump = await hosts.configure({ ...configuration(2201), name: "jump", authKind: "agent" }, signal);
  const saved = await hosts.configure({ ...configuration(2202), name: "target", authKind: "agent" }, signal);
  const file = path.join(root, "config");
  const unrelated = "Host unrelated\n    ProxyCommand fixture-do-not-execute %h %p\n";
  writeFileSync(file, "Host target\n    ProxyJump jump\n    ServerAliveInterval 30\n" + unrelated, { mode: 0o600 });
  const sync = new SshConfigSync(hosts, vault.files);
  const source = { path: file, hostId: saved.hostId, alias: "target" };
  const apply = (preview: Awaited<ReturnType<typeof sync.preview>>, field: "ProxyJump" | "ServerAliveInterval", direction: "file-to-huhu" | "huhu-to-file") => {
    const { fingerprint, comparison, stateRevision, hostRevision } = preview;
    return sync.apply({ ...source, field, direction, fingerprint, comparison, stateRevision, hostRevision }, signal);
  };
  const first = await sync.preview(source);
  expect(first.rows).toContainEqual({ field: "ProxyJump", file: "jump", huhu: null, change: "unbound" });
  const next = await apply(first, "ProxyJump", "file-to-huhu");
  await expect(apply(first, "ServerAliveInterval", "file-to-huhu")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const baseline = await apply(next, "ServerAliveInterval", "file-to-huhu");
  expect((await hosts.list()).find(({ id }) => id === saved.hostId)).toMatchObject({ jumpHostIds: [jump.hostId], keepaliveIntervalSec: 30 });
  const fileChange = "Host target\n    ProxyJump jump\n    ServerAliveInterval 40\n" + unrelated;
  writeFileSync(file, fileChange);
  await hosts.configure({ ...configuration(2202), name: "target", authKind: "agent", hostId: saved.hostId, expectedRevision: baseline.hostRevision, jumpHostIds: [jump.hostId], keepaliveIntervalSec: 60 }, signal);
  const conflict = await sync.preview(source);
  expect(conflict.rows).toContainEqual({ field: "ServerAliveInterval", file: "40", huhu: "60", change: "conflict" });
  expect(readFileSync(file, "utf8")).toBe(fileChange);
  const resolved = await apply(conflict, "ServerAliveInterval", "huhu-to-file");
  expect(resolved.rows).toContainEqual({ field: "ServerAliveInterval", file: "60", huhu: "60", change: "same" });
  expect(readFileSync(file, "utf8")).toBe(fileChange.replace("Interval 40", "Interval 60"));
  writeFileSync(file, 'Host target\n    IdentityFile "unterminated\n');
  await expect(sync.preview(source)).rejects.toThrow(/第 2 行/);
});

test("辅助代理分享验证远端回环，通过 SSH 测试并清理监听", async () => {
  const { SshProxyShare, privateRemoteListeners } = await import("../src/engine/proxy-share.js");
  const { hosts, manager, remember } = await setup();
  const signal = new AbortController().signal;
  const proxy = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.once("data", (data) => {
      expect(data.toString()).toMatch(/^CONNECT example\.com:443 HTTP/);
      socket.end("HTTP/1.1 200 Connection established\r\n\r\n");
    });
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    proxy.close();
  });
  const localPort = (proxy.address() as net.AddressInfo).port;
  const spare = net.createServer();
  await new Promise<void>((resolve) => spare.listen(0, "127.0.0.1", resolve));
  const remotePort = (spare.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => spare.close(() => resolve()));
  const hostKey = genHostKey();
  const bindOutput = `LISTEN 0 128 127.0.0.1:${remotePort} 0.0.0.0:*\n`;
  expect(privateRemoteListeners(bindOutput + `LISTEN 0 128 [::]:${remotePort} [::]:*\n`, remotePort)).toBe(false);
  const server = await startFakeSsh({ hostKey, remoteForwarding: true, onExec: (command) => (command.startsWith("ss ") ? { stdout: bindOutput } : undefined) });
  cleanups.push(server.close);
  await remember(server.port, hostKey);
  const { hostId } = await hosts.configure({ ...configuration(server.port), credentials: [{ purpose: "password", action: "replace", value: "pw" }] }, signal);
  await manager.connect(hostId, signal);
  const connectionId = manager.connectionStatuses()[0]!.connectionId!;
  const share = new SshProxyShare(manager);
  cleanups.push(() => share.dispose());
  const config = { hostId, connectionId, localPort, remotePort };
  await expect(share.start(config, signal)).resolves.toEqual({ state: "running", config });
  await expect(share.test(signal)).resolves.toEqual({ state: "running", config, tested: "accepted" });
  await expect(share.stop(signal)).resolves.toEqual({ state: "stopped" });
  await expect(share.test(signal)).rejects.toThrow("没有可测试");
  expect(manager.isConnected(hostId)).toBe(true);
});

test("工作区交换和关闭分栏保留原 Shell，拒绝过时或非法布局", async () => {
  const { WorkspaceRuns } = await import("../src/engine/workspace-runs.js");
  const { WorkspaceTemplates } = await import("../src/engine/workspace-templates.js");
  const { hosts, manager, remember, vault } = await setup();
  const signal = new AbortController().signal;
  const credentials = [{ action: "replace" as const, purpose: "password" as const, value: "pw" }];
  const hostIds: string[] = [];
  for (const name of ["first", "second"]) {
    const hostKey = genHostKey();
    const server = await startFakeSsh({ hostKey });
    cleanups.push(server.close);
    await remember(server.port, hostKey);
    hostIds.push((await hosts.configure({ ...configuration(server.port), name, credentials }, signal)).hostId);
  }
  const runs = new WorkspaceRuns(vault.files, hosts, new WorkspaceTemplates(vault.files, hosts), manager, () => undefined);
  cleanups.push(() => runs.dispose());
  const opened = await runs.start({ name: "fixture", panes: hostIds.map((hostId) => ({ hostId })), layout: { kind: "two" } }, signal);
  await expect.poll(() => runs.list()[0]?.panes.map(({ phase }) => phase)).toEqual(["ready", "ready"]);
  const [a, b] = runs.list()[0]!.panes;
  const binding = { id: opened.id, expectedLayoutRevision: opened.id };
  await expect(runs.changeLayout({ ...binding, change: { action: "layout", layout: { kind: "one" }, paneIds: [a!.paneId, a!.paneId] } }, signal)).rejects.toThrow("必须包含");
  const changed = await runs.changeLayout({ ...binding, change: { action: "layout", layout: { kind: "tabs" }, paneIds: [b!.paneId, a!.paneId] } }, signal);
  expect(changed.panes).toEqual([b, a]);
  await expect(runs.changeLayout({ ...binding, change: { action: "close", paneId: b!.paneId } }, signal)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const remaining = await runs.changeLayout({ ...binding, expectedLayoutRevision: changed.layoutRevision!, change: { action: "close", paneId: b!.paneId } }, signal);
  expect(remaining.panes).toEqual([a]);
  expect(manager.shellInfo(b!.sessionId!)?.state).toBe("ended");
  expect(manager.shellInfo(a!.sessionId!)?.state).toBe("running");
});
