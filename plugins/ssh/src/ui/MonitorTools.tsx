import { Button, Dialog, PageHead } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useRef, useState } from "react";
import type { MonitorTool, MonitorToolResult } from "../shared/monitoring.js";
import { SshTerminal } from "./SshTerminal.js";

export function MonitorTools({ hostId, shellId, name, onClose }: { hostId: string; shellId: string; name: string; onClose?(): void }) {
  const engine = useEngine();
  const [tool, select] = useState<MonitorTool>("processes");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<MonitorToolResult>();
  const [error, setError] = useState("");
  const [sudo, setSudo] = useState(false);
  const [terminate, setTerminate] = useState<MonitorToolResult["rows"][number]>();
  const [logs, setLogs] = useState<{ name: string; stdout: string; stderr: string }>();
  const [container, setContainer] = useState<{ id: string; name: string }>();
  const [working, setWorking] = useState(false);
  const action = useRef<AbortController>(undefined);
  const containerId = useRef<string>(undefined);

  function closeContainer() {
    const id = containerId.current;
    containerId.current = undefined;
    if (id) void engine.call("ssh.shells.close", { id }, { write: true }).catch(() => undefined);
  }
  useEffect(() => () => {
    action.current?.abort();
    const id = containerId.current;
    if (id) void engine.call("ssh.shells.close", { id }, { write: true }).catch(() => undefined);
  }, [engine]);

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
  async function perform(kind: "terminate" | "logs" | "shell", row: MonitorToolResult["rows"][number]) {
    if (action.current) return;
    const request = new AbortController();
    action.current = request;
    setWorking(true);
    setError("");
    const options = { write: true, signal: request.signal };
    const origin = { hostId, shellId, sudo };
    try {
      if (kind === "terminate") {
        await engine.call("ssh.monitor.tools.process.terminate", { ...origin, pid: Number(row.id), name: row.name }, options);
        setTerminate(undefined);
        read("processes");
      } else if (kind === "logs") {
        const text = await engine.call<{ stdout: string; stderr: string }>("ssh.monitor.tools.container.logs", { ...origin, containerId: row.id }, { signal: request.signal });
        if (!request.signal.aborted) setLogs({ name: row.name, ...text });
      } else {
        const { id } = await engine.call<{ id: string }>("ssh.monitor.tools.container.shell", { ...origin, containerId: row.id }, options);
        closeContainer();
        containerId.current = id;
        if (request.signal.aborted) closeContainer();
        else setContainer({ id, name: row.name });
      }
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : "服务器工具操作失败");
    } finally {
      action.current = undefined;
      setWorking(false);
    }
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
          <Button disabled={working} aria-pressed={sudo} onClick={() => {
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
                {current.tool === "processes" && Number(row.id) > 1 && (
                  <Button variant="danger" disabled={working} aria-label={`终止进程 ${row.name} ${row.id}`} onClick={() => { setError(""); setTerminate(row); }}>终止进程</Button>
                )}
                {current.tool === "containers" && (
                  <>
                    <Button disabled={working} aria-label={`容器日志 ${row.name}`} onClick={() => void perform("logs", row)}>日志</Button>
                    <Button disabled={working} aria-label={`容器终端 ${row.name}`} onClick={() => void perform("shell", row)}>容器终端</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {terminate && (
          <Dialog open title="确认终止进程" description={name} error={error} onClose={() => { if (!working) setTerminate(undefined); }}
            actions={<>
              <Button autoFocus disabled={working} onClick={() => setTerminate(undefined)}>取消</Button>
              <Button variant="danger" loading={working} onClick={() => void perform("terminate", terminate)}>确认终止</Button>
            </>}
          ><p>向「{terminate.name}」（PID {terminate.id}）发送终止信号。</p></Dialog>
        )}
        {logs && (
          <Dialog open title="容器日志" description={logs.name} onClose={() => setLogs(undefined)}>
            <pre>{[logs.stdout, logs.stderr].filter(Boolean).join("\n") || "没有日志"}</pre>
          </Dialog>
        )}
        {container && (
          <Dialog open title="容器终端" description={container.name} onClose={() => { closeContainer(); setContainer(undefined); }}>
            <div className="ssh-console-panel" style={{ height: "48vh" }}>
              <SshTerminal key={container.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={container.id} ariaLabel="Docker 容器终端" />
            </div>
          </Dialog>
        )}
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
