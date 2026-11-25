import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { planIntentId } from "./PlanScheduleControls.js";

type State = { paused: boolean; revision: string; writable: boolean };
type Change = { paused: boolean; expectedRevision: string; key: string };

export function AutomaticRunControl() {
  const engine = useEngine();
  const cache = useQueryClient();
  const state = useCapability<State>("automations.plans.automationState", {});
  const [change, setChange] = useState<Change | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const label = state.data?.paused ? "恢复自动运行" : "暂停自动运行";
  const confirmLabel = change?.paused ? "暂停自动运行" : "恢复自动运行";

  async function submit(input: Change) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await engine.call("automations.plans.setAutomationState", { paused: input.paused, expectedRevision: input.expectedRevision },
        { write: true, idempotencyKey: input.key, intentKey: input.key });
      setChange(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法修改自动运行设置。");
    } finally {
      await cache.invalidateQueries({ queryKey: [engine.vaultId], predicate: ({ queryKey }) => String(queryKey[1]).startsWith("automations.plans.") });
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="hu-stack" data-testid="automatic-run-control">
    {state.error ? <p role="alert">{state.error.message}</p> : null}
    {state.data ? <>
      <span role="status">{state.data.paused ? "自动运行已全局暂停" : "自动运行已开启"}</span>
      {state.data.writable ? <Button variant="ghost" icon={state.data.paused ? Play : Pause} disabled={busy} onClick={() => {
        setError("");
        setChange({ paused: !state.data!.paused, expectedRevision: state.data!.revision, key: planIntentId() });
      }}>{label}</Button> : null}
    </> : null}
    {change ? <Dialog open title={confirmLabel} onClose={() => { if (!busy) setChange(null); }} actions={<>
      <Button disabled={busy} onClick={() => setChange(null)}>关闭</Button>
      <Button disabled={busy || state.data?.revision !== change.expectedRevision} onClick={() => void submit(change)}>{confirmLabel}</Button>
    </>}>
      <p>各计划的启用设置会保留。手动运行与已经发出的动作可以继续。</p>
      {error ? <p role="alert">{error}</p> : null}
    </Dialog> : null}
  </div>;
}

export function AutomaticRunSettings() {
  return <section className="hu-settings-section hu-card-alt">
    <h2>自动运行</h2>
    <AutomaticRunControl />
  </section>;
}
