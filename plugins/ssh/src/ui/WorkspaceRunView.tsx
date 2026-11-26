import { Button, Dialog, type TerminalInput } from "@huhu/ui";
import { queryKey, useEngine, useQueryClient } from "@huhu/workbench";
import { useId, useState } from "react";
import { MAX_WORKSPACE_PANES, splitTree, type ChangeWorkbenchWorkspaceRun, type WorkspaceLayout, type WorkspaceRun, type WorkspaceRunPane } from "../shared/workspace.js";
import { LAYOUT_LABELS } from "./WorkspaceLayout.js";
import { WorkspaceCanvas, type WorkspaceTabAction } from "./WorkspaceCanvas.js";
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
  hosts,
  onTrust,
  onOpenFiles,
}: {
  run: WorkspaceRun;
  shown: boolean;
  connections: readonly ConnectionStatus[];
  hosts: readonly { hostId: string; name: string }[];
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
  const [splitHost, setSplitHost] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; label: string }>();
  const renameForm = useId();
  const [layoutError, setLayoutError] = useState("");
  const [deviceNotice, setDeviceNotice] = useState("");
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, TerminalInput>>({});
  const [inputCallbacks] = useState(() => new Map<string, (input: TerminalInput | undefined) => void>());
  const [showFiles, setShowFiles] = useState(showPaneFiles && paneTools !== "hidden");
  const [showMonitor, setShowMonitor] = useState(false);
  const [dock, setDock] = useState<"left" | "right">("right");
  const activePane = run.panes.find(({ paneId }) => paneId === active) ?? run.panes[0];
  const activeIndex = run.panes.indexOf(activePane!);
  const remainingHosts = hosts.filter(({ hostId }) => hostId.startsWith("host-owned-") && !run.panes.some((pane) => pane.hostId === hostId));
  const canSplit = !saving && activePane?.phase !== "reconnect" && remainingHosts.some(({ hostId }) => hostId === splitHost);
  const query = queryKey(engine.vaultId, "ssh.workspace.runs.list", {});
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
  async function apply(change: ChangeWorkbenchWorkspaceRun["change"], revision = run.layoutRevision ?? run.id) {
    if (saving) return;
    setSaving(true);
    setLayoutError("");
    try {
      const next = await engine.call<WorkspaceRun>("ssh.workspace.runs.changeLayout", { id: run.id, expectedLayoutRevision: revision, change }, { write: true });
      if (change.action === "split") {
        const added = next.panes.find(({ hostId }) => hostId === change.hostId);
        if (added) setActive(added.paneId);
      }
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
  function split(axis: "row" | "column") {
    if (!activePane || !canSplit) return;
    setMaximized(false);
    void apply({ action: "split", hostId: splitHost, paneId: activePane.paneId, axis });
  }
  function tabActions(pane: WorkspaceRunPane, order: readonly string[]): WorkspaceTabAction[] {
    const { paneId, label } = pane;
    const index = order.indexOf(paneId);
    const next = order[index + 1];
    const previous = order[index - 1];
    const others = order.filter((id) => id !== paneId);
    const closeOthers = (ids: string[]) => {
      setActive(paneId);
      void apply({ action: "closeMany", paneIds: ids });
    };
    return [
      { label: "重命名标签", disabled: saving, run: () => setRenaming({ id: paneId, label }) },
      { label: locked[paneId] ? "解除输入锁定" : "锁定输入", disabled: pane.phase !== "ready", run: () => setLocked((current) => ({ ...current, [paneId]: !current[paneId] })) },
      { label: "与前一标签交换", disabled: saving || !previous, run: () => { if (previous) swap(paneId, previous); } },
      { label: "与后一标签交换", disabled: saving || !next, run: () => { if (next) swap(paneId, next); } },
      { label: "关闭其他标签", disabled: saving || !others.length, run: () => closeOthers(others) },
      { label: tabs === "left" ? "关闭下方标签" : "关闭右侧标签", disabled: saving || !next, run: () => closeOthers(order.slice(index + 1)) },
      { label: "关闭当前标签", disabled: saving || !others.length, run: () => void apply({ action: "close", paneId }) },
    ];
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
    <section data-testid="ssh-workspace-run" data-run-id={run.id} data-generation={run.generation} aria-label="工作区分栏" inert={!shown}>
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
      {activePane && run.panes.length < MAX_WORKSPACE_PANES && remainingHosts.length > 0 && (
        <div className="ssh-workspace-controls">
          <label className="row">
            新分栏主机
            <select value={remainingHosts.some(({ hostId }) => hostId === splitHost) ? splitHost : ""} disabled={saving || activePane.phase === "reconnect"} onChange={(event) => setSplitHost(event.currentTarget.value)}>
              <option value="">请选择主机</option>
              {remainingHosts.map(({ hostId, name }) => <option key={hostId} value={hostId}>{name}</option>)}
            </select>
          </label>
          <Button type="button" disabled={!canSplit} onClick={() => split("row")}>左右分割活动分栏</Button>
          <Button type="button" disabled={!canSplit} onClick={() => split("column")}>上下分割活动分栏</Button>
        </div>
      )}
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
            layoutRevision={run.layoutRevision ?? run.id}
            resizingDisabled={saving}
            onActive={setActive}
            onSwap={swap}
            onResize={(tree, revision) => apply({ action: "layout", layout: { kind: "custom", tree }, paneIds: run.panes.map(({ paneId }) => paneId) }, revision)}
            tabActions={tabActions}
            render={(pane, visible) => {
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
                    {pane.phase === "ready" && (
                      <Button aria-pressed={Boolean(locked[pane.paneId])} onClick={() => setLocked((current) => ({ ...current, [pane.paneId]: !current[pane.paneId] }))}>
                        {locked[pane.paneId] ? "解除输入锁定" : "锁定输入"}
                      </Button>
                    )}
                    {pane.phase === "ready" && pane.sessionId && <RecordTerminal shellId={pane.sessionId} />}
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
                        <Button disabled={saving || deciding[decidingKey]} onClick={() => void decide(true)}>
                          信任并连接
                        </Button>
                        <Button disabled={saving || deciding[decidingKey]} onClick={() => void decide(false)}>
                          拒绝密钥
                        </Button>
                      </div>
                    </div>
                  )}
                  {pane.authPrompt && <Button onClick={() => setAuthentication(pane.authPrompt?.promptId)}>继续交互认证</Button>}
                  {shown && pane.authPrompt && authentication === pane.authPrompt.promptId && (
                    <AuthenticationDialog key={authentication} prompt={pane.authPrompt} onClose={() => setAuthentication(undefined)} onAnswered={() => setAuthentication(undefined)} />
                  )}
                  {pane.phase === "ready" && (
                    <WorkspacePaneTools
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
      {renaming && shown && (
        <Dialog
          open
          title="重命名标签"
          onClose={() => setRenaming(undefined)}
          actions={<Button type="submit" form={renameForm} disabled={!renaming.label.trim() || saving}>保存名称</Button>}
        >
          <form id={renameForm} method="post" onSubmit={(event) => {
            event.preventDefault();
            if (!renaming.label.trim() || saving) return;
            setRenaming(undefined);
            void apply({ action: "rename", paneId: renaming.id, label: renaming.label });
          }}>
            <label className="hu-field">标签名称<input name="label" value={renaming.label} maxLength={100} required onChange={(event) => setRenaming({ ...renaming, label: event.currentTarget.value })} /></label>
          </form>
        </Dialog>
      )}
    </section>
  );
}
