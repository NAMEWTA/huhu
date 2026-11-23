import { APPEARANCE_CHANGED, appearanceController, Button, EmptyState, useWorkbenchFeedback, WorkbenchToaster } from "@huhu/ui";
import { checkExitParticipants, runFlushers, LaunchPage, WindowTitleBar, type EngineEndpoint, type VaultHostState } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { exitSaveMessage, isExitSaveReceipt, type PrepareExit, type ReleaseExit } from "../exit-ipc.js";
import { WorkbenchApp, type EngineState } from "./workbench.js";

// 首帧：用 localStorage 里缓存的最近一次外观（没有就是默认主题 + 跟随系统），打开 Vault 后再以 Vault 的设置为准
appearanceController().refresh();
syncWindowChromeColors();

function syncWindowChromeColors() {
  const chrome = window.huhuHost?.windowChrome;
  if (!chrome) return;
  const root = getComputedStyle(document.documentElement);
  void chrome
    .setColors({
      background: root.getPropertyValue("--sidebar").trim(),
      foreground: root.getPropertyValue("--text").trim(),
      canvas: root.getPropertyValue("--bg").trim(),
    })
    .catch(() => undefined);
}

function subscribeWindowChromeColors() {
  window.addEventListener(APPEARANCE_CHANGED, syncWindowChromeColors);
  syncWindowChromeColors();
  return () => window.removeEventListener(APPEARANCE_CHANGED, syncWindowChromeColors);
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

  return <WorkbenchApp endpoint={endpoint} state={state} version={version} onRestartEngine={() => void window.huhuHost.restartEngine()} />;
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
    const summary = await runFlushers();
    return signal.aborted ? "stay" : summary;
  };
  const unsubscribe = window.huhuHost.onExit(prepare, release);
  return () => {
    unsubscribe();
    if (active) release(active.id);
  };
}

function ExitSaveFeedback({ vaultPath }: { vaultPath: string }) {
  const feedback = useWorkbenchFeedback("exit-save");
  useEffect(() => {
    let active = true;
    void window.huhuHost
      .readExitSave(vaultPath)
      .then((summary) => {
        if (!active || !isExitSaveReceipt(summary)) return;
        const message = exitSaveMessage(summary);
        if (!message) return;
        const acknowledge = () => {
          if (active) void window.huhuHost.acknowledgeExitSave(vaultPath, summary.id).catch(() => undefined);
        };
        feedback(message, "info", { duration: 7000, onDismiss: acknowledge, onAutoClose: acknowledge });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [feedback, vaultPath]);
  return <WorkbenchToaster scope="exit-save" />;
}

/** 根：先问 Main 当前有没有打开的 Vault；没有就显示启动页，打开成功后重新载入界面（旧 Vault 的缓存与事件随页面一起丢弃）。 */
function DesktopRoot() {
  const [vault, setVault] = useState<VaultHostState | "loading" | "failed">("loading");
  useEffect(connectWindowExit, []);
  useEffect(subscribeWindowChromeColors, []);
  useEffect(() => {
    void window.huhuHost.vault.state().then(setVault, () => setVault("failed"));
  }, []);
  if (typeof vault === "string") {
    return (
      <div className="shell-vault-launch">
        <WindowTitleBar />
        <EmptyState title={vault === "loading" ? "正在读取 Vault…" : "无法读取 Vault 状态"} action={vault === "failed" ? <Button onClick={() => location.reload()}>重新加载工作台</Button> : undefined} />
      </div>
    );
  }
  if (vault.path === null) return <LaunchPage state={vault} onOpened={() => window.location.reload()} />;
  return (
    <>
      <DesktopApp />
      <ExitSaveFeedback vaultPath={vault.path} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<DesktopRoot />);
