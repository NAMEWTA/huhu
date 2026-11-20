import { assertHomeWidgetDefinitions, homeWidgetType, projectHomeWidget, type HomeWidgetDefinition, type HomeWidgetSource, type HomeWidgetType } from "@huhu/contracts";
import type { LucideIcon } from "lucide-react";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export type RailGroup = "primary" | "execution" | "system";

/** rail 分组的显示顺序（不是字母序）：主功能 → 执行 → 系统。 */
const GROUP_RANK: Record<RailGroup, number> = { primary: 0, execution: 1, system: 2 };

export interface ModuleProps {
  /** 当前分区 id（模块没有 sections 时为空串）。 */
  section: string;
  /** 保留挂载的模块可以在隐藏时交付当前工作。 */
  active?: boolean;
  onSection(id: string): void;
  /** 跳转到另一个模块（例如从笔记属性页打开版本历史）。 */
  onNavigate?(moduleId: string, section?: string): void;
}

export interface ModuleContribution {
  id: string;
  plugin: string;
  title: string;
  group: RailGroup;
  /** 同组内排序，越小越靠前。 */
  order: number;
  icon: ReactNode;
  /** 模块页面；带 sections 的模块会收到当前分区。 */
  component: ComponentType<ModuleProps>;
  /** 模块分区。nav 缺省 "own"：模块自己画导航（任务、笔记…）；"shell"：外壳左侧显示分区导航；"tabs"：页面顶部显示分段标签。 */
  /** 分区；icon 用于外壳左侧导航（nav="shell"），tabIcon（图标组件）用于页面顶部的分段标签（nav="tabs"）。 */
  sections?: { id: string; label: string; icon?: ReactNode; tabIcon?: LucideIcon; /** 导航分组标题（相邻同组项共用一个标题）。 */ group?: string }[];
  description?: string;
  nav?: "own" | "shell" | "tabs";
  /** 侧栏计数/徽标由模块自己的 hook 提供。 */
  badge?: () => number | null;
}

/** 首页卡片：由插件贡献，插件停用时随贡献一起消失（数据不删）。卡片内容自己取数。 */
export interface HomeWidgetContribution {
  /** 卡片 id（小写字母、数字、连字符）；存进 widgets.json 的完整 id 是 `widget:<plugin>:<id>`。 */
  id: string;
  plugin: string;
  title: string;
  /** 默认顺序，越小越靠前。 */
  order: number;
  component: ComponentType<{ onNavigate(moduleId: string): void }>;
  /** 看板元数据。旧首页贡献可暂不提供。 */
  definition?: HomeWidgetDefinition;
}

export function defineHomeWidgetContribution(definition: HomeWidgetDefinition, order: number, component: HomeWidgetContribution["component"]): HomeWidgetContribution {
  return { id: definition.id, plugin: definition.owner, title: definition.title, order, component, definition };
}

/**
 * 设置页：系统页（plugin = "kernel"）与插件页注册到同一个注册表。
 * 插件页随插件启停出现 / 消失；导航分“系统”“插件”两组，每项显示图标与标题。
 */
export interface SettingsPageContribution {
  /** 全局唯一，如 "appearance"、"agent-cli"。 */
  id: string;
  /** 贡献者插件 id；系统页为 "kernel"。 */
  plugin: string;
  /** 中文标题，导航与页头共用这一处。 */
  title: string;
  icon: ReactNode;
  /** 同组内排序，越小越靠前。 */
  order: number;
  component: ComponentType;
}

export interface CommandContribution {
  id: string;
  plugin: string;
  title: string;
  run(): void;
}

export interface ContributionSnapshot {
  modules: ModuleContribution[];
  commands: CommandContribution[];
  homeWidgets: HomeWidgetContribution[];
  settingsPages: SettingsPageContribution[];
}

interface Contributions {
  modules?: ModuleContribution[];
  commands?: CommandContribution[];
  homeWidgets?: HomeWidgetContribution[];
  homeWidgetSource?: HomeWidgetSource;
  settingsPages?: SettingsPageContribution[];
}

/** 贡献注册表：插件按启用状态挂载/移除，无需刷新页面。 */
export class ContributionRegistry {
  private modules = new Map<string, ModuleContribution>();
  private commands = new Map<string, CommandContribution>();
  private widgets = new Map<HomeWidgetType, HomeWidgetContribution>();
  private settingsPages = new Map<string, SettingsPageContribution>();
  private listeners = new Set<() => void>();
  private enabled: ReadonlySet<string> | null = null;
  private snapshotCache: ContributionSnapshot | null = null;

  register(c: Contributions): () => void {
    const widgets = new Map<HomeWidgetType, HomeWidgetContribution>();
    const definitions: HomeWidgetDefinition[] = [];
    for (const widget of c.homeWidgets ?? []) {
      const key = homeWidgetType(widget.plugin, widget.id);
      if (widgets.has(key) || this.widgets.has(key)) throw new Error(`Duplicate home widget registration ${key}`);
      const { definition } = widget;
      if (definition) {
        if (!c.homeWidgetSource) throw new Error(`Missing home widget source for ${key}`);
        if (definition.id !== widget.id || definition.owner !== widget.plugin || definition.title !== widget.title) throw new Error(`Renderer metadata differs for ${key}`);
        definitions.push(definition);
      } else if (c.homeWidgetSource) {
        throw new Error(`Missing home widget definition for ${key}`);
      }
      widgets.set(key, Object.freeze({ ...widget }));
    }
    if (c.homeWidgetSource) assertHomeWidgetDefinitions(c.homeWidgetSource, definitions);

    for (const m of c.modules ?? []) this.modules.set(m.id, m);
    for (const cmd of c.commands ?? []) this.commands.set(cmd.id, cmd);
    for (const [id, widget] of widgets) this.widgets.set(id, widget);
    for (const p of c.settingsPages ?? []) this.settingsPages.set(p.id, p);
    this.changed();
    return () => {
      for (const m of c.modules ?? []) if (this.modules.get(m.id) === m) this.modules.delete(m.id);
      for (const cmd of c.commands ?? []) if (this.commands.get(cmd.id) === cmd) this.commands.delete(cmd.id);
      for (const [id, widget] of widgets) if (this.widgets.get(id) === widget) this.widgets.delete(id);
      for (const p of c.settingsPages ?? []) if (this.settingsPages.get(p.id) === p) this.settingsPages.delete(p.id);
      this.changed();
    };
  }

  /** 目录使用当前调用者的能力清单。不可用项仍可查状态，但无法从目录取得组件。 */
  getHomeWidgetCatalog(allowedCapabilities: ReadonlySet<string>) {
    return [...this.widgets.values()].flatMap((widget) => {
      if (!widget.definition) return [];
      const entry = projectHomeWidget(widget.definition, this.enabled, allowedCapabilities);
      return [{ ...entry, component: entry.status === "available" ? widget.component : undefined }];
    });
  }

  /** 按插件启用状态过滤贡献（null = 不过滤）；`kernel` 的贡献始终可见。启停时无需刷新页面。 */
  setEnabledPlugins(ids: Iterable<string> | null): void {
    this.enabled = ids ? new Set(ids) : null;
    this.changed();
  }

  /** 插件停用：移除它贡献的全部内容。 */
  removePlugin(plugin: string): void {
    for (const [id, m] of this.modules) if (m.plugin === plugin) this.modules.delete(id);
    for (const [id, c] of this.commands) if (c.plugin === plugin) this.commands.delete(id);
    for (const [id, w] of this.widgets) if (w.plugin === plugin) this.widgets.delete(id);
    for (const [id, p] of this.settingsPages) if (p.plugin === plugin) this.settingsPages.delete(id);
    this.changed();
  }

  private visible(plugin: string): boolean {
    return plugin === "kernel" || this.enabled === null || this.enabled.has(plugin);
  }

  private changed(): void {
    this.snapshotCache = null;
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** 稳定引用的快照（useSyncExternalStore 要求未变化时返回同一对象）。 */
  getSnapshot = (): ContributionSnapshot => {
    this.snapshotCache ??= {
      modules: [...this.modules.values()].filter((m) => this.visible(m.plugin)).sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.order - b.order),
      commands: [...this.commands.values()].filter((c) => this.visible(c.plugin)),
      homeWidgets: [...this.widgets.values()].filter((w) => this.visible(w.plugin)).sort((a, b) => a.order - b.order),
      // 系统页在前（按 order），插件页在后（先按插件在 modules 中的顺序，再按 order）
      settingsPages: [...this.settingsPages.values()].filter((p) => this.visible(p.plugin)).sort((a, b) => Number(a.plugin !== "kernel") - Number(b.plugin !== "kernel") || a.order - b.order || a.id.localeCompare(b.id)),
    };
    return this.snapshotCache;
  };
}

/** 设置模块读取当前可见的设置页（由 AppShell 提供）。 */
export const SettingsPagesContext = createContext<SettingsPageContribution[]>([]);
export const useSettingsPages = (): SettingsPageContribution[] => useContext(SettingsPagesContext);

/** 插件 id → 它贡献的第一个模块的图标（插件中心的列表与详情用，与侧栏图标一致）。 */
export const ModuleIconsContext = createContext<Record<string, ReactNode>>({});
export const useModuleIcons = (): Record<string, ReactNode> => useContext(ModuleIconsContext);
