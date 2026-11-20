import { z } from "zod";
import type { PluginManifest } from "./plugin-manifest.js";

/** 专注计时默认时长（秒）。 */
export const FOCUS_SECONDS = 25 * 60;
export const HOME_CARDS = ["focus", "habits", "tasks", "inbox", "recent", "activity"] as const;
export type HomeCard = (typeof HOME_CARDS)[number];
/** 插件贡献的首页卡片 id：`widget:<插件 id>:<卡片 id>`。 */
export const WIDGET_ID = /^widget:[a-z0-9-]+:[a-z0-9-]+$/;
export const isKnownCard = (x: unknown): x is string => typeof x === "string" && ((HOME_CARDS as readonly string[]).includes(x) || WIDGET_ID.test(x));

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

/** `.huhu/home/widgets.json`：隐藏的卡片（未列出的都显示）与用户排的卡片顺序（未列出的按默认顺序排在后面）。 */
export const WidgetsStateSchema = z.object({
  hidden: z.array(z.string().refine(isKnownCard)).catch(() => []),
  order: z
    .array(z.string().refine(isKnownCard))
    .catch(() => [])
    .optional(),
});
export type WidgetsState = z.infer<typeof WidgetsStateSchema>;

export const DASHBOARD_SCHEMA_VERSION = 1;
export const DASHBOARD_COLUMNS = 6;

export type HomeWidgetType = `widget:${string}:${string}`;

export function homeWidgetType(owner: string, id: string): HomeWidgetType {
  const key = `widget:${owner}:${id}` as const;
  if (!WIDGET_ID.test(key)) throw new Error(`Invalid home widget type ${key}`);
  return key;
}

const WidgetIdPartSchema = z.string().regex(/^[a-z0-9-]+$/);
const WidgetConfigSchema = z.record(z.string(), z.json());
const WidgetSizeSchema = z.strictObject({ w: z.int().min(1).max(DASHBOARD_COLUMNS), h: z.int().positive() }).readonly();
const WidgetCapabilitySchema = z.strictObject({ name: z.string().min(1), required: z.boolean() }).readonly();

/** Engine 和 Renderer 共用的可序列化描述。组件和运行时配置校验器由内置模块静态装配。 */
export const HomeWidgetDefinitionSchema = z
  .strictObject({
    owner: WidgetIdPartSchema,
    id: WidgetIdPartSchema,
    title: z.string().min(1),
    description: z.string().min(1),
    defaultSize: WidgetSizeSchema,
    minSize: WidgetSizeSchema,
    maxSize: WidgetSizeSchema,
    /** null 表示不限实例数，隐藏的实例同样占用名额。 */
    maxInstances: z.int().positive().nullable(),
    configSchema: WidgetConfigSchema.readonly(),
    defaultConfig: WidgetConfigSchema.readonly(),
    /** required 为 false 的能力单独投影授权，例如卡内写动作。 */
    capabilities: z.array(WidgetCapabilitySchema).readonly(),
  })
  .refine(({ minSize, defaultSize, maxSize }) => minSize.w <= defaultSize.w && defaultSize.w <= maxSize.w && minSize.h <= defaultSize.h && defaultSize.h <= maxSize.h, {
    path: ["defaultSize"],
    message: "Default widget size must lie between minSize and maxSize",
  })
  .refine(({ capabilities }) => new Set(capabilities.map(({ name }) => name)).size === capabilities.length, {
    path: ["capabilities"],
    message: "Duplicate widget capability",
  })
  .readonly();
export type HomeWidgetDefinition = z.infer<typeof HomeWidgetDefinitionSchema>;

/** 用同一个 Zod 配置 schema 验证默认值并生成供目录使用的 JSON Schema。 */
export function defineHomeWidget(input: Omit<HomeWidgetDefinition, "configSchema"> & { configSchema: z.ZodObject }): HomeWidgetDefinition {
  input.configSchema.parse(input.defaultConfig);
  return HomeWidgetDefinitionSchema.parse({ ...input, configSchema: z.toJSONSchema(input.configSchema, { io: "input" }) });
}

/** source 由宿主静态传入。插件使用内置清单，kernel 提供自己的声明列表。 */
export type HomeWidgetSource = (Pick<PluginManifest, "id" | "origin"> & { contributes: { homeWidgets: readonly string[] } }) | { id: "kernel"; origin: "kernel"; contributes: { homeWidgets: readonly string[] } };

export function assertHomeWidgetDefinitions(source: HomeWidgetSource, definitions: readonly HomeWidgetDefinition[]): void {
  if (source.origin !== (source.id === "kernel" ? "kernel" : "builtin")) {
    throw new Error(`Untrusted home widget owner ${source.id}`);
  }
  const declared = new Set<HomeWidgetType>();
  for (const id of source.contributes.homeWidgets) {
    const key = homeWidgetType(source.id, id);
    if (declared.has(key)) throw new Error(`Duplicate home widget declaration ${key}`);
    declared.add(key);
  }
  const implemented = new Set<HomeWidgetType>();
  for (const definition of definitions) {
    HomeWidgetDefinitionSchema.parse(definition);
    const key = homeWidgetType(definition.owner, definition.id);
    if (definition.owner !== source.id) throw new Error(`Home widget ${key} belongs to a different owner than ${source.id}`);
    if (implemented.has(key)) throw new Error(`Duplicate home widget definition ${key}`);
    implemented.add(key);
  }
  const missing = [...declared].filter((key) => !implemented.has(key));
  const undeclared = [...implemented].filter((key) => !declared.has(key));
  if (missing.length || undeclared.length) {
    throw new Error(`Home widget declarations differ for ${source.id} (missing definitions: [${missing.join(", ")}], undeclared definitions: [${undeclared.join(", ")}])`);
  }
}

/** 每次按当前宿主的插件快照和当前调用者的能力授权计算目录。 */
export function projectHomeWidget(definition: HomeWidgetDefinition, enabledPlugins: ReadonlySet<string> | null, allowedCapabilities: ReadonlySet<string>) {
  const enabled = definition.owner === "kernel" || enabledPlugins?.has(definition.owner) === true;
  const capabilities = definition.capabilities.map((capability) => ({ ...capability, allowed: enabled && allowedCapabilities.has(capability.name) }));
  const status = !enabled ? "disabled" : capabilities.some(({ required, allowed }) => required && !allowed) ? "unauthorized" : "available";
  return { widgetType: homeWidgetType(definition.owner, definition.id), definition, status, capabilities } as const;
}

const DashboardInstanceIdSchema = z
  .string()
  .min(1)
  .regex(/^\S(?:.*\S)?$/u);
const DashboardInstanceSchema = z.strictObject({
  instanceId: DashboardInstanceIdSchema,
  widgetType: z.string().regex(WIDGET_ID),
  title: z.string().optional(),
  config: z.record(z.string(), z.json()),
  hidden: z.boolean(),
});

const DashboardPlacementSchema = z.strictObject({
  instanceId: DashboardInstanceIdSchema,
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  w: z.int().positive(),
  h: z.int().positive(),
});

export const DashboardBoardSchema = z.strictObject({
  schemaVersion: z.literal(DASHBOARD_SCHEMA_VERSION),
  boardId: z.literal("home"),
  revision: z.string().min(1),
  updatedAt: z.iso.datetime().nullable(),
  instances: z.array(DashboardInstanceSchema),
  layout: z.array(DashboardPlacementSchema),
});
export type DashboardBoard = z.infer<typeof DashboardBoardSchema>;

export const DashboardUpdateSchema = DashboardBoardSchema.pick({ instances: true, layout: true }).extend({ baseRevision: z.string().min(1) });
export type DashboardUpdate = z.infer<typeof DashboardUpdateSchema>;

export const DashboardViewSchema = z.strictObject({
  vaultId: z.string(),
  board: DashboardBoardSchema,
  writable: z.boolean(),
  source: z.enum(["stored", "default", "unreadable", "unrecognized", "invalid"]),
});
export type DashboardView = z.infer<typeof DashboardViewSchema>;
