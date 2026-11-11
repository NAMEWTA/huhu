import { Button } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { useState } from "react";
import { t } from "../i18n/zh-CN.js";

interface Notification {
  id: string;
  title: string;
  module: string;
  at: string;
  read: boolean;
}

/** 状态栏通知入口：未读数 + 弹出列表。 */
export function NotificationBell() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useCapability<Notification[]>("notifications.list", {});
  const unread = (list.data ?? []).filter((n) => !n.read).length;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "notifications.list" });
  return (
    <span className="hu-bell">
      <button type="button" className="hu-btn hu-btn-ghost" aria-label={t.notifications.unread(unread)} aria-expanded={open} data-testid="bell" onClick={() => setOpen(!open)}>
        {t.notifications.title} {unread > 0 ? <span data-testid="unread-count">{unread}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label={t.notifications.title} className="hu-popover" data-testid="notification-panel">
          {(list.data ?? []).length === 0 ? (
            <p>{t.notifications.empty}</p>
          ) : (
            (list.data ?? []).map((n) => (
              <div key={n.id} className="hu-row" data-read={n.read}>
                {n.title}
              </div>
            ))
          )}
          <Button onClick={() => void engine.call("notifications.markRead", { ids: "all" }, { write: true }).then(refresh)}>{t.notifications.markAll}</Button>
          <Button variant="ghost" onClick={() => void engine.call("notifications.clearRead", {}, { write: true }).then(refresh)}>
            {t.notifications.clearRead}
          </Button>
        </div>
      ) : null}
    </span>
  );
}
