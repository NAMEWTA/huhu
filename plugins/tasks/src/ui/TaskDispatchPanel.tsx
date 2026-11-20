import { isTaskAvailable, type TaskDto } from "@huhu/contracts";
import { Badge, Button, Dialog, Field } from "@huhu/ui";
import { CapabilityError, createRequestId, requestOpenAgentSession, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import type { z } from "zod";
import type { DispatchInput, DispatchReceipt, TaskDispatchView, TaskRunSummary } from "../engine/dispatch-store.js";
import type { TaskReplyView, TaskSupplementView } from "../engine/native-replies.js";
import type { TaskQuestionView } from "../engine/receipt-inbox.js";
import { TaskMarkdownView } from "./compact.js";
import { t } from "./i18n.js";
import { useReferenceIndex } from "./references.js";

type Reply = z.infer<typeof TaskReplyView>;
type Question = z.infer<typeof TaskQuestionView> & { reply?: Reply };
type Supplement = z.infer<typeof TaskSupplementView>;

const receiptState: Record<DispatchReceipt["state"], string> = {
  pending: "已受理",
  claimed: "派遣排队",
  sending: "正在确认发送",
  running: "执行已开始",
  unknown: "待核实",
  cancelled: "已取消",
  stale_input: "任务输入已更新",
  expired: "派遣窗口已过",
  blocked: "无法派遣",
};
const receiptReason: Record<NonNullable<DispatchReceipt["reason"]>, string> = {
  waiting_resource: "等原会话可用。",
  waiting_schedule: "等最早派遣时间。",
  task_occupied: "此任务已有活动运行。",
  task_closed: "任务已关闭。",
  task_unavailable: "任务当前不可派遣。",
  target_unavailable: "原会话未连接或已不可用。",
  target_unsupported: "此 Agent 或会话目标不支持受控派遣。",
  foreign_machine: "此运行由另一处本地环境持有。",
  awaiting_confirmation: "未收到可靠的发送确认，继续核对原派遣。",
};
const inputState: Record<Reply["status"], string> = {
  pending: "已保存，等待发送",
  sending: "正在发送",
  unknown: "待核实，正在核对原输入",
  accepted: "已送达",
  expired: "原请求已失效",
  not_sent: "未发送",
  unsupported: "原会话不支持此操作",
};

export function taskRunLabel(row: TaskDispatchView, run: TaskRunSummary | null | undefined) {
  return (run ? t.detail.runState[run.state] : undefined) ?? receiptState[row.state];
}

export function TaskDispatchPanel({ task, zone, runs, rows, readError, onNavigate }: { task: TaskDto; zone: string | undefined; runs: TaskRunSummary[]; rows: TaskDispatchView[] | undefined; readError: Error | null; onNavigate(): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [opened, setOpened] = useState<string | null>(null);
  const [request, setRequest] = useState<DispatchInput | null>(null);
  const [earlyDialog, setEarlyDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const busyTask = rows?.some(({ state, runId }) => ["pending", "claimed", "sending", "unknown"].includes(state) || (state === "running" && !runs.some(({ id, finishedAt }) => id === runId && finishedAt))) ?? false;
  const canDispatch = !task.readOnly && task.status === "not_started" && !busyTask && rows !== undefined && !readError && task.dispatchBlockers.length === 0;
  const early = !isTaskAvailable(task.availableAt, new Date());

  useEffect(() => {
    if (!busyTask) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && ["tasks.dispatch.list", "tasks.questions.list", "tasks.runs"].includes(String(capability)) });
    }, 1_500);
    return () => clearInterval(timer);
  }, [busyTask, engine.vaultId, qc]);

  const refresh = () => qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && String(capability).startsWith("tasks.") });
  function newRequest(allowEarly: boolean): DispatchInput {
    return { taskId: task.id, dispatchId: createRequestId(), expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash, ...(allowEarly && { allowEarly: true }) };
  }
  async function submit(intent: DispatchInput) {
    setEarlyDialog(false);
    setSubmitting(true);
    setNote("");
    setError("");
    setRequest(intent);
    try {
      await engine.call("tasks.dispatch", intent, { write: true, idempotencyKey: intent.dispatchId });
      setRequest(null);
      setNote("派遣已受理。");
      await refresh();
    } catch (failure) {
      if (failure instanceof CapabilityError && failure.code !== "INTERNAL" && failure.code !== "UNAUTHENTICATED") {
        setRequest(null);
        setError(failure.message);
        await refresh();
      } else setNote("未收到派遣确认。请核对原请求。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="hu-tw-detail-section" aria-label="Agent 派遣">
      <h3>
        <History size={14} aria-hidden /> Agent 派遣
      </h3>
      {task.status === "not_started" ? (
        <div className="row">
          {request ? (
            <Button loading={submitting} disabled={submitting} onClick={() => void submit(request)}>
              核对原请求
            </Button>
          ) : (
            <Button variant="primary" disabled={!canDispatch || submitting} onClick={() => (early ? setEarlyDialog(true) : void submit(newRequest(false)))}>
              {early ? "提前派遣" : "立即派遣"}
            </Button>
          )}
        </div>
      ) : null}
      <p role="status">{note}</p>
      {error || readError ? (
        <p role="alert" className="hu-field-error">
          {error || readError?.message}
        </p>
      ) : null}
      {rows?.map((row) => {
        const run = runs.find(({ id }) => id === row.runId);
        const expanded = opened === row.runId;
        return (
          <article key={row.runId} className="tasks-task-run" data-testid="managed-task-run" data-run-id={row.runId}>
            <header>
              <Badge tone={row.state === "unknown" ? "warning" : "neutral"}>{taskRunLabel(row, run)}</Badge>
              <time dateTime={row.acceptedAt}>{new Date(row.acceptedAt).toLocaleString(undefined, zone ? { timeZone: zone } : {})}</time>
              <button type="button" aria-expanded={expanded} onClick={() => setOpened(expanded ? null : row.runId)}>
                {expanded ? t.detail.collapse : t.detail.expand}
              </button>
            </header>
            {row.reason ? <p role="status">{receiptReason[row.reason]}</p> : null}
            <CancelQueuedRun task={task} row={row} refresh={refresh} />
            {expanded ? <TaskRunDetails task={task} row={row} run={run} onOpenAgent={onNavigate} /> : null}
          </article>
        );
      })}
      <Dialog
        open={earlyDialog}
        title="提前派遣"
        onClose={() => setEarlyDialog(false)}
        actions={
          <>
            <Button onClick={() => setEarlyDialog(false)}>取消</Button>
            <Button variant="primary" disabled={!canDispatch} onClick={() => void submit(newRequest(true))}>
              确认提前派遣
            </Button>
          </>
        }
      >
        <p>最早派遣时间为 {task.availableAt ? new Date(task.availableAt).toLocaleString(undefined, zone ? { timeZone: zone } : {}) : "未设置"}。确认后仅对此次派遣提前。</p>
      </Dialog>
    </section>
  );
}

function CancelQueuedRun({ task, row, refresh }: { task: TaskDto; row: TaskDispatchView; refresh(): Promise<void> }) {
  const engine = useEngine();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (row.state !== "pending" && row.state !== "claimed") return null;
  async function cancel() {
    setError("");
    setBusy(true);
    try {
      await engine.call("tasks.dispatch.cancel", { taskId: task.id, dispatchId: row.dispatchId }, { write: true, idempotencyKey: row.dispatchId });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button loading={busy} disabled={busy || task.readOnly || row.cancelRequested || row.reason === "foreign_machine"} onClick={() => void cancel()}>
        取消排队
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

export function TaskRunDetails({ task, row, run, showQueue = false, onOpenAgent }: { task: TaskDto; row: TaskDispatchView; run: TaskRunSummary | null | undefined; showQueue?: boolean; onOpenAgent?: (() => void) | undefined }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const refs = useReferenceIndex();
  const questions = useCapability<Question[]>("tasks.questions.list", { taskId: task.id });
  const refresh = () => qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && String(capability).startsWith("tasks.") });
  const session = row.session;
  const messages = task.comments.filter((comment) => comment.run === row.runId && (comment.event === "result" || comment.event === "failed"));
  return (
    <>
      {showQueue && row.reason ? <p role="status">{receiptReason[row.reason]}</p> : null}
      {showQueue ? <CancelQueuedRun task={task} row={row} refresh={refresh} /> : null}
      {session && onOpenAgent ? (
        <Button
          onClick={() => {
            requestOpenAgentSession({ vaultId: engine.vaultId, spaceId: session.spaceId, sessionId: session.id });
            onOpenAgent();
          }}
        >
          定位原会话
        </Button>
      ) : null}
      {questions.error ? (
        <p role="alert" className="hu-field-error">
          {questions.error.message}
        </p>
      ) : null}
      {(questions.data ?? [])
        .filter((question) => question.runId === row.runId)
        .map((question) => (
          <RunQuestion key={`${question.requestId}:${question.requestVersion}`} task={task} question={question} refresh={refresh} />
        ))}
      {session && task.status === "in_progress" && run?.state === "running" && !task.readOnly ? <RunSupplement task={task} row={row} refresh={refresh} /> : null}
      {run?.finishedAt ? (
        <div data-testid="managed-run-result">
          {messages.length ? messages.map((message) => <TaskMarkdownView key={message.id} id={`run-result-${message.id}`} value={message.body} refs={refs} />) : <p>结果正文尚未写入，或本轮没有正文。</p>}
        </div>
      ) : null}
    </>
  );
}

function RunQuestion({ task, question, refresh }: { task: TaskDto; question: Question; refresh(): Promise<void> }) {
  const engine = useEngine();
  const [answer, setAnswer] = useState("");
  const [intent, setIntent] = useState<{ replyId: string; answer: string } | null>(null);
  const [local, setLocal] = useState<Reply | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const receipt = question.reply ?? local;
  const editable = !receipt && !task.readOnly && task.status !== "completed" && question.status === "awaiting";
  async function submit() {
    if (!answer.trim() || busy) return;
    setBusy(true);
    setFailure("");
    const request = intent ?? { replyId: createRequestId(), answer: answer.trim() };
    setIntent(request);
    try {
      const { runId, sessionId, requestId, requestVersion } = question;
      setLocal(await engine.call<Reply>("tasks.reply", { taskId: task.id, runId, sessionId, requestId, requestVersion, ...request }, { write: true, idempotencyKey: request.replyId }));
      await refresh();
    } catch (error) {
      if (error instanceof CapabilityError && error.code !== "INTERNAL" && error.code !== "UNAUTHENTICATED") {
        setIntent(null);
        setFailure(error.message);
      } else setFailure("未收到回答确认，请核对原请求。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p>{question.text}</p>
      {receipt ? <p role="status">{inputState[receipt.status]}</p> : null}
      {!receipt && question.status === "closed" ? <p>原请求已结束。</p> : null}
      {editable ? (
        <div className="hu-stack">
          {question.options.length ? (
            <fieldset>
              <legend>回答选项</legend>
              {question.options.map((choice, index) => (
                <label key={index}>
                  <input type="radio" name={question.requestId} value={choice} disabled={!!intent || busy} checked={answer === choice} onChange={() => setAnswer(choice)} />
                  {choice}
                </label>
              ))}
            </fieldset>
          ) : null}
          <Field label="回答">
            <textarea aria-label="回答" rows={3} maxLength={20_000} disabled={!!intent || busy} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!answer.trim() || busy} loading={busy}>
            {intent ? "核对原回答" : "发送回答"}
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="hu-field-error">
          {failure}
        </p>
      ) : null}
    </form>
  );
}

function RunSupplement({ task, row, refresh }: { task: TaskDto; row: TaskDispatchView; refresh(): Promise<void> }) {
  const engine = useEngine();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<{ supplementId: string; text: string } | null>(null);
  const [receipt, setReceipt] = useState<Supplement | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!receipt || !["pending", "sending", "unknown"].includes(receipt.status)) return;
    const { taskId, runId, sessionId, supplementId } = receipt;
    const abort = new AbortController();
    const timer = setInterval(() => {
      void engine.call<Supplement>("tasks.supplement.read", { taskId, runId, sessionId, supplementId }, { signal: abort.signal }).then(
        (next) => {
          if (!abort.signal.aborted) setReceipt(next);
        },
        () => undefined,
      );
    }, 1_500);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [engine, receipt]);
  async function send() {
    if (!text.trim() || !row.session || busy) return;
    setFailure("");
    setBusy(true);
    const request = intent ?? { supplementId: createRequestId(), text: text.trim() };
    setIntent(request);
    try {
      setReceipt(await engine.call<Supplement>("tasks.supplement", { taskId: task.id, runId: row.runId, sessionId: row.session.id, ...request }, { write: true, idempotencyKey: request.supplementId }));
      setIntent(null);
      setText("");
      setOpen(false);
      await refresh();
    } catch (error) {
      if (error instanceof CapabilityError && error.code !== "INTERNAL" && error.code !== "UNAUTHENTICATED") {
        setIntent(null);
        setFailure(error.message);
      } else setFailure("未收到补充确认，请核对原请求。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>发送补充信息</Button>
      {receipt ? <p role="status">补充信息{inputState[receipt.status]}</p> : null}
      <Dialog
        open={open}
        title="发送补充信息"
        description="补充会先保存。会话忙时会等待原轮结束。"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        error={failure}
        actions={
          <>
            <Button disabled={busy} onClick={() => setOpen(false)}>
              返回
            </Button>
            <Button variant="primary" loading={busy} disabled={!text.trim() || busy} onClick={() => void send()}>
              {intent ? "核对原补充" : "发送补充"}
            </Button>
          </>
        }
      >
        <Field label="补充内容">
          <textarea aria-label="补充内容" rows={4} maxLength={20_000} disabled={!!intent || busy} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}
