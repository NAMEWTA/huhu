import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, DashboardBoardSchema, type DashboardBoard } from "@huhu/contracts";
import { sshHostsWidget } from "@huhu/plugin-ssh/shared";
import { afterEach, expect, test, vi } from "vitest";
import type { z } from "zod";
import { defineDashboardRecovery } from "../../../packages/kernel/src/capabilities/home-dashboard.js";
import { boot, type RunningEngine } from "../src/boot.js";

const boardPath = ".huhu/home/widgets.json";
const known = { instanceId: "ssh-a", widgetType: "widget:ssh:hosts", config: { hostId: "synthetic-host" }, hidden: false };
const unknown = { instanceId: "retained", widgetType: "widget:missing:card", config: { flags: [false, { id: "opaque" }] }, hidden: true };
const backup: DashboardBoard = {
  schemaVersion: 1,
  boardId: "home",
  revision: "source-1",
  updatedAt: "2026-11-19T00:00:00.000Z",
  instances: [known, unknown],
  layout: [
    { instanceId: known.instanceId, x: 3, y: 0, w: 3, h: 2 },
    { instanceId: unknown.instanceId, x: 0, y: 1, w: 3, h: 2 },
  ],
};
const damage = {
  ...backup,
  revision: "damaged-1",
  instances: [known, unknown, { ...known, instanceId: "missing-place" }],
  layout: [
    { instanceId: known.instanceId, x: 9, y: -1, w: null, h: 0 },
    { instanceId: unknown.instanceId, x: 3, y: 0, w: 3, h: 2 },
    { instanceId: "orphan", x: 0, y: 0, w: 1, h: 1 },
  ],
};
const now = new Date("2026-11-20T10:00:00.000Z");
const dirs: string[] = [];
const engines = new Set<RunningEngine>();

function tempVault(): string {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-dashboard-recovery-"));
  dirs.push(root);
  return root;
}

async function open(root = tempVault(), readOnly = false): Promise<RunningEngine> {
  const engine = await boot({ vaultPath: root, ...(readOnly ? { readOnly } : { create: true }) });
  engines.add(engine);
  return engine;
}

async function close(engine: RunningEngine): Promise<void> {
  await engine.shutdown();
  engines.delete(engine);
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const engine of engines) await close(engine);
  for (const root of dirs.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

function post(engine: RunningEngine, capability: string, input: unknown = {}, idempotencyKey = randomUUID()): Promise<{ ok: boolean; data?: unknown; error?: { code: string } }> {
  return fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey }),
  }).then(async (response) => CapabilityResultSchema.parse(await response.json()));
}

function recovery(engine: RunningEngine) {
  const { preview, commit } = defineDashboardRecovery(engine.vault, new Map([[known.widgetType, sshHostsWidget]]), () => now);
  return {
    preview: (intent: unknown) => post(engine, preview.name, intent),
    async prepare(intent: unknown) {
      const result = await post(engine, preview.name, intent);
      expect(result).toMatchObject({ ok: true });
      return preview.output.parse(result.data);
    },
    commit: (intent: unknown, confirmation: z.infer<typeof preview.output>["confirmation"], key?: ReturnType<typeof randomUUID>) => post(engine, commit.name, { intent, confirmation }, key),
  };
}

function writeBoard(engine: RunningEngine, bytes: string | Buffer): string {
  const file = engine.vault.files.abs(boardPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return file;
}

function unrelatedFiles(engine: RunningEngine) {
  const files = new Map(
    Object.entries({
      "Synthetic note.md": "# Synthetic note\r\nkeep me\r\n",
      ".huhu/home/focus.json": '{"remainingSec": 123}\r\n',
      ".huhu/home/habits.json": '{"habits":[]}\r\n',
      ".huhu/home/widgets.json.preexisting-backup": JSON.stringify(backup),
    }).map(([rel, contents]) => [engine.vault.files.abs(rel), Buffer.from(contents)]),
  );
  for (const [abs, bytes] of files) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
  }
  return () => {
    for (const [abs, bytes] of files) expect(readFileSync(abs)).toEqual(bytes);
  };
}

function preservedFile(file: string, bytes: string): string {
  return `${file}.corrupt-${createHash("sha256").update(bytes).digest("hex")}`;
}

test("在空 Vault 恢复真实 Engine 返回的当前格式备份并重开", async () => {
  const source = await open();
  const sourceBytes = JSON.stringify(backup, null, 2) + "\r\n";
  const sourceFile = writeBoard(source, sourceBytes);
  const downloaded = DashboardBoardSchema.parse((await post(source, "home.dashboard.backup")).data);
  expect(downloaded).toEqual(backup);
  const target = await open();
  const checkUnrelated = unrelatedFiles(target);
  const file = target.vault.files.abs(boardPath);
  expect(await post(target, "home.dashboard.recovery.preview", { action: "repair" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const api = recovery(target);
  const intent = { action: "restore", backup: downloaded };
  const preview = await api.prepare(intent);
  expect(preview).toMatchObject({ confirmation: { vaultId: target.vault.id, revision: "0", fileDigest: null }, board: downloaded, changes: [], writable: true });
  expect(existsSync(file)).toBe(false);
  const save = await api.commit(intent, preview.confirmation);
  expect(save).toMatchObject({ ok: true, data: { preservedPath: null, view: { board: { instances: backup.instances, layout: backup.layout, updatedAt: expect.any(String) } } } });
  const committed = DashboardBoardSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  expect(committed.revision).not.toBe(downloaded.revision);
  checkUnrelated();
  expect(readFileSync(sourceFile, "utf8")).toBe(sourceBytes);
  expect((await post(source, "home.dashboard.backup")).data).toEqual(downloaded);
  await close(target);
  const reopened = await open(target.vault.root);
  expect(await post(reopened, "home.dashboard.get")).toEqual({ ok: true, data: { source: "stored", writable: true, vaultId: reopened.vault.id, board: committed } });
  checkUnrelated();
});

test("原 v1 业务卡备份保留实例 ID、布局与配置，恢复为插件类型", async () => {
  const engine = await open();
  const migrated = [
    ["tasks", "widget:tasks:tasks", { filter: "today" }],
    ["notes", "widget:notes:recent", {}],
    ["inbox", "widget:inbox:inbox", {}],
    ["agent", "widget:agent-cli:entry", {}],
  ] as const;
  const legacy = {
    ...backup,
    instances: migrated.map(([id, , config], index) => ({ instanceId: `original-${id}`, widgetType: `widget:kernel:${id}`, title: id, config, hidden: index === 3 })),
    layout: migrated.map(([id], index) => ({ instanceId: `original-${id}`, x: 0, y: index * 3, w: 3, h: 3 })),
  };
  const original = JSON.stringify(legacy);
  const file = writeBoard(engine, original);
  const expectedInstances = legacy.instances.map((instance, index) => ({ ...instance, widgetType: migrated[index]![1] }));
  expect(await post(engine, "home.dashboard.backup")).toMatchObject({ ok: true, data: { ...legacy, instances: expectedInstances } });
  const api = recovery(engine);
  const intent = { action: "restore", backup: legacy };
  const preview = await api.prepare(intent);
  expect(preview.board).toEqual({ ...legacy, instances: expectedInstances });
  expect(readFileSync(file, "utf8")).toBe(original);
  const result = await api.commit(intent, preview.confirmation);
  expect(result).toMatchObject({ ok: true, data: { view: { board: { schemaVersion: 1, instances: expectedInstances, layout: legacy.layout } } } });
  expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ schemaVersion: 1, instances: expectedInstances, layout: legacy.layout });
});

test("连续预览零写入，确认后保全原字节并且只提交一份修复", async () => {
  const engine = await open();
  const api = recovery(engine);
  const original = JSON.stringify(damage, null, 2) + "\r\n";
  const file = writeBoard(engine, original);
  const checkUnrelated = unrelatedFiles(engine);
  const listing = readdirSync(path.dirname(file));
  const write = vi.spyOn(engine.vault.files, "write");
  const intent = { action: "repair" };
  expect(await post(engine, "home.dashboard.get")).toMatchObject({ ok: true, data: { source: "invalid", writable: false } });
  const preview = await api.prepare(intent);
  expect(await api.prepare(intent)).toEqual(preview);
  expect(preview.board.instances).toEqual(damage.instances);
  expect(preview.board.layout).toEqual([
    { instanceId: "missing-place", x: 0, y: 0, w: 3, h: 2 },
    { instanceId: "retained", x: 3, y: 0, w: 3, h: 2 },
    { instanceId: "ssh-a", x: 0, y: 2, w: 3, h: 2 },
  ]);
  expect(preview.changes).toEqual([
    { instanceId: "orphan", reasons: ["orphan"], before: { x: 0, y: 0, w: 1, h: 1 }, after: null },
    { instanceId: "missing-place", reasons: ["missing"], before: null, after: preview.board.layout[0] },
    { instanceId: "ssh-a", reasons: ["size-reset", "position-clamped", "collision"], before: { x: 9, y: -1, w: null, h: 0 }, after: preview.board.layout[2] },
  ]);
  expect(write).not.toHaveBeenCalled();
  expect(readdirSync(path.dirname(file))).toEqual(listing);
  expect(readFileSync(file, "utf8")).toBe(original);
  checkUnrelated();

  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all(keys.map((key) => api.commit(intent, preview.confirmation, key)));
  const winner = results.findIndex((reply) => reply.ok);
  const success = results[winner];
  expect(success).toMatchObject({ ok: true, data: { view: { source: "stored", board: { instances: damage.instances, layout: preview.board.layout } }, preservedPath: expect.stringMatching(/^\.huhu\/home\/widgets\.json\.corrupt-/) } });
  expect(results.find((reply) => !reply.ok)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await api.commit(intent, preview.confirmation, keys[winner]!)).toEqual(success);
  expect(write.mock.calls.map(([rel]) => rel)).toEqual([expect.stringContaining(".corrupt-"), boardPath]);
  expect(readFileSync(preservedFile(file, original), "utf8")).toBe(original);
  checkUnrelated();
  await close(engine);
  const reopened = await open(engine.vault.root);
  expect((await post(reopened, "home.dashboard.get")).data).toMatchObject({ board: { instances: damage.instances, layout: preview.board.layout } });
});

test("保护未知、旧格式、来历不可辨、重复或空关联键，拒绝无效备份", async () => {
  const engine = await open();
  const api = recovery(engine);
  const checkUnrelated = unrelatedFiles(engine);
  const file = engine.vault.files.abs(boardPath);
  const layout = { action: "repair" };
  const restore = { action: "restore", backup };
  const empty = await api.prepare(restore);
  const unsafeInputs = [JSON.stringify({ ...damage, schemaVersion: 2 }), JSON.stringify({ hidden: ["focus"] }), "{broken"];
  for (const original of unsafeInputs) {
    writeBoard(engine, original);
    expect(await api.preview(restore)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await api.commit(restore, empty.confirmation)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(file, "utf8")).toBe(original);
  }
  const [prefix, suffix] = JSON.stringify(backup).split("synthetic-host");
  const badEncoding = Buffer.concat([Buffer.from(prefix!), Buffer.from([0xff]), Buffer.from(suffix!)]);
  writeBoard(engine, badEncoding);
  expect(await api.preview(restore)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { issues: [{ reason: "unsafe-target" }] } } });
  expect(readFileSync(file)).toEqual(badEncoding);
  for (const invalid of [
    { ...damage, instances: [known, known] },
    { ...damage, instances: [{ ...known, instanceId: "" }] },
    { ...damage, layout: [...damage.layout, damage.layout[0]] },
    { ...damage, layout: [{ ...damage.layout[0], instanceId: "" }] },
    { ...backup, layout: backup.layout.slice(0, 1) },
  ]) {
    const original = JSON.stringify(invalid);
    writeBoard(engine, original);
    expect(await api.preview(layout)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(file, "utf8")).toBe(original);
  }
  const current = JSON.stringify(backup);
  writeBoard(engine, current);
  const currentTarget = await api.prepare(restore);
  for (const invalid of [{ ...backup, schemaVersion: 2 }, damage, { ...backup, layout: [{ ...backup.layout[0]!, x: 5 }, backup.layout[1]] }]) {
    expect(await api.preview({ action: "restore", backup: invalid })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await api.commit({ action: "restore", backup: invalid }, currentTarget.confirmation)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  }
  expect(readFileSync(file, "utf8")).toBe(current);
  expect(readdirSync(path.dirname(file)).filter((name) => name.includes(".corrupt-"))).toEqual([]);
  checkUnrelated();
});

test("显式恢复含混的当前格式板，保全后若原板字节变化则 CAS 拒写", async () => {
  const engine = await open();
  const api = recovery(engine);
  const original = JSON.stringify({ ...damage, instances: [known, known] });
  const file = writeBoard(engine, original);
  const checkUnrelated = unrelatedFiles(engine);
  const intent = { action: "restore", backup };
  const preview = await api.prepare(intent);
  const held = preservedFile(file, original);
  expect(existsSync(held)).toBe(false);

  const actualWrite = engine.vault.files.write.bind(engine.vault.files);
  const concurrentBytes = original + "\r\n";
  const write = vi.spyOn(engine.vault.files, "write").mockImplementation((rel, bytes, options) => {
    if (rel === boardPath) writeFileSync(file, concurrentBytes);
    return actualWrite(rel, bytes, options);
  });
  expect(await api.commit(intent, preview.confirmation)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(readFileSync(file, "utf8")).toBe(concurrentBytes);
  expect(readFileSync(held, "utf8")).toBe(original);
  checkUnrelated();
  write.mockRestore();

  writeBoard(engine, original);
  const retryWrites = vi.spyOn(engine.vault.files, "write");
  expect(await api.commit(intent, preview.confirmation)).toMatchObject({ ok: true, data: { view: { board: { instances: backup.instances, layout: backup.layout } } } });
  expect(retryWrites.mock.calls.map(([rel]) => rel)).toEqual([boardPath]);
  expect(readFileSync(held, "utf8")).toBe(original);
  checkUnrelated();
});

test("目标 revision、同 revision 字节、Vault 与确认内容须匹配，保全失败和只读均中止", async () => {
  const engine = await open();
  const original = JSON.stringify(damage);
  const file = writeBoard(engine, original);
  const checkUnrelated = unrelatedFiles(engine);
  const api = recovery(engine);
  const repair = { action: "repair" };
  const preview = await api.prepare(repair);
  for (const changed of [JSON.stringify({ ...damage, revision: "another-revision" }), original + "\r\n"]) {
    writeBoard(engine, changed);
    expect(await api.commit(repair, preview.confirmation)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(readFileSync(file, "utf8")).toBe(changed);
  }
  writeBoard(engine, original);
  expect(await api.commit(repair, { ...preview.confirmation, vaultId: "different-vault" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await api.commit({ action: "restore", backup }, preview.confirmation)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

  const preservationPath = preservedFile(file, original);
  const prior = "preexisting bytes at the reserved destination";
  writeFileSync(preservationPath, prior);
  expect(await api.commit(repair, preview.confirmation)).toMatchObject({ ok: false, error: { code: "INTERNAL", details: { reason: "preservation-failed" } } });
  expect(readFileSync(preservationPath, "utf8")).toBe(prior);
  expect(readFileSync(file, "utf8")).toBe(original);
  checkUnrelated();

  await close(engine);
  const readOnly = await open(engine.vault.root, true);
  const readonlyApi = recovery(readOnly);
  const readonlyPreview = await readonlyApi.prepare(repair);
  expect(readonlyPreview).toEqual({ ...preview, writable: false });
  expect(await readonlyApi.commit(repair, readonlyPreview.confirmation)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
  expect(readFileSync(preservationPath, "utf8")).toBe(prior);
  expect(readFileSync(file, "utf8")).toBe(original);
  checkUnrelated();
});
