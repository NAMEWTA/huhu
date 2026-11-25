import type { PlanOccurrence, TaskDispatchView, TaskDto, TaskRunSummary } from "@huhu/contracts";
import { Badge, Button } from "@huhu/ui";
import { CapabilityError, requestOpenAgentSession, requestOpenTask, useCapability, useEngine, useTaskAutomationViews, type ModuleProps } from "@huhu/workbench";
import { useState } from "react";
import { occurrenceLabel, formatMoment } from "./plan-presentation.js";
import { TerminalRun } from "./RunsPanel.js";

type Navigate = ModuleProps["onNavigate"];

const effects = {
  "not-accepted": "尚未受理",
  accepted: "已受理",
  completed: "已完成",
  failed: "失败",
  unknown: "待核实",
};
const effectNames: Record<string, string> = {
  "task-dispatch": "派遣任务",
  "task-run": "任务运行",
  "task-create": "创建任务",
  "task-comment": "写入任务评论",
  notification: "通知",
  "focus-settlement": "完成专注",
};
const mailStatus = {
  sending: "正在发送",
  unknown: "待核实",
  "not-delivered": "确认未投递",
  accepted: "渠道已接受",
  "partially-accepted": "部分收件人已接受",
};

export function OccurrenceDetail({ id, terminalRunId, onNavigate }: { id: string; terminalRunId?: string; onNavigate: Navigate }) {
  const occurrence = useCapability<PlanOccurrence | null>("automations.plans.readOccurrence", { occurrenceId: id });
  const [output, setOutput] = useState(false);
  const row = occurrence.data;
  const tasks = row?.effects.filter(({ kind }) => kind === "task-dispatch" || kind === "task-run") ?? [];
  const scheduled = row?.timing.trigger === "scheduled" ? row.timing.scheduledFor : null;
  return (
    <div className="hu-stack" data-testid="occurrence-detail">
      {occurrence.isPending ? <p role="status">正在读取发生记录…</p> : null}
      {occurrence.error ? <p role="alert">{occurrence.error.message}</p> : null}
      {row ? (
        <>
          <p>
            <Badge>{tasks.length && row.state === "completed" ? "受理检查结束" : occurrenceLabel[row.state]}</Badge> {row.timing.trigger === "manual" ? "立即运行" : row.timing.trigger === "scheduled" ? "按排期触发" : "来源事件"}
          </p>
          <details>
            <summary>计划与冻结输入</summary>
            <dl>
              <dt>计划</dt>
              <dd>
                {row.plan.planId} · {row.plan.revision}
              </dd>
              <dt>发生</dt>
              <dd>{id}</dd>
              {scheduled ? (
                <>
                  <dt>计划时间</dt>
                  <dd>
                    <time dateTime={scheduled}>{formatMoment(scheduled)}</time>
                  </dd>
                </>
              ) : null}
              <dt>受理时间</dt>
              <dd>{row.acceptedAt ? <time dateTime={row.acceptedAt}>{formatMoment(row.acceptedAt)}</time> : "尚未受理"}</dd>
              <dt>冻结输入版本</dt>
              <dd>{row.frozenInput?.revision ?? "无"}</dd>
            </dl>
          </details>
          {row.state === "unknown" ? <p role="status">现有记录不足以核实这次发生的最终结果。</p> : null}
          {row.execution && !tasks.length ? (
            <div className="hu-toolbar">
              <TaskLink id={row.execution.taskId} onNavigate={onNavigate} />
              <BoundSession vaultId={row.execution.vaultId} sessionId={row.execution.sessionBinding.sessionId} generation={row.execution.sessionBinding.processGeneration} onNavigate={onNavigate} />
            </div>
          ) : null}
          {tasks.length ? (
            <section aria-label="领域运行">
              <h3>领域运行</h3>
              {tasks.map((effect) => (
                <OccurrenceTask key={effect.effectId} effect={effect} onNavigate={onNavigate} />
              ))}
            </section>
          ) : null}
          {row.effects.length ? (
            <section aria-label="发生效果">
              <h3>效果与回执</h3>
              <ul>
                {row.effects.map(({ effectId, kind, state, target, receiptId }) => (
                  <li key={effectId}>
                    {effectNames[kind] ?? kind} · {effects[state]}
                    {receiptId ? (
                      <>
                        {" "}
                        · <code>{receiptId}</code>
                      </>
                    ) : null}
                    {target.kind === "task" && (kind === "task-create" || kind === "task-comment") && state === "completed" ? <TaskLink id={target.id} onNavigate={onNavigate} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : occurrence.data === null && !terminalRunId ? (
        <p>此发生仅保留历史摘要。</p>
      ) : null}
      {terminalRunId ? (
        <>
          <p>
            终端运行 <code>{terminalRunId}</code>
          </p>
          {output ? <TerminalRun id={terminalRunId} onNavigate={undefined} /> : <Button onClick={() => setOutput(true)}>查看终端输出</Button>}
        </>
      ) : null}
      <div className="hu-toolbar">
        <Button loading={occurrence.isFetching} onClick={() => void occurrence.refetch()}>
          {row?.state === "unknown" ? "核实原请求" : "重新读取原发生"}
        </Button>
      </div>
    </div>
  );
}

function TaskLink({ id, runId, onNavigate }: { id: string; runId?: string; onNavigate: Navigate }) {
  return onNavigate ? (
    <Button
      onClick={() => {
        requestOpenTask(id, runId ? { runId } : undefined);
        onNavigate("tasks");
      }}
    >
      打开原任务
    </Button>
  ) : null;
}

function BoundSession({ vaultId, sessionId, generation, spaceId, onNavigate }: { vaultId: string; sessionId: string; generation: string; spaceId?: string; onNavigate: Navigate }) {
  const sessions = useCapability<{ id: string; spaceId: string; generation?: string }[]>("agent.sessions.list", spaceId ? { spaceId } : {}, { enabled: !!onNavigate });
  const original = sessions.data?.find((row) => row.id === sessionId && row.generation === generation);
  return original && onNavigate ? (
    <Button
      onClick={() => {
        requestOpenAgentSession({ vaultId, spaceId: original.spaceId, sessionId: original.id });
        onNavigate("agent-cli");
      }}
    >
      定位原会话
    </Button>
  ) : (
    <span>{sessions.isFetching ? "正在核对原会话…" : "原会话当前不可打开"}</span>
  );
}

function OccurrenceTask({ effect, onNavigate }: { effect: PlanOccurrence["effects"][number]; onNavigate: Navigate }) {
  const { vaultId } = useEngine();
  const views = useTaskAutomationViews();
  const TaskRunDetails = views?.TaskRunDetails;
  const taskId = effect.target.id;
  const [expanded, setExpanded] = useState(false);
  const dispatch = useCapability<TaskDispatchView[]>("tasks.dispatch.list", { taskId }, { enabled: effect.state === "accepted" });
  const identity = dispatch.error ? undefined : dispatch.data?.find((row) => (effect.kind === "task-run" ? row.runId === effect.effectId : row.dispatchId === effect.effectId));
  const runs = useCapability<TaskRunSummary[]>("tasks.runs", { id: taskId }, { enabled: !!identity });
  const task = useCapability<TaskDto>("tasks.read", { id: taskId }, { enabled: expanded && !!identity });
  const run = runs.data?.find(({ id }) => id === identity?.runId);
  const origin = task.data?.origin;
  const github = origin?.kind === "external" ? origin.github : undefined;
  const receiptId = run?.result?.receiptId;
  const channel = useCapability<{ state: "unknown" | "accepted"; comment?: { url: string } }>(
    "tasks.github.deliveries.read",
    { taskId, sourceId: github?.sourceId, issueId: github?.issueId, receiptId },
    { enabled: expanded && !!github && !!receiptId },
  );
  const mailLink = useCapability<{ operationId: string } | null>("tasks.mail.deliveries.read", { taskId, receiptId }, { enabled: expanded && !!receiptId });
  const mail = useCapability<{ state: keyof typeof mailStatus } | null>("mail.outbox.status", { operationId: mailLink.data?.operationId }, { enabled: expanded && !!mailLink.data });
  const error = task.error ?? dispatch.error ?? runs.error;
  return (
    <article className="hu-stack" data-testid="occurrence-child-run">
      <header>
        <strong>{!task.error && task.data ? task.data.title : taskId}</strong> <Badge>{identity ? views?.taskRunLabel(identity, run) ?? run?.state ?? identity.state : effects[effect.state]}</Badge>
      </header>
      {error ? <p role="alert">无法读取原任务运行。{error.message}</p> : null}
      {!error && dispatch.data && !identity ? <p role="status">没有找到原派遣，保留已记录的受理状态。</p> : null}
      {dispatch.data && !dispatch.error ? <TaskLink id={taskId} {...(identity && { runId: identity.runId })} onNavigate={onNavigate} /> : null}
      {identity ? (
        <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary>查看运行、原问题与输出</summary>
          {expanded ? (
            <>
              <p>
                <code>{identity.runId}</code> · 第 {identity.attempt} 次尝试
              </p>
              {identity.session?.processGeneration ? <BoundSession vaultId={vaultId} sessionId={identity.session.id} generation={identity.session.processGeneration} spaceId={identity.session.spaceId} onNavigate={onNavigate} /> : null}
              {task.isPending ? <p role="status">正在读取原运行的输出…</p> : null}
              {task.data && !task.error && TaskRunDetails ? <TaskRunDetails row={identity} run={run} task={task.data} taskRefreshing={task.isFetching} showQueue /> : null}
              {channel.data ? <p data-testid="occurrence-channel-state">GitHub 投递 · {channel.data.state === "accepted" ? "渠道已接受" : "待核实"}</p> : null}
              {mailLink.data ? <p data-testid="occurrence-mail-state">邮件投递 · {mail.data ? mailStatus[mail.data.state] : mail.isPending ? "正在读取渠道状态…" : "渠道记录暂不可读"}</p> : null}
              {mailLink.error || mail.error ? <p role="alert">{mailLink.error?.message ?? mail.error?.message}</p> : null}
              {channel.error && !(channel.error instanceof CapabilityError && ["NOT_FOUND", "PERMISSION_DENIED"].includes(channel.error.code)) ? <p role="alert">{channel.error.message}</p> : null}
              <Button
                onClick={() => {
                  void task.refetch();
                  void dispatch.refetch();
                  void runs.refetch();
                  if (github && receiptId) void channel.refetch();
                  if (receiptId) void mailLink.refetch();
                  if (mailLink.data) void mail.refetch();
                }}
              >
                重新读取运行
              </Button>
            </>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}
