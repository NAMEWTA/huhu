import { Badge, Button, EmptyState } from "@huhu/ui";
import { ArrowUpRight, History, List, Workflow } from "lucide-react";
import { useCapability, useEngine, type ModuleProps } from "@huhu/workbench";
import { useState } from "react";
import { PlanDirectory } from "./PlanDirectory.js";
import { formatMoment } from "./plan-presentation.js";
import { RunsPanel } from "./RunsPanel.js";
import { t } from "./i18n.js";

interface Activation {
  activationId: string;
  ruleId: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  summary?: unknown;
}

const views = { plans: "计划", activations: t.nav.activations, runs: t.nav.runs } as const;
type View = keyof typeof views;

export function AutomationsModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  return <AutomationCenter key={engine.vaultId} onNavigate={onNavigate} />;
}

function AutomationCenter({ onNavigate }: { onNavigate: ModuleProps["onNavigate"] }) {
  const [view, setView] = useState<View>("plans");
  const [historyPlan, setHistoryPlan] = useState<string | null>(null);

  return (
    <div className="hu-module-layout hu-tw-workbench tw-automation" data-testid="automations-module">
      <aside className="hu-tw-navigation" aria-label={t.title}>
        <div className="hu-tw-nav-title"><Workflow size={16} aria-hidden /><strong>{t.title}</strong></div>
        <nav aria-label="自动化导航">
          {(Object.keys(views) as View[]).map((id) => (
            <button key={id} type="button" className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined}
              onClick={() => { setView(id); if (id === "activations") setHistoryPlan(null); }}>
              {views[id]}
            </button>
          ))}
        </nav>
        {onNavigate ? <div className="hu-tw-nav-bottom">
          <Button variant="ghost" icon={List} data-testid="automations-open-tasks" onClick={() => onNavigate("tasks")}>
            打开任务 <ArrowUpRight size={13} aria-hidden />
          </Button>
        </div> : null}
      </aside>
      <main className="automations-automation-main">
        <PlanDirectory active={view === "plans"} onNavigate={onNavigate}
          onOpenRuns={(plan) => { setHistoryPlan(plan); setView("activations"); }} />
        {view === "activations" ? <Activations planId={historyPlan} back={() => setView("plans")} /> : null}
        {view === "runs" ? <div className="automations-task-content plan-history">
          <h1>运行记录</h1>
          <RunsPanel {...(onNavigate && { onNavigate })} />
        </div> : null}
      </main>
    </div>
  );
}

function Activations({ planId, back }: { planId: string | null; back(): void }) {
  const activations = useCapability<Activation[]>("automations.activations");
  const rules = useCapability<{ id: string; data: { title: string } }[]>("automations.list");
  const rows = activations.data?.filter(({ ruleId }) => planId === null || planId === ruleId) ?? [];
  const titles = new Map(rules.data?.map(({ id, data }) => [id, data.title]));
  return (
    <div className="automations-occurrence-list plan-history">
      <h1>{t.nav.activations}</h1>
      {planId ? <Button onClick={back}>返回计划目录</Button> : null}
      {activations.error ? <p role="alert">{activations.error.message}</p> : null}
      {activations.isPending ? <p role="status">正在读取激活记录…</p> : null}
      {activations.data && rows.length === 0 ? <EmptyState icon={History} title={t.noActivations} /> : null}
      {rows.map((row) => (
        <article key={row.activationId} className="automations-occurrence" data-testid="activation-row">
          <header>
            <strong>{titles.get(row.ruleId) ?? "原自动化已移除"}</strong>
            <time dateTime={row.startedAt}>{formatMoment(row.startedAt)}</time>
            <Badge>{t.trigger[row.trigger]}</Badge>
          </header>
          <div className="automations-run-summary">{t.summary(row.summary)}</div>
        </article>
      ))}
    </div>
  );
}
