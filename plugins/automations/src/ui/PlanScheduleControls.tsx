import { LedgerBusinessDate, type CalendarPlanTrigger, type PlanSummary, type PlanTrigger, type PlanWrite, type PlanWriteResult } from "@huhu/contracts";
import { Button, DateTimePicker, Dialog } from "@huhu/ui";
import { createPlanIntentId as planIntentId, useEngine, type ModuleProps } from "@huhu/workbench";
import { useId, useRef, useState } from "react";
import { calendarFrequencyLabel, describeTrigger } from "./plan-presentation.js";
import { uncertainPlanWrite } from "./plan-write.js";
import { useDraftDismissal } from "./use-draft-dismissal.js";

export { planIntentId };

export function PlanScheduleControls({ plan, changed, scheduleOnly = false, registerLeaveGuard }: { plan: PlanSummary; changed(): Promise<unknown>; scheduleOnly?: boolean; registerLeaveGuard?: ModuleProps["registerLeaveGuard"] }) {
  const engine = useEngine();
  const formId = useId();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<PlanWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editRevision, setEditRevision] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [every, setEvery] = useState("");
  const [unit, setUnit] = useState<"seconds" | "minutes">("seconds");
  const [cron, setCron] = useState("");
  const [zone, setZone] = useState("");
  const [startOn, setStartOn] = useState("");
  const [frequency, setFrequency] = useState<CalendarPlanTrigger["frequency"]>("monthly");

  async function submit(input: PlanWrite) {
    if (submitted.current) return;
    submitted.current = true;
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
      if (!uncertainPlanWrite(failure)) setPending(null);
      setError(failure instanceof Error ? failure.message : "暂时无法确认计划变更。");
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }

  const writeBase = (expectedRevision = plan.revision) => ({ planId: plan.planId, expectedRevision, intentId: planIntentId() });
  const writable = !busy && pending === null;
  const { dismiss, confirmation } = useDraftDismissal({
    enabled: editing || deleting,
    dirty,
    locked: !writable,
    close: () => {
      setEditing(false);
      setDeleting(false);
    },
    registerLeaveGuard,
  });
  const showError = error && !editing && !deleting;
  const trigger = plan.trigger;
  const bounds = plan.intervalBounds;
  const scale = unit === "minutes" ? 60 : 1;
  const seconds = Number(every) * scale;
  const validInterval = Number.isInteger(Number(every)) && seconds >= (bounds?.min ?? 1) && seconds <= (bounds?.max ?? 86_400) && (!bounds || (seconds % bounds.step === 0 && (!bounds.allowed || bounds.allowed.includes(seconds))));
  const next: PlanTrigger | null =
    trigger.kind === "once" && scheduledFor
      ? { ...trigger, scheduledFor }
      : trigger.kind === "observe" && Number.isInteger(Number(every)) && Number(every) >= 1 && Number(every) <= 86_400
        ? { ...trigger, everySeconds: Number(every) }
        : trigger.kind === "interval" && validInterval
          ? { ...trigger, every: Number(every), unit }
          : trigger.kind === "calendar" && LedgerBusinessDate.safeParse(startOn).success
            ? { kind: "calendar", startOn, frequency }
            : trigger.kind === "cron" && cron.trim() && zone.trim()
              ? { ...trigger, expression: cron.trim(), zone: zone.trim() }
              : null;
  return (
    <>
      <div className="row">
        {plan.actions.includes("reschedule") && trigger.kind !== "event" ? (
          <Button
            disabled={!writable}
            onClick={() => {
              setError("");
              setDirty(false);
              setEditRevision(plan.revision);
              if (trigger.kind === "once") setScheduledFor(trigger.scheduledFor);
              if (trigger.kind === "observe") setEvery(String(trigger.everySeconds));
              if (trigger.kind === "interval") {
                const allowed = plan.intervalBounds?.allowed;
                setEvery(String(allowed && trigger.unit === "minutes" ? trigger.every * 60 : trigger.every));
                setUnit(allowed ? "seconds" : trigger.unit);
              }
              if (trigger.kind === "cron") {
                setCron(trigger.expression);
                setZone(trigger.zone);
              }
              if (trigger.kind === "calendar") {
                setStartOn(trigger.startOn);
                setFrequency(trigger.frequency);
              }
              setEditing(true);
            }}
          >
            改期
          </Button>
        ) : null}
        {!scheduleOnly && plan.actions.includes("pause") ? (
          <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "paused" })}>
            暂停
          </Button>
        ) : null}
        {!scheduleOnly && plan.actions.includes("resume") ? (
          <Button disabled={!writable} onClick={() => void submit({ ...writeBase(), change: "set-intent", intent: "enabled" })}>
            启用
          </Button>
        ) : null}
        {!scheduleOnly && plan.actions.includes("delete") ? (
          <Button
            disabled={!writable}
            onClick={() => {
              setError("");
              setDirty(false);
              setEditRevision(plan.revision);
              setDeleting(true);
            }}
          >
            删除
          </Button>
        ) : null}
        {pending && !editing && !deleting ? (
          <Button disabled={busy} onClick={() => void submit(pending)}>
            核对原变更
          </Button>
        ) : null}
      </div>
      {showError ? <p role="alert">{error}</p> : null}
      {editing || deleting ? (
        <Dialog
          open
          title={deleting ? "删除计划" : "更改计划时间"}
          onClose={dismiss}
          dismissOnBackdrop
          error={error}
          actions={
            <>
              <Button disabled={!writable} onClick={dismiss}>
                取消
              </Button>
              <Button type="submit" form={formId} variant={deleting ? "danger" : "primary"} disabled={busy || (!pending && !deleting && !next)}>
                {pending ? "核对原变更" : deleting ? "删除计划" : "保存"}
              </Button>
            </>
          }
        >
          <form
            id={formId}
            onChange={() => setDirty(true)}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              if (pending) void submit(pending);
              else if (deleting && editRevision) void submit({ ...writeBase(editRevision), change: "delete" });
              else if (next && editRevision) void submit({ ...writeBase(editRevision), change: "reschedule", trigger: next });
            }}
          >
            {deleting ? (
              <p>{plan.title}</p>
            ) : trigger.kind === "once" ? (
              <DateTimePicker
                label="触发时间"
                field={{ kind: "instant", value: scheduledFor }}
                clearable={false}
                disabled={!writable}
                onChange={(value) => {
                  if (value.kind === "instant") setScheduledFor(value.value);
                }}
              />
            ) : trigger.kind === "observe" ? (
              <label>
                检查间隔（秒） <input value={every} type="number" min={1} max={86400} disabled={!writable} onChange={(event) => setEvery(event.target.value)} />
              </label>
            ) : trigger.kind === "interval" && bounds?.allowed ? (
              <label>
                执行间隔{" "}
                <select value={every} disabled={!writable} onChange={(event) => setEvery(event.target.value)}>
                  {bounds.allowed.map((value) => (
                    <option key={value} value={value}>
                      {value} 秒
                    </option>
                  ))}
                </select>
              </label>
            ) : trigger.kind === "interval" ? (
              <>
                <label>
                  执行间隔{" "}
                  <input
                    value={every}
                    type="number"
                    min={Math.ceil((bounds?.min ?? 1) / scale)}
                    max={Math.floor((bounds?.max ?? 86_400) / scale)}
                    step={Math.max(1, (bounds?.step ?? 1) / scale)}
                    disabled={!writable}
                    onChange={(event) => setEvery(event.target.value)}
                  />
                </label>
                <label>
                  间隔单位{" "}
                  <select value={unit} disabled={!writable} onChange={(event) => setUnit(event.target.value === "minutes" ? "minutes" : "seconds")}>
                    <option value="seconds">秒</option>
                    <option value="minutes">分钟</option>
                  </select>
                </label>
              </>
            ) : trigger.kind === "calendar" ? (
              <>
                <label>
                  周期{" "}
                  <select
                    value={frequency}
                    disabled={!writable}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === "daily" || value === "weekly" || value === "monthly") setFrequency(value);
                    }}
                  >
                    {Object.entries(calendarFrequencyLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  起始日期 <input type="date" required value={startOn} disabled={!writable} onChange={(event) => setStartOn(event.currentTarget.value)} />
                </label>
                <p>业务时区 {plan.businessSchedule?.zone}</p>
              </>
            ) : trigger.kind === "cron" ? (
              <>
                <label>
                  Cron 表达式 <input value={cron} disabled={!writable} onChange={(event) => setCron(event.target.value)} />
                </label>
                <label>
                  时区 <input value={zone} disabled={!writable} onChange={(event) => setZone(event.target.value)} />
                </label>
              </>
            ) : null}
          </form>
          {editing && !busy && !pending && editRevision !== plan.revision && plan.actions.includes("reschedule") ? (
            <div role="status">
              <p>当前排期已更新为 {describeTrigger(plan.trigger)}。表单中的排期已保留。</p>
              <Button
                onClick={() => {
                  setEditRevision(plan.revision);
                  setError("");
                }}
              >
                采用当前修订
              </Button>
            </div>
          ) : null}
          {confirmation}
        </Dialog>
      ) : null}
    </>
  );
}
