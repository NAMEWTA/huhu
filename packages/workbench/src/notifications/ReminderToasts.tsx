import { WorkbenchToaster, useWorkbenchFeedback } from "@huhu/ui";
import { EVENT_PAYLOADS, type PlanOccurrenceLink } from "@huhu/contracts";
import { useEngine, useEngineEvents } from "../engine-client/react.js";

/**
 * 任务提醒到点时的持久提示（不自动消失）：标题 + “打开任务 / 知道了”。
 * 站内通知照常写入通知中心；这里只是让用户在当前页面上也看得到。
 */
export function ReminderToasts({
  onOpenTasks,
  onOpenNotification,
  onDesktopNotification,
}: {
  onOpenTasks(): void;
  onOpenNotification: import("./NotificationBell.js").OpenNotification;
  onDesktopNotification?(notice: { id: string; title: string; occurrence: PlanOccurrenceLink }, vaultId: string): void;
}) {
  const { endpoint } = useEngine();
  const feedback = useWorkbenchFeedback("reminders");
  useEngineEvents((e) => {
    if (e.type !== "notification.created") return;
    const parsed = EVENT_PAYLOADS["notification.created"].safeParse(e.payload);
    if (!parsed.success) return;
    const { id, title, module, occurrence } = parsed.data;
    if (occurrence) {
      feedback(title, "info", {
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "查看原发生",
          onClick: () => onOpenNotification({ id, module, occurrence }, endpoint),
        },
        cancel: { label: "知道了", onClick: () => undefined },
      });
      if (Date.now() - Date.parse(e.at) < 30_000) onDesktopNotification?.({ id, title, occurrence }, endpoint.vaultId);
    } else if (module === "tasks" && title.startsWith("任务提醒：")) {
      feedback(title, "info", { duration: Number.POSITIVE_INFINITY, action: { label: "打开任务", onClick: onOpenTasks }, cancel: { label: "知道了", onClick: () => undefined } });
    }
  });
  return <WorkbenchToaster scope="reminders" />;
}
