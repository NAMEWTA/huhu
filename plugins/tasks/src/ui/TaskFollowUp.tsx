import type { TaskDto, TaskFollowUpView as FollowUp } from "@huhu/contracts";
import { Button, Dialog } from "@huhu/ui";
import { AutomationPlanLink, useCapability, useEngine, type ModuleProps } from "@huhu/workbench";
import { useId, useMemo, useState, type FormEvent } from "react";
import { followUpInstants, followUpWallTime } from "../shared/follow-up-time.js";

const stateText: Record<FollowUp["state"], string> = {
  scheduled: "待触发",
  accepted: "已触发",
  cancelled: "已取消",
  skipped: "已跳过",
  paused: "已暂停",
  needs_confirmation: "需要重新确认",
};
const skipReasons: Record<string, string> = {
  task_deleted: "原任务已删除。",
  task_unavailable: "原任务现已关闭或无法安排跟进。",
  stale_input: "原任务输入已更新。",
  target_unavailable: "原会话当前无法接收跟进。",
};

export function TaskFollowUp({ task, zone, onNavigate }: { task: TaskDto; zone: string | undefined; onNavigate: ModuleProps["onNavigate"] }) {
  const engine = useEngine();
  const followUp = useCapability<FollowUp | null>("automations.followUps.get", { taskId: task.id });
  const [editor, setEditor] = useState<{ open: boolean; generation: number; zone: string; initial: string | number } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const row = followUp.data;
  const canChange = !task.readOnly && !followUp.error && row !== undefined;
  const canSchedule = canChange && task.status !== "completed" && zone !== undefined;
  const active = row?.state === "scheduled" || row?.state === "paused" || row?.state === "needs_confirmation";

  function closeEditor() {
    setEditor((current) => (current ? { ...current, open: false } : null));
  }

  async function save(scheduledFor?: string) {
    setBusy(true);
    setError("");
    try {
      const input = { taskId: task.id, expectedRevision: revision };
      await engine.call(scheduledFor ? "automations.followUps.schedule" : "automations.followUps.cancel", { ...input, ...(scheduledFor && { scheduledFor }) }, { write: true });
      setNotice(scheduledFor ? "一次性跟进已保存。" : "一次性跟进已取消。");
      closeEditor();
      setConfirmCancel(false);
      await followUp.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法确认跟进状态。");
      await followUp.refetch();
    } finally {
      setBusy(false);
    }
  }

  function showDialog(mode: "edit" | "cancel") {
    setRevision(row?.revision ?? null);
    setError("");
    setNotice("");
    if (mode === "edit" && zone) {
      const initial = (active ? row?.scheduledFor : undefined) ?? Date.now() + 3_600_000;
      setEditor((current) => ({ open: true, generation: (current?.generation ?? 0) + 1, zone, initial }));
    }
    setConfirmCancel(mode === "cancel");
  }

  return (
    <section className="hu-tw-detail-section" aria-label="一次性跟进">
      <h3>一次性跟进</h3>
      {row ? (
        <p>
          <time dateTime={row.scheduledFor}>{new Date(row.scheduledFor).toLocaleString(undefined, zone ? { timeZone: zone } : {})}</time> · {stateText[row.state]}
          {row.reason && skipReasons[row.reason] ? ` · ${skipReasons[row.reason]}` : null}
        </p>
      ) : null}
      <p role="status">{notice}</p>
      {followUp.error ? <p role="alert">{followUp.error.message}</p> : null}
      <div className="row">
        {row?.planId && <AutomationPlanLink planId={row.planId} onNavigate={onNavigate} label="管理原跟进计划" />}
        {canSchedule ? <Button onClick={() => showDialog("edit")}>{row?.state === "scheduled" ? "改期" : row?.state === "needs_confirmation" ? "重新确认跟进" : "安排一次性跟进"}</Button> : null}
        {canChange && active ? <Button onClick={() => showDialog("cancel")}>取消跟进</Button> : null}
      </div>
      {editor ? (
        <FollowUpEditor key={editor.generation} open={editor.open} zone={editor.zone} title={task.title} initial={editor.initial} busy={busy} error={error} onClose={() => !busy && closeEditor()} onSave={(instant) => void save(instant)} />
      ) : null}
      <Dialog
        open={confirmCancel}
        title="取消一次性跟进"
        onClose={() => !busy && setConfirmCancel(false)}
        error={error}
        actions={
          <>
            <Button disabled={busy} onClick={() => setConfirmCancel(false)}>
              保留跟进
            </Button>
            <Button variant="danger" loading={busy} disabled={busy} onClick={() => void save()}>
              确认取消
            </Button>
          </>
        }
      >
        <p>取消「{task.title}」的这次跟进。</p>
      </Dialog>
    </section>
  );
}

function FollowUpEditor({ open, zone, title, initial, busy, error, onClose, onSave }: { open: boolean; zone: string; title: string; initial: string | number; busy: boolean; error: string; onClose(): void; onSave(instant: string): void }) {
  const form = useId();
  const field = useId();
  const [wall, setWall] = useState(() => followUpWallTime(initial, zone));
  const [choice, setChoice] = useState("");
  const [invalid, setInvalid] = useState("");
  const instants = useMemo(() => followUpInstants(wall, zone), [wall, zone]);
  const instant = instants.length === 1 ? instants[0] : choice;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!instants.length) {
      setInvalid("此时区没有这个本地时间，请另选时间。");
      return;
    }
    if (!instant || !instants.includes(instant) || Date.parse(instant) <= Date.now()) {
      setInvalid("请选择晚于当前时间的跟进时点。");
      return;
    }
    onSave(instant);
  }

  return (
    <Dialog
      open={open}
      title="一次性跟进"
      description={`原任务「${title}」· 使用时区 ${zone}。任务关闭时跳过。`}
      onClose={onClose}
      error={invalid || error}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form={form} disabled={busy} loading={busy}>
            保存跟进
          </Button>
        </>
      }
    >
      <form id={form} className="hu-form-body" onSubmit={submit}>
        <div className="hu-field">
          <label className="hu-field-label" htmlFor={field}>
            跟进时间
          </label>
          <input
            id={field}
            type="datetime-local"
            required
            disabled={busy}
            value={wall}
            onChange={(event) => {
              setWall(event.target.value);
              setChoice("");
              setInvalid("");
            }}
          />
        </div>
        {instants.length > 1 ? (
          <label className="hu-field">
            <span className="hu-field-label">回拨时间选项</span>
            <select
              required
              disabled={busy}
              value={choice}
              onChange={(event) => {
                setChoice(event.target.value);
                setInvalid("");
              }}
            >
              <option value="">选择重复时间中的时点</option>
              {instants.map((item, index) => (
                <option value={item} key={item}>
                  {index === 0 ? "较早一次" : "较晚一次"} · {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </form>
    </Dialog>
  );
}
