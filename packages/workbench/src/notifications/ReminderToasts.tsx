import { WorkbenchToaster, useWorkbenchFeedback } from "@huhu/ui";
import { useEngineEvents } from "../engine-client/react.js";

/**
 * 任务提醒到点时的持久提示（不自动消失）：标题 + “打开任务 / 知道了”。
 * 站内通知照常写入通知中心；这里只是让用户在当前页面上也看得到。
 */
export function ReminderToasts({ onOpenTasks }: { onOpenTasks(): void }) {
  const feedback = useWorkbenchFeedback("reminders");
  useEngineEvents((e) => {
    if (e.type !== "reminder.due") return;
    const p = e.payload as { title?: string };
    feedback(`任务提醒：${p.title ?? ""}`, "info", { duration: Number.POSITIVE_INFINITY, action: { label: "打开任务", onClick: onOpenTasks }, cancel: { label: "知道了", onClick: () => undefined } });
  });
  return <WorkbenchToaster scope="reminders" />;
}
