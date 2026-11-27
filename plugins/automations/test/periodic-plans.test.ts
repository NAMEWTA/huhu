import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PeriodicPlanSource, PeriodicPlanSpec } from "@huhu/contracts";
import { VaultFiles } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { PeriodicPlans } from "../src/engine/periodic-plans.js";

test("managed periods serialize admission, preserve tombstones and fence each occurrence to its owner and revision", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-periodic-plans-"));
  const apps: PeriodicPlans[] = [];
  const files = new VaultFiles(root);
  const controller = new AbortController();
  let now = Date.UTC(2026, 10, 25);
  let complete = () => {};
  let tail: Promise<unknown> = Promise.resolve();
  const object = { kind: "fixture", id: "sample" };
  const legacy = {
    planId: "fixture-periodic", title: "fixture", source: { plugin: "fixture", object },
    action: { capability: "fixture.read", object, summary: "fixture read" }, everySeconds: 2, intent: "enabled",
  } satisfies PeriodicPlanSpec;
  const run = vi.fn<PeriodicPlanSource["run"]>(async (_plan, { signal }) => {
    await new Promise<void>((resolve, reject) => {
      complete = resolve;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  let port: PeriodicPlanSource = { signal: controller.signal, legacy: () => [legacy], run };
  const rules = {
    withRuleConfiguration<T>(operation: () => Promise<T> | T) {
      const next = tail.then(operation);
      tail = next.catch(() => undefined);
      return next;
    },
  };
  const make = (instance: string) => {
    const plans = new PeriodicPlans(files, { vaultId: "vault", machineId: "machine", instance }, rules, ["fixture"], () => port, { now: () => now }, () => {});
    apps.push(plans);
    return plans;
  };
  try {
    const plans = make("owner");
    await plans.tick();
    const enabled = plans.read(legacy.planId)!;
    for (let readers = 0; readers < 3; readers++) expect(plans.list()).toEqual([enabled]);
    expect(run).not.toHaveBeenCalled();
    now += 2_000;
    await plans.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const first = plans.read(legacy.planId)!.lastOccurrence!.occurrenceId;
    expect(plans.readOccurrence(first)?.state).toBe("running");
    now += 6_000;
    await plans.tick();
    expect(run).toHaveBeenCalledTimes(1);

    const foreign = make("foreign");
    expect(foreign.read(legacy.planId)).toMatchObject({ actions: [], availability: { state: "blocked", reason: "foreign-owner" } });
    expect(foreign.readOccurrence(first)?.state).toBe("unknown");
    await expect(foreign.change({
      change: "set-intent", intent: "paused", planId: legacy.planId,
      expectedRevision: enabled.revision, intentId: randomUUID(),
    }, controller.signal)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await foreign.tick();
    expect(run).toHaveBeenCalledTimes(1);

    const signal = new AbortController().signal;
    const [rescheduled] = await plans.configure([{ ...legacy, everySeconds: 5, expectedRevision: enabled.revision }], signal);
    expect(run.mock.calls[0]?.[1].signal.aborted).toBe(true);
    await vi.waitFor(() => expect(plans.readOccurrence(first)?.state).toBe("unknown"));
    await plans.tick();
    now += 5_000;
    await plans.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    const second = plans.read(legacy.planId)!.lastOccurrence!.occurrenceId;
    expect(second).not.toBe(first);
    expect(plans.readOccurrence(first)?.state).toBe("unknown");
    complete();
    await vi.waitFor(() => expect(plans.readOccurrence(second)?.state).toBe("completed"));

    now += 5_000;
    await plans.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    const old = run.mock.calls[2]![1];
    const replacement = vi.fn<PeriodicPlanSource["run"]>(async () => {});
    port = { ...port, signal: new AbortController().signal, run: replacement };
    await plans.tick();
    expect(old.signal.aborted).toBe(true);
    expect(old.isCurrent()).toBe(false);
    expect(replacement).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(plans.readOccurrence(old.occurrenceId)).toMatchObject({
      occurrenceId: old.occurrenceId, plan: { planId: legacy.planId, revision: rescheduled!.revision },
      state: "unknown", effects: [{ state: "unknown" }],
    }));

    await plans.tick();
    now += 5_000;
    await plans.tick();
    await vi.waitFor(() => expect(replacement).toHaveBeenCalledTimes(1));
    const next = replacement.mock.calls[0]![1];
    expect(next.occurrenceId).not.toBe(old.occurrenceId);
    await vi.waitFor(() => expect(plans.readOccurrence(next.occurrenceId)?.state).toBe("completed"));

    await plans.configure([{ ...legacy, intent: "deleted", everySeconds: 5, expectedRevision: rescheduled!.revision }], signal);
    await plans.close();
    const reopened = make("owner");
    now += 60_000;
    await reopened.tick();
    expect(reopened.list()).toEqual([]);
    expect(reopened.read(legacy.planId)?.intent).toBe("deleted");
    expect(reopened.readOccurrence(first)?.state).toBe("unknown");
    expect(reopened.readOccurrence(second)?.state).toBe("completed");
    expect(reopened.readOccurrence(old.occurrenceId)?.state).toBe("unknown");
    expect(reopened.readOccurrence(next.occurrenceId)?.state).toBe("completed");
    expect(run).toHaveBeenCalledTimes(3);
    expect(replacement).toHaveBeenCalledTimes(1);
  } finally {
    await Promise.all(apps.map((plans) => plans.close()));
    rmSync(root, { recursive: true, force: true });
  }
});
