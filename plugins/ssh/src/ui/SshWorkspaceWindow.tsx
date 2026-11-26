import { Button, PageHead } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useRef, useState } from "react";
import type { SshWorkspaceWindowTarget } from "../shared/terminal-window.js";
import type { WorkspaceRun } from "../shared/workspace.js";
import { SshTerminal } from "./SshTerminal.js";
import { terminalHost } from "./SshTerminalWindow.js";
import { WorkspaceCanvas } from "./WorkspaceCanvas.js";
import { useDevicePreferences } from "./device-preferences.js";

export function SshWorkspaceWindow({ target }: { target: SshWorkspaceWindowTarget }) {
  const runs = useCapability<WorkspaceRun[]>("ssh.workspace.runs.list", {});
  const run = runs.data?.find(({ id }) => id === target.runId);
  if (!run || (run.layoutRevision ?? run.id) !== target.layoutRevision ||
      !run.panes.some(({ paneId }) => paneId === target.focusedPaneId) ||
      !run.panes.every(({ phase, sessionId }) => phase === "ready" && sessionId)) return null;
  return <MovedWorkspace run={run} target={target} />;
}

function MovedWorkspace({ run, target }: { run: WorkspaceRun; target: SshWorkspaceWindowTarget }) {
  const { endpoint } = useEngine();
  const { tabs } = useDevicePreferences();
  const [active, setActive] = useState(target.focusedPaneId);
  const controlled = useRef(new Set<string>());
  const announced = useRef(false);
  const desktop = terminalHost();
  const restore = () => { void desktop?.returnSshWorkspaceWindow(target.handoffId, active).catch(() => undefined); };

  return (
    <main className="ssh-pad ssh-workspace-native-window" data-testid="ssh-workspace-window" data-run-id={run.id}
      data-generation={run.generation} data-layout-revision={target.layoutRevision}>
      <PageHead title={run.name} actions={<Button type="button" onClick={restore}>将工作区移回</Button>} />
      <WorkspaceCanvas
        layout={run.layout}
        panes={run.panes}
        active={active}
        maximized={target.maximized}
        tabs={tabs}
        groupVerticalTabs={false}
        collapseVerticalGroups={false}
        connections={[]}
        layoutRevision={target.layoutRevision}
        resizingDisabled
        onActive={setActive}
        onSwap={() => undefined}
        onResize={async () => undefined}
        tabActions={() => []}
        render={(pane) => (
          <article className="ssh-workspace-run-pane" data-testid="ssh-workspace-run-pane" data-pane-id={pane.paneId} data-session-id={pane.sessionId} aria-label={pane.label}>
            <header><strong>{pane.label}</strong></header>
            <div className="ssh-workspace-terminal">
              <SshTerminal sessionId={pane.sessionId!} baseUrl={endpoint.baseUrl} token={endpoint.token} ariaLabel={`${pane.label} 终端`}
                attachWhenHidden handoffId={target.handoffId} focusOnHandoff={pane.paneId === target.focusedPaneId}
                onHandoffControl={() => {
                  controlled.current.add(pane.paneId);
                  if (announced.current || controlled.current.size !== run.panes.length) return;
                  announced.current = true;
                  void desktop?.readySshTerminalWindow(target.handoffId).catch(() => undefined);
                }}
                onExit={() => {
                  controlled.current.delete(pane.paneId);
                  if (announced.current) restore();
                }} />
            </div>
          </article>
        )}
      />
    </main>
  );
}
