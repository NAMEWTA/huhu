import type { PlanSummary, PlanTrigger, PlanWrite, PlanWriteResult } from "@huhu/contracts";
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
  const [editRevision, setEditRevision] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [every, setEvery] = useState("");
  const [cron, setCron] = useState("");
  const [zone, setZone] = useState("");

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

  const writeBase = (expectedRevision = plan.revision) => ({ planId: plan.planId, expectedRevision, intentId: planIntentId() });
  const writable = !busy && pending === null;
  const showError = error && !editing && !deleting;
  const trigger = plan.trigger;
  const next: PlanTrigger | null = trigger.kind === "once" && scheduledFor ? { ...trigger, scheduledFor }
    : trigger.kind === "observe" && Number.isInteger(Number(every)) && Number(every) >= 1 && Number(every) <= 86_400 ? { ...trigger, everySeconds: Number(every) }
    : trigger.kind === "cron" && cron.trim() && zone.trim() ? { ...trigger, expression: cron.trim(), zone: zone.trim() } : null;
  return (
    <>
      <div className="row">
        {plan.actions.includes("reschedule") && (trigger.kind === "once" || trigger.kind === "observe" || trigger.kind === "cron") ? <Button disabled={!writable} onClick={() => {
          setError("");
          setEditRevision(plan.revision);
          if (trigger.kind === "once") setScheduledFor(trigger.scheduledFor);
          if (trigger.kind === "observe") setEvery(String(trigger.everySeconds));
          if (trigger.kind === "cron") { setCron(trigger.expression); setZone(trigger.zone); }
          setEditing(true);
        }}>改期</Button> : null}
        {plan.actions.includes("pause") ? <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "paused" })}>暂停</Button> : null}
        {plan.actions.includes("resume") ? <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "enabled" })}>启用</Button> : null}
        {plan.actions.includes("delete") ? <Button disabled={!writable} onClick={() => { setError(""); setEditRevision(plan.revision); setDeleting(true); }}>删除</Button> : null}
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
            <Button variant={deleting ? "danger" : "primary"} disabled={busy || (!deleting && !next)} onClick={() => {
              if (pending) void submit(pending);
              else if (deleting && editRevision) void submit({ ...writeBase(editRevision), change: "delete" });
              else if (next && editRevision) void submit({ ...writeBase(editRevision), change: "reschedule", trigger: next });
            }}>{pending ? "核对原变更" : deleting ? "删除计划" : "保存"}</Button>
          </>
        }
      >
        {deleting ? <p>{plan.title}</p> : trigger.kind === "once" ? <DateTimePicker label="触发时间" field={{ kind: "instant", value: scheduledFor }} clearable={false}
          disabled={!writable} onChange={(value) => { if (value.kind === "instant") setScheduledFor(value.value); }} />
          : trigger.kind === "observe" ? <label>检查间隔（秒） <input value={every} type="number" min={1} max={86400} disabled={!writable} onChange={(event) => setEvery(event.target.value)} /></label>
          : trigger.kind === "cron" ? <>
            <label>Cron 表达式 <input value={cron} disabled={!writable} onChange={(event) => setCron(event.target.value)} /></label>
            <label>时区 <input value={zone} disabled={!writable} onChange={(event) => setZone(event.target.value)} /></label>
          </> : null}
      </Dialog> : null}
    </>
  );
}
