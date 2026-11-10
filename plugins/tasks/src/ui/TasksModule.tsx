import type { TaskDto } from "@huhu/contracts";
import { Badge, Button, CompletionCircle, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient, queryKey } from "@huhu/workbench";
import { useEffect, useMemo, useState } from "react";
import { categoryCount, inCategory, isOverdue, todayIn, weekRange, type TaskCategory } from "../shared/categories.js";
import { t } from "./i18n.js";

const CATEGORIES: TaskCategory[] = ["all", "today", "tomorrow", "week", "ended"];

export function TasksModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const { data, isLoading, error } = useCapability<TaskDto[]>("tasks.list", { category: "all" });
  const [category, setCategory] = useState<TaskCategory>("all");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000); // 跨午夜后分类自动重算
    return () => clearInterval(t);
  }, []);
  const today = useMemo(() => todayIn(zone), [zone, tick]);
  const tasks = data ?? [];
  const visible = useMemo(() => tasks.filter((x) => inCategory(x, category, today)), [tasks, category, today]);
  const open = visible.filter((x) => !x.completed);
  const done = visible.filter((x) => x.completed);
  const key = queryKey(engine.vaultId, "tasks.list", { category: "all" });

  async function toggle(task: TaskDto, next: boolean) {
    if (pending[task.id]) return; // 回执前不重复提交（同一个 expectedVersion 会冲突）
    setFailure(null);
    setPending((p) => ({ ...p, [task.id]: true }));
    qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, completed: next } : x))); // 乐观更新
    try {
      await engine.call("tasks.setCompleted", { id: task.id, completed: next, expectedVersion: task.version }, { write: true });
    } catch (e) {
      // 失败回滚只还原这一个任务，不影响其他仍在进行中的乐观更新
      qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, completed: task.completed } : x)));
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setPending((p) => ({ ...p, [task.id]: false }));
      void qc.invalidateQueries({ queryKey: key });
    }
  }

  async function create() {
    const name = title.trim();
    if (!name) return;
    setCreating(true);
    setFailure(null);
    try {
      await engine.call("tasks.create", { title: name, execution: { kind: "manual" } }, { write: true });
      setTitle("");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  const range = weekRange(today);
  return (
    <div className="hu-module" data-testid="tasks-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title}</h2>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="hu-nav-item" aria-current={c === category} onClick={() => setCategory(c)}>
            <span>{t.categories[c]}</span>
            <span>{categoryCount(tasks, c, today)}</span>
          </button>
        ))}
      </aside>
      <section className="hu-content">
        <h1>{t.categories[category]}</h1>
        {category === "week" ? <p className="hu-meta">{range.from} – {range.to}</p> : null}
        <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <input className="hu-input" aria-label={t.titleField} placeholder={t.titleField} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" variant="primary" loading={creating} disabled={!title.trim()}>{t.create}</Button>
        </form>
        {failure ? <div role="alert" className="hu-overdue">{failure}</div> : null}
        {error ? <div role="alert">{String(error)}</div> : null}
        {isLoading ? <p>{t.loading}</p> : visible.length === 0 ? <EmptyState title={t.empty} /> : null}
        <TaskGroup label={t.open} tasks={open} today={today} pending={pending} onToggle={toggle} />
        <TaskGroup label={t.done} tasks={done} today={today} pending={pending} onToggle={toggle} />
      </section>
    </div>
  );
}

function TaskGroup({ label, tasks, today, pending, onToggle }: { label: string; tasks: TaskDto[]; today: string; pending: Record<string, boolean>; onToggle(t: TaskDto, next: boolean): void }) {
  if (tasks.length === 0) return null;
  return (
    <div role="group" aria-label={label}>
      <h3>{label} {tasks.length}</h3>
      {tasks.map((task) => (
        <div key={task.id} className="hu-row" data-testid="task-row">
          <CompletionCircle checked={task.completed} pending={pending[task.id] === true} label={`${task.completed ? t.reopen : t.complete}：${task.title}`} onToggle={(next) => void onToggle(task, next)} />
          <span className="hu-row-title" data-done={task.completed}>{task.title}</span>
          {task.due ? <span className={isOverdue(task, today) ? "hu-overdue" : ""}>{task.due}</span> : null}
          {task.execution.kind === "agent" ? <Badge tone="blue">{t.agent}</Badge> : <Badge>{t.manual}</Badge>}
        </div>
      ))}
    </div>
  );
}
