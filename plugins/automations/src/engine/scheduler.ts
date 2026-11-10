import { Cron } from "croner";
import { missedRun } from "../shared/cron.js";

export interface ScheduledRule {
  id: string;
  enabled: boolean;
  cron: string;
  zone: string;
  missedRunGraceMinutes: number;
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
      const missed = missedRun(r.cron, r.zone, this.d.lastActivatedFor(r.id), now, r.missedRunGraceMinutes);
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
