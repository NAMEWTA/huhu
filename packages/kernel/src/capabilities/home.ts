import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FOCUS_SECONDS, FocusActionSchema, FocusStateSchema, FocusViewSchema, HabitsActionSchema, HabitsStateSchema, HabitsViewSchema, HOME_CARDS, WidgetsStateSchema, errors } from "@huhu/contracts";
import type { FocusState, FocusView, HabitsState, HabitsView, WidgetsState } from "@huhu/contracts";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";

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

/** 首页的专注计时、习惯、卡片显示：状态存 `.huhu/home/*.json`（原子写），跨日重置按设置的时区。 */
/** 更新入参：order 接受任意字符串，由 setWidgets 逐项过滤（WidgetsStateSchema 对非法项会整体回退为空）。 */
const WidgetsUpdateSchema = WidgetsStateSchema.extend({ order: z.array(z.string()).optional() });

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

  private loadFocus(): FocusState {
    const s = this.read("focus.json", (v) => FocusStateSchema.parse(v));
    if (s.dateKey !== this.today()) return { ...s, dateKey: this.today(), completedToday: 0 }; // 跨日：今日次数清零
    return s;
  }
  private remaining(s: FocusState): number {
    if (!s.running || !s.startedAt) return s.remainingSec;
    const elapsed = Math.floor((this.d.now().getTime() - Date.parse(s.startedAt)) / 1000);
    return Math.max(0, s.remainingSec - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0));
  }
  private view(s: FocusState): FocusView {
    const rem = this.remaining(s);
    return { remainingSec: rem, running: s.running, endsAt: s.running ? new Date(this.d.now().getTime() + rem * 1000).toISOString() : null, completedToday: s.completedToday };
  }

  focus(): FocusView {
    return this.view(this.loadFocus());
  }

  /** 先结算（到点则记一次完成并发通知），再执行动作。 */
  focusAction(action: "start" | "pause" | "reset" | "sync"): FocusView {
    let s = this.loadFocus();
    if (s.running && this.remaining(s) === 0) {
      s = { ...s, remainingSec: FOCUS_SECONDS, running: false, startedAt: null, completedToday: s.completedToday + 1 };
      this.write("focus.json", s);
      this.d.notify({ title: "专注完成", module: "home" });
    }
    if (action === "start" && !s.running) s = { ...s, running: true, startedAt: this.d.now().toISOString(), remainingSec: s.remainingSec > 0 ? s.remainingSec : FOCUS_SECONDS };
    else if (action === "pause" && s.running) s = { ...s, remainingSec: this.remaining(s), running: false, startedAt: null };
    else if (action === "reset") s = { ...s, remainingSec: FOCUS_SECONDS, running: false, startedAt: null };
    this.write("focus.json", s);
    return this.view(s);
  }

  // ---- 习惯 ----

  private loadHabits(): HabitsState {
    const s = this.read("habits.json", (v) => HabitsStateSchema.parse(v));
    if (s.dateKey !== this.today()) return { ...s, dateKey: this.today(), doneToday: [] }; // 跨日：清空勾选，保留习惯本身
    return s;
  }
  private habitsView(s: HabitsState): HabitsView {
    const done = new Set(s.doneToday);
    return { habits: s.habits.map((h) => ({ ...h, done: done.has(h.id) })) };
  }

  habits(): HabitsView {
    return this.habitsView(this.loadHabits());
  }

  habitsAction(a: z.infer<typeof HabitsActionSchema>): HabitsView {
    const s = this.loadHabits();
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
    this.write("habits.json", s);
    return this.habitsView(s);
  }

  // ---- 卡片 ----

  widgets(): WidgetsState {
    return this.read("widgets.json", (v) => {
      // 排序逐项过滤：个别不认识的卡片 id 不会让整份排序作废（不放进 schema：带 transform 的 schema 无法生成能力目录用的 JSON Schema）
      const raw = (v ?? {}) as { order?: unknown };
      const known = new Set<string>(HOME_CARDS);
      const order = Array.isArray(raw.order) ? raw.order.filter((x): x is string => typeof x === "string" && known.has(x)) : raw.order;
      return WidgetsStateSchema.parse({ ...(v as object), ...(order !== undefined ? { order } : {}) });
    });
  }
  setWidgets(w: z.infer<typeof WidgetsUpdateSchema>): WidgetsState {
    // 写入路径同样逐项过滤（schema 本身对 order 的非法项整体回退为空，所以要在解析前去掉）
    const known = new Set<string>(HOME_CARDS);
    const next = WidgetsStateSchema.parse({ hidden: [...new Set(w.hidden)], order: [...new Set((w.order ?? []).filter((x) => known.has(x)))] });
    this.write("widgets.json", next);
    return next;
  }
}

/** home.focus.* / home.habits.* / home.widgets.*（kernel 能力，仅桌面可用）。 */
export function registerHomeCapabilities(registry: CapabilityRegistry, store: HomeStore): () => void {
  const desktop = { plugin: "kernel", exposable: false, defaultExposed: false } as const;
  const none = z.object({});
  const offs = [
    registry.register(defineCapability({ name: "home.focus.get", ...desktop, scope: "read", input: none, output: FocusViewSchema, handler: () => store.focus() })),
    registry.register(defineCapability({ name: "home.focus.update", ...desktop, scope: "write", input: FocusActionSchema, output: FocusViewSchema, handler: (_c, i) => store.focusAction(i.action) })),
    registry.register(defineCapability({ name: "home.habits.get", ...desktop, scope: "read", input: none, output: HabitsViewSchema, handler: () => store.habits() })),
    registry.register(defineCapability({ name: "home.habits.update", ...desktop, scope: "write", input: HabitsActionSchema, output: HabitsViewSchema, handler: (_c, i) => store.habitsAction(i) })),
    registry.register(defineCapability({ name: "home.widgets.get", ...desktop, scope: "read", input: none, output: WidgetsStateSchema, handler: () => store.widgets() })),
    registry.register(defineCapability({ name: "home.widgets.update", ...desktop, scope: "write", input: WidgetsUpdateSchema, output: WidgetsStateSchema, handler: (_c, i) => store.setWidgets(i) })),
  ];
  return () => offs.forEach((o) => o());
}
