import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { CapabilityError, EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { signal } from "./signal.js";

type Session = { instanceId: string; generation: number };
type Receipt = { entryId: string; revision: number; accountIds: string[]; status: "saved" };
type EntryIndex = { revision: number; entries: { entryId: string; revision: number }[] };
const vaults: string[] = [];
const engines: RunningEngine[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const root of vaults.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function openEngine(root?: string) {
  const create = root === undefined;
  root ??= mkdtempSync(path.join(tmpdir(), "huhu-safe-personal-"));
  if (create) vaults.push(root);
  const engine = await boot({ vaultPath: root, create });
  engines.push(engine);
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  return { engine, client, root, current: path.join(root, ".huhu", "safe", "current") };
}

function fixture() {
  const marker = randomUUID().replaceAll("-", "");
  const first = { account: `account_${marker}`, password: `  ${randomUUID()}  `, phone: "0012345678", email: `${marker}@example.test`, note: `note_${marker}`.repeat(128) };
  const accounts = [first, { account: first.account, password: "", phone: "", email: "", note: "" }, { account: `third_${marker}`, password: randomUUID(), phone: "+0012345678", email: "", note: `thirdnote_${marker}` }];
  return { marker, password: randomUUID(), name: `Google ${marker}`, url: `https://example.test/${marker}`, accounts };
}

async function session(client: EngineClient): Promise<Session> {
  const { instanceId, generation } = await client.call<Session>("safe.status");
  return { instanceId, generation };
}

async function codeOf(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
    return "OK";
  } catch (error) {
    if (error instanceof CapabilityError) return error.code;
    throw new Error("Safe test client failed before receiving a capability result");
  }
}

function containsBytes(root: string, values: string[]): boolean {
  const markers = values.map((value) => Buffer.from(value));
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const bytes = readFileSync(path.join(entry.parentPath, entry.name));
    if (markers.some((marker) => bytes.includes(marker))) return true;
  }
  return false;
}

test("桌面工作台一次保存三个账号，重开逐项读回且磁盘与索引没有个人明文", async () => {
  const { client, engine, root, current } = await openEngine();
  const data = fixture();
  expect(await codeOf(client.call("safe.setup", { password: data.password }))).toBe("OK");
  const scope = await session(client);
  const input = { session: scope, expectedRevision: 0, name: data.name, url: data.url, accounts: data.accounts };
  const create = () => client.call<Receipt>("safe.entries.create", input, { write: true });
  const created = create();
  expect(await codeOf(created)).toBe("OK");
  const receipt = await created;
  expect(Object.keys(receipt).sort()).toEqual(["accountIds", "entryId", "revision", "status"]);
  expect(receipt).toMatchObject({ revision: 1, status: "saved" });
  expect(new Set(receipt.accountIds).size).toBe(3);
  expect(await client.call<EntryIndex>("safe.entries.list", { session: scope })).toEqual({ revision: 1, entries: [{ entryId: receipt.entryId, revision: 1 }] });
  expect(await client.call("safe.items.list")).toEqual([]);
  expect(await codeOf(client.call("safe.items.reveal", { id: receipt.entryId }))).toBe("NOT_FOUND");
  expect((await client.call<{ hits: unknown[] }>("vault.search", { query: data.marker })).hits).toEqual([]);
  expect(existsSync(path.join(current, "entries", `${receipt.entryId}-1.bin`))).toBe(true);

  await engine.shutdown();
  const reopened = await openEngine(root);
  expect(await codeOf(reopened.client.call("safe.entries.get", { session: scope, entryId: receipt.entryId }))).toBe("SAFE_LOCKED");
  expect(await codeOf(reopened.client.call("safe.unlock", { password: data.password }))).toBe("OK");
  const next = await session(reopened.client);
  expect(await codeOf(reopened.client.call("safe.entries.get", { session: scope, entryId: receipt.entryId }))).toBe("SAFE_LOCKED");
  expect(await reopened.client.call<EntryIndex>("safe.entries.list", { session: next })).toEqual({ revision: 1, entries: [{ entryId: receipt.entryId, revision: 1 }] });
  const detail = await reopened.client.call<{ name: string; url: string; accounts: Array<Record<string, unknown>> }>("safe.entries.get", { session: next, entryId: receipt.entryId });
  expect(detail.name === data.name && detail.url === data.url).toBe(true);
  expect(detail.accounts.map((account) => account.accountId)).toEqual(receipt.accountIds);
  for (const [i, expected] of data.accounts.entries()) {
    const account = detail.accounts[i];
    expect(account !== undefined && !Object.hasOwn(account, "password") && account.hasPassword === Boolean(expected.password)).toBe(true);
    expect(account?.account === expected.account && account.phone === expected.phone && account.email === expected.email && account.note === expected.note).toBe(true);
    const reveal = await reopened.client.call<{ password: string }>("safe.accounts.reveal", { session: next, entryId: receipt.entryId, accountId: receipt.accountIds[i] });
    expect(reveal.password === expected.password).toBe(true);
  }
  const cli = new EngineClient({ ...reopened.client.endpoint, token: reopened.engine.cliToken });
  expect(await codeOf(cli.call("safe.accounts.reveal", { session: next, entryId: receipt.entryId, accountId: receipt.accountIds[0] }))).toBe("CAPABILITY_NOT_EXPOSED");
  expect((await reopened.client.call<{ hits: unknown[] }>("vault.search", { query: data.marker })).hits).toEqual([]);
  const receipts = path.join(reopened.engine.vault.runtimeDir, "idempotency.ndjson");
  expect(existsSync(receipts) && readFileSync(receipts, "utf8").includes("safe.entries.create")).toBe(false);
  await reopened.engine.shutdown();
  expect(containsBytes(root, [data.marker, data.password, ...data.accounts.flatMap((account) => [account.password, account.phone]).filter(Boolean)])).toBe(false);
}, 30_000);

test("校验和两处暂存写失败保留原清单，修正后重试仅提交一次", async () => {
  const { client, engine, current } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const manifest = path.join(current, "manifest.json");
  const before = readFileSync(manifest);
  const base = { session: scope, expectedRevision: 0, name: data.name, url: data.url, accounts: data.accounts };
  const options = { write: true, idempotencyKey: randomUUID() };
  const create = (input: object) => client.call<Receipt>("safe.entries.create", input, options);
  for (const input of [
    { ...base, name: " " },
    { ...base, url: "wrong" },
    { ...base, accounts: [] },
    { ...base, accounts: [{ account: " " }] },
    { ...base, accounts: [{ account: "sample", email: "wrong" }] },
  ])
    expect(await codeOf(create(input))).toBe("INVALID_INPUT");

  const write = engine.vault.files.write.bind(engine.vault.files);
  for (const fileName of ["/entry.bin", "/manifest.json"]) {
    const mock = vi.spyOn(engine.vault.files, "write").mockImplementation((file, bytes, opts) => {
      if (file.endsWith(fileName)) return Promise.reject(new Error("controlled write failure"));
      return write(file, bytes, opts);
    });
    try {
      expect(await codeOf(create(base))).toBe("INTERNAL");
      expect(readFileSync(manifest).equals(before)).toBe(true);
      expect(existsSync(path.join(current, "entries"))).toBe(false);
      expect(await client.call<EntryIndex>("safe.entries.list", { session: scope })).toEqual({ revision: 0, entries: [] });
    } finally {
      mock.mockRestore();
    }
  }

  const abs = engine.vault.files.abs.bind(engine.vault.files);
  const blocked = abs(".huhu/cache/blocked-manifest-target");
  mkdirSync(blocked, { recursive: true });
  let redirect = false;
  let interceptedPublish = false;
  const finalRename = vi.spyOn(engine.vault.files, "abs").mockImplementation((file) => {
    if (file.startsWith(".huhu/cache/safe-write-") && file.endsWith("/manifest.json") && existsSync(abs(file))) redirect = true;
    if (redirect && file === ".huhu/safe/current/manifest.json") {
      redirect = false;
      interceptedPublish = true;
      return blocked;
    }
    return abs(file);
  });
  try {
    expect(await codeOf(create(base))).toBe("INTERNAL");
    expect(interceptedPublish).toBe(true);
    expect(readFileSync(manifest).equals(before)).toBe(true);
    expect(readdirSync(path.join(current, "entries"))).toEqual([]);
  } finally {
    finalRename.mockRestore();
  }

  expect(await codeOf(create({ ...base, url: "", accounts: [{ account: "sample" }] }))).toBe("OK");
  expect(await codeOf(create(base))).toBe("VERSION_CONFLICT");
  await client.call("safe.lock");
  expect(await codeOf(create(base))).toBe("SAFE_LOCKED");
  await client.call("safe.unlock", { password: data.password });
  const list = await client.call<EntryIndex>("safe.entries.list", { session: await session(client) });
  expect(list.revision).toBe(1);
  expect(list.entries).toHaveLength(1);
}, 30_000);

test("同库的条目密文无法互换，未发布的密文也不会被列出", async () => {
  const { client, current } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const create = (expectedRevision: number) => client.call<Receipt>("safe.entries.create", { session: scope, expectedRevision, name: data.name, accounts: data.accounts });
  const first = await create(0);
  const second = await create(1);
  const destination = path.join(current, "entries", `${second.entryId}-1.bin`);
  const bytes = readFileSync(destination);
  writeFileSync(path.join(current, "entries", `${first.entryId}-1.bin`), bytes);
  const orphan = randomUUID();
  writeFileSync(path.join(current, "entries", `${orphan}-1.bin`), bytes);
  expect(await codeOf(client.call("safe.entries.get", { session: scope, entryId: first.entryId }))).toBe("INTERNAL");
  expect(await codeOf(client.call("safe.entries.get", { session: scope, entryId: second.entryId }))).toBe("OK");
  expect(await codeOf(client.call("safe.entries.get", { session: scope, entryId: orphan }))).toBe("NOT_FOUND");
  expect((await client.call<EntryIndex>("safe.entries.list", { session: scope })).entries.map((entry) => entry.entryId)).toEqual([first.entryId, second.entryId]);
}, 30_000);

test("两次并发提交只发布一个清单，锁定期间迟到的写入失效", async () => {
  const { client, engine, current } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const base = { session: scope, expectedRevision: 0, name: data.name, accounts: data.accounts };
  const [first, second] = await Promise.all([codeOf(client.call("safe.entries.create", base)), codeOf(client.call("safe.entries.create", { ...base, name: `${data.name} 2` }))]);
  expect([first, second].sort()).toEqual(["OK", "VERSION_CONFLICT"]);
  const manifest = path.join(current, "manifest.json");
  const before = readFileSync(manifest);
  const entered = signal();
  const release = signal();
  const write = engine.vault.files.write.bind(engine.vault.files);
  vi.spyOn(engine.vault.files, "write").mockImplementation(async (file, bytes, opts) => {
    const receipt = await write(file, bytes, opts);
    if (file.endsWith("/manifest.json")) {
      entered.resolve();
      await release.promise;
    }
    return receipt;
  });
  const outcome = codeOf(client.call("safe.entries.create", { ...base, expectedRevision: 1 }));
  try {
    expect(await Promise.race([entered.promise.then(() => true), outcome.then(() => false)])).toBe(true);
    await client.call("safe.lock");
    await client.call("safe.unlock", { password: data.password });
  } finally {
    release.resolve();
  }
  expect(await outcome).toBe("SAFE_LOCKED");
  expect(readFileSync(manifest).equals(before)).toBe(true);
  expect(readdirSync(path.join(current, "entries"))).toHaveLength(1);
}, 30_000);
