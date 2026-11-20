import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import * as crypto from "../src/engine/crypto.js";
import { signal } from "./signal.js";

const PASSWORD = "synthetic safe master password";
const dirs: string[] = [];
const engines: RunningEngine[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function start(root = mkdtempSync(path.join(tmpdir(), "huhu-safe-engine-")), create = true) {
  if (create) dirs.push(root);
  const engine = await boot({ vaultPath: root, create });
  engines.push(engine);
  return engine;
}

type Reply = { ok: true; data: { instanceId: string; generation: number } } | { ok: false; error: { code: string; message: string } };
async function call(engine: RunningEngine, capability: string, input: object = {}): Promise<Reply> {
  const id = randomUUID();
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
  });
  return (await response.json()) as Reply;
}

async function status(engine: RunningEngine) {
  const reply = await call(engine, "safe.status");
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.data;
}

test("桌面 HTTP 入口设置、离开锁定、切换 Vault 和重开；损坏清单原字节保留", async () => {
  const engine = await start();
  const locks: unknown[] = [];
  engine.events.subscribe((event) => {
    if (event.type === "safe.locked") locks.push(event.payload);
  });
  const uninitialized = await status(engine);
  expect(uninitialized).toMatchObject({ initialized: false, locked: true });
  expect(await call(engine, "safe.setup", { password: PASSWORD })).toMatchObject({ ok: true });
  const active = await status(engine);
  expect(active).toMatchObject({ instanceId: uninitialized.instanceId, generation: uninitialized.generation + 1, locked: false });
  expect(await call(engine, "safe.lock", { reason: "leave" })).toMatchObject({ ok: true });
  expect(await status(engine)).toEqual(active);
  expect(locks).toEqual([]);
  expect(await call(engine, "safe.settings.update", { lockOnLeave: true, autoLockMinutes: 1 })).toMatchObject({ ok: true });
  expect(await call(engine, "safe.lock", { reason: "leave" })).toMatchObject({ ok: true });
  expect(await status(engine)).toMatchObject({ locked: true, lockOnLeave: true, generation: active.generation + 1 });
  expect(locks).toEqual([{ instanceId: active.instanceId, generation: active.generation + 1, reason: "leave" }]);
  await engine.shutdown();

  const other = await start();
  expect(await status(other)).toMatchObject({ initialized: false, locked: true });
  await other.shutdown();

  const reopened = await start(engine.vault.root, false);
  const reopenedStatus = await status(reopened);
  expect(reopenedStatus).toMatchObject({ initialized: true, locked: true, lockOnLeave: true, autoLockMinutes: 1 });
  expect(reopenedStatus.instanceId).not.toBe(active.instanceId);
  expect(await call(reopened, "safe.unlock", { password: PASSWORD })).toMatchObject({ ok: true });
  const { instanceId, generation } = await status(reopened);
  expect(await call(reopened, "safe.entries.list", { session: { instanceId, generation } })).toEqual({ ok: true, data: { revision: 0, entries: [] } });
  expect(await call(reopened, "safe.lock")).toMatchObject({ ok: true });

  const file = path.join(reopened.vault.root, ".huhu", "safe", "current", "manifest.json");
  const damaged = Buffer.from("{synthetic-damage");
  writeFileSync(file, damaged);
  expect(await status(reopened)).toMatchObject({ corrupt: true, corruptFile: "manifest.json", locked: true });
  for (const capability of ["safe.unlock", "safe.setup"]) {
    expect(await call(reopened, capability, { password: PASSWORD })).toMatchObject({ ok: false, error: { message: expect.stringMatching(/manifest.json.*损坏/) } });
  }
  expect(readFileSync(file)).toEqual(damaged);
}, 30_000);

test.each(["disable", "shutdown"] as const)(
  "真实 Engine %s 时拒绝阻塞在 scrypt 的解锁",
  async (action) => {
    const engine = await start();
    expect(await call(engine, "safe.setup", { password: PASSWORD })).toMatchObject({ ok: true });
    expect(await call(engine, "safe.lock")).toMatchObject({ ok: true });
    const instanceId = (await status(engine)).instanceId;
    const entered = signal();
    const release = signal();
    const derive = crypto.deriveKek;
    vi.spyOn(crypto, "deriveKek").mockImplementationOnce(async (password, kdf) => {
      entered.resolve();
      await release.promise;
      return derive(password, kdf);
    });
    const unlocking = call(engine, "safe.unlock", { password: PASSWORD });
    await entered.promise;
    let shutdown: Promise<void> | undefined;
    try {
      if (action === "disable") {
        expect(await call(engine, "plugins.setEnabled", { id: "safe", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
        expect(await call(engine, "safe.status")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      } else {
        const closing = signal();
        const unsubscribe = engine.events.subscribe((event) => {
          if (event.type === "engine.closing") closing.resolve();
        });
        shutdown = engine.shutdown();
        await closing.promise;
        unsubscribe();
      }
    } finally {
      release.resolve();
    }
    expect(await unlocking).toMatchObject({ ok: false, error: { code: "SAFE_LOCKED" } });
    await shutdown;
    const next = action === "shutdown" ? await start(engine.vault.root, false) : engine;
    if (action === "disable") expect(await call(next, "plugins.setEnabled", { id: "safe", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
    expect(await status(next)).toMatchObject({ initialized: true, locked: true });
    expect((await status(next)).instanceId).not.toBe(instanceId);
    expect(await call(next, "safe.unlock", { password: PASSWORD })).toMatchObject({ ok: true });
  },
  30_000,
);
