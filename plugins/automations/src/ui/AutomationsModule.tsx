import { Badge, Button, Dialog, EmptyState, IconButton } from "@huhu/ui";
import { ArrowRight, ArrowUpRight, FileText, History, List, Pause, Pencil, Play, Plus, Search, Workflow } from "lucide-react";
import { useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";
import { RuleEditor, type EditableRule } from "./RuleEditor.js";
import { RunsPanel } from "./RunsPanel.js";

interface Rule extends EditableRule {
  data: EditableRule["data"] & { enabled: boolean };
}
interface Preview {
  next: string[];
  tasksDisabled: boolean;
  candidates: { taskId: string; title: string }[];
  skipped: { taskId: string; title: string; reason: keyof typeof t.reasons }[];
}
interface Activation {
  activationId: string;
  ruleId: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt?: string;
  summary?: unknown;
}

const actionLabel = (a: Rule["data"]["action"]): string => (a.kind === "agent" ? (a.input.source === "tasks" ? t.kinds.agent_tasks : t.kinds.agent_prompt) : a.kind === "terminal" ? t.kinds.terminal : t.kinds.reminder);

export function AutomationsModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [nav, setNav] = useState<"rules" | "activations" | "runs">("rules");
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 正在编辑的规则 id（null = 底部显示“新建”）
  const rules = useCapability<Rule[]>("automations.list", {});
  const acts = useCapability<Activation[]>("automations.activations", {});
  const cur = (rules.data ?? []).find((r) => r.id === sel) ?? rules.data?.[0] ?? null;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

  async function act<T>(cap: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const list = (rules.data ?? []).filter((r) => `${r.data.title}`.toLowerCase().includes(query.toLowerCase()));
  const heading: Record<string, [string, string]> = {
    rules: [t.nav.rules, "设置何时让 Agent 处理任务、运行命令或提醒"],
    activations: [t.nav.activations, `${(acts.data ?? []).length} 条记录`],
    runs: [t.nav.runs, "Agent 与命令的运行记录"],
  };
  return (
    <div className="hu-module-layout hu-tw-workbench tw-automation" data-testid="automations-module">
      <aside className="hu-tw-navigation" aria-label={t.title}>
        <div className="hu-tw-nav-title">
          <Workflow size={16} aria-hidden />
          <strong>{t.title}</strong>
        </div>
        <nav aria-label="自动化导航">
          {(["rules", "activations", "runs"] as const).map((k) => (
            <button key={k} type="button" className={nav === k ? "active" : ""} aria-current={nav === k} onClick={() => setNav(k)}>
              <span>{t.nav[k]}</span>
              <small>{k === "rules" ? (rules.data ?? []).length : k === "activations" ? (acts.data ?? []).length : ""}</small>
            </button>
          ))}
        </nav>
        <div className="hu-tw-nav-bottom">
          {onNavigate ? (
            <Button variant="ghost" icon={List} data-testid="automations-open-tasks" onClick={() => onNavigate("tasks")}>
              打开任务
              <ArrowUpRight size={13} aria-hidden />
            </Button>
          ) : null}
          <p>
            让 Agent 处理未开始的任务
            <br />
            或按时间运行命令、提醒
          </p>
        </div>
      </aside>
      <main className="automations-automation-main">
        <header className="hu-tw-heading">
          <div>
            <h1>{heading[nav]?.[0]}</h1>
            <p>{heading[nav]?.[1]}</p>
          </div>
          <Button icon={Plus} onClick={() => setCreating(true)} data-testid="rule-new">
            新建自动化
          </Button>
        </header>
        {error ? (
          <div role="alert" className="hu-field-error" style={{ padding: "0 28px" }}>
            {error}
          </div>
        ) : null}
        {nav === "runs" ? (
          <div className="automations-task-content" style={{ padding: "0 28px" }}>
            <RunsPanel {...(onNavigate ? { onNavigate } : {})} />
          </div>
        ) : nav === "rules" ? (
          <div className="automations-automation-columns">
            <section className="automations-rule-list">
              <div className="hu-tw-search">
                <Search size={14} aria-hidden />
                <input aria-label="搜索自动化" placeholder="搜索自动化…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`hu-tw-rule-item${cur?.id === r.id ? " active" : ""}`}
                  data-testid="rule-row"
                  aria-label={`打开自动化 ${r.data.title}`}
                  aria-current={cur?.id === r.id}
                  onClick={() => {
                    setSel(r.id);
                    setPreview(null);
                  }}
                >
                  <div>
                    <Workflow size={16} aria-hidden />
                    <strong>{r.data.title}</strong>
                    <Badge tone={r.data.enabled ? "success" : "neutral"}>{r.data.enabled ? t.enabled : t.paused}</Badge>
                  </div>
                  <p>
                    {r.data.trigger.cron} · {r.data.trigger.zone}
                  </p>
                  <small>{actionLabel(r.data.action)}</small>
                </button>
              ))}
              {list.length === 0 ? <EmptyState icon={Workflow} title="没有匹配的自动化" /> : null}
            </section>
            {cur ? (
              <section className="automations-rule-detail" aria-label={cur.data.title} data-testid="rule-detail">
                <div className="hu-tw-rule-detail-header">
                  <div>
                    <Badge tone={cur.data.enabled ? "success" : "neutral"}>{cur.data.enabled ? t.enabled : t.paused}</Badge>
                    <h2>{cur.data.title}</h2>
                  </div>
                  <div>
                    <IconButton icon={Pencil} label="编辑当前自动化" onClick={() => setEditing(cur.id)} data-testid="rule-edit" />
                    <Button variant="ghost" icon={cur.data.enabled ? Pause : Play} onClick={() => void act("automations.setEnabled", { id: cur.id, enabled: !cur.data.enabled })}>
                      {cur.data.enabled ? t.pause : t.enable}
                    </Button>
                  </div>
                </div>
                <div className="automations-rule-flow">
                  <span>定时激活</span>
                  <ArrowRight size={15} aria-hidden />
                  <span>{actionLabel(cur.data.action)}</span>
                  <ArrowRight size={15} aria-hidden />
                  <span>记录结果</span>
                </div>
                {cur.data.action.kind === "agent" && cur.data.action.input.source === "tasks" ? (
                  <div className="automations-scan-contract">
                    <strong>{t.scanTitle}</strong>
                    <p>{t.scanHintA}</p>
                    <p>{t.scanHintB}</p>
                    {cur.data.action.input.tags.length > 0 ? <p>标签筛选：{cur.data.action.input.tags.map((x) => `#${x}`).join(" ")}（全部匹配）</p> : null}
                    {cur.body.trim() ? <pre className="hu-tw-source-preview">{cur.body.trim()}</pre> : null}
                  </div>
                ) : cur.data.action.kind === "agent" ? (
                  <section className="automations-markdown">
                    <h3>固定需求</h3>
                    <pre className="hu-tw-source-preview">{cur.body.trim() || "尚未配置内容。"}</pre>
                  </section>
                ) : cur.data.action.kind === "terminal" ? (
                  <section className="automations-markdown">
                    <h3>命令</h3>
                    <pre className="hu-tw-source-preview">{cur.data.action.command}</pre>
                  </section>
                ) : (
                  <section className="automations-markdown">
                    <h3>提醒内容</h3>
                    <p>{cur.data.action.text}</p>
                  </section>
                )}
                <RuleSchedule id={cur.id} zone={cur.data.trigger.zone} />
                <div className="automations-rule-preview-action">
                  <Button icon={Search} onClick={() => void act<Preview>("automations.preview", { id: cur.id }).then(setPreview)}>
                    {cur.data.action.kind === "agent" && cur.data.action.input.source === "tasks" ? "预览将处理的任务" : t.preview}
                  </Button>
                  <p>预览不写日志、不运行；立即运行才会记录一次激活。</p>
                  <div className="row" style={{ marginTop: 10 }}>
                    <Button variant="primary" icon={Play} onClick={() => void act("automations.runNow", { id: cur.id })}>
                      {t.runNow}
                    </Button>
                    <Button onClick={() => void act("automations.cancel", { id: cur.id })}>{t.cancel}</Button>
                    <Button variant="danger" onClick={() => void act("automations.delete", { id: cur.id })}>
                      {t.delete}
                    </Button>
                  </div>
                </div>
                {preview ? (
                  <div className="automations-scan-contract" data-testid="rule-preview">
                    <strong>{t.next}</strong>
                    <div className="automations-schedule-preview">
                      {preview.next.map((n) => (
                        <time key={n}>{new Date(n).toLocaleString("zh-CN", { hour12: false })}</time>
                      ))}
                    </div>
                    {preview.tasksDisabled ? <p>{t.tasksDisabled}</p> : null}
                    <strong>
                      {t.candidates} {preview.candidates.length}
                    </strong>
                    <div className="automations-scan-list">
                      {preview.candidates.map((c) => (
                        <div key={c.taskId} data-testid="preview-candidate">
                          <FileText size={14} aria-hidden />
                          <strong>{c.title}</strong>
                        </div>
                      ))}
                    </div>
                    <strong>
                      {t.skipped} {preview.skipped.length}
                    </strong>
                    <div className="automations-scan-list">
                      {preview.skipped.map((sk) => (
                        <div key={sk.taskId} className="skipped" data-testid="preview-skipped">
                          <strong>{sk.title}</strong>
                          <small>{t.reasons[sk.reason] ?? sk.reason}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <section className="automations-rule-linked">
                  <h3>最近激活</h3>
                  {(acts.data ?? [])
                    .filter((x) => x.ruleId === cur.id)
                    .slice(0, 5)
                    .map((x) => (
                      <button key={x.activationId} type="button" onClick={() => setNav("activations")}>
                        <History size={13} aria-hidden />
                        <span>{new Date(x.startedAt).toLocaleString("zh-CN")}</span>
                        <small>{t.trigger[x.trigger]}</small>
                        <ArrowRight size={13} aria-hidden />
                      </button>
                    ))}
                  {(acts.data ?? []).filter((x) => x.ruleId === cur.id).length === 0 ? <p className="tasks-hint">尚未激活。启用配置不等于已经运行。</p> : null}
                </section>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="automations-occurrence-list">
            {(acts.data ?? []).length === 0 ? (
              <EmptyState icon={History} title={t.noActivations} hint="立即运行或等待定时激活后，结果会出现在这里。" />
            ) : (
              (acts.data ?? []).map((a) => (
                <article key={a.activationId} className="automations-occurrence" data-testid="activation-row">
                  <header>
                    <strong>{(rules.data ?? []).find((r) => r.id === a.ruleId)?.data.title ?? "原自动化已移除"}</strong>
                    <time>{new Date(a.startedAt).toLocaleString("zh-CN")}</time>
                    <Badge>{t.trigger[a.trigger]}</Badge>
                  </header>
                  <div className="automations-run-summary">{t.summary(a.summary)}</div>
                </article>
              ))
            )}
          </div>
        )}
      </main>
      {creating ? (
        <Dialog open wide title="新建自动化" description="按时间激活一个动作；任务执行与普通待办完成分开。" onClose={() => setCreating(false)} error={error} testId="rule-dialog">
          <RuleEditor
            key="new"
            zone={zone}
            onCancel={() => setCreating(false)}
            onSave={async (v) => {
              const r = await act("automations.create", v);
              if (r !== null) setCreating(false);
              return r !== null;
            }}
          />
        </Dialog>
      ) : null}
      {cur && editing === cur.id ? (
        <Dialog open wide title="编辑自动化" description="修改后保持暂停；提示词与时间的改动立即写入规则文件。" onClose={() => setEditing(null)} error={error} testId="rule-dialog">
          <RuleEditor
            key={cur.id}
            rule={cur}
            zone={zone}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              const r = await act("automations.update", { id: cur.id, expectedVersion: cur.version, patch: { title: v.title, trigger: v.trigger, action: v.action }, body: v.body });
              if (r !== null) setEditing(null);
              return r !== null;
            }}
          />
        </Dialog>
      ) : null}
    </div>
  );
}

/** 规则详情里常驻的“接下来的激活时间”（原型 SchedulePreview）：只预览，不写日志、不运行。 */
function RuleSchedule({ id, zone }: { id: string; zone: string }) {
  const preview = useCapability<Preview>("automations.preview", { id });
  if (preview.isError || !preview.data) return null;
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: zone || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="automations-schedule-preview" data-testid="rule-schedule">
      <strong>接下来的激活时间</strong>
      <small>{zone || "本地时区"} · 仅预览</small>
      {preview.data.next.map((time) => (
        <time key={time}>{fmt.format(new Date(time))}</time>
      ))}
    </div>
  );
}
