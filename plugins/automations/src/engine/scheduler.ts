import { Cron } from "croner";
import { missedRun } from "../shared/cron.js";

export interface ScheduledRule {
  id: string;
  enabled: boolean;
  cron: string;
  zone: string;
  missedRunGraceMinutes: number;
  /** 规则最近一次被编辑 / 启停的时间：只补这之后错过的激活（改了时间或刚启用，不能立刻补跑改动之前的“错过”）。 */
  updatedAt?: string;
}

export interface SchedulerDeps {
  /** 激活回调：`scheduledFor` 为计划时间。 */
  activate(ruleId: string, scheduledFor: Date, trigger: "schedule"): Promise<void> | void;
  /** 规则上一次已激活的计划时间（来自 activations 记录）。 */
  lastActivatedFor(ruleId: string): Date | null;
  now(): Date;
}

/** 每条启用规则一个 Croner 作业；protect 防止同一规则重叠激活；规则变更时重建。 */
export class Scheduler {
  private jobs = new Map<string, Cron>();

  constructor(private readonly d: SchedulerDeps) {}

  /** 以规则集合重建全部作业，并按宽限补激活错过的最近一次。 */
  sync(rules: ScheduledRule[]): void {
    this.stop();
    const now = this.d.now();
    for (const r of rules) {
      if (!r.enabled) continue;
      const last = this.d.lastActivatedFor(r.id);
      const edited = r.updatedAt ? Date.parse(r.updatedAt) : Number.NaN;
      const baseline = last && Number.isFinite(edited) && edited > last.getTime() ? new Date(edited) : last;
      const missed = missedRun(r.cron, r.zone, baseline, now, r.missedRunGraceMinutes);
      if (missed) void Promise.resolve(this.d.activate(r.id, missed, "schedule")).catch(() => undefined);
      this.jobs.set(r.id, new Cron(r.cron, { timezone: r.zone, protect: true }, (self) => {
        const at = self.currentRun() ?? new Date();
        return Promise.resolve(this.d.activate(r.id, at, "schedule")).catch(() => undefined);
      }));
    }
  }

  active(): string[] {
    return [...this.jobs.keys()];
  }

  stop(): void {
    for (const j of this.jobs.values()) j.stop();
    this.jobs.clear();
  }
}
