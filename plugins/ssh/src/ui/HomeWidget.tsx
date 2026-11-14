import { ArrowRight, Server } from "lucide-react";
import { useCapability } from "@huhu/workbench";
import { t } from "./i18n.js";

/** 首页卡片：已保存的 SSH 主机（最多 4 台），点一下进入 SSH 模块。 */
export function SshHomeWidget({ onNavigate }: { onNavigate(moduleId: string): void }) {
  const hosts = useCapability<{ id: string; name: string; host: string; user: string }[]>("ssh.hosts.list", {});
  const list = (hosts.data ?? []).slice(0, 4);
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
      {hosts.data && list.length === 0 ? <div className="hu-mini-empty">还没有保存的主机</div> : null}
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("ssh")}>
        {t.title} <ArrowRight size={14} aria-hidden />
      </button>
    </>
  );
}
