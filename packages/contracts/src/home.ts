import { z } from "zod";

/** 专注计时默认时长（秒）。 */
export const FOCUS_SECONDS = 25 * 60;
export const HOME_CARDS = ["focus", "habits", "tasks", "inbox", "recent", "activity"] as const;
export type HomeCard = (typeof HOME_CARDS)[number];

/** `.huhu/home/focus.json`：运行中时 remainingSec 是 startedAt 那一刻的剩余秒数。 */
export const FocusStateSchema = z.object({
  remainingSec: z.number().int().min(0).max(FOCUS_SECONDS).catch(FOCUS_SECONDS),
  running: z.boolean().catch(false),
  startedAt: z.string().nullable().catch(null),
  completedToday: z.number().int().min(0).catch(0),
  dateKey: z.string().catch(""),
});
export type FocusState = z.infer<typeof FocusStateSchema>;

export const FocusViewSchema = z.object({
  remainingSec: z.number().int(),
  running: z.boolean(),
  /** 运行中：预计结束的时刻（ISO），界面据此倒计时。 */
  endsAt: z.string().nullable(),
  completedToday: z.number().int(),
});
export type FocusView = z.infer<typeof FocusViewSchema>;

export const FocusActionSchema = z.object({ action: z.enum(["start", "pause", "reset", "sync"]) });

const HabitSchema = z.object({ id: z.string(), title: z.string() });

/** `.huhu/home/habits.json`。单个条目损坏只丢弃该条，不清空整个列表。 */
export const HabitsStateSchema = z.object({
  dateKey: z.string().catch(""),
  habits: z
    .array(z.unknown())
    .catch(() => [])
    .transform((arr) =>
      arr.flatMap((x) => {
        const r = HabitSchema.safeParse(x);
        return r.success ? [r.data] : [];
      }),
    ),
  doneToday: z
    .array(z.unknown())
    .catch(() => [])
    .transform((arr) => arr.filter((x): x is string => typeof x === "string")),
});
export type HabitsState = z.infer<typeof HabitsStateSchema>;

export const HabitsViewSchema = z.object({ habits: z.array(z.object({ id: z.string(), title: z.string(), done: z.boolean() })) });
export type HabitsView = z.infer<typeof HabitsViewSchema>;

export const HabitsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), title: z.string() }),
  z.object({ action: z.literal("rename"), id: z.string(), title: z.string() }),
  z.object({ action: z.literal("remove"), id: z.string() }),
  z.object({ action: z.literal("toggle"), id: z.string() }),
]);

/** `.huhu/home/widgets.json`：隐藏的卡片（未列出的都显示）。 */
export const WidgetsStateSchema = z.object({ hidden: z.array(z.enum(HOME_CARDS)).catch(() => []) });
export type WidgetsState = z.infer<typeof WidgetsStateSchema>;
