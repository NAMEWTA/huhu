import type { LucideIcon } from "lucide-react";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export type RailGroup = "primary" | "execution" | "system";

/** rail 分组的显示顺序（不是字母序）：主功能 → 执行 → 系统。 */
const GROUP_RANK: Record<RailGroup, number> = { primary: 0, execution: 1, system: 2 };

export interface ModuleProps {
  /** 当前分区 id（模块没有 sections 时为空串）。 */
  section: string;
  onSection(id: string): void;
  /** 跳转到另一个模块（例如从笔记属性页打开版本历史）。 */
  onNavigate?(moduleId: string): void;
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
  sections?: { id: string; label: string; icon?: ReactNode; tabIcon?: LucideIcon }[];
  description?: string;
  nav?: "own" | "shell" | "tabs";
  /** 侧栏计数/徽标由模块自己的 hook 提供。 */
  badge?: () => number | null;
}

export interface CommandContribution {
  id: string;
  plugin: string;
  title: string;
  run(): void;
}

/** 贡献注册表：插件按启用状态挂载/移除，无需刷新页面。 */
export class ContributionRegistry {
  private modules = new Map<string, ModuleContribution>();
  private commands = new Map<string, CommandContribution>();
  private listeners = new Set<() => void>();
  private enabled: ReadonlySet<string> | null = null;
  private snapshotCache: { modules: ModuleContribution[]; commands: CommandContribution[] } | null = null;

  register(c: { modules?: ModuleContribution[]; commands?: CommandContribution[] }): () => void {
    for (const m of c.modules ?? []) this.modules.set(m.id, m);
    for (const cmd of c.commands ?? []) this.commands.set(cmd.id, cmd);
    this.changed();
    return () => {
      for (const m of c.modules ?? []) if (this.modules.get(m.id) === m) this.modules.delete(m.id);
      for (const cmd of c.commands ?? []) if (this.commands.get(cmd.id) === cmd) this.commands.delete(cmd.id);
      this.changed();
    };
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
  getSnapshot = (): { modules: ModuleContribution[]; commands: CommandContribution[] } => {
    this.snapshotCache ??= {
      modules: [...this.modules.values()].filter((m) => this.visible(m.plugin)).sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.order - b.order),
      commands: [...this.commands.values()].filter((c) => this.visible(c.plugin)),
    };
    return this.snapshotCache;
  };
}

/** 插件 id → 它贡献的第一个模块的图标（插件中心的列表与详情用，与侧栏图标一致）。 */
export const ModuleIconsContext = createContext<Record<string, ReactNode>>({});
export const useModuleIcons = (): Record<string, ReactNode> => useContext(ModuleIconsContext);
