import type { TaskDto, TaskStatus } from "@huhu/contracts";
import { Badge, Button, IconButton } from "@huhu/ui";
import { MarkdownEditor, MarkdownPreview, referenceCompletion } from "@huhu/editor";
import { requestOpenPath, useCapability, useEngine } from "@huhu/workbench";
import { AlertTriangle, Bell, Copy, FileText, History, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "./i18n.js";
import { useReferenceIndex } from "./references.js";
import { StatusSelect } from "./TaskViews.js";

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

/**
 * 任务详情（Issue 式）：标题、类型、状态、标签 → 不可派发原因 / 文件问题 → `<task>` 渲染 → 引用列表（带失效标记）→ 评论时间线 → 运行记录 → 底部评论输入框（支持 `@` 补全）。
 * 列表、看板、详情读的是同一份数据。
 */
export function TaskDetail({
  task,
  pending,
  onStatus,
  onEdit,
  onDuplicate,
  onDelete,
  onClose,
  onMessage,
  onChanged,
  onOpenNotes,
}: {
  task: TaskDto;
  pending: boolean;
  onStatus(task: TaskDto, next: TaskStatus): void;
  onEdit(): void;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
  onMessage(m: string): void;
  onChanged(): void;
  onOpenNotes(): void;
}) {
  const [source, setSource] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const agent = task.type === "agent" ? task.execution : null;
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const space = agent ? (spaces.data ?? []).find((s) => s.id === agent.spaceId) : undefined;
  const file = useCapability<{ text: string }>("vault.readFile", { path: task.path });
  const zone = useCapability<{ dateTime: { zone: string } }>("settings.get", {}).data?.dateTime.zone;
  const refs = useReferenceIndex();
  const openWiki = (target: string) => {
    requestOpenPath(target);
    onOpenNotes();
  };
  return (
    <aside className="tasks-task-detail" aria-label={t.detail.label(task.title)} data-testid="task-detail">
      <div className="hu-tw-detail-toolbar">
        <span>
          <FileText size={14} aria-hidden />
          {task.path}
        </span>
        <IconButton icon={Copy} label={t.detail.duplicate} onClick={onDuplicate} />
        <IconButton icon={Trash2} label={t.detail.delete} onClick={() => setConfirmDelete(true)} data-testid="detail-delete" />
        <IconButton icon={Pencil} label={t.detail.edit} onClick={onEdit} data-testid="detail-edit" />
        <IconButton icon={X} label={t.detail.close} onClick={onClose} />
      </div>
      <div className="tasks-detail-scroll">
        <div className="hu-tw-detail-title">
          <StatusSelect task={task} pending={pending} onStatus={(x, s) => onStatus(x, s)} />
          <h2 data-testid="detail-title">{task.title}</h2>
          <Badge>{task.type === "agent" ? t.agent : t.manual}</Badge>
        </div>
        {task.tags.length > 0 ? (
          <div className="tasks-tags" data-testid="detail-tags">
            {task.tags.map((tag) => (
              <span key={tag} className="tasks-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {task.problems.length > 0 ? (
          <div role="alert" className="hu-callout danger" data-testid="detail-problems">
            <p>
              <strong>{t.detail.fileProblems}</strong>
            </p>
            <ul>
              {task.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {task.type === "agent" && task.status === "not_started" && task.dispatchBlockers.length > 0 ? (
          <div role="status" className="hu-callout" data-testid="detail-blockers">
            <p>
              <AlertTriangle size={14} aria-hidden /> <strong>{t.detail.blocked}</strong>
            </p>
            <ul>
              {task.dispatchBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <dl className="tasks-detail-facts">
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
        <div className="hu-tw-content-tabs">
          <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>
            {t.detail.content}
          </button>
          <button type="button" aria-pressed={source} onClick={() => setSource(true)}>
            {t.detail.markdown}
          </button>
        </div>
        {source ? (
          <pre className="hu-tw-source-preview" data-testid="detail-source">
            {file.data?.text ?? ""}
          </pre>
        ) : (
          <div className="automations-markdown" data-testid="detail-body">
            <MarkdownPreview source={task.body.trim() || t.detail.noBody} resolveWikiLink={refs.exists} onOpenWikiLink={openWiki} />
          </div>
        )}
        {task.references.length > 0 ? (
          <section className="hu-tw-detail-section" data-testid="detail-references">
            <h3>{t.detail.references}</h3>
            {task.references.map((r) => (
              <p key={`${r.from}:${r.path}`} className={`tasks-reference${r.exists ? "" : " is-missing"}`} title={r.path}>
                <button type="button" disabled={!r.exists} onClick={() => openWiki(r.path)}>
                  {r.path}
                </button>
                {!r.exists ? <small data-testid="reference-missing">{t.detail.missing}</small> : null}
              </p>
            ))}
          </section>
        ) : null}
        {task.reminders.length > 0 ? (
          <section className="hu-tw-detail-section" data-testid="detail-reminders">
            <h3>
              <Bell size={14} aria-hidden />
              {t.detail.reminders}
            </h3>
            {task.reminders.map((r) => (
              <div key={r.id} className="tasks-reminder-read">
                <span>{t.detail.reminderChannel}</span>
                <time>{fmt(r.at, zone)}</time>
                <small>{!r.enabled ? t.detail.reminderOff : r.deliveredAt ? t.detail.reminderDelivered : t.detail.reminderPending}</small>
              </div>
            ))}
          </section>
        ) : null}
        <Timeline task={task} zone={zone} refs={refs} onOpen={openWiki} />
        {agent ? <RunRecords taskId={task.id} zone={zone} onMessage={onMessage} /> : null}
        <CommentComposer task={task} refs={refs} onStatus={onStatus} onChanged={onChanged} onMessage={onMessage} />
      </div>
      {confirmDelete ? (
        <div className="hu-modal-backdrop" role="presentation">
          <div className="hu-modal" role="alertdialog" aria-labelledby="del-title" aria-describedby="del-desc" data-testid="detail-delete-dialog">
            <div className="hu-modal-head">
              <div>
                <h2 id="del-title">{t.detail.deleteTitle}</h2>
              </div>
            </div>
            <div className="hu-modal-body">
              <p id="del-desc" className="hu-confirm-description">
                {t.detail.deleteBody(task.title)}
              </p>
            </div>
            <div className="hu-modal-footer">
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

/** 评论时间线：评论、系统事件、请求卡片、结果卡片都来自任务文件里的 `<comments>`（外部编辑器改了也会刷新）。 */
function Timeline({ task, zone, refs, onOpen }: { task: TaskDto; zone: string | undefined; refs: ReturnType<typeof useReferenceIndex>; onOpen(target: string): void }) {
  if (task.comments.length === 0) return null;
  return (
    <section className="hu-tw-detail-section tw-timeline" data-testid="task-timeline" aria-label={t.detail.timeline}>
      <h3>{t.detail.timeline}</h3>
      {task.comments.map((c) => (
        <article key={c.id} className={`tasks-comment tasks-comment-${c.source}`} data-testid="task-comment" data-comment-id={c.id} data-source={c.source}>
          <header>
            <Badge>{t.detail.source[c.source]}</Badge>
            {c.author ? <strong>{c.author}</strong> : null}
            {c.event ? <small>{c.event}</small> : null}
            <time>{fmt(c.at, zone)}</time>
          </header>
          {c.ask ? <p className="tasks-ask">{t.detail.needsYou}</p> : null}
          <div className="automations-markdown">
            <MarkdownPreview source={c.body} resolveWikiLink={refs.exists} onOpenWikiLink={onOpen} />
          </div>
        </article>
      ))}
    </section>
  );
}

/** 发表评论：追加一条 source=human 的评论；不会启动 Agent、不改变 inputRevision，会进入下一次派发的快照。 */
function CommentComposer({ task, refs, onStatus, onChanged, onMessage }: { task: TaskDto; refs: ReturnType<typeof useReferenceIndex>; onStatus(task: TaskDto, next: TaskStatus): void; onChanged(): void; onMessage(m: string): void }) {
  const engine = useEngine();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const extensions = useMemo(() => [referenceCompletion(refs.search)], [refs.search]);
  async function submit(close: boolean) {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await engine.call("tasks.comments.add", { taskId: task.id, body }, { write: true });
      setText("");
      onChanged();
      if (close && task.status !== "completed") onStatus(task, "completed");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hu-tw-detail-section tw-composer" data-testid="comment-composer">
      <h3>{t.detail.addComment}</h3>
      <div className="tasks-composer-editor" data-testid="comment-input">
        <MarkdownEditor documentId={`comment-${task.id}`} value={text} mode="source" lineNumbers={false} ariaLabel={t.detail.addComment} extensions={extensions} onChange={(v) => setText(v)} />
      </div>
      <div className="row">
        <Button variant="primary" loading={busy} disabled={!text.trim()} data-testid="comment-submit" onClick={() => void submit(false)}>
          {t.detail.postComment}
        </Button>
        {task.status !== "completed" ? (
          <Button loading={busy} disabled={!text.trim()} data-testid="comment-submit-close" onClick={() => void submit(true)}>
            {t.detail.postAndClose}
          </Button>
        ) : null}
      </div>
    </section>
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
    <section className="hu-tw-detail-section" data-testid="task-runs" aria-label={t.detail.runs}>
      <h3>
        <History size={14} aria-hidden />
        {t.detail.runs}
      </h3>
      <p className="tasks-hint">{t.detail.runsHint}</p>
      {list.map((run) => (
        <article key={run.id} className="tasks-task-run" data-testid="task-run">
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
                <div key={q.id} className="hu-field">
                  <span className="hu-field-label">{q.text}</span>
                  {q.answer !== null ? (
                    <span className="hu-hint-text">
                      {t.detail.answered}：{q.answer}
                    </span>
                  ) : (
                    <>
                      {q.options.length > 0 ? (
                        <div className="hu-segmented-alt" role="group" aria-label={q.text}>
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
