import { Button, TerminalView } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { WorkspaceRun, WorkspaceRunPane } from "../shared/workspace.js";
import { WorkspaceLayout } from "./WorkspaceLayout.js";

const PHASES: Record<WorkspaceRunPane["phase"], string> = {
  reconnect: "等待重连",
  connecting: "连接中",
  trust: "等待主机密钥确认",
  ready: "已连接",
  failed: "连接失败",
  ended: "会话已结束",
};

export function WorkspaceRunView({ run, onTrust }: { run: WorkspaceRun; onTrust: (prompt: NonNullable<WorkspaceRunPane["prompt"]>, accept: boolean) => Promise<void> }) {
  const { endpoint } = useEngine();
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  return (
    <section data-testid="ssh-workspace-run" data-run-id={run.id} data-generation={run.generation} aria-label="工作区分栏">
      <p>连接代次 {run.generation}</p>
      <WorkspaceLayout
        layout={run.layout}
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
          return (
            <article className="ssh-workspace-run-pane" data-testid="ssh-workspace-run-pane" data-pane-id={pane.paneId} data-session-id={pane.sessionId} data-phase={pane.phase} key={pane.paneId} aria-label={pane.label}>
              <header className="ssh-workspace-controls">
                <strong>{pane.label}</strong>
                <span role="status">{PHASES[pane.phase]}</span>
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
                  <TerminalView key={pane.sessionId} ariaLabel={`${pane.label} 终端`} baseUrl={endpoint.baseUrl} token={endpoint.token} sessionId={pane.sessionId} />
                </div>
              )}
            </article>
          );
        }}
      />
    </section>
  );
}
