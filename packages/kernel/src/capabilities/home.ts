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
  notify: (n: { title: string; module: string }) => void;
}

const MAX_HABITS = 20;
const MAX_TITLE = 60;
const FocusStateWithRevision = FocusStateSchema.extend({ revision: z.string().optional() });
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
    writeFileSync(tmp, JSON.stringify(v, null, 2));
    renameSync(tmp, this.file(name));
  }
  private today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: this.d.zone() }).format(this.d.now());
  }

  // ---- 专注 ----

  private loadFocus(): z.infer<typeof FocusStateWithRevision> {
    const s = this.read("focus.json", (v) => FocusStateWithRevision.parse(v));
    if (s.dateKey !== this.today()) return { ...s, dateKey: this.today(), completedToday: 0 }; // 跨日：今日次数清零
    return s;
  }
  private remaining(s: z.infer<typeof FocusStateWithRevision>): number {
    if (!s.running || !s.startedAt) return s.remainingSec;
    const elapsed = Math.floor((this.d.now().getTime() - Date.parse(s.startedAt)) / 1000);
    return Math.max(0, s.remainingSec - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0));
  }
  private view(s: z.infer<typeof FocusStateWithRevision>): FocusView {
    const rem = this.remaining(s);
    return { remainingSec: rem, running: s.running, endsAt: s.running ? new Date(this.d.now().getTime() + rem * 1000).toISOString() : null, completedToday: s.completedToday };
  }

  focus(): FocusView {
    return this.view(this.loadFocus());
  }

  focusSnapshot() {
    const state = this.loadFocus();
    return { ...this.view(state), revision: revisionOf(state) };
  }

  /** 先结算（到点则记一次完成并发通知），再执行动作。 */
  focusAction(action: "start" | "pause" | "reset" | "sync", expectedRevision?: string): FocusView {
    let s = this.loadFocus();
    if (expectedRevision !== undefined && expectedRevision !== revisionOf(s)) throw errors.versionConflict(revisionOf(s));
    if (s.running && this.remaining(s) === 0) {
      s = { ...s, remainingSec: FOCUS_SECONDS, running: false, startedAt: null, completedToday: s.completedToday + 1, revision: randomUUID() };
      this.write("focus.json", s);
      this.d.notify({ title: "专注完成", module: "home" });
    }
    if (action === "start" && !s.running) s = { ...s, running: true, startedAt: this.d.now().toISOString(), remainingSec: s.remainingSec > 0 ? s.remainingSec : FOCUS_SECONDS };
    else if (action === "pause" && s.running) s = { ...s, remainingSec: this.remaining(s), running: false, startedAt: null };
    else if (action === "reset") s = { ...s, remainingSec: FOCUS_SECONDS, running: false, startedAt: null };
    this.write("focus.json", { ...s, revision: randomUUID() });
    return this.view(s);
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
