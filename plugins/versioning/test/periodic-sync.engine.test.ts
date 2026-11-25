import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PeriodicPlanSpec, PlanSummary } from "@huhu/contracts";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import type { PeriodicPlans } from "../../automations/src/engine/periodic-plans.js";
import { gitInstalled } from "../src/engine/git.js";

const fixture = vi.hoisted(() => ({ periodic: undefined as PeriodicPlans | undefined, now: Date.UTC(2026, 10, 25) }));
vi.mock("../../automations/src/engine/index.js", async (original) => {
  const module = await original<typeof import("../../automations/src/engine/index.js")>();
  return {
    ...module,
    apply: ((ctx, api, options) => {
      const result = module.apply(ctx, api, { ...options, schedule: false, periodicClock: { now: () => fixture.now } });
      fixture.periodic = result.periodic;
      return result;
    }) satisfies typeof module.apply,
  };
});

const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const commit = (dir: string, title: string) => git(dir, "-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", "commit", "--quiet", "-m", title);

test.skipIf(!(await gitInstalled()))("full plan pulls and pushes through the original Git lock; deleting it survives both plugin and Engine restarts", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-git-plan-"));
  const vaultPath = path.join(root, "vault");
  const peer = path.join(root, "peer");
  const remote = path.join(root, "remote.git");
  mkdirSync(path.join(vaultPath, ".huhu/sync"), { recursive: true });
  git(root, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  git(root, "clone", "--quiet", remote, peer);
  writeFileSync(path.join(peer, "common.md"), "common fixture");
  git(peer, "add", "common.md");
  commit(peer, "common");
  git(peer, "push", "--quiet", "origin", "main");
  const configFile = path.join(vaultPath, ".huhu/sync/config.json");
  writeFileSync(configFile, JSON.stringify({ remote, branch: "main", mode: "follow", pullIntervalSec: 30, pushIntervalSec: 60, exclude: [] }));
  let engine: RunningEngine | undefined;
  async function call<T = unknown>(capability: string, input: unknown = {}, intentKey?: string): Promise<T> {
    assert(engine);
    const result = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: intentKey ?? randomUUID(), ...(intentKey && { intentKey }) });
    assert(result.ok, JSON.stringify(result));
    return result.data as T;
  }
  async function deletePlan(plan: PlanSummary) {
    const intentId = randomUUID();
    expect(await call("automations.plans.submit", { planId: plan.planId, expectedRevision: plan.revision, intentId, change: "delete" }, intentId))
      .toMatchObject({ outcome: "completed", plan: { planId: plan.planId, intent: "deleted" } });
  }
  const settings = () => call<{ mode: string; revision: string; periodics: { pull: PlanSummary; sync: PlanSummary } }>("sync.get");
  try {
    engine = await boot({ vaultPath, create: true });
    await call("git.init");
    const before = await settings();
    expect(before).toMatchObject({ mode: "follow", periodics: { pull: { intent: "enabled" }, sync: { intent: "paused" } } });
    await call("sync.run", { mode: "pull" });
    writeFileSync(path.join(peer, "remote.md"), "remote plan fixture");
    git(peer, "add", "remote.md");
    commit(peer, "remote input");
    git(peer, "push", "--quiet", "origin", "main");
    writeFileSync(path.join(vaultPath, "local.md"), "local plan fixture");
    const configured = await settings();
    expect(await call("sync.update", { mode: "full", expectedRevision: configured.revision })).toMatchObject({ mode: "full" });
    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({ remote, branch: "main", exclude: [] });
    const full = await settings();
    await deletePlan(full.periodics.pull);
    expect(await settings()).toMatchObject({ mode: "full", periodics: { pull: { intent: "deleted" }, sync: { intent: "enabled" } } });
    const { planId } = full.periodics.sync;
    expect(await call("automations.plans.read", { planId })).toMatchObject({ revision: full.periodics.sync.revision });
    assert(fixture.periodic);
    await fixture.periodic.tick();
    fixture.now += 60_000;
    await fixture.periodic.tick();
    await expect.poll(() => fixture.periodic?.read(planId)?.lastOccurrence?.state, { timeout: 8_000 }).toBe("completed");
    expect(readFileSync(path.join(vaultPath, "remote.md"), "utf8")).toBe("remote plan fixture");
    expect(git(remote, "show", "main:local.md")).toBe("local plan fixture");

    await deletePlan((await settings()).periodics.sync);
    expect(await settings()).toMatchObject({ mode: "off" });
    await call("plugins.setEnabled", { id: "versioning", enabled: false });
    expect(await call("automations.plans.read", { planId })).toMatchObject({ intent: "deleted", availability: { state: "blocked", reason: "plugin-disabled" } });
    await call("plugins.setEnabled", { id: "versioning", enabled: true });
    await engine.shutdown();
    engine = await boot({ vaultPath });
    fixture.now += 600_000;
    await fixture.periodic?.tick();
    expect(await settings()).toMatchObject({ mode: "off", periodics: { pull: { intent: "deleted" }, sync: { intent: "deleted" } } });
    const row = fixture.periodic?.inspect(planId) as PeriodicPlanSpec | null;
    expect(row?.intent).toBe("deleted");
  } finally {
    await engine?.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
}, 25_000);
