import { homeWidgetType, kernelHomeWidgets, type DashboardBoard, type TaskDto } from "@huhu/contracts";
import { Badge, Button, EmptyState, IconButton, PageHead, Segmented } from "@huhu/ui";
import { Activity, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Clock, FileText, Inbox, LayoutGrid, ListTodo, Plus, RefreshCw, Sparkles, Target } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry, ModuleProps } from "../contributions.js";
import { useCapability, useDiscoveredCapabilities, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";
import type { UiState } from "../state/ui-store.js";
import { requestOpenPath } from "../state/open-request.js";
import { FocusCard } from "./FocusCard.js";
import { HabitsCard } from "./HabitsCard.js";
import { Dashboard } from "./Dashboard.js";
import { WidgetReadStatus } from "./WidgetReadStatus.js";
import { useDashboard } from "./useDashboard.js";

interface Summary {
  vault: { id: string; name: string };
  tasksToday: number;
  tasksOpen: number;
  inboxPending: number;
  notes: number;
  rulesEnabled: number;
  recentNotes: { path: string; title: string; folder: string; updatedAt: string; snippet: string }[];
  enabled: { tasks: boolean; inbox: boolean; notes: boolean; automations: boolean; agentCli: boolean };
}
interface Capture {
  id: string;
  title: string;
  source: string;
}
interface EventRow {
  id: string;
  time: string;
  module: string;
  message: string;
  tone: "success" | "error" | "neutral";
}
const NO_WIDGETS: ReturnType<ContributionRegistry["getSnapshot"]> = { modules: [], commands: [], homeWidgets: [], settingsPages: [] };
const noop = () => () => undefined;
type Section = "overview" | "today" | "activity";

const fmtDate = (iso: string, zone: string): string => new Date(iso).toLocaleDateString("zh-CN", { timeZone: zone });
const fmtTime = (iso: string, zone: string): string => new Date(iso).toLocaleString("zh-CN", { timeZone: zone });

/** 首页（原型 Home）：页头 → 数字概览 → 左列（我的任务 / 继续上次的思考 / 最近活动）+ 右列（专注与习惯 / 灵感收件箱 / Agent CLI 入口）。 */
export function HomeModule({ ui, registry, section: sectionProp, onSection }: { ui: StoreApi<UiState>; registry?: ContributionRegistry } & Partial<Pick<ModuleProps, "section" | "onSection">>) {
  const engine = useEngine();
  const qc = useQueryClient();
  const contributed = useSyncExternalStore(registry ? registry.subscribe : noop, registry ? registry.getSnapshot : () => NO_WIDGETS).homeWidgets;
  const dashboard = useDashboard(ui);
  const available = useDiscoveredCapabilities();
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  const capabilities = new Set(available.data?.map(({ name }) => name));
  const allDefinitions = [...Object.values(kernelHomeWidgets), ...contributed.flatMap((widget) => widget.definition ?? [])];
  const definitions = new Map(allDefinitions.map((widget) => [homeWidgetType(widget.owner, widget.id), widget]));
  const allowed = (type: string) => definitions.get(type as ReturnType<typeof homeWidgetType>)?.capabilities.every((cap) => !cap.required || capabilities.has(cap.name)) ?? false;
  const unavailableReason = (type: string) => {
    const definition = definitions.get(type as ReturnType<typeof homeWidgetType>);
    const owner = type.split(":")[1];
    const unavailablePlugin = plugins.data?.find(
      (plugin) => (plugin.state === "disabled" || plugin.state === "failed") && (plugin.id === owner || definition?.capabilities.some((cap) => cap.required && cap.name.startsWith(`${plugin.id}.`))),
    );
    if (unavailablePlugin?.state === "disabled") return "卡片所需的插件已停用";
    if (unavailablePlugin?.state === "failed") return "卡片所需的插件启动失败";
    if (!definition) return plugins.isPending ? "正在读取卡片目录…" : "缺少此卡片的定义";
    if (available.isPending) return "正在检查卡片权限…";
    if (available.isError) return "暂时无法读取可用能力";
    return "当前连接没有卡片所需的读取权限";
  };
  const s = useCapability<Summary>("home.summary", {});
  const recent = useCapability<Summary["recentNotes"]>("home.notes.recent", {}, { enabled: capabilities.has("notes.list") });
  const tasks = useCapability<TaskDto[]>("tasks.list", { status: ["not_started", "in_progress"] }, { enabled: capabilities.has("tasks.list") });
  const inbox = useCapability<Capture[]>("inbox.list", { status: "pending" }, { enabled: capabilities.has("inbox.list") });
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get", {});
  // 分区由外壳的模块页签（原型：标题上方的“总览 / 今日安排 / 最近活动”）提供；没有外壳时用本地状态
  const [localSection, setLocalSection] = useState<Section>("overview");
  const section: Section = sectionProp === "today" || sectionProp === "activity" || sectionProp === "overview" ? sectionProp : onSection ? "overview" : localSection;
  const setSection = (x: Section) => (onSection ? onSection(x) : setLocalSection(x));
  const [filters, setFilters] = useState<Record<string, "all" | "today">>({});
  const [error, setError] = useState<string | null>(null);
  const nav = (id: string) => ui.getState().openModule(id);
  const d = s.data;

  async function complete(t: TaskDto) {
    setError(null);
    try {
      await engine.call("tasks.setStatus", { id: t.id, status: "completed", expectedVersion: t.version }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const zone = settings.data?.dateTime.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date()); // “今天”按设置的时区，不是 UTC
  const pending = useMemo(() => (tasks.data ?? []).filter((t) => t.status !== "completed"), [tasks.data]);

  const metric = (id: string, testId: string, icon: React.ReactNode, tone: string, [label, unit]: readonly [string, string], value: number, target: string) => (
    <button key={id} type="button" data-testid={testId} onClick={() => nav(target)}>
      <span className={`shell-metric-icon ${tone}`}>{icon}</span>
      <div>
        <span>{label}</span>
        <strong>
          {value}
          <small>{unit}</small>
        </strong>
      </div>
      <ChevronRight size={14} aria-hidden />
    </button>
  );

  const renderTasks = (instance: DashboardBoard["instances"][number]) => {
    const stored = instance.config["filter"];
    const activeFilter = section === "today" || stored === "today" ? "today" : (filters[instance.instanceId] ?? "all");
    const matching = pending.filter((task) => activeFilter === "all" || task.due === today);
    const title = instance.title || tHome.tasksCard.title;
    if (tasks.isError || !tasks.data) return <WidgetReadStatus title={title} failed={tasks.isError} retry={() => void tasks.refetch()} />;
    return (
      <section className="hu-card-alt hu-home-task-card" data-testid="card-tasks">
        <div className="shell-card-head">
          <h2>
            <Target size={17} aria-hidden /> {title} <Badge>{matching.length}</Badge>
          </h2>
          <div className="row">
            {instance.config["filter"] !== "today" ? (
              <Segmented<"all" | "today">
                label={tHome.tasksCard.title}
                value={activeFilter}
                onChange={(v) => {
                  setFilters((previous) => ({ ...previous, [instance.instanceId]: v }));
                  if (section === "today" && v === "all") setSection("overview");
                }}
                options={[
                  { value: "all", label: tHome.tasksCard.all },
                  { value: "today", label: tHome.tasksCard.today },
                ]}
              />
            ) : null}
            <IconButton icon={Plus} label={tHome.tasksCard.add} onClick={() => nav("tasks")} />
          </div>
        </div>
        <div className="home-task-list">
          {matching.slice(0, 5).map((t) => (
            <div className="hu-home-task-row" key={t.id}>
              <button type="button" className="shell-task-check" aria-label={tHome.tasksCard.complete(t.title)} onClick={() => void complete(t)} />
              <button type="button" className="grow shell-task-open" onClick={() => nav("tasks")}>
                <strong>{t.title}</strong>
                <span>
                  {t.project ?? tHome.tasksCard.personal}
                  {t.due ? ` · ${t.due}` : ""}
                </span>
              </button>
              <Badge>{t.type === "agent" ? tHome.tasksCard.agent : tHome.tasksCard.manual}</Badge>
            </div>
          ))}
          {matching.length === 0 ? <EmptyState icon={CheckCircle2} title={activeFilter === "today" ? "今天没有待办任务" : tHome.tasksCard.allDone} hint={activeFilter === "all" ? tHome.tasksCard.rest : undefined} /> : null}
        </div>
        <button type="button" className="hu-card-footer-link" onClick={() => nav("tasks")}>
          {tHome.tasksCard.viewAll} <ArrowRight size={14} aria-hidden />
        </button>
      </section>
    );
  };
  const mainNodes: Record<string, React.ReactNode> = {
    notes:
      recent.data && !recent.isError ? (
        <section className="hu-card-alt" data-testid="card-recent">
          <div className="shell-card-head">
            <h2>
              <Clock size={17} aria-hidden /> {tHome.recentCard.title}
            </h2>
            <button type="button" className="shell-link-button" onClick={() => nav("notes")}>
              {tHome.recentCard.all} <ArrowUpRight size={13} aria-hidden />
            </button>
          </div>
          {recent.data.length === 0 ? (
            <EmptyState title={tHome.noRecent} />
          ) : (
            <div className="shell-recent-note-grid">
              {recent.data.map((n, i) => (
                <button
                  type="button"
                  className="shell-recent-note"
                  key={n.path}
                  onClick={() => {
                    requestOpenPath(n.path, true);
                    nav("notes");
                  }}
                >
                  <div className={`shell-note-symbol hu-note-symbol-${i % 3}`}>
                    <FileText size={18} aria-hidden />
                  </div>
                  <strong>{n.title}</strong>
                  <p>{n.snippet}</p>
                  <div>
                    <span>{n.folder}</span>
                    <span>{fmtDate(n.updatedAt, zone)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <WidgetReadStatus title={tHome.recentCard.title} failed={recent.isError} retry={() => void recent.refetch()} />
      ),
    activity: (
      <section className="hu-card-alt" data-testid="card-activity">
        <div className="shell-card-head">
          <h2>
            <Activity size={17} aria-hidden /> {tHome.activityCard.title}
          </h2>
          <button type="button" className="shell-link-button" onClick={() => setSection("activity")}>
            {tHome.activityCard.all}
          </button>
        </div>
        <ActivityFeed compact zone={zone} />
      </section>
    ),
    focus: <FocusCard />,
    habits: (
      <section className="hu-card-alt">
        <HabitsCard />
      </section>
    ),
    inbox:
      inbox.data && !inbox.isError ? (
        <section className="hu-card-alt shell-home-inbox" data-testid="card-inbox-list">
          <div className="shell-card-head">
            <h2>
              <Inbox size={17} aria-hidden /> {tHome.inboxCard.title}
            </h2>
            <IconButton icon={Plus} label={tHome.inboxCard.add} onClick={() => nav("inbox")} />
          </div>
          {(inbox.data ?? []).slice(0, 3).map((i) => (
            <button type="button" className="shell-inbox-preview" key={i.id} onClick={() => nav("inbox")}>
              <span className="shell-inbox-bullet" />
              <span>
                <strong>{i.title}</strong>
                <small>{i.source}</small>
              </span>
              <ChevronRight size={13} aria-hidden />
            </button>
          ))}
          {(inbox.data ?? []).length === 0 ? <div className="hu-mini-empty">{tHome.inboxCard.empty}</div> : null}
          <button type="button" className="hu-card-footer-link" onClick={() => nav("inbox")}>
            {tHome.inboxCard.organize} <ArrowRight size={14} aria-hidden />
          </button>
        </section>
      ) : (
        <WidgetReadStatus title={tHome.inboxCard.title} failed={inbox.isError} retry={() => void inbox.refetch()} />
      ),
  };
  const renderWidget = (instance: DashboardBoard["instances"][number]) => {
    if (!allowed(instance.widgetType)) return null;
    if (instance.widgetType === "widget:kernel:tasks") return renderTasks(instance);
    if (instance.widgetType === "widget:kernel:metrics") {
      if (!d || s.isError) return <WidgetReadStatus title={instance.title || "概览"} failed={s.isError} retry={() => void s.refetch()} />;
      return (
        <div className="shell-overview-metrics">
          {d.enabled.tasks ? metric("tasks", "card-open", <ListTodo size={19} aria-hidden />, "amber", tHome.metrics.tasks, d.tasksOpen, "tasks") : null}
          {d.enabled.notes ? metric("notes", "card-notes", <FileText size={19} aria-hidden />, "violet", tHome.metrics.notes, d.notes, "notes") : null}
          {d.enabled.inbox ? metric("inbox", "card-inbox", <Inbox size={19} aria-hidden />, "blue", tHome.metrics.inbox, d.inboxPending, "inbox") : null}
          {d.enabled.automations ? metric("rules", "card-rules", <RefreshCw size={19} aria-hidden />, "green", tHome.metrics.rules, d.rulesEnabled, "automations") : null}
        </div>
      );
    }
    if (instance.widgetType === "widget:kernel:agent") {
      return (
        <button type="button" className="shell-agent-invitation" onClick={() => nav("agent-cli")}>
          <div className="shell-agent-invitation-top">
            <Sparkles size={21} aria-hidden />
            <ArrowUpRight size={18} aria-hidden />
          </div>
          <h3>{tHome.agentCard.title}</h3>
          <p>
            {tHome.agentCard.body[0]}
            <br />
            {tHome.agentCard.body[1]}
          </p>
          <span>
            {tHome.agentCard.action} <ArrowRight size={14} aria-hidden />
          </span>
        </button>
      );
    }
    if (instance.widgetType.startsWith("widget:kernel:")) return mainNodes[instance.widgetType.slice("widget:kernel:".length)];
    const widget = contributed.find((item) => homeWidgetType(item.plugin, item.id) === instance.widgetType);
    if (!widget) return null;
    const Widget = widget.component;
    return (
      <section className="hu-card-alt home-widget" data-testid={`card-${widget.plugin}-${widget.id}`}>
        <div className="shell-card-head">
          <h2>{instance.title || widget.title}</h2>
        </div>
        <Widget onNavigate={nav} config={instance.config} />
      </section>
    );
  };

  return (
    <div className="hu-module-layout home-layout" data-testid="home-module">
      <div className="hu-view-content hu-home-content">
        <PageHead
          eyebrow={tHome.eyebrow}
          title={tHome.headline[section]}
          description={tHome.description}
          actions={
            <>
              <Button
                icon={LayoutGrid}
                aria-pressed={Boolean(dashboard.draft)}
                disabled={!dashboard.snapshot.data?.writable || Boolean(dashboard.draft)}
                data-testid="home-customize"
                onClick={() => {
                  if (section === "activity") setSection("overview");
                  dashboard.start();
                }}
              >
                {tHome.customize.open}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => nav("notes")}>
                {tHome.newItem}
              </Button>
            </>
          }
        />
        {error ? (
          <div role="alert" className="hu-field-error">
            {error}
          </div>
        ) : null}
        <div className="shell-home-scroll hu-scroll">
          {section === "activity" && !dashboard.draft ? (
            <ActivityFeed zone={zone} />
          ) : (
            <Dashboard
              state={dashboard}
              definitions={definitions}
              definitionsReady={available.isSuccess}
              allowed={allowed}
              unavailableReason={unavailableReason}
              renderWidget={renderWidget}
              configureWidget={(instance, onChange, disabled) => {
                if (!allowed(instance.widgetType)) return null;
                const Configure = contributed.find((widget) => homeWidgetType(widget.plugin, widget.id) === instance.widgetType)?.configure;
                return Configure ? <Configure config={instance.config} onChange={onChange} disabled={disabled} /> : null;
              }}
            />
          )}
          <div className="shell-home-footnote">{tHome.footnote}</div>
        </div>
      </div>
    </div>
  );
}

/** 最近活动（原型 ActivityFeed）：事件日志里面向用户的事件，新的在前；完整页可按来源筛选。 */
function ActivityFeed({ compact = false, zone }: { compact?: boolean; zone: string }) {
  const [module, setModule] = useState("");
  const ev = useCapability<{ events: EventRow[]; modules: string[] }>("health.events", { limit: compact ? 4 : 100, ...(module ? { module } : {}) });
  const rows = ev.data?.events ?? [];
  if (ev.isError || !ev.data) return <WidgetReadStatus failed={ev.isError} retry={() => void ev.refetch()} />;
  return (
    <div className={`shell-activity-feed${compact ? " compact" : ""}`}>
      {!compact && (ev.data?.modules.length ?? 0) > 0 ? (
        <select aria-label={tHome.activityCard.module} value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">{tHome.activityCard.allModules}</option>
          {ev.data?.modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : null}
      {rows.map((e) => (
        <div className="shell-activity-row" key={e.id}>
          <div className="shell-activity-marker">
            <span />
          </div>
          <div className="grow">
            <strong>{e.message}</strong>
            <div>
              {e.module} <span>·</span> {fmtTime(e.time, zone)}
            </div>
          </div>
          {e.tone === "success" ? <CheckCircle2 size={14} className="shell-success-text" aria-hidden /> : null}
        </div>
      ))}
      {rows.length === 0 ? <div className="hu-mini-empty">{tHome.activityCard.empty}</div> : null}
    </div>
  );
}
