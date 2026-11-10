import "@huhu/ui/tokens.css";
import "@huhu/workbench/shell.css";
import { applyAppearance } from "@huhu/ui";
import { contributions as archivesUi } from "@huhu/plugin-archives/ui";
import { contributions as inboxUi } from "@huhu/plugin-inbox/ui";
import { contributions as notesUi } from "@huhu/plugin-notes/ui";
import { contributions as safeUi } from "@huhu/plugin-safe/ui";
import { contributions as tasksUi } from "@huhu/plugin-tasks/ui";
import { AppShell, ContributionRegistry, EngineProvider, createUiStore, type EngineEndpoint } from "@huhu/workbench";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type EngineState = "starting" | "ready" | "stopped" | "crashed";

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
    return r;
  }, []);
  const ui = useMemo(() => createUiStore({ activeModule: "tasks", openTabs: ["tasks"] }), []);

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

  const shellState: EngineState = endpoint ? state : state === "ready" ? "starting" : state;
  const shell = <AppShell registry={registry} ui={ui} vaultName={endpoint?.vaultId ?? "HUHU"} engineState={shellState} onRestartEngine={() => void window.huhuHost.restartEngine()} />;
  return endpoint ? <EngineProvider endpoint={endpoint}>{shell}</EngineProvider> : shell;
}

createRoot(document.getElementById("root")!).render(<App />);
