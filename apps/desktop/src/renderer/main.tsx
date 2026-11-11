import "@huhu/ui/tokens.css";
import "@huhu/ui/proto.css";
import "@huhu/ui/components.css";
import "@huhu/workbench/shell.css";
import { applyAppearance } from "@huhu/ui";
import { contributions as automationsUi } from "@huhu/plugin-automations/ui";
import { contributions as agentCliUi } from "@huhu/plugin-agent-cli/ui";
import { contributions as archivesUi } from "@huhu/plugin-archives/ui";
import { contributions as inboxUi } from "@huhu/plugin-inbox/ui";
import { contributions as notesUi } from "@huhu/plugin-notes/ui";
import { contributions as safeUi } from "@huhu/plugin-safe/ui";
import { contributions as sshUi } from "@huhu/plugin-ssh/ui";
import { contributions as versioningUi } from "@huhu/plugin-versioning/ui";
import { contributions as tasksUi } from "@huhu/plugin-tasks/ui";
import {
  AppShell,
  ContributionRegistry,
  EngineProvider,
  HealthModule,
  HomeModule,
  CommandPalette,
  runFlushers,
  LaunchPage,
  type VaultHostState,
  QuickCapture,
  EngineClient,
  GatewayModule,
  NotificationBell,
  ShellStatusBar,
  ThemeToggle,
  PluginCenterModule,
  SettingsModule,
  useCapability,
  createUiStore,
  type EngineEndpoint,
} from "@huhu/workbench";
import { Activity, Bell, Blocks, BookOpen, CalendarDays, Command, Database, Folder, HeartPulse, House, NotebookPen, Palette, Plug, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type EngineState = "starting" | "ready" | "stopped" | "crashed";

/** 按插件启用状态过滤 rail / 标签 / 命令（启停无需刷新页面）。 */
function PluginFilter({ registry }: { registry: ContributionRegistry }) {
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  useEffect(() => {
    if (plugins.data) registry.setEnabledPlugins(plugins.data.filter((p) => p.state === "active").map((p) => p.id));
  }, [plugins.data, registry]);
  return null;
}

function App() {
  const [endpoint, setEndpointRaw] = useState<EngineEndpoint | null>(null);
  // 同一端点重复到达时保持引用不变，避免重建连接
  const setEndpoint = (e: EngineEndpoint | null) => setEndpointRaw((cur) => (cur && e && cur.baseUrl === e.baseUrl && cur.token === e.token && cur.vaultId === e.vaultId ? cur : e));
  const [state, setState] = useState<EngineState>("starting");
  const [vaultName, setVaultName] = useState("HUHU");
  const registry = useMemo(() => {
    const r = new ContributionRegistry();
    r.register(notesUi);
    r.register(tasksUi);
    r.register(archivesUi);
    r.register(inboxUi);
    r.register(safeUi);
    r.register(agentCliUi);
    r.register(automationsUi);
    r.register(sshUi);
    r.register(versioningUi);
    r.register({ modules: [{ id: "home", plugin: "kernel", title: "工作台", group: "primary", order: 0, icon: <House size={18} aria-hidden />, component: () => <HomeModule ui={ui} /> }] });
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
            { id: "mcp", label: "MCP" },
            { id: "cli", label: "CLI" },
            { id: "server", label: "服务端" },
            { id: "desktop", label: "桌面宿主" },
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
            { id: "installed", label: "已安装" },
            { id: "discover", label: "发现插件" },
            { id: "runtime", label: "运行时" },
            { id: "permissions", label: "权限与依赖" },
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
          sections: [
            { id: "appearance", label: "外观", icon: <Palette size={16} aria-hidden /> },
            { id: "vault", label: "当前 Vault", icon: <Folder size={16} aria-hidden /> },
            { id: "agent-access", label: "Agent 接入", icon: <BookOpen size={16} aria-hidden /> },
            { id: "editor", label: "编辑器", icon: <NotebookPen size={16} aria-hidden /> },
            { id: "date-time", label: "日期与时间", icon: <CalendarDays size={16} aria-hidden /> },
            { id: "shortcuts", label: "快捷键", icon: <Command size={16} aria-hidden /> },
            { id: "data", label: "数据与存储", icon: <Database size={16} aria-hidden /> },
            { id: "about", label: "关于与来源", icon: <BookOpen size={16} aria-hidden /> },
          ],
          component: SettingsModule,
        },
      ],
    });
    return r;
  }, []);
  const ui = useMemo(() => createUiStore({ activeModule: "home", openTabs: ["home"] }), []);

  useEffect(() => {
    applyAppearance(document.documentElement, { theme: "pearl", mode: "system" }, window.matchMedia("(prefers-color-scheme: dark)").matches);
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

  // 引擎就绪后应用该 Vault 保存的外观设置
  useEffect(() => {
    if (!endpoint) return;
    void fetch(`${endpoint.baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "settings.get", input: {}, requestId: crypto.randomUUID() }),
    })
      .then((r) => r.json() as Promise<{ ok: boolean; data?: { appearance: Record<string, unknown> } }>)
      .then((r) => {
        if (r.ok && r.data) applyAppearance(document.documentElement, r.data.appearance, window.matchMedia("(prefers-color-scheme: dark)").matches);
      })
      .catch(() => undefined);
    void fetch(`${endpoint.baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "vault.info", input: {}, requestId: crypto.randomUUID() }),
    })
      .then((r) => r.json() as Promise<{ ok: boolean; data?: { name: string } }>)
      .then((r) => {
        if (r.ok && r.data) setVaultName(r.data.name);
      })
      .catch(() => undefined);
  }, [endpoint]);

  const shellState: EngineState = endpoint ? state : state === "ready" ? "starting" : state;
  const shell = (
    <AppShell
      registry={registry}
      ui={ui}
      engineState={shellState}
      onRestartEngine={() => void window.huhuHost.restartEngine()}
      vaultName={vaultName}
      statusSlot={
        <>
          <ThemeToggle />
          <NotificationBell />
        </>
      }
      statusBar={<ShellStatusBar ui={ui} />}
      version="0.0.1"
    />
  );
  const client = useMemo(() => (endpoint ? new EngineClient(endpoint) : null), [endpoint]);
  const withFilter = (
    <>
      {shell}
      {endpoint ? <PluginFilter registry={registry} /> : null}
      {endpoint ? <QuickCapture /> : null}
      <CommandPalette registry={registry} ui={ui} client={client} onOpenResult={() => ui.getState().openModule("notes")} />
    </>
  );
  return endpoint ? (
    <EngineProvider endpoint={endpoint}>{withFilter}</EngineProvider>
  ) : (
    <>
      {shell}
      <CommandPalette registry={registry} ui={ui} />
    </>
  );
}

/** 根：先问 Main 当前有没有打开的 Vault；没有就显示启动页，打开成功后重新载入界面（旧 Vault 的缓存与事件随页面一起丢弃）。 */
function Root() {
  const [vault, setVault] = useState<VaultHostState | null>(null);
  useEffect(() => {
    applyAppearance(document.documentElement, { theme: "pearl", mode: "system" }, window.matchMedia("(prefers-color-scheme: dark)").matches);
    window.huhuHost.onFlush(runFlushers);
    void window.huhuHost.vault.state().then(setVault);
  }, []);
  if (!vault) return null;
  if (vault.path === null) return <LaunchPage state={vault} onOpened={() => window.location.reload()} />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
