import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CapabilityRegistry, Dispatcher, PluginManager, createHuhuContext, EventBus, GatewayAudit, IdempotencyStore, TokenTable, NotificationStore, registerNotificationAndSettings, registerSystemCapabilities, registerVaultCapabilities, startEngineServer, type RunningServer,
} from "@huhu/kernel";
import { PluginManifestSchema } from "@huhu/contracts";
import { OperationLog, SemanticRepository, Trash, Vault, VaultIndex, VaultWatcher } from "@huhu/vault";
import * as agentCli from "@huhu/plugin-agent-cli/engine";
import * as archives from "@huhu/plugin-archives/engine";
import * as automations from "@huhu/plugin-automations/engine";
import * as inbox from "@huhu/plugin-inbox/engine";
import * as notes from "@huhu/plugin-notes/engine";
import * as ssh from "@huhu/plugin-ssh/engine";
import * as versioning from "@huhu/plugin-versioning/engine";
import * as safe from "@huhu/plugin-safe/engine";
import * as tasks from "@huhu/plugin-tasks/engine";

export interface EndpointDescriptor {
  pid: number;
  port: number;
  vaultId: string;
  cliToken: string;
  mcpToken: string;
  startedAt: string;
}

export interface BootOptions {
  vaultPath: string;
  create?: boolean;
  readOnly?: boolean;
  port?: number;
  /** 无界面模式：最后一个客户端离开后空闲这么久自行退出（毫秒，0 = 不自动退出）。 */
  idleExitMs?: number;
}

export interface RunningEngine {
  vault: Vault;
  port: number;
  rendererToken: string;
  cliToken: string;
  mcpToken: string;
  descriptorPath: string;
  server: RunningServer;
  index: VaultIndex;
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  events: EventBus;
  /** 按顺序关闭：拒绝新写 → 通知客户端 → 停服务 → 释放锁 → 删除端点描述。 */
  shutdown(): Promise<void>;
}

export function endpointPath(vault: Vault): string {
  return path.join(vault.runtimeDir, "engine.json");
}

/** 读取端点描述；进程已不存在时视为陈旧并删除。 */
export function readLiveEndpoint(vault: Pick<Vault, "runtimeDir">): EndpointDescriptor | null {
  const file = path.join(vault.runtimeDir, "engine.json");
  if (!existsSync(file)) return null;
  try {
    const d = JSON.parse(readFileSync(file, "utf8")) as EndpointDescriptor;
    process.kill(d.pid, 0);
    return d;
  } catch {
    rmSync(file, { force: true });
    return null;
  }
}

export async function boot(opts: BootOptions): Promise<RunningEngine> {
  const vault = await Vault.open(opts.vaultPath, { ...(opts.create !== undefined ? { create: opts.create } : {}), ...(opts.readOnly !== undefined ? { readOnly: opts.readOnly } : {}) });
  const runtime = vault.runtimeDir;
  mkdirSync(runtime, { recursive: true });

  const registry = new CapabilityRegistry();
  const index = new VaultIndex(vault.root);
  registerVaultCapabilities(registry, vault, index);
  void index.build(); // 后台构建；构建期间 vault.tree 已可用，vault.search 返回 indexing=true

  const events = new EventBus(() => vault.id);
  const repo = new SemanticRepository(vault.files, new OperationLog(vault.files, path.join(vault.root, ".huhu", "operations")));
  new OperationLog(vault.files, path.join(vault.root, ".huhu", "operations")).recover();
  const trash = new Trash(vault.files);
  const dispatcherRef: { current?: Dispatcher } = {};
  const { root: cordisRoot, facade } = createHuhuContext({
    registry, events, vault: { repo, files: vault.files, index, trash, vaultId: vault.id },
    call: async (caller, capability, input, idempotencyKey) => {
      const r = await dispatcherRef.current!.call(caller, { capability, input, requestId: `${caller}-${Date.now()}`, ...(idempotencyKey ? { idempotencyKey } : {}) });
      if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r.data;
    },
  });
  const plugins = new PluginManager(cordisRoot, facade, events);
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "tasks", title: "任务", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => tasks.apply(ctx, api, { notify: (n) => void notifications.create(n) }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "notes", title: "知识库", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void notes.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "archives", title: "档案", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void archives.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "inbox", title: "收件箱", description: "", version: "0.0.1", origin: "builtin", permissions: ["tasks.write", "notes.write", "archives.write"] }),
    apply: (ctx, api) => void inbox.apply(ctx, api, { isPluginEnabled: (id) => plugins.isEnabled(id) }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "safe", title: "保险箱", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void safe.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "agent-cli", title: "Agent CLI", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void agentCli.apply(ctx, api, process.env["HUHU_HERDR_BIN"] ? { herdrBin: process.env["HUHU_HERDR_BIN"] } : {}),
  });
  const notifications = new NotificationStore(path.join(vault.root, ".huhu", "notifications.ndjson"), () => new Date(), (n) => events.publish("notification.created", { id: n.id, title: n.title, module: n.module }));
  registerNotificationAndSettings(registry, notifications, path.join(vault.root, ".huhu", "settings.json"));
  registerSystemCapabilities(registry, plugins, { isExposed: (n) => registry.get(n)?.defaultExposed === true });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "automations", title: "自动化", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => {
      const cli = api.service<{ spaces: { list(): { id: string; root: string }[] }; detector: { detect(): Promise<{ provider: string; exe: string | null; status: string }[]> } }>("agentCli");
      let exes: Record<string, string> = {};
      void cli?.detector.detect().then((r) => { exes = Object.fromEntries(r.filter((x) => x.status === "found" && x.exe).map((x) => [x.provider, x.exe as string])); });
      automations.apply(ctx, api, {
        exeFor: (p) => exes[p] ?? null,
        spaceState: (id) => { const s = cli?.spaces.list().find((x) => x.id === id); return s ? (existsSync(s.root) ? { state: "ok", root: s.root } : { state: "inaccessible" }) : { state: "missing" }; },
        notify: (n) => void notifications.create(n),
      });
    },
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "versioning", title: "版本与同步", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void versioning.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse({ id: "ssh", title: "远程连接", description: "", version: "0.0.1", origin: "builtin" }),
    apply: (ctx, api) => void ssh.apply(ctx, api),
  });
  await plugins.enableAll();
  const tokens = new TokenTable();
  const rendererToken = tokens.issue("desktop");
  const cliToken = tokens.issue("cli");
  const mcpToken = tokens.issue("mcp");
  const real = new Dispatcher({
    registry,
    audit: new GatewayAudit(path.join(runtime, "gateway-audit.ndjson")),
    idempotency: new IdempotencyStore(path.join(runtime, "idempotency.ndjson")),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    exposureOverride: () => undefined,
    grantedPermissions: (id) => plugins.permissionsOf(id),
  });

  dispatcherRef.current = real;
  const server = await startEngineServer({ dispatcher: real, registry, tokens, events, visibleTo: (caller, name) => caller === "desktop" || (registry.get(name)?.exposable === true && registry.get(name)?.defaultExposed === true), ...(opts.port !== undefined ? { port: opts.port } : {}) });

  const watcher = new VaultWatcher({
    root: vault.root,
    receipts: vault.files.receipts,
    onChanges: (changes) => {
      index.applyChanges(changes);
      for (const c of changes) events.publish("vault.fileChanged", { path: c.path, change: c.change, ...(c.from ? { from: c.from } : {}) });
    },
    onDegraded: () => undefined,
  });
  await watcher.start();

  // 只读引擎不取写者锁，也不能覆盖或删除写者的端点描述
  const descriptorPath = endpointPath(vault);
  const descriptor: EndpointDescriptor = { pid: process.pid, port: server.port, vaultId: vault.id, cliToken, mcpToken, startedAt: new Date().toISOString() };
  if (!vault.readOnly) writeFileSync(descriptorPath, JSON.stringify(descriptor), { mode: 0o600 });

  let closed: Promise<void> | undefined;
  const shutdown = () =>
    (closed ??= (async () => {
      real.beginClose();
      events.publish("engine.closing", {});
      try {
        await watcher.close();
        await plugins.disposeAll();
      } finally {
        try {
          await server.close();
        } finally {
          try {
            await vault.close();
          } finally {
            if (!vault.readOnly) rmSync(descriptorPath, { force: true });
          }
        }
      }
    })());

  return { vault, port: server.port, rendererToken, cliToken, mcpToken, descriptorPath, server, index, dispatcher: real, registry, events, shutdown };
}
