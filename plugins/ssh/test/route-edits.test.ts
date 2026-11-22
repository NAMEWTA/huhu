import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { afterEach, expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection, definition, owner } from "../../../packages/kernel/test/fixtures/credentials.js";
import { Vault } from "../../../packages/vault/src/index.js";
import { ConfigureHost } from "../src/engine/auth-profile.js";
import { HostConfigurations, type ManagedHost } from "../src/engine/host-configurations.js";
import { HostStore } from "../src/engine/hosts.js";
import { type EditHostRoutes, maxRouteEditTargets } from "../src/engine/route-edits.js";
import { routeForHost } from "../src/shared/route.js";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const signal = new AbortController().signal;
const associate = (jumpHostId: string, ifExists: "skip" | "replace" = "skip"): EditHostRoutes["change"] => ({ action: "associate", jumpHostId, ifExists });
const setEnabled = (enabled: boolean): EditHostRoutes["change"] => ({ action: "setEnabled", enabled });
const fixturePassword = "synthetic-route-password";
const id = () => "host-owned-" + randomUUID().replaceAll("-", "");

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-route-edits-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const localRoot = path.join(root, "private");
  const backend = path.join(root, "backend");
  const volume = path.join(root, "vault");
  mkdirSync(localRoot);
  mkdirSync(backend);
  mkdirSync(volume);
  const protection = new TestProtection(backend);
  const vault = await Vault.open(volume, { create: true });
  cleanups.push(() => vault.close());
  const legacyDir = path.join(vault.stateDir, "ssh", "hosts");
  const configurations = (instance = "fixture", opened = vault) => new HostConfigurations(new HostStore(legacyDir), { vault: opened, localRoot, localVaultInstanceId: instance, protection });
  const hosts = configurations();
  function add(name: string, jumpHostId?: string, password?: string, disabled?: boolean) {
    return hosts
      .configure(
        ConfigureHost.parse({
          name,
          host: "127.0.0.1",
          user: "fixture",
          port: 2222,
          tags: ["fixture"],
          expectedRevision: null,
          authKind: password ? "password" : "agent",
          jumpHostIds: jumpHostId ? [jumpHostId] : [],
          routeDisabled: disabled,
          credentials: password ? [{ action: "replace", purpose: "password", value: password }] : [],
        }),
        signal,
      )
      .then(({ hostId, revision }) => ({ hostId, expectedRevision: revision }));
  }
  const read = async () => new Map((await hosts.list()).filter((host): host is ManagedHost => "revision" in host).map((host) => [host.id, host]));
  const portable = () => {
    const dir = path.join(vault.root, ".huhu", "module-credentials");
    return readFileSync(path.join(dir, readdirSync(dir)[0]!));
  };
  const localFiles = (ext: string) =>
    readdirSync(localRoot, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(ext))
      .sort();
  return { add, hosts, read, portable, localFiles, localRoot, protection, root, vault, configurations, legacyDir };
}

test("批量跳过和覆盖只编辑显式目标，并一次发布整批且保留锁定认证", async () => {
  const { add, hosts, read, portable, localFiles, protection, vault } = await setup();
  const oldJump = await add("原跳板");
  const newJump = await add("新跳板");
  const a = await add("甲", undefined, fixturePassword);
  const b = await add("乙");
  const c = await add("丙", oldJump.hostId, undefined, true);
  const outside = await add("未选中", oldJump.hostId);
  const before = await read();
  const ciphertexts = localFiles(".bin");
  const write = vi.spyOn(vault.files, "write");
  const protectionRead = vi.spyOn(protection, "read");
  const create = vi.spyOn(protection, "create");
  const remove = vi.spyOn(protection, "remove");
  protection.unavailable = "locked";
  await expect(hosts.editRoutes({ targets: [a, b, c], change: associate(newJump.hostId) }, signal)).resolves.toEqual({ updated: [a.hostId, b.hostId], skipped: [c.hostId] });
  expect(write).toHaveBeenCalledTimes(1);
  expect(protectionRead).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(localFiles(".bin")).toEqual(ciphertexts);
  expect(portable().includes(fixturePassword)).toBe(false);
  const changed = await read();
  expect(changed.get(a.hostId)).toEqual({
    ...before.get(a.hostId),
    revision: expect.not.stringMatching(a.expectedRevision),
    jumpHostIds: [newJump.hostId],
    authState: { password: "temporarily-unavailable" },
    configured: false,
  });
  expect(changed.get(b.hostId)?.jumpHostIds).toEqual([newJump.hostId]);
  expect(changed.get(c.hostId)).toEqual(before.get(c.hostId));
  expect(changed.get(outside.hostId)).toEqual(before.get(outside.hostId));
  protection.unavailable = undefined;
  await hosts.withAuthentication((await read()).get(a.hostId)!, async (auth) => {
    expect(auth.password).toBe(fixturePassword);
  });
  await expect(hosts.editRoutes({ targets: [c], change: associate(newJump.hostId, "replace") }, signal)).resolves.toEqual({ updated: [c.hostId], skipped: [] });
  expect((await read()).get(c.hostId)).toMatchObject({ jumpHostIds: [newJump.hostId], routeDisabled: true });
});

test("校验所有版本、边界、自指及停止的路由中的循环，失败保持原文件", async () => {
  const { add, hosts, portable, legacyDir, vault } = await setup();
  const a = await add("甲");
  const b = await add("乙", a.hostId);
  const c = await add("丙", b.hostId, undefined, true);
  const independent = await add("独立主机");
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(path.join(legacyDir, "legacy.json"), JSON.stringify({ id: "legacy", name: "旧式", host: "127.0.0.1", user: "fixture", auth: { kind: "agent" } }));
  const before = portable();
  const write = vi.spyOn(vault.files, "write");
  const stale = { ...b, expectedRevision: randomUUID() };
  const unknown = { hostId: id(), expectedRevision: randomUUID() };

  await expect(hosts.editRoutes({ targets: [independent, stale], change: associate(c.hostId) }, signal)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  await expect(hosts.editRoutes({ targets: [independent, unknown], change: associate(c.hostId) }, signal)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(hosts.editRoutes({ targets: [independent], change: associate(id()) }, signal)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(hosts.editRoutes({ targets: [independent], change: associate("legacy") }, signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(hosts.editRoutes({ targets: [independent, c], change: associate(c.hostId, "replace") }, signal)).rejects.toThrow("自身");
  await expect(hosts.editRoutes({ targets: [independent, a], change: associate(c.hostId, "replace") }, signal)).rejects.toThrow("循环");
  await expect(hosts.editRoutes({ targets: [b, independent], change: setEnabled(false) }, signal)).rejects.toThrow("尚未设置跳板");
  await expect(hosts.editRoutes({ targets: [a, a], change: associate(c.hostId) }, signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(hosts.editRoutes({ targets: [], change: setEnabled(false) }, signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const manyTargets = Array.from({ length: maxRouteEditTargets + 1 }, () => ({ ...a, hostId: id() }));
  await expect(hosts.editRoutes({ targets: manyTargets, change: setEnabled(false) }, signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const aborted = AbortSignal.abort();
  await expect(hosts.editRoutes({ targets: [b, c], change: setEnabled(false) }, aborted)).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
  expect(write).not.toHaveBeenCalled();
  expect(portable()).toEqual(before);
});

test("完整配置图拒绝旧式跳板，整批替换坏边后可保存", async () => {
  const { add, hosts, read, legacyDir } = await setup();
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(path.join(legacyDir, "legacy.json"), JSON.stringify({ id: "legacy", name: "旧式", host: "127.0.0.1", user: "fixture", auth: { kind: "agent" } }));
  // The preexisting single-host API can store a reference to an old directory row.
  const legacy = await add("旧式引用", "legacy");
  const a = await add("甲");
  const jump = await add("新跳板");
  await expect(hosts.editRoutes({ targets: [a], change: associate(jump.hostId) }, signal)).rejects.toThrow("旧式引用");
  await expect(hosts.editRoutes({ targets: [a, legacy], change: associate(jump.hostId, "replace") }, signal)).resolves.toEqual({ updated: [a.hostId, legacy.hostId], skipped: [] });
  expect((await read()).get(legacy.hostId)?.jumpHostIds).toEqual([jump.hostId]);
});

test("启停保留实际连接的旧路径和配置边，重复状态不写入", async () => {
  const { add, hosts, read, vault } = await setup();
  const jump = await add("跳板");
  const a = await add("甲", jump.hostId);
  const b = await add("乙", a.hostId);
  const oldPath = routeForHost(await read(), b.hostId);
  const write = vi.spyOn(vault.files, "write");
  await expect(hosts.editRoutes({ targets: [a, b], change: setEnabled(false) }, signal)).resolves.toEqual({ updated: [a.hostId, b.hostId], skipped: [] });
  const stopped = await read();
  expect(oldPath.map(({ id }) => id)).toEqual([jump.hostId, a.hostId, b.hostId]);
  expect(routeForHost(stopped, b.hostId).map(({ id }) => id)).toEqual([b.hostId]);
  expect(stopped.get(a.hostId)).toMatchObject({ jumpHostIds: [jump.hostId], routeDisabled: true });
  expect(stopped.get(b.hostId)).toMatchObject({ jumpHostIds: [a.hostId], routeDisabled: true });
  const current = [a, b].map(({ hostId }) => ({ hostId, expectedRevision: stopped.get(hostId)!.revision }));
  await expect(hosts.editRoutes({ targets: current, change: setEnabled(false) }, signal)).resolves.toEqual({ updated: [], skipped: [a.hostId, b.hostId] });
  expect(write).toHaveBeenCalledTimes(1);
  await expect(hosts.editRoutes({ targets: current, change: setEnabled(true) }, signal)).resolves.toEqual({ updated: [a.hostId, b.hostId], skipped: [] });
  expect(routeForHost(await read(), b.hostId).map(({ id }) => id)).toEqual([jump.hostId, a.hostId, b.hostId]);
});

test("批量路由写入排队后取消，保留原定义和凭据快照", async () => {
  const { add, hosts, portable, localFiles, vault } = await setup();
  const a = await add("甲", undefined, fixturePassword);
  const b = await add("乙", undefined, fixturePassword);
  const jump = await add("跳板");
  const before = portable();
  const snapshots = localFiles(".json");
  const abort = new AbortController();
  const write = vault.files.write.bind(vault.files);
  vi.spyOn(vault.files, "write").mockImplementationOnce(async (file, bytes, options) => {
    const earlier = write(file, before, options?.expectedVersion !== undefined ? { expectedVersion: options.expectedVersion } : {});
    const queued = write(file, bytes, options);
    abort.abort();
    await earlier;
    return queued;
  });
  const edit = { targets: [a, b], change: associate(jump.hostId) };
  await expect(hosts.editRoutes(edit, abort.signal)).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
  expect(portable()).toEqual(before);
  expect(localFiles(".json")).toEqual(snapshots);
  await expect(hosts.editRoutes(edit, signal)).resolves.toEqual({ updated: [a.hostId, b.hostId], skipped: [] });
});

test("CAS 冲突回收暂存，独立服务共享队列并保留并发认证的快照 pin", async () => {
  const { add, hosts, read, localFiles, localRoot, portable, vault, configurations } = await setup();
  const a = await add("甲", undefined, fixturePassword);
  const b = await add("乙", undefined, fixturePassword);
  const jump = await add("跳板");
  const before = portable();
  const snapshots = localFiles(".json");
  const spec = { targets: [a, b], change: associate(jump.hostId) };
  const write = vi.spyOn(vault.files, "write").mockRejectedValueOnce(errors.versionConflict("fixture"));
  await expect(hosts.editRoutes(spec, signal)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(portable()).toEqual(before);
  expect(localFiles(".json")).toEqual(snapshots);

  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const auth = hosts.withAuthentication((await read()).get(a.hostId)!, async (current) => {
    markStarted();
    await released;
    expect(current.password).toBe(fixturePassword);
  });
  await Promise.race([started, auth]);
  try {
    const results = await Promise.allSettled([hosts.editRoutes(spec, signal), configurations().editRoutes(spec, signal)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(write).toHaveBeenCalledTimes(2);
    const oldSnapshot = snapshots.find((file) => file.endsWith(a.expectedRevision + ".json"))!;
    expect(existsSync(path.join(localRoot, oldSnapshot))).toBe(true);
  } finally {
    release();
    await auth;
  }
  expect(localFiles(".json")).toHaveLength(2);
  expect(localFiles(".json")).not.toEqual(expect.arrayContaining(snapshots));
});

test("支持已知未在本机绑定的配置，拒绝无法解释的快照缺失或只读 Vault", async () => {
  const { add, configurations, localFiles, localRoot, portable, root, vault } = await setup();
  const a = await add("甲", undefined, fixturePassword);
  const jump = await add("跳板");
  const copied = configurations("copied");
  const edit = { targets: [a], change: associate(jump.hostId) };
  await expect(copied.editRoutes(edit, signal)).resolves.toEqual({ updated: [a.hostId], skipped: [] });
  const changed = (await copied.list()).find((host) => host.id === a.hostId) as ManagedHost;
  expect(changed.authState).toEqual({ password: "needs-reconfiguration" });

  const corrupt = await add("本地快照缺失", undefined, fixturePassword);
  const snapshot = localFiles(".json").find((file) => file.endsWith(corrupt.expectedRevision + ".json"))!;
  rmSync(path.join(localRoot, snapshot));
  const before = portable();
  const ciphertexts = localFiles(".bin");
  await expect(configurations().editRoutes({ targets: [corrupt], change: associate(jump.hostId) }, signal)).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
  expect(portable()).toEqual(before);
  expect(localFiles(".bin")).toEqual(ciphertexts);

  const readOnly = await Vault.open(path.join(root, "vault"), { readOnly: true });
  cleanups.push(() => readOnly.close());
  await expect(configurations("copied", readOnly).editRoutes({ ...edit, targets: [{ hostId: changed.id, expectedRevision: changed.revision }] }, signal)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  expect(portable()).toEqual(before);
  expect(vault.readOnly).toBe(false);
});

test("定义编辑拒绝携带凭据目标变化的更新", async () => {
  const { root, vault } = await setup();
  const credentials = owner(vault, root);
  const { entityId, revision } = await credentials.save({
    entityId: "fixture",
    expectedRevision: null,
    definition,
    actions: [
      { action: "keep", purpose: "password" },
      { action: "keep", purpose: "passphrase" },
    ],
  });
  await expect(credentials.editDefinitions([{ entityId, expectedRevision: revision }], () => new Map([[entityId, { ...definition, host: "other.invalid" }]]), signal)).rejects.toMatchObject({ code: "invalid-input" });
  expect((await credentials.list())[0]).toMatchObject({ revision, definition });
});

test("Engine 工作台批量编辑同一主机配置目录，外部入口未开放此工作台动作", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-engine-route-edits-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  const engine = await boot({ vaultPath, desktopUserData, create: true, moduleCredentialProtection: new TestProtection(desktopUserData) });
  cleanups.push(() => engine.shutdown());
  const call = (capability: string, input: unknown = {}, caller: "desktop" | "cli" = "desktop") => engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  async function add(name: string) {
    const result = await call("ssh.hosts.configure", { name, host: "127.0.0.1", user: "fixture", authKind: "agent", expectedRevision: null });
    if (!result.ok) throw new Error(result.error.code);
    const { hostId, revision } = result.data as { hostId: string; revision: string };
    return { hostId, expectedRevision: revision };
  }
  const jump = await add("跳板");
  const left = await add("甲");
  const right = await add("乙");
  const capability = "ssh.routes.edit";
  const input = { targets: [left, right], change: associate(jump.hostId) };
  expect(engine.registry.getDescriptor(capability)).toMatchObject({ plugin: "ssh", defaultExposed: false });
  expect(await call(capability, input, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await call(capability, input)).toEqual({ ok: true, data: { updated: [left.hostId, right.hostId], skipped: [] } });
  expect(await call(capability, input)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await call("ssh.hosts.list")).toMatchObject({
    ok: true,
    data: expect.arrayContaining([left, right].map(({ hostId }) => expect.objectContaining({ id: hostId, jumpHostIds: [jump.hostId] }))),
  });
});
