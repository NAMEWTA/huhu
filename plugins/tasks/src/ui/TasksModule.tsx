import { matchesTags, type TaskDto, type TaskStatus } from "@huhu/contracts";
import { Button, EmptyState, IconButton, Segmented } from "@huhu/ui";
import { queryKey, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { ArrowUpRight, CalendarDays, CheckCircle2, Columns2, List, Plus, Search, Tag, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { categoryCount, inCategory, todayIn, weekRange, type TaskCategory } from "../shared/categories.js";
import { matchesQuery } from "../shared/search.js";
import { t } from "./i18n.js";
import { TaskDetail } from "./TaskDetail.js";
import { TaskEditor } from "./TaskEditor.js";
import { TaskBoard, TaskCalendar, TaskTable } from "./TaskViews.js";

const CATEGORIES: TaskCategory[] = ["all", "today", "tomorrow", "week", "ended"];
type View = "list" | "board" | "calendar";
type EditorState = { mode: "new"; due?: string } | { mode: "edit"; task: TaskDto } | null;

export function TasksModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const { data, isLoading, error } = useCapability<TaskDto[]>("tasks.list", { category: "all" });
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get", {});
  const vault = useCapability<{ name: string }>("vault.info", {});
  const [category, setCategory] = useState<TaskCategory>("all");
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem(`huhu.tasks.view.${engine.vaultId}`);
      return v === "board" || v === "calendar" ? v : "list";
    } catch {
      return "list";
    }
  });
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]); // 标签筛选：全部匹配；空表示不限
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const zone = settings.data?.dateTime.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone; // 与引擎同一个口径：设置里的时区
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000); // 跨午夜后分类自动重算
    return () => clearInterval(id);
  }, []);
  const today = useMemo(() => todayIn(zone), [zone, tick]);
  const tasks = data ?? [];
  const visible = useMemo(
    () => tasks.filter((x) => inCategory(x, category, today) && matchesQuery(x, query) && matchesTags(x.tags, tagFilter) && (statusFilter === "all" || x.status === statusFilter)),
    [tasks, category, today, query, tagFilter, statusFilter],
  );
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const x of tasks) for (const tag of x.tags) count.set(tag, (count.get(tag) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks]);
  const selected = tasks.find((x) => x.id === selectedId) ?? null;
  const projects = useMemo(() => [...new Set(tasks.map((x) => x.project).filter((p): p is string => !!p))].sort(), [tasks]);
  const key = queryKey(engine.vaultId, "tasks.list", { category: "all" });

  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(`huhu.tasks.view.${engine.vaultId}`, v);
    } catch {
      /* 仅界面偏好 */
    }
  };
  const fail = (e: unknown) => setFailure(e instanceof Error ? e.message : String(e));
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  /** 修改状态：乐观更新；被引擎拒绝时只还原这一个任务并提示原因。agent 任务不能手动开始（由自动化派发进入进行中）。 */
  async function changeStatus(task: TaskDto, next: TaskStatus) {
    if (pending[task.id]) return; // 回执前不重复提交（同一个 expectedVersion 会冲突）
    if (task.type === "agent" && task.status === "not_started" && next === "in_progress") {
      setFailure(t.agentStartRejected);
      return;
    }
    setFailure(null);
    setPending((p) => ({ ...p, [task.id]: true }));
    qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    try {
      await engine.call("tasks.setStatus", { id: task.id, status: next, expectedVersion: task.version }, { write: true });
    } catch (e) {
      qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, status: task.status } : x)));
      fail(e);
    } finally {
      setPending((p) => ({ ...p, [task.id]: false }));
      await refresh();
    }
  }

  async function run(cap: string, input: unknown): Promise<TaskDto | null> {
    setFailure(null);
    try {
      const r = await engine.call<TaskDto>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      fail(e);
      return null;
    }
  }

  const range = weekRange(today);
  const open = (task: TaskDto) => setSelectedId(task.id);
  const viewProps = { tasks: visible, pending, selectedId, onStatus: (task: TaskDto, next: TaskStatus) => void changeStatus(task, next), onOpen: open };
  return (
    <div className={`hu-module-layout hu-tw-workbench${selected ? " detail-open" : ""}`} data-testid="tasks-module">
      <aside className="hu-tw-navigation">
        <div className="hu-tw-nav-title">
          <CheckCircle2 size={16} aria-hidden />
          <strong>{t.title}</strong>
          <IconButton icon={Plus} label={t.create} onClick={() => setEditor({ mode: "new" })} />
        </div>
        <p className="tasks-vault-name">{vault.data?.name ?? ""}</p>
        <nav aria-label={t.filterNav}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={c === category ? "active" : ""}
              aria-current={c === category}
              onClick={() => {
                setCategory(c);
                setSelectedId(null);
              }}
            >
              <span>{t.categories[c]}</span>
              <small>{categoryCount(tasks, c, today)}</small>
            </button>
          ))}
        </nav>
        {allTags.length > 0 ? (
          <nav className="tasks-tag-filter" aria-label={t.tagFilter} data-testid="tag-filter">
            <div className="tasks-nav-caption">
              <Tag size={13} aria-hidden /> {t.tagFilter}
              {tagFilter.length > 0 ? (
                <button type="button" onClick={() => setTagFilter([])}>
                  {t.clearTags}
                </button>
              ) : null}
            </div>
            {allTags.map(([tag, n]) => (
              <button
                key={tag}
                type="button"
                className={tagFilter.includes(tag) ? "active" : ""}
                aria-pressed={tagFilter.includes(tag)}
                data-testid={`tag-filter-${tag}`}
                onClick={() => setTagFilter((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]))}
              >
                <span>{tag}</span>
                <small>{n}</small>
              </button>
            ))}
            {tagFilter.length > 1 ? <p className="tasks-hint">{t.tagAllMatch}</p> : null}
          </nav>
        ) : null}
        <div className="hu-tw-nav-bottom">
          {onNavigate ? (
            <Button variant="ghost" icon={Workflow} data-testid="tasks-open-automations" onClick={() => onNavigate("automations")}>
              自动化
              <ArrowUpRight size={13} aria-hidden />
            </Button>
          ) : null}
          <p>
            {t.navHintA}
            <br />
            {t.navHintB}
          </p>
        </div>
      </aside>
      <main className="tasks-task-main">
        <header className="hu-tw-heading">
          <div>
            <h1>{t.categories[category]}</h1>
            <p data-testid="task-count">
              {t.count(visible.length)}
              {category === "week" ? ` · ${t.weekRange(range.from, range.to)}` : ""}
            </p>
          </div>
          <Button icon={Plus} onClick={() => setEditor({ mode: "new" })} data-testid="task-new">
            {t.create}
          </Button>
        </header>
        <div className="tasks-list-toolbar">
          <div className="hu-tw-search">
            <Search size={14} aria-hidden />
            <input aria-label={t.search} placeholder={t.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="task-search" />
          </div>
          <select aria-label={t.statusFilter} className="tasks-status-filter" data-testid="task-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}>
            <option value="all">{t.statusAll}</option>
            <option value="not_started">{t.status.not_started}</option>
            <option value="in_progress">{t.status.in_progress}</option>
            <option value="completed">{t.status.completed}</option>
          </select>
          <Segmented
            label={t.views.label}
            testId="task-views"
            value={view}
            onChange={chooseView}
            options={[
              { value: "list", label: t.views.list, icon: List },
              { value: "board", label: t.views.board, icon: Columns2 },
              { value: "calendar", label: t.views.calendar, icon: CalendarDays },
            ]}
          />
        </div>
        <div className="automations-task-content">
          {failure ? (
            <div role="alert" className="hu-field-error">
              {failure}
            </div>
          ) : null}
          {error ? <div role="alert">{String(error)}</div> : null}
          {isLoading ? <p>{t.loading}</p> : null}
          {!isLoading && visible.length === 0 && view !== "calendar" ? <EmptyState title={t.empty} /> : null}
          {view === "list" && visible.length > 0 ? <TaskTable {...viewProps} /> : null}
          {view === "board" && visible.length > 0 ? <TaskBoard {...viewProps} /> : null}
          {view === "calendar" ? <TaskCalendar tasks={visible} today={today} onOpen={open} /> : null}
        </div>
        <footer className="tasks-main-footer">
          <span>{t.footer}</span>
        </footer>
      </main>
      {selected ? (
        <TaskDetail
          key={selected.id}
          task={selected}
          pending={pending[selected.id] === true}
          onStatus={(x, next) => void changeStatus(x, next)}
          onChanged={() => void refresh()}
          onOpenNotes={() => onNavigate?.("notes")}
          onEdit={() => setEditor({ mode: "edit", task: selected })}
          onDuplicate={() => void run("tasks.duplicate", { id: selected.id }).then((r) => r && setSelectedId(r.id))}
          onDelete={() => void run("tasks.delete", { id: selected.id }).then((r) => r !== null && setSelectedId(null))}
          onClose={() => setSelectedId(null)}
          onMessage={setFailure}
        />
      ) : null}
      {editor ? (
        <TaskEditor
          key={editor.mode === "edit" ? editor.task.id : "new"}
          task={editor.mode === "edit" ? editor.task : null}
          initial={editor.mode === "new" && editor.due ? { due: editor.due } : {}}
          projects={projects}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            setSelectedId(saved.id);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
