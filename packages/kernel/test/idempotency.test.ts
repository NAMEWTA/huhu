import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, defineCapability, Dispatcher, GatewayAudit, IdempotencyStore } from "../src/index.js";

const day = 24 * 60 * 60_000;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function journal() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-idempotency-"));
  roots.push(root);
  return path.join(root, "receipts.ndjson");
}
const input = { count: 1 };
const saved = { ok: true, data: { count: 1 } } as const;
const capability = "fixture.write";
const owner = "desktop";
const key = "fixture-key";
const request = { capability, input, requestId: "fixture-r1", idempotencyKey: key };

function dispatcher(store: IdempotencyStore, handler: () => { count: number }) {
  const registry = new CapabilityRegistry();
  registry.register(defineCapability({
    name: capability, plugin: "fixture", scope: "write",
    input: z.object({ count: z.number() }), output: z.object({ count: z.number() }),
    exposable: false, defaultExposed: false, handler,
  }));
  return new Dispatcher({
    registry, idempotency: store, audit: new GatewayAudit(),
    grantedPermissions: () => [], pluginOrigin: () => "builtin", isPluginEnabled: () => true,
    toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
  });
}

test.each(["complete", "torn"] as const)("完整或撕裂的无换行尾部（%s）不会吞掉下一回执", (tail) => {
  const file = journal();
  new IdempotencyStore(file).record(owner, capability, key, input, saved);
  const prefix = readFileSync(file, "utf8");
  writeFileSync(file, tail === "complete" ? prefix.trimEnd() : prefix + '{"k":"截');
  const recovered = new IdempotencyStore(file);
  recovered.record(owner, capability, "next-key", input, saved);
  const reopened = new IdempotencyStore(file);
  for (const check of [key, "next-key"]) expect(reopened.lookup(owner, capability, check, input)).toEqual({ hit: true, mismatch: false, result: saved });
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
});

test("中部损坏保留可读回执和原始日志，拒绝未知新键", async () => {
  const file = journal();
  const store = new IdempotencyStore(file);
  store.record(owner, capability, key, input, saved);
  appendFileSync(file, "incomplete-record\n");
  store.record(owner, capability, "next-key", input, saved);
  const original = readFileSync(file, "utf8");
  const recovered = new IdempotencyStore(file);
  let ran = 0;
  const service = dispatcher(recovered, () => ({ count: ++ran }));
  for (const check of [key, "next-key"]) expect(await service.call(owner, { ...request, idempotencyKey: check })).toEqual(saved);
  expect(await service.call(owner, { ...request, idempotencyKey: "unseen-key" })).toMatchObject({ ok: false, error: { retryable: false, details: { outcome: "not-accepted" } } });
  expect(ran).toBe(0);
  expect(readFileSync(file, "utf8")).toBe(original);
});

test("副作用发生后结果写入失败，重启仍识别受理，异输入继续冲突", async () => {
  const file = journal();
  const backup = file + ".fixture-backup";
  let ran = 0;
  const service = dispatcher(new IdempotencyStore(file), () => {
    ran++;
    renameSync(file, backup);
    mkdirSync(file);
    return { count: ran };
  });
  const result = await service.call(owner, request);
  expect(result).toMatchObject({ ok: false, error: { retryable: false, details: { outcome: "unknown", verification: "receipt-not-confirmed" } } });
  rmSync(file, { recursive: true });
  renameSync(backup, file);
  const reopened = dispatcher(new IdempotencyStore(file), () => ({ count: ++ran }));
  expect(await reopened.call(owner, request)).toEqual(result);
  expect(await reopened.call(owner, { ...request, input: { count: 2 } })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(ran).toBe(1);
});

test("已确认的可重试错误持久释放受理键", async () => {
  const file = journal();
  const failure = dispatcher(new IdempotencyStore(file), () => { throw new HuhuError("INTERNAL", "fixture retry"); });
  expect(await failure.call(owner, request)).toMatchObject({ ok: false, error: { retryable: true } });
  const retry = dispatcher(new IdempotencyStore(file), () => ({ count: 1 }));
  expect(await retry.call(owner, request)).toEqual(saved);
});

test("精确 24 小时边界与长期日志整理保留有效条目", () => {
  const file = journal();
  let now = day * 365;
  const row = (id: string, at: number) => JSON.stringify({ k: `${owner}|${capability}|${id}`, h: IdempotencyStore.hashInput(input), at, result: saved });
  const old = Array.from({ length: 20_000 }, (_, i) => row(`expired-${i}`, now - day - i));
  writeFileSync(file, [...old, row(key, now - day + 1), row("current", now)].join("\n") + "\n");
  const store = new IdempotencyStore(file, () => now);
  expect(store.lookup(owner, capability, key, input)).toMatchObject({ hit: true });
  now++;
  expect(store.lookup(owner, capability, key, input)).toEqual({ hit: false });
  expect(store.lookup(owner, capability, "expired-0", input)).toEqual({ hit: false });
  store.record(owner, capability, "newest", input, saved);
  expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
  const reopened = new IdempotencyStore(file, () => now);
  for (const check of ["current", "newest"]) expect(reopened.lookup(owner, capability, check, input)).toMatchObject({ hit: true });
});
