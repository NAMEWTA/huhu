import type { PlanSummary, PlanWrite, PlanWriteResult } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog } from "@huhu/ui";
import { createRequestId, useEngine } from "@huhu/workbench";
import { useState } from "react";

export function planIntentId(): string {
  const id = createRequestId();
  return id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20)}` : id;
}

export function PlanScheduleControls({ plan, changed }: { plan: PlanSummary; changed(): Promise<unknown> }) {
  const engine = useEngine();
  const [pending, setPending] = useState<PlanWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  async function submit(input: PlanWrite) {
    setPending(input);
    setBusy(true);
    setError("");
    try {
      const result = await engine.call<PlanWriteResult>("automations.plans.submit", input, { write: true, idempotencyKey: input.intentId, intentKey: input.intentId });
      if (result.outcome === "unknown") {
        setError("写入结果待核实。");
        return;
      }
      setPending(null);
      if (result.outcome === "not-accepted") {
        setError(result.error.message);
      } else {
        setEditing(false);
        setDeleting(false);
      }
      await changed();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法确认计划变更。");
    } finally {
      setBusy(false);
    }
  }

  const writeBase = () => ({ planId: plan.planId, expectedRevision: plan.revision, intentId: planIntentId() });
  const writable = !busy && pending === null;
  const showError = error && !editing && !deleting;
  return (
    <>
      <div className="row">
        {plan.actions.includes("reschedule") && plan.trigger.kind === "once" ? <Button disabled={!writable} onClick={() => {
          setError("");
          setScheduledFor(plan.trigger.kind === "once" ? plan.trigger.scheduledFor : null);
          setEditing(true);
        }}>改期</Button> : null}
        {plan.actions.includes("pause") ? <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "paused" })}>暂停</Button> : null}
        {plan.actions.includes("resume") ? <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "enabled" })}>启用</Button> : null}
        {plan.actions.includes("delete") ? <Button disabled={!writable} onClick={() => { setError(""); setDeleting(true); }}>删除</Button> : null}
        {pending && !editing && !deleting ? <Button disabled={busy} onClick={() => void submit(pending)}>核对原变更</Button> : null}
      </div>
      {showError ? <p role="alert">{error}</p> : null}
      {editing || deleting ? <Dialog
        open
        title={deleting ? "删除计划" : "更改计划时间"}
        onClose={() => { if (writable) { setEditing(false); setDeleting(false); } }}
        error={error}
        actions={
          <>
            <Button disabled={!writable} onClick={() => { setEditing(false); setDeleting(false); }}>取消</Button>
            <Button variant={deleting ? "danger" : "primary"} disabled={busy || (!deleting && !scheduledFor)} onClick={() => {
              if (pending) void submit(pending);
              else if (deleting) void submit({ ...writeBase(), change: "delete" });
              else if (scheduledFor) void submit({ ...writeBase(), change: "reschedule", trigger: { kind: "once", scheduledFor } });
            }}>{pending ? "核对原变更" : deleting ? "删除计划" : "保存"}</Button>
          </>
        }
      >
        {deleting ? <p>{plan.title}</p> : <DateTimePicker label="触发时间" field={{ kind: "instant", value: scheduledFor }} clearable={false}
          onChange={(value) => { if (value.kind === "instant" && writable) setScheduledFor(value.value); }} />}
      </Dialog> : null}
    </>
  );
}
