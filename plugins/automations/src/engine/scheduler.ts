import { Cron } from "croner";
import { missedRun } from "../shared/cron.js";

export interface ScheduledRule {
  id: string;
  enabled: boolean;
  cron: string;
  zone: string;
  missedRunGraceMinutes: number;
  version?: string;
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

type ScheduledJob = { rule: ScheduledRule; cron: Cron };

/** 每条启用规则一个 Croner 作业，同一规则的实时触发和补跑共用并发保护。 */
export class Scheduler {
  private jobs = new Map<string, ScheduledJob>();
  private running = new Set<string>();

  constructor(private readonly d: SchedulerDeps) {}

  /** 仅替换发生变化的作业，新安装的作业按宽限补激活最近一次。 */
  sync(rules: ScheduledRule[]): void {
    const enabled = new Map(rules.filter((rule) => rule.enabled).map((rule) => [rule.id, rule]));
    for (const [id, job] of this.jobs) {
      const rule = enabled.get(id);
      if (rule && rule.cron === job.rule.cron && rule.zone === job.rule.zone && rule.version === job.rule.version &&
          rule.updatedAt === job.rule.updatedAt && rule.missedRunGraceMinutes === job.rule.missedRunGraceMinutes) {
        enabled.delete(id);
        continue;
      }
      job.cron.stop();
      this.jobs.delete(id);
    }
    const now = this.d.now();
    for (const r of enabled.values()) {
      const last = this.d.lastActivatedFor(r.id);
      const edited = r.updatedAt ? Date.parse(r.updatedAt) : Number.NaN;
      const baseline = last && Number.isFinite(edited) && edited > last.getTime() ? new Date(edited) : last;
      const missed = missedRun(r.cron, r.zone, baseline, now, r.missedRunGraceMinutes);
      const cron = new Cron(r.cron, { timezone: r.zone, protect: true }, (self) => {
        const at = self.currentRun();
        if (at && this.jobs.get(r.id)?.cron === self) return this.activate(r.id, at);
      });
      this.jobs.set(r.id, { rule: { ...r }, cron });
      if (missed) void this.activate(r.id, missed);
    }
  }

  private async activate(id: string, at: Date): Promise<void> {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      await this.d.activate(id, at, "schedule");
    } catch {
      // The activation service records its outcome.
    } finally {
      this.running.delete(id);
    }
  }

  active(): string[] {
    return [...this.jobs.keys()];
  }

  stop(): void {
    for (const j of this.jobs.values()) j.cron.stop();
    this.jobs.clear();
  }
}
