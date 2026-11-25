import type { PlanSummary } from "@huhu/contracts";
import { expect, test } from "vitest";
import { filterPlanPage } from "../src/shared/plan-directory.js";

function plan(planId: string, fields: Partial<PlanSummary> = {}): PlanSummary {
  const object = { kind: "task", id: `task-${planId}` };
  return {
    planId, title: "例行提醒", revision: "revision", source: { plugin: "tasks", object },
    owner: { scope: "vault", vaultId: "vault" },
    trigger: { kind: "once", scheduledFor: "2026-11-25T10:00:00Z" },
    action: { capability: "notifications.create", object, summary: "提醒 Team Alpha" },
    intent: "enabled", availability: { state: "ready" }, nextAt: "2026-11-25T10:00:00Z",
    lastOccurrence: null, createdAt: "2026-11-24T10:00:00Z", updatedAt: "2026-11-24T10:00:00Z", actions: [],
    ...fields,
  };
}

test("combines text, source, action and occurrence filters without hiding blocked enabled plans", () => {
  const failed = { occurrenceId: "failed-occurrence", state: "failed", at: "2026-11-25T10:00:00Z" } as const;
  const ready = plan("ready");
  const blocked = plan("blocked", { availability: { state: "blocked", reason: "target-unavailable" }, lastOccurrence: failed });
  const deleted = plan("deleted", { intent: "deleted", lastOccurrence: failed });
  const filter = { plugin: "tasks", action: "notifications.create", query: "alpha", limit: 10 };
  expect(filterPlanPage([ready, blocked, deleted], { ...filter, state: "attention" }).plans).toEqual([blocked]);
  expect(filterPlanPage([ready, blocked, deleted], { ...filter, state: "enabled" }).plans).toEqual([blocked, ready]);
  expect(filterPlanPage([ready, blocked], { ...filter, state: "unrun" }).plans).toEqual([ready]);
  expect(filterPlanPage([ready, blocked], { ...filter, plugin: "mail" }).plans).toEqual([]);
});

test("continues the selected order after the preceding page's last plan disappears", () => {
  const first = plan("z", { title: "Alpha" });
  const second = plan("a", { title: "Beta" });
  const third = plan("b", { title: "Beta" });
  const input = { order: "title", limit: 2 } as const;
  const page = filterPlanPage([third, second, first], input);
  expect(page.plans).toEqual([first, second]);
  expect(filterPlanPage([first, third], { ...input, cursor: page.nextCursor! })).toEqual({ plans: [third], nextCursor: null });
});
