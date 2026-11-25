import { errors, PERIODIC_PLANS_SERVICE, type PeriodicPlanChange, type PeriodicPlanControl, type PeriodicPlanSpec, type PlanSummary } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { MAX_INTERVAL_SEC, MIN_INTERVAL_SEC, type AutoSyncConfig, type RunMode } from "./auto-sync.js";

const planId = (mode: RunMode) => `periodic-versioning-${mode}`;
const modes = ["pull", "sync"] as const;
const title = { pull: "Git 自动拉取", sync: "Git 完整同步" };
export type GitPlanRevisions = Record<RunMode, string | null>;

function interval(plan: PlanSummary | null, fallback: number): number {
  const trigger = plan?.trigger;
  return trigger?.kind === "interval" ? trigger.every * (trigger.unit === "minutes" ? 60 : 1) : fallback;
}

export function gitPlanMode(plan: PeriodicPlanSpec): RunMode {
  return plan.planId === planId("sync") ? "sync" : "pull";
}

export class GitSyncPlans {
  constructor(private readonly api: HuhuApi) {}

  private control() {
    return this.api.service<PeriodicPlanControl>(PERIODIC_PLANS_SERVICE);
  }

  available(): boolean {
    return Boolean(this.control());
  }

  async importLegacy(): Promise<void> {
    await this.control()?.importSource("versioning");
  }

  plans(): { pull: PlanSummary | null; sync: PlanSummary | null } {
    const service = this.control();
    return { pull: service?.read(planId("pull")) ?? null, sync: service?.read(planId("sync")) ?? null };
  }

  config(): AutoSyncConfig {
    const service = this.control();
    const pull = service?.inspect(planId("pull"));
    const sync = service?.inspect(planId("sync"));
    return {
      mode: sync?.intent === "enabled" ? "full" : pull?.intent === "enabled" ? "follow" : "off",
      pullIntervalSec: pull?.everySeconds ?? 30, pushIntervalSec: sync?.everySeconds ?? 60,
    };
  }

  revisions(): GitPlanRevisions {
    const service = this.control();
    return { pull: service?.inspect(planId("pull"))?.revision ?? null, sync: service?.inspect(planId("sync"))?.revision ?? null };
  }

  private spec(mode: RunMode, config: AutoSyncConfig): PeriodicPlanSpec {
    const object = { kind: "git-sync", id: mode };
    return {
      planId: planId(mode), title: title[mode], source: { plugin: "versioning", object },
      action: { capability: "sync.run", object, summary: mode === "sync" ? "拉取并推送 Git 变更" : "拉取 Git 变更" },
      everySeconds: mode === "pull" ? config.pullIntervalSec : config.pushIntervalSec,
      bounds: { min: MIN_INTERVAL_SEC, max: MAX_INTERVAL_SEC, step: 1 },
      intent: config.mode === "full" || (config.mode === "follow" && mode === "pull") ? "enabled" : "paused",
    };
  }

  legacy(config: AutoSyncConfig | null): PeriodicPlanSpec[] {
    return config ? modes.map((mode) => this.spec(mode, config)) : [];
  }

  wake(mode: RunMode): void {
    const service = this.control();
    const plan = service?.inspect(planId(mode));
    if (plan?.intent === "enabled") service?.wake(plan, 0);
  }

  async configure(config: AutoSyncConfig, touched: { pull: boolean; sync: boolean; mode: boolean }, expected: GitPlanRevisions, signal: AbortSignal): Promise<void> {
    const service = this.control();
    if (!service) throw errors.pluginDisabled("automations");
    const current = this.plans();
    const changes: PeriodicPlanChange[] = [];
    for (const mode of modes) {
      if (!touched.mode && !touched[mode]) continue;
      const previous = current[mode];
      if ((previous?.revision ?? null) !== expected[mode]) throw errors.versionConflict(previous?.revision ?? "");
      const spec = this.spec(mode, config);
      if (previous?.intent === "deleted" && (!touched.mode || spec.intent !== "enabled")) continue;
      const intent = !touched.mode && previous ? previous.intent : spec.intent;
      if (previous?.intent === intent && interval(previous, 0) === spec.everySeconds) continue;
      changes.push({ ...spec, intent, expectedRevision: expected[mode] });
    }
    if (changes.length) await service.configure(changes, signal);
  }
}
