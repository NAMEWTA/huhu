import "@huhu/ui/tokens.css";
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
import { AppShell, ContributionRegistry, EngineProvider, HealthModule, HomeModule, CommandPalette, EngineClient, GatewayModule, NotificationBell, PluginCenterModule, SettingsModule, useCapability, createUiStore, type EngineEndpoint } from "@huhu/workbench";
import { Blocks, HeartPulse, House, Plug, Settings } from "lucide-react";
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
  const setEndpoint = (e: EngineEndpoint | null) =>
    setEndpointRaw((cur) => (cur && e && cur.baseUrl === e.baseUrl && cur.token === e.token && cur.vaultId === e.vaultId ? cur : e));
  const [state, setState] = useState<EngineState>("starting");
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
    r.register({ modules: [{ id: "home", plugin: "kernel", title: "工作台", group: "primary", order: 0, icon: <House size={18} aria-hidden />, component: HomeModule }] });
    r.register({ modules: [{ id: "health", plugin: "kernel", title: "健康中心", group: "system", order: 50, icon: <HeartPulse size={18} aria-hidden />, component: HealthModule }] });
    r.register({ modules: [{ id: "gateway", plugin: "kernel", title: "能力网关", group: "system", order: 20, icon: <Plug size={18} aria-hidden />, component: GatewayModule }] });
    r.register({ modules: [{ id: "plugins", plugin: "kernel", title: "插件中心", group: "system", order: 10, icon: <Blocks size={18} aria-hidden />, component: PluginCenterModule }] });
    r.register({ modules: [{ id: "settings", plugin: "kernel", title: "设置", group: "system", order: 90, icon: <Settings size={18} aria-hidden />, component: SettingsModule }] });
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
    void window.huhuHost.engine().then((e) => { setEndpoint(e); setState("ready"); });
    return off;
  }, []);

  // 引擎就绪后应用该 Vault 保存的外观设置
  useEffect(() => {
    if (!endpoint) return;
    void fetch(`${endpoint.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability: "settings.get", input: {}, requestId: crypto.randomUUID() }) })
      .then((r) => r.json() as Promise<{ ok: boolean; data?: { appearance: Record<string, unknown> } }>)
      .then((r) => { if (r.ok && r.data) applyAppearance(document.documentElement, r.data.appearance, window.matchMedia("(prefers-color-scheme: dark)").matches); })
      .catch(() => undefined);
  }, [endpoint]);

  const shellState: EngineState = endpoint ? state : state === "ready" ? "starting" : state;
  const shell = <AppShell registry={registry} ui={ui} vaultName={endpoint?.vaultId ?? "HUHU"} engineState={shellState} onRestartEngine={() => void window.huhuHost.restartEngine()} statusSlot={<NotificationBell />} />;
  const client = useMemo(() => (endpoint ? new EngineClient(endpoint) : null), [endpoint]);
  const withFilter = (
    <>
      {shell}
      {endpoint ? <PluginFilter registry={registry} /> : null}
      <CommandPalette registry={registry} ui={ui} client={client} onOpenResult={() => ui.getState().openModule("notes")} />
    </>
  );
  return endpoint ? <EngineProvider endpoint={endpoint}>{withFilter}</EngineProvider> : <>{shell}<CommandPalette registry={registry} ui={ui} /></>;
}

createRoot(document.getElementById("root")!).render(<App />);
