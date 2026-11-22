param([Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$root=(Get-Content -Raw -LiteralPath (Join-Path $Evidence 'layout.json') | ConvertFrom-Json).root
$utf8=New-Object System.Text.UTF8Encoding($false)
function ReadText($relative) {
 [IO.File]::ReadAllText((Join-Path $root $relative)).Replace("`r`n","`n")
}
function WriteText($relative,$contents) {
 [IO.File]::WriteAllText((Join-Path $root $relative),$contents,$utf8)
}
function Change($contents,$old,$new) {
 if(!$contents.Contains($old)){throw ('Missing frozen fixture anchor: '+$old)}
 $contents.Replace($old,$new)
}
$kernel=ReadText 'packages/kernel/test/credentials.test.ts'
$kernel+=@'

test("t4z proves a collision stays intact and later recovery does not query it again", async () => {
  const { base, vault, backend, credentials, close, open } = await setup();
  const occupied = Buffer.alloc(32, 0x71);
  let file = "";
  const collision = vi.spyOn(backend, "create").mockImplementationOnce(async (id) => {
    file = backend.file(id);
    writeFileSync(file, occupied, { flag: "wx" });
    throw new Error("synthetic definite EEXIST");
  });
  const remove = vi.spyOn(backend, "remove");
  await expect(save(credentials, null, [replace("password", "fixture-collision"), keep("passphrase")])).rejects.toMatchObject({ code: "unavailable" });
  expect(remove).not.toHaveBeenCalled();
  expect(readFileSync(file)).toEqual(occupied);
  collision.mockRestore();
  await close(vault);
  const reopened = owner(await open(), base, undefined, undefined, backend);
  expect(await reopened.recover()).toBe(true);
  expect(await reopened.list()).toEqual([]);
  expect(readFileSync(file)).toEqual(occupied);
  expect(remove).not.toHaveBeenCalled();
  console.info(JSON.stringify({ case: "collision", removed: remove.mock.calls.length, originalBytesPreserved: true, fingerprintRetired: true }));
});

test("t4z reclaims a key stored before a write error only after availability returns", async () => {
  const { base, vault, backend, credentials, close, open } = await setup();
  backend.afterCreate = () => {
    backend.unavailable = "unavailable";
    throw new Error("synthetic error after storing the key");
  };
  const read = vi.spyOn(backend, "read");
  const remove = vi.spyOn(backend, "remove");
  await expect(save(credentials, null, [replace("password", "fixture-unknown"), keep("passphrase")])).rejects.toMatchObject({ code: "unavailable" });
  expect(await credentials.list()).toEqual([]);
  expect(backend.keys()).toHaveLength(1);
  const fingerprints = files(path.join(base, "private"), "fingerprint");
  expect(fingerprints).toHaveLength(1);
  expect(readFileSync(fingerprints[0]!, "utf8")).toMatch(/^[a-f0-9]{64}$/);
  expect(await credentials.recover()).toBe(false);
  expect(remove).toHaveBeenCalledTimes(0);
  await close(vault);
  const reopened = owner(await open(), base, undefined, undefined, backend);
  backend.unavailable = undefined;
  backend.afterCreate = undefined;
  expect(await reopened.recover()).toBe(true);
  expect(backend.keys()).toHaveLength(0);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(files(path.join(base, "private"), "fingerprint")).toHaveLength(0);
  console.info(JSON.stringify({ case: "write outcome unknown", reads: read.mock.calls.length, deletes: remove.mock.calls.length, committedAccounts: 0, fingerprintUsedOnReopen: true }));
});

test.each(["fingerprint-absent", "native-entry-absent", "delete-unavailable"] as const)("t4z handles %s without destroying unproven material", async (state) => {
  const { base, backend, credentials } = await setup();
  const first = await save(credentials, null, [replace("password", "fixture-preserve"), keep("passphrase")]);
  const pathProof = files(path.join(base, "private"), "fingerprint")[0]!;
  const nativeFile = path.join(backend.directory, backend.keys()[0]!);
  if (state === "fingerprint-absent") rmSync(pathProof);
  if (state === "native-entry-absent") rmSync(nativeFile);
  if (state === "delete-unavailable") backend.beforeRemove = () => { throw new Error("synthetic denied delete"); };
  const read = vi.spyOn(backend, "read");
  const remove = vi.spyOn(backend, "remove");
  const result = await save(credentials, first.revision, [clear("password"), keep("passphrase")]);
  expect(result.authState.password).toBe("unconfigured");
  if (state === "fingerprint-absent") {
    expect(read).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(nativeFile)).toBe(true);
    expect(await credentials.recover()).toBe(true);
  } else if (state === "native-entry-absent") {
    expect(read).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(pathProof)).toBe(false);
  } else {
    expect(remove).toHaveBeenCalledTimes(1);
    expect(existsSync(pathProof)).toBe(true);
    expect(await credentials.recover()).toBe(false);
    backend.beforeRemove = undefined;
    expect(await credentials.recover()).toBe(true);
    expect(existsSync(nativeFile)).toBe(false);
    expect(existsSync(pathProof)).toBe(false);
  }
  console.info(JSON.stringify({ case: state, reads: read.mock.calls.length, removalCalls: remove.mock.calls.length, nativePresent: existsSync(nativeFile), proofPresent: existsSync(pathProof) }));
});
'@
$kernel=Change $kernel '  expect(remove).not.toHaveBeenCalled();
  console.info(JSON.stringify({ case: "collision"' '  expect(remove).not.toHaveBeenCalled();
  expect(files(path.join(base, "private"), "fingerprint")).toHaveLength(0);
  console.info(JSON.stringify({ case: "collision"'
WriteText 'packages/kernel/test/t4z-ownership.test.ts' $kernel
$engine=ReadText 'apps/engine/test/module-credential-host.test.ts'
$engine=Change $engine 'import { randomUUID } from "node:crypto";' 'import { createHash, randomUUID } from "node:crypto";'
$engine=Change $engine 'import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";' 'import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";'
$engine=Change $engine 'import { exportPackage, importPackage } from "@huhu/vault";' 'import { Vault, exportPackage, importPackage } from "@huhu/vault";'
$engine=Change $engine 'import { assert, expect, test } from "vitest";' @'
import { assert, expect, test, vi } from "vitest";
import { createModuleCredentialHost } from "../src/module-credential-host.js";
'@
$engine=Change $engine '    expect(saved.authState.password).toBe("configured");' @'
    expect(saved.authState.password).toBe("configured");
    const nativeHost = source.moduleCredentialHost!;
    const nativeScope = createHash("sha256").update(JSON.stringify(["huhu/module-credentials/v1", instanceId, "test.native.module"])).digest("hex");
    const [keyId] = readdirSync(path.join(nativeHost.localRoot, nativeScope, "keys"));
    const exactKey = ["huhu", "credentials", "v1", nativeScope, keyId].join("/");
    const exactValue = await nativeHost.protection.read(exactKey);
    expect(exactValue?.length).toBe(32);
    exactValue?.fill(0);
    const collisionId = "fixture-t4z-" + randomUUID();
    const original = Buffer.alloc(32, 0x51);
    try {
      await nativeHost.protection.create(collisionId, original);
      await expect(nativeHost.protection.create(collisionId, Buffer.alloc(32, 0x52))).rejects.toMatchObject({ reason: "unavailable" });
      const unchanged = await nativeHost.protection.read(collisionId);
      expect(unchanged).toEqual(original);
      unchanged?.fill(0);
    } finally {
      original.fill(0);
      await nativeHost.protection.remove(collisionId);
    }
    expect(await nativeHost.protection.read(collisionId)).toBeNull();
'@
$engine=Change $engine '    expect(cleared.authState.password).toBe("unconfigured");' @'
    expect(cleared.authState.password).toBe("unconfigured");
    expect(await nativeHost.protection.read(exactKey)).toBeNull();
    console.info(JSON.stringify({ case: "real Windows exact keys", exactRead32: true, collisionPreserved: true, collisionDeleted: true, clearDeleted: true, safeLockedReopen: true, restoredVaultIdEqual: true, restoredInstanceIdDistinct: true }));
'@
$engine+=@'

test.skipIf(process.platform !== "win32")("t4z Windows host checks read-only and directory identity without backend access", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-t4z-host-"));
  const vaultPath = path.join(sandbox, "vault");
  const moved = path.join(sandbox, "moved");
  const appData = path.join(sandbox, "app");
  const virginAppData = path.join(sandbox, "new-app");
  const invalidApp = path.join(sandbox, "bad-app");
  const zip = path.join(sandbox, "fixture.zip");
  let current: Vault | undefined;
  for (const folder of [vaultPath, appData, virginAppData, invalidApp]) mkdirSync(folder);
  try {
    current = await Vault.open(vaultPath, { create: true });
    const first = createModuleCredentialHost(current, appData)!;
    expect(first.localVaultInstanceId).toMatch(/^[a-f0-9]{64}$/);
    const inside = path.join(vaultPath, "app");
    mkdirSync(inside);
    expect(createModuleCredentialHost(current, inside)).toBeUndefined();
    expect(existsSync(path.join(inside, "module-credentials"))).toBe(false);
    expect(createModuleCredentialHost(current, "relative-app-data")).toBeUndefined();
    expect(createModuleCredentialHost(current, path.join(sandbox, "missing-app"))).toBeUndefined();
    const bad = path.join(invalidApp, "module-credentials");
    writeFileSync(bad, "fixture");
    expect(createModuleCredentialHost(current, invalidApp)).toBeUndefined();
    expect(readFileSync(bad, "utf8")).toBe("fixture");
    rmSync(bad);
    symlinkSync(first.localRoot, bad, "junction");
    expect(createModuleCredentialHost(current, invalidApp)).toBeUndefined();
    const goodAlias = path.join(sandbox, "app-alias");
    symlinkSync(appData, goodAlias, "junction");
    expect(createModuleCredentialHost(current, goodAlias)?.localRoot).toBe(first.localRoot);
    const vaultId = current.id;
    await exportPackage(vaultPath, zip);
    await current.close();
    current = await Vault.open(vaultPath, { readOnly: true });
    expect(createModuleCredentialHost(current, virginAppData)).toBeUndefined();
    expect(readdirSync(virginAppData)).toEqual([]);
    const forReadonly = createModuleCredentialHost(current, appData)!;
    expect(forReadonly.localVaultInstanceId).toBe(first.localVaultInstanceId);
    const read = vi.spyOn(forReadonly.protection, "read");
    const create = vi.spyOn(forReadonly.protection, "create");
    const remove = vi.spyOn(forReadonly.protection, "remove");
    const credentials = new ModuleCredentials({
      ...forReadonly, vault: current, pluginId: "test.t4z.readonly",
      definition: z.strictObject({ target: z.string() }), targets: (value) => ({ password: value.target })
    });
    expect(await credentials.list()).toEqual([]);
    await expect(credentials.save({ entityId: "fixture", expectedRevision: null, definition: { target: "test.invalid" }, actions: [{ purpose: "password", action: "replace", value: "synthetic" }] }))
      .rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
    expect([read, create, remove].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
    expect(readdirSync(first.localRoot)).toEqual([]);
    await current.close();
    current = undefined;
    renameSync(vaultPath, moved);
    // The supported import replaces an empty target with a new physical directory.
    mkdirSync(vaultPath);
    expect(importPackage(zip, vaultPath).vaultId).toBe(vaultId);
    current = await Vault.open(vaultPath);
    expect(createModuleCredentialHost(current, appData)?.localVaultInstanceId).not.toBe(first.localVaultInstanceId);
    await current.close();
    current = await Vault.open(moved);
    expect(createModuleCredentialHost(current, appData)?.localVaultInstanceId).toBe(first.localVaultInstanceId);
    console.info(JSON.stringify({ case: "Windows host path", badPathsDenied: 5, aliasStable: true, readonlyNewRootAbsent: true, readonlyBackendCalls: [0, 0, 0],
      renameKeepsInstance: true, importSamePathNewInstance: true, unchangedPortableVaultId: true }));
  } finally {
    await current?.close();
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
});
'@
WriteText 'apps/engine/test/t4z-host.test.ts' $engine

$desktop=ReadText 'apps/desktop/test/engine-supervisor.test.ts'
$desktop+=@'

test("t4z host userData overrides inherited environment and opens the utility process read-only", () => {
  vi.stubEnv("HUHU_DESKTOP_USER_DATA", "different-inherited-root");
  vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
  const child = new Child();
  fork.mockReturnValueOnce(child);
  const supervisor = new EngineSupervisor("fixture-vault", { create: false, readOnly: true }, () => undefined);
  supervisor.start();
  expect(fork).toHaveBeenCalledOnce();
  const [entry, args, settings] = fork.mock.calls[0]!;
  expect(entry.endsWith("engine.js")).toBe(true);
  expect(args).toEqual(["--vault", "fixture-vault", "--read-only"]);
  expect(settings.env.HUHU_DESKTOP_USER_DATA).toBe("fixture-user-data");
  console.info(JSON.stringify({ case: "supervisor utilityProcess stub", entryChecked: true, flags: args.filter((flag: string) => flag.startsWith("--")), userDataOverridesParent: true }));
});
'@
WriteText 'apps/desktop/test/t4z-supervisor.test.ts' $desktop
