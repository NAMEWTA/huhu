import type { TaskDto } from "@huhu/contracts";
import { Badge, Button, Dialog, EmptyState } from "@huhu/ui";
import { CapabilityError, requestOpenTask, useCapability, useEngine } from "@huhu/workbench";
import { useState } from "react";
import type { RecentTaskRun } from "../../../tasks/src/engine/dispatch-store.js";
import { TaskRunDetails, taskRunLabel } from "../../../tasks/src/ui/TaskDispatchPanel.js";
import { t } from "./i18n.js";

interface TerminalRunRow {
  id: string;
  state: string;
  title: string;
  startedAt: string | null;
}

interface TerminalRunDetail {
  id: string;
  body: string;
  title: string;
  live: boolean;
  data: { state: string; startedAt: string | null; finishedAt: string | null; exitCode?: number | null; sessionId?: string };
}

type Selection = { kind: "task"; id: string } | { kind: "terminal"; id: string };
type Navigate = ((module: string) => void) | undefined;

const fmt = (v: string | null): string => (v ? new Date(v).toLocaleString() : "—");
const disabled = (error: Error | null) => error instanceof CapabilityError && error.code === "PLUGIN_DISABLED";

export function RunsPanel({ onNavigate }: { onNavigate?: Navigate }) {
  const tasks = useCapability<RecentTaskRun[]>("tasks.dispatch.recent");
  const terminal = useCapability<TerminalRunRow[]>("automations.runs.list");
  const [selection, setSelection] = useState<Selection | null>(null);
  const taskRows = (tasks.data ?? []).map(({ dispatch, run, title }) => ({
    id: dispatch.runId,
    kind: "task" as const,
    title,
    state: taskRunLabel(dispatch, run),
    at: dispatch.acceptedAt,
  }));
  const terminalRows = (terminal.data ?? []).map((row) => ({
    id: row.id,
    kind: "terminal" as const,
    title: row.title,
    state: t.runs.state[row.state] ?? row.state,
    at: row.startedAt,
  }));
  const rows = [...taskRows, ...terminalRows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const task = tasks.data?.find(({ dispatch }) => dispatch.runId === selection?.id);
  const selected = rows.find(({ id, kind }) => id === selection?.id && kind === selection.kind);
  const error = terminal.error ?? (disabled(tasks.error) ? null : tasks.error);
  return (
    <>
      {error ? (
        <p role="alert" className="hu-field-error">
          {error.message}
        </p>
      ) : null}
      {disabled(tasks.error) ? <p role="status">任务插件已停用，暂时无法查看任务运行。</p> : null}
      {rows.length ? (
        <div role="list" aria-label={t.nav.runs}>
          {rows.map((row) => (
            <div key={`${row.kind}:${row.id}`} role="listitem" className="hu-row" data-testid="run-row">
              <button type="button" className="hu-nav-item" aria-haspopup="dialog" onClick={() => setSelection(row)}>
                {row.title}
              </button>
              <Badge>{row.state}</Badge>
              <span>{fmt(row.at)}</span>
            </div>
          ))}
        </div>
      ) : !error && !terminal.isPending && !tasks.isPending ? (
        <EmptyState title={t.runs.none} />
      ) : null}
      <Dialog open={selection !== null} title={selected?.title ?? t.runs.detail} wide testId="run-detail" onClose={() => setSelection(null)}>
        {selection?.kind === "task" && task ? <ManagedRun key={selection.id} row={task} onNavigate={onNavigate} /> : null}
        {selection?.kind === "terminal" ? <TerminalRun key={selection.id} id={selection.id} onNavigate={onNavigate} /> : null}
        {selection?.kind === "task" && !task ? <p role="status">当前查询中没有这条运行记录。</p> : null}
      </Dialog>
    </>
  );
}

function ManagedRun({ row, onNavigate }: { row: RecentTaskRun; onNavigate: Navigate }) {
  const { dispatch, run } = row;
  const task = useCapability<TaskDto>("tasks.read", { id: dispatch.taskId });
  return (
    <section data-run-id={dispatch.runId}>
      <p role="status" data-testid="run-state">
        {taskRunLabel(dispatch, run)}
      </p>
      {onNavigate ? (
        <Button
          onClick={() => {
            requestOpenTask(dispatch.taskId);
            onNavigate("tasks");
          }}
        >
          打开原任务
        </Button>
      ) : null}
      {task.error ? (
        <p role="alert" className="hu-field-error">
          {task.error.message}
        </p>
      ) : null}
      {task.isPending ? <p role="status">正在读取原任务…</p> : null}
      {task.data ? <TaskRunDetails task={task.data} taskRefreshing={task.isFetching} row={dispatch} run={run} showQueue onOpenAgent={onNavigate ? () => onNavigate("agent-cli") : undefined} /> : null}
    </section>
  );
}

function TerminalRun({ id, onNavigate }: { id: string; onNavigate: Navigate }) {
  const detail = useCapability<TerminalRunDetail>("automations.runs.read", { runId: id });
  const engine = useEngine();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const row = detail.data;
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await engine.call("automations.runs.cancel", { runId: id }, { write: true });
      await detail.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!row) return detail.error ? <p role="alert">{detail.error.message}</p> : <p role="status">正在读取运行结果…</p>;
  const data = row.data;
  return (
    <>
      <dl>
        <dt>{t.runs.status}</dt>
        <dd data-testid="run-state">{t.runs.state[data.state] ?? data.state}</dd>
        <dt>{t.runs.started}</dt>
        <dd>{fmt(data.startedAt)}</dd>
        <dt>{t.runs.finished}</dt>
        <dd>{fmt(data.finishedAt)}</dd>
        {data.exitCode != null ? (
          <>
            <dt>{t.runs.exitCode}</dt>
            <dd>{data.exitCode}</dd>
          </>
        ) : null}
        {data.sessionId ? (
          <>
            <dt>{t.runs.terminal}</dt>
            <dd>
              <code>{data.sessionId}</code>{" "}
              {onNavigate ? (
                <Button data-testid="run-open-terminal" onClick={() => onNavigate("agent-cli")}>
                  {t.runs.openTerminal}
                </Button>
              ) : null}
            </dd>
          </>
        ) : null}
      </dl>
      <h3>{t.runs.result}</h3>
      <pre data-testid="run-body">{row.body.trim() || "—"}</pre>
      {row.live ? (
        <Button variant="danger" loading={busy} disabled={busy} onClick={() => void cancel()}>
          {t.runs.cancel}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="hu-field-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
