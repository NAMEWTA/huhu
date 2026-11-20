import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type DashboardUpdate } from "@huhu/contracts";
import { Vault } from "@huhu/vault";
import { afterEach, assert, expect, test, vi } from "vitest";
import { z } from "zod";
import { defineDashboardUpdate, readDashboard } from "../src/capabilities/home-dashboard.js";
import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore } from "../src/index.js";

const paths: string[] = [];
const opened = new Set<Vault>();
const file = ".huhu/home/widgets.json";
const focus = "widget:kernel:focus";
const rule = { minSize: { w: 2, h: 2 }, maxSize: { w: 4, h: 4 }, maxInstances: 1, configSchema: z.strictObject({}) };

function dispatch(vault: Vault) {
  const registry = new CapabilityRegistry();
  registry.register(defineDashboardUpdate(vault, new Map([[focus, rule]]), () => new Date("2026-11-20T00:00:00.000Z")));
  const dispatcher = new Dispatcher({
    registry,
    audit: new GatewayAudit(),
    idempotency: new IdempotencyStore(),
    isPluginEnabled: () => true,
    toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
    grantedPermissions: () => [],
    pluginOrigin: () => "builtin",
  });
  let attempt = 0;
  return (input: unknown, idempotencyKey = `dashboard-attempt-${++attempt}`) => dispatcher.call("desktop", { capability: "home.dashboard.update", requestId: idempotencyKey, idempotencyKey, input });
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-dashboard-"));
  paths.push(root);
  const vault = await Vault.open(root, { create: true });
  opened.add(vault);
  const fresh = readDashboard(vault).board;
  const instance = fresh.instances.find((item) => item.widgetType === focus)!;
  const placement = fresh.layout.find((item) => item.instanceId === instance.instanceId)!;
  const input = { baseRevision: fresh.revision, instances: [instance], layout: [placement] };
  return { vault, input, save: dispatch(vault) };
}

afterEach(async () => {
  for (const vault of opened) await vault.close();
  opened.clear();
  for (const root of paths.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test("W02-02 按同一 revision 并发提交一次，重启 Vault 后读回同一布局", async () => {
  const { vault, input, save } = await fixture();
  input.layout[0]!.x = 1;
  const one = save(input, "dashboard-same-request");
  const again = save(input, "dashboard-same-request");
  const concurrent = save({ ...input, layout: [{ ...input.layout[0]!, x: 2 }] });
  const result = await one;
  assert(result.ok);
  expect(result).toMatchObject({ ok: true, data: { source: "stored", board: { layout: input.layout, instances: input.instances } } });
  expect(await again).toMatchObject({ ok: true, data: result.data });
  expect(await concurrent).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  await vault.close();
  opened.delete(vault);
  const reopened = await Vault.open(vault.root);
  opened.add(reopened);
  expect(readDashboard(reopened)).toEqual(result.data);
});

test("W02-02 校验布局和配置，拒绝整板后逐字节读取原文件", async () => {
  const { vault, input, save } = await fixture();
  expect((await save(input)).ok).toBe(true);
  const stored = readDashboard(vault).board;
  const bytes = readFileSync(vault.files.abs(file));
  const good = { ...input, baseRevision: stored.revision };
  const instance = good.instances[0]!;
  const placement = good.layout[0]!;
  const hiddenCopy = { ...instance, instanceId: "next", hidden: true };
  const nextPlacement = { ...placement, instanceId: hiddenCopy.instanceId, y: placement.y + placement.h };
  const bad: DashboardUpdate[] = [
    { ...good, instances: [{ ...instance, instanceId: "" }] },
    { ...good, instances: [instance, instance] },
    { ...good, layout: [] },
    { ...good, instances: [instance, hiddenCopy], layout: [placement, { ...nextPlacement, y: 0 }] },
    { ...good, layout: [{ ...placement, x: Infinity }] },
    { ...good, layout: [{ ...placement, y: -1 }] },
    { ...good, layout: [{ ...placement, w: 5 }] },
    { ...good, instances: [instance, hiddenCopy], layout: [placement, nextPlacement] },
    { ...good, instances: [{ ...instance, config: { businessContent: "not-a-reference" } }] },
    { ...good, instances: [{ ...instance, instanceId: "other", widgetType: "widget:extra:unknown" }], layout: [{ ...placement, instanceId: "other" }] },
  ];
  for (const draft of [...bad, { ...good, businessContent: "unexpected field" }]) {
    expect(await save(draft)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(vault.files.abs(file))).toEqual(bytes);
  }
  const readonly = await Vault.open(vault.root, { readOnly: true });
  opened.add(readonly);
  expect(await dispatch(readonly)(good)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
  const fail = vi.spyOn(vault.files, "write").mockRejectedValueOnce(new Error("before replacement"));
  expect(await save(good)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  expect(readFileSync(vault.files.abs(file))).toEqual(bytes);
  fail.mockRestore();
  expect((await save(good)).ok).toBe(true);
});

test("W02-02 已存未知类型可随布局保存但无法注入配置，损坏原件不可覆盖", async () => {
  const { vault, input, save } = await fixture();
  expect((await save(input)).ok).toBe(true);
  const stored = readDashboard(vault).board;
  const unknown = { ...stored.instances[0]!, widgetType: "widget:missing:old", config: { ref: "original" } };
  const board = { ...stored, instances: [unknown] };
  const pathname = vault.files.abs(file);
  writeFileSync(pathname, JSON.stringify(board));
  const draft = { baseRevision: board.revision, instances: [unknown], layout: [{ ...board.layout[0]!, x: 1 }] };
  expect(await save({ ...draft, instances: [{ ...unknown, config: { ref: "changed" } }] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await save(draft)).toMatchObject({ ok: true, data: { board: { instances: [unknown] } } });
  writeFileSync(pathname, "{malformed");
  expect(await save(draft)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(readFileSync(pathname, "utf8")).toBe("{malformed");
});
