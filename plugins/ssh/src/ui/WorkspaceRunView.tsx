import { Button } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { WorkspaceRun, WorkspaceRunPane } from "../shared/workspace.js";
import { WorkspaceLayout } from "./WorkspaceLayout.js";
import { AttachedFiles } from "./FileWorkspace.js";
import type { FileSession } from "../shared/files.js";
import { MonitorSidebar } from "./MonitorSidebar.js";
import { SshTerminal } from "./SshTerminal.js";
import { useDevicePreferences } from "./device-preferences.js";

const PHASES: Record<WorkspaceRunPane["phase"], string> = {
  reconnect: "等待重连",
  connecting: "连接中",
  trust: "等待主机密钥确认",
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
  const { endpoint } = useEngine();
  const { paneTools, showPaneFiles } = useDevicePreferences();
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState(0);
  const [showFiles, setShowFiles] = useState(showPaneFiles && paneTools !== "hidden");
  const [showMonitor, setShowMonitor] = useState(false);
  const [dock, setDock] = useState<"left" | "right">("right");
  const activePane = run.panes[active];
  return (
    <section data-testid="ssh-workspace-run" data-run-id={run.id} data-generation={run.generation} aria-label="工作区分栏">
      <p>连接代次 {run.generation}</p>
      <div className={showMonitor ? "ssh-monitor-grid" : undefined} data-dock={dock}>
        <div className={showMonitor ? "ssh-monitor-terminal" : undefined}>
          <WorkspaceLayout
            layout={run.layout}
            active={active}
            onActive={setActive}
            labels={run.panes.map(({ label }) => label)}
            pane={(index) => {
              const pane = run.panes[index]!;
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
                      setActive(index);
                      setShowFiles(true);
                    }}
                  >
                    分栏文件
                  </Button>
                  <Button
                    onClick={() => {
                      setActive(index);
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
                  {pane.phase === "ready" && pane.sessionId && (
                    <div className="ssh-workspace-terminal">
                      <SshTerminal key={pane.sessionId} ariaLabel={`${pane.label} 终端`} baseUrl={endpoint.baseUrl} token={endpoint.token} sessionId={pane.sessionId} />
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
      {showFiles &&
        activePane &&
        (activePane.phase === "ready" && activePane.sessionId ? (
          <AttachedFiles key={activePane.sessionId} hostId={activePane.hostId} shellId={activePane.sessionId} onOpen={onOpenFiles} title={`活动分栏文件 · ${activePane.label}`} />
        ) : (
          <p role="status">{activePane.label}的连接尚未就绪</p>
        ))}
    </section>
  );
}
