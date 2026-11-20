import { z } from "zod";
import type { PluginManifest } from "./plugin-manifest.js";

/** 专注计时默认时长（秒）。 */
export const FOCUS_SECONDS = 25 * 60;
/** 插件贡献的首页卡片 id：`widget:<插件 id>:<卡片 id>`。 */
export const WIDGET_ID = /^widget:[a-z0-9-]+:[a-z0-9-]+$/;

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

// 只有工厂生成的定义能证明目录描述来自运行期 Zod schema。
const definedHomeWidgets = new WeakMap<HomeWidgetDefinition, z.ZodObject>();

function freezeWidgetJson(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeWidgetJson(child);
  Object.freeze(value);
}

/** 用同一个 Zod 配置 schema 验证默认值并生成供目录使用的 JSON Schema。 */
export function defineHomeWidget(input: Omit<HomeWidgetDefinition, "configSchema"> & { configSchema: z.ZodObject }): HomeWidgetDefinition {
  const { configSchema, ...metadata } = input;
  const definition = HomeWidgetDefinitionSchema.parse({ ...metadata, configSchema: z.toJSONSchema(configSchema, { io: "input" }) });
  configSchema.parse(definition.defaultConfig);
  freezeWidgetJson(definition.configSchema);
  freezeWidgetJson(definition.defaultConfig);
  definedHomeWidgets.set(definition, configSchema);
  return definition;
}

export function homeWidgetConfigSchema(definition: HomeWidgetDefinition): z.ZodType<DashboardBoard["instances"][number]["config"]> {
  const schema = definedHomeWidgets.get(definition);
  if (!schema) throw new Error(`Unregistered home widget ${definition.owner}:${definition.id}`);
  return schema as z.ZodType<DashboardBoard["instances"][number]["config"]>;
}

/** source 由宿主静态传入。插件使用内置清单，kernel 提供自己的声明列表。 */
export type HomeWidgetSource = (Pick<PluginManifest, "id" | "origin"> & { contributes: { homeWidgets: readonly string[] } }) | { id: "kernel"; origin: "kernel"; contributes: { homeWidgets: readonly string[] } };

export function assertHomeWidgetDefinitions(source: HomeWidgetSource, definitions: readonly HomeWidgetDefinition[]): void {
  const { id: owner, origin, contributes } = source;
  if (origin !== (owner === "kernel" ? "kernel" : "builtin")) {
    throw new Error(`Untrusted home widget owner ${owner}`);
  }
  const declared = new Set<HomeWidgetType>();
  for (const id of contributes.homeWidgets) {
    const key = homeWidgetType(owner, id);
    if (declared.has(key)) throw new Error(`Duplicate home widget declaration ${key}`);
    declared.add(key);
  }
  const implemented = new Set<HomeWidgetType>();
  for (const definition of definitions) {
    if (!definedHomeWidgets.has(definition)) throw new Error(`Home widget for ${owner} must be created with defineHomeWidget`);
    const key = homeWidgetType(definition.owner, definition.id);
    if (definition.owner !== owner) throw new Error(`Home widget ${key} belongs to a different owner than ${owner}`);
    if (implemented.has(key)) throw new Error(`Duplicate home widget definition ${key}`);
    implemented.add(key);
  }
  const missing = [...declared].filter((key) => !implemented.has(key));
  const undeclared = [...implemented].filter((key) => !declared.has(key));
  if (missing.length || undeclared.length) {
    throw new Error(`Home widget declarations differ for ${owner} (missing definitions: [${missing.join(", ")}], undeclared definitions: [${undeclared.join(", ")}])`);
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

const emptyWidgetConfig = z.strictObject({});
const tasksWidgetConfig = z.strictObject({ filter: z.enum(["all", "today"]).optional() });

function kernelWidget(id: string, title: string, description: string, w: number, h: number, options: { minW?: number; multiple?: boolean; config?: z.ZodObject; capabilities?: HomeWidgetDefinition["capabilities"] } = {}) {
  return defineHomeWidget({
    owner: "kernel",
    id,
    title,
    description,
    defaultSize: { w, h },
    minSize: { w: options.minW ?? 2, h: 2 },
    maxSize: { w: DASHBOARD_COLUMNS, h: 6 },
    maxInstances: options.multiple ? null : 1,
    defaultConfig: {},
    configSchema: options.config ?? emptyWidgetConfig,
    capabilities: options.capabilities ?? [],
  });
}

export const kernelHomeWidgets = {
  metrics: kernelWidget("metrics", "概览", "查看待办、笔记、捕获与启用规则。", 6, 2, { minW: 3 }),
  tasks: kernelWidget("tasks", "我的任务", "查看全部待办或今日安排。", 3, 3, { multiple: true, config: tasksWidgetConfig, capabilities: [{ name: "tasks.list", required: true }] }),
  notes: kernelWidget("notes", "最近笔记", "继续编辑最近打开的笔记。", 3, 3, { capabilities: [{ name: "notes.list", required: true }] }),
  focus: kernelWidget("focus", "专注", "开始专注并跟踪计时。", 3, 2),
  habits: kernelWidget("habits", "习惯", "查看和记录今天的习惯。", 3, 2),
  inbox: kernelWidget("inbox", "收件箱", "查看等待整理的捕获。", 3, 3, { capabilities: [{ name: "inbox.list", required: true }] }),
  activity: kernelWidget("activity", "最近活动", "查看工作区最近的活动。", 3, 3),
  agent: kernelWidget("agent", "Agent CLI", "打开工作区的 Agent 会话。", 3, 2, { capabilities: [{ name: "agent.core.status", required: true }] }),
} as const;

export function defaultDashboardBoard(): DashboardBoard {
  const defaults = [
    { definition: kernelHomeWidgets.metrics, x: 0, y: 0 },
    { definition: kernelHomeWidgets.tasks, x: 0, y: 2 },
    { definition: kernelHomeWidgets.notes, x: 3, y: 2 },
    { definition: kernelHomeWidgets.focus, x: 0, y: 5 },
  ];
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    boardId: "home",
    revision: "0",
    updatedAt: null,
    instances: defaults.map(({ definition }) => ({
      instanceId: `default-${definition.id}`,
      widgetType: homeWidgetType(definition.owner, definition.id),
      config: definition.defaultConfig,
      hidden: false,
    })),
    layout: defaults.map(({ definition, x, y }) => ({ instanceId: `default-${definition.id}`, x, y, ...definition.defaultSize })),
  };
}
