import type { TaskDto } from "@huhu/contracts";
import { CompletionCircle, IconButton } from "@huhu/ui";
import { Bell, Bot, ChevronDown, ChevronLeft, ChevronRight, Circle, FileText, Folder } from "lucide-react";
import { useState } from "react";
import { groupByDue, monthGrid, shiftMonth } from "../shared/calendar.js";
import { t } from "./i18n.js";

export interface ViewProps {
  tasks: TaskDto[];
  pending: Record<string, boolean>;
  selectedId: string | null;
  onToggle(task: TaskDto, next: boolean): void;
  onOpen(task: TaskDto): void;
}

const check = (task: TaskDto, pending: boolean, onToggle: ViewProps["onToggle"]) => (
  <CompletionCircle checked={task.completed} pending={pending} label={`${task.completed ? t.reopen : t.complete} ${task.title}`} onToggle={(next) => onToggle(task, next)} />
);

function TaskRow({ task, pending, selected, onToggle, onOpen }: { task: TaskDto; pending: boolean; selected: boolean; onToggle: ViewProps["onToggle"]; onOpen(): void }) {
  const agent = task.execution.kind === "agent";
  return (
    <div className={`knowledge-task-table-row tw-task-row${selected ? " selected" : ""}${task.completed ? " is-completed" : ""}`} data-task-id={task.id} data-testid="task-row">
      {check(task, pending, onToggle)}
      <button type="button" className="knowledge-task-name tw-task-name" aria-label={t.openTask(task.title)} onClick={onOpen}>
        <span>{task.title}</span>
        {task.reminders.length > 0 ? <Bell size={12} aria-hidden /> : null}
      </button>
      <span className="tw-due">{task.due ?? "—"}</span>
      <span className="tw-executor">
        {agent ? <Bot size={13} aria-hidden /> : <Circle size={12} aria-hidden />}
        <span>{agent ? t.agent : t.manual}</span>
      </span>
      <span className="tw-project-resources" title={[task.project, ...task.resources.map((r) => r.path)].filter(Boolean).join(" · ")}>
        {task.project ? <span>{task.project}</span> : null}
        {task.resources.length > 0 ? (
          <small>
            <Folder size={11} aria-hidden />
            {t.resourceCount(task.resources.length)}
          </small>
        ) : null}
        {!task.project && task.resources.length === 0 ? "—" : null}
      </span>
      <IconButton icon={FileText} label={t.openDetail(task.title)} onClick={onOpen} />
    </div>
  );
}

/** 列表视图（原型 TaskTable）：「未完成 / 已完成」两组，已完成组可折叠。 */
export function TaskTable({ tasks, pending, selectedId, onToggle, onOpen }: ViewProps) {
  const [folded, setFolded] = useState(false);
  const open = tasks.filter((x) => !x.completed);
  const done = tasks.filter((x) => x.completed);
  const rows = (items: TaskDto[]) => items.map((task) => <TaskRow key={task.id} task={task} pending={pending[task.id] === true} selected={task.id === selectedId} onToggle={onToggle} onOpen={() => onOpen(task)} />);
  return (
    <div className="knowledge-task-table tw-task-table" data-testid="task-list">
      <div className="knowledge-task-table-head tw-task-table-head">
        <span />
        <span>{t.columns.name}</span>
        <span>{t.columns.due}</span>
        <span>{t.columns.executor}</span>
        <span>{t.columns.projectResources}</span>
        <span />
      </div>
      <section aria-label={t.open} data-group="open">
        <h2 className="tw-list-group-title">
          {t.open} <small>{open.length}</small>
        </h2>
        {rows(open)}
        {open.length === 0 ? <p className="tw-empty-group">{t.emptyOpen}</p> : null}
      </section>
      <section aria-label={t.done} data-group="done">
        <button type="button" className={`tw-list-group-title tw-fold-group${folded ? " folded" : ""}`} aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          <ChevronDown size={13} aria-hidden />
          {t.done} <small>{done.length}</small>
        </button>
        {!folded ? rows(done) : null}
        {!folded && done.length === 0 ? <p className="tw-empty-group">{t.emptyDone}</p> : null}
      </section>
    </div>
  );
}

/** 看板（原型 .tw-board）：未完成 / 已完成两列；卡片也可以拖到另一列来完成 / 重开。 */
export function TaskBoard({ tasks, pending, onToggle, onOpen }: ViewProps) {
  const byId = new Map(tasks.map((x) => [x.id, x]));
  return (
    <div className="tw-board" data-testid="task-board">
      {([false, true] as const).map((completed) => {
        const rows = tasks.filter((x) => x.completed === completed);
        const label = completed ? t.board.done : t.board.open;
        return (
          <section
            key={label}
            aria-label={label}
            data-testid={completed ? "board-done" : "board-open"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const task = byId.get(e.dataTransfer.getData("text/plain"));
              if (task && task.completed !== completed) onToggle(task, completed);
            }}
          >
            <h3>
              {label}
              <small>{rows.length}</small>
            </h3>
            {rows.map((task) => (
              <div key={task.id} className="tw-board-card" data-testid="board-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}>
                {check(task, pending[task.id] === true, onToggle)}
                <button type="button" onClick={() => onOpen(task)}>
                  {task.title}
                </button>
                <small>
                  {task.due ?? t.noDue} · {task.execution.kind === "agent" ? t.agent : t.manual}
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
    <div className="tw-calendar" data-testid="task-calendar">
      <div className="tw-calendar-head">
        <IconButton icon={ChevronLeft} label={t.calendar.prev} onClick={() => setYm(shiftMonth(ym, -1))} />
        <strong data-testid="calendar-month">{t.calendar.month(Number(ym.slice(0, 4)), Number(ym.slice(5)))}</strong>
        <IconButton icon={ChevronRight} label={t.calendar.next} onClick={() => setYm(shiftMonth(ym, 1))} />
      </div>
      <div className="tw-calendar-grid" role="grid" aria-label={t.calendar.month(Number(ym.slice(0, 4)), Number(ym.slice(5)))}>
        <div role="row" className="tw-calendar-row">
          {t.calendar.weekdays.map((d) => (
            <div key={d} role="columnheader" className="tw-weekday">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.date} role="row" className="tw-calendar-row">
            {week.map((c) =>
              c.inMonth ? (
                <div key={c.date} role="gridcell" className="tw-calendar-cell">
                  <span className="tw-calendar-date">{Number(c.date.slice(8))}</span>
                  {(byDue.get(c.date) ?? []).map((task) => (
                    <button key={task.id} type="button" className={`tw-calendar-task${task.completed ? " is-completed" : ""}`} onClick={() => onOpen(task)}>
                      {task.title}
                    </button>
                  ))}
                </div>
              ) : (
                <div key={c.date} role="gridcell" aria-hidden className="tw-calendar-cell" />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="tw-hint">{t.calendar.hint}</p>
    </div>
  );
}
