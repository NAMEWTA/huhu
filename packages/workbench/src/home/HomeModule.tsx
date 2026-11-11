import type { TaskDto } from "@huhu/contracts";
import { Badge, Button, Dialog, EmptyState, IconButton, PageHead, Segmented } from "@huhu/ui";
import { Activity, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Clock, FileText, Inbox, LayoutGrid, ListTodo, Plus, RefreshCw, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
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
type Card = "focus" | "habits" | "tasks" | "inbox" | "recent" | "activity";
const CARDS: Card[] = ["focus", "habits", "tasks", "inbox", "recent", "activity"];
type Section = "overview" | "today" | "activity";

const fmtDate = (iso: string, zone: string): string => new Date(iso).toLocaleDateString("zh-CN", { timeZone: zone });
const fmtTime = (iso: string, zone: string): string => new Date(iso).toLocaleString("zh-CN", { timeZone: zone });

/** 首页（原型 Home）：页头 → 数字概览 → 左列（我的任务 / 继续上次的思考 / 最近活动）+ 右列（专注与习惯 / 灵感收件箱 / Agent CLI 入口）。 */
export function HomeModule({ ui }: { ui: StoreApi<UiState> }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const s = useCapability<Summary>("home.summary", {});
  const widgets = useCapability<{ hidden: Card[] }>("home.widgets.get", {});
  const tasks = useCapability<TaskDto[]>("tasks.list", { completed: false });
  const inbox = useCapability<Capture[]>("inbox.list", { status: "pending" });
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get", {});
  const [section, setSection] = useState<Section>("overview");
  const [filter, setFilter] = useState<"all" | "today">("all");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = new Set(widgets.data?.hidden ?? []);
  const show = (c: Card) => !hidden.has(c);
  const nav = (id: string) => ui.getState().openModule(id);
  const d = s.data;

  async function toggleCard(c: Card) {
    setError(null);
    try {
      const next = hidden.has(c) ? [...hidden].filter((x) => x !== c) : [...hidden, c];
      await engine.call("home.widgets.update", { hidden: next }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function complete(t: TaskDto) {
    setError(null);
    try {
      await engine.call("tasks.setCompleted", { id: t.id, completed: true, expectedVersion: t.version }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const zone = settings.data?.dateTime.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date()); // “今天”按设置的时区，不是 UTC
  const pending = useMemo(() => (tasks.data ?? []).filter((t) => !t.completed), [tasks.data]);
  const taskRows = pending.filter((t) => (section !== "today" && filter === "all") || (d && t.due === today)).slice(0, 5);
  if (!d) return <div className="module-layout home-layout" data-testid="home-module" />;

  const metric = (id: string, testId: string, icon: React.ReactNode, tone: string, [label, unit]: readonly [string, string], value: number, target: string) => (
    <button key={id} type="button" data-testid={testId} onClick={() => nav(target)}>
      <span className={`metric-icon ${tone}`}>{icon}</span>
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
    <div className="module-layout home-layout" data-testid="home-module">
      <div className="view-content home-content">
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
        <Segmented<Section>
          label={tHome.sections.label}
          value={section}
          onChange={setSection}
          options={[
            { value: "overview", label: tHome.sections.overview },
            { value: "today", label: tHome.sections.today },
            { value: "activity", label: tHome.sections.activity },
          ]}
        />
        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
        <div className="home-scroll scroll">
          {section === "activity" ? (
            <ActivityFeed zone={zone} />
          ) : (
            <>
              <div className="overview-metrics">
                {d.enabled.tasks ? metric("tasks", "card-open", <ListTodo size={19} aria-hidden />, "amber", tHome.metrics.tasks, d.tasksOpen, "tasks") : null}
                {d.enabled.notes ? metric("notes", "card-notes", <FileText size={19} aria-hidden />, "violet", tHome.metrics.notes, d.notes, "notes") : null}
                {d.enabled.inbox ? metric("inbox", "card-inbox", <Inbox size={19} aria-hidden />, "blue", tHome.metrics.inbox, d.inboxPending, "inbox") : null}
                {d.enabled.automations ? metric("rules", "card-rules", <RefreshCw size={19} aria-hidden />, "green", tHome.metrics.rules, d.rulesEnabled, "automations") : null}
              </div>
              <div className="home-grid">
                <div className="home-main-column">
                  {show("tasks") && d.enabled.tasks ? (
                    <section className="card home-task-card" data-testid="card-tasks">
                      <div className="card-head">
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
                          <div className="home-task-row" key={t.id}>
                            <button type="button" className="task-check" aria-label={tHome.tasksCard.complete(t.title)} onClick={() => void complete(t)} />
                            <button type="button" className="grow task-open" onClick={() => nav("tasks")}>
                              <strong>{t.title}</strong>
                              <span>
                                {t.project ?? tHome.tasksCard.personal}
                                {t.due ? ` · ${t.due}` : ""}
                              </span>
                            </button>
                            <Badge>{t.execution.kind === "agent" ? tHome.tasksCard.agent : tHome.tasksCard.manual}</Badge>
                          </div>
                        ))}
                        {pending.length === 0 ? <EmptyState icon={CheckCircle2} title={tHome.tasksCard.allDone} hint={tHome.tasksCard.rest} /> : null}
                      </div>
                      <button type="button" className="card-footer-link" onClick={() => nav("tasks")}>
                        {tHome.tasksCard.viewAll} <ArrowRight size={14} aria-hidden />
                      </button>
                    </section>
                  ) : null}
                  {show("recent") && d.enabled.notes ? (
                    <section className="card" data-testid="card-recent">
                      <div className="card-head">
                        <h2>
                          <Clock size={17} aria-hidden /> {tHome.recentCard.title}
                        </h2>
                        <button type="button" className="link-button" onClick={() => nav("notes")}>
                          {tHome.recentCard.all} <ArrowUpRight size={13} aria-hidden />
                        </button>
                      </div>
                      {d.recentNotes.length === 0 ? (
                        <EmptyState title={tHome.noRecent} />
                      ) : (
                        <div className="recent-note-grid">
                          {d.recentNotes.map((n, i) => (
                            <button type="button" className="recent-note" key={n.path} onClick={() => nav("notes")}>
                              <div className={`note-symbol note-symbol-${i % 3}`}>
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
                  ) : null}
                  {show("activity") ? (
                    <section className="card" data-testid="card-activity">
                      <div className="card-head">
                        <h2>
                          <Activity size={17} aria-hidden /> {tHome.activityCard.title}
                        </h2>
                        <button type="button" className="link-button" onClick={() => setSection("activity")}>
                          {tHome.activityCard.all}
                        </button>
                      </div>
                      <ActivityFeed compact zone={zone} />
                    </section>
                  ) : null}
                </div>
                <div className="home-side-column">
                  {show("focus") ? <FocusCard>{show("habits") ? <HabitsCard /> : null}</FocusCard> : null}
                  {show("inbox") && d.enabled.inbox ? (
                    <section className="card home-inbox" data-testid="card-inbox-list">
                      <div className="card-head">
                        <h2>
                          <Inbox size={17} aria-hidden /> {tHome.inboxCard.title}
                        </h2>
                        <IconButton icon={Plus} label={tHome.inboxCard.add} onClick={() => nav("inbox")} />
                      </div>
                      {(inbox.data ?? []).slice(0, 3).map((i) => (
                        <button type="button" className="inbox-preview" key={i.id} onClick={() => nav("inbox")}>
                          <span className="inbox-bullet" />
                          <span>
                            <strong>{i.title}</strong>
                            <small>{i.source}</small>
                          </span>
                          <ChevronRight size={13} aria-hidden />
                        </button>
                      ))}
                      {(inbox.data ?? []).length === 0 ? <div className="mini-empty">{tHome.inboxCard.empty}</div> : null}
                      <button type="button" className="card-footer-link" onClick={() => nav("inbox")}>
                        {tHome.inboxCard.organize} <ArrowRight size={14} aria-hidden />
                      </button>
                    </section>
                  ) : null}
                  {d.enabled.agentCli ? (
                    <button type="button" className="agent-invitation" onClick={() => nav("agent-cli")}>
                      <div className="agent-invitation-top">
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
          <div className="home-footnote">{tHome.footnote}</div>
        </div>
      </div>
      <Dialog open={editing} title={tHome.customize.title} description={tHome.customize.description} onClose={() => setEditing(false)} testId="home-customize-panel">
        <div className="form-body">
          {CARDS.map((c) => (
            <label key={c} className="checkbox-row">
              <input type="checkbox" checked={show(c)} aria-label={tHome.customize.cards[c]} onChange={() => void toggleCard(c)} /> {tHome.customize.cards[c]}
            </label>
          ))}
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
    <div className={`activity-feed${compact ? " compact" : ""}`}>
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
        <div className="activity-row" key={e.id}>
          <div className="activity-marker">
            <span />
          </div>
          <div className="grow">
            <strong>{e.message}</strong>
            <div>
              {e.module} <span>·</span> {fmtTime(e.time, zone)}
            </div>
          </div>
          {e.tone === "success" ? <CheckCircle2 size={14} className="success-text" aria-hidden /> : null}
        </div>
      ))}
      {rows.length === 0 ? <div className="mini-empty">{tHome.activityCard.empty}</div> : null}
    </div>
  );
}
