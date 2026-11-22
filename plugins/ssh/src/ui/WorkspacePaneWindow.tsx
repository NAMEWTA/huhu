import type { TerminalConnection } from "@huhu/ui";
import { host, queryKey, useCapability, useEngine, useEngineEvents, useQueryClient, type SshWorkspacePaneAddress, type WorkspaceWindowView } from "@huhu/workbench";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceRun } from "../shared/workspace.js";
import { SshTerminal } from "./SshTerminal.js";
import { attachWorkspacePane, sameWorkspacePane } from "./workspace-window.js";

export function WorkspacePaneWindow({ target }: { target: SshWorkspacePaneAddress }) {
  const windows = host()?.workspaceWindow;
  const engine = useEngine();
  const queries = useQueryClient();
  const [view, setView] = useState<WorkspaceWindowView | null>();
  const runs = useCapability<WorkspaceRun[]>("ssh.workspace.runs.list", {}, { enabled: engine.vaultId === target.vaultId });
  const run = runs.data?.find((entry) => entry.source !== "external" && entry.id === target.runId && entry.generation === target.generation);
  const pane = run?.panes.find((entry) => entry.paneId === target.paneId && entry.sessionId === target.sessionId);

  useEffect(() => {
    if (!windows) return;
    let active = true;
    void windows.view().then(
      (next) => {
        if (active) setView(next && sameWorkspacePane(next.target, target) ? next : null);
      },
      () => {
        if (active) setView(null);
      },
    );
    return () => {
      active = false;
    };
  }, [target, windows]);

  useEngineEvents((event) => {
    if (event.type === "ssh.connectionChanged" || (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-workspace-run")) {
      void queries.invalidateQueries({ queryKey: queryKey(engine.vaultId, "ssh.workspace.runs.list", {}) });
    }
  });

  useEffect(() => {
    if (!windows || !view?.ticket) return;
    if (engine.vaultId !== target.vaultId || runs.isError || (runs.data && pane?.phase !== "ready")) void windows.cancel(view.ticket).catch(() => undefined);
  }, [windows, view, target.vaultId, engine.vaultId, runs.isError, runs.data, pane?.phase]);

  const connected = useCallback(
    (connection: TerminalConnection | undefined) => {
      if (!windows || !view || !connection) return;
      if (view.ticket) attachWorkspacePane(windows, view.ticket, connection);
      else connection.focus();
    },
    [view, windows],
  );

  if (!windows || view === null || engine.vaultId !== target.vaultId) return <p role="status">原分栏已不可用。</p>;
  if (runs.isError) return <p role="alert">无法读取原工作区，请重新打开分栏。</p>;
  if (!view || !runs.data) return <p>正在附着原分栏…</p>;
  if (pane?.phase !== "ready") return <p role="status">原终端已结束，请从 SSH 工作区重新打开。</p>;

  return (
    <article className="ssh-workspace-run-pane" data-testid="ssh-workspace-window" data-pane-id={pane.paneId} data-session-id={target.sessionId} data-generation={target.generation}>
      <header className="ssh-workspace-controls">
        <h1>{pane.label}</h1>
      </header>
      <div className="ssh-workspace-terminal ssh-workspace-window-terminal">
        <SshTerminal
          ariaLabel={`${pane.label} 终端`}
          baseUrl={engine.endpoint.baseUrl}
          token={engine.endpoint.token}
          sessionId={target.sessionId}
          observe={view.observe}
          onTerminalConnection={connected}
          onExit={() => {
            if (view.ticket) void windows.cancel(view.ticket).catch(() => undefined);
          }}
        />
      </div>
    </article>
  );
}
