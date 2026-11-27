import { Button, Dialog } from "@huhu/ui";
import { ArrowUpRight, List, Workflow } from "lucide-react";
import { AUTOMATION_OCCURRENCE_NAVIGATION, readAutomationOccurrenceLink, useEngine, writeAutomationOccurrenceLink, type ModuleProps } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { PlanDirectory } from "./PlanDirectory.js";
import { OccurrenceHistory } from "./OccurrenceHistory.js";
import { OccurrenceDetail } from "./OccurrenceDetail.js";
import { RunsPanel } from "./RunsPanel.js";
import { t } from "./i18n.js";

const views = { plans: "计划", activations: t.nav.activations, runs: t.nav.runs } as const;
type View = keyof typeof views;

export function AutomationsModule({ onNavigate, registerLeaveGuard }: ModuleProps) {
  const engine = useEngine();
  return <AutomationCenter key={engine.vaultId} onNavigate={onNavigate} registerLeaveGuard={registerLeaveGuard} />;
}

function AutomationCenter({ onNavigate, registerLeaveGuard }: { onNavigate: ModuleProps["onNavigate"]; registerLeaveGuard: ModuleProps["registerLeaveGuard"] }) {
  const { vaultId } = useEngine();
  const [view, setView] = useState<View>("plans");
  const [historyPlan, setHistoryPlan] = useState<string | null>(null);
  const [occurrence, setOccurrence] = useState(() => readAutomationOccurrenceLink(vaultId));
  const [requestedPlan, setRequestedPlan] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const sync = () => setOccurrence(readAutomationOccurrenceLink(vaultId));
    window.addEventListener(AUTOMATION_OCCURRENCE_NAVIGATION, sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => {
      window.removeEventListener(AUTOMATION_OCCURRENCE_NAVIGATION, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [vaultId]);
  const closeOccurrence = () => writeAutomationOccurrenceLink(vaultId, null);

  return (
    <div className="automations-center-host">
      <div className="hu-module-layout hu-tw-workbench automations-workbench" data-testid="automations-module">
        <aside className="hu-tw-navigation" aria-label={t.title}>
          <div className="hu-tw-nav-title">
            <Workflow size={16} aria-hidden />
            <strong>{t.title}</strong>
          </div>
          <nav aria-label="自动化导航">
            {(Object.keys(views) as View[]).map((id) => (
              <button
                key={id}
                type="button"
                className={view === id ? "active" : ""}
                aria-current={view === id ? "page" : undefined}
                onClick={() => {
                  setView(id);
                  if (id === "activations") setHistoryPlan(null);
                }}
              >
                {views[id]}
              </button>
            ))}
          </nav>
          {onNavigate ? (
            <div className="hu-tw-nav-bottom">
              <Button variant="ghost" icon={List} data-testid="automations-open-tasks" onClick={() => onNavigate("tasks")}>
                打开任务 <ArrowUpRight size={13} aria-hidden />
              </Button>
            </div>
          ) : null}
        </aside>
        <main className="automations-automation-main">
          <PlanDirectory
            active={view === "plans"}
            onNavigate={onNavigate}
            registerLeaveGuard={registerLeaveGuard}
            requestedPlan={requestedPlan}
            onOpenRuns={(plan) => {
              setHistoryPlan(plan);
              setView("activations");
            }}
          />
          {view === "activations" ? <OccurrenceHistory key={historyPlan ?? ""} planId={historyPlan} back={() => setView("plans")} onNavigate={onNavigate} /> : null}
          {view === "runs" ? (
            <div className="automations-task-content automations-plan-history">
              <h1>运行记录</h1>
              <RunsPanel {...(onNavigate && { onNavigate })} />
            </div>
          ) : null}
        </main>
        {occurrence ? (
          <Dialog open title="通知的原发生" wide onClose={closeOccurrence} testId="notification-occurrence">
            <OccurrenceDetail
              key={occurrence.occurrenceId}
              id={occurrence.occurrenceId}
              expectedPlanId={occurrence.planId}
              onNavigate={onNavigate}
              onOpenPlan={() => {
                closeOccurrence();
                setRequestedPlan({ id: occurrence.planId });
                setView("plans");
              }}
            />
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
