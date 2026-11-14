import type { TaskDto, TaskStatus } from "@huhu/contracts";
import { IconButton } from "@huhu/ui";
import { AlertTriangle, Bell, Bot, ChevronDown, ChevronLeft, ChevronRight, Circle, FileText, Folder } from "lucide-react";
import { useState } from "react";
import { groupByDue, monthGrid, shiftMonth } from "../shared/calendar.js";
import { STATUS_ORDER } from "../shared/draft.js";
import { t } from "./i18n.js";

export interface ViewProps {
  tasks: TaskDto[];
  pending: Record<string, boolean>;
  selectedId: string | null;
  /** 修改状态；返回 false 表示被拒绝（例如 agent 任务不能手动开始），由调用方提示原因。 */
  onStatus(task: TaskDto, next: TaskStatus): void;
  onOpen(task: TaskDto): void;
}

const STATUS_LABEL: Record<TaskStatus, string> = { not_started: t.status.not_started, in_progress: t.status.in_progress, completed: t.status.completed };

/** 状态下拉框：替代原来的勾选框。agent 任务的“进行中”由自动化派发进入，所以未开始的 agent 任务不提供“进行中”。 */
export function StatusSelect({ task, pending, onStatus }: { task: TaskDto; pending: boolean; onStatus: ViewProps["onStatus"] }) {
  return (
    <select className={`tasks-status tasks-status-${task.status}`} aria-label={t.statusOf(task.title)} data-testid="task-status" value={task.status} disabled={pending} onChange={(e) => onStatus(task, e.target.value as TaskStatus)}>
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s} disabled={s === "in_progress" && task.type === "agent" && task.status === "not_started"}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function TaskRow({ task, pending, selected, onStatus, onOpen }: { task: TaskDto; pending: boolean; selected: boolean; onStatus: ViewProps["onStatus"]; onOpen(): void }) {
  const agent = task.type === "agent";
  const attention = task.comments.filter((c) => c.source === "agent" && c.ask).length;
  return (
    <div className={`hu-knowledge-task-table-row tasks-task-row${selected ? " selected" : ""}${task.status === "completed" ? " is-completed" : ""}`} data-task-id={task.id} data-testid="task-row">
      <StatusSelect task={task} pending={pending} onStatus={onStatus} />
      <button type="button" className="hu-knowledge-task-name tasks-task-name" aria-label={t.openTask(task.title)} onClick={onOpen}>
        <span>{task.title}</span>
        {task.reminders.length > 0 ? <Bell size={12} aria-hidden /> : null}
        {task.dispatchBlockers.length > 0 && agent && task.status === "not_started" ? <AlertTriangle size={12} aria-label={t.blocked} /> : null}
        {attention > 0 ? <span className="tasks-attention">{t.attention(attention)}</span> : null}
      </button>
      <span className="tasks-due">{task.due ?? "—"}</span>
      <span className="tasks-executor">
        {agent ? <Bot size={13} aria-hidden /> : <Circle size={12} aria-hidden />}
        <span>{agent ? t.agent : t.manual}</span>
      </span>
      <span className="tasks-project-resources" title={[task.project, ...task.tags.map((x) => `#${x}`)].filter(Boolean).join(" · ")}>
        {task.project ? <span>{task.project}</span> : null}
        {task.tags.slice(0, 3).map((tag) => (
          <small key={tag} className="tasks-tag" data-testid="task-tag">
            {tag}
          </small>
        ))}
        {task.references.length > 0 ? (
          <small>
            <Folder size={11} aria-hidden />
            {t.resourceCount(task.references.length)}
          </small>
        ) : null}
        {!task.project && task.tags.length === 0 && task.references.length === 0 ? "—" : null}
      </span>
      <IconButton icon={FileText} label={t.openDetail(task.title)} onClick={onOpen} />
    </div>
  );
}

/** 列表视图：按状态分组（进行中 / 未开始 / 已完成），已完成组可折叠。 */
export function TaskTable({ tasks, pending, selectedId, onStatus, onOpen }: ViewProps) {
  const [folded, setFolded] = useState(false);
  const rows = (items: TaskDto[]) => items.map((task) => <TaskRow key={task.id} task={task} pending={pending[task.id] === true} selected={task.id === selectedId} onStatus={onStatus} onOpen={() => onOpen(task)} />);
  const group = (status: TaskStatus) => tasks.filter((x) => x.status === status);
  return (
    <div className="tasks-knowledge-task-table tasks-task-table" data-testid="task-list">
      <div className="tasks-knowledge-task-table-head tw-task-table-head">
        <span>{t.columns.status}</span>
        <span>{t.columns.name}</span>
        <span>{t.columns.due}</span>
        <span>{t.columns.executor}</span>
        <span>{t.columns.projectTags}</span>
        <span />
      </div>
      {(["in_progress", "not_started"] as const).map((status) => (
        <section key={status} aria-label={STATUS_LABEL[status]} data-group={status}>
          <h2 className="tasks-list-group-title">
            {STATUS_LABEL[status]} <small>{group(status).length}</small>
          </h2>
          {rows(group(status))}
          {group(status).length === 0 ? <p className="shell-tw-empty-group">{t.emptyGroup(STATUS_LABEL[status])}</p> : null}
        </section>
      ))}
      <section aria-label={t.status.completed} data-group="completed">
        <button type="button" className={`tasks-list-group-title tasks-fold-group${folded ? " tasks-folded" : ""}`} aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          <ChevronDown size={13} aria-hidden />
          {t.status.completed} <small>{group("completed").length}</small>
        </button>
        {!folded ? rows(group("completed")) : null}
        {!folded && group("completed").length === 0 ? <p className="shell-tw-empty-group">{t.emptyGroup(t.status.completed)}</p> : null}
      </section>
    </div>
  );
}

/** 看板：未开始 / 进行中 / 已完成三列；卡片拖到另一列就是修改状态（拖到“未开始”等同于重开；agent 任务不能手动拖进“进行中”）。 */
export function TaskBoard({ tasks, pending, onStatus, onOpen }: ViewProps) {
  const byId = new Map(tasks.map((x) => [x.id, x]));
  return (
    <div className="tasks-board tasks-board-3" data-testid="task-board">
      {STATUS_ORDER.map((status) => {
        const rows = tasks.filter((x) => x.status === status);
        return (
          <section
            key={status}
            aria-label={STATUS_LABEL[status]}
            data-testid={`board-${status}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const task = byId.get(e.dataTransfer.getData("text/plain"));
              if (task && task.status !== status) onStatus(task, status);
            }}
          >
            <h3>
              {STATUS_LABEL[status]}
              <small>{rows.length}</small>
            </h3>
            {rows.map((task) => (
              <div key={task.id} className="tasks-board-card" data-testid="board-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}>
                <StatusSelect task={task} pending={pending[task.id] === true} onStatus={onStatus} />
                <button type="button" onClick={() => onOpen(task)}>
                  {task.title}
                </button>
                <small>
                  {task.due ?? t.noDue} · {task.type === "agent" ? t.agent : t.manual}
                  {task.tags.length > 0 ? ` · ${task.tags.map((x) => `#${x}`).join(" ")}` : ""}
                </small>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** 月历（原型 TaskCalendar）：按截止日投影；周一为一周第一天。 */
export function TaskCalendar({ tasks, today, onOpen }: { tasks: TaskDto[]; today: string; onOpen(task: TaskDto): void }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const byDue = groupByDue(tasks);
  const weeks = monthGrid(Number(ym.slice(0, 4)), Number(ym.slice(5)));
  return (
    <div className="tasks-calendar" data-testid="task-calendar">
      <div className="tasks-calendar-head">
        <IconButton icon={ChevronLeft} label={t.calendar.prev} onClick={() => setYm(shiftMonth(ym, -1))} />
        <strong data-testid="calendar-month">{t.calendar.month(Number(ym.slice(0, 4)), Number(ym.slice(5)))}</strong>
        <IconButton icon={ChevronRight} label={t.calendar.next} onClick={() => setYm(shiftMonth(ym, 1))} />
      </div>
      <div className="tasks-calendar-grid" role="grid" aria-label={t.calendar.month(Number(ym.slice(0, 4)), Number(ym.slice(5)))}>
        <div role="row" className="tasks-calendar-row">
          {t.calendar.weekdays.map((d) => (
            <div key={d} role="columnheader" className="tasks-weekday">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.date} role="row" className="tasks-calendar-row">
            {week.map((c) =>
              c.inMonth ? (
                <div key={c.date} role="gridcell" className="tasks-calendar-cell">
                  <span className="tasks-calendar-date">{Number(c.date.slice(8))}</span>
                  {(byDue.get(c.date) ?? []).map((task) => (
                    <button key={task.id} type="button" className={`tasks-calendar-task${task.status === "completed" ? " is-completed" : ""}`} onClick={() => onOpen(task)}>
                      {task.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div key={c.date} role="gridcell" aria-hidden className="tasks-calendar-cell" />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="tasks-hint">{t.calendar.hint}</p>
    </div>
  );
}
