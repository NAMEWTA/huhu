import { Button } from "@huhu/ui";
import { useCapability, useEngine, writeAutomationPlanLink } from "@huhu/workbench";
import type { PlanHomeSummary } from "../shared/plan-directory.js";
import { planSourceName } from "../shared/plan-directory.js";
import { formatMoment, planZone } from "./plan-presentation.js";

export function AutomationHomeWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { vaultId } = useEngine();
  const summary = useCapability<PlanHomeSummary>("automations.plans.summary");
  const next = summary.data?.next;

  return (
    <>
      <div aria-busy={summary.isPending}>
        {summary.isError ? (
          <>
            <p role="alert">无法读取计划摘要</p>
            <Button onClick={() => void summary.refetch()}>重试</Button>
          </>
        ) : summary.data ? (
          <>
            <p data-testid="automation-widget-plan-count">已启用 {summary.data.enabled} 条计划</p>
            {summary.data.blocked > 0 && <p>{summary.data.blocked} 条受阻</p>}
            {next?.nextAt ? (
              <p data-testid="automation-widget-next-plan">
                <Button
                  variant="ghost"
                  onClick={() => {
                    writeAutomationPlanLink(vaultId, next.planId);
                    onNavigate("automations");
                  }}
                >
                  {next.title}
                </Button>
                · {planSourceName(next.source.plugin)} · <time dateTime={next.nextAt}>{formatMoment(next.nextAt, planZone(next))}</time>
              </p>
            ) : (
              <p>暂无待执行的计划</p>
            )}
          </>
        ) : (
          <p>正在读取计划摘要…</p>
        )}
      </div>
      <Button onClick={() => onNavigate("automations")}>打开自动化</Button>
    </>
  );
}
