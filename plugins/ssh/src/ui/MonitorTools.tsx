import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useState } from "react";
import type { MonitorTool, MonitorToolResult } from "../shared/monitoring.js";

export function MonitorTools({ hostId, shellId, name, onClose }: { hostId: string; shellId: string; name: string; onClose(): void }) {
  const engine = useEngine();
  const [tool, select] = useState<MonitorTool>("processes");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<MonitorToolResult>();
  const [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    void engine.call<MonitorToolResult>("ssh.monitor.tools.read", { hostId, shellId, tool }, { write: true, signal: request.signal }).then(
      (value) => {
        if (!request.signal.aborted) setResult(value);
      },
      (cause: unknown) => {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取服务器状态");
      },
    );
    return () => request.abort();
  }, [engine, hostId, shellId, tool, refresh]);
  const current = result?.tool === tool ? result : undefined;
  function read(next: MonitorTool) {
    setError("");
    setResult(undefined);
    if (next === tool) setRefresh((value) => value + 1);
    else select(next);
  }
  return (
    <Dialog open title="服务器工具" description={name} error={error} onClose={onClose} actions={<Button onClick={() => read(tool)}>刷新</Button>}>
      <div className="hu-stack">
        <div className="ssh-workspace-controls">
          <Button aria-pressed={tool === "processes"} onClick={() => read("processes")}>
            进程
          </Button>
          <Button aria-pressed={tool === "containers"} onClick={() => read("containers")}>
            容器
          </Button>
        </div>
        {current?.message && <p role="alert">{current.message}</p>}
        {current?.state === "ready" && current.rows.length === 0 && <p role="status">没有可读取的条目</p>}
        {current?.rows.length ? (
          <ul>
            {current.rows.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code> {row.name}
                {row.detail && ` · ${row.detail}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
