import type { TaskDto } from "@huhu/contracts";
import { Button, EmptyState, IconButton, Segmented } from "@huhu/ui";
import { queryKey, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { CalendarDays, CheckCircle2, Columns2, List, Plus, Search } from "lucide-react";
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

export function TasksModule() {
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
  const visible = useMemo(() => tasks.filter((x) => inCategory(x, category, today) && matchesQuery(x, query)), [tasks, category, today, query]);
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

  async function toggle(task: TaskDto, next: boolean) {
    if (pending[task.id]) return; // 回执前不重复提交（同一个 expectedVersion 会冲突）
    setFailure(null);
    setPending((p) => ({ ...p, [task.id]: true }));
    qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, completed: next } : x))); // 乐观更新
    try {
      await engine.call("tasks.setCompleted", { id: task.id, completed: next, expectedVersion: task.version }, { write: true });
    } catch (e) {
      qc.setQueryData<TaskDto[]>(key, (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, completed: task.completed } : x))); // 只还原这一个任务
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
  const viewProps = { tasks: visible, pending, selectedId, onToggle: (task: TaskDto, next: boolean) => void toggle(task, next), onOpen: open };
  return (
    <div className={`module-layout tw-workbench${selected ? " detail-open" : ""}`} data-testid="tasks-module">
      <aside className="tw-navigation">
        <div className="tw-nav-title">
          <CheckCircle2 size={16} aria-hidden />
          <strong>{t.title}</strong>
          <IconButton icon={Plus} label={t.create} onClick={() => setEditor({ mode: "new" })} />
        </div>
        <p className="tw-vault-name">{vault.data?.name ?? ""}</p>
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
        <div className="tw-nav-bottom">
          <p>
            {t.navHintA}
            <br />
            {t.navHintB}
          </p>
        </div>
      </aside>
      <main className="tw-task-main">
        <header className="tw-heading">
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
        <div className="tw-list-toolbar">
          <div className="tw-search">
            <Search size={14} aria-hidden />
            <input aria-label={t.search} placeholder={t.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="task-search" />
          </div>
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
        <div className="tw-task-content">
          {failure ? (
            <div role="alert" className="field-error">
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
        <footer className="tw-main-footer">
          <span>{t.footer}</span>
        </footer>
      </main>
      {selected ? (
        <TaskDetail
          key={selected.id}
          task={selected}
          pending={pending[selected.id] === true}
          onToggle={(next) => void toggle(selected, next)}
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
