import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DashboardBoardSchema,
  DashboardViewSchema,
  FOCUS_SECONDS,
  FocusActionSchema,
  FocusStateSchema,
  FocusViewSchema,
  PlanRefSchema,
  type PlanWrite,
  HabitsActionSchema,
  HabitsStateSchema,
  HabitsViewSchema,
  errors,
  homeWidgetConfigSchema,
  homeWidgetType,
  isWorkbenchCaller,
  kernelHomeWidgets,
  type HomeWidgetDefinition,
} from "@huhu/contracts";
import type { Vault } from "@huhu/vault";
import type { FocusView, HabitsView } from "@huhu/contracts";
import { z } from "zod";
import type { CapabilityRegistry } from "./define.js";
import { durableExternal, registerKernelCapability } from "./system.js";
import { defineDashboardRecovery, defineDashboardUpdate, readDashboard } from "./home-dashboard.js";

export interface HomeDeps {
  /** `.huhu/home/`。 */
  dir: string;
  now: () => Date;
  /** 当前设置的时区（决定“今天”）。 */
  zone: () => string;
  deadlineAvailable?: () => boolean;
  focusChanged?: () => void;
}

const MAX_HABITS = 20;
const MAX_TITLE = 60;
const Deadline = PlanRefSchema.extend({
  scheduledFor: z.iso.datetime(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  state: z.enum(["enabled", "paused", "completed", "deleted", "skipped"]),
});
export type FocusDeadline = z.infer<typeof Deadline>;
type Settlement = { plan: FocusDeadline; occurrenceId: string };
export interface FocusDeadlinePort {
  current(): FocusDeadline | undefined;
  settled(): Settlement | undefined;
  change(write: PlanWrite): FocusDeadline;
  settle(plan: Pick<FocusDeadline, "planId" | "revision" | "scheduledFor">, occurrenceId: string): boolean;
  skip(plan: Pick<FocusDeadline, "planId" | "revision" | "scheduledFor">): void;
}

const FocusStateWithRevision = FocusStateSchema.extend({
  remainingSec: z.int().nonnegative().catch(FOCUS_SECONDS),
  revision: z.string().optional(), deadline: Deadline.optional(),
  settledDeadline: z.object({ plan: Deadline, occurrenceId: z.string() }).optional(),
});
const HabitsStateWithRevision = HabitsStateSchema.extend({ revision: z.string().optional() });
const FocusSnapshot = FocusViewSchema.extend({ revision: z.string().optional() });
const HabitsSnapshot = HabitsViewSchema.extend({ revision: z.string().optional(), dateKey: z.string().optional() });
const HabitsReceipt = z.object({ revision: z.string(), dateKey: z.string(), habits: z.array(z.object({ id: z.string(), done: z.boolean() })) });
const HabitsInput = z.strictObject({
  action: z.enum(["add", "rename", "remove", "toggle"]),
  id: z.string().optional(),
  title: z.string().optional(),
  dateKey: z.string().optional(),
  expectedRevision: z.string().optional(),
});

function revisionOf(state: unknown): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

/** 首页的专注计时与习惯状态，跨日重置按设置的时区。 */
export class HomeStore {
  constructor(private readonly d: HomeDeps) {}

  private file(name: string): string {
    return path.join(this.d.dir, name);
  }
  private read<T>(name: string, parse: (v: unknown) => T): T {
    try {
      return parse(JSON.parse(readFileSync(this.file(name), "utf8")));
    } catch {
      return parse({});
    }
  }
  private write(name: string, v: unknown): void {
    mkdirSync(this.d.dir, { recursive: true });
    // 现有文件无法解析：覆盖前留一份副本
    if (existsSync(this.file(name))) {
      try {
        JSON.parse(readFileSync(this.file(name), "utf8"));
      } catch {
        copyFileSync(this.file(name), `${this.file(name)}.corrupt-${this.d.now().getTime()}`);
      }
    }
    const tmp = `${this.file(name)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(v, null, 2), { flush: true });
    renameSync(tmp, this.file(name));
  }
  private today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: this.d.zone() }).format(this.d.now());
  }

  // ---- 专注 ----

  private loadFocus(): z.infer<typeof FocusStateWithRevision> {
    const stored = this.read("focus.json", (value) => FocusStateWithRevision.parse(value));
    const state = stored.running && stored.deadline?.state !== "enabled" ? { ...stored, running: false, startedAt: null } : stored;
    return state.dateKey === this.today() ? state : { ...state, dateKey: this.today(), completedToday: 0 };
  }

  private remaining(state: z.infer<typeof FocusStateWithRevision>): number {
    return state.running && state.deadline
      ? Math.max(0, Math.ceil((Date.parse(state.deadline.scheduledFor) - this.d.now().getTime()) / 1_000))
      : state.remainingSec;
  }

  private view(state: z.infer<typeof FocusStateWithRevision>): FocusView {
    const plan = state.deadline && state.deadline.state !== "deleted" ? { planId: state.deadline.planId, revision: state.deadline.revision } : undefined;
    return {
      remainingSec: this.remaining(state), running: state.running,
      endsAt: state.running ? state.deadline?.scheduledFor ?? null : null, completedToday: state.completedToday,
      ...(plan && { plan }),
    };
  }

  private saveFocus(state: z.infer<typeof FocusStateWithRevision>): void {
    this.write("focus.json", { ...state, revision: randomUUID() });
    this.d.focusChanged?.();
  }

  focus(): FocusView {
    return this.view(this.loadFocus());
  }

  focusSnapshot() {
    const state = this.loadFocus();
    return { ...this.view(state), revision: revisionOf(state) };
  }

  focusAction(action: "start" | "pause" | "reset" | "sync", expectedRevision?: string): FocusView {
    let state = this.loadFocus();
    if (expectedRevision !== undefined && expectedRevision !== revisionOf(state)) throw errors.versionConflict(revisionOf(state));
    const now = this.d.now();
    const stamp = now.toISOString();
    if (action === "start" && !state.running) {
      if (!this.d.deadlineAvailable?.()) throw errors.pluginDisabled("automations");
      const previous = state.deadline?.state === "paused" ? state.deadline : undefined;
      const remainingSec = state.remainingSec || FOCUS_SECONDS;
      const deadline: FocusDeadline = {
        planId: previous?.planId ?? `focus-deadline-${randomUUID()}`, revision: randomUUID(), state: "enabled",
        createdAt: previous?.createdAt ?? stamp, updatedAt: stamp,
        scheduledFor: new Date(now.getTime() + remainingSec * 1_000).toISOString(),
      };
      state = { ...state, running: true, startedAt: stamp, remainingSec, deadline };
    } else if (action === "pause" && state.running && state.deadline) {
      state = {
        ...state, running: false, startedAt: null, remainingSec: this.remaining(state),
        deadline: { ...state.deadline, state: "paused", revision: randomUUID(), updatedAt: stamp },
      };
    } else if (action === "reset") {
      state = { ...state, running: false, startedAt: null, remainingSec: FOCUS_SECONDS };
      if (state.deadline) state.deadline = { ...state.deadline, state: "deleted", revision: randomUUID(), updatedAt: stamp };
    } else return this.view(state);
    this.saveFocus(state);
    return this.view(state);
  }

  focusDeadline(): FocusDeadlinePort {
    return {
      current: () => this.loadFocus().deadline,
      settled: () => this.loadFocus().settledDeadline,
      change: (write) => this.changeDeadline(write),
      settle: (plan, occurrenceId) => this.settleDeadline(plan, occurrenceId),
      skip: (plan) => {
        const state = this.loadFocus();
        const deadline = state.deadline;
        if (deadline?.state !== "enabled" || deadline.planId !== plan.planId || deadline.revision !== plan.revision
          || deadline.scheduledFor !== plan.scheduledFor || this.remaining(state) > 0) return;
        this.saveFocus({
          ...state, deadline: { ...deadline, state: "skipped", revision: randomUUID(), updatedAt: this.d.now().toISOString() },
          running: false, startedAt: null, remainingSec: FOCUS_SECONDS,
        });
      },
    };
  }

  private changeDeadline(write: PlanWrite): FocusDeadline {
    const state = this.loadFocus();
    const plan = state.deadline;
    if (!plan || plan.planId !== write.planId || plan.state === "deleted") throw errors.notFound("专注截止计划");
    if (plan.revision !== write.expectedRevision) throw errors.versionConflict(plan.revision);
    const stamp = this.d.now().toISOString();
    if (write.change === "set-intent" && plan.state !== "completed") {
      this.focusAction(write.intent === "enabled" ? "start" : "pause");
      return this.loadFocus().deadline!;
    }
    if (write.change === "reschedule" && write.trigger.kind === "once" && plan.state !== "completed") {
      const scheduledFor = new Date(write.trigger.scheduledFor).toISOString();
      const remainingSec = Math.max(0, Math.ceil((Date.parse(scheduledFor) - Date.parse(stamp)) / 1_000));
      if (remainingSec <= 0) throw errors.invalidInput("专注截止时间需要晚于当前时间");
      const deadline = { ...plan, revision: randomUUID(), updatedAt: stamp, scheduledFor, state: plan.state === "skipped" ? "enabled" as const : plan.state };
      const running = deadline.state === "enabled";
      this.saveFocus({ ...state, deadline, running, remainingSec, startedAt: running ? stamp : null });
      return deadline;
    }
    if (write.change === "delete") {
      const deadline = { ...plan, revision: randomUUID(), updatedAt: stamp, state: "deleted" as const };
      this.saveFocus({ ...state, deadline, running: false, startedAt: null, remainingSec: this.remaining(state) || FOCUS_SECONDS });
      return deadline;
    }
    throw errors.invalidInput("当前专注截止计划无法执行此操作");
  }

  private settleDeadline(expected: Pick<FocusDeadline, "planId" | "revision" | "scheduledFor">, occurrenceId: string): boolean {
    const state = this.loadFocus();
    const matches = (plan: FocusDeadline | undefined) => plan?.planId === expected.planId && plan.revision === expected.revision && plan.scheduledFor === expected.scheduledFor;
    if (matches(state.settledDeadline?.plan) && state.settledDeadline?.occurrenceId === occurrenceId) return true;
    if (!state.deadline || !matches(state.deadline) || state.deadline.state !== "enabled" || this.remaining(state) > 0) return false;
    const deadline = { ...state.deadline, updatedAt: this.d.now().toISOString(), state: "completed" as const };
    this.saveFocus({
      ...state, deadline, settledDeadline: { plan: deadline, occurrenceId }, completedToday: state.completedToday + 1,
      remainingSec: FOCUS_SECONDS, running: false, startedAt: null,
    });
    return true;
  }

  // ---- 习惯 ----

  private loadHabits(): z.infer<typeof HabitsStateWithRevision> {
    const s = this.read("habits.json", (v) => HabitsStateWithRevision.parse(v));
    if (s.dateKey !== this.today()) return { ...s, dateKey: this.today(), doneToday: [] }; // 跨日：清空勾选，保留习惯本身
    return s;
  }
  private habitsView(s: z.infer<typeof HabitsStateWithRevision>): HabitsView {
    const done = new Set(s.doneToday);
    return { habits: s.habits.map((h) => ({ ...h, done: done.has(h.id) })) };
  }

  habits(): HabitsView {
    return this.habitsView(this.loadHabits());
  }

  habitsSnapshot() {
    const state = this.loadHabits();
    return { ...this.habitsView(state), dateKey: state.dateKey, revision: revisionOf(state) };
  }

  habitsAction(a: z.infer<typeof HabitsActionSchema>, expected?: { dateKey: string; revision: string }): HabitsView {
    const s = this.loadHabits();
    if (expected && (expected.dateKey !== s.dateKey || expected.revision !== revisionOf(s))) throw errors.versionConflict(revisionOf(s));
    const title = "title" in a ? a.title.trim() : "";
    if ((a.action === "add" || a.action === "rename") && (!title || title.length > MAX_TITLE)) throw errors.invalidInput(`习惯名称需要 1–${MAX_TITLE} 个字`);
    if (a.action === "add") {
      if (s.habits.length >= MAX_HABITS) throw errors.invalidInput(`最多 ${MAX_HABITS} 个习惯`);
      s.habits.push({ id: `habit-${this.d.now().getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title });
    } else {
      const h = s.habits.find((x) => x.id === a.id);
      if (!h) throw errors.notFound("习惯不存在");
      if (a.action === "rename") h.title = title;
      else if (a.action === "remove") {
        s.habits = s.habits.filter((x) => x.id !== a.id);
        s.doneToday = s.doneToday.filter((x) => x !== a.id);
      } else s.doneToday = s.doneToday.includes(a.id) ? s.doneToday.filter((x) => x !== a.id) : [...s.doneToday, a.id];
    }
    this.write("habits.json", { ...s, revision: randomUUID() });
    return this.habitsView(s);
  }
}

/** 首页业务状态与布局由各自的能力维护。 */
export function registerHomeCapabilities(registry: CapabilityRegistry, store: HomeStore, vault: Vault, pluginWidgets: readonly HomeWidgetDefinition[], changed: () => void): () => void {
  const publicTool = { plugin: "kernel", exposable: true, defaultExposed: false } as const;
  const none = z.object({});
  const widgets = new Map([...Object.values(kernelHomeWidgets), ...pluginWidgets].map((widget) => [homeWidgetType(widget.owner, widget.id), { ...widget, configSchema: homeWidgetConfigSchema(widget) }] as const));
  const now = () => new Date();
  const recovery = defineDashboardRecovery(vault, widgets, now, changed);
  const offs = [
    registerKernelCapability(registry, {
      name: "home.focus.get",
      ...publicTool,
      scope: "read",
      input: none,
      output: FocusSnapshot,
      handler: ({ caller }) => (isWorkbenchCaller(caller) ? store.focus() : store.focusSnapshot()),
    }),
    registerKernelCapability(registry, {
      name: "home.focus.update",
      ...publicTool,
      scope: "write",
      ...durableExternal,
      input: FocusActionSchema.extend({ expectedRevision: z.string().optional() }),
      output: FocusSnapshot,
      handler: ({ caller }, input) => {
        if (isWorkbenchCaller(caller)) return store.focusAction(input.action);
        if (!input.expectedRevision) throw errors.invalidInput("请提供专注计时版本");
        store.focusAction(input.action, input.expectedRevision);
        return store.focusSnapshot();
      },
    }),
    registerKernelCapability(registry, {
      name: "home.habits.get",
      ...publicTool,
      scope: "read",
      input: none,
      output: HabitsSnapshot,
      handler: ({ caller }) => (isWorkbenchCaller(caller) ? store.habits() : store.habitsSnapshot()),
    }),
    registerKernelCapability(registry, {
      name: "home.habits.update",
      ...publicTool,
      scope: "write",
      risk: "high",
      ...durableExternal,
      input: HabitsInput,
      output: z.union([HabitsReceipt, HabitsSnapshot]),
      handler: ({ caller }, input) => {
        const action = HabitsActionSchema.safeParse(input);
        if (!action.success) throw errors.invalidInput("习惯操作参数无效", action.error.issues);
        if (isWorkbenchCaller(caller)) return store.habitsAction(action.data);
        if (!input.dateKey || !input.expectedRevision) throw errors.invalidInput("请提供习惯的日期与版本");
        store.habitsAction(action.data, { dateKey: input.dateKey, revision: input.expectedRevision });
        const { dateKey, revision, habits } = store.habitsSnapshot();
        return { dateKey, revision, habits: habits.map(({ id, done }) => ({ id, done })) };
      },
    }),
    registerKernelCapability(registry, { name: "home.dashboard.get", ...publicTool, scope: "read", input: none, output: DashboardViewSchema, handler: () => readDashboard(vault) }),
    registerKernelCapability(registry, defineDashboardUpdate(vault, widgets, now, changed)),
    registerKernelCapability(registry, recovery.preview),
    registerKernelCapability(registry, { ...recovery.commit, risk: "high" }),
    registerKernelCapability(registry, {
      name: "home.dashboard.backup",
      ...publicTool,
      scope: "read",
      input: none,
      output: DashboardBoardSchema,
      handler: () => {
        const snapshot = readDashboard(vault);
        if (snapshot.source !== "stored") throw errors.invalidInput("当前没有可备份的已保存看板", [{ reason: snapshot.source }]);
        return snapshot.board;
      },
    }),
  ];
  return () => offs.forEach((o) => o());
}
