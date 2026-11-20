import { fork, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Vault } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { type CredentialAction, type ModuleCredentials } from "../src/credentials/module-credentials.js";
import { identityHash } from "../src/credentials/versions.js";
import { definition, owner, TestProtection } from "./fixtures/credentials.js";

const tmp = fileURLToPath(new URL("../../../temp/", import.meta.url));
const vaultRequire = createRequire(new URL("../../vault/package.json", import.meta.url));
const tsx = vaultRequire.resolve("tsx/cli");
const crashFixture = fileURLToPath(new URL("./fixtures/crash-credentials.ts", import.meta.url));
const readOnlyFixture = fileURLToPath(new URL("./fixtures/read-only-credentials.ts", import.meta.url));
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function setup() {
  mkdirSync(tmp, { recursive: true });
  const base = mkdtempSync(path.join(tmp, "credentials-test-"));
  cleanup.push(async () => rmSync(base, { recursive: true, force: true }));
  for (const dir of ["vault", "private", "backend"]) mkdirSync(path.join(base, dir));
  const live = new Set<Vault>();
  cleanup.push(async () => {
    await Promise.all([...live].map((vault) => vault.close()));
  });
  const root = path.join(base, "vault");
  async function open(openRoot = root, readOnly = false) {
    const vault = await Vault.open(openRoot, readOnly ? { readOnly } : { create: true });
    live.add(vault);
    return vault;
  }
  async function close(vault: Vault) {
    await vault.close();
    live.delete(vault);
  }
  const vault = await open();
  const backend = new TestProtection(path.join(base, "backend"));
  return { base, root, vault, backend, open, close, credentials: owner(vault, base, undefined, undefined, backend) };
}

type Credentials = ModuleCredentials<typeof definition>;
const keep = (purpose: string): CredentialAction => ({ purpose, action: "keep" });
const clear = (purpose: string): CredentialAction => ({ purpose, action: "clear" });
const replace = (purpose: string, value: string): CredentialAction => ({ purpose, action: "replace", value });

function save(credentials: Credentials, expectedRevision: string | null, actions: CredentialAction[], entityId = "host", host = definition.host, signal?: AbortSignal) {
  return credentials.save({ entityId, expectedRevision, definition: { ...definition, host }, actions, ...(signal && { signal }) });
}

function auth(credentials: Credentials, expected: string, entityId = "host", purpose = "password") {
  return credentials.use(entityId, [purpose], async (_, values) => values.get(purpose) === expected);
}

function files(directory: string, suffix: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(suffix))
    .map((file) => path.join(directory, file));
}

function copyDefinitions(base: string, root: string, portable: string[]): string {
  const copyRoot = path.join(base, "copy");
  mkdirSync(path.join(copyRoot, ".huhu", "module-credentials"), { recursive: true });
  copyFileSync(path.join(root, ".huhu", "vault.json"), path.join(copyRoot, ".huhu", "vault.json"));
  for (const file of portable) copyFileSync(file, path.join(copyRoot, ".huhu", "module-credentials", path.basename(file)));
  return copyRoot;
}

test("publishes portable definitions independently of four credential dimensions", async () => {
  const { base, root, vault, backend, open, close, credentials } = await setup();
  const view = path.join(base, "private");
  const secret = "synthetic-password-A";
  const passphrase = "synthetic-passphrase-A";
  const [first, other] = await Promise.all([save(credentials, null, [replace("password", secret), replace("passphrase", passphrase)]), save(credentials, null, [replace("password", "synthetic-neighbor"), keep("passphrase")], "neighbor")]);
  const plugin = owner(vault, base, undefined, "test.mail", backend);
  await save(plugin, null, [replace("password", "synthetic-other-plugin"), keep("passphrase")]);
  expect(backend.keys()).toHaveLength(2);
  expect(Object.keys(first).sort()).toEqual(["authState", "entityId", "revision"]);
  expect(first.authState).toEqual({ password: "configured", passphrase: "configured" });
  expect(await credentials.list()).toEqual([
    { ...first, definition },
    { ...other, definition },
  ]);
  const portable = files(path.join(root, ".huhu", "module-credentials"), ".json");
  expect(portable).toHaveLength(2);
  for (const file of [...portable, ...files(view, ".json"), ...files(view, ".bin")]) {
    expect(readFileSync(file).includes(secret)).toBe(false);
    expect(readFileSync(file).includes(passphrase)).toBe(false);
  }
  for (const file of portable) {
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")).entries[0]).sort()).toEqual(["configured", "definition", "entityId", "revision"]);
  }
  const copyRoot = copyDefinitions(base, root, portable);
  const copy = await open(copyRoot);
  expect(copy.id).toBe(vault.id);
  const copyOwner = owner(copy, base, "instance-b", undefined, backend);
  expect((await copyOwner.list())[0]?.authState).toEqual({ password: "needs-reconfiguration", passphrase: "needs-reconfiguration" });
  await expect(auth(copyOwner, secret)).rejects.toMatchObject({ code: "unbound" });
  await save(copyOwner, first.revision, [replace("password", "synthetic-other-vault"), clear("passphrase")]);
  expect(backend.keys()).toHaveLength(3);

  const changed = await save(credentials, first.revision, [replace("password", "synthetic-replacement"), keep("passphrase")]);
  expect(changed.revision).not.toBe(first.revision);
  await close(vault);
  const reopenedVault = await open();
  const reopened = owner(reopenedVault, base, undefined, undefined, backend);
  const reopenedPlugin = owner(reopenedVault, base, undefined, "test.mail", backend);
  expect(await auth(reopened, "synthetic-replacement")).toBe(true);
  expect(await auth(reopened, passphrase, "host", "passphrase")).toBe(true);
  const cleared = await save(reopened, changed.revision, [clear("password"), keep("passphrase")]);
  expect(cleared.authState.password).toBe("unconfigured");
  await expect(auth(reopened, secret)).rejects.toMatchObject({ code: "unconfigured" });
  await expect(reopened.delete("host", changed.revision)).rejects.toMatchObject({ code: "conflict" });
  await reopened.delete("host", cleared.revision);
  await expect(auth(reopened, secret)).rejects.toMatchObject({ code: "not-found" });
  expect(await auth(reopened, "synthetic-neighbor", "neighbor")).toBe(true);
  expect(await auth(reopenedPlugin, "synthetic-other-plugin")).toBe(true);
  expect(await auth(copyOwner, "synthetic-other-vault")).toBe(true);
  expect(files(view, ".bin")).toHaveLength(3);
  expect(backend.keys()).toHaveLength(3);
}, 15_000);

test("reclaims a copied entity's local material while its neighbor remains unbound", async () => {
  const { base, root, backend, open, close, credentials } = await setup();
  const localRoot = path.join(base, "private");
  const first = await save(credentials, null, [replace("password", "source-first"), keep("passphrase")]);
  await save(credentials, null, [replace("password", "source-neighbor"), keep("passphrase")], "neighbor");
  const copyRoot = copyDefinitions(base, root, files(path.join(root, ".huhu", "module-credentials"), ".json"));
  const copy = await open(copyRoot);
  const copied = owner(copy, base, "instance-b");
  const rebound = await save(copied, first.revision, [replace("password", "copy-first"), keep("passphrase")]);
  expect(await auth(copied, "copy-first")).toBe(true);
  expect(files(localRoot, ".bin")).toHaveLength(3);
  expect(backend.keys()).toHaveLength(2);
  const snapshot = files(localRoot, ".json").find((file) => path.basename(file) === `${rebound.revision}.json`)!;
  renameSync(snapshot, `${snapshot}.lost`);
  expect(await copied.recover()).toBe(false);
  expect(files(localRoot, ".bin")).toHaveLength(3);
  expect(backend.keys()).toHaveLength(2);
  renameSync(`${snapshot}.lost`, snapshot);
  await close(copy);
  const reopened = owner(await open(copyRoot), base, "instance-b");
  const cleared = await save(reopened, rebound.revision, [clear("password"), keep("passphrase")]);
  expect(cleared.authState.password).toBe("unconfigured");
  expect((await reopened.list()).find(({ entityId }) => entityId === "neighbor")?.authState.password).toBe("needs-reconfiguration");
  const afterClear = { ciphertexts: files(localRoot, ".bin").length, keys: backend.keys().length };
  expect({ ...afterClear, recovered: await reopened.recover() }).toEqual({ ciphertexts: 2, keys: 1, recovered: true });
  expect(await auth(credentials, "source-first")).toBe(true);
  expect(await auth(credentials, "source-neighbor", "neighbor")).toBe(true);
}, 15_000);

test.each([
  { phase: "initial-proof-before-write", exit: 75 },
  { phase: "initial-proof-partial-write", exit: 76 },
  { phase: "initial-proof-publish-error", exit: 0 },
])(
  "retries copied credentials after $phase",
  async ({ phase, exit }) => {
    const { base, root, backend, open, close, credentials } = await setup();
    const first = await save(credentials, null, [replace("password", "source-first"), keep("passphrase")]);
    const neighbor = await save(credentials, null, [replace("password", "source-neighbor"), keep("passphrase")], "neighbor");
    const portable = files(path.join(root, ".huhu", "module-credentials"), ".json");
    const copyRoot = copyDefinitions(base, root, portable);
    const copiedFile = path.join(copyRoot, ".huhu", "module-credentials", path.basename(portable[0]!));
    const before = readFileSync(copiedFile);
    const localRoot = path.join(base, "private");
    const scope = identityHash("huhu/module-credentials/v1", "instance-b", "test.ssh");
    const canonical = path.join(localRoot, scope);
    const child = spawnSync(process.execPath, [tsx, crashFixture, base, phase, first.revision], { encoding: "utf8", timeout: 10_000 });
    expect(child.status, child.stderr).toBe(exit);
    expect(readFileSync(copiedFile)).toEqual(before);
    expect(files(localRoot, ".bin")).toHaveLength(2);
    expect(backend.keys()).toHaveLength(1);
    const publishedBeforeRetry = existsSync(canonical);

    const copy = await open(copyRoot);
    const copied = owner(copy, base, "instance-b");
    const rebound = await save(copied, first.revision, [replace("password", "copy-first"), keep("passphrase")]);
    await close(copy);
    const reopened = owner(await open(copyRoot), base, "instance-b");
    expect(await auth(reopened, "copy-first")).toBe(true);
    const cleared = await save(reopened, rebound.revision, [clear("password"), keep("passphrase")]);
    expect(cleared.authState.password).toBe("unconfigured");
    expect((await reopened.list()).find(({ entityId }) => entityId === "neighbor")?.authState.password).toBe("needs-reconfiguration");
    const afterClear = { ciphertexts: files(localRoot, ".bin").length, keys: backend.keys().length };
    expect({ ...afterClear, recovered: await reopened.recover(), publishedBeforeRetry }).toEqual({ ciphertexts: 2, keys: 1, recovered: true, publishedBeforeRetry: false });
    expect(JSON.parse(readFileSync(path.join(canonical, "initially-unbound.json"), "utf8"))).toEqual({
      format: 1,
      scope,
      entries: [identityHash("host", first.revision), identityHash("neighbor", neighbor.revision)],
    });
    expect(readdirSync(localRoot).filter((name) => name.startsWith(scope))).toEqual([scope]);
    expect(await auth(credentials, "source-first")).toBe(true);
    expect(await auth(credentials, "source-neighbor", "neighbor")).toBe(true);
  },
  20_000,
);

test("defers collection when the local proof for copied revisions is invalid", async () => {
  const { base, root, backend, open, credentials } = await setup();
  const first = await save(credentials, null, [replace("password", "source-first"), keep("passphrase")]);
  await save(credentials, null, [replace("password", "source-neighbor"), keep("passphrase")], "neighbor");
  const copyRoot = copyDefinitions(base, root, files(path.join(root, ".huhu", "module-credentials"), ".json"));
  const copied = owner(await open(copyRoot), base, "instance-b");
  const rebound = await save(copied, first.revision, [replace("password", "copy-first"), keep("passphrase")]);
  const localRoot = path.join(base, "private");
  const proof = files(localRoot, ".json").find((file) => path.basename(file) === "initially-unbound.json")!;
  const original = readFileSync(proof, "utf8");
  rmSync(proof);
  const updated = await save(copied, rebound.revision, [keep("password"), keep("passphrase")]);
  expect(existsSync(proof)).toBe(false);
  expect(await copied.recover()).toBe(false);
  writeFileSync(proof, JSON.stringify({ ...JSON.parse(original), scope: "0".repeat(64) }));
  await save(copied, updated.revision, [clear("password"), keep("passphrase")]);
  expect(await copied.recover()).toBe(false);
  writeFileSync(proof, "{");
  expect(await copied.recover()).toBe(false);
  expect(files(localRoot, ".bin")).toHaveLength(3);
  expect(backend.keys()).toHaveLength(2);
  writeFileSync(proof, original);
  expect(await copied.recover()).toBe(true);
  expect(files(localRoot, ".bin")).toHaveLength(2);
  expect(backend.keys()).toHaveLength(1);
}, 15_000);

test("rejects a ciphertext transplant between purposes using the same local key", async () => {
  const { base, credentials, backend } = await setup();
  await save(credentials, null, [replace("password", "synthetic password"), replace("passphrase", "synthetic passphrase")]);
  expect(backend.keys()).toHaveLength(1);
  const [left, right] = files(path.join(base, "private"), ".bin");
  const leftBytes = readFileSync(left!);
  const rightBytes = readFileSync(right!);
  writeFileSync(right!, leftBytes);
  const [entry] = await credentials.list();
  expect(Object.values(entry!.authState).sort()).toEqual(["configured", "corrupt"]);
  writeFileSync(right!, rightBytes);
  expect(await auth(credentials, "synthetic password")).toBe(true);
  expect(await auth(credentials, "synthetic passphrase", "host", "passphrase")).toBe(true);
});

test("serializes equal revisions and preserves the snapshot held by a suspended reader", async () => {
  const { base, vault, credentials } = await setup();
  const secondHandle = owner(vault, base);
  const first = await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
  let start!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    start = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = secondHandle.use("host", ["password"], async (saved, values) => {
    start();
    await paused;
    return saved.host === definition.host && values.get("password") === "old";
  });
  await entered;
  const results = await Promise.allSettled([save(credentials, first.revision, [replace("password", "new"), keep("passphrase")], "host", "other.invalid"), save(secondHandle, first.revision, [clear("password"), keep("passphrase")])]);
  const held = files(path.join(base, "private"), ".bin");
  release();
  expect(held).toHaveLength(2);
  expect(results.map(({ status }) => status)).toEqual(["fulfilled", "rejected"]);
  expect(results[1]).toMatchObject({ reason: { code: "conflict" } });
  expect(await read).toBe(true);
  expect(await auth(credentials, "new")).toBe(true);
  expect((await credentials.list())[0]?.definition.host).toBe("other.invalid");
  expect(files(path.join(base, "private"), ".bin")).toHaveLength(1);
});

test("keeps the committed revision on cancellation, read-only access, and write failure", async () => {
  const { base, vault, backend, open, credentials } = await setup();
  const first = await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
  const config = files(path.join(vault.root, ".huhu", "module-credentials"), ".json")[0]!;
  const before = readFileSync(config);
  const readOnly = owner(await open(vault.root, true), base);
  await expect(save(readOnly, first.revision, [clear("password"), keep("passphrase")])).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  await expect(auth(readOnly, "old")).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  expect(await readOnly.list()).toEqual([{ ...first, definition, authState: { password: "temporarily-unavailable", passphrase: "unconfigured" } }]);
  const write = vi.spyOn(vault.files, "write").mockRejectedValueOnce(new Error("synthetic writer failure"));
  await expect(save(credentials, first.revision, [replace("password", "new"), keep("passphrase")])).rejects.toMatchObject({ code: "storage-failed" });
  write.mockRestore();
  const controller = new AbortController();
  const realRead = backend.read.bind(backend);
  vi.spyOn(backend, "read").mockImplementationOnce(async (id) => {
    controller.abort();
    return realRead(id);
  });
  await expect(save(credentials, first.revision, [replace("password", "new"), keep("passphrase")], "host", definition.host, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
  expect(readFileSync(config)).toEqual(before);
  expect(await auth(credentials, "old")).toBe(true);
  expect(files(path.join(base, "private"), ".bin")).toHaveLength(1);
  await expect(save(credentials, first.revision, [replace("password", ""), keep("passphrase")])).rejects.toMatchObject({ code: "invalid-input" });
  const retargeted = await save(credentials, first.revision, [keep("password"), keep("passphrase")], "host", "other.invalid");
  expect(retargeted.authState.password).toBe("needs-reconfiguration");
  await expect(auth(credentials, "old")).rejects.toMatchObject({ code: "unbound" });
});

test("rejects read-only subprocess use before opening local materials while the writer clears them", async () => {
  const { base, backend, credentials } = await setup();
  const first = await save(credentials, null, [replace("password", "old"), replace("passphrase", "synthetic second purpose")]);
  const child = fork(readOnlyFixture, [base], { execArgv: ["--import", pathToFileURL(vaultRequire.resolve("tsx")).href], stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = once(child, "exit");
  cleanup.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
  });
  let message = await Promise.race([
    once(child, "message").then(([value]) => value),
    exited.then(([code]) => {
      throw new Error(`Read-only fixture exited before reporting: ${code}`);
    }),
  ]);
  const cleared = await save(credentials, first.revision, [clear("password"), clear("passphrase")]);
  if (message === "reading") {
    const resumed = once(child, "message");
    child.send("resume");
    [message] = await resumed;
  }
  expect(message).toEqual({ code: "READ_ONLY_VAULT", reads: 0, invoked: false });
  expect(await exited).toEqual([0, null]);
  expect(cleared.authState).toEqual({ password: "unconfigured", passphrase: "unconfigured" });
  expect(files(path.join(base, "private"), ".bin")).toHaveLength(0);
  expect(backend.keys()).toHaveLength(0);
}, 15_000);

test("distinguishes lock, denial, absence and corrupt material without replacing an old key", async () => {
  const { base, credentials, backend } = await setup();
  const privateRoot = path.join(base, "private");
  const initial = await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
  await save(credentials, null, [replace("password", "neighbor"), keep("passphrase")], "neighbor");
  const before = files(privateRoot, ".bin").map((file) => [file, readFileSync(file)] as const);
  const keyFile = path.join(backend.directory, backend.keys()[0]!);
  const oldKey = readFileSync(keyFile);
  for (const reason of ["locked", "denied", "unavailable"] as const) {
    backend.unavailable = reason;
    expect((await credentials.list())[0]?.authState.password).toBe("temporarily-unavailable");
    await expect(auth(credentials, "old")).rejects.toMatchObject({ code: reason });
    await expect(save(credentials, initial.revision, [replace("password", "new"), keep("passphrase")])).rejects.toMatchObject({ code: reason });
  }
  backend.unavailable = undefined;
  rmSync(keyFile);
  expect((await credentials.list())[0]?.authState.password).toBe("needs-reconfiguration");
  await expect(auth(credentials, "old")).rejects.toMatchObject({ code: "missing-key" });
  await expect(save(credentials, initial.revision, [replace("password", "new"), keep("passphrase")])).rejects.toMatchObject({ code: "missing-key" });
  expect(backend.keys()).toEqual([]);
  for (const [file, bytes] of before) expect(readFileSync(file)).toEqual(bytes);
  await save(credentials, initial.revision, [{ purpose: "password", action: "replace", value: "new", reconfigure: true }, keep("passphrase")]);
  expect(await auth(credentials, "new")).toBe(true);
  expect(backend.keys()).toHaveLength(1);
  await expect(auth(credentials, "neighbor", "neighbor")).rejects.toMatchObject({ code: "missing-key" });
  writeFileSync(keyFile, oldKey, { flag: "wx" });
  expect(await auth(credentials, "neighbor", "neighbor")).toBe(true);
  const [left, right] = files(privateRoot, ".bin");
  copyFileSync(left!, right!);
  const states = (await credentials.list()).map((entry) => entry.authState.password);
  expect(states.sort()).toEqual(["configured", "corrupt"]);
});

test.each([
  { phase: "stage", exit: 71, password: "old", before: 2 },
  { phase: "publish", exit: 72, password: "new synthetic credential", before: 2 },
  { phase: "cleanup", exit: 73, password: null, before: 0 },
  { phase: "key-create", exit: 74, password: null, before: 0 },
])(
  "recovers after subprocess exits during $phase",
  async ({ phase, exit, password, before }) => {
    const { base, vault, backend, open, close, credentials } = await setup();
    const initial = phase === "key-create" ? undefined : await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
    await close(vault);
    const child = spawnSync(process.execPath, [tsx, crashFixture, base, phase, initial?.revision ?? "none"], { encoding: "utf8", timeout: 10_000 });
    expect(child.status, child.stderr).toBe(exit);
    const privateRoot = path.join(base, "private");
    expect(files(privateRoot, ".bin")).toHaveLength(before);
    expect(backend.keys()).toHaveLength(1);
    const restarted = owner(await open(), base);
    expect(await restarted.recover()).toBe(true);
    if (password === null) {
      await expect(auth(restarted, "old")).rejects.toMatchObject({ code: phase === "cleanup" ? "unconfigured" : "not-found" });
      expect(backend.keys()).toHaveLength(0);
    } else {
      expect(await auth(restarted, password)).toBe(true);
      const [entry] = await restarted.list();
      expect(entry?.revision === initial?.revision).toBe(phase === "stage");
    }
    expect(files(privateRoot, ".bin")).toHaveLength(password === null ? 0 : 1);
  },
  20_000,
);

test("defers collection when the committed reference set is uncertain", async () => {
  const { base, vault, credentials, backend } = await setup();
  const first = await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
  const localRoot = path.join(base, "private");
  const snapshot = files(localRoot, ".json").find((file) => path.basename(file) === `${first.revision}.json`)!;
  const original = readFileSync(snapshot);
  rmSync(snapshot);
  await save(credentials, null, [replace("password", "new"), keep("passphrase")], "neighbor");
  expect(await credentials.recover()).toBe(false);
  expect(files(localRoot, ".bin")).toHaveLength(2);
  expect(backend.keys()).toHaveLength(2);
  writeFileSync(snapshot, "{}");
  expect(await credentials.recover()).toBe(false);
  expect(files(localRoot, ".bin")).toHaveLength(2);
  writeFileSync(snapshot, original);
  const config = files(path.join(vault.root, ".huhu", "module-credentials"), ".json")[0]!;
  const bytes = readFileSync(config);
  writeFileSync(config, "{}");
  expect(await credentials.recover()).toBe(false);
  expect(files(localRoot, ".bin")).toHaveLength(2);
  writeFileSync(config, bytes);
  expect(await auth(credentials, "old")).toBe(true);
  expect(await auth(credentials, "new", "neighbor")).toBe(true);
});

test("returns the committed receipt when key cleanup needs a later retry", async () => {
  const { credentials, backend } = await setup();
  const first = await save(credentials, null, [replace("password", "old"), keep("passphrase")]);
  backend.beforeRemove = () => {
    throw new Error("synthetic remove failure");
  };
  const cleared = await save(credentials, first.revision, [clear("password"), keep("passphrase")]);
  expect(cleared.authState.password).toBe("unconfigured");
  expect(await credentials.list()).toEqual([{ ...cleared, definition }]);
  expect(await credentials.recover()).toBe(false);
  expect(backend.keys()).toHaveLength(1);
  delete backend.beforeRemove;
  expect(await credentials.recover()).toBe(true);
  expect(backend.keys()).toHaveLength(0);
});
