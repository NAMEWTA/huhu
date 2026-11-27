import type { PlanSummary } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog, Field, Select } from "@huhu/ui";
import { useCapability, useEngine, type ModuleProps } from "@huhu/workbench";
import { useId, useRef, useState } from "react";
import { uncertainPlanWrite } from "./plan-write.js";
import { useDraftDismissal } from "./use-draft-dismissal.js";
import { planIntentId } from "./PlanScheduleControls.js";

type Input = { taskId: string; scheduledFor: string; intentId: string; startPaused: true };

export function TaskReminderEditor({ onClose, onSaved, registerLeaveGuard }: { onClose(): void; onSaved(planId: string): void; registerLeaveGuard: ModuleProps["registerLeaveGuard"] }) {
  const engine = useEngine();
  const formId = useId();
  const tasks = useCapability<{ id: string; title: string; status: string; readOnly: boolean }[]>("tasks.list");
  const [taskId, setTaskId] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Input | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const { dismiss, confirmation } = useDraftDismissal({ dirty: Boolean(taskId || scheduledFor), locked: busy || pending !== null, close: onClose, registerLeaveGuard });
  const validTime = scheduledFor !== null && Date.parse(scheduledFor) > Date.now();

  async function save() {
    if (submitted.current || !scheduledFor || (!pending && (!taskId || !validTime))) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    const input = pending ?? { taskId, scheduledFor, intentId: planIntentId(), startPaused: true };
    setPending(input);
    try {
      const plan = await engine.call<PlanSummary>("automations.plans.createTaskReminder", input, {
        write: true,
        intentKey: input.intentId,
        idempotencyKey: input.intentId,
      });
      onSaved(plan.planId);
    } catch (failure) {
      if (!uncertainPlanWrite(failure)) setPending(null);
      setError(failure instanceof Error ? failure.message : "暂时无法确认提醒是否已保存。");
    } finally {
      setBusy(false);
      submitted.current = false;
    }
  }

  return (
    <Dialog
      open
      title="一次性任务提醒"
      error={error || tasks.error?.message}
      onClose={dismiss}
      dismissOnBackdrop
      actions={
        <>
          <Button disabled={busy || pending !== null} onClick={dismiss}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy || (!pending && (!taskId || !validTime))}>
            {pending ? "核对原请求" : "保存提醒"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="关联任务">
          <Select aria-label="关联任务" value={taskId} disabled={pending !== null} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">选择任务</option>
            {tasks.data
              ?.filter((task) => !task.readOnly && task.status !== "completed")
              .map(({ id, title }) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
          </Select>
        </Field>
        <DateTimePicker
          label="提醒时间"
          clearable={false}
          field={{ kind: "instant", value: scheduledFor }}
          disabled={pending !== null}
          onChange={(field) => {
            if (field.kind === "instant") setScheduledFor(field.value);
          }}
        />
        {scheduledFor ? (
          <p>
            {Intl.DateTimeFormat().resolvedOptions().timeZone} · {scheduledFor}（UTC）
          </p>
        ) : null}
        {scheduledFor && !validTime ? <p role="alert">请选择未来时刻。</p> : null}
      </form>
      {confirmation}
    </Dialog>
  );
}
