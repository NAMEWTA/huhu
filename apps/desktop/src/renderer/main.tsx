import "@huhu/ui/styles.css";
import "@huhu/workbench/shell.css";
import { appearanceController, Button, EmptyState } from "@huhu/ui";
import { contributions as agentGuideUi } from "@huhu/plugin-agent-guide/ui";
import { contributions as automationsUi } from "@huhu/plugin-automations/ui";
import { contributions as agentCliUi } from "@huhu/plugin-agent-cli/ui";
import { contributions as inboxUi } from "@huhu/plugin-inbox/ui";
import { createMailContributions } from "@huhu/plugin-mail/ui";
import { contributions as notesUi } from "@huhu/plugin-notes/ui";
import { contributions as safeUi } from "@huhu/plugin-safe/ui";
import { contributions as sshUi } from "@huhu/plugin-ssh/ui";
import { contributions as versioningUi } from "@huhu/plugin-versioning/ui";
import { contributions as tasksUi } from "@huhu/plugin-tasks/ui";
import {
  AppShell,
  ContributionRegistry,
  EngineProvider,
  FocusPauseOnClose,
  HealthModule,
  HomeModule,
  CommandPalette,
  checkExitParticipants,
  requestOpenPath,
  requestOpenTask,
  runFlushers,
  LaunchPage,
  type VaultHostState,
  QuickCapture,
  EngineClient,
  GatewayModule,
  NotificationBell,
  ReminderToasts,
  ShellStatusBar,
  ThemeToggle,
  PluginCenterModule,
  SettingsModule,
  systemSettingsPages,
  useCapability,
  createUiStore,
  type EngineEndpoint,
} from "@huhu/workbench";
import { Activity, Bell, Blocks, CalendarDays, HeartPulse, House, LayoutGrid, Monitor, Plug, Search, Server, Settings, ShieldCheck, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PrepareExit, ReleaseExit } from "../exit-ipc.js";
import { browserEndpoint, browserLocation, joinBrowserWorkbench, type BrowserEndpoint } from "./web-host.js";

// 首帧：用 localStorage 里缓存的最近一次外观（没有就是默认主题 + 跟随系统），打开 Vault 后再以 Vault 的设置为准
appearanceController().refresh();

type EngineState = "starting" | "ready" | "stopped" | "crashed";

/** 按插件启用状态过滤 rail / 标签 / 命令（启停无需刷新页面）。 */
function PluginFilter({ registry }: { registry: ContributionRegistry }) {
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  useEffect(() => {
    if (plugins.data) registry.setEnabledPlugins(plugins.data.filter((p) => p.state === "active").map((p) => p.id));
  }, [plugins.data, registry]);
  return null;
}

function DesktopApp() {
  const [endpoint, setEndpointRaw] = useState<EngineEndpoint | null>(null);
  // 同一端点重复到达时保持引用不变，避免重建连接
  const setEndpoint = (e: EngineEndpoint | null) => setEndpointRaw((cur) => (cur && e && cur.baseUrl === e.baseUrl && cur.token === e.token && cur.vaultId === e.vaultId ? cur : e));
  const [state, setState] = useState<EngineState>("starting");
  const [version, setVersion] = useState<string | undefined>(undefined);
  useEffect(() => {
    void window.huhuHost
      .appInfo()
      .then((i) => setVersion(i.version))
      .catch(() => undefined); // 版本号的单一来源是应用本身，不在界面里写死
  }, []);

  useEffect(() => {
    const off = window.huhuHost.onEngineState((s) => {
      setState(s);
      if (s === "ready") void window.huhuHost.engine().then(setEndpoint);
      if (s === "crashed" || s === "stopped") setEndpoint(null);
    });
    void window.huhuHost.engineState().then((s) => {
      setState(s);
      if (s === "ready") void window.huhuHost.engine().then(setEndpoint);
    });
    void window.huhuHost.engine().then((e) => {
      setEndpoint(e);
      setState("ready");
    });
    return off;
  }, []);

  return <App endpoint={endpoint} state={state} version={version} onRestartEngine={() => void window.huhuHost.restartEngine()} />;
}

interface AppProps {
  endpoint: EngineEndpoint | null;
  state: EngineState;
  version?: string | undefined;
  onRestartEngine?(): void;
  onConnection?(state: "connected" | "reconnecting"): void;
  browser?: boolean;
}

function App({ endpoint, state, version, onRestartEngine, onConnection, browser = false }: AppProps) {
  const [vaultName, setVaultName] = useState("HUHU");
  const ui = useMemo(() => {
    const active = (browser && browserLocation(location.pathname)?.module) || "home";
    return createUiStore({ activeModule: active, openTabs: active === "home" ? ["home"] : ["home", active] });
  }, [browser]);
  const registry = useMemo(() => {
    const r = new ContributionRegistry();
    r.register(notesUi);
    r.register(tasksUi);
    r.register(inboxUi);
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
          nav: "tabs",
          sections: [
            { id: "overview", label: "总览", tabIcon: LayoutGrid },
            { id: "today", label: "今日安排", tabIcon: CalendarDays },
            { id: "activity", label: "最近活动", tabIcon: Activity },
          ],
          component: (p) => <HomeModule ui={ui} registry={r} section={p.section} onSection={p.onSection} />,
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
          component: (p) => <HealthModule {...p} ui={ui} />,
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
  }, [ui]);
  const client = useMemo(() => (endpoint ? new EngineClient(endpoint) : null), [endpoint]);

  useEffect(() => {
    if (!browser) return;
    const openLocation = () => {
      const link = browserLocation(location.pathname);
      if (link?.target) {
        if (link.module === "tasks") requestOpenTask(link.target);
        else requestOpenPath(link.target, true);
      }
      const active = link?.module ?? "home";
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
          <NotificationBell onOpenModule={(id) => ui.getState().openModule(id)} />
        </>
      }
      statusBar={<ShellStatusBar ui={ui} />}
      {...(version ? { version } : {})}
    />
  );
  const withFilter = (
    <>
      {shell}
      {endpoint ? <PluginFilter registry={registry} /> : null}
      {endpoint ? <QuickCapture /> : null}
      {endpoint ? <FocusPauseOnClose /> : null}
      {endpoint ? <ReminderToasts onOpenTasks={() => ui.getState().openModule("tasks")} /> : null}
      <CommandPalette
        registry={registry}
        ui={ui}
        client={client}
        onOpenResult={(r) => {
          if (r.kind === "task") return ui.getState().openModule("tasks");
          if (r.kind === "capture") return ui.getState().openModule("inbox");
          requestOpenPath(r.path); // 笔记与档案（档案是 Archives/ 下的文件夹笔记）：笔记模块打开对应文件
          ui.getState().openModule("notes");
        }}
      />
    </>
  );
  return endpoint ? (
    <EngineProvider endpoint={endpoint} {...(onConnection ? { onConnection } : {})}>
      {withFilter}
    </EngineProvider>
  ) : (
    <>
      {shell}
      <CommandPalette registry={registry} ui={ui} />
    </>
  );
}

function connectWindowExit(): () => void {
  let active: { id: number; controller: AbortController; restore?: () => void } | undefined;
  const release: ReleaseExit = (id) => {
    if (!active || active.id !== id) return;
    const attempt = active;
    active = undefined;
    attempt.controller.abort();
    attempt.restore?.();
  };
  const prepare: PrepareExit = async (id, report) => {
    if (active) release(active.id);
    const controller = new AbortController();
    const attempt: NonNullable<typeof active> = { id, controller };
    active = attempt;
    const { signal } = controller;
    report("checking");
    const leave = await checkExitParticipants({
      signal,
      reason: "window",
      async waitForUser(decision) {
        signal.throwIfAborted();
        report("waiting");
        try {
          return await decision;
        } finally {
          if (!signal.aborted) report("checking");
        }
      },
    });
    if (!leave || signal.aborted) return "stay";
    const previousFocus = document.activeElement;
    const body = document.body;
    const wasInert = body.inert;
    body.inert = true;
    attempt.restore = () => {
      body.inert = wasInert;
      if (!wasInert && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
    report("flushing");
    await runFlushers();
    return signal.aborted ? "stay" : true;
  };
  const unsubscribe = window.huhuHost.onExit(prepare, release);
  return () => {
    unsubscribe();
    if (active) release(active.id);
  };
}

/** 根：先问 Main 当前有没有打开的 Vault；没有就显示启动页，打开成功后重新载入界面（旧 Vault 的缓存与事件随页面一起丢弃）。 */
function DesktopRoot() {
  const [vault, setVault] = useState<VaultHostState | null>(null);
  useEffect(connectWindowExit, []);
  useEffect(() => {
    void window.huhuHost.vault.state().then(setVault);
  }, []);
  if (!vault) return null;
  if (vault.path === null) return <LaunchPage state={vault} onOpened={() => window.location.reload()} />;
  return <DesktopApp />;
}

type BrowserState = { status: "loading" | "expired" | "unavailable" } | { status: "ready"; endpoint: BrowserEndpoint };

function BrowserRoot() {
  const [session, setSession] = useState<BrowserState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void joinBrowserWorkbench(signal).then(
      (endpoint) => {
        if (!controller.signal.aborted) setSession(endpoint ? { status: "ready", endpoint } : { status: "expired" });
      },
      () => {
        if (!controller.signal.aborted) setSession({ status: "unavailable" });
      },
    );
    return () => controller.abort();
  }, []);

  const checkSession = useCallback((state: "connected" | "reconnecting") => {
    if (state !== "reconnecting") return;
    void browserEndpoint()
      .then((current) => {
        setSession((previous) => {
          if (previous.status !== "ready") return previous;
          return current?.generation === previous.endpoint.generation && current.vaultId === previous.endpoint.vaultId ? previous : { status: "expired" };
        });
      })
      .catch(() => undefined); // 暂时断网时由事件流重连，保留正在编辑的内容。
  }, []);

  if (session.status === "ready") return <App key={session.endpoint.generation} endpoint={session.endpoint} state="ready" browser onConnection={checkSession} />;
  if (session.status === "loading") return <EmptyState title="正在连接工作台" />;
  return <EmptyState title={session.status === "expired" ? "浏览器会话不可用" : "无法连接工作台"} hint="打开桌面端提供的有效邀请链接。" action={<Button onClick={() => location.reload()}>重新连接</Button>} />;
}

createRoot(document.getElementById("root")!).render(window.huhuHost ? <DesktopRoot /> : <BrowserRoot />);
