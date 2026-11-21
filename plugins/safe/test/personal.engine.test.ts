import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { CapabilityError, EngineClient, type CallOptions } from "../../../packages/workbench/src/engine-client/client.js";
import { signal } from "./signal.js";

type Session = { instanceId: string; generation: number };
type Receipt = { entryId: string; revision: number; accountIds: string[]; status: "saved" };
type EntryIndex = { revision: number; entries: { entryId: string; revision: number }[] };
type UpdatedAccount = { entryId: string; accountId: string; revision: number; hasPassword: boolean };
type Detail = { entryId: string; revision: number; name: string; url: string; accounts: Array<{ accountId: string; account: string; phone: string; email: string; note: string; hasPassword: boolean }> };
type TaggedDetail = Detail & { tagIds: string[] };
type TagDirectory = { revision: number; tags: Array<{ tagId: string; name: string; color: string }> };
const vaults: string[] = [];
const engines: RunningEngine[] = [];

class SafeTestClient extends EngineClient {
  override call<T>(capability: string, input?: unknown, opts: CallOptions = {}) {
    const write = /^safe\.(entries\.(create|update|delete)|accounts\.(update|delete)|tags\.(create|update|delete))$/.test(capability);
    return super.call<T>(capability, input, { write, ...opts });
  }
}

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
  const client = new SafeTestClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
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

function blockManifestPublish(engine: RunningEngine, publicationsReady = () => true) {
  const abs = engine.vault.files.abs.bind(engine.vault.files);
  const blocked = abs(".huhu/cache/blocked-manifest-target");
  mkdirSync(blocked, { recursive: true });
  let redirect = false;
  let intercepted = false;
  const mock = vi.spyOn(engine.vault.files, "abs").mockImplementation((file) => {
    if (file.startsWith(".huhu/cache/safe-write-") && file.endsWith("/manifest.json") && existsSync(abs(file))) redirect = true;
    if (redirect && file === ".huhu/safe/current/manifest.json" && publicationsReady()) {
      redirect = false;
      intercepted = true;
      return blocked;
    }
    return abs(file);
  });
  return { mock, intercepted: () => intercepted };
}

test("删除按条目、账号 ID 和修订生效，保留另一条目和共享标签", async () => {
  const { engine, client, root, current } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const { tagId } = await client.call<{ tagId: string }>("safe.tags.create", { session: scope, expectedRevision: 0, name: data.marker, color: "purple" });
  const create = { session: scope, tagIds: [tagId], accounts: data.accounts.slice(0, 2) };
  const alpha = await client.call<Receipt>("safe.entries.create", { ...create, expectedRevision: 1, name: "站点甲" });
  const beta = await client.call<Receipt>("safe.entries.create", { ...create, expectedRevision: 2, name: "站点乙" });
  const revise = { session: scope, entryId: alpha.entryId, expectedRevision: alpha.revision };
  const firstRemoval = { ...revise, accountId: alpha.accountIds[0] };
  await expect(client.call("safe.accounts.delete", { ...firstRemoval, accountId: beta.accountIds[0] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const edit = await client.call<UpdatedAccount>("safe.accounts.update", { ...firstRemoval, note: "另一端已改过", password: { kind: "keep" } });
  await expect(client.call("safe.accounts.delete", firstRemoval)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const removed = await client.call<{ revision: number }>("safe.accounts.delete", { ...firstRemoval, expectedRevision: edit.revision });
  const lastRemoval = { ...revise, expectedRevision: removed.revision, accountId: alpha.accountIds[1] };
  await expect(client.call("safe.accounts.delete", lastRemoval)).rejects.toMatchObject({ code: "INVALID_INPUT", details: { reason: "last-account" } });
  const erase = { ...revise, expectedRevision: removed.revision, confirmedAccountCount: 1 };
  await expect(client.call("safe.entries.delete", { ...erase, confirmedAccountCount: 2 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const manifest = path.join(current, "manifest.json");
  const published = readFileSync(manifest);
  const failure = blockManifestPublish(engine);
  try {
    await expect(client.call("safe.entries.delete", erase)).rejects.toMatchObject({ code: "INTERNAL" });
    expect(failure.intercepted()).toBe(true);
  } finally {
    failure.mock.mockRestore();
  }
  expect(readFileSync(manifest)).toEqual(published);
  await engine.shutdown();
  const reopened = await openEngine(root);
  await reopened.client.call("safe.unlock", { password: data.password });
  const unlocked = await session(reopened.client);
  const detail = { session: unlocked, entryId: alpha.entryId };
  expect((await reopened.client.call<Detail>("safe.entries.get", detail)).accounts.map(({ accountId }) => accountId)).toEqual([alpha.accountIds[1]]);
  expect(await reopened.client.call("safe.entries.delete", { ...erase, session: unlocked })).toEqual({ entryId: alpha.entryId, deleted: true });
  await expect(reopened.client.call("safe.entries.get", detail)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const kept = await reopened.client.call<TaggedDetail>("safe.entries.get", { session: unlocked, entryId: beta.entryId });
  expect(kept.tagIds).toEqual([tagId]);
  expect(kept.accounts.map(({ accountId }) => accountId)).toEqual(beta.accountIds);
  expect((await reopened.client.call<TagDirectory>("safe.tags.list", { session: unlocked })).tags).toMatchObject([{ tagId }]);
}, 30_000);

test("条目与内联新增标签只由同一份清单发布，失败后重试可复用标签", async () => {
  const { client, current, engine, root } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const name = `tag-${data.marker}`;
  const request = { session: scope, expectedRevision: 0, name: data.name, accounts: data.accounts, newTags: [{ name, color: "blue" }] };
  const write = engine.vault.files.write.bind(engine.vault.files);
  const mock = vi.spyOn(engine.vault.files, "write").mockImplementation((file, bytes, options) => {
    if (file.endsWith("/manifest.json")) return Promise.reject(new Error("controlled compound manifest failure"));
    return write(file, bytes, options);
  });
  const manifest = path.join(current, "manifest.json");
  const before = readFileSync(manifest);
  try {
    expect(await codeOf(client.call("safe.entries.create", request))).toBe("INTERNAL");
    expect(readFileSync(manifest).equals(before)).toBe(true);
    expect(await client.call("safe.tags.list", { session: scope })).toEqual({ revision: 0, tags: [] });
  } finally {
    mock.mockRestore();
  }
  const first = await client.call<Receipt>("safe.entries.create", request);
  const directory = await client.call<TagDirectory>("safe.tags.list", { session: scope });
  expect(directory.tags).toEqual([{ tagId: expect.any(String), name, color: "blue" }]);
  const tagId = directory.tags[0]!.tagId;
  const second = await client.call<Receipt>("safe.entries.create", { ...request, expectedRevision: 1, newTags: [{ name, color: "orange" }] });
  expect(await client.call("safe.tags.list", { session: scope })).toEqual({ revision: 2, tags: directory.tags });
  for (const entryId of [first.entryId, second.entryId]) {
    expect((await client.call<TaggedDetail>("safe.entries.get", { session: scope, entryId })).tagIds).toEqual([tagId]);
  }
  expect(containsBytes(root, [name, data.marker])).toBe(false);
  expect((await client.call<{ hits: unknown[] }>("vault.search", { query: name })).hits).toEqual([]);
}, 30_000);

test("删除共享标签在锁定和发布失败时保留完整旧代，重开后完整读回新代", async () => {
  const { client, current, engine, root } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const tag = await client.call<{ tagId: string }>("safe.tags.create", { session: scope, expectedRevision: 0, name: data.marker, color: "purple" });
  const create = (expectedRevision: number) => client.call<Receipt>("safe.entries.create", { session: scope, expectedRevision, name: data.name, tagIds: [tag.tagId], accounts: data.accounts });
  const first = await create(1);
  const second = await create(2);
  const manifest = path.join(current, "manifest.json");
  const before = readFileSync(manifest);
  const request = { session: scope, expectedRevision: 3, tagId: tag.tagId };
  const entered = signal();
  const resume = signal();
  const write = engine.vault.files.write.bind(engine.vault.files);
  const delayed = vi.spyOn(engine.vault.files, "write").mockImplementation(async (file, bytes, options) => {
    const result = await write(file, bytes, options);
    if (file.endsWith("/manifest.json")) {
      entered.resolve();
      await resume.promise;
    }
    return result;
  });
  const pending = codeOf(client.call("safe.tags.delete", request));
  try {
    expect(await Promise.race([entered.promise.then(() => true), pending.then(() => false)])).toBe(true);
    await client.call("safe.lock");
  } finally {
    resume.resolve();
  }
  expect(await pending).toBe("SAFE_LOCKED");
  delayed.mockRestore();
  expect(readFileSync(manifest).equals(before)).toBe(true);
  expect(await codeOf(client.call("safe.tags.list", { session: scope }))).toBe("SAFE_LOCKED");
  await client.call("safe.unlock", { password: data.password });
  const next = await session(client);
  const ids = [first.entryId, second.entryId];
  const staged = vi.spyOn(engine.vault.files, "write").mockImplementation((file, bytes, options) => {
    if (file.endsWith("/tags.bin")) return Promise.reject(new Error("controlled tag directory failure"));
    return write(file, bytes, options);
  });
  try {
    expect(await codeOf(client.call("safe.tags.delete", { ...request, session: next }))).toBe("INTERNAL");
    expect(readFileSync(manifest).equals(before)).toBe(true);
    expect((await client.call<TagDirectory>("safe.tags.list", { session: next })).tags).toHaveLength(1);
    for (const entryId of ids) {
      expect((await client.call<TaggedDetail>("safe.entries.get", { session: next, entryId })).tagIds).toEqual([tag.tagId]);
    }
  } finally {
    staged.mockRestore();
  }
  const blocked = blockManifestPublish(engine, () => ids.every((entryId) => existsSync(path.join(current, "entries", `${entryId}-2.bin`))) && existsSync(path.join(current, "tags", "2.bin")));
  try {
    expect(await codeOf(client.call("safe.tags.delete", { ...request, session: next }))).toBe("INTERNAL");
    expect(blocked.intercepted()).toBe(true);
    expect(readFileSync(manifest).equals(before)).toBe(true);
    expect(readdirSync(path.join(current, "entries")).sort()).toEqual(ids.map((entryId) => `${entryId}-1.bin`).sort());
    expect(readdirSync(path.join(current, "tags"))).toEqual(["1.bin"]);
  } finally {
    blocked.mock.mockRestore();
  }
  expect(await client.call("safe.tags.delete", { ...request, session: next })).toEqual({ tagId: tag.tagId, revision: 4 });
  await engine.shutdown();
  const reopened = await openEngine(root);
  await reopened.client.call("safe.unlock", { password: data.password });
  const restored = await session(reopened.client);
  expect(await reopened.client.call("safe.tags.list", { session: restored })).toEqual({ revision: 4, tags: [] });
  for (const entryId of ids) {
    const detail = await reopened.client.call<TaggedDetail>("safe.entries.get", { session: restored, entryId });
    expect(detail.tagIds).toEqual([]);
    expect(detail.revision).toBe(2);
    expect(detail.accounts.map(({ account }) => account)).toEqual(data.accounts.map(({ account }) => account));
  }
}, 30_000);

function containsBytes(root: string, values: string[]): boolean {
  const markers = values.map((value) => Buffer.from(value));
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const bytes = readFileSync(path.join(entry.parentPath, entry.name));
    if (markers.some((marker) => bytes.includes(marker))) return true;
  }
  return false;
}

test("只更新指定账号并显式设置、保留、清空密码，重开后其他账号逐字一致", async () => {
  const { client, engine, root } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const { entryId, accountIds } = await client.call<Receipt>("safe.entries.create", { session: scope, expectedRevision: 0, name: data.name, url: data.url, accounts: data.accounts });
  const identity = { session: scope, entryId, accountId: accountIds[2] };
  const get = (host: EngineClient, session: Session) => host.call<Detail>("safe.entries.get", { session, entryId });
  const before = await get(client, scope);
  const newPassword = ` ${randomUUID()}  `;
  const newNote = `note_${randomUUID()}`;
  const phone = "000987654321";
  const set = client.call<UpdatedAccount>("safe.accounts.update", { ...identity, expectedRevision: 1, phone, note: newNote, password: { kind: "set", value: newPassword } });
  expect(await codeOf(set)).toBe("OK");
  expect(await set).toEqual({ entryId, accountId: accountIds[2], revision: 2, hasPassword: true });
  expect(await codeOf(client.call("safe.accounts.update", { ...identity, expectedRevision: 2, password: "••••••" }))).toBe("INVALID_INPUT");
  expect(await codeOf(client.call("safe.accounts.update", { ...identity, expectedRevision: 2, password: { kind: "set", value: "" } }))).toBe("INVALID_INPUT");
  expect(await codeOf(client.call("safe.accounts.update", { ...identity, expectedRevision: 2, accountId: randomUUID(), password: { kind: "clear" } }))).toBe("NOT_FOUND");
  const afterSet = await get(client, scope);
  expect(afterSet.name === before.name && afterSet.url === before.url).toBe(true);
  const url = `https://example.test/${randomUUID()}`;
  expect(await client.call("safe.entries.update", { session: scope, entryId, expectedRevision: 2, url })).toEqual({ entryId, revision: 3 });
  expect(JSON.stringify((await get(client, scope)).accounts) === JSON.stringify(afterSet.accounts)).toBe(true);
  expect(await client.call("safe.accounts.update", { ...identity, expectedRevision: 3, email: "", password: { kind: "keep" } })).toEqual({ entryId, accountId: accountIds[2], revision: 4, hasPassword: true });

  await engine.shutdown();
  const reopened = await openEngine(root);
  await reopened.client.call("safe.unlock", { password: data.password });
  const next = await session(reopened.client);
  const detail = await get(reopened.client, next);
  expect(detail.revision).toBe(4);
  expect(detail.name === before.name && detail.url === url).toBe(true);
  expect(JSON.stringify(detail.accounts.slice(0, 2)) === JSON.stringify(before.accounts.slice(0, 2))).toBe(true);
  expect(detail.accounts[2]?.phone === phone && detail.accounts[2]?.note === newNote).toBe(true);
  const reveal = (accountId: string | undefined) => reopened.client.call<{ password: string }>("safe.accounts.reveal", { session: next, entryId, accountId });
  expect((await reveal(accountIds[0])).password === data.accounts[0]?.password).toBe(true);
  expect((await reveal(accountIds[1])).password === "").toBe(true);
  expect((await reveal(accountIds[2])).password === newPassword).toBe(true);
  expect(await codeOf(reopened.client.call("safe.accounts.update", { ...identity, expectedRevision: 4, password: { kind: "clear" } }))).toBe("SAFE_LOCKED");
  expect(await reopened.client.call("safe.accounts.update", { ...identity, session: next, expectedRevision: 4, password: { kind: "clear" } })).toEqual({ entryId, accountId: accountIds[2], revision: 5, hasPassword: false });
  expect((await reveal(accountIds[2])).password === "").toBe(true);
  const receipts = path.join(reopened.engine.vault.runtimeDir, "idempotency.ndjson");
  expect(existsSync(receipts) && readFileSync(receipts, "utf8").includes("safe.accounts.update")).toBe(false);
  await reopened.engine.shutdown();
  const afterClear = await openEngine(root);
  await afterClear.client.call("safe.unlock", { password: data.password });
  const finalSession = await session(afterClear.client);
  const final = await get(afterClear.client, finalSession);
  expect(final.revision).toBe(5);
  expect(final.accounts[2]?.hasPassword).toBe(false);
  const cleared = await afterClear.client.call<{ password: string }>("safe.accounts.reveal", { session: finalSession, entryId, accountId: accountIds[2] });
  expect(cleared.password === "").toBe(true);
  await afterClear.engine.shutdown();
  expect(containsBytes(root, [data.marker, newPassword, newNote, phone])).toBe(false);
}, 30_000);

test("同条目并发修改报告当前版本，不同条目可并发提交", async () => {
  const { client } = await openEngine();
  const other = new SafeTestClient(client.endpoint);
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const create = (expectedRevision: number) => client.call<Receipt>("safe.entries.create", { session: scope, expectedRevision, name: data.name, accounts: data.accounts });
  const first = await create(0);
  const second = await create(1);
  const req = { session: scope, entryId: first.entryId, expectedRevision: 1 };
  const a = client.call("safe.entries.update", { ...req, url: data.url });
  const b = other.call("safe.accounts.update", { ...req, accountId: first.accountIds[2], note: randomUUID(), password: { kind: "keep" } });
  expect((await Promise.all([codeOf(a), codeOf(b)])).sort()).toEqual(["OK", "VERSION_CONFLICT"]);
  const conflict = await other.call("safe.accounts.update", { ...req, accountId: first.accountIds[2], password: { kind: "keep" } }).catch((error: CapabilityError) => error);
  expect(conflict instanceof CapabilityError && conflict.details?.currentVersion === "2").toBe(true);
  expect(await codeOf(other.call("safe.accounts.update", { ...req, entryId: second.entryId, accountId: first.accountIds[2], password: { kind: "keep" } }))).toBe("NOT_FOUND");

  const [left, right] = await Promise.all([client.call("safe.entries.update", { ...req, expectedRevision: 2, url: "" }), other.call("safe.entries.update", { ...req, entryId: second.entryId, url: data.url })]);
  expect(left).toEqual({ entryId: first.entryId, revision: 3 });
  expect(right).toEqual({ entryId: second.entryId, revision: 2 });
}, 30_000);

test("编辑写入中断后重开仍只读旧版，保留未发布的密文并允许重试", async () => {
  const { client, engine, root, current } = await openEngine();
  const data = fixture();
  await client.call("safe.setup", { password: data.password });
  const scope = await session(client);
  const { entryId, accountIds } = await client.call<Receipt>("safe.entries.create", { session: scope, expectedRevision: 0, name: data.name, accounts: data.accounts });
  const request = { session: scope, entryId, accountId: accountIds[2], expectedRevision: 1, password: { kind: "clear" } };
  const manifest = path.join(current, "manifest.json");
  const original = readFileSync(manifest);
  const files = path.join(current, "entries");
  const published = readFileSync(path.join(files, `${entryId}-1.bin`));
  const write = engine.vault.files.write.bind(engine.vault.files);
  const mock = vi.spyOn(engine.vault.files, "write").mockImplementation((file, bytes, options) => {
    if (file.endsWith("/manifest.json")) return Promise.reject(new Error("controlled manifest failure"));
    return write(file, bytes, options);
  });
  try {
    expect(await codeOf(client.call("safe.accounts.update", request))).toBe("INTERNAL");
    expect(readFileSync(manifest).equals(original)).toBe(true);
    expect(readdirSync(files)).toEqual([`${entryId}-1.bin`]);
  } finally {
    mock.mockRestore();
  }

  const entered = signal();
  const release = signal();
  let unpublished: Buffer | undefined;
  const delayed = vi.spyOn(engine.vault.files, "write").mockImplementation(async (file, bytes, options) => {
    const result = await write(file, bytes, options);
    if (file.endsWith("/entry.bin")) unpublished = Buffer.from(bytes);
    if (file.endsWith("/manifest.json")) {
      entered.resolve();
      await release.promise;
    }
    return result;
  });
  const pending = codeOf(client.call("safe.accounts.update", request));
  try {
    expect(await Promise.race([entered.promise.then(() => true), pending.then(() => false)])).toBe(true);
    await client.call("safe.lock");
    await client.call("safe.unlock", { password: data.password });
  } finally {
    release.resolve();
  }
  expect(await pending).toBe("SAFE_LOCKED");
  delayed.mockRestore();
  expect(readFileSync(manifest).equals(original)).toBe(true);
  expect(readdirSync(files)).toEqual([`${entryId}-1.bin`]);

  await engine.shutdown();
  // Reconstruct the disk state after the ciphertext rename and before the manifest rename.
  if (!unpublished) throw new Error("Expected the staged version to exist");
  const orphan = path.join(files, `${entryId}-2.bin`);
  writeFileSync(orphan, unpublished);
  const reopened = await openEngine(root);
  await reopened.client.call("safe.unlock", { password: data.password });
  const next = await session(reopened.client);
  const prior = await reopened.client.call<Detail>("safe.entries.get", { session: next, entryId });
  expect(prior.revision).toBe(1);
  expect(prior.accounts[2]?.hasPassword).toBe(true);
  expect(await reopened.client.call("safe.accounts.update", { ...request, session: next })).toEqual({ entryId, accountId: accountIds[2], revision: 3, hasPassword: false });
  expect(readFileSync(orphan).equals(unpublished)).toBe(true);
  expect(readFileSync(path.join(files, `${entryId}-1.bin`)).equals(published)).toBe(true);
  expect((await reopened.client.call<Detail>("safe.entries.get", { session: next, entryId })).revision).toBe(3);
}, 30_000);

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
  expect(await codeOf(client.call("safe.items.list"))).toBe("CAPABILITY_NOT_FOUND");
  expect(await codeOf(client.call("safe.items.reveal", { id: receipt.entryId }))).toBe("CAPABILITY_NOT_FOUND");
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

  const finalRename = blockManifestPublish(engine);
  try {
    expect(await codeOf(create(base))).toBe("INTERNAL");
    expect(finalRename.intercepted()).toBe(true);
    expect(readFileSync(manifest).equals(before)).toBe(true);
    expect(readdirSync(path.join(current, "entries"))).toEqual([]);
  } finally {
    finalRename.mock.mockRestore();
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
