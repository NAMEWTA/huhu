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
