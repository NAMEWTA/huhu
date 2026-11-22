import type { Settings, TaskDto } from "@huhu/contracts";
import { Badge, EmptyState, IconButton, Segmented } from "@huhu/ui";
import { CapabilityError, requestOpenTask, useCapability, useDiscoveredCapabilities, useEngine, useQueryClient, WidgetReadStatus, type HomeWidgetContribution } from "@huhu/workbench";
import { ArrowRight, CheckCircle2, ChevronRight, Plus, Square } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { inCategory } from "../shared/categories.js";
import { useTaskToday } from "./useTaskToday.js";

type Filter = "all" | "today";
type Props = ComponentProps<HomeWidgetContribution["component"]>;
const taskFilter = (config: Props["config"]): Filter => (config["filter"] === "today" ? "today" : "all");

export function TasksHomeWidget({ config, onNavigate }: Props) {
  const filter = taskFilter(config);
  return <TaskList key={filter} initialFilter={filter} onNavigate={onNavigate} />;
}

function TaskList({ initialFilter, onNavigate }: { initialFilter: Filter; onNavigate: Props["onNavigate"] }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const tasks = useCapability<TaskDto[]>("tasks.list", { status: ["not_started", "in_progress"] });
  const settings = useCapability<Pick<Settings, "dateTime">>("settings.get");
  const vault = useCapability<{ readOnly: boolean }>("vault.info");
  const capabilities = useDiscoveredCapabilities();
  const [filter, setFilter] = useState(initialFilter);
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = useTaskToday(settings.data?.dateTime.zone);
  const canComplete = vault.isSuccess && !vault.data.readOnly && capabilities.isSuccess && capabilities.data.some(({ name }) => name === "tasks.setStatus");
  const matching = tasks.data?.filter((task) => inCategory(task, filter, today)) ?? [];
  const datePending = filter === "today" && !settings.data;

  async function complete(task: TaskDto) {
    if (!canComplete || completing) return;
    setCompleting(task.id);
    setError(null);
    try {
      await engine.call("tasks.setStatus", { id: task.id, status: "completed", expectedVersion: task.version }, { write: true });
      await qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId });
    } catch (error) {
      if (error instanceof CapabilityError && error.code === "VERSION_CONFLICT") {
        const refreshed = await tasks.refetch();
        setError(refreshed.isSuccess ? "任务已被修改，已重新读取，请核对后重试。" : "任务已被修改，暂时无法读取新版本。");
      } else {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div className="hu-home-task-card" data-testid="card-tasks">
      <div className="shell-card-head">
        <span>待办 {tasks.data && !datePending ? <Badge>{matching.length}</Badge> : null}</span>
        <div className="row">
          <Segmented<Filter>
            label="任务范围"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "全部" },
              { value: "today", label: "今天" },
            ]}
          />
          <IconButton icon={Plus} label="添加任务" onClick={() => onNavigate("tasks")} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="hu-field-error">
          {error}
        </p>
      ) : null}
      {tasks.isError || !tasks.data || datePending ? (
        <WidgetReadStatus failed={tasks.isError || (datePending && settings.isError)} retry={() => void (datePending && !tasks.isError ? settings.refetch() : tasks.refetch())} />
      ) : (
        <div className="home-task-list">
          {matching.slice(0, 5).map((task) => (
            <div className="hu-home-task-row" key={task.id}>
              <IconButton icon={Square} label={`完成任务 ${task.title}`} disabled={!canComplete || completing !== null} onClick={() => void complete(task)} />
              <div className="hu-flex-fill tasks-home-widget-task">
                <strong>{task.title}</strong>
                <span>
                  {task.project ?? "个人任务"}
                  {task.due ? ` · ${task.due}` : ""}
                </span>
              </div>
              <Badge>{task.type === "agent" ? "Agent" : "手动"}</Badge>
              <IconButton
                icon={ChevronRight}
                label={`打开任务 ${task.title}`}
                onClick={() => {
                  requestOpenTask(task.id);
                  onNavigate("tasks");
                }}
              />
            </div>
          ))}
          {matching.length === 0 ? <EmptyState icon={CheckCircle2} title={filter === "today" ? "今天没有待办任务" : "任务都完成了"} /> : null}
        </div>
      )}
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("tasks")}>
        查看所有任务 <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}

export function TasksHomeWidgetConfig({ config, onChange, disabled }: ComponentProps<NonNullable<HomeWidgetContribution["configure"]>>) {
  return (
    <label className="row">
      显示任务
      <select disabled={disabled} value={taskFilter(config)} onChange={(event) => onChange({ filter: event.target.value })}>
        <option value="all">全部待办</option>
        <option value="today">今日</option>
      </select>
    </label>
  );
}
