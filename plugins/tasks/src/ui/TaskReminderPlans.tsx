import type { PlanSummary, TaskDto } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog } from "@huhu/ui";
import { AutomationPlanLink, createPlanIntentId, useCapability, useEngine, useTaskAutomationViews, type ModuleProps } from "@huhu/workbench";
import { useState } from "react";

export function TaskReminderPlans({ task, onNavigate }: { task: TaskDto; onNavigate: ModuleProps["onNavigate"] }) {
  const engine = useEngine();
  const PlanScheduleControls = useTaskAutomationViews()?.PlanScheduleControls;
  const plans = useCapability<{ plans: PlanSummary[] }>("automations.plans.list", { source: { plugin: "tasks", object: { kind: "task", id: task.id } } });
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{ intentId: string; scheduledFor: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!scheduledFor) return;
    const input = pending ?? { intentId: createPlanIntentId(), scheduledFor };
    setBusy(true);
    setPending(input);
    setError("");
    try {
      await engine.call("automations.plans.createTaskReminder", { ...input, taskId: task.id }, { write: true, idempotencyKey: input.intentId, intentKey: input.intentId });
      setCreating(false);
      setPending(null);
      await plans.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法确认提醒是否已保存。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hu-tw-detail-section" data-testid="detail-reminders">
      <h3>提醒</h3>
      {plans.error ? <p role="status">{plans.error.message}</p> : null}
      {plans.data?.plans.filter(({ action, trigger }) => action.capability === "notifications.create" || action.capability === "automations.runNow" || trigger.kind === "observe").map((plan) => (
        <div key={plan.planId} className="tasks-reminder-read" data-plan-id={plan.planId}>
          <span>{plan.title}</span>
          {plan.trigger.kind === "once" ? <time dateTime={plan.trigger.scheduledFor}>{new Date(plan.trigger.scheduledFor).toLocaleString()}</time>
            : plan.trigger.kind === "cron" ? <span>{plan.trigger.expression} · {plan.trigger.zone}</span> : null}
          <small>{plan.lastOccurrence?.state === "unknown" ? "待核实" : plan.lastOccurrence?.state === "completed" ? "已递送" : plan.intent === "paused" ? "已暂停" : plan.availability.state === "blocked" ? "暂不可用" : "待触发"}</small>
          {PlanScheduleControls ? <PlanScheduleControls plan={plan} changed={() => plans.refetch()} /> : null}
          <AutomationPlanLink planId={plan.planId} onNavigate={onNavigate} label={`在中心管理 · ${plan.title}`} />
        </div>
      ))}
      {!task.readOnly && task.status !== "completed" && plans.data ? <Button onClick={() => {
        setScheduledFor(null);
        setError("");
        setCreating(true);
      }}>添加提醒</Button> : null}
      {creating ? <Dialog open title="添加任务提醒" onClose={() => { if (!busy) { setCreating(false); setPending(null); } }} error={error}
        actions={<Button variant="primary" disabled={!scheduledFor || busy} onClick={() => void save()}>{pending ? "核对原提醒" : "保存提醒"}</Button>}>
        <DateTimePicker label="提醒时间" field={{ kind: "instant", value: scheduledFor }} clearable={false}
          onChange={(value) => { if (value.kind === "instant" && !pending) setScheduledFor(value.value); }} />
      </Dialog> : null}
    </section>
  );
}
