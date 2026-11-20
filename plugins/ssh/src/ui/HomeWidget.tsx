import { ArrowRight, Server } from "lucide-react";
import { useCapability, type HomeWidgetContribution } from "@huhu/workbench";
import type { ComponentProps } from "react";
import { t } from "./i18n.js";

/** 首页卡片：已保存的 SSH 主机（最多 4 台），点一下进入 SSH 模块。 */
const useHosts = () => useCapability<{ id: string; name: string; host: string; user: string }[]>("ssh.hosts.list", {});

export function SshHomeWidget({ onNavigate, config }: ComponentProps<HomeWidgetContribution["component"]>) {
  const hosts = useHosts();
  const hostId = typeof config["hostId"] === "string" ? config["hostId"] : undefined;
  const list = hostId ? (hosts.data ?? []).filter((host) => host.id === hostId) : (hosts.data ?? []).slice(0, 4);
  return (
    <>
      {list.map((h) => (
        <button type="button" className="shell-inbox-preview" key={h.id} data-testid="home-ssh-host" onClick={() => onNavigate("ssh")}>
          <span className="shell-inbox-bullet" />
          <span>
            <strong>{h.name}</strong>
            <small>
              {h.user}@{h.host}
            </small>
          </span>
          <Server size={13} aria-hidden />
        </button>
      ))}
      {hosts.isPending ? (
        <div role="status" className="hu-mini-empty">
          正在读取主机…
        </div>
      ) : null}
      {hosts.isError ? (
        <button type="button" className="hu-card-footer-link" onClick={() => void hosts.refetch()}>
          主机读取失败，重试
        </button>
      ) : null}
      {hosts.data && list.length === 0 ? <div className="hu-mini-empty">{hostId ? "找不到所选主机，可在编辑布局中重新选择。" : "还没有保存的主机"}</div> : null}
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("ssh")}>
        {t.title} <ArrowRight size={14} aria-hidden />
      </button>
    </>
  );
}

export function SshHomeWidgetConfig({ config, onChange, disabled }: ComponentProps<NonNullable<HomeWidgetContribution["configure"]>>) {
  const hosts = useHosts();
  const hostId = typeof config["hostId"] === "string" ? config["hostId"] : "";
  const options = hosts.data ?? [];
  return (
    <label className="row">
      显示主机
      <select value={hostId} disabled={disabled || !hosts.data} onChange={(event) => onChange(event.target.value ? { hostId: event.target.value } : {})}>
        <option value="">最近主机</option>
        {hostId && !options.some((host) => host.id === hostId) ? <option value={hostId}>找不到所选主机</option> : null}
        {options.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name}
          </option>
        ))}
      </select>
    </label>
  );
}
