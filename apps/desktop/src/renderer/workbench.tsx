import "@huhu/ui/styles.css";
import "@huhu/workbench/shell.css";
import { appearanceController, EmptyState } from "@huhu/ui";
import { contributions as agentGuideUi } from "@huhu/plugin-agent-guide/ui";
import { contributions as automationsUi, PlanScheduleControls } from "@huhu/plugin-automations/ui";
import { contributions as agentCliUi } from "@huhu/plugin-agent-cli/ui";
import { contributions as inboxUi, requestOpenCapture } from "@huhu/plugin-inbox/ui";
import { createLedgerContributions } from "@huhu/plugin-ledger/ui";
import { createMailContributions, requestMailNotification } from "@huhu/plugin-mail/ui";
import { DocumentSessionConnection, contributions as notesUi } from "@huhu/plugin-notes/ui";
import { contributions as safeUi } from "@huhu/plugin-safe/ui";
import { readSshFileWindow, readSshTerminalWindow, readSshToolWindow } from "@huhu/plugin-ssh/shared";
import { contributions as sshUi, SshFileWindow, SshTerminalWindow, SshToolWindow } from "@huhu/plugin-ssh/ui";
import { contributions as versioningUi } from "@huhu/plugin-versioning/ui";
import { contributions as tasksUi, TaskRunDetails, taskRunLabel } from "@huhu/plugin-tasks/ui";
import {
  AppShell,
  ContributionRegistry,
  EngineProvider,
  focusOpenedModule,
  FocusPauseOnClose,
  HealthModule,
  HomeModule,
  CommandPalette,
  type CommandPaletteProps,
  type PaletteSearchHit,
  requestOpenPath,
  requestOpenTask,
  writeAutomationOccurrenceLink,
  readAutomationOccurrenceLink,
  QuickCapture,
  EngineClient,
  GatewayModule,
  NotificationBell,
  type OpenNotification,
  ReminderToasts,
  ShellStatusBar,
  ThemeToggle,
  PluginCenterModule,
  SettingsModule,
  systemSettingsPages,
  TaskAutomationViewsContext,
  useCapability,
  useEngine,
  createUiStore,
  type EngineEndpoint,
} from "@huhu/workbench";
import { Activity, Bell, Blocks, HeartPulse, House, Monitor, Plug, Search, Server, Settings, ShieldCheck, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { browserLocation } from "./web-host.js";

export type EngineState = "starting" | "ready" | "stopped" | "crashed";
const taskAutomationViews = { PlanScheduleControls, TaskRunDetails, taskRunLabel };

/** 按插件启用状态过滤 rail / 标签 / 命令（启停无需刷新页面）。 */
function PluginFilter({ registry }: { registry: ContributionRegistry }) {
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  useEffect(() => {
    if (plugins.data) registry.setEnabledPlugins(plugins.data.filter((p) => p.state === "active").map((p) => p.id));
  }, [plugins.data, registry]);
  return null;
}

function WorkbenchCommandPalette({ registry, ui }: Pick<CommandPaletteProps, "registry" | "ui">) {
  const client = useEngine();
  const current = useRef<EngineClient | null>(null);
  useLayoutEffect(() => {
    current.current = client;
    return () => {
      current.current = null;
    };
  }, [client]);

  const onOpenResult = useCallback(({ kind, id, path }: PaletteSearchHit) => {
    const open = (module: string, onOpen: () => void) =>
      ui.getState().openModule(module, {
        onOpen: () => {
          onOpen();
          focusOpenedModule(ui, module);
        },
        isCurrent: () => current.current === client && registry.getSnapshot().modules.some(({ id }) => id === module),
      });
    if (kind === "task") {
      if (id) void open("tasks", () => requestOpenTask(id));
    } else if (kind === "capture") {
      if (id) void open("inbox", () => requestOpenCapture(client, id));
    } else {
      void open("notes", () => requestOpenPath(path, true));
    }
  }, [client, registry, ui]);

  return <CommandPalette registry={registry} ui={ui} client={client} onOpenResult={onOpenResult} />;
}

interface AppProps {
  endpoint: EngineEndpoint | null;
  state: EngineState;
  version?: string | undefined;
  onRestartEngine?(): void;
  onConnection?(state: "connected" | "reconnecting"): void;
  browser?: boolean;
}

export function WorkbenchApp(props: AppProps) {
  const files = readSshFileWindow(location.hash);
  const tools = props.browser ? undefined : readSshToolWindow(location.hash);
  const terminal = props.browser ? undefined : readSshTerminalWindow(location.hash);
  const target = files ?? tools ?? terminal;
  if (!target) return <WorkbenchShell {...props} />;
  const { endpoint, state, onConnection } = props;
  if (!endpoint || target.vaultId !== endpoint.vaultId) {
    return <EmptyState title={state === "starting" || (state === "ready" && !endpoint) ? "正在连接原 SSH 会话…" : "原 SSH 会话所在的 Vault 未连接"} />;
  }
  return (
    <EngineProvider endpoint={endpoint} {...(onConnection ? { onConnection } : {})}>
      {"fileSessionId" in target ? <SshFileWindow id={target.fileSessionId} /> : "handoffId" in target ? <SshTerminalWindow target={target} /> : <SshToolWindow hostId={target.hostId} shellId={target.shellId} name={target.name} />}
    </EngineProvider>
  );
}

function WorkbenchShell({ endpoint, state, version, onRestartEngine, onConnection, browser = false }: AppProps) {
  const [vaultName, setVaultName] = useState("HUHU");
  const currentEndpoint = useRef(endpoint);
  const notificationRequest = useRef(0);
  useLayoutEffect(() => { currentEndpoint.current = endpoint; }, [endpoint]);
  const ui = useMemo(() => {
    const active = (browser && browserLocation(location.pathname)?.module) || "home";
    return createUiStore({ activeModule: active, openTabs: active === "home" ? ["home"] : ["home", active] });
  }, [browser]);
  const openNotification = useCallback<OpenNotification>(
    ({ id, module, occurrence }, source) => {
      const open = () => {
        const state = ui.getState();
        const destination = module || "home";
        return state.activeModule === destination || state.openModule(destination);
      };
      if (occurrence) {
        const request = ++notificationRequest.current;
        void ui.getState().openModule("automations", {
          guardCurrent: true,
          isCurrent: () => request === notificationRequest.current
            && currentEndpoint.current?.vaultId === source.vaultId && currentEndpoint.current.baseUrl === source.baseUrl,
          onOpen: () => writeAutomationOccurrenceLink(source.vaultId, occurrence),
        });
      } else if (module === "mail") void requestMailNotification({ id, vaultId: source.vaultId, endpoint: source.baseUrl }, open);
      else open();
    },
    [ui],
  );
  const registry = useMemo(() => {
    const r = new ContributionRegistry();
    r.register(notesUi);
    r.register(tasksUi);
    r.register(inboxUi);
    r.register(createLedgerContributions(() => {
      const state = ui.getState();
      state.setSection("ledger", "records");
      state.openModule("ledger");
    }));
    r.register(createMailContributions(() => ui.getState().openModule("mail")));
    r.register(safeUi);
    r.register(agentCliUi);
    r.register(automationsUi);
    r.register(sshUi);
    r.register(versioningUi);
    r.register(agentGuideUi);
    r.register({ settingsPages: systemSettingsPages() });
    r.register({
      modules: [
        {
          id: "home",
          plugin: "kernel",
          title: "工作台",
          group: "primary",
          order: 0,
          icon: <House size={18} aria-hidden />,
          component: () => <HomeModule ui={ui} registry={r} />,
        },
      ],
    });
    r.register({
      modules: [
        {
          id: "health",
          plugin: "kernel",
          title: "健康中心",
          group: "system",
          order: 50,
          icon: <HeartPulse size={18} aria-hidden />,
          nav: "shell",
          description: "状态、诊断与问题恢复",
          sections: [
            { id: "all", label: "系统状态", icon: <HeartPulse size={16} aria-hidden /> },
            { id: "logs", label: "事件日志", icon: <Activity size={16} aria-hidden /> },
            { id: "notifications", label: "通知", icon: <Bell size={16} aria-hidden /> },
          ],
          component: (p) => <HealthModule {...p} ui={ui} onOpenNotification={openNotification} />,
        },
      ],
    });
    r.register({
      modules: [
        {
          id: "gateway",
          plugin: "kernel",
          title: "能力网关",
          group: "system",
          order: 20,
          nav: "tabs",
          sections: [
            { id: "mcp", label: "MCP", tabIcon: Plug },
            { id: "cli", label: "CLI", tabIcon: SquareTerminal },
            { id: "server", label: "服务端", tabIcon: Server },
            { id: "desktop", label: "桌面宿主", tabIcon: Monitor },
          ],
          description: "一套能力，多个入口",
          icon: <Plug size={18} aria-hidden />,
          component: (p) => <GatewayModule {...p} ui={ui} />,
        },
      ],
    });
    r.register({
      modules: [
        {
          id: "plugins",
          plugin: "kernel",
          title: "插件中心",
          group: "system",
          order: 10,
          icon: <Blocks size={18} aria-hidden />,
          nav: "tabs",
          sections: [
            { id: "installed", label: "已安装", tabIcon: Blocks },
            { id: "discover", label: "发现插件", tabIcon: Search },
            { id: "runtime", label: "运行时", tabIcon: Activity },
            { id: "permissions", label: "权限与依赖", tabIcon: ShieldCheck },
          ],
          description: "每项能力都有清晰的生命周期",
          component: PluginCenterModule,
        },
      ],
    });
    r.register({
      modules: [
        {
          id: "settings",
          plugin: "kernel",
          title: "设置",
          group: "system",
          order: 90,
          icon: <Settings size={18} aria-hidden />,
          nav: "shell",
          description: "你的工作方式，由你定义",
          component: SettingsModule,
        },
      ],
    });
    return r;
  }, [openNotification, ui]);
  const client = useMemo(() => (endpoint ? new EngineClient(endpoint) : null), [endpoint]);

  useEffect(() => {
    if (endpoint && readAutomationOccurrenceLink(endpoint.vaultId) && ui.getState().activeModule !== "automations") {
      void ui.getState().openModule("automations");
    }
  }, [endpoint, ui]);

  useEffect(() => {
    if (browser || !endpoint) return;
    return window.huhuHost?.onAutomationNotification(({ vaultId, id, occurrence }) => {
      if (vaultId === endpoint.vaultId) openNotification({ id, module: "automations", occurrence }, endpoint);
    });
  }, [browser, endpoint, openNotification]);

  useEffect(() => {
    if (!browser) return;
    const openLocation = () => {
      const link = browserLocation(location.pathname);
      if (link?.target) {
        if (link.module === "tasks") requestOpenTask(link.target);
        else requestOpenPath(link.target, true);
      }
      const current = currentEndpoint.current;
      const active = current && readAutomationOccurrenceLink(current.vaultId) ? "automations" : link?.module ?? "home";
      if (ui.getState().activeModule !== active) ui.getState().openModule(active);
    };
    openLocation();
    window.addEventListener("popstate", openLocation);
    return () => window.removeEventListener("popstate", openLocation);
  }, [browser, ui]);

  // 引擎就绪后应用该 Vault 保存的外观设置
  useEffect(() => {
    if (!client) return;
    void client
      .call<{ appearance: Record<string, unknown> }>("settings.get")
      .then((settings) => appearanceController().set(settings.appearance))
      .catch(() => undefined);
    void client
      .call<{ name: string }>("vault.info")
      .then((vault) => setVaultName(vault.name))
      .catch(() => undefined);
  }, [client]);

  const shellState: EngineState = endpoint ? state : state === "ready" ? "starting" : state;
  const shell = (
    <AppShell
      registry={registry}
      ui={ui}
      engineState={shellState}
      {...(onRestartEngine ? { onRestartEngine } : {})}
      vaultName={vaultName}
      statusSlot={
        <>
          <ThemeToggle />
          <NotificationBell onOpenModule={(id) => ui.getState().openModule(id)} onOpenNotification={openNotification} />
        </>
      }
      statusBar={<ShellStatusBar ui={ui} />}
      {...(version ? { version } : {})}
    />
  );
  const withFilter = (
    <>
      {endpoint?.token ? <DocumentSessionConnection /> : null}
      {shell}
      {endpoint ? <PluginFilter registry={registry} /> : null}
      {endpoint ? <QuickCapture /> : null}
      {endpoint ? <FocusPauseOnClose /> : null}
      {endpoint ? <ReminderToasts onOpenTasks={() => ui.getState().openModule("tasks")} onOpenNotification={openNotification}
        {...(!browser && { onDesktopNotification: (notice, vaultId) => void window.huhuHost?.showAutomationNotification(notice, vaultId).catch(() => undefined) })} /> : null}
      <WorkbenchCommandPalette registry={registry} ui={ui} />
    </>
  );
  return endpoint ? (
    <EngineProvider endpoint={endpoint} {...(onConnection ? { onConnection } : {})}>
      <TaskAutomationViewsContext.Provider value={taskAutomationViews}>{withFilter}</TaskAutomationViewsContext.Provider>
    </EngineProvider>
  ) : (
    <>
      {shell}
      <CommandPalette registry={registry} ui={ui} />
    </>
  );
}
