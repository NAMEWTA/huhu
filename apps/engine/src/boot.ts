import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  CapabilityRegistry,
  Dispatcher,
  PluginManager,
  defineCapability,
  createHuhuContext,
  EventBus,
  GatewayAudit,
  IdempotencyStore,
  TokenTable,
  NotificationStore,
  EventLog,
  describeEvent,
  ExposureStore,
  ExternalPlugins,
  GatewayTokens,
  registerHealthCapabilities,
  type HealthCheck,
  registerNotificationAndSettings,
  readSettingsFile,
  HomeStore,
  registerHomeCapabilities,
  registerPackageCapabilities,
  registerExternalPluginCapabilities,
  registerSystemCapabilities,
  registerVaultCapabilities,
  startEngineServer,
  type RunningServer,
} from "@huhu/kernel";
import tasksManifest from "@huhu/plugin-tasks/manifest" with { type: "json" };
import notesManifest from "@huhu/plugin-notes/manifest" with { type: "json" };
import agentGuideManifest from "@huhu/plugin-agent-guide/manifest" with { type: "json" };
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
import * as agentGuide from "@huhu/plugin-agent-guide/engine";
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
  registerPackageCapabilities(registry, vault);
  void index.build(); // 后台构建；构建期间 vault.tree 已可用，vault.search 返回 indexing=true

  const events = new EventBus(() => vault.id);
  const repo = new SemanticRepository(vault.files, new OperationLog(vault.files, path.join(vault.root, ".huhu", "operations")));
  repo.onWritten = (paths) => index.refreshPaths(paths);
  new OperationLog(vault.files, path.join(vault.root, ".huhu", "operations")).recover();
  const trash = new Trash(vault.files);
  const dispatcherRef: { current?: Dispatcher } = {};
  const {
    root: cordisRoot,
    facade,
    getService,
  } = createHuhuContext({
    registry,
    events,
    vault: { repo, files: vault.files, index, trash, vaultId: vault.id },
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
  const gatewayTokens = new GatewayTokens(
    path.join(vault.root, ".huhu", "gateways.json"),
    tokens,
    () => new Date(),
    () => serverRef.current?.closeConnectionsOf("http"),
  );
  const gatewayAudit = new GatewayAudit(path.join(runtime, "gateway-audit.ndjson"));
  const exposure = new ExposureStore(path.join(vault.root, ".huhu", "plugins.json"));
  // 设置里的时区实时生效：每次取“今天”时读取 settings.json（文件很小）
  const settingsFile = path.join(vault.root, ".huhu", "settings.json");
  const settingsZone = () => readSettingsFile(settingsFile).dateTime.zone;
  plugins.register({
    manifest: PluginManifestSchema.parse(tasksManifest),
    apply: (ctx, api) => tasks.apply(ctx, api, { notify: (n) => void notifications.create(n), zone: settingsZone }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(notesManifest),
    apply: (ctx, api) => void notes.apply(ctx, api, { zone: settingsZone }),
  });
  const guideRef: { current: agentGuide.GuideService | null } = { current: null };
  plugins.register({
    manifest: PluginManifestSchema.parse(agentGuideManifest),
    apply: (ctx, api) => {
      guideRef.current = agentGuide.apply(ctx, api, { version: agentGuideManifest.version, capabilities: () => registry.list().map((c) => ({ name: c.name, plugin: c.plugin, scope: c.scope, exposable: c.exposable })) });
    },
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
    apply: (ctx, api) => {
      safeRef.current = safe.apply(ctx, api);
    },
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(agentCliManifest),
    apply: (ctx, api) => void agentCli.apply(ctx, api, process.env["HUHU_HERDR_BIN"] ? { herdrBin: process.env["HUHU_HERDR_BIN"] } : {}),
  });
  const notifications = new NotificationStore(
    path.join(vault.root, ".huhu", "notifications.ndjson"),
    () => new Date(),
    (n) => events.publish("notification.created", { id: n.id, title: n.title, module: n.module }),
  );
  registry.register(
    defineCapability({
      name: "home.summary",
      plugin: "kernel",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.object({
        vault: z.object({ id: z.string(), name: z.string() }),
        tasksToday: z.number(),
        tasksOpen: z.number(),
        inboxPending: z.number(),
        notes: z.number(),
        rulesEnabled: z.number(),
        recentNotes: z.array(z.object({ path: z.string(), title: z.string(), folder: z.string(), updatedAt: z.string(), snippet: z.string() })),
        enabled: z.object({ tasks: z.boolean(), inbox: z.boolean(), notes: z.boolean(), automations: z.boolean(), agentCli: z.boolean() }),
      }),
      handler: async (hc) => {
        const ask = async <T>(cap: string, input: unknown, fallback: T): Promise<T> => {
          if (!plugins.isEnabled(cap.split(".")[0] === "inbox" ? "inbox" : (cap.split(".")[0] as string))) return fallback; // 对应插件停用：该卡片为空，不报错
          const r = await dispatcherRef.current?.call(hc.caller as never, { capability: cap, input, requestId: "home" }); // 以调用者本人的身份取数：外部入口看不到未对其开放的数据
          return r?.ok ? (r.data as T) : fallback;
        };
        const open = await ask<{ id: string }[]>("tasks.list", { completed: false }, []);
        const today = await ask<{ id: string }[]>("tasks.list", { category: "today", completed: false }, []);
        const inbox = await ask<{ id: string }[]>("inbox.list", { status: "pending" }, []);
        const notesList = await ask<{ path: string; title: string }[]>("notes.list", { filter: "all" }, []);
        const rules = await ask<{ data: { enabled: boolean } }[]>("automations.list", {}, []);
        const mtimes = new Map(index.entries("").map((e) => [e.path, e.mtimeMs]));
        const recent = [...notesList].sort((a, b) => (mtimes.get(b.path) ?? 0) - (mtimes.get(a.path) ?? 0)).slice(0, 4);
        const snippetOf = (rel: string): string => {
          try {
            const text = vault.files.read(rel)?.bytes.toString("utf8") ?? "";
            return text
              .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
              .replace(/[#*`>[\]]/g, "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 62);
          } catch {
            return "";
          }
        };
        return {
          vault: { id: vault.id, name: vault.info.name },
          tasksToday: today.length,
          tasksOpen: open.length,
          inboxPending: inbox.length,
          notes: notesList.length,
          rulesEnabled: rules.filter((r) => r.data.enabled).length,
          recentNotes: recent.map((n) => ({
            path: n.path,
            title: n.title,
            folder: n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "根目录",
            updatedAt: new Date(mtimes.get(n.path) ?? 0).toISOString(),
            snippet: snippetOf(n.path),
          })),
          enabled: { tasks: plugins.isEnabled("tasks"), inbox: plugins.isEnabled("inbox"), notes: plugins.isEnabled("notes"), automations: plugins.isEnabled("automations"), agentCli: plugins.isEnabled("agent-cli") },
        };
      },
    }),
  );
  const eventLog = new EventLog(path.join(vault.root, ".huhu", "diagnostics", "events.ndjson"));
  registerHealthCapabilities(registry, {
    plugins,
    events: eventLog,
    fileProblems: () => repo.problemList(),
    index,
    vault: { readOnly: vault.readOnly, id: vault.id },
    watcherMode: () => watcher.mode,
    extra: async () => {
      const out: HealthCheck[] = [];
      // Herdr Core：Agent 终端的运行时依赖；不可用时给出“重启 Core”
      const cli = plugins.isEnabled("agent-cli") ? getService<{ core: { ensure(): Promise<unknown>; status(): Promise<{ state: string; version: string | null; error?: string }> } }>("agentCli") : undefined;
      if (cli) {
        await cli.core.ensure().catch(() => undefined); // 诊断时按需拉起 Core（用户打开终端时也是这样）；拉不起来才报“需处理”
        const st = await cli.core.status().catch((e: unknown) => ({ state: "unavailable", version: null, error: e instanceof Error ? e.message : String(e) }));
        out.push(
          st.state === "connected"
            ? { id: "herdr", title: "Herdr Core", status: "ok", detail: `已连接${st.version ? ` · ${st.version}` : ""}` }
            : { id: "herdr", title: "Herdr Core", status: "error", detail: st.error ?? "未启动或连接失败", action: { label: "重启 Core", target: "agent-cli", capability: "agent.core.restart" } },
        );
      }
      const safeStatus = plugins.isEnabled("safe") ? safeRef.current?.status() : undefined;
      if (safeStatus)
        out.push({ id: "safe", title: "保险箱", status: safeStatus.corrupt ? "error" : "ok", detail: safeStatus.corrupt ? "keyring 文件损坏，保险箱不可用" : safeStatus.initialized ? (safeStatus.locked ? "已锁定" : "已解锁") : "尚未设置" });
      return out;
    },
  });
  registerNotificationAndSettings(registry, notifications, settingsFile);
  registerHomeCapabilities(registry, new HomeStore({ dir: path.join(vault.root, ".huhu", "home"), now: () => new Date(), zone: settingsZone, notify: (n) => void notifications.create(n) }));
  registerSystemCapabilities(
    registry,
    plugins,
    { isExposed: (n) => exposure.override(n) ?? registry.get(n)?.defaultExposed === true, set: (n, v) => exposure.set(n, v), setPluginEnabled: (id, v) => (external.has(id) ? external.setEnabled(id, v) : exposure.setPluginEnabled(id, v)) },
    { tokens: gatewayTokens, audit: gatewayAudit },
  );
  plugins.register({
    manifest: PluginManifestSchema.parse(automationsManifest),
    apply: (ctx, api) => {
      const cli = api.service<{ spaces: { list(): { id: string; root: string }[] }; detector: { detect(): Promise<{ provider: string; exe: string | null; status: string }[]> } }>("agentCli");
      let exes: Record<string, string> = {};
      void cli?.detector.detect().then((r) => {
        exes = Object.fromEntries(r.filter((x) => x.status === "found" && x.exe).map((x) => [x.provider, x.exe as string]));
      });
      automations.apply(ctx, api, {
        zone: settingsZone,
        exeFor: (p) => exes[p] ?? null,
        spaceState: (id) => {
          const s = cli?.spaces.list().find((x) => x.id === id);
          return s ? (existsSync(s.root) ? { state: "ok", root: s.root } : { state: "inaccessible" }) : { state: "missing" };
        },
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
  const external = new ExternalPlugins({
    root: vault.root,
    plugins,
    tokens,
    baseUrl: () => `http://127.0.0.1:${serverRef.current?.port ?? 0}`,
    ...(process.env["HUHU_EXAMPLES_DIR"] ? { examplesDir: process.env["HUHU_EXAMPLES_DIR"] } : {}),
    assertWritable: () => vault.files.assertWritable(),
  });
  registerExternalPluginCapabilities(registry, external);
  plugins.shouldEnable = (id) => (external.has(id) ? external.shouldEnable(id) : exposure.pluginEnabled(id));
  await plugins.enableAll();
  await guideRef.current?.maintain().catch(() => undefined); // 所有插件启用之后再补写 / 升级指南：能力表取决于完整的注册表
  let lastSync = "";
  let closing = false;
  events.subscribe((e) => {
    if (e.type === "engine.closing") closing = true;
    if (closing && e.type === "plugin.stateChanged") return; // 关闭时的批量停用不是用户操作，不进事件日志
    if (e.type === "sync.statusChanged") {
      const st = String((e.payload as { status?: string }).status ?? "");
      if (st === lastSync) return; // 同步状态频繁重复上报：只记录变化
      lastSync = st;
    }
    const titleOf = (kind: string, id: string): string | null => {
      try {
        const d = repo.read(kind as never, id).data as Record<string, unknown>;
        const t = d["title"] ?? d["name"];
        return typeof t === "string" ? t : null;
      } catch {
        return null; // 已删除或不是语义文件
      }
    };
    const r = describeEvent(e, titleOf);
    if (r) {
      try {
        eventLog.append(r);
      } catch {
        // 日志写不进去不能影响业务
      }
    }
  });

  const rendererToken = tokens.issue("desktop");
  const cliToken = tokens.issue("cli");
  const mcpToken = tokens.issue("mcp");
  const real = new Dispatcher({
    registry,
    audit: gatewayAudit,
    idempotency: new IdempotencyStore(path.join(runtime, "idempotency.ndjson")),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    exposureOverride: (n) => exposure.override(n),
    grantedPermissions: (id) => plugins.permissionsOf(id),
  });

  dispatcherRef.current = real;
  const server = await startEngineServer({
    mcpHttp: { enabled: () => gatewayTokens.mcp().enabled && gatewayTokens.mcp().transport === "http" },
    terminal: (id, ws, o) => {
      const bridge = getService<(i: string, w: typeof ws, x: typeof o) => Promise<boolean>>(id.startsWith("ssh-") ? "terminalBridge:ssh" : "terminalBridge:agent");
      return bridge ? bridge(id, ws, o) : false;
    },
    dispatcher: real,
    registry,
    tokens,
    events,
    visibleTo: (caller, name) => caller === "desktop" || (registry.get(name)?.exposable === true && (exposure.override(name) ?? registry.get(name)?.defaultExposed === true)),
    ...(opts.port !== undefined ? { port: opts.port } : {}),
  });

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
  // 索引快照与监听器基线之间的写入不会有事件：对账一次，并按文件事件通知界面
  try {
    for (const c of index.reconcile()) events.publish("vault.fileChanged", { path: c.path, change: c.change });
  } catch {
    // 对账只是补漏；失败不应阻止引擎启动，后续由监听器继续增量更新。
  }

  // 只读引擎不取写者锁，也不能覆盖或删除写者的端点描述
  serverRef.current = server;
  // 外部扩展要经 HTTP 回调 Engine，所以在服务启动之后才登记并启动
  external.load(plugins.list().map((p) => p.id));
  // 只读 Vault 不启动扩展（它们可能写数据目录）；多个扩展并行启动，互不拖慢
  if (!vault.files.readOnly)
    await Promise.all(
      plugins
        .list()
        .filter((p) => p.manifest.origin === "external" && external.shouldEnable(p.id))
        .map((p) => plugins.enable(p.id)),
    );
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
