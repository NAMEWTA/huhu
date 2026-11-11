import type { TaskDto } from "@huhu/contracts";
import { Badge, Button, CompletionCircle, IconButton } from "@huhu/ui";
import { MarkdownPreview } from "@huhu/editor";
import { useCapability, useEngine } from "@huhu/workbench";
import { Bell, Copy, FileText, History, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { t } from "./i18n.js";

interface Run {
  id: string;
  state: string;
  startedAt: string | null;
  finishedAt: string | null;
  model: string | null;
  questions: { id: string; text: string; options: string[]; answer: string | null }[];
}
interface Space {
  id: string;
  name: string;
  root: string;
}

const fmt = (v: string | null, zone?: string): string => (v ? new Date(v).toLocaleString(undefined, zone ? { timeZone: zone } : {}) : t.detail.none);

/** 任务详情（原型 TaskDetail）：文件路径工具条 → 标题行 → 事实 → 内容 / Markdown → 关联资料 → 提醒 → Agent 处理记录。 */
export function TaskDetail({
  task,
  pending,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onClose,
  onMessage,
}: {
  task: TaskDto;
  pending: boolean;
  onToggle(next: boolean): void;
  onEdit(): void;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
  onMessage(m: string): void;
}) {
  const [source, setSource] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const agent = task.execution.kind === "agent" ? task.execution : null;
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const space = agent ? (spaces.data ?? []).find((s) => s.id === agent.spaceId) : undefined;
  const file = useCapability<{ text: string }>("vault.readFile", { path: task.path });
  const zone = useCapability<{ dateTime: { zone: string } }>("settings.get", {}).data?.dateTime.zone;
  return (
    <aside className="tw-task-detail" aria-label={t.detail.label(task.title)} data-testid="task-detail">
      <div className="tw-detail-toolbar">
        <span>
          <FileText size={14} aria-hidden />
          {task.path}
        </span>
        <IconButton icon={Copy} label={t.detail.duplicate} onClick={onDuplicate} />
        <IconButton icon={Trash2} label={t.detail.delete} onClick={() => setConfirmDelete(true)} data-testid="detail-delete" />
        <IconButton icon={Pencil} label={t.detail.edit} onClick={onEdit} data-testid="detail-edit" />
        <IconButton icon={X} label={t.detail.close} onClick={onClose} />
      </div>
      <div className="tw-detail-scroll">
        <div className="tw-detail-title">
          <CompletionCircle checked={task.completed} pending={pending} label={`${task.completed ? t.reopen : t.complete} ${task.title}`} onToggle={onToggle} />
          <h2 data-testid="detail-title">{task.title}</h2>
          <Badge>{task.completed ? t.detail.statusDone : t.detail.statusOpen}</Badge>
        </div>
        <dl className="tw-detail-facts">
          <div>
            <dt>{t.detail.due}</dt>
            <dd>{task.due ?? t.detail.dueNone}</dd>
          </div>
          <div>
            <dt>{t.detail.execution}</dt>
            <dd>{agent ? t.detail.targetAgent(space ? `${space.name} · ${space.root}` : (agent.spaceId ?? t.detail.none), agent.provider ?? t.detail.none) : t.manual}</dd>
          </div>
          <div>
            <dt>{t.detail.project}</dt>
            <dd>{task.project ?? t.detail.none}</dd>
          </div>
        </dl>
        <div className="tw-content-tabs">
          <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>
            {t.detail.content}
          </button>
          <button type="button" aria-pressed={source} onClick={() => setSource(true)}>
            {t.detail.markdown}
          </button>
        </div>
        {source ? (
          <pre className="tw-source-preview" data-testid="detail-source">
            {file.data?.text ?? ""}
          </pre>
        ) : (
          <div className="tw-markdown" data-testid="detail-body">
            <MarkdownPreview source={task.body.trim() || t.detail.noBody} />
          </div>
        )}
        {task.resources.length > 0 ? (
          <section className="tw-detail-section">
            <h3>{t.detail.resources}</h3>
            {task.resources.map((r) => (
              <p key={`${r.kind}:${r.path}`} className="tw-hint" title={r.path}>
                {r.kind === "root" ? t.picker.kind["root"] : r.path}
              </p>
            ))}
          </section>
        ) : null}
        {task.reminders.length > 0 ? (
          <section className="tw-detail-section" data-testid="detail-reminders">
            <h3>
              <Bell size={14} aria-hidden />
              {t.detail.reminders}
            </h3>
            {task.reminders.map((r) => (
              <div key={r.id} className="tw-reminder-read">
                <span>{t.detail.reminderChannel}</span>
                <time>{fmt(r.at, zone)}</time>
                <small>{!r.enabled ? t.detail.reminderOff : r.deliveredAt ? t.detail.reminderDelivered : t.detail.reminderPending}</small>
              </div>
            ))}
          </section>
        ) : null}
        {agent ? <RunRecords taskId={task.id} zone={zone} onMessage={onMessage} /> : null}
      </div>
      {confirmDelete ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="alertdialog" aria-labelledby="del-title" aria-describedby="del-desc" data-testid="detail-delete-dialog">
            <div className="modal-head">
              <div>
                <h2 id="del-title">{t.detail.deleteTitle}</h2>
              </div>
            </div>
            <div className="modal-body">
              <p id="del-desc" className="confirm-description">
                {t.detail.deleteBody(task.title)}
              </p>
            </div>
            <div className="modal-footer">
              <Button autoFocus onClick={() => setConfirmDelete(false)}>
                {t.detail.cancel}
              </Button>
              <Button variant="danger" onClick={onDelete} data-testid="detail-delete-confirm">
                {t.detail.deleteDo}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function RunRecords({ taskId, zone, onMessage }: { taskId: string; zone: string | undefined; onMessage(m: string): void }) {
  const engine = useEngine();
  const runs = useCapability<Run[]>("tasks.runs", { id: taskId });
  const [open, setOpen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const list = runs.data ?? [];
  if (list.length === 0) return null;
  async function submit(run: Run) {
    const given = run.questions.filter((q) => q.answer === null && (answers[`${run.id}:${q.id}`] ?? "").trim()).map((q) => ({ id: q.id, answer: (answers[`${run.id}:${q.id}`] ?? "").trim() }));
    if (given.length === 0) return;
    setBusy(true);
    try {
      await engine.call("automations.runs.answer", { runId: run.id, answers: given }, { write: true });
      setAnswers({});
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tw-detail-section" data-testid="task-runs" aria-label={t.detail.runs}>
      <h3>
        <History size={14} aria-hidden />
        {t.detail.runs}
      </h3>
      <p className="tw-hint">{t.detail.runsHint}</p>
      {list.map((run) => (
        <article key={run.id} className="tw-task-run" data-testid="task-run">
          <header>
            <Badge>{t.detail.runState[run.state] ?? run.state}</Badge>
            <small>
              {t.detail.started} {fmt(run.startedAt, zone)}
              {run.model ? ` · ${run.model}` : ""}
            </small>
            <button type="button" aria-expanded={open === run.id} onClick={() => setOpen(open === run.id ? null : run.id)}>
              {open === run.id ? t.detail.collapse : t.detail.expand}
            </button>
          </header>
          {open === run.id ? <RunBody runId={run.id} /> : null}
          {run.state === "waiting_input" ? (
            <div data-testid="run-questions">
              {run.questions.map((q) => (
                <div key={q.id} className="field">
                  <span className="field-label">{q.text}</span>
                  {q.answer !== null ? (
                    <span className="hint-text">
                      {t.detail.answered}：{q.answer}
                    </span>
                  ) : (
                    <>
                      {q.options.length > 0 ? (
                        <div className="segmented" role="group" aria-label={q.text}>
                          {q.options.map((o) => (
                            <button key={o} type="button" className={answers[`${run.id}:${q.id}`] === o ? "active" : ""} aria-pressed={answers[`${run.id}:${q.id}`] === o} onClick={() => setAnswers({ ...answers, [`${run.id}:${q.id}`]: o })}>
                              {o}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input
                        aria-label={`${t.detail.answer} ${q.id}`}
                        placeholder={t.detail.answerPlaceholder}
                        value={answers[`${run.id}:${q.id}`] ?? ""}
                        onChange={(e) => setAnswers({ ...answers, [`${run.id}:${q.id}`]: e.target.value })}
                      />
                    </>
                  )}
                </div>
              ))}
              <Button variant="primary" loading={busy} onClick={() => void submit(run)}>
                {t.detail.answer}
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function RunBody({ runId }: { runId: string }) {
  const d = useCapability<{ body: string }>("automations.runs.read", { runId });
  return (
    <div className="markdown" data-testid="run-result">
      <MarkdownPreview source={d.data?.body.trim() || t.detail.none} />
    </div>
  );
}
