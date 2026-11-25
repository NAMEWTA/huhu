import type { PlanSummary } from "@huhu/contracts";

export function readAutomationPlanLink(vaultId: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("automation-vault") === vaultId ? params.get("automation-plan") : null;
}

export function writeAutomationPlanLink(vaultId: string, planId: string | null): void {
  const url = new URL(window.location.href);
  if (planId) {
    url.searchParams.set("automation-plan", planId);
    url.searchParams.set("automation-vault", vaultId);
  } else {
    url.searchParams.delete("automation-plan");
    url.searchParams.delete("automation-vault");
  }
  window.history.replaceState(window.history.state, "", url);
}

let pendingSource: { vaultId: string; plan: Pick<PlanSummary, "planId" | "source"> } | undefined;

export function requestAutomationSource(vaultId: string, plan: Pick<PlanSummary, "planId" | "source">): void {
  pendingSource = { vaultId, plan };
}

export function takeAutomationSource(vaultId: string, plugin: string) {
  if (pendingSource?.vaultId !== vaultId || pendingSource.plan.source.plugin !== plugin) return undefined;
  const { plan } = pendingSource;
  pendingSource = undefined;
  return plan;
}
