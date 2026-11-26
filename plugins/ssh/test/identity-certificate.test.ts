import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import ssh2, { type ParsedKey } from "ssh2";
import { afterEach, expect, test, vi } from "vitest";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { Vault } from "../../../packages/vault/src/index.js";
import { ConfigureHost } from "../src/engine/auth-profile.js";
import { testSshDraft } from "../src/engine/draft-connection.js";
import { HostConfigurations, type ManagedHost } from "../src/engine/host-configurations.js";
import { HostStore } from "../src/engine/hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { fingerprintSha256 } from "../src/engine/known-hosts.js";

const certificateType = "ssh-ed25519-cert-v01@openssh.com";
const principal = "certificate-principal-fixture";
const keyId = "certificate-key-id-fixture";
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function signer(key: string, passphrase?: string): ParsedKey {
  const parsed = ssh2.utils.parseKey(key, passphrase);
  if (parsed instanceof Error) throw parsed;
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first?.isPrivateKey()) throw new Error("Missing fixture private key");
  return first;
}

/** ssh2 occasionally writes an encrypted Ed25519 key it cannot parse back; keep generating until it round-trips. */
function parsableEd25519(passphrase?: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pair = ssh2.utils.generateKeyPairSync("ed25519", passphrase ? { passphrase, cipher: "aes256-ctr", rounds: 16 } : undefined);
    if (!(ssh2.utils.parseKey(pair.private, passphrase) instanceof Error)) return pair;
  }
  throw new Error("ssh2 did not produce a parsable Ed25519 fixture key");
}

function uint32(number: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(number);
  return bytes;
}

function uint64(number: bigint) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(number);
  return bytes;
}

function sshString(data: string | Buffer) {
  const bytes = typeof data === "string" ? Buffer.from(data) : data;
  return Buffer.concat([uint32(bytes.length), bytes]);
}

function issueCertificate(subject: ParsedKey, ca: ParsedKey, { kind = 1, serial = 1n, principals = sshString(principal), validAfter = 1n, validBefore = 2n } = {}) {
  // The fixture has fixed validity and an intentionally unrelated principal.
  // The client should pair the key regardless of the server's authorization policy.
  const barePublicKey = subject.getPublicSSH();
  const algorithmLength = barePublicKey.readUInt32BE(0);
  const body = Buffer.concat([
    sshString(certificateType),
    sshString(Buffer.alloc(32)),
    barePublicKey.subarray(4 + algorithmLength),
    uint64(serial),
    uint32(kind),
    sshString(keyId),
    sshString(principals),
    uint64(validAfter),
    uint64(validBefore),
    sshString(Buffer.alloc(0)),
    sshString(Buffer.concat([sshString("permit-pty"), sshString(Buffer.alloc(0))])),
    sshString(Buffer.alloc(0)),
    sshString(ca.getPublicSSH()),
  ]);
  const signature = ca.sign(body);
  if (signature instanceof Error) throw signature;
  const blob = Buffer.concat([body, sshString(Buffer.concat([sshString(ca.type), sshString(signature)]))]);
  return { blob, line: `${certificateType} ${blob.toString("base64")}` };
}

async function setup(options: { passphrase?: string; ed25519?: boolean; port?: number; user?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ssh-certificate-"));
  cleanups.push(() => rmSync(root, { force: true, recursive: true }));
  const volume = path.join(root, "vault");
  const localRoot = path.join(root, "local");
  const backend = path.join(root, "test-protection");
  for (const directory of [volume, localRoot, backend]) mkdirSync(directory);
  const vault = await Vault.open(volume, { create: true });
  cleanups.push(() => vault.close());
  const hosts = new HostConfigurations(new HostStore(path.join(vault.stateDir, "ssh", "hosts")), {
    vault,
    localRoot,
    localVaultInstanceId: "certificate-fixture",
    protection: new TestProtection(backend),
  });
  const passphrase = options.passphrase;
  const pair = options.ed25519 === false ? ssh2.utils.generateKeyPairSync("ecdsa", { bits: 256 }) : parsableEd25519(passphrase);
  const subject = signer(pair.private, passphrase);
  const ca = signer(ssh2.utils.generateKeyPairSync("ed25519").private);
  const identity = path.join(root, "fixture-key");
  const companion = identity + "-cert.pub";
  writeFileSync(identity, pair.private, { mode: 0o600 });
  const input = ConfigureHost.parse({
    name: "synthetic certificate host",
    host: "127.0.0.1",
    port: options.port ?? 2222,
    user: options.user ?? "saved-account",
    authKind: "identity-file",
    expectedRevision: null,
    credentials: [{ action: "replace", purpose: "identityFile", value: identity }, ...(passphrase ? [{ action: "replace", purpose: "passphrase", value: passphrase }] : [])],
  });
  const saved = await hosts.configure(input, new AbortController().signal);
  const host = (await hosts.list()).find((entry): entry is ManagedHost => entry.id === saved.hostId && "revision" in entry)!;
  const draft = { ...input, hostId: host.id, expectedRevision: host.revision, credentials: [] };
  return { root, volume, hosts, host, draft, identity, companion, subject, ca, privateKey: pair.private };
}

test("证书文件不存在时继续提交裸钥", async () => {
  const { hosts, host, privateKey } = await setup();
  const connect = vi.fn(async () => {});
  await hosts.withAuthentication(host, connect);
  expect(connect).toHaveBeenCalledExactlyOnceWith({ privateKey });
});

test("已有 Ed25519 身份配对加密私钥，并在下次认证读取续期证书", async () => {
  const passphrase = "generated encryption fixture";
  const { volume, hosts, host, draft, identity, companion, subject, ca, privateKey } = await setup({ passphrase });
  const first = issueCertificate(subject, ca);
  writeFileSync(companion, `${first.line} fixture-comment\r\n`);
  const connect = vi.fn(async () => {});
  await hosts.withAuthentication(host, connect);
  expect(connect).toHaveBeenCalledExactlyOnceWith({ privateKey, passphrase, publicKeyCertificate: first.line });
  const renewed = issueCertificate(subject, ca, { serial: 2n });
  writeFileSync(companion, renewed.line + "\n");
  await hosts.withDraftAuthentication(draft, host, connect);
  expect(connect).toHaveBeenNthCalledWith(2, { privateKey, passphrase, publicKeyCertificate: renewed.line });
  await hosts.withAuthentication(host, connect);
  expect(connect).toHaveBeenNthCalledWith(3, { privateKey, passphrase, publicKeyCertificate: renewed.line });

  const definitions = path.join(volume, ".huhu", "module-credentials");
  const portable = readFileSync(path.join(definitions, readdirSync(definitions)[0]!), "utf8");
  for (const output of [portable, JSON.stringify(await hosts.list())]) {
    for (const secret of [identity, passphrase, renewed.line, principal, keyId]) expect(output).not.toContain(secret);
  }
});

test("正常连接、草稿与外部连接都给现有 Client 传递证书和原私钥", async () => {
  const { root, hosts, host, draft, companion, subject, ca, privateKey } = await setup();
  const certificate = issueCertificate(subject, ca).line;
  writeFileSync(companion, certificate);
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    now: () => new Date(),
    withManagedAuth: (configured, connect) => hosts.withAuthentication(configured, connect),
    publish: () => undefined,
  });
  cleanups.push(() => manager.disposeAll());
  const dial = vi.spyOn(ssh2.Client.prototype, "connect").mockImplementation(function (this: ssh2.Client) {
    queueMicrotask(() => this.emit("ready"));
    return this;
  });
  const external = new AbortController();
  cleanups.push(() => external.abort());
  const validate = vi.fn();

  await manager.connect(host.id);
  await expect(testSshDraft(hosts, manager, draft, external.signal)).resolves.toEqual({ state: "authenticated" });
  await manager.openExternalConnection(
    [host],
    external.signal,
    validate,
    () => undefined,
    () => undefined,
  ).ready;
  expect(validate).toHaveBeenCalled();
  expect(dial).toHaveBeenCalledTimes(3);
  for (const [config] of dial.mock.calls) {
    expect(config).toMatchObject({ host: host.host, port: host.port, username: host.user, privateKey, publicKeyCertificate: certificate });
    expect(config).not.toHaveProperty("identityFile");
  }
});

test("桌面草稿测试新选身份的伴随证书，改址后不继承已保存身份", async () => {
  const { root, hosts, host, draft, privateKey, companion, subject, ca } = await setup();
  writeFileSync(companion, "无效的已保存证书");
  const connect = vi.fn(async () => {});
  await expect(hosts.withDraftAuthentication(draft, host, connect)).rejects.toMatchObject({
    code: "SSH_AUTH_FAILED",
    details: { reason: "identity-certificate-invalid" },
  });
  expect(connect).not.toHaveBeenCalled();
  await hosts.withDraftAuthentication({ ...draft, port: draft.port + 1 }, host, connect);
  expect(connect).toHaveBeenCalledExactlyOnceWith({});

  const alternate = path.join(root, "unsaved-fixture-key");
  writeFileSync(alternate, privateKey);
  const certificate = issueCertificate(subject, ca).line;
  writeFileSync(alternate + "-cert.pub", certificate);
  await hosts.withDraftAuthentication({ ...draft, credentials: [{ action: "replace", purpose: "identityFile", value: alternate }] }, host, connect);
  expect(connect).toHaveBeenNthCalledWith(2, { privateKey, publicKeyCertificate: certificate });
});

test("非 Ed25519 身份可用裸钥，存在不支持的伴随证书时拒绝拨号", async () => {
  const { hosts, host, privateKey, companion } = await setup({ ed25519: false });
  const connect = vi.fn(async () => {});
  await hosts.withAuthentication(host, connect);
  expect(connect).toHaveBeenCalledExactlyOnceWith({ privateKey });
  writeFileSync(companion, "unsupported fixture");
  await expect(hosts.withAuthentication(host, connect)).rejects.toMatchObject({ code: "SSH_AUTH_FAILED", details: { reason: "identity-certificate-unsupported" } });
  expect(connect).toHaveBeenCalledTimes(1);
});

test("版本冲突优先于证书配对", async () => {
  const { hosts, host, draft, companion } = await setup();
  await hosts.configure({ ...draft, name: "edited fixture" }, new AbortController().signal);
  writeFileSync(companion, "invalid");
  const connect = vi.fn(async () => {});
  await expect(hosts.withAuthentication(host, connect)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  await expect(hosts.withDraftAuthentication(draft, host, connect)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(connect).not.toHaveBeenCalled();
});

test("无效格式、主机证书与错配主体是互相可区分的本机错误", async () => {
  const { hosts, host, companion, subject, ca } = await setup();
  const valid = issueCertificate(subject, ca);
  const wrongSubject = signer(ssh2.utils.generateKeyPairSync("ed25519").private);
  const connect = vi.fn(async () => {});
  const format = (blob: Buffer) => `${certificateType} ${blob.toString("base64")}`;
  for (const [line, reason] of [
    [`ssh-ed25519 ${subject.getPublicSSH().toString("base64")}`, "identity-certificate-invalid"],
    [`${certificateType} AA=A`, "identity-certificate-invalid"],
    [format(valid.blob.subarray(0, -1)), "identity-certificate-invalid"],
    [format(Buffer.concat([valid.blob, Buffer.from([0])])), "identity-certificate-invalid"],
    [issueCertificate(subject, ca, { principals: uint32(0xffff_ffff) }).line, "identity-certificate-invalid"],
    [issueCertificate(subject, ca, { kind: 2 }).line, "identity-certificate-not-user"],
    [issueCertificate(wrongSubject, ca).line, "identity-certificate-mismatch"],
  ] as const) {
    writeFileSync(companion, line + "\n");
    const failure = await hosts.withAuthentication(host, connect).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "SSH_AUTH_FAILED", details: { reason } });
    for (const secret of [companion, principal, keyId, line]) expect(JSON.stringify(failure)).not.toContain(secret);
  }
  expect(connect).not.toHaveBeenCalled();
});

test("拒绝目录和超过上限的伴随文件", async () => {
  const { hosts, host, companion } = await setup();
  mkdirSync(companion);
  const connect = vi.fn(async () => {});
  await expect(hosts.withAuthentication(host, connect)).rejects.toMatchObject({
    code: "SSH_AUTH_FAILED",
    details: { reason: "identity-certificate-unavailable" },
  });
  rmSync(companion, { recursive: true });
  writeFileSync(companion, "");
  truncateSync(companion, 64 * 1024 + 1);
  await expect(hosts.withAuthentication(host, connect)).rejects.toMatchObject({
    code: "SSH_AUTH_FAILED",
    details: { reason: "identity-certificate-too-large" },
  });
  expect(connect).not.toHaveBeenCalled();
});

test.skipIf(process.platform === "win32")("悬空符号链接不能触发裸钥登录", async () => {
  const { root, hosts, host, companion } = await setup();
  symlinkSync(path.join(root, "missing-fixture-cert"), companion);
  const connect = vi.fn(async () => {});
  await expect(hosts.withAuthentication(host, connect)).rejects.toMatchObject({
    code: "SSH_AUTH_FAILED",
    details: { reason: "identity-certificate-unavailable" },
  });
  expect(connect).not.toHaveBeenCalled();
});

const sshd = process.env["HUHU_TEST_OPENSSH_SSHD"];

async function loopbackPort() {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  const released = once(reservation, "close");
  reservation.close();
  await released;
  return port;
}

async function startSshd(config: string, port: number) {
  const server = spawn(sshd!, ["-D", "-e", "-f", config], { stdio: ["ignore", "ignore", "pipe"] });
  let output = "";
  server.once("error", (error) => {
    output += error.message;
  });
  server.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  const stopped = new Promise<void>((resolve) => server.once("close", () => resolve()));
  cleanups.push(async () => {
    server.kill();
    await stopped;
  });
  await expect.poll(() => output, { timeout: 2500 }).toContain(`Server listening on 127.0.0.1 port ${port}`);
  return () => output;
}

test.skipIf(process.platform !== "linux" || !sshd)("OpenSSH 服务端接受配对证书，拒绝后不尝试同一裸钥", { timeout: 15_000 }, async () => {
  const port = await loopbackPort();
  const { username: user } = userInfo();
  const { root, hosts, host, draft, companion, subject, ca } = await setup({ port, user, passphrase: "fixture key passphrase" });
  const pathFor = (name: string) => path.join(root, name);
  const serverKey = ssh2.utils.generateKeyPairSync("ed25519");
  writeFileSync(pathFor("server-key"), serverKey.private.trimEnd() + "\n", { mode: 0o600 });
  writeFileSync(pathFor("ca.pub"), `${ca.type} ${ca.getPublicSSH().toString("base64")}\n`);
  writeFileSync(pathFor("authorized_keys"), "", { mode: 0o600 });
  writeFileSync(pathFor("known_hosts"), `[127.0.0.1]:${port} ${serverKey.public.trimEnd()}\n`);
  writeFileSync(
    pathFor("sshd_config"),
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${pathFor("server-key")}`,
      `PidFile ${pathFor("sshd.pid")}`,
      `TrustedUserCAKeys ${pathFor("ca.pub")}`,
      `AuthorizedKeysFile ${pathFor("authorized_keys")}`,
      `AllowUsers ${user}`,
      "StrictModes no",
      "UsePAM no",
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "AuthenticationMethods publickey",
      "PermitUserRC no",
      "DisableForwarding yes",
      "ForceCommand /bin/echo huhu-certificate-fixture",
      "",
    ].join("\n"),
  );

  await startSshd(pathFor("sshd_config"), port);

  const manager = new SshManager({
    hosts,
    knownHostsFile: pathFor("known_hosts"),
    auditDir: pathFor("audit"),
    now: () => new Date(),
    withManagedAuth: (configured, connect) => hosts.withAuthentication(configured, connect),
    publish: () => undefined,
  });
  cleanups.push(() => manager.disposeAll());
  const now = BigInt(Math.floor(Date.now() / 1000));
  const validity = { validAfter: now - 300n, validBefore: now + 300n };
  const valid = issueCertificate(subject, ca, { ...validity, principals: sshString(user) });
  writeFileSync(companion, valid.line + "\n");
  await expect(testSshDraft(hosts, manager, draft, new AbortController().signal)).resolves.toEqual({ state: "authenticated" });
  await manager.connect(host.id);
  await expect(manager.exec(host.id, "ignored by fixture")).resolves.toMatchObject({ stdout: "huhu-certificate-fixture\n", exitCode: 0 });
  manager.disconnect(host.id);

  rmSync(companion);
  await expect(manager.connect(host.id)).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
  writeFileSync(pathFor("authorized_keys"), `${subject.type} ${subject.getPublicSSH().toString("base64")}\n`);
  const rejected = issueCertificate(subject, ca, { ...validity, principals: sshString("other-fixture-principal") });
  writeFileSync(companion, rejected.line + "\n");
  await expect(manager.connect(host.id)).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
  rmSync(companion);
  await manager.connect(host.id);
  manager.disconnect(host.id);
});

test.skipIf(process.platform !== "linux" || !sshd)("同一 OpenSSH 传输用批准 CA 验证主机，重协商后仍在原连接，拒绝错误 CA 与已撤销叶钥", { timeout: 20_000 }, async () => {
  const port = await loopbackPort();
  const { username: user } = userInfo();
  const { root, hosts, host, subject, ca } = await setup({ port, user });
  const pathFor = (name: string) => path.join(root, name);
  const serverKey = ssh2.utils.generateKeyPairSync("ed25519");
  const serverLeaf = signer(serverKey.private);
  const authorityLine = (key: ParsedKey) => `${key.type} ${key.getPublicSSH().toString("base64")}`;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const certificate = issueCertificate(serverLeaf, ca, { kind: 2, principals: sshString("127.0.0.1"), validAfter: now - 300n, validBefore: now + 300n });
  writeFileSync(pathFor("server-key"), serverKey.private.trimEnd() + "\n", { mode: 0o600 });
  writeFileSync(pathFor("server-key-cert.pub"), certificate.line + "\n");
  writeFileSync(pathFor("authorized_keys"), `${authorityLine(subject)}\n`, { mode: 0o600 });
  writeFileSync(
    pathFor("sshd_config"),
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${pathFor("server-key")}`,
      `HostCertificate ${pathFor("server-key-cert.pub")}`,
      `PidFile ${pathFor("sshd.pid")}`,
      `AuthorizedKeysFile ${pathFor("authorized_keys")}`,
      `AllowUsers ${user}`,
      "StrictModes no",
      "UsePAM no",
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "AuthenticationMethods publickey",
      "PermitUserRC no",
      "DisableForwarding yes",
      "LogLevel DEBUG1",
      "RekeyLimit 16K",
      "ForceCommand /usr/bin/head -c 131072 /dev/zero",
      "",
    ].join("\n"),
  );
  const log = await startSshd(pathFor("sshd_config"), port);
  const knownHostsFile = pathFor("known_hosts");
  const manager = new SshManager({ hosts, knownHostsFile, auditDir: pathFor("audit"), now: () => new Date(), withManagedAuth: (configured, run) => hosts.withAuthentication(configured, run), publish: () => undefined });
  cleanups.push(() => manager.disposeAll());
  expect(manager.knownAuthorities()).toEqual({ revision: null, authorities: [] });
  const { revision, authorities } = await manager.addHostAuthority(host, authorityLine(ca), null, new AbortController().signal);
  const [authority] = authorities;
  expect(authority).toMatchObject({ scope: `[127.0.0.1]:${port}`, keyType: "ssh-ed25519", fingerprint: fingerprintSha256(ca.getPublicSSH()) });
  const { attemptId } = await manager.connect(host.id);
  const result = await manager.exec(host.id, "fixture byte count");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toHaveLength(131072);
  await expect.poll(() => log().match(/SSH2_MSG_NEWKEYS sent/gu)?.length ?? 0).toBeGreaterThan(1);
  expect(manager.connectionStatuses()).toMatchObject([{ attemptId, state: "connected", route: [{ verifiedHost: { kind: "certificate", fingerprint: fingerprintSha256(serverLeaf.getPublicSSH()), authority: authority!.fingerprint } }] }]);
  manager.disconnect(host.id);

  const approved = readFileSync(knownHostsFile, "utf8");
  const authentications = () => log().match(/userauth-request.*method publickey/gu)?.length ?? 0;
  const before = authentications();
  expect(before).toBeGreaterThan(0);
  const wrongCa = signer(ssh2.utils.generateKeyPairSync("ed25519").private);
  await manager.removeHostAuthority(authority!, revision, new AbortController().signal);
  await manager.addHostAuthority(host, authorityLine(wrongCa), manager.knownAuthorities().revision, new AbortController().signal);
  await expect(manager.connect(host.id)).rejects.toMatchObject({ code: "SSH_HOST_KEY_MISMATCH", details: { reason: "untrusted-ca", hop: 0 } });
  writeFileSync(knownHostsFile, `${approved}@revoked [127.0.0.1]:${port} ${authorityLine(serverLeaf)}\n`);
  await expect(manager.connect(host.id)).rejects.toMatchObject({ code: "SSH_HOST_KEY_MISMATCH", details: { reason: "revoked", hop: 0 } });
  expect(authentications()).toBe(before);
});
