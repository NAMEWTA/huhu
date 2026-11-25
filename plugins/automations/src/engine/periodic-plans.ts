import { createHash, randomUUID } from "node:crypto";
import { errors, PeriodicPlanSpecSchema, PlanOccurrenceSchema, PlanRefSchema, type PeriodicPlanChange, type PeriodicPlanControl, type PeriodicPlanSource, type PlanOccurrence, type PlanSummary, type PlanWrite } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { AutomationsService } from "./service.js";

const file = "automations/periodic-plans.json";
const journal = "automations/periodic-occurrences";
const StoredPlan = PeriodicPlanSpecSchema.extend({
  revision: PlanRefSchema.shape.revision, owner: z.string(), machineId: z.string(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), lastOccurrence: z.string().nullable(),
});
const Store = z.strictObject({ plans: z.array(StoredPlan), imported: z.array(z.string()) });
type StoredPlan = z.infer<typeof StoredPlan>;
type Store = z.infer<typeof Store>;
type Job = {
  revision: string; source: PeriodicPlanSource; controller: AbortController; signal: AbortSignal;
  next: number; running?: Promise<void>; wakeAt?: number;
};
type Clock = { now(): number };
const occurrenceId = (planId: string, revision: string, scheduledFor: string) =>
  `periodic-${createHash("sha256").update(JSON.stringify([planId, revision, scheduledFor])).digest("hex")}`;

/** One configuration and admission boundary for all source-provided periodic actions. */
export class PeriodicPlans implements PeriodicPlanControl {
  private readonly jobs = new Map<string, Job>();
  private readonly wakeups = new Map<string, { revision: string; at: number }>();
  private closed = false;
  private sweeping: Promise<void> | undefined;

  constructor(
    private readonly files: VaultFiles,
    private readonly owner: { vaultId: string; machineId: string; instance: string | null },
    private readonly rules: Pick<AutomationsService, "withRuleConfiguration">,
    private readonly sourceIds: readonly string[],
    private readonly findSource: (plugin: string) => PeriodicPlanSource | undefined,
    private readonly clock: Clock,
    private readonly changed: (planId: string) => void,
  ) {}

  private load() {
    const row = this.files.read(file);
    const store = row ? Store.parse(JSON.parse(row.bytes.toString("utf8"))) : { plans: [], imported: [] };
    return { store, revision: row?.version ?? null };
  }

  private save(store: Store, revision: string | null, signal?: AbortSignal) {
    signal?.throwIfAborted();
    return this.files.write(file, Buffer.from(JSON.stringify(store) + "\n"), {
      expectedVersion: revision, ...(signal && { beforeCommit: () => signal.throwIfAborted() }),
    });
  }

  private availability(plan: StoredPlan): PlanSummary["availability"] {
    if (this.files.readOnly) return { state: "blocked", reason: "read-only" };
    if (plan.owner !== this.owner.instance) return { state: "blocked", reason: "foreign-owner" };
    const source = this.findSource(plan.source.plugin);
    if (!source || source.signal.aborted) return { state: "blocked", reason: "plugin-disabled" };
    return source.availability?.(plan) ?? { state: "ready" };
  }

  private summary(plan: StoredPlan): PlanSummary {
    const { planId, revision, source, title, action, everySeconds, intent, createdAt, updatedAt, machineId } = plan;
    const availability = this.availability(plan);
    const actions: PlanSummary["actions"] = this.files.readOnly || plan.owner !== this.owner.instance || intent === "deleted" ? [] : [
      "reschedule", "delete", intent === "enabled" ? "pause" : "resume",
    ];
    const unit = everySeconds % 60 === 0 ? "minutes" : "seconds";
    const occurrence = plan.lastOccurrence ? this.readOccurrence(plan.lastOccurrence) : null;
    const job = this.jobs.get(planId);
    const next = job?.revision === revision ? this.dueAt(job) : Math.max(Date.parse(updatedAt) + everySeconds * 1_000, this.clock.now());
    return {
      planId, revision, title, source, owner: { scope: "device", vaultId: this.owner.vaultId, machineId },
      trigger: { kind: "interval", every: unit === "minutes" ? everySeconds / 60 : everySeconds, unit },
      action, intent, availability, actions, createdAt, updatedAt,
      nextAt: intent === "enabled" && availability.state === "ready" ? new Date(next).toISOString() : null,
      lastOccurrence: occurrence ? { occurrenceId: occurrence.occurrenceId, state: occurrence.state, at: occurrence.acceptedAt ?? updatedAt } : null,
    };
  }

  private dueAt(job: Job): number {
    return Math.min(job.next, job.wakeAt ?? Infinity);
  }

  list(): PlanSummary[] {
    return this.load().store.plans.filter(({ intent }) => intent !== "deleted").map((plan) => this.summary(plan));
  }

  read(planId: string): PlanSummary | null {
    const plan = this.load().store.plans.find((entry) => entry.planId === planId);
    return plan ? this.summary(plan) : null;
  }

  inspect(planId: string) {
    const row = this.load().store.plans.find((entry) => entry.planId === planId);
    if (!row) return null;
    const { owner: _owner, machineId: _machine, createdAt: _created, updatedAt: _updated, lastOccurrence: _last, ...plan } = row;
    return plan;
  }

  importSource(plugin: string): Promise<void> {
    return this.importSources([plugin]);
  }

  wake(plan: { planId: string; revision: string }, delayMs: number): void {
    if (this.closed || this.files.readOnly || !Number.isFinite(delayMs)) return;
    const current = this.load().store.plans.find(({ planId }) => planId === plan.planId);
    if (!current || current.intent !== "enabled" || current.owner !== this.owner.instance || current.revision !== plan.revision) return;
    const at = this.clock.now() + Math.max(0, Math.min(86_400_000, delayMs));
    const previous = this.wakeups.get(plan.planId);
    this.wakeups.set(plan.planId, { revision: plan.revision, at: previous?.revision === plan.revision ? Math.min(previous.at, at) : at });
  }

  readOccurrence(id: string): PlanOccurrence | null {
    if (!/^periodic-[a-f0-9]{64}$/.test(id)) return null;
    const row = this.files.read(`${journal}/${id}.json`);
    if (!row) return null;
    const occurrence = PlanOccurrenceSchema.parse(JSON.parse(row.bytes.toString("utf8")));
    if (occurrence.state !== "running" || this.jobs.get(occurrence.plan.planId)?.running) return occurrence;
    return { ...occurrence, state: "unknown", effects: occurrence.effects.map((effect) => ({ ...effect, state: "unknown" })) };
  }

  private record(spec: PeriodicPlanChange | z.infer<typeof PeriodicPlanSpecSchema>, previous?: StoredPlan): StoredPlan {
    if (!this.owner.instance) throw errors.permissionDenied("无法确认周期计划所属设备");
    const stamp = new Date(this.clock.now()).toISOString();
    const parsed = PeriodicPlanSpecSchema.parse(Object.fromEntries(Object.entries(spec).filter(([key]) => key !== "expectedRevision")));
    const { bounds, everySeconds } = parsed;
    if (bounds && (everySeconds < bounds.min || everySeconds > bounds.max || everySeconds % bounds.step !== 0)) {
      throw errors.invalidInput("周期不符合来源允许的范围");
    }
    return {
      ...parsed,
      revision: randomUUID(), owner: this.owner.instance, machineId: this.owner.machineId,
      createdAt: previous?.createdAt ?? stamp, updatedAt: stamp, lastOccurrence: previous?.lastOccurrence ?? null,
    };
  }

  async configure(changes: readonly PeriodicPlanChange[], signal: AbortSignal): Promise<PlanSummary[]> {
    return this.rules.withRuleConfiguration(async () => {
      signal.throwIfAborted();
      if (this.closed) throw errors.pluginDisabled("automations");
      const { store, revision } = this.load();
      const updated = [];
      for (const change of changes) {
        if (!this.sourceIds.includes(change.source.plugin)) throw errors.invalidInput("未知周期计划来源");
        const previous = store.plans.find(({ planId }) => planId === change.planId);
        if ((previous?.revision ?? null) !== change.expectedRevision) throw errors.versionConflict(previous?.revision ?? "");
        if (previous && (previous.owner !== this.owner.instance || JSON.stringify(previous.source) !== JSON.stringify(change.source))) throw errors.permissionDenied("周期计划来源或设备不匹配");
        const next = this.record(change, previous);
        store.plans = store.plans.filter(({ planId }) => planId !== change.planId);
        store.plans.push(next);
        updated.push(next);
      }
      await this.save(store, revision, signal);
      for (const entry of updated) {
        this.cancel(entry.planId);
        this.wakeups.delete(entry.planId);
        this.changed(entry.planId);
      }
      return updated.map((entry) => this.summary(entry));
    });
  }

  async change(write: PlanWrite, signal: AbortSignal): Promise<PlanSummary> {
    const row = this.load().store.plans.find((entry) => entry.planId === write.planId);
    if (!row || row.intent === "deleted") throw errors.notFound("周期计划");
    if (write.expectedRevision !== row.revision) throw errors.versionConflict(row.revision);
    const { planId, source, title, action } = row;
    const base = { planId, source, title, action, expectedRevision: write.expectedRevision, everySeconds: row.everySeconds, intent: row.intent,
      ...(row.bounds && { bounds: row.bounds }) };
    let change: PeriodicPlanChange;
    if (write.change === "delete") change = { ...base, intent: "deleted" };
    else if (write.change === "set-intent") change = { ...base, intent: write.intent };
    else if (write.change === "reschedule" && write.trigger.kind === "interval") {
      change = { ...base, everySeconds: write.trigger.every * (write.trigger.unit === "minutes" ? 60 : 1) };
    } else throw errors.invalidInput("周期计划只接受秒或分钟间隔");
    if (!PeriodicPlanSpecSchema.shape.everySeconds.safeParse(change.everySeconds).success) throw errors.invalidInput("周期需要在 1 秒至 24 小时之间");
    const [plan] = await this.configure([change], signal);
    return plan!;
  }

  private cancel(planId: string): void {
    const job = this.jobs.get(planId);
    if (!job) return;
    job.controller.abort();
    if (!job.running) this.jobs.delete(planId);
  }

  private async importSources(plugins: readonly string[] = this.sourceIds): Promise<void> {
    if (this.closed || this.files.readOnly) return;
    const ready = plugins.filter((plugin) => this.sourceIds.includes(plugin) && this.findSource(plugin)?.legacy);
    if (!ready.length) return;
    const imported = this.load().store.imported;
    if (ready.every((plugin) => imported.includes(plugin))) return;
    await this.rules.withRuleConfiguration(async () => {
      const { store, revision } = this.load();
      const changed = [];
      const importedCount = store.imported.length;
      for (const plugin of ready) {
        const port = this.findSource(plugin);
        if (!port?.legacy || port.signal.aborted || store.imported.includes(plugin)) continue;
        const legacy = port.legacy();
        if (!legacy.length) continue;
        for (const spec of legacy) {
          if (spec.source.plugin !== plugin || store.plans.some(({ planId }) => planId === spec.planId)) continue;
          const plan = this.record(spec);
          store.plans.push(plan);
          changed.push(plan.planId);
        }
        store.imported.push(plugin);
      }
      if (store.imported.length !== importedCount) await this.save(store, revision);
      for (const planId of changed) this.changed(planId);
    });
  }

  tick(): Promise<void> {
    if (this.closed || this.files.readOnly) return Promise.resolve();
    this.sweeping ??= this.sweep().finally(() => { this.sweeping = undefined; });
    return this.sweeping;
  }

  private async sweep(): Promise<void> {
    await this.importSources();
    if (this.closed) return;
    const rows = this.load().store.plans;
    const eligible = new Set<string>();
    const now = this.clock.now();
    for (const plan of rows) {
      const source = this.findSource(plan.source.plugin);
      if (plan.intent !== "enabled" || !source || this.availability(plan).state !== "ready") continue;
      eligible.add(plan.planId);
      let job = this.jobs.get(plan.planId);
      if (job && (job.revision !== plan.revision || job.source !== source || job.signal.aborted)) {
        this.cancel(plan.planId);
        if (job.running) continue;
        job = undefined;
      }
      if (!job) {
        const controller = new AbortController();
        const interval = plan.everySeconds * 1_000;
        const first = Date.parse(plan.updatedAt) + interval;
        job = { revision: plan.revision, source, controller, signal: AbortSignal.any([controller.signal, source.signal]),
          next: first >= now ? first : now + interval };
        this.jobs.set(plan.planId, job);
      }
      const wake = this.wakeups.get(plan.planId);
      if (wake?.revision === plan.revision && !job.running) {
        job.wakeAt = Math.min(job.wakeAt ?? Infinity, wake.at);
        this.wakeups.delete(plan.planId);
      }
      if (!job.running && this.dueAt(job) <= now) {
        const scheduledFor = new Date(this.dueAt(job)).toISOString();
        job.next = now + plan.everySeconds * 1_000;
        delete job.wakeAt;
        const running = job;
        running.running = this.run(plan, running, scheduledFor).catch(() => undefined).finally(() => {
          delete running.running;
          if (running.signal.aborted && this.jobs.get(plan.planId) === running) this.jobs.delete(plan.planId);
        });
      }
    }
    for (const id of this.jobs.keys()) if (!eligible.has(id)) this.cancel(id);
  }

  private async run(plan: StoredPlan, job: Job, scheduledFor: string): Promise<void> {
    const { planId, revision, action } = plan;
    const id = occurrenceId(planId, revision, scheduledFor);
    const life = () => !this.closed && !job.signal.aborted && this.findSource(plan.source.plugin) === job.source;
    const current = () => {
      if (!life()) return false;
      const actual = this.load().store.plans.find((entry) => entry.planId === planId);
      return actual?.intent === "enabled" && actual.revision === revision && this.availability(actual).state === "ready";
    };
    const path = `${journal}/${id}.json`;
    const write = (row: PlanOccurrence, expectedVersion: string | null) =>
      this.files.write(path, Buffer.from(JSON.stringify(row) + "\n"), { expectedVersion });
    const receipt = await this.rules.withRuleConfiguration(async () => {
      if (!current() || this.files.currentVersion(path)) return;
      const { store, revision: storeRevision } = this.load();
      const acceptedAt = new Date(this.clock.now()).toISOString();
      const row: PlanOccurrence = {
        occurrenceId: id, plan: { planId, revision }, timing: { trigger: "scheduled", scheduledFor },
        state: "running", acceptedAt, frozenInput: { revision, digest: id }, execution: null,
        effects: [{ effectId: id, kind: action.capability, target: action.object, operationId: null, state: "accepted", receiptId: null }],
      };
      const { version } = await write(row, null);
      const actual = store.plans.find((entry) => entry.planId === planId)!;
      actual.lastOccurrence = id;
      await this.save(store, storeRevision);
      if (!current()) {
        await write({ ...row, state: "cancelled", effects: row.effects.map((effect) => ({ ...effect, state: "not-accepted" })) }, version);
        return;
      }
      const now = this.clock.now.bind(this.clock);
      const actionResult = job.source.run(plan, {
        planId, revision, occurrenceId: id, signal: job.signal, scheduledFor, isCurrent: current,
        wake(delay) {
          if (!current() || !Number.isFinite(delay)) return;
          const date = now() + Math.max(1_000, Math.min(86_400_000, delay));
          job.wakeAt = Math.min(job.wakeAt ?? Infinity, date);
        },
      });
      return { row, version, actionResult };
    });
    if (!receipt) return;
    this.changed(planId);
    const state = await receipt.actionResult.then(() => "completed" as const, () => job.signal.aborted ? "unknown" as const : "failed" as const);
    await write({ ...receipt.row, state, effects: receipt.row.effects.map((effect) => ({
      ...effect, state, receiptId: state === "completed" ? id : null,
    })) }, receipt.version);
    this.changed(planId);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.wakeups.clear();
    for (const id of this.jobs.keys()) this.cancel(id);
    await this.sweeping?.catch(() => undefined);
    await Promise.allSettled([...this.jobs.values()].flatMap(({ running }) => running ? [running] : []));
  }
}
