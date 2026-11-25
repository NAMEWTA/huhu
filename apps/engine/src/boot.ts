import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import MailComposer from "nodemailer/lib/mail-composer";
import SMTPConnection from "nodemailer/lib/smtp-connection";
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
  OperationReceipts,
  TokenTable,
  NotificationStore,
  EventLog,
  describeEvent,
  ExposureStore,
  ExternalPlugins,
  GatewayTokens,
  MCP_SOURCES_SERVICE,
  createMcpSourcePlugin,
  mcpSourceDescriptors,
  mcpToolName,
  builtinMcpDirectory,
  type ExternalMcpTools,
  registerHealthCapabilities,
  type HealthCheck,
  type LocalCredentialProtection,
  registerNotificationAndSettings,
  readSettingsFile,
  HomeStore,
  registerHomeCapabilities,
  registerPackageCapabilities,
  registerExternalPluginCapabilities,
  registerKernelCapability,
  registerSystemCapabilities,
  registerVaultCapabilities,
  startEngineServer,
  type RunningServer,
  WebShareService,
  registerWebShareCapabilities,
} from "@huhu/kernel";
import tasksManifest from "@huhu/plugin-tasks/manifest" with { type: "json" };
import notesManifest from "@huhu/plugin-notes/manifest" with { type: "json" };
import agentGuideManifest from "@huhu/plugin-agent-guide/manifest" with { type: "json" };
import inboxManifest from "@huhu/plugin-inbox/manifest" with { type: "json" };
import ledgerManifest from "@huhu/plugin-ledger/manifest" with { type: "json" };
import * as ledger from "@huhu/plugin-ledger/engine";
import mailManifest from "@huhu/plugin-mail/manifest" with { type: "json" };
import safeManifest from "@huhu/plugin-safe/manifest" with { type: "json" };
import agentCliManifest from "@huhu/plugin-agent-cli/manifest" with { type: "json" };
import automationsManifest from "@huhu/plugin-automations/manifest" with { type: "json" };
import versioningManifest from "@huhu/plugin-versioning/manifest" with { type: "json" };
import sshManifest from "@huhu/plugin-ssh/manifest" with { type: "json" };
import { errors, HuhuError, PluginManifestSchema } from "@huhu/contracts";
import { attachTerminal, HerdrCore } from "@huhu/herdr-client";
import type { PrivateMailAttachmentRequest, SelectDraftAttachmentResult } from "@huhu/plugin-mail/desktop-attachments";
import { directoryInstance, endpointRootBinding, loadDeviceDispatchBudget, machineId, OperationLog, readEngineEndpoint, SemanticRepository, Trash, Vault, VaultIndex, VaultWatcher, type DeviceDispatchBudget, type EngineEndpointRecord, type EngineMode } from "@huhu/vault";
import * as agentCli from "@huhu/plugin-agent-cli/engine";
import * as agentGuide from "@huhu/plugin-agent-guide/engine";
import * as automations from "@huhu/plugin-automations/engine";
import * as inbox from "@huhu/plugin-inbox/engine";
import * as mail from "@huhu/plugin-mail/engine";
import * as notes from "@huhu/plugin-notes/engine";
import * as ssh from "@huhu/plugin-ssh/engine";
import { tasksHomeWidget } from "@huhu/plugin-tasks/home-widget";
import { recentNotesHomeWidget } from "@huhu/plugin-notes/shared";
import { inboxHomeWidget } from "@huhu/plugin-inbox/shared";
import { agentEntryHomeWidget } from "@huhu/plugin-agent-cli/shared";
import { sshHostsWidget } from "@huhu/plugin-ssh/shared";
import { automationSummaryWidget } from "@huhu/plugin-automations/shared";
import { gitHomeWidget } from "@huhu/plugin-versioning/shared";
import * as versioning from "@huhu/plugin-versioning/engine";
import * as safe from "@huhu/plugin-safe/engine";
import * as tasks from "@huhu/plugin-tasks/engine";
import { createModuleCredentialHost, type ModuleCredentialHost } from "./module-credential-host.js";
import { addDesktopMailAttachment } from "./mail-desktop-attachment.js";
import { LocalMcpListener } from "./mcp-listener.js";
import { startLocalControl } from "./local-control.js";

export type EndpointDescriptor = EngineEndpointRecord;

export interface BootOptions {
  vaultPath: string;
  create?: boolean;
  readOnly?: boolean;
  port?: number;
  /** 由桌面宿主传入的已构建工作台资源目录。 */
  webAssetsDir?: string;
  /** 桌面宿主提供的当前用户应用数据目录。 */
  desktopUserData?: string;
  /** 仅供进程内测试替换系统钥匙串。 */
  moduleCredentialProtection?: LocalCredentialProtection;
  /** 当前桌面宿主的邮箱授权配置与可信浏览器入口。 */
  mailOAuth?: mail.MailOAuthRuntime;
  lifecycle?: { mode: EngineMode; requestStop(): void };
}

export interface RunningEngine {
  vault: Vault;
  port: number;
  rendererToken: string;
  cliToken: string;
  descriptorPath: string;
  server: RunningServer;
  index: VaultIndex;
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  events: EventBus;
  lastLongOperationActivity(): number;
  /** 仅供 Engine 进程内受信模块和验证入口使用。 */
  moduleCredentialHost?: ModuleCredentialHost;
  addMailDraftAttachment(request: PrivateMailAttachmentRequest, signal: AbortSignal): Promise<SelectDraftAttachmentResult>;
  /** 按顺序关闭：拒绝新写 → 通知客户端 → 停服务 → 释放锁 → 删除端点描述。 */
  shutdown(): Promise<void>;
}

export function endpointPath(vault: Pick<Vault, "runtimeDir">): string {
  return path.join(vault.runtimeDir, "engine.json");
}

/** 读取端点描述；陈旧记录留给持有写者锁的进程替换。 */
export function readLiveEndpoint(vault: Pick<Vault, "runtimeDir" | "root">): EndpointDescriptor | null {
  const local = readEngineEndpoint(vault.root, endpointPath(vault));
  return local.state === "running" ? local.endpoint : null;
}

export async function boot(opts: BootOptions): Promise<RunningEngine> {
  const registry = new CapabilityRegistry();
  registry.declareDescriptors("notes", notes.notesCapabilityDescriptors);
  registry.declareDescriptors("inbox", Object.values(inbox.inboxCapabilityDescriptors));
  registry.declareDescriptors("ledger", ledger.ledgerCapabilityDescriptors);
  registry.declareDescriptors("agent-guide", Object.values(agentGuide.guideCapabilityDescriptors));
  registry.declareDescriptors("tasks", Object.values(tasks.taskToolDescriptors));
  registry.declareDescriptors("mail", mail.mailCapabilityDescriptors);
  registry.declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors));
  registry.declareDescriptors("safe", safe.safeCapabilityDescriptors);
  registry.declareDescriptors("versioning", versioning.versioningCapabilityDescriptors);
  registry.declareDescriptors("agent-cli", agentCli.agentToolDescriptors);
  registry.declareDescriptors("automations", Object.values(automations.automationToolDescriptors));
  registry.declareDescriptors("automations", Object.values(automations.terminalEnvironmentDescriptors));
  registry.declareDescriptors("automations", Object.values(automations.taskScanToolDescriptors));
  registry.declareDescriptors("mcp", mcpSourceDescriptors);

  const vault = await Vault.open(opts.vaultPath, { ...(opts.create !== undefined ? { create: opts.create } : {}), ...(opts.readOnly !== undefined ? { readOnly: opts.readOnly } : {}) });
  const moduleCredentialHost = opts.desktopUserData ? createModuleCredentialHost(vault, opts.desktopUserData, opts.moduleCredentialProtection) : undefined;
  const runtime = vault.runtimeDir;
  let activeOperations = 0;
  let lastOperationEnd = 0;
  const retainLongOperation = () => {
    activeOperations++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeOperations--;
      lastOperationEnd = Date.now();
    };
  };
  mkdirSync(runtime, { recursive: true });
  const rootIdentity = directoryInstance(vault.root);
  const mcpVaultInstance = rootIdentity ? JSON.stringify([vault.id, ...rootIdentity]) : vault.id;
  const tokens = new TokenTable();
  const gatewayTokens = new GatewayTokens(path.join(vault.stateDir, "gateways.json"), tokens);
  let mcpListener: LocalMcpListener;
  let dispatchBudget: DeviceDispatchBudget | undefined;
  try {
    mcpListener = new LocalMcpListener(vault, gatewayTokens);
    if (!vault.readOnly && process.getuid) dispatchBudget = loadDeviceDispatchBudget(vault.root);
  } catch (error) {
    await vault.close();
    throw error;
  }

  const index = new VaultIndex(vault.root);
  registerVaultCapabilities(registry, vault, index);
  const events = new EventBus(() => vault.id);
  const operations = new OperationLog(vault.files, path.join(vault.stateDir, "operations"));
  const repo = new SemanticRepository(vault.files, operations);
  repo.onWritten = (paths) => index.refreshPaths(paths);
  const trash = new Trash(vault.files, undefined, operations);
  // 只读打开时不能回滚：未完成的多文件操作可能正由另一个（写者）实例执行，回滚会改写用户文件
  if (!vault.readOnly) {
    trash.cleanupRetired();
    operations.recover();
  }
  void index.build();
  const dispatcherRef: { current?: Dispatcher } = {};
  const {
    root: cordisRoot,
    facade,
    getService,
  } = createHuhuContext({
    registry,
    events,
    vault: { repo, files: vault.files, index, trash, vaultId: vault.id, stateDir: vault.stateDir },
    call: async (caller, capability, input, idempotencyKey, signal) => {
      const r = await dispatcherRef.current!.call(caller, { capability, input, requestId: `${caller}-${Date.now()}`, ...(idempotencyKey ? { idempotencyKey } : {}) }, signal);
      if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r.data;
    },
  });
  registerPackageCapabilities(registry, vault, {
    withSnapshot: async (read, signal, desktop, includeAttachments) => {
      const activeAgent = desktop && plugins.isEnabled("agent-cli") ? getService<{ core: HerdrCore }>("agentCli") : undefined;
      const workspace = desktop ? await agentCli.workspacePackageSnapshot(vault, signal, activeAgent?.core) : undefined;
      return ledger.withLedgerSnapshot(vault.files, () => safe.withSafePackageSnapshot(vault.files, (safeFiles) =>
        mail.withMailSnapshot(vault.files, () => {
          signal.throwIfAborted();
          const mailSelection = mail.mailPackageSelection(vault.files);
          const ledgerSelection = desktop ? ledger.ledgerPackageSelection(vault.files, includeAttachments) : undefined;
          const computedFiles = new Map(ledgerSelection?.computedFiles);
          if (workspace) computedFiles.set(agentCli.workspacePackagePath, workspace.bytes);
          const definitions = [mail.mailAccountPackageFile(vault.files), ...ssh.sshPortablePackageFiles(vault.files)];
          return read(signal, {
            computedFiles,
            externalFiles: new Set(definitions.map(({ path }) => path)),
            includeFile(relative) {
              const normalized = relative.toLowerCase();
              if (normalized === agentCli.workspacePackagePath) return relative === normalized && workspace !== undefined;
              if (normalized.startsWith(".huhu/safe/")) return safeFiles.has(relative);
              if (ledgerSelection?.includeFile(relative) === false) return false;
              return mailSelection.includeFile(relative);
            },
            verifyFiles(files) {
              const written = new Map(files.map(({ path, sha256 }) => [path, sha256]));
              for (const [path, expected] of workspace?.spaceFiles ?? []) {
                if (written.get(path) !== expected) throw new HuhuError("VERSION_CONFLICT", "备份期间工作区已变化，请重新导出", { retryable: true });
              }
              for (const { path, sha256 } of definitions) {
                if ((written.get(path) ?? null) !== sha256) throw new HuhuError("VERSION_CONFLICT", "备份期间 Mail 或 SSH 定义已变化，请重新导出");
              }
              for (const [path, expected] of safeFiles) {
                if (written.get(path) !== expected) throw new HuhuError("VERSION_CONFLICT", "备份所需的保险箱文件已变化或未完整收录，请重新核对后导出");
              }
              mailSelection.verifyFiles(written);
              ledgerSelection?.verifyFiles(written);
            },
          });
        }),
      ));
    },
    validateStaging(files, restored) {
      safe.validateSafePackage(files);
      mail.validateMailPackage(files, restored);
      ledger.validateLedgerPackage(files, restored);
      agentCli.validateWorkspacePackage(files, restored);
    },
  });
  const safeRef: { current?: { status(): { corrupt: boolean; initialized: boolean; locked: boolean } } } = {};
  const plugins = new PluginManager(cordisRoot, facade, events);
  plugins.onRegister = (m, pendingInstall) => {
    if (m.origin === "external") external.declare(m, pendingInstall);
    else registry.declare(m.id, m.contributes.capabilities, pendingInstall);
  };
  plugins.onInstallConfirmed = (id) => registry.confirmPluginInstall(id);
  plugins.onUnregister = (id) => registry.forgetPlugin(id);
  const serverRef: { current?: RunningServer } = {};
  const gatewayAudit = new GatewayAudit(path.join(runtime, "gateway-audit.ndjson"));
  const exposure = new ExposureStore(vault.files, path.join(vault.stateDir, "plugins.json"));
  plugins.register(createMcpSourcePlugin({
    vaultInstance: mcpVaultInstance,
    hostId: machineId(),
    ...(moduleCredentialHost && { credentialHost: { ...moduleCredentialHost, vault } }),
    ...(!vault.readOnly && rootIdentity && { approvalPath: path.relative(vault.root, path.join(runtime, "mcp-source-approvals.json")) }),
    publishSignal: () => mcpListener.enabled() && plugins.isEnabled("mcp") ? gatewayTokens.mcpSignal() : undefined,
    endpoint: () => mcpListener.status().url,
    isBuiltinName: (name) => registry.knownNames().some((capability) => mcpToolName(capability) === name),
    builtinDirectory: () => {
      const dispatcher = dispatcherRef.current;
      return builtinMcpDirectory(dispatcher?.discover("http").map((def) => ({ name: def.name, durableIntent: dispatcher.supportsDurableIntent(def) })) ?? [], true);
    },
    audit: (row) => gatewayAudit.add(row),
  }));
  // 设置里的时区实时生效：每次取“今天”时读取 settings.json（文件很小）
  const settingsFile = path.join(vault.stateDir, "settings.json");
  const settingsZone = () => readSettingsFile(settingsFile).dateTime.zone;
  plugins.register({
    manifest: PluginManifestSchema.parse(tasksManifest),
    apply: (ctx, api) => tasks.apply(ctx, api, { zone: settingsZone, ...(dispatchBudget && { dispatchBudget }) }),
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
    manifest: PluginManifestSchema.parse(inboxManifest),
    apply: (ctx, api) => void inbox.apply(ctx, api, { isPluginEnabled: (id) => plugins.isEnabled(id) }),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(ledgerManifest),
    apply: ledger.apply,
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(mailManifest),
    apply: (ctx, api) =>
      mail.apply(
        ctx,
        api,
        moduleCredentialHost ? { ...moduleCredentialHost, vault } : undefined,
        mail.createMailSmtpTransport({ SMTPConnection, MailComposer }),
        { notify: ({ id, ...notice }) => void notifications.create(notice, id) },
        opts.mailOAuth,
        { aiCatalogDeclared: true },
      ),
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(safeManifest),
    apply: (ctx, api) => {
      safeRef.current = safe.apply(ctx, api, { catalogDeclared: true });
    },
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(agentCliManifest),
    apply: (ctx, api) =>
      void agentCli.apply(ctx, api, {
        ...(dispatchBudget && { dispatchBudget }),
        ...(process.env["HUHU_HERDR_BIN"] ? { herdrBin: process.env["HUHU_HERDR_BIN"] } : {}),
        ...(moduleCredentialHost && {
          credentialHost: { ...moduleCredentialHost, vault },
          codexDispatch: {
            root: path.join(path.dirname(moduleCredentialHost.localRoot), "agent-cli", "codex-dispatch", moduleCredentialHost.localVaultInstanceId),
            helper: process.env["HUHU_CODEX_DISPATCH_HELPER"],
            nodeBin: process.env["HUHU_NODE_BIN"],
            binary: process.env["HUHU_CODEX_DISPATCH_BIN"],
            home: process.env["HUHU_CODEX_DISPATCH_HOME"],
          },
        }),
      }),
  });
  const notifications = new NotificationStore(
    path.join(vault.stateDir, "notifications.ndjson"),
    () => new Date(),
    (n) => events.publish("notification.created", { id: n.id, title: n.title, module: n.module }),
  );
  const RecentNote = z.object({ path: z.string(), title: z.string(), folder: z.string(), updatedAt: z.string(), snippet: z.string() });
  const recentNotes = async (notes: { path: string; title: string }[], readText: (relative: string) => Promise<string>) => {
    const updated = (relative: string) => index.entry(relative)?.mtimeMs ?? 0;
    const recent = [...notes].sort((left, right) => updated(right.path) - updated(left.path)).slice(0, 4);
    return Promise.all(
      recent.map(async ({ path: relative, title }) => ({
        path: relative,
        title,
        folder: relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/")) : "根目录",
        updatedAt: new Date(updated(relative)).toISOString(),
        snippet: (await readText(relative))
          .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
          .replace(/[#*`>[\]]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 62),
      })),
    );
  };
  // 委托 notes.list / notes.read：传原 caller、subject、signal，两次委托各自复核现行授权；列表被拒即停止，单篇被拒则省略其正文片段
  registerKernelCapability(registry, {
    name: "home.notes.recent",
    plugin: "kernel",
    scope: "read",
    risk: "high",
    exposable: true,
    defaultExposed: false,
    input: z.object({}),
    output: z.array(RecentNote),
    handler: async (hc) => {
      const dispatcher = dispatcherRef.current;
      if (!dispatcher) throw new HuhuError("INTERNAL", "笔记读取暂不可用");
      const call = (capability: string, input: object) => dispatcher.call(hc.caller as never, { capability, input, requestId: hc.requestId }, hc.signal, hc.subject ?? hc.caller);
      const notes = await call("notes.list", { filter: "all" });
      if (!notes.ok) throw new HuhuError(notes.error.code, notes.error.message);
      return recentNotes(notes.data as { path: string; title: string }[], async (relative) => {
        const result = await call("notes.read", { path: relative });
        return result.ok ? (result.data as { text: string }).text : "";
      });
    },
  });
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
        recentNotes: z.array(RecentNote),
        enabled: z.object({ tasks: z.boolean(), inbox: z.boolean(), notes: z.boolean(), automations: z.boolean(), agentCli: z.boolean() }),
      }),
      handler: async (hc) => {
        const ask = async <T>(cap: string, input: unknown, fallback: T): Promise<T> => {
          if (!plugins.isEnabled(cap.split(".")[0] === "inbox" ? "inbox" : (cap.split(".")[0] as string))) return fallback; // 对应插件停用：该卡片为空，不报错
          const r = await dispatcherRef.current?.call(hc.caller as never, { capability: cap, input, requestId: "home" }); // 以调用者本人的身份取数：外部入口看不到未对其开放的数据
          return r?.ok ? (r.data as T) : fallback;
        };
        const open = await ask<{ id: string }[]>("tasks.list", { status: ["not_started", "in_progress"] }, []);
        const today = await ask<{ id: string }[]>("tasks.list", { category: "today", status: ["not_started", "in_progress"] }, []);
        const inbox = await ask<{ id: string }[]>("inbox.list", { status: "pending" }, []);
        const notesList = await ask<{ path: string; title: string }[]>("notes.list", { filter: "all" }, []);
        const rules = await ask<{ data: { enabled: boolean } }[]>("automations.list", {}, []);
        return {
          vault: { id: vault.id, name: vault.info.name },
          tasksToday: today.length,
          tasksOpen: open.length,
          inboxPending: inbox.length,
          notes: notesList.length,
          rulesEnabled: rules.filter((r) => r.data.enabled).length,
          recentNotes: await recentNotes(notesList, async (relative) => (await ask("notes.read", { path: relative }, { text: "" })).text),
          enabled: { tasks: plugins.isEnabled("tasks"), inbox: plugins.isEnabled("inbox"), notes: plugins.isEnabled("notes"), automations: plugins.isEnabled("automations"), agentCli: plugins.isEnabled("agent-cli") },
        };
      },
    }),
  );
  const eventLog = new EventLog(path.join(vault.stateDir, "diagnostics", "events.ndjson"));
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
      const cli = plugins.isEnabled("agent-cli") ? getService<{ core: { probe(): Promise<{ state: string; version: string | null; error?: string }> } }>("agentCli") : undefined;
      if (cli) {
        // 诊断是只读动作：不为检查而拉起 Core。未运行但随包程序在 → 正常（打开终端时按需启动）
        const st = await cli.core.probe().catch((e: unknown) => ({ state: "unavailable", version: null, error: e instanceof Error ? e.message : String(e) }));
        out.push(
          st.state === "connected"
            ? { id: "herdr", title: "Herdr Core", status: "ok", detail: `已连接${st.version ? ` · ${st.version}` : ""}` }
            : st.state === "idle"
              ? { id: "herdr", title: "Herdr Core", status: "ok", detail: "未运行，打开 Agent 终端时按需启动" }
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
  const home = new HomeStore({
    dir: path.join(vault.stateDir, "home"), now: () => new Date(), zone: settingsZone,
    deadlineAvailable: () => !vault.readOnly && plugins.isEnabled("automations") && getService<boolean>("focusDeadlines") === true,
    focusChanged: () => events.publish("entity.changed", { kind: "home-focus", id: "focus", op: "updated" }),
  });
  registerHomeCapabilities(
    registry,
    home,
    vault,
    [sshHostsWidget, gitHomeWidget, automationSummaryWidget, tasksHomeWidget, recentNotesHomeWidget, inboxHomeWidget, agentEntryHomeWidget],
    () => {
      events.publish("entity.changed", { kind: "home-dashboard", id: "home", op: "updated" });
    },
  );
  registerSystemCapabilities(
    registry,
    plugins,
    {
      snapshot: () => exposure.snapshot(),
      setMany: (changes, revision, assertCatalog, resources) => exposure.setMany(changes, revision, assertCatalog, resources),
      setPluginEnabled: (id, v) => (external.has(id) ? external.setEnabled(id, v) : exposure.setPluginEnabled(id, v)),
      publishPolicyChange: () => events.publish("entity.changed", { kind: "tool-access", id: "policy", op: "updated" }),
    },
    {
      tokens: gatewayTokens,
      mcp: {
        status: () => {
          const status = mcpListener.status();
          return { ...status, enabled: status.enabled && plugins.isEnabled("mcp") };
        },
        update: (settings) => {
          if (settings.enabled && !plugins.isEnabled("mcp")) throw errors.pluginDisabled("mcp");
          const status = mcpListener.update(settings);
          events.publish("entity.changed", { kind: "gateway", id: "mcp", op: "updated" });
          return status;
        },
      },
      audit: gatewayAudit,
      hasSavedSshHosts: (ids) => ssh.hasSavedSshHosts(vault.files, ids),
    },
  );
  plugins.register({
    manifest: PluginManifestSchema.parse(automationsManifest),
    apply: (ctx, api) => {
      const cli = () => api.service<{ spaces: { list(): { id: string; root: string }[] }; detector: agentCli.AgentDetector }>("agentCli");
      let exes: Record<string, string> = {};
      // 探测结果有 10 分钟缓存；每次扫描前再取一次（命中缓存就是即时的），这样启动时探测超时 / 之后才安装的 CLI 也能被用上
      const refreshClis = async (): Promise<void> => {
        const r = await cli()?.detector.detect();
        exes = Object.fromEntries((r ?? []).flatMap((x) => (x.installed && x.path && x.headless ? [[x.id, x.path] as const] : [])));
      };
      void refreshClis().catch(() => undefined);
      automations.apply(ctx, api, {
        zone: settingsZone,
        taskScanPrincipalCurrent: (caller, subject) => (serverRef.current?.hasMcpPrincipal(caller, subject) ?? false) || (caller !== "mcp" && tokens.hasPrincipal(caller, subject)),
        ...(moduleCredentialHost && { credentialHost: { ...moduleCredentialHost, vault } }),
        cliAvailable: (p) => cli() !== undefined && exes[p] !== undefined,
        refreshClis,
        spaceState: (id) => {
          const s = cli()
            ?.spaces.list()
            .find((x) => x.id === id);
          return s ? (existsSync(s.root) ? { state: "ok", root: s.root } : { state: "inaccessible" }) : { state: "missing" };
        },
        notify: (n) => void notifications.create(n),
        reminderNotifications: { send: ({ id, ...notification }) => void notifications.create(notification, id), has: (id) => notifications.has(id) },
        focusDeadline: home.focusDeadline(),
      });
    },
  });
  plugins.register({
    manifest: PluginManifestSchema.parse(versioningManifest),
    apply: (ctx, api) =>
      void versioning.apply(ctx, api, {
        safeSnapshots: safe.safeGitSnapshots(api.vault.files),
        notifyHistoryFailure: (id, title) => {
          notifications.create({ title, module: "versioning", body: "请检查本机 Git 和存储。保留的版本会自动重试，也可重新启用「版本与同步」后重试。" }, id);
        },
        ...(moduleCredentialHost && { credentialHost: { ...moduleCredentialHost, vault } }),
      }),
  });
  const sshLocalCore = vault.readOnly
    ? undefined
    : new HerdrCore({
        bin: process.env["HUHU_HERDR_BIN"] ?? "herdr-core",
        vaultId: vault.id,
        machineId: machineId(),
        runtimeDir: path.join(runtime, "ssh-local-herdr"),
        session: "huhu-ssh-local",
        socketName: `huhu-ssh-${createHash("sha256").update(endpointRootBinding(vault.root)).digest("hex").slice(0, 20)}`,
      });
  plugins.register({
    manifest: PluginManifestSchema.parse(sshManifest),
    ...(sshLocalCore && { confirmStopped: () => sshLocalCore.stop({ requireConfirmation: true }) }),
    apply: (ctx, api) => {
      ssh.apply(
        ctx,
        api,
        moduleCredentialHost ? { ...moduleCredentialHost, vault } : undefined,
        !vault.files.readOnly && rootIdentity ? { runtimeDir: runtime, vaultInstance: JSON.stringify([vault.id, ...rootIdentity]), retainActivity: retainLongOperation } : undefined,
        sshLocalCore && ssh.createHerdrLocalPty(sshLocalCore, attachTerminal),
      );
    },
  });
  const external = new ExternalPlugins({
    root: vault.root,
    stateDir: vault.stateDir,
    plugins,
    registry,
    dispatcher: () => dispatcherRef.current!,
    vaultInstance: rootIdentity ? JSON.stringify([vault.id, ...rootIdentity]) : vault.id,
    ...(process.env["HUHU_EXAMPLES_DIR"] ? { examplesDir: process.env["HUHU_EXAMPLES_DIR"] } : {}),
    assertWritable: () => vault.files.assertWritable(),
  });
  registerExternalPluginCapabilities(registry, external);
  plugins.shouldEnable = (id) => (external.has(id) ? external.shouldEnable(id) : exposure.pluginEnabled(id));
  const real = new Dispatcher({
    registry,
    audit: gatewayAudit,
    idempotency: new IdempotencyStore(path.join(runtime, "idempotency.ndjson")),
    ...(!vault.files.readOnly &&
      rootIdentity && {
        operations: {
          ledger: new OperationReceipts(path.join(runtime, "invocation-intents.ndjson")),
          vaultInstance: JSON.stringify([vault.id, ...rootIdentity]),
        },
      }),
    isPluginEnabled: (id) => plugins.isEnabled(id),
    toolAccess: () => exposure.snapshot(),
    grantedPermissions: (id) => (plugins.originOf(id) === "external" ? external.grantsOf(id) : plugins.permissionsOf(id)),
    pluginOrigin: (id) => plugins.originOf(id),
  });
  dispatcherRef.current = real;
  await plugins.enableAll();
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
      if (kind === "archive") return id.replace(/\/+$/, "").split("/").at(-1) ?? null; // 档案按路径标识，标题就是文件夹名
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
  const terminal: NonNullable<Parameters<typeof startEngineServer>[0]["terminal"]> = (id, ws, options) => {
    const bridge = getService<(i: string, w: typeof ws, x: typeof options) => Promise<boolean>>(id.startsWith("ssh-") ? "terminalBridge:ssh" : "terminalBridge:agent");
    return bridge ? bridge(id, ws, options) : false;
  };
  const webTerminal: typeof terminal = (id, ws, options) => !id.startsWith("ssh-local-") && terminal(id, ws, options);
  const webShare = new WebShareService(vault.id, opts.webAssetsDir, real, events, webTerminal, async (...input) => {
    const upload = plugins.isEnabled("mail") && getService<mail.MailWebAttachmentUpload>(mail.MAIL_WEB_ATTACHMENTS_SERVICE);
    if (!upload || vault.readOnly) throw errors.permissionDenied("上传邮件附件");
    return upload(...input);
  });
  registerWebShareCapabilities(registry, webShare);
  // 所有插件启用、Web 分享能力登记之后再补写 / 升级指南：能力表取决于完整的注册表
  await guideRef.current?.maintain().catch(() => undefined);
  const port = mcpListener.port ?? opts.port;
  let server: RunningServer | undefined;
  try {
    server = await startEngineServer({
      mcpHttp: { enabled: () => mcpListener.enabled() && plugins.isEnabled("mcp") },
      externalMcpTools: () => plugins.isEnabled("mcp") ? getService<ExternalMcpTools>(MCP_SOURCES_SERVICE) : undefined,
      mcpSignal: () => gatewayTokens.mcpSignal(),
      vaultInstance: mcpVaultInstance,
      ...(!vault.files.readOnly && rootIdentity && { mcpRecovery: { directory: runtime, generation: () => gatewayTokens.mcpRecoveryGeneration() } }),
      terminal,
      dispatcher: real,
      registry,
      tokens,
      events,
      ...(port !== undefined ? { port } : {}),
    });
    mcpListener.bound(server.port);
  } catch (error) {
    await server?.close().catch(() => undefined);
    await plugins.disposeAll().catch(() => undefined);
    await webShare.stop().catch(() => undefined);
    await vault.close();
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw Object.assign(new Error(`Engine 无法使用本机端口 ${port}，该端口已被占用`, { cause: error }), { code: "EADDRINUSE" });
    }
    throw error;
  }

  const watcher = new VaultWatcher({
    root: vault.root,
    receipts: vault.files.receipts,
    onChanges: (changes) => {
      index.applyChanges(changes);
      for (const c of changes) events.publish("vault.fileChanged", { path: c.path, change: c.change, ...(c.from ? { from: c.from } : {}) });
    },
    onDirChanges: (paths) => {
      for (const p of paths) events.publish("vault.dirChanged", { path: p });
    },
    onDegraded: () => undefined,
  });
  await watcher.start();
  // 索引快照与监听器基线之间的写入不会有事件：对账一次，并按文件事件通知界面
  try {
    for (const c of index.reconcile()) events.publish("vault.fileChanged", { path: c.path, change: c.change });
  } catch (err) {
    // 对账只是补漏；失败不应阻止引擎启动，后续由监听器继续增量更新。
    process.stderr.write(`[huhu] index reconcile failed: ${err instanceof Error ? err.message : String(err)}\n`);
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
  await exposure.initialize(registry.knownNames());
  const descriptorPath = endpointPath(vault);
  const lifecycle = !vault.readOnly && process.getuid ? opts.lifecycle : undefined;
  const descriptor: EndpointDescriptor = {
    pid: process.pid, port: server.port, vaultId: vault.id, rootBinding: endpointRootBinding(vault.root), cliToken, startedAt: new Date().toISOString(),
    mode: lifecycle?.mode ?? "temporary", ...(lifecycle && { instance: randomUUID() }),
  };
  let closeControl: (() => Promise<void>) | undefined;
  let published = false;
  let closed: Promise<void> | undefined;
  const attachmentLifetime = new AbortController();
  const shutdown = () =>
    (closed ??= (async () => {
      real.beginClose();
      attachmentLifetime.abort();
      events.publish("engine.closing", {});
      try {
        await closeControl?.();
        await watcher.close({ flush: true });
        await plugins.disposeAll();
      } finally {
        try {
          await webShare.stop();
        } finally {
          try {
            await server.close();
          } finally {
            try {
              if (published) rmSync(descriptorPath, { force: true });
            } finally {
              await vault.close();
            }
          }
        }
      }
    })());

  if (!vault.readOnly) {
    const temp = `${descriptorPath}.${process.pid}.tmp`;
    try {
      if (lifecycle) closeControl = await startLocalControl(descriptor, rendererToken, lifecycle.requestStop);
      writeFileSync(temp, JSON.stringify(descriptor), { mode: 0o600 });
      renameSync(temp, descriptorPath);
      published = true;
    } catch (error) {
      await shutdown().catch(() => undefined);
      throw error;
    } finally {
      rmSync(temp, { force: true });
    }
  }

  return {
    vault,
    port: server.port,
    rendererToken,
    cliToken,
    descriptorPath,
    server,
    index,
    dispatcher: real,
    registry,
    events,
    lastLongOperationActivity: () => (activeOperations > 0 ? Date.now() : lastOperationEnd),
    ...(moduleCredentialHost ? { moduleCredentialHost } : {}),
    addMailDraftAttachment: (request, signal) => {
      if (request.vaultId !== vault.id || vault.readOnly) return Promise.resolve({ status: "failed", reason: "unavailable" });
      return addDesktopMailAttachment(getService<mail.MailDraftAttachments>(mail.MAIL_DRAFT_ATTACHMENTS_SERVICE), request, AbortSignal.any([signal, attachmentLifetime.signal]));
    },
    shutdown,
  };
}
