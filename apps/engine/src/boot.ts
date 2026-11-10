import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  CapabilityRegistry, Dispatcher, PluginManager, defineCapability, createHuhuContext, EventBus, GatewayAudit, IdempotencyStore, TokenTable, NotificationStore, ExposureStore, GatewayTokens, registerHealthCapabilities, registerNotificationAndSettings, registerSystemCapabilities, registerVaultCapabilities, startEngineServer, type RunningServer,
} from "@huhu/kernel";
import tasksManifest from "@huhu/plugin-tasks/manifest" with { type: "json" };
import notesManifest from "@huhu/plugin-notes/manifest" with { type: "json" };
import archivesManifest from "@huhu/plugin-archives/manifest" with { type: "json" };
import inboxManifest from "@huhu/plugin-inbox/manifest" with { type: "json" };
import safeManifest from "@huhu/plugin-safe/manifest" with { type: "json" };
import agentCliManifest from "@huhu/plugin-agent-cli/manifest" with { type: "json" };
import automationsManifest from "@huhu/plugin-automations/manifest" with { type: "json" };
import versioningManifest from "@huhu/plugin-versioning/manifest" with { type: "json" };
import sshManifest from "@huhu/plugin-ssh/manifest" with { type: "json" };
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
  const { root: cordisRoot, facade, getService } = createHuhuContext({
    registry, events, vault: { repo, files: vault.files, index, trash, vaultId: vault.id },
    call: async (caller, capability, input, idempotencyKey) => {
      const r = await dispatcherRef.current!.call(caller, { capability, input, requestId: `${caller}-${Date.now()}`, ...(idempotencyKey ? { idempotencyKey } : {}) });
      if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r.data;
    },
  });
  const safeRef: { current?: { status(): { corrupt: boolean; initialized: boolean; locked: boolean } } } = {};
  const tokens = new TokenTable();
  const plugins = new PluginManager(cordisRoot, facade, events);
  plugins.onRegister = (m) => registry.declare(m.id, m.contributes.capabilities);
  const serverRef: { current?: RunningServer } = {};
  const gatewayTokens = new GatewayTokens(path.join(vault.root, ".huhu", "gateways.json"), tokens, () => new Date(), () => serverRef.current?.closeConnectionsOf("http"));
  const exposure = new ExposureStore(path.join(vault.root, ".huhu", "plugins.json"));
  plugins.register({
    manifest: PluginManifestSchema.parse(tasksManifest),
    apply: (ctx, api) => tasks.apply(ctx, api, { notify: (n) => void notifications.create(n) }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(notesManifest),
    apply: (ctx, api) => void notes.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(archivesManifest),
    apply: (ctx, api) => void archives.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(inboxManifest),
    apply: (ctx, api) => void inbox.apply(ctx, api, { isPluginEnabled: (id) => plugins.isEnabled(id) }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(safeManifest),
    apply: (ctx, api) => { safeRef.current = safe.apply(ctx, api); },
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(agentCliManifest),
    apply: (ctx, api) => void agentCli.apply(ctx, api, process.env["HUHU_HERDR_BIN"] ? { herdrBin: process.env["HUHU_HERDR_BIN"] } : {}),
  });
  const notifications = new NotificationStore(path.join(vault.root, ".huhu", "notifications.ndjson"), () => new Date(), (n) => events.publish("notification.created", { id: n.id, title: n.title, module: n.module }));
  registry.register(defineCapability({
    name: "home.summary", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true, input: z.object({}),
    output: z.object({ vault: z.object({ id: z.string(), name: z.string() }), tasksToday: z.number(), tasksOpen: z.number(), inboxPending: z.number(), notes: z.number(), recentNotes: z.array(z.object({ path: z.string(), title: z.string() })) }),
    handler: async (hc) => {
      const ask = async <T,>(cap: string, input: unknown, fallback: T): Promise<T> => {
        if (!plugins.isEnabled(cap.split(".")[0] === "inbox" ? "inbox" : cap.split(".")[0] as string)) return fallback; // 对应插件停用：该卡片为空，不报错
        const r = await dispatcherRef.current?.call(hc.caller as never, { capability: cap, input, requestId: "home" }); // 以调用者本人的身份取数：外部入口看不到未对其开放的数据
        return r?.ok ? (r.data as T) : fallback;
      };
      const open = await ask<{ id: string }[]>("tasks.list", { completed: false }, []);
      const today = await ask<{ id: string }[]>("tasks.list", { category: "today", completed: false }, []);
      const inbox = await ask<{ id: string }[]>("inbox.list", { status: "pending" }, []);
      const notesList = await ask<{ path: string; title: string }[]>("notes.list", { filter: "all" }, []);
      return { vault: { id: vault.id, name: vault.info.name }, tasksToday: today.length, tasksOpen: open.length, inboxPending: inbox.length, notes: notesList.length, recentNotes: notesList.slice(0, 5).map((n) => ({ path: n.path, title: n.title })) };
    },
  }));
  registerHealthCapabilities(registry, {
    plugins, fileProblems: () => repo.problemList(), index, vault: { readOnly: vault.readOnly, id: vault.id }, watcherMode: () => watcher.mode,
    extra: async () => {
      const safeStatus = plugins.isEnabled("safe") ? safeRef.current?.status() : undefined;
      return safeStatus ? [{ id: "safe", title: "保险箱", status: safeStatus.corrupt ? "error" : "ok", detail: safeStatus.corrupt ? "keyring 文件损坏，保险箱不可用" : safeStatus.initialized ? (safeStatus.locked ? "已锁定" : "已解锁") : "尚未设置" }] : [];
    },
  });
  registerNotificationAndSettings(registry, notifications, path.join(vault.root, ".huhu", "settings.json"));
  registerSystemCapabilities(registry, plugins, { isExposed: (n) => exposure.override(n) ?? registry.get(n)?.defaultExposed === true, set: (n, v) => exposure.set(n, v), setPluginEnabled: (id, v) => exposure.setPluginEnabled(id, v) }, { tokens: gatewayTokens });
  plugins.register({
    manifest: PluginManifestSchema.parse(automationsManifest),
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
    manifest: PluginManifestSchema.parse(versioningManifest),
    apply: (ctx, api) => void versioning.apply(ctx, api),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(sshManifest),
    apply: (ctx, api) => void ssh.apply(ctx, api),
  });
  plugins.shouldEnable = (id) => exposure.pluginEnabled(id);
  await plugins.enableAll();
  const rendererToken = tokens.issue("desktop");
  const cliToken = tokens.issue("cli");
  const mcpToken = tokens.issue("mcp");
  const real = new Dispatcher({
    registry,
    audit: new GatewayAudit(path.join(runtime, "gateway-audit.ndjson")),
    idempotency: new IdempotencyStore(path.join(runtime, "idempotency.ndjson")),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    exposureOverride: (n) => exposure.override(n),
    grantedPermissions: (id) => plugins.permissionsOf(id),
  });

  dispatcherRef.current = real;
  const server = await startEngineServer({ mcpHttp: { enabled: () => gatewayTokens.mcp().enabled && gatewayTokens.mcp().transport === "http" }, terminal: (id, ws, o) => { const bridge = getService<(i: string, w: typeof ws, x: typeof o) => Promise<boolean>>(id.startsWith("ssh-") ? "terminalBridge:ssh" : "terminalBridge:agent"); return bridge ? bridge(id, ws, o) : false; }, dispatcher: real, registry, tokens, events, visibleTo: (caller, name) => caller === "desktop" || (registry.get(name)?.exposable === true && (exposure.override(name) ?? registry.get(name)?.defaultExposed === true)), ...(opts.port !== undefined ? { port: opts.port } : {}) });

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
  serverRef.current = server;
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
