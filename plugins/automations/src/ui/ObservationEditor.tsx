import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import { planIntentId } from "./PlanScheduleControls.js";

type Target = { kind: "task" | "agent-session"; id: string };
type Condition = { kind: "change" } | { kind: "threshold"; status: string; seconds: number };
type Observation = {
  title: string; target: Target; everySeconds: number; condition: Condition;
  repeat: boolean; stopAtTerminal: boolean; effect: string; intentId: string;
};

export function ObservationEditor({ onClose, onSaved }: { onClose(): void; onSaved(): Promise<unknown> }) {
  const engine = useEngine();
  const id = useId();
  const [kind, setKind] = useState<Target["kind"]>("task");
  const [threshold, setThreshold] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Observation | null>(null);
  const tasks = useCapability<{ id: string; title: string }[]>("tasks.list", {}, { enabled: kind === "task" });
  const agents = useCapability<{ id: string; name: string }[]>("agent.sessions.list", {}, { enabled: kind === "agent-session" });
  const targets = kind === "task" ? tasks.data : agents.data?.map(({ id, name }) => ({ id, title: name }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const input: Observation = pending ?? {
      title: String(data.get("title")),
      target: { kind, id: String(data.get("target")) },
      everySeconds: Number(data.get("interval")) * (data.get("unit") === "minutes" ? 60 : 1),
      condition: threshold ? { kind: "threshold", status: String(data.get("status")), seconds: Number(data.get("duration")) } : { kind: "change" },
      repeat: data.get("repeat") === "on",
      stopAtTerminal: data.get("stop") === "on",
      effect: String(data.get("effect")),
      intentId: planIntentId(),
    };
    setBusy(true);
    setPending(input);
    setError("");
    try {
      await engine.call("automations.plans.createObservation", input, { write: true, intentKey: input.intentId, idempotencyKey: input.intentId });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法确认状态观察是否已保存。");
      if (failure instanceof CapabilityError && !["INTERNAL", "UNAUTHENTICATED", "WRITE_PARTIAL"].includes(failure.code)) setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title="新建状态观察" onClose={() => { if (!busy) onClose(); }} error={error}
      actions={<Button type="submit" form={id} disabled={busy || (!pending && !targets?.length)} variant="primary">{pending ? "核对原观察" : "保存观察"}</Button>}>
      <form id={id} onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy || pending !== null}>
          <label>计划名称 <input name="title" required maxLength={200} /></label>
          <label>观察类型 <select value={kind} onChange={(event) => setKind(event.target.value === "task" ? "task" : "agent-session")}>
            <option value="task">任务</option><option value="agent-session">Agent 会话</option>
          </select></label>
          <label>观察对象 <select key={kind} name="target" required defaultValue="">
            <option value="" disabled>选择对象</option>
            {targets?.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
          </select></label>
          <label>检查间隔 <input name="interval" type="number" min={1} max={1440} defaultValue={1} required /></label>
          <label>间隔单位 <select name="unit"><option value="minutes">分钟</option><option value="seconds">秒</option></select></label>
          <label>触发条件 <select value={threshold ? "threshold" : "change"} onChange={(event) => setThreshold(event.target.value === "threshold")}>
            <option value="change">状态变化</option><option value="threshold">状态持续超过约定时间</option>
          </select></label>
          {threshold ? <>
            <label>状态 <select name="status" defaultValue="waiting_input">
              <option value="not_started">未开始</option><option value="running">运行中</option><option value="waiting_input">等待输入</option>
              <option value="completed">已完成</option><option value="failed">失败</option>
            </select></label>
            <label>持续秒数 <input name="duration" type="number" min={1} max={86400} defaultValue={60} required /></label>
          </> : null}
          <label>递送方式 <select key={kind} name="effect">
            <option value="notification">站内通知</option><option value="task">新建任务</option><option value="both">通知并新建任务</option>
            {kind === "task" ? <option value="comment">在原任务追加评论</option> : null}
          </select></label>
          <label><input type="checkbox" name="repeat" /> 条件持续满足时重复递送</label>
          <label><input type="checkbox" name="stop" defaultChecked /> 到达终态后停止观察</label>
        </fieldset>
      </form>
    </Dialog>
  );
}
