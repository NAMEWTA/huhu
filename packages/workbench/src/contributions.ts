import type { ComponentType, ReactNode } from "react";

export type RailGroup = "primary" | "execution" | "system";

export interface ModuleProps {
  /** 当前分区 id（模块没有 sections 时为空串）。 */
  section: string;
  onSection(id: string): void;
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
  sections?: { id: string; label: string; icon?: ReactNode }[];
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
      modules: [...this.modules.values()].filter((m) => this.visible(m.plugin)).sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order),
      commands: [...this.commands.values()].filter((c) => this.visible(c.plugin)),
    };
    return this.snapshotCache;
  };
}
