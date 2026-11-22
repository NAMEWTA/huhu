import { Button, type TerminalConnection, type TerminalInput } from "@huhu/ui";
import { host, queryKey, useEngine, useQueryClient, type SshWorkspacePaneAddress } from "@huhu/workbench";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { splitTree, type ChangeWorkspaceRun, type WorkspaceLayout, type WorkspaceRun, type WorkspaceRunPane } from "../shared/workspace.js";
import { LAYOUT_LABELS } from "./WorkspaceLayout.js";
import { WorkspaceCanvas } from "./WorkspaceCanvas.js";
import { WorkspacePaneTools } from "./WorkspacePaneTools.js";
import { AttachedFiles } from "./FileWorkspace.js";
import type { FileSession } from "../shared/files.js";
import type { ConnectionStatus } from "../shared/trust.js";
import { MonitorSidebar } from "./MonitorSidebar.js";
import { SshTerminal } from "./SshTerminal.js";
import { deviceDefaults, saveDevicePreferences, useDevicePreferences, type DevicePreferences } from "./device-preferences.js";
import { AuthenticationDialog } from "./AuthenticationDialog.js";
import { TerminalActions } from "./TerminalActions.js";
import { RecordTerminal } from "./TerminalRecordings.js";
import { moveWorkspacePane, sameWorkspacePane } from "./workspace-window.js";

const PHASES: Record<WorkspaceRunPane["phase"], string> = {
  reconnect: "等待重连",
  connecting: "连接中",
  trust: "等待主机密钥确认",
  authentication: "等待交互认证",
  ready: "已连接",
  failed: "连接失败",
  ended: "会话已结束",
};

export function WorkspaceRunView({
  run,
  shown,
  connections,
  onTrust,
  onOpenFiles,
}: {
  run: WorkspaceRun;
  shown: boolean;
  connections: readonly ConnectionStatus[];
  onTrust: (prompt: NonNullable<WorkspaceRunPane["prompt"]>, accept: boolean) => Promise<void>;
  onOpenFiles: (session: FileSession) => void;
}) {
  const engine = useEngine();
  const { endpoint } = engine;
  const qc = useQueryClient();
  const { paneTools, paneToolSize, paneToolOrder, groupVerticalTabs, showPaneFiles, tabs } = useDevicePreferences();
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [authentication, setAuthentication] = useState<string>();
  const [active, setActive] = useState(run.panes[0]?.paneId);
  const [maximized, setMaximized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [deviceNotice, setDeviceNotice] = useState("");
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, TerminalInput>>({});
  const [inputCallbacks] = useState(() => new Map<string, (input: TerminalInput | undefined) => void>());
  const windows = run.source === "external" ? undefined : host()?.workspaceWindow;
  const [windowPanes, setWindowPanes] = useState<SshWorkspacePaneAddress[] | null>(windows ? null : []);
  const [windowStatus, setWindowStatus] = useState("");
  const [moving, setMoving] = useState<{ paneId: string; committing: boolean }>();
  const activeMove = useRef<AbortController | undefined>(undefined);
  const lastMoveTrigger = useRef<{ element: HTMLButtonElement; paneId: string } | undefined>(undefined);
  const section = useRef<HTMLElement>(null);
  const terminalConnections = useRef(new Map<string, TerminalConnection>());
  const [connectionCallbacks] = useState(() => new Map<string, (connection: TerminalConnection | undefined) => void>());
  const [showFiles, setShowFiles] = useState(showPaneFiles && paneTools !== "hidden");
  const [showMonitor, setShowMonitor] = useState(false);
  const [dock, setDock] = useState<"left" | "right">("right");
  const activePane = run.panes.find(({ paneId }) => paneId === active) ?? run.panes[0];
  const activeIndex = run.panes.indexOf(activePane!);
  const query = queryKey(engine.vaultId, "ssh.workspace.runs.list", {});

  useEffect(() => {
    if (!windows) return;
    let revision = 0;
    let active = true;
    const refresh = () => {
      const request = ++revision;
      void windows.moved().then(
        (entries) => {
          if (active && request === revision) setWindowPanes(entries);
        },
        () => {
          if (active && request === revision) setWindowStatus("无法读取分栏的窗口位置。请重新打开工作区。");
        },
      );
    };
    const stop = windows.onChange(refresh);
    refresh();
    return () => {
      active = false;
      stop();
    };
  }, [windows]);

  useLayoutEffect(() => {
    const trigger = lastMoveTrigger.current;
    if (!shown || !trigger || trigger.element.isConnected) return;
    lastMoveTrigger.current = undefined;
    if (document.hasFocus() && document.activeElement === document.body) {
      section.current?.querySelector<HTMLElement>(`[data-workspace-spot="${CSS.escape(trigger.paneId)}"]:not([hidden])`)?.focus();
    }
  }, [windowPanes, shown]);

  function address(pane: WorkspaceRunPane): SshWorkspacePaneAddress | undefined {
    if (pane.sessionId) return { vaultId: engine.vaultId, runId: run.id, generation: run.generation, paneId: pane.paneId, sessionId: pane.sessionId };
  }

  function inAnotherWindow(pane: WorkspaceRunPane) {
    const target = address(pane);
    return !!target && windowPanes?.some((entry) => sameWorkspacePane(entry, target)) === true;
  }

  function connectionCallback(sessionId: string) {
    let callback = connectionCallbacks.get(sessionId);
    if (!callback) {
      callback = (connection) => {
        if (connection) terminalConnections.current.set(sessionId, connection);
        else terminalConnections.current.delete(sessionId);
      };
      connectionCallbacks.set(sessionId, callback);
    }
    return callback;
  }

  async function movePane(pane: WorkspaceRunPane, element: HTMLButtonElement) {
    if (!windows || activeMove.current) return;
    const target = address(pane);
    const connection = target && terminalConnections.current.get(target.sessionId);
    if (!target || !connection) {
      setWindowStatus("请等终端附着后再换窗。");
      return;
    }
    const cancellation = new AbortController();
    activeMove.current = cancellation;
    lastMoveTrigger.current = { element, paneId: pane.paneId };
    setMoving({ paneId: pane.paneId, committing: false });
    setWindowStatus("");
    try {
      await moveWorkspacePane(windows, target, connection, cancellation.signal, () => setMoving({ paneId: pane.paneId, committing: true }));
    } catch (error) {
      lastMoveTrigger.current = undefined;
      setWindowStatus(cancellation.signal.aborted ? "已取消换窗。" : error instanceof Error ? error.message : "无法移动分栏，请重试。");
      if (element.isConnected && document.hasFocus() && document.activeElement === document.body) element.focus();
    } finally {
      activeMove.current = undefined;
      setMoving(undefined);
    }
  }
  function setDeviceLayout(patch: Partial<DevicePreferences>, message = "已保存本机布局。") {
    try {
      saveDevicePreferences(patch);
      setDeviceNotice(message);
      return true;
    } catch {
      setDeviceNotice("无法保存本机布局，请检查设备存储。");
      return false;
    }
  }
  async function apply(change: ChangeWorkspaceRun["change"]) {
    if (saving) return;
    setSaving(true);
    setLayoutError("");
    try {
      const next = await engine.call<WorkspaceRun>("ssh.workspace.runs.changeLayout", { id: run.id, expectedLayoutRevision: run.layoutRevision ?? run.id, change }, { write: true });
      qc.setQueryData<WorkspaceRun[]>(query, (value) => value?.map((item) => (item.id === next.id ? next : item)));
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "无法保存分栏布局。");
    } finally {
      await qc.invalidateQueries({ queryKey: query });
      setSaving(false);
    }
  }
  function relayout(layout: WorkspaceLayout, paneIds = run.panes.map(({ paneId }) => paneId)) {
    void apply({ action: "layout", layout, paneIds });
  }
  function swap(from: string, to: string) {
    const ids = run.panes.map(({ paneId }) => paneId);
    const first = ids.indexOf(from);
    const second = ids.indexOf(to);
    if (first < 0 || second < 0 || first === second) return;
    [ids[first], ids[second]] = [ids[second]!, ids[first]!];
    relayout(run.layout, ids);
  }
  const tree = run.layout.kind === "custom" ? run.layout.tree : undefined;
  const visiblePanes = shown && windowPanes ? run.panes.filter((pane) => (!(maximized || run.layout.kind === "tabs") || pane.paneId === activePane?.paneId) && pane.phase === "ready" && pane.sessionId && !inAnotherWindow(pane)) : [];
  const targetInputs = visiblePanes.map((pane) => ({ id: pane.paneId, label: pane.label, sessionId: pane.sessionId!, send: locked[pane.paneId] ? undefined : inputs[pane.sessionId!] }));
  function inputCallback(sessionId: string) {
    let send = inputCallbacks.get(sessionId);
    if (!send) {
      send = (input) =>
        setInputs((current) => {
          if (current[sessionId] === input) return current;
          const next = { ...current };
          if (input) next[sessionId] = input;
          else delete next[sessionId];
          return next;
        });
      inputCallbacks.set(sessionId, send);
    }
    return send;
  }
  return (
    <section ref={section} data-testid="ssh-workspace-run" data-run-id={run.id} data-generation={run.generation} aria-label="工作区分栏" inert={!shown}>
      <p>连接代次 {run.generation}</p>
      <div className="ssh-workspace-controls">
        <label className="row">
          运行布局
          <select
            value={run.layout.kind}
            disabled={saving}
            onChange={(event) => {
              const kind = event.currentTarget.value as WorkspaceLayout["kind"];
              relayout(kind === "custom" ? { kind, tree: splitTree(run.panes.length) } : { kind });
            }}
          >
            {Object.entries(LAYOUT_LABELS).map(([kind, label]) => (
              <option value={kind} key={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {tree?.kind === "split" && (
          <>
            <Button disabled={saving} onClick={() => relayout({ kind: "custom", tree: { ...tree, axis: tree.axis === "row" ? "column" : "row" } })}>
              切换分割方向
            </Button>
            <Button disabled={saving || tree.firstPercent <= 10} onClick={() => relayout({ kind: "custom", tree: { ...tree, firstPercent: Math.max(10, tree.firstPercent - 5) } })}>
              缩小首个分区
            </Button>
            <Button disabled={saving || tree.firstPercent >= 90} onClick={() => relayout({ kind: "custom", tree: { ...tree, firstPercent: Math.min(90, tree.firstPercent + 5) } })}>
              放大首个分区
            </Button>
          </>
        )}
        {activePane && (
          <>
            <Button onClick={() => setMaximized(!maximized)}>{maximized ? "还原分栏" : "最大化活动分栏"}</Button>
            <Button disabled={saving || activeIndex < 1} onClick={() => swap(activePane.paneId, run.panes[activeIndex - 1]!.paneId)}>
              与前一分栏交换
            </Button>
            <Button disabled={saving || activeIndex >= run.panes.length - 1} onClick={() => swap(activePane.paneId, run.panes[activeIndex + 1]!.paneId)}>
              与后一分栏交换
            </Button>
            <Button disabled={saving || run.panes.length < 2} onClick={() => void apply({ action: "close", paneId: activePane.paneId })}>
              关闭活动分栏
            </Button>
          </>
        )}
      </div>
      {layoutError && <p role="alert">{layoutError}</p>}
      <details className="hu-card-alt hu-stack">
        <summary>本机布局偏好</summary>
        <div className="ssh-workspace-controls">
          <label className="hu-field">
            分栏工具栏位置
            <select value={paneTools} onChange={(event) => setDeviceLayout({ paneTools: event.currentTarget.value as DevicePreferences["paneTools"] })}>
              <option value="top">上方</option>
              <option value="bottom">下方</option>
              <option value="hidden">隐藏</option>
            </select>
          </label>
          <label className="hu-field">
            工具栏顺序
            <select value={paneToolOrder} onChange={(event) => setDeviceLayout({ paneToolOrder: event.currentTarget.value as DevicePreferences["paneToolOrder"] })}>
              <option value="files-first">文件、监控</option>
              <option value="monitor-first">监控、文件</option>
            </select>
          </label>
          <label className="hu-field">
            工具栏尺寸
            <select value={paneToolSize} onChange={(event) => setDeviceLayout({ paneToolSize: event.currentTarget.value as DevicePreferences["paneToolSize"] })}>
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
          </label>
          <Button onClick={() => setDeviceLayout({ paneTools: deviceDefaults.paneTools, paneToolOrder: deviceDefaults.paneToolOrder, paneToolSize: deviceDefaults.paneToolSize }, "已恢复工具栏默认布局。")}>恢复工具栏默认布局</Button>
        </div>
        <div className="ssh-workspace-controls">
          <label className="hu-field">
            工作区标签方向
            <select value={tabs} onChange={(event) => setDeviceLayout({ tabs: event.currentTarget.value === "left" ? "left" : "top" })}>
              <option value="top">上方</option>
              <option value="left">左侧</option>
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={groupVerticalTabs} disabled={tabs !== "left"} onChange={(event) => setDeviceLayout({ groupVerticalTabs: event.currentTarget.checked })} />
            纵向标签按同目标分组
          </label>
        </div>
      </details>
      <div role="status">{deviceNotice}</div>
      <div role="status">{windowStatus}</div>
      {shown && <TerminalActions targets={targetInputs} activeTargetId={activePane?.paneId} />}
      <div className={showMonitor ? "ssh-monitor-grid" : undefined} data-dock={dock}>
        <div className={showMonitor ? "ssh-monitor-terminal" : undefined}>
          <WorkspaceCanvas
            layout={run.layout}
            panes={run.panes}
            active={activePane?.paneId}
            maximized={maximized}
            tabs={tabs}
            groupVerticalTabs={groupVerticalTabs}
            connections={connections}
            onActive={setActive}
            onSwap={swap}
            render={(pane, visible) => {
              const moved = inAnotherWindow(pane);
              const prompt = pane.prompt;
              const decidingKey = prompt ? `${prompt.attemptId}:${prompt.hop}` : "";
              async function decide(accept: boolean) {
                if (!prompt) return;
                setDeciding((state) => ({ ...state, [decidingKey]: true }));
                try {
                  await onTrust(prompt, accept);
                } finally {
                  setDeciding((state) => ({ ...state, [decidingKey]: false }));
                }
              }
              return (
                <article className="ssh-workspace-run-pane" data-testid="ssh-workspace-run-pane" data-pane-id={pane.paneId} data-session-id={pane.sessionId} data-phase={pane.phase} key={pane.paneId} aria-label={pane.label}>
                  <header className="ssh-workspace-controls">
                    <strong>{pane.label}</strong>
                    <span role="status">{PHASES[pane.phase]}</span>
                    {pane.phase === "ready" && !moved && (
                      <Button aria-pressed={Boolean(locked[pane.paneId])} onClick={() => setLocked((current) => ({ ...current, [pane.paneId]: !current[pane.paneId] }))}>
                        {locked[pane.paneId] ? "解除输入锁定" : "锁定输入"}
                      </Button>
                    )}
                    {pane.phase === "ready" && pane.sessionId && !moved && <RecordTerminal shellId={pane.sessionId} />}
                    {windows && windowPanes && visible && pane.phase === "ready" && pane.sessionId && !moved && (
                      <>
                        <Button type="button" aria-label={`将${pane.label}移至新窗口`} aria-disabled={!!moving} onClick={(event) => void movePane(pane, event.currentTarget)}>
                          移至新窗口
                        </Button>
                        {moving?.paneId === pane.paneId && !moving.committing && (
                          <Button type="button" onClick={() => activeMove.current?.abort()}>
                            取消换窗
                          </Button>
                        )}
                      </>
                    )}
                  </header>
                  {moved && (
                    <p role="status" data-testid="ssh-workspace-pane-moved">
                      已移至另一窗口
                    </p>
                  )}
                  {pane.error && <p role="alert">{pane.error.message}</p>}
                  {prompt && (
                    <div className="ssh-workspace-trust">
                      <p>
                        第 {prompt.hop + 1} 跳主机密钥{" "}
                        <code>
                          {prompt.keyType} {prompt.fingerprint}
                        </code>
                      </p>
                      <div className="ssh-workspace-controls">
                        <Button disabled={deciding[decidingKey]} onClick={() => void decide(true)}>
                          信任并连接
                        </Button>
                        <Button disabled={deciding[decidingKey]} onClick={() => void decide(false)}>
                          拒绝密钥
                        </Button>
                      </div>
                    </div>
                  )}
                  {pane.authPrompt && <Button onClick={() => setAuthentication(pane.authPrompt?.promptId)}>继续交互认证</Button>}
                  {shown && pane.authPrompt && authentication === pane.authPrompt.promptId && (
                    <AuthenticationDialog key={authentication} prompt={pane.authPrompt} onClose={() => setAuthentication(undefined)} onAnswered={() => setAuthentication(undefined)} />
                  )}
                  {pane.phase === "ready" && !moved && windowPanes && (
                    <WorkspacePaneTools
                      paneId={pane.paneId}
                      label={pane.label}
                      visible={shown && visible}
                      position={paneTools}
                      size={paneToolSize}
                      order={paneToolOrder}
                      onMove={(dock) => setDeviceLayout({ paneTools: dock }, `已将工具栏移至分栏${dock === "top" ? "上方" : "下方"}。`)}
                      onStatus={setDeviceNotice}
                      onFiles={() => {
                        setActive(pane.paneId);
                        setShowFiles(true);
                      }}
                      onMonitor={() => {
                        setActive(pane.paneId);
                        setShowMonitor(true);
                      }}
                    >
                      {pane.sessionId && (
                        <div key="terminal" className="ssh-workspace-terminal">
                          <SshTerminal
                            key={pane.sessionId}
                            ariaLabel={`${pane.label} 终端`}
                            baseUrl={endpoint.baseUrl}
                            token={endpoint.token}
                            sessionId={pane.sessionId}
                            observe={Boolean(locked[pane.paneId])}
                            onTerminalInput={inputCallback(pane.sessionId)}
                            {...(windows ? { onTerminalConnection: connectionCallback(pane.sessionId) } : {})}
                          />
                        </div>
                      )}
                    </WorkspacePaneTools>
                  )}
                </article>
              );
            }}
          />
        </div>
        {showMonitor &&
          (activePane?.phase === "ready" && activePane.sessionId ? (
            <MonitorSidebar key={activePane.sessionId} hostId={activePane.hostId} shellId={activePane.sessionId} name={activePane.label} shown={shown} dock={dock} onDock={setDock} onClose={() => setShowMonitor(false)} />
          ) : (
            <aside className="ssh-monitor-side hu-stack" aria-label="活动分栏监控">
              <p role="status">活动分栏的原连接已关闭或尚未就绪。</p>
              <Button onClick={() => setShowMonitor(false)}>关闭监控</Button>
            </aside>
          ))}
      </div>
      {shown &&
        showFiles &&
        activePane &&
        (activePane.phase === "ready" && activePane.sessionId ? (
          <AttachedFiles key={activePane.sessionId} hostId={activePane.hostId} shellId={activePane.sessionId} onOpen={onOpenFiles} title={`活动分栏文件 · ${activePane.label}`} followDirectory />
        ) : (
          <p role="status">{activePane.label}的连接尚未就绪</p>
        ))}
    </section>
  );
}
