import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempDisposableSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, DashboardBoardSchema, DashboardRecoveryPreviewSchema, PluginManifestSchema, type CapabilityResult } from "@huhu/contracts";
import { Vault, VaultIndex } from "@huhu/vault";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  CapabilityRegistry,
  Dispatcher,
  EventBus,
  EventLog,
  ExposureStore,
  GatewayAudit,
  GatewayTokens,
  HomeStore,
  IdempotencyStore,
  NotificationStore,
  OperationReceipts,
  PluginManager,
  TokenTable,
  WebShareService,
  createHuhuContext,
  mcpToolName,
  registerHealthCapabilities,
  registerHomeCapabilities,
  registerNotificationAndSettings,
  registerPackageCapabilities,
  registerSystemCapabilities,
  registerVaultCapabilities,
  registerWebShareCapabilities,
  startEngineServer,
} from "../src/index.js";
import { readDashboard } from "../src/capabilities/home-dashboard.js";
import { mcpRequest, mcpRpc, openMcpSession } from "./fixtures/mcp-http.js";

type Entry = "http" | "mcp";
type Call = (name: string, input?: object, intentKey?: string) => Promise<CapabilityResult<unknown>>;
const cleanup: Array<() => void | Promise<void>> = [];
const secretMarker = "synthetic-private-fixture";
const asset = "fixture.md";
const buildInput = z.object({ indexGeneration: z.string() });
const revisionInput = z.object({ revision: z.string() });
const packageOutput = z.object({ path: z.string(), sha256: z.string() });
const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

function data(result: CapabilityResult<unknown>) {
  assert(result.ok, result.ok ? "" : JSON.stringify(result.error));
  return result.data;
}

async function setup(entry: Entry) {
  const workspace = mkdtempDisposableSync(path.join(tmpdir(), "huhu-kernel-exposure-"));
  cleanup.push(workspace.remove);
  const root = path.join(workspace.path, "Vault");
  mkdirSync(root);
  const vault = await Vault.open(root, { create: true });
  cleanup.push(() => vault.close());
  writeFileSync(path.join(root, asset), "# kernel fixture\n");
  writeFileSync(path.join(vault.stateDir, "private.json"), secretMarker);
  const registry = new CapabilityRegistry();
  const tokens = new TokenTable();
  const events = new EventBus(() => vault.id);
  const audit = new GatewayAudit();
  const exposure = new ExposureStore(vault.files, path.join(vault.stateDir, "plugins.json"));
  const gateway = new GatewayTokens(path.join(vault.stateDir, "gateways.json"), tokens);
  const { root: context, facade } = createHuhuContext({ registry, events, vault: undefined as never, call: async () => null });
  const plugins = new PluginManager(context, facade, events);
  cleanup.push(() => plugins.disposeAll());
  for (const [id, dependsOn] of [
    ["base", []],
    ["dependent", ["base"]],
  ] as const) {
    plugins.register({ manifest: PluginManifestSchema.parse({ id, title: id, description: "", version: "1.0.0", origin: "builtin", dependsOn }), apply: () => undefined });
  }
  await plugins.enable("dependent");
  const index = new VaultIndex(root);
  await index.build();
  const notices = new NotificationStore(path.join(vault.stateDir, "notifications.ndjson"));
  const mark = notices.create({ title: "专注完成", module: "home" });
  const discard = notices.create({ title: "专注完成", module: "home" });
  const clear = notices.create({ title: "专注完成", module: "home" });
  notices.markRead([clear.id]);
  const hidden = notices.create({ title: secretMarker, module: "ssh", body: secretMarker });
  const clock = { now: new Date("2026-11-21T12:00:00Z") };
  const home = new HomeStore({ dir: path.join(vault.stateDir, "home"), now: () => clock.now, zone: () => "UTC", notify: (notice) => void notices.create(notice) });
  const log = new EventLog(path.join(vault.stateDir, "diagnostics.ndjson"));
  log.append({ module: "笔记", message: secretMarker, tone: "neutral" });
  log.append({ module: secretMarker, message: secretMarker, tone: "error" });
  const probe = vi.fn(() => [{ id: "herdr", title: "Herdr Core", status: "ok" as const, detail: secretMarker }]);
  registerHealthCapabilities(registry, { vault, plugins, index, events: log, fileProblems: () => [{ path: secretMarker, kind: "note", code: "BAD", message: secretMarker }], watcherMode: () => "native", extra: probe });
  registerSystemCapabilities(registry, plugins, exposure, { audit, tokens: gateway });
  registerHomeCapabilities(registry, home, vault, [], () => undefined);
  registerVaultCapabilities(registry, vault, index);
  registerPackageCapabilities(registry, vault);
  registerNotificationAndSettings(registry, notices, path.join(vault.stateDir, "settings.json"));
  const ledgerFile = path.join(vault.runtimeDir, "intents.ndjson");
  const dispatcher = () =>
    new Dispatcher({
      registry,
      audit,
      idempotency: new IdempotencyStore(),
      operations: { ledger: new OperationReceipts(ledgerFile), vaultInstance: vault.id },
      isPluginEnabled: (id) => plugins.isEnabled(id),
      toolAccess: () => exposure.snapshot(),
      grantedPermissions: () => [],
      pluginOrigin: () => "builtin",
    });
  const dispatch = dispatcher();
  const assets = path.join(workspace.path, "assets");
  mkdirSync(assets);
  writeFileSync(path.join(assets, "index.html"), "test fixture");
  const share = new WebShareService(vault.id, assets, dispatch, events, () => false);
  registerWebShareCapabilities(registry, share);
  cleanup.push(() => share.stop().then(() => undefined));
  await exposure.initialize(registry.knownNames());

  const desktopToken = tokens.issue("desktop");
  const externalToken = entry === "http" ? tokens.issue("cli") : gateway.create("kernel-test").token;
  gateway.setMcp(true);
  const serve = async (current: Dispatcher) => {
    const running = await startEngineServer({ dispatcher: current, registry, tokens, events, mcpHttp: { enabled: () => true }, vaultInstance: vault.id });
    cleanup.push(() => running.close());
    return `http://127.0.0.1:${running.port}`;
  };
  const base = await serve(dispatch);
  const rpcUrl = base + "/mcp";
  const session = entry === "mcp" ? await openMcpSession(rpcUrl, externalToken) : undefined;
  function httpCall(origin: string, token: string): Call {
    return async (capability, input = {}, intentKey) => {
      const response = await fetch(origin + "/api/v1/call", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), ...(intentKey && { intentKey }) }),
      });
      expect(response.status).toBe(200);
      return CapabilityResultSchema.parse(await response.json());
    };
  }
  async function rpc(method: string, params: object = {}) {
    const response = await mcpRequest(rpcUrl, externalToken, mcpRpc(method, params), session);
    expect(response.status).toBe(200);
    return z.object({ result: z.record(z.string(), z.unknown()) }).parse(await response.json()).result;
  }
  const desktop = httpCall(base, desktopToken);
  const external: Call =
    entry === "http"
      ? httpCall(base, externalToken)
      : async (name, args = {}, intentKey) => {
          const result = await rpc("tools/call", { name: mcpToolName(name), arguments: args, ...(intentKey && { _meta: { "huhu.dev/intent-key": intentKey } }) });
          if (result["isError"]) {
            const [message] = z.array(z.object({ text: z.string() })).parse(result["content"]);
            return CapabilityResultSchema.parse({ ok: false, error: JSON.parse(message!.text) });
          }
          return CapabilityResultSchema.parse({ ok: true, ...z.record(z.string(), z.unknown()).parse(result["structuredContent"]) });
        };
  const discover = async () => {
    if (entry === "mcp") {
      const result = await rpc("tools/list");
      return z
        .array(z.object({ name: z.string(), inputSchema: z.object({ type: z.literal("object") }) }))
        .parse(result["tools"])
        .map(({ name }) => name);
    }
    const response = await fetch(base + "/api/v1/capabilities", { headers: { authorization: `Bearer ${externalToken}` } });
    expect(response.status).toBe(200);
    return z
      .array(z.object({ name: z.string(), input: z.object({ type: z.literal("object") }) }))
      .parse(await response.json())
      .map(({ name }) => name);
  };
  /** 发现元数据是否声明“必须带意图键”。 */
  const intentRequired = async (capability: string) => {
    if (entry === "mcp") {
      const tools = z.array(z.object({ name: z.string(), _meta: z.record(z.string(), z.unknown()).optional() })).parse((await rpc("tools/list"))["tools"]);
      return tools.find(({ name }) => name === mcpToolName(capability))?._meta?.["huhu.dev/intent-key"] === "required";
    }
    const response = await fetch(base + "/api/v1/capabilities", { headers: { authorization: `Bearer ${externalToken}` } });
    const entries = z.array(z.object({ name: z.string(), intentRequired: z.literal(true).optional() })).parse(await response.json());
    return entries.find(({ name }) => name === capability)?.intentRequired === true;
  };
  const select = async (capability: string, exposed: boolean) => data(await desktop("gateway.update", { capability, exposed }));
  const read = async (name: string, input: object = {}, intentKey?: string) => data(await external(name, input, intentKey));
  const via = async (name: string, input: object = {}, intentKey?: string) => {
    await select(name, true);
    return read(name, input, intentKey);
  };
  return {
    workspace: workspace.path,
    root,
    vault,
    plugins,
    index,
    registry,
    notices,
    mark,
    discard,
    clear,
    hidden,
    clock,
    home,
    probe,
    ledgerFile,
    desktop,
    external,
    intentRequired,
    discover,
    select,
    read,
    via,
    restart: async () => httpCall(await serve(dispatcher()), externalToken),
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
type GetInput = (fixture: Fixture) => object | Promise<object>;
const none = () => ({});
const healthModules = () => ({ module: "笔记" });
const savedBoard = async (fixture: Fixture) => {
  const board = readDashboard(fixture.vault).board;
  data(await fixture.desktop("home.dashboard.update", { baseRevision: board.revision, instances: board.instances, layout: board.layout }));
  return {};
};
const recoveryIntent = (fixture: Fixture) => ({ action: "restore", backup: readDashboard(fixture.vault).board });
const indexInput = async (fixture: Fixture) => buildInput.parse(await fixture.via("vault.info", { includeVersions: true }));
const range = () => ({ path: asset, offset: 0, length: 100 });
const relativeFile = () => ({ path: asset });
const policyPreview = () => ({ changes: [{ capability: "vault.info", exposed: true }] });
const id = () => ({ packageId: randomUUID() });

const readCases: [name: string, risk: "normal" | "high", input: GetInput][] = [
  ["health.run", "normal", none],
  ["health.events", "high", healthModules],
  ["health.exportDiagnostics", "high", healthModules],
  ["home.focus.get", "normal", none],
  ["home.habits.get", "normal", none],
  ["home.dashboard.get", "normal", none],
  ["home.dashboard.backup", "normal", savedBoard],
  ["home.dashboard.recovery.preview", "normal", recoveryIntent],
  ["plugins.list", "normal", none],
  ["gateway.get", "normal", none],
  ["gateway.tokens.list", "high", none],
  ["gateway.policy.preview", "normal", policyPreview],
  ["gateway.audit.list", "high", none],
  ["gateway.check", "normal", () => ({ capability: "vault.info" })],
  ["capabilities.list", "normal", () => ({ includeInactive: true })],
  ["notifications.list", "high", none],
  ["settings.get", "normal", none],
  ["vault.info", "normal", none],
  ["vault.location", "high", none],
  ["vault.indexEntries", "normal", none],
  ["vault.list", "normal", () => ({ dir: "" })],
  ["vault.readRange", "high", range],
  ["vault.managedFiles", "high", none],
  ["vault.pendingOperations", "high", none],
  ["vault.search", "normal", () => ({ query: "kernel" })],
  ["vault.readBinary", "high", relativeFile],
  ["vault.readFile", "normal", relativeFile],
  ["web.share.status", "normal", none],
  ["web.invitations.list", "normal", none],
];

const writeCases: [name: string, scope: "write" | "admin", risk: "normal" | "high", input: GetInput][] = [
  ["home.focus.update", "write", "normal", async (fixture) => ({ action: "start", expectedRevision: revisionInput.parse(await fixture.via("home.focus.get")).revision })],
  [
    "home.habits.update",
    "write",
    "high",
    async (fixture) => {
      const state = z.object({ revision: z.string(), dateKey: z.string() }).parse(await fixture.via("home.habits.get"));
      return { action: "add", title: secretMarker, dateKey: state.dateKey, expectedRevision: state.revision };
    },
  ],
  [
    "home.dashboard.update",
    "write",
    "normal",
    (fixture) => {
      const view = readDashboard(fixture.vault);
      return { vaultId: view.vaultId, baseRevision: view.board.revision, instances: view.board.instances, layout: view.board.layout };
    },
  ],
  [
    "home.dashboard.recovery.commit",
    "write",
    "high",
    async (fixture) => {
      const intent = recoveryIntent(fixture);
      const { confirmation } = DashboardRecoveryPreviewSchema.parse(await fixture.via("home.dashboard.recovery.preview", intent));
      return { intent, confirmation };
    },
  ],
  ["plugins.setEnabled", "admin", "high", () => ({ id: "base", expectedVersion: "1.0.0", enabled: false, alsoDisabled: ["dependent"] })],
  ["notifications.markRead", "write", "normal", ({ mark }) => ({ ids: [mark.id] })],
  ["notifications.delete", "write", "high", ({ discard }) => ({ ids: [discard.id] })],
  ["notifications.clearRead", "write", "high", ({ clear }) => ({ ids: [clear.id] })],
  ["settings.update", "admin", "high", async (fixture) => ({ patch: { appearance: { mode: "dark" } }, expectedRevision: revisionInput.parse(await fixture.via("settings.get")).revision })],
  [
    "vault.update",
    "write",
    "normal",
    async (fixture) => ({ vaultId: fixture.vault.id, description: secretMarker, expectedVersion: z.object({ version: z.string() }).parse(await fixture.via("vault.info", { includeVersions: true })).version }),
  ],
  ["vault.reindex", "admin", "high", indexInput],
  ["vault.clearIndex", "admin", "high", indexInput],
  ["vault.reindexCancel", "admin", "high", indexInput],
  ["vault.exportPackage", "admin", "high", id],
  [
    "vault.importPackage",
    "admin",
    "high",
    async (fixture) => {
      const input = id();
      const file = packageOutput.parse(await fixture.via("vault.exportPackage", input, randomUUID()));
      return { ...input, restoreId: randomUUID(), expectedSha256: file.sha256 };
    },
  ],
];

const closed = [
  "gateway.mcp.update",
  "gateway.tokens.create",
  "gateway.tokens.revoke",
  "gateway.update",
  "gateway.policy.update",
  "gateway.audit.clear",
  "web.share.start",
  "web.share.stop",
  "web.invitations.get",
  "web.invitations.create",
  "web.invitations.revoke",
];

function vaultBytes(root: string) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
    .map((file) => [file, readFileSync(file)] as const);
}

describe.each(["http", "mcp"] as const)("Kernel 外部能力 %s", (entry) => {
  const discoveryName = entry === "http" ? (name: string) => name : mcpToolName;

  test.each(readCases)("%s 默认关闭 → 开放后只读 → 撤销", async (name, risk, inputFor) => {
    const fixture = await setup(entry);
    const { registry, external, discover, select, root } = fixture;
    expect(registry.getDescriptor(name)).toMatchObject({ exposable: true, defaultExposed: false, scope: "read", risk });
    const input = await inputFor(fixture);
    expect(await discover()).not.toContain(discoveryName(name));
    expect(await external(name, input)).toMatchObject(notExposed);
    await select(name, true);
    expect(await discover()).toContain(discoveryName(name));
    const bytes = vaultBytes(root);
    const result = await external(name, input);
    const value = data(result);
    expect(registry.get(name)!.output.safeParse(value).success).toBe(true);
    expect(vaultBytes(root)).toEqual(bytes);
    await select(name, false);
    expect(await discover()).not.toContain(discoveryName(name));
    expect(await external(name, input)).toMatchObject(notExposed);
  });

  test.each(writeCases)("%s 默认关闭 → 开放后持久去重 → 撤销", async (name, scope, risk, inputFor) => {
    const fixture = await setup(entry);
    const { registry, external, discover, intentRequired, select, ledgerFile, root } = fixture;
    expect(registry.getDescriptor(name)).toMatchObject({ exposable: true, defaultExposed: false, scope, risk, externalIntentRequired: true, idempotency: "durable" });
    const input = await inputFor(fixture);
    const key = randomUUID();
    expect(await discover()).not.toContain(discoveryName(name));
    expect(await external(name, input, key)).toMatchObject(notExposed);
    await select(name, true);
    expect(await discover()).toContain(discoveryName(name));
    expect(await intentRequired(name)).toBe(true);
    const bytes = vaultBytes(root);
    expect(await external(name, input)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(vaultBytes(root)).toEqual(bytes);
    const [first, same] = await Promise.all([external(name, input, key), external(name, input, key)]);
    data(first);
    expect(first).toMatchObject({ ok: true, opId: expect.any(String) });
    expect(same).toEqual(first);
    expect(readFileSync(ledgerFile, "utf8")).not.toContain(secretMarker);
    const after = vaultBytes(root);
    expect(await external(name, input, key)).toEqual(first);
    expect(vaultBytes(root)).toEqual(after);
    await select(name, false);
    expect(await discover()).not.toContain(discoveryName(name));
    expect(await external(name, input, key)).toMatchObject(notExposed);
  });

  test("批量全开排除 11 项工作台管理能力，已知名称直接调用拒绝", async () => {
    const { desktop, external, discover } = await setup(entry);
    const catalog = z.array(z.object({ name: z.string(), exposable: z.boolean() })).parse(data(await desktop("capabilities.list", { includeInactive: true })));
    const changes = catalog.filter(({ exposable }) => exposable).map(({ name }) => ({ capability: name, exposed: true }));
    const preview = data(await desktop("gateway.policy.preview", { changes }));
    const { revision, catalogRevision } = z.object({ revision: z.number(), catalogRevision: z.string() }).parse(preview);
    data(await desktop("gateway.policy.update", { changes, expectedRevision: revision, catalogRevision }));
    const exposed = await discover();
    for (const name of closed) {
      expect(changes.map((change) => change.capability)).not.toContain(name);
      expect(exposed).not.toContain(discoveryName(name));
      expect(await external(name)).toMatchObject(notExposed);
    }
  });
});

test("冷态健康检查和诊断仅取快照，查询不会从诊断原文推断私有内容", async () => {
  const fixture = await setup("http");
  const before = vaultBytes(fixture.root);
  for (const name of ["health.run", "health.exportDiagnostics", "health.events"]) await fixture.select(name, true);
  const files = vaultBytes(fixture.root);
  const checks = await fixture.read("health.run");
  expect(checks).toMatchObject({ checks: expect.arrayContaining([{ id: "herdr", title: "Herdr Core", status: "ok", detail: "正常" }]) });
  const report = await fixture.read("health.exportDiagnostics", { module: "笔记" });
  expect(report).toMatchObject({ events: [{ module: "笔记", message: "状态已更新" }] });
  expect(JSON.stringify([checks, report])).not.toContain(secretMarker);
  expect(await fixture.read("health.events", { query: secretMarker })).toMatchObject({ events: [] });
  expect(fixture.probe).toHaveBeenCalledTimes(2);
  expect(vaultBytes(fixture.root)).toEqual(files);
  expect(before.filter(([file]) => !file.endsWith("tool-access.json"))).toEqual(files.filter(([file]) => !file.endsWith("tool-access.json")));
});

test("Vault 范围、二进制和普通文件读取均拒绝受保护对象与库内链接", async () => {
  const fixture = await setup("http");
  const code = { ok: false, error: { code: "PERMISSION_DENIED" } };
  for (const name of ["vault.readRange", "vault.readBinary", "vault.readFile"]) {
    await fixture.select(name, true);
    const bounds = name === "vault.readRange" ? { offset: 0, length: 32 } : {};
    expect(await fixture.external(name, { path: "./.huhu//private.json", ...bounds })).toMatchObject(code);
    if (process.platform !== "win32") {
      const alias = name.replaceAll(".", "-");
      symlinkSync(path.join(fixture.root, asset), path.join(fixture.root, alias));
      expect(await fixture.external(name, { path: alias, ...bounds })).toMatchObject(code);
    }
  }
  const initial = z.object({ version: z.string() }).parse(await fixture.read("vault.readRange", range()));
  writeFileSync(path.join(fixture.root, asset), "changed");
  expect(await fixture.external("vault.readBinary", { path: asset, expectedVersion: initial.version })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const managed = await fixture.via("vault.managedFiles");
  expect(managed).toMatchObject({ files: [expect.objectContaining({ path: asset })] });
  expect(JSON.stringify(managed)).not.toContain(".huhu");
});

test("通知只列出可见来源，清理绑定已读 ID，重试与晚到通知互不干扰", async () => {
  const fixture = await setup("mcp");
  const { external, read, select, notices, clear, hidden } = fixture;
  const items = z.array(z.object({ id: z.string(), title: z.string() })).parse(await fixture.via("notifications.list"));
  expect(items.map(({ id }) => id)).not.toContain(hidden.id);
  await select("notifications.markRead", true);
  await select("notifications.delete", true);
  await select("notifications.clearRead", true);
  expect(await external("notifications.markRead", { ids: "all" }, randomUUID())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await external("notifications.delete", { ids: [hidden.id] }, randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const key = randomUUID();
  const request = { ids: [clear.id] };
  const late = notices.create({ title: "专注完成", module: "home" });
  notices.markRead([late.id]);
  expect(await read("notifications.clearRead", request, key)).toEqual({ changed: 1 });
  expect(await read("notifications.clearRead", request, key)).toEqual({ changed: 1 });
  expect(notices.list().map(({ id }) => id)).toEqual(expect.arrayContaining([late.id, hidden.id]));
});

test("持久回执跨 Dispatcher 重启保留结果，拒绝异参和已撤权的重试", async () => {
  const fixture = await setup("http");
  const initial = revisionInput.parse(await fixture.via("settings.get"));
  await fixture.select("settings.update", true);
  const input = { patch: { appearance: { mode: "dark" } }, expectedRevision: initial.revision };
  const key = randomUUID();
  const first = await fixture.external("settings.update", input, key);
  expect(first).toMatchObject({ ok: true, opId: expect.any(String), data: { appearance: { mode: "dark" } } });
  const restarted = await fixture.restart();
  expect(await restarted("settings.update", input, key)).toEqual(first);
  expect(await restarted("settings.update", { ...input, patch: { appearance: { mode: "light" } } }, key)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(await restarted("settings.update", input, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  await fixture.select("settings.update", false);
  expect(await restarted("settings.update", input, key)).toMatchObject(notExposed);
});

test("专注只读不结算，计时器代次冲突被拒且同意图只通知一次", async () => {
  const fixture = await setup("mcp");
  const { home, clock, notices, external, select, via, read } = fixture;
  home.focusAction("start");
  clock.now = new Date(clock.now.getTime() + 1600_000);
  const before = notices.list().length;
  const state = z.object({ revision: z.string(), remainingSec: z.number(), completedToday: z.number() }).parse(await via("home.focus.get"));
  expect(state).toMatchObject({ remainingSec: 0, completedToday: 0 });
  expect(notices.list()).toHaveLength(before);
  await select("home.focus.update", true);
  const key = randomUUID();
  const input = { action: "sync", expectedRevision: state.revision };
  expect(await read("home.focus.update", input, key)).toMatchObject({ completedToday: 1 });
  expect(await read("home.focus.update", input, key)).toMatchObject({ completedToday: 1 });
  expect(notices.list()).toHaveLength(before + 1);
  expect(await external("home.focus.update", input, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
});

test("看板恢复预览保留原件，提交校验 Vault 与摘要，持久回执只保留修订", async () => {
  const fixture = await setup("http");
  const view = readDashboard(fixture.vault);
  const board = DashboardBoardSchema.parse(view.board);
  const broken = { ...board, layout: [...board.layout, board.layout[0]] };
  const file = path.join(fixture.root, ".huhu", "home", "widgets.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(broken));
  const bytes = readFileSync(file);
  const intent = { action: "restore", backup: board };
  const { confirmation } = DashboardRecoveryPreviewSchema.parse(await fixture.via("home.dashboard.recovery.preview", intent));
  expect(readFileSync(file)).toEqual(bytes);
  await fixture.select("home.dashboard.recovery.commit", true);
  expect(await fixture.external("home.dashboard.recovery.commit", { intent, confirmation: { ...confirmation, vaultId: "vault-another" } }, randomUUID())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(readFileSync(file)).toEqual(bytes);
  const key = randomUUID();
  const input = { intent, confirmation };
  const result = await fixture.external("home.dashboard.recovery.commit", input, key);
  expect(result).toMatchObject({ ok: true, data: { vaultId: view.vaultId, preserved: true, revision: expect.any(String) } });
  expect(await fixture.external("home.dashboard.recovery.commit", input, key)).toEqual(result);
  const backups = readdirSync(path.dirname(file)).filter((name) => name.startsWith("widgets.json.corrupt-"));
  expect(backups).toHaveLength(1);
  expect(readFileSync(path.join(path.dirname(file), backups[0]!))).toEqual(bytes);
});

test("插件启停检查版本与完整连带停用集合，索引清理拒绝旧代次", async () => {
  const fixture = await setup("http");
  await fixture.select("plugins.setEnabled", true);
  const input = { id: "base", expectedVersion: "1.0.0", enabled: false };
  expect(await fixture.external("plugins.setEnabled", input, randomUUID())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(fixture.plugins.state("dependent")).toBe("active");
  expect(await fixture.read("plugins.setEnabled", { ...input, alsoDisabled: ["dependent"] }, randomUUID())).toEqual({ state: "disabled", alsoDisabled: ["dependent"] });
  expect(fixture.plugins.state("dependent")).toBe("disabled");
  const original = await indexInput(fixture);
  expect(await fixture.via("vault.reindex", original, randomUUID())).toMatchObject({ completed: true, runId: expect.any(String) });
  await fixture.select("vault.clearIndex", true);
  expect(await fixture.external("vault.clearIndex", original, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await fixture.read("vault.clearIndex", await indexInput(fixture), randomUUID())).toEqual({ cleared: true });
});

test("包导出不接受 Engine 路径，恢复要求摘要，目标隔离且同恢复 ID 无法覆盖", async () => {
  const fixture = await setup("mcp");
  const arbitrary = path.join(fixture.workspace, "arbitrary.zip");
  await fixture.select("vault.exportPackage", true);
  await fixture.select("vault.importPackage", true);
  expect(await fixture.external("vault.exportPackage", { dest: arbitrary }, randomUUID())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(existsSync(arbitrary)).toBe(false);
  const request = id();
  const exported = packageOutput.parse(await fixture.read("vault.exportPackage", request, randomUUID()));
  expect(path.dirname(exported.path)).not.toEqual(fixture.root);
  for (const targetDir of [fixture.root, fixture.workspace]) {
    expect(await fixture.desktop("vault.importPackage", { zipPath: exported.path, targetDir })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  }
  const restore = { ...request, restoreId: randomUUID(), expectedSha256: exported.sha256 };
  expect(await fixture.external("vault.importPackage", { ...restore, expectedSha256: "0".repeat(64) }, randomUUID())).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all(keys.map((key) => fixture.external("vault.importPackage", restore, key)));
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  const result = z.object({ vaultId: z.string(), targetDir: z.string() }).parse(data(results.find((candidate) => candidate.ok)!));
  expect(result.vaultId).not.toBe(fixture.vault.id);
  expect(readFileSync(path.join(result.targetDir, asset), "utf8")).toBe(readFileSync(path.join(fixture.root, asset), "utf8"));
  expect(existsSync(path.join(result.targetDir, ".huhu", "private.json"))).toBe(false);
});
