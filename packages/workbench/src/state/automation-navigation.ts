import { PlanOccurrenceLinkSchema, type PlanOccurrenceLink, type PlanSummary } from "@huhu/contracts";
import { createRequestId } from "../engine-client/client.js";
export type { PlanOccurrenceLink } from "@huhu/contracts";

export function createPlanIntentId(): string {
  const id = createRequestId();
  return id.length === 32 ? `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20)}` : id;
}

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

export const AUTOMATION_OCCURRENCE_NAVIGATION = "huhu:automation-occurrence-navigation";

export function readAutomationOccurrenceLink(vaultId: string): PlanOccurrenceLink | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("occurrence-vault") !== vaultId) return null;
  const link = PlanOccurrenceLinkSchema.safeParse({ planId: params.get("occurrence-plan"), occurrenceId: params.get("occurrence-id") });
  return link.success ? link.data : null;
}

export function writeAutomationOccurrenceLink(vaultId: string, link: PlanOccurrenceLink | null): void {
  const url = new URL(window.location.href);
  if (link) {
    url.searchParams.set("occurrence-vault", vaultId);
    url.searchParams.set("occurrence-plan", link.planId);
    url.searchParams.set("occurrence-id", link.occurrenceId);
  } else {
    url.searchParams.delete("occurrence-vault");
    url.searchParams.delete("occurrence-plan");
    url.searchParams.delete("occurrence-id");
  }
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(AUTOMATION_OCCURRENCE_NAVIGATION));
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
