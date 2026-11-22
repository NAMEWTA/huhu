import { Button } from "@huhu/ui";
import { queryKey, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { splitTree, type ChangeWorkspaceRun, type WorkspaceLayout, type WorkspaceRun, type WorkspaceRunPane } from "../shared/workspace.js";
import { LAYOUT_LABELS } from "./WorkspaceLayout.js";
import { WorkspaceCanvas } from "./WorkspaceCanvas.js";
import { AttachedFiles } from "./FileWorkspace.js";
import type { FileSession } from "../shared/files.js";
import { MonitorSidebar } from "./MonitorSidebar.js";
import { SshTerminal } from "./SshTerminal.js";
import { useDevicePreferences } from "./device-preferences.js";
import { AuthenticationDialog } from "./AuthenticationDialog.js";
import { TerminalActions } from "./TerminalActions.js";
import type { TerminalInput } from "../shared/terminal-actions.js";
import { RecordTerminal } from "./TerminalRecordings.js";

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
  onTrust,
  onOpenFiles,
}: {
  run: WorkspaceRun;
  shown: boolean;
  onTrust: (prompt: NonNullable<WorkspaceRunPane["prompt"]>, accept: boolean) => Promise<void>;
  onOpenFiles: (session: FileSession) => void;
}) {
  const engine = useEngine();
  const { endpoint } = engine;
  const qc = useQueryClient();
  const { paneTools, showPaneFiles, tabs } = useDevicePreferences();
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [authentication, setAuthentication] = useState<string>();
  const [active, setActive] = useState(run.panes[0]?.paneId);
  const [maximized, setMaximized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, TerminalInput>>({});
  const [inputCallbacks] = useState(() => new Map<string, (input: TerminalInput | undefined) => void>());
  const [showFiles, setShowFiles] = useState(showPaneFiles && paneTools !== "hidden");
  const [showMonitor, setShowMonitor] = useState(false);
  const [dock, setDock] = useState<"left" | "right">("right");
  const activePane = run.panes.find(({ paneId }) => paneId === active) ?? run.panes[0];
  const activeIndex = run.panes.indexOf(activePane!);
  const query = queryKey(engine.vaultId, "ssh.workspace.runs.list", {});
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
  const visiblePanes = shown ? run.panes.filter((pane) => (!(maximized || run.layout.kind === "tabs") || pane.paneId === activePane?.paneId) && pane.phase === "ready" && pane.sessionId) : [];
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
    <section data-testid="ssh-workspace-run" data-run-id={run.id} data-generation={run.generation} aria-label="工作区分栏">
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
      {shown && <TerminalActions targets={targetInputs} />}
      <div className={showMonitor ? "ssh-monitor-grid" : undefined} data-dock={dock}>
        <div className={showMonitor ? "ssh-monitor-terminal" : undefined}>
          <WorkspaceCanvas
            layout={run.layout}
            panes={run.panes}
            active={activePane?.paneId}
            maximized={maximized}
            tabs={tabs}
            onActive={setActive}
            onSwap={swap}
            render={(pane) => {
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
              const toolbar = pane.phase === "ready" && (
                <div className="ssh-workspace-controls" data-testid="ssh-pane-tools" data-position={paneTools}>
                  <Button
                    onClick={() => {
                      setActive(pane.paneId);
                      setShowFiles(true);
                    }}
                  >
                    分栏文件
                  </Button>
                  <Button
                    onClick={() => {
                      setActive(pane.paneId);
                      setShowMonitor(true);
                    }}
                  >
                    分栏监控
                  </Button>
                </div>
              );
              return (
                <article className="ssh-workspace-run-pane" data-testid="ssh-workspace-run-pane" data-pane-id={pane.paneId} data-session-id={pane.sessionId} data-phase={pane.phase} key={pane.paneId} aria-label={pane.label}>
                  <header className="ssh-workspace-controls">
                    <strong>{pane.label}</strong>
                    <span role="status">{PHASES[pane.phase]}</span>
                    {pane.phase === "ready" && (
                      <Button aria-pressed={Boolean(locked[pane.paneId])} onClick={() => setLocked((current) => ({ ...current, [pane.paneId]: !current[pane.paneId] }))}>
                        {locked[pane.paneId] ? "解除输入锁定" : "锁定输入"}
                      </Button>
                    )}
                    {pane.phase === "ready" && pane.sessionId && <RecordTerminal shellId={pane.sessionId} />}
                    {paneTools === "top" && toolbar}
                  </header>
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
                  {pane.phase === "ready" && pane.sessionId && (
                    <div className="ssh-workspace-terminal">
                      <SshTerminal
                        key={pane.sessionId}
                        ariaLabel={`${pane.label} 终端`}
                        baseUrl={endpoint.baseUrl}
                        token={endpoint.token}
                        sessionId={pane.sessionId}
                        observe={Boolean(locked[pane.paneId])}
                        onTerminalInput={inputCallback(pane.sessionId)}
                      />
                    </div>
                  )}
                  {paneTools === "bottom" && toolbar}
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
