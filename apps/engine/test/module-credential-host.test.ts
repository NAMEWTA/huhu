import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { unzipSync } from "fflate";
import { assert, expect, test } from "vitest";
import { z } from "zod";
import { boot, type RunningEngine } from "../src/boot.js";

test.skipIf(process.platform !== "win32" || process.arch !== "x64")("Windows 模块凭据与 Safe 锁独立，ZIP 恢复到新目录不继承系统密钥", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-module-host-"));
  const desktopUserData = path.join(fixture, "user-data");
  const vaultPath = path.join(fixture, "source");
  const restoredPath = path.join(fixture, "restored");
  const archive = path.join(fixture, "vault.zip");
  const marker = `synthetic-module-${randomUUID()}`;
  const definition = { target: "test.invalid" };
  let source: RunningEngine | undefined;
  let restored: RunningEngine | undefined;
  let savedRevision: string | undefined;
  mkdirSync(desktopUserData);
  mkdirSync(vaultPath);

  function owner(engine: RunningEngine) {
    assert(engine.moduleCredentialHost);
    return new ModuleCredentials({
      ...engine.moduleCredentialHost,
      vault: engine.vault,
      pluginId: "test.native.module",
      definition: z.strictObject({ target: z.string() }),
      targets: (value) => ({ password: value.target }),
    });
  }

  async function safe(engine: RunningEngine, capability: string, input: unknown = {}) {
    const result = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID() });
    assert(result.ok);
    return result.data;
  }

  try {
    source = await boot({ vaultPath, desktopUserData, create: true });
    const vaultId = source.vault.id;
    const instanceId = source.moduleCredentialHost?.localVaultInstanceId;
    expect(instanceId).toBeTypeOf("string");
    await safe(source, "safe.setup", { password: "fixture-only-test-safe" });
    await safe(source, "safe.lock");
    expect(await safe(source, "safe.status")).toMatchObject({ initialized: true, locked: true });

    const saved = await owner(source).save({ entityId: "fixture", expectedRevision: null, definition, actions: [{ purpose: "password", action: "replace", value: marker }] });
    savedRevision = saved.revision;
    expect(saved.authState.password).toBe("configured");
    expect(await owner(source).use("fixture", ["password"], async (_, keys) => keys.get("password") === marker)).toBe(true);

    const manifest = await exportPackage(vaultPath, archive);
    expect(manifest.files.some(({ path: file }) => file.startsWith(".huhu/module-credentials/"))).toBe(true);
    expect(Object.values(unzipSync(readFileSync(archive))).some((bytes) => Buffer.from(bytes).includes(marker))).toBe(false);
    expect(importPackage(archive, restoredPath).vaultId).toBe(vaultId);

    await source.shutdown();
    source = await boot({ vaultPath, desktopUserData });
    expect(source.moduleCredentialHost?.localVaultInstanceId).toBe(instanceId);
    expect(await safe(source, "safe.status")).toMatchObject({ initialized: true, locked: true });
    expect(await owner(source).use("fixture", ["password"], async (_, keys) => keys.get("password") === marker)).toBe(true);

    restored = await boot({ vaultPath: restoredPath, desktopUserData });
    expect(restored.moduleCredentialHost?.localVaultInstanceId).not.toBe(instanceId);
    expect((await owner(restored).list())[0]).toMatchObject({ revision: saved.revision, authState: { password: "needs-reconfiguration" } });
    await expect(owner(restored).use("fixture", ["password"], async () => true)).rejects.toMatchObject({ code: "unbound" });

    const cleared = await owner(source).save({ entityId: "fixture", expectedRevision: savedRevision, definition, actions: [{ purpose: "password", action: "clear" }] });
    savedRevision = undefined;
    expect(cleared.authState.password).toBe("unconfigured");
    await expect(owner(source).use("fixture", ["password"], async () => true)).rejects.toMatchObject({ code: "unconfigured" });
  } finally {
    try {
      if (source && savedRevision) await owner(source).save({ entityId: "fixture", expectedRevision: savedRevision, definition, actions: [{ purpose: "password", action: "clear" }] });
    } finally {
      await Promise.all([restored?.shutdown(), source?.shutdown()]);
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});

test.skipIf(process.platform !== "win32" || process.arch !== "x64")("Agent 启动环境的受保护变量随本机保存，ZIP 只保留配置", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-agent-environment-"));
  const vaultPath = path.join(fixture, "vault");
  const desktopUserData = path.join(fixture, "app-data");
  const archive = path.join(fixture, "profiles.zip");
  const restoredPath = path.join(fixture, "restored");
  const protectedValue = `synthetic-agent-value-${randomUUID()}`;
  const variable = "FIXTURE_PROTECTED";
  const publicFields = { name: "测试环境", provider: "codex", ordinary: [{ name: "FIXTURE_ORDINARY", value: "portable-fixture" }], protectedNames: [variable] };
  const prefix = "agent.launch.environments";
  const identity = z.object({ id: z.uuidv4(), revision: z.uuidv4() });
  let source: RunningEngine | undefined;
  let restored: RunningEngine | undefined;
  const call = (engine: RunningEngine, capability: string, input: unknown = {}, caller: Parameters<RunningEngine["dispatcher"]["call"]>[0] = "desktop") =>
    engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  const data = async (...args: Parameters<typeof call>) => {
    const outcome = await call(...args);
    assert(outcome.ok);
    return outcome.data;
  };
  try {
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    source = await boot({ vaultPath, desktopUserData, create: true });
    const input = { ...publicFields, expectedRevision: null, changes: [{ name: variable, action: "replace", value: protectedValue }] };
    expect(await call(source, `${prefix}.save`, input, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await call(source, `${prefix}.save`, input, "web:fixture")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const record = await data(source, `${prefix}.save`, input);
    const { id, revision } = identity.parse(record);
    expect(record).toMatchObject({ ...publicFields, states: { [variable]: "configured" } });
    expect(JSON.stringify(record).includes(protectedValue)).toBe(false);
    await data(source, "safe.setup", { password: "fixture-only-agent-safe" });
    await data(source, "safe.lock");
    expect(await data(source, `${prefix}.list`)).toMatchObject({ profiles: [record] });
    await data(source, "plugins.setEnabled", { id: "safe", enabled: false });
    expect(await data(source, `${prefix}.list`)).toMatchObject({ profiles: [record] });

    await exportPackage(vaultPath, archive);
    const restoredEntries = Object.entries(unzipSync(readFileSync(archive)));
    const bytes = restoredEntries.map(([, entry]) => entry);
    expect(bytes.some((entry) => Buffer.from(entry).includes(protectedValue))).toBe(false);
    expect(restoredEntries.some(([entryPath, entry]) => entryPath.startsWith(".huhu/module-credentials/") && Buffer.from(entry).includes("portable-fixture"))).toBe(true);
    importPackage(archive, restoredPath, { regenerateId: true });
    restored = await boot({ vaultPath: restoredPath, desktopUserData });
    expect(await data(restored, `${prefix}.list`)).toMatchObject({ profiles: [{ id, revision, ...publicFields, states: { [variable]: "needs-reconfiguration" } }] });

    const clear = { ...publicFields, id, expectedRevision: revision, protectedNames: [] };
    expect(await call(source, `${prefix}.save`, { ...clear, changes: [] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const cleared = await data(source, `${prefix}.save`, { ...clear, changes: [{ name: variable, action: "clear" }] });
    expect(cleared).toMatchObject({ id, protectedNames: [], states: {} });
    expect(await call(source, `${prefix}.save`, { ...clear, changes: [{ name: variable, action: "clear" }] })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  } finally {
    try {
      if (source) {
        const list = z.object({ profiles: z.array(identity) }).parse(await data(source, `${prefix}.list`));
        for (const { id, revision } of list.profiles) await data(source, `${prefix}.remove`, { id, expectedRevision: revision });
      }
    } finally {
      await Promise.all([restored?.shutdown(), source?.shutdown()]);
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});
