import { Badge, Button, IconButton, Popover } from "@huhu/ui";
import { ArrowRight, Bell, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n/zh-CN.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";

interface Notification {
  id: string;
  title: string;
  module: string;
  at: string;
  read: boolean;
}

/** 通知入口（原型 notification-button + notification-popover）：面包屑栏的铃铛，未读圆点，弹出通知列表。 */
export function NotificationBell() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useCapability<Notification[]>("notifications.list", {});
  const unread = (list.data ?? []).filter((n) => !n.read).length;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "notifications.list" });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="notification-button">
        <Popover.Trigger asChild>
          <IconButton icon={Bell} label={t.notifications.unread(unread)} data-testid="bell" />
        </Popover.Trigger>
        {unread > 0 ? <i data-testid="unread-count" aria-hidden /> : null}
      </div>
      <Popover.Portal>
        <Popover.Content className="notification-popover" data-huhu-popover align="end" sideOffset={10} collisionPadding={12} aria-labelledby="huhu-notifications-title" data-testid="notification-panel">
          <div className="drawer-head">
            <h3 id="huhu-notifications-title">
              {t.notifications.title} <Badge>{unread}</Badge>
            </h3>
            <div className="row">
              <button type="button" className="link-button" onClick={() => void engine.call("notifications.markRead", { ids: "all" }, { write: true }).then(refresh)}>
                {t.notifications.markAll}
              </button>
              <IconButton icon={X} label="关闭通知" onClick={() => setOpen(false)} />
            </div>
          </div>
          {(list.data ?? []).length === 0 ? (
            <p className="tw-empty-group">{t.notifications.empty}</p>
          ) : (
            (list.data ?? []).map((n) => (
              <div key={n.id} className={`notice-item${n.read ? "" : " unread"}`} data-read={n.read}>
                <span className="notice-dot" />
                <span>
                  <strong>{n.title}</strong>
                </span>
                <ChevronRight size={14} aria-hidden />
              </div>
            ))
          )}
          <div className="popover-footer">
            <Button variant="ghost" icon={ArrowRight} onClick={() => void engine.call("notifications.clearRead", {}, { write: true }).then(refresh)}>
              {t.notifications.clearRead}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
