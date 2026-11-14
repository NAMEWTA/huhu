import type { TaskDto } from "@huhu/contracts";
import { Badge, Button, Dialog, EmptyState, IconButton, PageHead, Segmented } from "@huhu/ui";
import { Activity, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, CheckCircle2, ChevronRight, Clock, FileText, Inbox, LayoutGrid, ListTodo, Plus, RefreshCw, Sparkles, Target } from "lucide-react";
import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry, ModuleProps } from "../contributions.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";
import type { UiState } from "../state/ui-store.js";
import { FocusCard } from "./FocusCard.js";
import { HabitsCard } from "./HabitsCard.js";

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
/** 卡片 id：内置卡片，或插件贡献的 `widget:<插件>:<卡片>`。 */
type Card = string;
/** 首页的两列：同一列里的卡片可以调整先后。 */
const CORE_COLUMNS: Card[][] = [
  ["tasks", "recent", "activity"],
  ["focus", "inbox"],
];
const CORE_CARDS: Card[] = ["focus", "habits", "tasks", "inbox", "recent", "activity"];
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
  const widgetIds = contributed.map((w) => `widget:${w.plugin}:${w.id}`);
  const HOME_COLUMNS: Card[][] = [CORE_COLUMNS[0] as Card[], [...(CORE_COLUMNS[1] as Card[]), ...widgetIds]];
  const CARDS: Card[] = [...CORE_CARDS, ...widgetIds];
  const s = useCapability<Summary>("home.summary", {});
  const widgets = useCapability<{ hidden: string[]; order: string[] }>("home.widgets.get", {});
  const tasks = useCapability<TaskDto[]>("tasks.list", { status: ["not_started", "in_progress"] });
  const inbox = useCapability<Capture[]>("inbox.list", { status: "pending" });
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get", {});
  // 分区由外壳的模块页签（原型：标题上方的“总览 / 今日安排 / 最近活动”）提供；没有外壳时用本地状态
  const [localSection, setLocalSection] = useState<Section>("overview");
  const section: Section = sectionProp === "today" || sectionProp === "activity" || sectionProp === "overview" ? sectionProp : onSection ? "overview" : localSection;
  const setSection = (x: Section) => (onSection ? onSection(x) : setLocalSection(x));
  const [filter, setFilter] = useState<"all" | "today">("all");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = new Set(widgets.data?.hidden ?? []);
  const show = (c: Card) => !hidden.has(c);
  const nav = (id: string) => ui.getState().openModule(id);
  const d = s.data;

  /** 在同一列内上移 / 下移一张卡片（顺序写进 widgets.json 的 order）。 */
  async function moveCard(c: Card, dir: -1 | 1) {
    setError(null);
    const col = HOME_COLUMNS.find((x) => x.includes(c)) ?? [c];
    const cur = orderedCards(col);
    const i = cur.indexOf(c);
    const j = i + dir;
    if (j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[i], next[j]] = [next[j] as Card, next[i] as Card];
    // 其他列的顺序保持不变：order 只重写本列的相对顺序，并保留其他卡片已有的位置
    const rest = (widgets.data?.order ?? []).filter((x) => !col.includes(x));
    try {
      await engine.call("home.widgets.update", { hidden: [...hidden], order: [...rest, ...next] }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleCard(c: Card) {
    setError(null);
    try {
      const next = hidden.has(c) ? [...hidden].filter((x) => x !== c) : [...hidden, c];
      await engine.call("home.widgets.update", { hidden: next, order: widgets.data?.order ?? [] }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function complete(t: TaskDto) {
    setError(null);
    try {
      await engine.call("tasks.setStatus", { id: t.id, status: "completed", expectedVersion: t.version }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const cardLabel = (c: Card): string => tHome.customize.cards[c] ?? contributed.find((w) => `widget:${w.plugin}:${w.id}` === c)?.title ?? c;
  const zone = settings.data?.dateTime.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date()); // “今天”按设置的时区，不是 UTC
  const pending = useMemo(() => (tasks.data ?? []).filter((t) => t.status !== "completed"), [tasks.data]);
  const taskRows = pending.filter((t) => (section !== "today" && filter === "all") || (d && t.due === today)).slice(0, 5);
  if (!d) return <div className="hu-module-layout home-layout" data-testid="home-module" />;

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

  const order = (widgets.data?.order ?? []).filter((c) => CARDS.includes(c));
  /** 同一列里的卡片按用户排的顺序显示；没排过的保持默认顺序（排在已排的后面）。 */
  const orderedCards = (col: Card[]): Card[] => [...col].sort((x, y) => (order.indexOf(x) < 0 ? 99 : order.indexOf(x)) - (order.indexOf(y) < 0 ? 99 : order.indexOf(y)) || col.indexOf(x) - col.indexOf(y));
  const mainNodes: Record<string, React.ReactNode> = {
    tasks:
      show("tasks") && d.enabled.tasks ? (
        <section className="hu-card-alt hu-home-task-card" data-testid="card-tasks">
          <div className="shell-card-head">
            <h2>
              <Target size={17} aria-hidden /> {tHome.tasksCard.title} <Badge>{pending.length}</Badge>
            </h2>
            <div className="row">
              <Segmented<"all" | "today">
                label={tHome.tasksCard.title}
                value={section === "today" ? "today" : filter}
                onChange={(v) => {
                  setFilter(v);
                  if (section === "today" && v === "all") setSection("overview");
                }}
                options={[
                  { value: "all", label: tHome.tasksCard.all },
                  { value: "today", label: tHome.tasksCard.today },
                ]}
              />
              <IconButton icon={Plus} label={tHome.tasksCard.add} onClick={() => nav("tasks")} />
            </div>
          </div>
          <div className="home-task-list">
            {taskRows.map((t) => (
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
            {pending.length === 0 ? <EmptyState icon={CheckCircle2} title={tHome.tasksCard.allDone} hint={tHome.tasksCard.rest} /> : null}
          </div>
          <button type="button" className="hu-card-footer-link" onClick={() => nav("tasks")}>
            {tHome.tasksCard.viewAll} <ArrowRight size={14} aria-hidden />
          </button>
        </section>
      ) : null,
    recent:
      show("recent") && d.enabled.notes ? (
        <section className="hu-card-alt" data-testid="card-recent">
          <div className="shell-card-head">
            <h2>
              <Clock size={17} aria-hidden /> {tHome.recentCard.title}
            </h2>
            <button type="button" className="shell-link-button" onClick={() => nav("notes")}>
              {tHome.recentCard.all} <ArrowUpRight size={13} aria-hidden />
            </button>
          </div>
          {d.recentNotes.length === 0 ? (
            <EmptyState title={tHome.noRecent} />
          ) : (
            <div className="shell-recent-note-grid">
              {d.recentNotes.map((n, i) => (
                <button type="button" className="shell-recent-note" key={n.path} onClick={() => nav("notes")}>
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
      ) : null,
    activity: show("activity") ? (
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
    ) : null,
  };
  const sideNodes: Record<string, React.ReactNode> = {
    focus: show("focus") ? <FocusCard>{show("habits") ? <HabitsCard /> : null}</FocusCard> : null,
    inbox:
      show("inbox") && d.enabled.inbox ? (
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
      ) : null,
  };
  for (const w of contributed) {
    const id = `widget:${w.plugin}:${w.id}`;
    const W = w.component;
    sideNodes[id] = show(id) ? (
      <section className="hu-card-alt home-widget" data-testid={`card-${w.plugin}-${w.id}`}>
        <div className="shell-card-head">
          <h2>{w.title}</h2>
        </div>
        <W onNavigate={nav} />
      </section>
    ) : null;
  }

  return (
    <div className="hu-module-layout home-layout" data-testid="home-module">
      <div className="hu-view-content hu-home-content">
        <PageHead
          eyebrow={tHome.eyebrow}
          title={tHome.headline[section]}
          description={tHome.description}
          actions={
            <>
              <Button icon={LayoutGrid} aria-expanded={editing} data-testid="home-customize" onClick={() => setEditing(true)}>
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
          {section === "activity" ? (
            <ActivityFeed zone={zone} />
          ) : (
            <>
              <div className="shell-overview-metrics">
                {d.enabled.tasks ? metric("tasks", "card-open", <ListTodo size={19} aria-hidden />, "amber", tHome.metrics.tasks, d.tasksOpen, "tasks") : null}
                {d.enabled.notes ? metric("notes", "card-notes", <FileText size={19} aria-hidden />, "violet", tHome.metrics.notes, d.notes, "notes") : null}
                {d.enabled.inbox ? metric("inbox", "card-inbox", <Inbox size={19} aria-hidden />, "blue", tHome.metrics.inbox, d.inboxPending, "inbox") : null}
                {d.enabled.automations ? metric("rules", "card-rules", <RefreshCw size={19} aria-hidden />, "green", tHome.metrics.rules, d.rulesEnabled, "automations") : null}
              </div>
              <div className="shell-home-grid">
                <div className="shell-home-main-column">
                  {orderedCards(HOME_COLUMNS[0] as Card[]).map((c) => (
                    <Fragment key={c}>{mainNodes[c]}</Fragment>
                  ))}
                </div>
                <div className="shell-home-side-column">
                  {orderedCards(HOME_COLUMNS[1] as Card[]).map((c) => (
                    <Fragment key={c}>{sideNodes[c]}</Fragment>
                  ))}
                  {d.enabled.agentCli ? (
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
                  ) : null}
                </div>
              </div>
            </>
          )}
          <div className="shell-home-footnote">{tHome.footnote}</div>
        </div>
      </div>
      <Dialog open={editing} title={tHome.customize.title} description={tHome.customize.description} onClose={() => setEditing(false)} testId="home-customize-panel">
        <div className="hu-form-body">
          {CARDS.map((c) => {
            const col = HOME_COLUMNS.find((x) => x.includes(c));
            const pos = col ? orderedCards(col).indexOf(c) : -1;
            return (
              <div key={c} className="row" data-testid="home-card-row">
                <label className="checkbox-row grow">
                  <input type="checkbox" checked={show(c)} aria-label={cardLabel(c)} onChange={() => void toggleCard(c)} /> {cardLabel(c)}
                </label>
                {col ? (
                  <>
                    <IconButton icon={ArrowUp} label={`上移 ${cardLabel(c)}`} disabled={pos <= 0} onClick={() => void moveCard(c, -1)} />
                    <IconButton icon={ArrowDown} label={`下移 ${cardLabel(c)}`} disabled={pos < 0 || pos >= col.length - 1} onClick={() => void moveCard(c, 1)} />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}

/** 最近活动（原型 ActivityFeed）：事件日志里面向用户的事件，新的在前；完整页可按来源筛选。 */
function ActivityFeed({ compact = false, zone }: { compact?: boolean; zone: string }) {
  const [module, setModule] = useState("");
  const ev = useCapability<{ events: EventRow[]; modules: string[] }>("health.events", { limit: compact ? 4 : 100, ...(module ? { module } : {}) });
  const rows = ev.data?.events ?? [];
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
