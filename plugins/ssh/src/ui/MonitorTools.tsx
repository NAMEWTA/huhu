import { Button, Dialog, PageHead } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useState } from "react";
import type { MonitorTool, MonitorToolResult } from "../shared/monitoring.js";

export function MonitorTools({ hostId, shellId, name, onClose }: { hostId: string; shellId: string; name: string; onClose?(): void }) {
  const engine = useEngine();
  const [tool, select] = useState<MonitorTool>("processes");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<MonitorToolResult>();
  const [error, setError] = useState("");
  const [sudo, setSudo] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    void engine.call<MonitorToolResult>("ssh.monitor.tools.read", { hostId, shellId, tool, sudo }, { write: true, signal: request.signal }).then(
      (value) => {
        if (!request.signal.aborted) setResult(value);
      },
      (cause: unknown) => {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取服务器状态");
      },
    );
    return () => request.abort();
  }, [engine, hostId, shellId, tool, refresh, sudo]);
  const current = result?.tool === tool ? result : undefined;
  function read(next: MonitorTool) {
    setError("");
    setResult(undefined);
    if (next === tool) setRefresh((value) => value + 1);
    else select(next);
  }
  const refreshButton = <Button onClick={() => read(tool)}>刷新</Button>;
  const body = (
      <div className="hu-stack">
        <div className="ssh-workspace-controls">
          <Button aria-pressed={tool === "processes"} onClick={() => read("processes")}>
            进程
          </Button>
          <Button aria-pressed={tool === "containers"} onClick={() => read("containers")}>
            容器
          </Button>
          <Button aria-pressed={tool === "images"} onClick={() => read("images")}>
            镜像
          </Button>
          <Button aria-pressed={sudo} onClick={() => {
            setError("");
            setResult(undefined);
            setSudo(!sudo);
          }}>
            工具 sudo
          </Button>
        </div>
        {current?.message && <p role="alert">{current.message}</p>}
        {current?.state === "ready" && <p role="status">{current.rows.length ? `已读取 ${current.rows.length} 条` : "没有可读取的条目"}</p>}
        {current?.rows.length ? (
          <ul>
            {current.rows.map((row) => (
              <li key={`${row.id}:${row.name}`}>
                <code>{row.id}</code> {row.name}
                {row.detail && ` · ${row.detail}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
  );
  if (onClose) return <Dialog open title="服务器工具" description={name} error={error} onClose={onClose} actions={refreshButton}>{body}</Dialog>;
  return (
    <main className="hu-module-layout" data-testid="ssh-tool-window" data-shell-id={shellId}>
      <div className="hu-view-content">
        <PageHead title="服务器工具" />
        <div className="hu-scroll ssh-pad">
          <h2>{name}</h2>
          {refreshButton}
          {error && <p role="alert">{error}</p>}
          {body}
        </div>
      </div>
    </main>
  );
}
