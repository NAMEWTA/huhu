import type { PlanSummary } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog, Field, Select } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine } from "@huhu/workbench";
import { useRef, useState } from "react";
import { planIntentId } from "./PlanScheduleControls.js";

type Input = { taskId: string; scheduledFor: string; intentId: string; startPaused: true };

export function TaskReminderEditor({ onClose, onSaved }: { onClose(): void; onSaved(planId: string): void }) {
  const engine = useEngine();
  const tasks = useCapability<{ id: string; title: string; status: string; readOnly: boolean }[]>("tasks.list");
  const [taskId, setTaskId] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Input | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const validTime = scheduledFor !== null && Date.parse(scheduledFor) > Date.now();

  async function save() {
    if (submitted.current || !scheduledFor) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    const input = pending ?? { taskId, scheduledFor, intentId: planIntentId(), startPaused: true };
    setPending(input);
    try {
      const plan = await engine.call<PlanSummary>("automations.plans.createTaskReminder", input, {
        write: true, intentKey: input.intentId, idempotencyKey: input.intentId,
      });
      onSaved(plan.planId);
    } catch (failure) {
      if (failure instanceof CapabilityError && !["INTERNAL", "UNAUTHENTICATED", "WRITE_PARTIAL"].includes(failure.code)) setPending(null);
      setError(failure instanceof Error ? failure.message : "暂时无法确认提醒是否已保存。");
    } finally {
      setBusy(false);
      submitted.current = false;
    }
  }

  return <Dialog open title="一次性任务提醒" error={error || tasks.error?.message} onClose={() => { if (!busy && !pending) onClose(); }}
    actions={<><Button disabled={busy || pending !== null} onClick={onClose}>取消</Button>
      <Button variant="primary" disabled={busy || (!pending && (!taskId || !validTime))} onClick={() => void save()}>{pending ? "核对原请求" : "保存提醒"}</Button></>}>
    <Field label="关联任务">
      <Select aria-label="关联任务" value={taskId} disabled={pending !== null} onChange={(event) => setTaskId(event.target.value)}>
        <option value="">选择任务</option>
        {tasks.data?.filter((task) => !task.readOnly && task.status !== "completed").map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
      </Select>
    </Field>
    <DateTimePicker label="提醒时间" clearable={false} field={{ kind: "instant", value: scheduledFor }} disabled={pending !== null}
      onChange={(field) => { if (field.kind === "instant") setScheduledFor(field.value); }} />
    {scheduledFor ? <p>{scheduledFor} UTC</p> : null}
    {scheduledFor && !validTime ? <p role="alert">请选择未来时刻。</p> : null}
  </Dialog>;
}
