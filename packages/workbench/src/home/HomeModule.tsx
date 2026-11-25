import { homeWidgetType, kernelHomeWidgets, type DashboardBoard, type HomeWidgetDefinition, type Settings } from "@huhu/contracts";
import { Button, PageHead } from "@huhu/ui";
import { Activity, CheckCircle2, ChevronRight, FileText, Inbox, LayoutGrid, ListTodo, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry, HomeWidgetContribution } from "../contributions.js";
import { useCapability, useDiscoveredCapabilities, useEngine } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";
import type { UiState } from "../state/ui-store.js";
import { FocusCard } from "./FocusCard.js";
import { HabitsCard } from "./HabitsCard.js";
import { Dashboard } from "./Dashboard.js";
import { WidgetReadStatus } from "./WidgetReadStatus.js";
import { useDashboard } from "./useDashboard.js";

export { WidgetReadStatus } from "./WidgetReadStatus.js";

type Instance = DashboardBoard["instances"][number];
type Navigate = (id: string) => void;
type HomeProps = { ui: StoreApi<UiState>; registry: ContributionRegistry };

export function HomeModule(props: HomeProps) {
  const { vaultId } = useEngine();
  return <HomeDashboard key={vaultId} {...props} />;
}

function HomeDashboard({ ui, registry }: HomeProps) {
  const contributed = useSyncExternalStore(registry.subscribe, registry.getSnapshot).homeWidgets;
  const dashboard = useDashboard(ui);
  const available = useDiscoveredCapabilities();
  const plugins = useCapability<{ id: string; state: string; title: string }[]>("plugins.list");
  const previousPlugins = useRef(plugins.data);
  const { refetch: refreshCapabilities } = available;
  useEffect(() => {
    const previous = previousPlugins.current;
    previousPlugins.current = plugins.data;
    if (plugins.data && previous && plugins.data.some(({ id, state }) => state === "active" && !previous.some((plugin) => plugin.id === id && plugin.state === "active"))) {
      // A discovery request can finish before the plugin list observes activation.
      void refreshCapabilities();
    }
  }, [plugins.data, refreshCapabilities]);
  const capabilities = new Set(available.data?.map(({ name }) => name));
  const pluginStates = new Map(plugins.data?.map(({ id, state }) => [id, state]));
  const pluginTitles = new Map(plugins.data?.map(({ id, title }) => [id, title]));
  const widgets = new Map<string, HomeWidgetContribution>(contributed.map((widget) => [homeWidgetType(widget.plugin, widget.id), widget]));
  const allDefinitions = [...Object.values(kernelHomeWidgets), ...registry.getHomeWidgetCatalog(capabilities).map(({ definition }) => definition)];
  const definitions = new Map<string, HomeWidgetDefinition>(allDefinitions.map((widget) => [homeWidgetType(widget.owner, widget.id), widget]));
  const allowed = (type: string) => {
    const definition = definitions.get(type);
    if (!definition) return false;
    if (definition.owner !== "kernel" && pluginStates.get(definition.owner) !== "active") return false;
    return definition.capabilities.every(({ name, required }) => !required || (available.isSuccess && capabilities.has(name)));
  };
  const unavailableReason = (type: string) => {
    const state = pluginStates.get(type.split(":")[1] ?? "");
    if (state === "disabled") return "卡片所需的插件已停用";
    if (state === "failed") return "卡片所需的插件启动失败";
    if (plugins.isPending) return "正在读取卡片目录…";
    if (plugins.isError) return "暂时无法读取插件状态";
    if (!definitions.has(type)) return "缺少此卡片的定义";
    if (available.isPending) return "正在检查卡片权限…";
    if (available.isError) return "暂时无法读取可用能力";
    return "当前连接没有卡片所需的读取权限";
  };
  const navigate: Navigate = (id) => {
    void ui.getState().openModule(id);
  };

  function renderWidget(instance: Instance) {
    if (!allowed(instance.widgetType)) return null;
    switch (instance.widgetType) {
      case "widget:kernel:metrics":
        return <MetricsCard title={instance.title} onNavigate={navigate} />;
      case "widget:kernel:focus":
        return <FocusCard onNavigate={navigate} />;
      case "widget:kernel:habits":
        return (
          <section className="hu-card-alt">
            <HabitsCard />
          </section>
        );
      case "widget:kernel:activity":
        return <ActivityCard title={instance.title} />;
    }
    const widget = widgets.get(instance.widgetType);
    if (!widget) return null;
    const Widget = widget.component;
    return (
      <section className="hu-card-alt home-widget" data-testid={`card-${widget.plugin}-${widget.id}`}>
        <div className="shell-card-head">
          <h2>{instance.title || widget.title}</h2>
        </div>
        <Widget onNavigate={navigate} config={instance.config} />
      </section>
    );
  }

  return (
    <div className="hu-module-layout home-layout" data-testid="home-module">
      <div className="hu-view-content hu-home-content">
        <PageHead
          eyebrow={tHome.eyebrow}
          title={tHome.headline.overview}
          description={tHome.description}
          actions={
            <>
              <Button icon={LayoutGrid} aria-pressed={Boolean(dashboard.draft)} disabled={!dashboard.snapshot.data?.writable || Boolean(dashboard.draft)} data-testid="home-customize" onClick={dashboard.start}>
                {tHome.customize.open}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => navigate("notes")}>
                {tHome.newItem}
              </Button>
            </>
          }
        />
        <div className="shell-home-scroll hu-scroll">
          <Dashboard
            state={dashboard}
            definitions={definitions}
            definitionsReady={available.isSuccess && plugins.isSuccess}
            allowed={allowed}
            unavailableReason={unavailableReason}
            sourceName={(owner) => owner === "kernel" ? "工作台" : (pluginTitles.get(owner) ?? owner)}
            renderWidget={renderWidget}
            configureWidget={(instance, onChange, disabled) => {
              if (!allowed(instance.widgetType)) return null;
              const Configure = widgets.get(instance.widgetType)?.configure;
              return Configure ? <Configure config={instance.config} onChange={onChange} disabled={disabled} /> : null;
            }}
          />
          <div className="shell-home-footnote">{tHome.footnote}</div>
        </div>
      </div>
    </div>
  );
}

interface Summary {
  tasksOpen: number;
  inboxPending: number;
  notes: number;
  rulesEnabled: number;
  enabled: { tasks: boolean; inbox: boolean; notes: boolean; automations: boolean };
}

function MetricsCard({ title, onNavigate }: { title: Instance["title"]; onNavigate: Navigate }) {
  const summary = useCapability<Summary>("home.summary");
  const data = summary.data;
  if (!data || summary.isError) return <WidgetReadStatus title={title || kernelHomeWidgets.metrics.title} failed={summary.isError} retry={() => void summary.refetch()} />;
  const metric = (testId: string, icon: ReactNode, tone: string, [label, unit]: readonly [string, string], value: number, target: string) => (
    <button type="button" data-testid={testId} onClick={() => onNavigate(target)}>
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
  return (
    <div className="shell-overview-metrics">
      {data.enabled.tasks ? metric("card-open", <ListTodo size={19} aria-hidden />, "amber", tHome.metrics.tasks, data.tasksOpen, "tasks") : null}
      {data.enabled.notes ? metric("card-notes", <FileText size={19} aria-hidden />, "violet", tHome.metrics.notes, data.notes, "notes") : null}
      {data.enabled.inbox ? metric("card-inbox", <Inbox size={19} aria-hidden />, "blue", tHome.metrics.inbox, data.inboxPending, "inbox") : null}
      {data.enabled.automations ? metric("card-rules", <RefreshCw size={19} aria-hidden />, "green", tHome.metrics.rules, data.rulesEnabled, "automations") : null}
    </div>
  );
}

interface EventRow {
  id: string;
  time: string;
  module: string;
  message: string;
  tone: "success" | "error" | "neutral";
}

function ActivityCard({ title }: { title: Instance["title"] }) {
  const [module, setModule] = useState("");
  const settings = useCapability<Pick<Settings, "dateTime">>("settings.get");
  const events = useCapability<{ events: EventRow[]; modules: string[] }>("health.events", { limit: 100, ...(module ? { module } : {}) });
  const data = events.data;
  return (
    <section className="hu-card-alt" data-testid="card-activity">
      <div className="shell-card-head">
        <h2>
          <Activity size={17} aria-hidden /> {title || tHome.activityCard.title}
        </h2>
        <select aria-label={tHome.activityCard.module} value={module} onChange={(event) => setModule(event.target.value)}>
          <option value="">{tHome.activityCard.allModules}</option>
          {(data?.modules ?? (module ? [module] : [])).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      {events.isError || !data ? (
        <WidgetReadStatus failed={events.isError} retry={() => void events.refetch()} />
      ) : (
        <div className="shell-activity-feed compact">
          {data.events.map((event) => (
            <div className="shell-activity-row" key={event.id}>
              <div className="shell-activity-marker">
                <span />
              </div>
              <div className="hu-flex-fill">
                <strong>{event.message}</strong>
                <div>
                  {event.module} <span>·</span> {new Date(event.time).toLocaleString("zh-CN", { timeZone: settings.data?.dateTime.zone })}
                </div>
              </div>
              {event.tone === "success" ? <CheckCircle2 size={14} className="shell-success-text" aria-hidden /> : null}
            </div>
          ))}
          {data.events.length === 0 ? <div className="hu-mini-empty">{tHome.activityCard.empty}</div> : null}
        </div>
      )}
    </section>
  );
}
