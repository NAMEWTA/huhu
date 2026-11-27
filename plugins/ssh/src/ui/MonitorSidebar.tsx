import { Button } from "@huhu/ui";
import { host as desktopHost, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { SESSION_INTERVALS, SessionInterval, type MonitorHost, type MonitorSession, type MonitorSessionChange } from "../shared/monitoring.js";
import type { z } from "zod";
import type { SshToolWindowHost } from "../shared/tool-window.js";
import { MonitorTools } from "./MonitorTools.js";

const phase: Record<MonitorHost["state"], string> = {
  connecting: "正在连接",
  trust: "等待核对主机指纹",
  sampling: "等待样本",
  running: "正在采样",
  paused: "已暂停",
  stopped: "已停止",
  disconnected: "原连接已关闭",
  unsupported: "当前系统不支持",
  denied: "读取权限不足",
  failed: "监控失败",
  missing: "主机已移除",
};

export function useMonitorVisibility() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function useMonitorPoll(enabled: boolean, refresh: () => Promise<unknown>) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
}

const size = (value: number) => (value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : `${(value / 1024 ** 2).toFixed(1)} MiB`);
const time = (at: number) => new Date(at).toLocaleString();

export function MonitorMetrics({ host, details = true }: { host: MonitorHost; details?: boolean }) {
  const sample = host.latest?.sample;
  const unknown = "暂无样本";
  return (
    <div className="hu-stack" data-testid="ssh-monitor-metrics">
      <p role="status">
        {phase[host.state]}
        {host.platform ? ` · ${host.platform === "linux" ? "Linux" : "Windows"}` : ""}
      </p>
      {host.message && <p role={host.state === "disconnected" ? "status" : "alert"}>{host.message}</p>}
      {host.interval !== undefined && (
        <p>
          共享周期 {host.interval} 秒 · {host.subscribers} 个订阅
        </p>
      )}
      {host.latest && (
        <p>
          最近样本 <time dateTime={new Date(host.latest.at).toISOString()}>{time(host.latest.at)}</time>
        </p>
      )}
      {sample && (
        <dl className="ssh-key-details">
          <dt>CPU</dt>
          <dd>{sample.cpu === undefined ? unknown : `${sample.cpu.toFixed(1)}%`}</dd>
          <dt>内存</dt>
          <dd>{sample.memory ? `${size(sample.memory.total - sample.memory.available)} / ${size(sample.memory.total)}` : unknown}</dd>
          {details && (
            <>
              <dt>磁盘</dt>
              <dd>{sample.disk ? `${sample.disk.mount} · ${size(sample.disk.available)} 可用 / ${size(sample.disk.total)}` : unknown}</dd>
              <dt>网络</dt>
              <dd>{sample.network ? `接收 ${Math.round(sample.network.received)} B/s · 发送 ${Math.round(sample.network.sent)} B/s` : unknown}</dd>
              <dt>负载</dt>
              <dd>{sample.load ?? (host.platform === "windows" ? "本采样器未提供" : unknown)}</dd>
              <dt>运行时长</dt>
              <dd>{sample.uptimeSec === undefined ? unknown : `${Math.floor(sample.uptimeSec)} 秒`}</dd>
              <dt>GPU</dt>
              <dd>本采样器未提供</dd>
            </>
          )}
        </dl>
      )}
      {details && host.platform === "linux" && sample && (
        <details>
          <summary>CPU 核心与网络接口</summary>
          <dl className="ssh-key-details">
            <dt>每核 CPU</dt>
            <dd>{sample.cores?.map(({ index, percent }) => `CPU ${index} · ${percent.toFixed(1)}%`).join(" / ") || unknown}</dd>
            <dt>网卡吞吐</dt>
            <dd>
              {sample.interfaces?.length ? (
                <ul>
                  {sample.interfaces.map(({ name, received, sent }) => (
                    <li key={name}>
                      {name} · 接收 {Math.round(received)} B/s · 发送 {Math.round(sent)} B/s
                    </li>
                  ))}
                </ul>
              ) : (
                unknown
              )}
            </dd>
          </dl>
        </details>
      )}
      {details && host.history.length > 0 && (
        <details>
          <summary>样本历史</summary>
          <table>
            <caption>当前连接的采样与空隙</caption>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">CPU</th>
                <th scope="col">内存</th>
              </tr>
            </thead>
            <tbody>
              {host.history
                .slice()
                .reverse()
                .map(({ at, sample }, index) => (
                  <tr key={`${at}-${index}`}>
                    <th scope="row">{time(at)}</th>
                    {sample ? (
                      <>
                        <td>{sample.cpu === undefined ? "—" : `${sample.cpu.toFixed(1)}%`}</td>
                        <td>{sample.memory ? size(sample.memory.total - sample.memory.available) : "—"}</td>
                      </>
                    ) : (
                      <td colSpan={2}>采样空隙</td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

type SidebarProps = { hostId: string; shellId: string; name: string; shown: boolean; dock: "left" | "right"; onDock(value: "left" | "right"): void; onClose(): void };

export function MonitorSidebar(props: SidebarProps) {
  if (desktopHost()) return <ActiveMonitorSidebar {...props} />;
  return (
    <aside className="ssh-monitor-side hu-stack" data-testid="ssh-monitor-sidebar" aria-label="活动分栏监控">
      <h3>{props.name} · 监控</h3>
      <p>请在桌面应用中打开分栏监控和服务器工具。此浏览器可查看已启动的监控面板。</p>
      <Button onClick={props.onClose}>关闭监控</Button>
    </aside>
  );
}

function ActiveMonitorSidebar({ hostId, shellId, name, shown, dock, onDock, onClose }: SidebarProps) {
  const engine = useEngine();
  const active = useMonitorVisibility() && shown;
  const [session, setSession] = useState<MonitorSession>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, showTools] = useState(false);
  const [sudo, setSudo] = useState(false);
  const toolHost = (globalThis as { huhuHost?: SshToolWindowHost }).huhuHost;
  const reading = useCapability<MonitorSession>("ssh.monitor.session.get", { id: session?.id ?? "" }, { enabled: Boolean(session && active) });
  useMonitorPoll(Boolean(session && active), reading.refetch);
  useEffect(() => {
    let cancelled = false;
    let id: string | undefined;
    const close = (value: string) => void engine.call("ssh.monitor.session.change", { id: value, action: "close" }, { write: true }).catch(() => undefined);
    void engine.call<MonitorSession>("ssh.monitor.session.open", { hostId, shellId, interval: 2, sudo }, { write: true }).then(
      (result) => {
        id = result.id;
        if (cancelled) close(id);
        else setSession(result);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "无法打开分栏监控");
      },
    );
    return () => {
      cancelled = true;
      if (id) close(id);
    };
  }, [engine, hostId, shellId, sudo]);
  const current = reading.data ?? session;
  async function change(action: Omit<z.infer<typeof MonitorSessionChange>, "id"> | { action: "interval"; interval: z.infer<typeof SessionInterval> }) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      await engine.call("ssh.monitor.session.change", { ...action, id: session.id }, { write: true });
      await reading.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法更新分栏监控");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="ssh-monitor-side hu-stack" data-testid="ssh-monitor-sidebar" aria-label="活动分栏监控">
      <h3>{name} · 监控</h3>
      <div className="ssh-workspace-controls">
        <label>
          停靠位置{" "}
          <select value={dock} onChange={(event) => onDock(event.target.value === "left" ? "left" : "right")}>
            <option value="left">左侧</option>
            <option value="right">右侧</option>
          </select>
        </label>
        <label>
          采样周期{" "}
          <select disabled={!current || busy} value={current?.interval ?? 2} onChange={(event) => void change({ action: "interval", interval: SessionInterval.parse(Number(event.target.value)) })}>
            {SESSION_INTERVALS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} 秒
              </option>
            ))}
          </select>
        </label>
        {current?.host.state === "paused" ? (
          <Button disabled={busy} onClick={() => void change({ action: "continue" })}>
            继续
          </Button>
        ) : (
          <Button disabled={busy || !current || current.host.state === "disconnected"} onClick={() => void change({ action: "pause" })}>
            暂停
          </Button>
        )}
        {current && ["denied", "unsupported", "failed"].includes(current.host.state) && (
          <Button disabled={busy} onClick={() => void change({ action: "retry" })}>
            重试
          </Button>
        )}
        <Button onClick={onClose}>关闭监控</Button>
        <Button
          aria-pressed={sudo}
          disabled={!current || busy || current.host.state === "disconnected"}
          onClick={() => {
            setSession(undefined);
            setError("");
            setSudo(!sudo);
          }}
        >
          监控 sudo
        </Button>
        {current?.host.state !== "disconnected" && <Button onClick={() => showTools(true)}>服务器工具</Button>}
        {toolHost?.openSshToolWindow && current?.host.state !== "disconnected" && (
          <Button
            onClick={() =>
              void toolHost.openSshToolWindow({ vaultId: engine.vaultId, hostId, shellId, name }).catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : "无法打开服务器工具窗口");
              })
            }
          >
            在新窗口打开服务器工具
          </Button>
        )}
      </div>
      {(error || reading.error) && <p role="alert">{error || reading.error?.message}</p>}
      {current && <MonitorMetrics host={current.host} />}
      {tools && <MonitorTools hostId={hostId} shellId={shellId} name={name} onClose={() => showTools(false)} />}
    </aside>
  );
}
