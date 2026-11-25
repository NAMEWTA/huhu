import { PlanSummarySchema, type PlanSummary } from "@huhu/contracts";
import { z } from "zod";

const sources: Record<string, string> = {
  automations: "自动化",
  tasks: "任务",
  "agent-cli": "Agent",
  mail: "邮件",
  versioning: "版本管理",
  ssh: "SSH",
  kernel: "专注",
  ledger: "账本",
};

export function planSourceName(plugin: string): string {
  return sources[plugin] ?? plugin;
}

export const planStates = ["enabled", "paused", "blocked", "completed", "unrun", "failed", "attention"] as const;
export const planOrders = ["id", "recent", "title", "next"] as const;
export const PlanHomeSummary = z.strictObject({
  enabled: z.int().nonnegative(), blocked: z.int().nonnegative(), next: PlanSummarySchema.nullable(),
});
export type PlanHomeSummary = z.infer<typeof PlanHomeSummary>;
type State = (typeof planStates)[number];
type Order = (typeof planOrders)[number];

export function planMatches(plan: PlanSummary, state?: State): boolean {
  const last = plan.lastOccurrence?.state;
  switch (state) {
    case "blocked": return plan.availability.state === "blocked";
    case "completed": return plan.trigger.kind === "once" && last === "completed" && plan.nextAt === null;
    case "unrun": return !last;
    case "failed": return last === "failed";
    case "attention": return plan.availability.state === "blocked" || last === "failed" || last === "unknown";
    case "enabled": case "paused": return plan.intent === state;
    default: return true;
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

export function summarizePlans(plans: readonly PlanSummary[]): PlanHomeSummary {
  let enabled = 0;
  let blocked = 0;
  let next: PlanSummary | null = null;
  for (const plan of plans) {
    if (plan.intent !== "enabled") continue;
    enabled++;
    if (plan.availability.state === "blocked") {
      blocked++;
      continue;
    }
    if (!plan.nextAt) continue;
    if (!next || compare(plan.nextAt, next.nextAt!) < 0 || (plan.nextAt === next.nextAt && compare(plan.planId, next.planId) < 0)) next = plan;
  }
  return { enabled, blocked, next };
}

function key(plan: PlanSummary, order: Order): string {
  switch (order) {
    case "recent": return plan.updatedAt;
    case "title": return plan.title.toLowerCase();
    case "next": return plan.nextAt ?? "\uffff";
    default: return plan.planId;
  }
}

export function filterPlanPage(plans: PlanSummary[], input: {
  cursor?: string | undefined;
  limit: number;
  plugin?: string | undefined;
  action?: string | undefined;
  state?: State | undefined;
  query?: string | undefined;
  order?: Order | undefined;
}) {
  const { limit, cursor, plugin, action, state, order = "id" } = input;
  const search = input.query?.trim().toLowerCase();
  const rows = plans.filter((plan) => plan.intent !== "deleted"
    && (!plugin || plan.source.plugin === plugin)
    && (!action || plan.action.capability === action)
    && planMatches(plan, state)
    && (!search || [plan.title, planSourceName(plan.source.plugin), plan.source.object.id,
      plan.action.summary, plan.action.object.id].some((value) => value.toLowerCase().includes(search))));
  const compareKeys = (left: string, right: string) => compare(left, right) * (order === "recent" ? -1 : 1);
  const compareRows = (a: PlanSummary, b: PlanSummary) => compareKeys(key(a, order), key(b, order)) || compare(a.planId, b.planId);
  const boundary = order === "id" || !cursor ? null : decodeCursor(cursor, order);
  const page = rows.sort(compareRows).filter((plan) => {
    if (!cursor) return true;
    if (order === "id") return plan.planId > cursor;
    return boundary === null || (compareKeys(key(plan, order), boundary[0]) || compare(plan.planId, boundary[1])) > 0;
  });
  const result = page.slice(0, limit);
  const last = page.length > limit ? result.at(-1) : undefined;
  return {
    plans: result,
    nextCursor: !last ? null : order === "id" ? last.planId : JSON.stringify([order, key(last, order), last.planId]),
  };
}

function decodeCursor(cursor: string, order: Order): [string, string] | null {
  try {
    const value: unknown = JSON.parse(cursor);
    if (Array.isArray(value) && value.length === 3 && value[0] === order && typeof value[1] === "string" && typeof value[2] === "string") {
      return [value[1], value[2]];
    }
  } catch {
    // Ignore stale pagination cursors from a prior directory view.
  }
  return null;
}
