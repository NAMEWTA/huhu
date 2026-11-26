import { isTaskAvailable, type TaskDto } from "@huhu/contracts";
import { Badge, Button, Dialog, Field } from "@huhu/ui";
import { CapabilityError, createRequestId, host, requestOpenAgentSession, requestOpenMailDelivery, useCapability, useEngine, useQueryClient, type ModuleProps, type TaskDestination } from "@huhu/workbench";
import { History } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { z } from "zod";
import type { DispatchInput, DispatchReceipt, RetryDispatch, StopReceipt, TaskDispatchView, TaskRunSummary } from "../engine/dispatch-store.js";
import type { taskToolDescriptors } from "../engine/index.js";
import type { TaskReplyView, TaskSupplementView } from "../engine/native-replies.js";
import type { TaskQuestionView } from "../engine/receipt-inbox.js";
import type { resultDeliveryDescriptors } from "../engine/result-delivery.js";
import { TaskRunMarkdownView } from "./compact.js";
import { t } from "./i18n.js";
import { NewTaskRoundDialog } from "./NewTaskRoundDialog.js";
import { useReferenceIndex } from "./references.js";

type Reply = z.infer<typeof TaskReplyView>;
type Question = z.infer<typeof TaskQuestionView> & { reply?: Reply };
type Supplement = z.infer<typeof TaskSupplementView>;
type GitHubDelivery = z.output<typeof resultDeliveryDescriptors.githubReadDelivery.output>;
type MailDelivery = z.output<typeof resultDeliveryDescriptors.readMailDelivery.output>;
type DispatchResources = z.output<typeof taskToolDescriptors.dispatchResources.output>;

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
const stopStates: Record<StopReceipt["status"], string> = {
  pending: "停止请求已受理",
  sending: "正在确认原轮停止",
  stopped: "本轮已停止",
  completed: "原轮已结束",
  not_sent: "停止请求未发送",
  unknown: "停止结果待核实",
  stale: "原轮的执行绑定已失效",
  unsupported: "原会话不支持停止本轮",
};

export function taskRunLabel(row: TaskDispatchView, run: TaskRunSummary | null | undefined) {
  if (run?.state === "unknown" && run.finishedAt) return "执行已结束，结果待核实";
  return row.superseded ? "已失败" : ((run ? t.detail.runState[run.state] : undefined) ?? receiptState[row.state]);
}

export function TaskDispatchPanel({ task, zone, runs, rows, readError, onOpenAgent, onNavigate, destination }: {
  destination?: TaskDestination | undefined;
  task: TaskDto;
  zone: string | undefined;
  runs: TaskRunSummary[];
  rows: TaskDispatchView[] | undefined;
  readError: Error | null;
  onOpenAgent(): void;
  onNavigate?: ModuleProps["onNavigate"];
}) {
  const engine = useEngine();
  const qc = useQueryClient();
  // Observe the list query that supplies this task without starting a second request.
  const { isFetching: taskRefreshing } = useCapability<TaskDto[]>("tasks.list", { category: "all" }, { enabled: false });
  const [opened, setOpened] = useState<string | null>(null);
  const runList = useRef<HTMLElement>(null);
  const destinationUsed = useRef<TaskDestination>(null);
  useEffect(() => {
    if (!destination || destinationUsed.current === destination) return;
    const match = rows?.find(({ runId, superseded }) => runId === destination.runId && !superseded);
    if (!match) return;
    destinationUsed.current = destination;
    setOpened(match.dispatchId);
    if (!destination.questionId) {
      runList.current?.querySelector<HTMLElement>(`[data-run-id="${CSS.escape(match.runId)}"]`)?.focus();
    }
  }, [destination, rows]);
  const [request, setRequest] = useState<DispatchInput | null>(null);
  const [retry, setRetry] = useState<RetryDispatch | null>(null);
  const [earlyDialog, setEarlyDialog] = useState(false);
  const [newRoundOpen, setNewRoundOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const finishedRuns = new Set(runs.filter(({ finishedAt }) => finishedAt).map(({ id }) => id));
  const busyTask =
    rows?.some(({ state, runId, stop, superseded }) => !superseded && (["pending", "claimed", "sending", "unknown"].includes(state) || (state === "running" && stop?.status !== "stopped" && !finishedRuns.has(runId)))) ?? false;
  const ready = task.type === "agent" && !task.readOnly && !busyTask && !retry && rows !== undefined && !readError && task.dispatchBlockers.length === 0;
  const canDispatch = ready && task.status === "not_started";
  const hasEndedRound = rows?.some(({ superseded, state, reason, stop, runId }) =>
    !superseded && state === "running" && reason !== "foreign_machine" && (stop?.status === "stopped" || finishedRuns.has(runId)));
  const showNewRound = task.status === "in_progress" && !task.readOnly && (task.execution?.target?.mode ?? "new") === "new" && hasEndedRound === true;
  const canStartRound = showNewRound && ready && !request && !submitting;
  const early = !isTaskAvailable(task.availableAt, new Date());

  useEffect(() => {
    if (!busyTask) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && ["tasks.dispatch.list", "tasks.dispatch.resources", "tasks.questions.list", "tasks.runs"].includes(String(capability)) });
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
      setNote(intent.newRound ? "新轮次已受理。" : "派遣已受理。");
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

  async function submitRetry(intent: RetryDispatch) {
    setRetry(intent);
    setSubmitting(true);
    setNote("");
    setError("");
    try {
      await engine.call("tasks.dispatch.retry", intent, { write: true, idempotencyKey: intent.retryId });
      setRetry(null);
      setNote("原输入重试已受理。");
      await refresh();
    } catch (failure) {
      if (failure instanceof CapabilityError && failure.code !== "INTERNAL" && failure.code !== "UNAUTHENTICATED") {
        setRetry(null);
        setError(failure.message);
        await refresh();
      } else setNote("未收到重试确认。请核对原重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section ref={runList} className="hu-tw-detail-section" aria-label="Agent 派遣">
      <h3>
        <History size={14} aria-hidden /> Agent 派遣
      </h3>
      <TaskResources zone={zone} />
      {request ? (
        <Button loading={submitting} onClick={() => void submit(request)}>核对原请求</Button>
      ) : task.status === "not_started" ? (
        <div className="row">
          <Button variant="primary" disabled={!canDispatch || submitting} onClick={() => (early ? setEarlyDialog(true) : void submit(newRequest(false)))}>
            {early ? "提前派遣" : "立即派遣"}
          </Button>
        </div>
      ) : null}
      {showNewRound ? (
        <Button variant="primary" aria-disabled={!canStartRound} onClick={() => { if (canStartRound) setNewRoundOpen(true); }}>
          开始新一轮
        </Button>
      ) : null}
      {retry ? (
        <Button loading={submitting} disabled={submitting} onClick={() => void submitRetry(retry)}>
          核对原重试
        </Button>
      ) : null}
      <p role="status">{note}</p>
      {error || readError ? (
        <p role="alert" className="hu-field-error">
          {error || readError?.message}
        </p>
      ) : null}
      {rows?.map((row) => {
        const run = runs.find(({ id }) => id === row.runId);
        const expanded = opened === row.dispatchId;
        return (
          <article key={row.dispatchId} tabIndex={-1} className="tasks-task-run" data-testid="managed-task-run" data-run-id={row.runId}>
            <header>
              <Badge tone={row.state === "unknown" ? "warning" : "neutral"}>{taskRunLabel(row, run)}</Badge>
              {row.attempt > 1 || row.superseded ? <span>第 {row.attempt} 次尝试</span> : null}
              <time dateTime={row.acceptedAt}>{new Date(row.acceptedAt).toLocaleString(undefined, zone ? { timeZone: zone } : {})}</time>
              {!row.superseded ? (
                <button type="button" aria-expanded={expanded} onClick={() => setOpened(expanded ? null : row.dispatchId)}>
                  {expanded ? t.detail.collapse : t.detail.expand}
                </button>
              ) : null}
            </header>
            {row.reason ? <p role="status">{receiptReason[row.reason]}</p> : null}
            {row.canRetry && !retry ? (
              <Button disabled={submitting || !!request} onClick={() => void submitRetry({ taskId: task.id, dispatchId: row.dispatchId, retryId: createRequestId() })}>
                重试原输入
              </Button>
            ) : null}
            {!row.superseded ? <CancelQueuedRun task={task} row={row} refresh={refresh} /> : null}
            {expanded ? (
              <TaskRunDetails
                task={task}
                questionFocus={destination?.runId === row.runId ? destination : undefined}
                taskRefreshing={taskRefreshing}
                row={row}
                run={run}
                onOpenAgent={onOpenAgent}
                onNavigate={onNavigate}
              />
            ) : null}
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
      {newRoundOpen ? (
        <NewTaskRoundDialog
          task={task}
          canStart={canStartRound}
          early={early}
          onClose={() => setNewRoundOpen(false)}
          onStart={(context) => {
            setNewRoundOpen(false);
            void submit({ ...newRequest(early), newRound: true, context });
          }}
        />
      ) : null}
    </section>
  );
}

const capacityLabel = ({ limit, occupied }: DispatchResources["device"]["active"]) =>
  limit === null ? "未配置上限" : `${occupied ?? "未知"} / ${limit}`;

function TaskResources({ zone }: { zone: string | undefined }) {
  const { data, error, isFetching, refetch } = useCapability<DispatchResources>("tasks.dispatch.resources");
  const { vault, device } = data ?? {};
  const waitingSince = (at: string | null) => at
    ? <time dateTime={at}>{new Date(at).toLocaleString(undefined, { timeZone: zone })}</time>
    : "—";

  return (
    <section className="tasks-resources" aria-label="本机派遣资源">
      <div className="row">
        <h4>本机派遣资源</h4>
        <Button variant="ghost" aria-disabled={isFetching} onClick={() => { if (!isFetching) void refetch(); }}>刷新资源</Button>
      </div>
      {error ? <p role="status">暂时无法读取派遣资源。</p> : null}
      {!data && !error ? <p role="status">正在读取派遣资源…</p> : null}
      {vault && device ? (
        <>
          <dl className="tasks-resource-counts">
            <div><dt>本机活动名额</dt><dd>{capacityLabel(device.active)}</dd></div>
            <div><dt>本机保留名额</dt><dd>{capacityLabel(device.retained)}</dd></div>
            <div><dt>当前库活动运行</dt><dd>{vault.active}</dd></div>
            <div><dt>当前库保留进程</dt><dd>{vault.retained ?? "不可用"}</dd></div>
            <div><dt>排队积压</dt><dd>{vault.pending}</dd></div>
            <div><dt>最早排队</dt><dd>{waitingSince(vault.oldestPendingAt)}</dd></div>
            <div><dt>待核实积压</dt><dd>{vault.unknown}</dd></div>
            <div><dt>最早待核实</dt><dd>{waitingSince(vault.oldestUnknownAt)}</dd></div>
            <div><dt>等待原生回答</dt><dd>{vault.waitingNative}</dd></div>
            <div><dt>最早等待原生回答</dt><dd>{waitingSince(vault.oldestNativeWaitAt)}</dd></div>
          </dl>
          {vault.waitingNative > 0 ? <p>等待原生回答时释放活动名额，保留原会话以接收回答。</p> : null}
          {vault.unknown > 0 ? <p>执行结果待核实时继续保留相关活动占用。</p> : null}
          {vault.retained ? <p>仍在启动、运行或状态待核实的受控会话占用保留名额。</p> : null}
        </>
      ) : null}
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

export function TaskRunDetails({
  task,
  taskRefreshing,
  questionFocus,
  row,
  run,
  showQueue = false,
  onOpenAgent,
  onNavigate,
}: {
  task: TaskDto;
  taskRefreshing: boolean;
  questionFocus?: TaskDestination | undefined;
  row: TaskDispatchView;
  run: TaskRunSummary | null | undefined;
  showQueue?: boolean;
  onOpenAgent?: (() => void) | undefined;
  onNavigate?: ModuleProps["onNavigate"];
}) {
  const engine = useEngine();
  const qc = useQueryClient();
  const refs = useReferenceIndex();
  const questions = useCapability<Question[]>("tasks.questions.list", { taskId: task.id });
  const refresh = () => qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && String(capability).startsWith("tasks.") });
  const session = row.session;
  const messages = task.comments.filter((comment) => comment.run === row.runId && (comment.event === "result" || comment.event === "failed"));
  const result = run?.result;
  let deliveryNotice = "";
  if (run?.finishedAt && run.state === "unknown") deliveryNotice = "原执行已结束，结果待核实。";
  else if (run?.state === "interrupted") deliveryNotice = "原执行被外部中断。";
  else if (result?.kind === "no_update") deliveryNotice = "原会话已结束，本轮没有结果正文。";
  else if (result?.delivery === "pending") deliveryNotice = "已保存原结果回执，正在核对任务时间线投递。";
  else if (result?.delivery === "target_missing") deliveryNotice = "原结果回执已保存，投递时未找到原任务。";
  else if (result?.delivery === "delivered" && messages.length === 0) {
    deliveryNotice = taskRefreshing ? "正在读取任务时间线中的运行结果…" : "未在原任务时间线中找到本次运行的结果正文。";
  }
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
      {session && row.state === "running" && !run?.finishedAt ? <TaskRunWaiting session={session} taskId={task.id} runId={row.runId} /> : null}
      <StopRun task={task} row={row} canStop={!!session && row.state === "running" && !run?.finishedAt} refresh={refresh} />
      {questions.error ? (
        <p role="alert" className="hu-field-error">
          {questions.error.message}
        </p>
      ) : null}
      {(questions.data ?? [])
        .filter((question) => question.runId === row.runId)
        .map((question) => (
          <RunQuestion key={`${question.requestId}:${question.requestVersion}`} task={task} question={question} focusRequest={questionFocus?.questionId === question.requestId ? questionFocus : undefined} refresh={refresh} />
        ))}
      {session && task.status === "in_progress" && run?.state === "running" && !task.readOnly ? <RunSupplement task={task} row={row} refresh={refresh} /> : null}
      <div data-testid={run?.finishedAt ? "managed-run-result" : undefined}>
        <div role="status">{deliveryNotice ? <p>{deliveryNotice}</p> : null}</div>
        {run?.finishedAt
          ? messages.map((message) => (
            <TaskRunMarkdownView key={message.id} id={`run-result-${message.id}`} value={message.body} refs={refs} />
          ))
          : null}
        {result?.kind === "result" && result.receiptId ? <TaskRunDeliveries key={result.receiptId} task={task} receiptId={result.receiptId} onNavigate={onNavigate} /> : null}
      </div>
    </>
  );
}

function TaskRunDeliveries({ task, receiptId, onNavigate }: { task: TaskDto; receiptId: string; onNavigate?: ModuleProps["onNavigate"] }) {
  const engine = useEngine();
  const [linkError, setLinkError] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const issueLink = useRef<HTMLAnchorElement>(null);
  const verificationFocused = useRef(false);
  const origin = task.origin.kind === "external" ? task.origin.github : undefined;
  const result = { taskId: task.id, receiptId };
  const githubKey = origin && { ...result, sourceId: origin.sourceId, issueId: origin.issueId };
  const github = useCapability<GitHubDelivery>("tasks.github.deliveries.read", githubKey ?? result, { enabled: !!githubKey });
  const mail = useCapability<MailDelivery>("tasks.mail.deliveries.read", result, { enabled: !!onNavigate });
  const operationId = mail.data?.operationId;
  const url = github.data?.comment?.url;
  const commentUrl = url?.startsWith("https://github.com/") ? url : undefined;
  const repository = github.data?.repository;
  const issueUrl = repository && /^[\w-]+\/(?!\.{1,2}$)[\w.-]+$/u.test(repository)
    ? `https://github.com/${repository}/issues/${github.data?.issueNumber}`
    : undefined;
  const verification = github.data?.verification?.state;
  const mayVerify = !task.readOnly && !verifying && verification !== "pending";
  const githubReadError = github.error && !(github.error instanceof CapabilityError && github.error.code === "NOT_FOUND");
  useEffect(() => {
    const link = issueLink.current;
    if (link && github.data?.state === "accepted" && verificationFocused.current && link.ownerDocument.activeElement === link.ownerDocument.body) link.focus();
  }, [github.data?.state]);

  function openExternal(event: MouseEvent<HTMLAnchorElement>, failure: string) {
    const open = host()?.openExternal;
    if (!open) return;
    event.preventDefault();
    setLinkError("");
    void open(event.currentTarget.href).then((opened) => { if (!opened) setLinkError(failure); }, () => setLinkError(failure));
  }

  async function verify() {
    if (!githubKey || !mayVerify) return;
    const verificationId = createRequestId();
    setVerifying(true);
    setVerifyError("");
    try {
      await engine.call("tasks.github.deliveries.verify", { ...githubKey, verificationId }, { write: true, idempotencyKey: verificationId });
    } catch (failure) {
      setVerifyError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      await github.refetch();
      setVerifying(false);
    }
  }

  return (
    <>
      {github.data ? (
        <>
          <p role="status">{github.data.state === "accepted" ? "GitHub 已接收评论"
            : verification === "pending" ? "等待已绑定的 GitHub 连接器核实"
            : verification === "unconfirmed" ? "未找到可确认的原评论，GitHub 投递仍待核实"
            : "GitHub 投递待核实"}</p>
          <div className="row tasks-github-delivery-actions">
            {issueUrl ? <a ref={issueLink} href={issueUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => openExternal(event, "无法打开原 Issue。")}>查看原 Issue</a> : null}
            {commentUrl ? <a href={commentUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => openExternal(event, "无法打开原评论。")}>查看原评论</a> : null}
            {github.data.state === "unknown" && !task.readOnly ? (
              <Button
                aria-busy={verifying}
                aria-disabled={!mayVerify}
                onFocus={() => { verificationFocused.current = true; }}
                onBlur={() => { verificationFocused.current = false; }}
                onClick={() => void verify()}
              >
                核实原投递
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {githubReadError || mail.error ? <p role="status">暂时无法读取外部投递记录。</p> : null}
      {linkError || verifyError ? <p role="alert">{linkError || verifyError}</p> : null}
      {operationId && onNavigate ? (
        <Button variant="ghost" onClick={() => {
          requestOpenMailDelivery({ vaultId: engine.vaultId, operationId });
          onNavigate("mail");
        }}>查看原邮件投递</Button>
      ) : null}
    </>
  );
}

function TaskRunWaiting({ session, taskId, runId }: { session: NonNullable<TaskDispatchView["session"]>; taskId: string; runId: string }) {
  const sessions = useCapability<{ id: string; state: string; waiting?: { active: boolean; taskRun?: { taskId: string; runId: string } } }[]>("agent.sessions.list", { spaceId: session.spaceId });
  const current = sessions.data?.find(({ id }) => id === session.id);
  const waiting = current?.waiting;
  const needsInput = current?.state === "running" && waiting?.active && waiting.taskRun?.taskId === taskId && waiting.taskRun.runId === runId;
  return <div role="status">{needsInput ? "原会话需要你操作。" : ""}</div>;
}

function StopRun({ task, row, canStop, refresh }: { task: TaskDto; row: TaskDispatchView; canStop: boolean; refresh(): Promise<void> }) {
  const engine = useEngine();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopId, setStopId] = useState<string | null>(null);
  const [local, setLocal] = useState<StopReceipt | null>(null);
  const [error, setError] = useState("");
  const receipt = row.stop ?? local;
  const mayRequest = !!host() && !task.readOnly && (canStop || !!stopId) && !receipt;
  if (!mayRequest && !receipt) return null;

  async function submit() {
    const id = stopId ?? createRequestId();
    setStopId(id);
    setOpen(false);
    setError("");
    setBusy(true);
    try {
      const input = { taskId: task.id, dispatchId: row.dispatchId, runId: row.runId, stopId: id };
      setLocal(await engine.call<StopReceipt>("tasks.dispatch.stop", input, { write: true, idempotencyKey: id }));
      await refresh();
    } catch (failure) {
      if (failure instanceof CapabilityError && failure.code !== "INTERNAL" && failure.code !== "UNAUTHENTICATED") setError(failure.message);
      else setError("未收到停止确认，请核对原停止请求。");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {mayRequest ? (
        <Button variant="danger" loading={busy} onClick={() => (stopId ? void submit() : setOpen(true))}>
          {stopId ? "核对原停止请求" : "停止本轮"}
        </Button>
      ) : null}
      {receipt ? <p role="status">{stopStates[receipt.status]}</p> : null}
      {error && !receipt ? <p role="alert">{error}</p> : null}
      <Dialog
        open={open}
        title="停止本轮"
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button autoFocus onClick={() => setOpen(false)}>
              返回
            </Button>
            <Button variant="danger" disabled={!mayRequest} onClick={() => void submit()}>
              确认停止本轮
            </Button>
          </>
        }
      >
        <p>向「{task.title}」的原会话发送停止请求。任务仍可继续处理。</p>
      </Dialog>
    </>
  );
}

function RunQuestion({ task, question, refresh, focusRequest }: { task: TaskDto; question: Question; refresh(): Promise<void>; focusRequest?: TaskDestination | undefined }) {
  const panel = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (focusRequest) panel.current?.focus();
  }, [focusRequest]);
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
      ref={panel}
      tabIndex={-1}
      data-testid="task-run-question"
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
