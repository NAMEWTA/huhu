import { Button, PageHead } from "@huhu/ui";
import { host as desktopHost, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useState, type FormEvent } from "react";
import { proxyShareText, type ProxyShareStatus } from "../shared/proxy-share.js";
import type { ConnectionStatus } from "../shared/trust.js";
import type { ManagedHost } from "./host-record.js";

const labels: Record<ProxyShareStatus["state"], string> = { idle: "未分享", starting: "正在确认远端监听", running: "分享中", "stop-failed": "等待确认释放远端端口", failed: "启动失败", stopped: "已停止" };

export function ProxySharePanel({ hosts, connections, onBack }: { hosts: ManagedHost[]; connections: ConnectionStatus[]; onBack(): void }) {
  const engine = useEngine();
  const status = useCapability<ProxyShareStatus>("ssh.proxyShare.status", {});
  const refetchStatus = status.refetch;
  useEffect(() => {
    const timer = window.setInterval(() => void refetchStatus(), 2000);
    return () => window.clearInterval(timer);
  }, [refetchStatus]);
  const [target, setTarget] = useState("");
  const [local, setLocal] = useState("7890");
  const [remote, setRemote] = useState("17890");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = status.data && ["starting", "running", "stop-failed"].includes(status.data.state);
  const config = status.data?.config;
  const connected = connections.flatMap((entry) => (entry.state === "connected" && entry.connectionId ? [{ hostId: entry.hostId, connectionId: entry.connectionId }] : []));
  const selection = connected.find(({ hostId }) => hostId === target);
  const examples = status.data?.state === "running" && config ? proxyShareText(config.remotePort) : undefined;

  async function change(operation: "detect" | "start" | "test" | "stop") {
    if (busy || (operation === "start" && !selection)) return;
    setBusy(true);
    setMessage("");
    try {
      const input = operation === "detect" ? { port: Number(local) } : operation === "start" ? { ...selection, localPort: Number(local), remotePort: Number(remote) } : {};
      await engine.call(`ssh.proxyShare.${operation}`, input, { write: true });
      if (operation === "detect") setMessage("本机代理端口已响应。");
      await status.refetch();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "无法更新代理分享。");
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      const desktop = desktopHost();
      if (desktop) await desktop.copyText(text);
      else await navigator.clipboard.writeText(text);
      setMessage("已复制配置文本。");
    } catch {
      setMessage("无法复制配置。");
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void change("start");
  }
  return (
    <section className="hu-view-content">
      <PageHead title="辅助代理分享" description="将此设备的回环 HTTP 代理分享给当前 SSH 主机的回环端口。" actions={<Button onClick={onBack}>返回跳板路由</Button>} />
      <form className="hu-card-alt hu-form-body" onSubmit={submit}>
        <label className="hu-field">
          已连接主机
          <select
            required
            value={target}
            disabled={busy || active}
            onChange={(event) => {
              setTarget(event.currentTarget.value);
              setMessage("");
            }}
          >
            <option value="">请选择已连接主机</option>
            {connected.map(({ hostId }) => (
              <option key={hostId} value={hostId}>
                {hosts.find(({ id }) => id === hostId)?.name ?? hostId}
              </option>
            ))}
          </select>
        </label>
        <label className="hu-field">
          本机代理端口
          <input
            type="number"
            required
            min={1}
            max={65535}
            value={local}
            disabled={busy || active}
            onChange={(event) => {
              setLocal(event.currentTarget.value);
              setMessage("");
            }}
          />
        </label>
        <label className="hu-field">
          远端回环端口
          <input
            type="number"
            required
            min={1024}
            max={65535}
            value={remote}
            disabled={busy || active}
            onChange={(event) => {
              setRemote(event.currentTarget.value);
              setMessage("");
            }}
          />
        </label>
        <div className="ssh-workspace-controls">
          <Button type="button" disabled={busy || active || !local || Number(local) < 1 || Number(local) > 65535} onClick={() => void change("detect")}>
            检测本机端口
          </Button>
          <Button type="submit" loading={busy} disabled={active}>
            开始分享
          </Button>
        </div>
      </form>
      <p role="status">
        {status.data ? labels[status.data.state] : ""}
        {status.data?.message ? ` · ${status.data.message}` : ""}
        {status.data?.tested === "accepted" ? " · 代理已接受 CONNECT" : ""}
      </p>
      {status.error && <p role="alert">{status.error.message}</p>}
      <p role="status">{message}</p>
      {active && config && (
        <div className="ssh-workspace-controls">
          <span>
            远端 127.0.0.1:{config.remotePort} · 本机 127.0.0.1:{config.localPort}
          </span>
          <Button disabled={busy || status.data?.state !== "running"} onClick={() => void change("test")}>
            测试 CONNECT
          </Button>
          <Button disabled={busy} onClick={() => void change("stop")}>
            停止分享
          </Button>
        </div>
      )}
      {examples && (
        <section className="hu-card-alt hu-stack">
          <h3>配置预览</h3>
          <pre>{examples.shell}</pre>
          <Button onClick={() => void copy(examples.shell)}>复制 Shell 配置</Button>
          <pre>{examples.docker}</pre>
          <Button onClick={() => void copy(examples.docker)}>复制 Docker 配置</Button>
          <pre>{examples.shellRestore}</pre>
          <Button onClick={() => void copy(examples.shellRestore)}>复制 Shell 还原命令</Button>
        </section>
      )}
    </section>
  );
}
