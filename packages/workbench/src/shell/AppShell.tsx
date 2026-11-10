import { Banner } from "@huhu/ui";
import { Component, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry, ModuleContribution } from "../contributions.js";
import type { UiState } from "../state/ui-store.js";

class ModuleBoundary extends Component<{ children: ReactNode; moduleId: string }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(_e: Error, _i: ErrorInfo) {
    // 错误已显示在模块区域内；外壳继续可用
  }
  override componentDidUpdate(prev: { moduleId: string }) {
    if (prev.moduleId !== this.props.moduleId && this.state.error) this.setState({ error: null });
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="hu-module-error" role="alert">
          <strong>这个模块出错了</strong>
          <span>{this.state.error.message}</span>
          <button type="button" className="hu-btn" onClick={() => this.setState({ error: null })}>
            重新加载模块
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface AppShellProps {
  registry: ContributionRegistry;
  ui: StoreApi<UiState>;
  vaultName: string;
  engineState: "starting" | "ready" | "stopped" | "crashed";
  onRestartEngine?(): void;
  /** 状态栏右侧插槽（通知入口等，需要 EngineProvider 才能渲染）。 */
  statusSlot?: ReactNode;
}

const GROUP_LABEL: Record<ModuleContribution["group"], string> = { primary: "知识与行动", execution: "执行", system: "系统" };

export function AppShell({ registry, ui, vaultName, engineState, onRestartEngine, statusSlot }: AppShellProps) {
  const { modules } = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const s = useStore(ui);
  const active = modules.find((m) => m.id === s.activeModule) ?? null;
  const Active = active?.component;
  const groups = (["primary", "execution", "system"] as const).map((g) => ({ g, items: modules.filter((m) => m.group === g) })).filter((x) => x.items.length > 0);

  return (
    <div className="hu-shell" data-focus-mode={s.focusMode || undefined}>
      <header className="hu-topbar">
        <span className="hu-logo">HUHU</span>
        <span className="hu-vault-name" data-testid="vault-name">{vaultName}</span>
      </header>
      <nav className="hu-rail" aria-label="模块">
        {groups.map(({ g, items }) => (
          <div key={g} role="group" aria-label={GROUP_LABEL[g]} className="hu-rail-group">
            {items.map((m) => {
              const badge = m.badge?.() ?? null;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="hu-rail-item"
                  aria-label={m.title}
                  aria-current={m.id === s.activeModule ? "page" : undefined}
                  title={m.title}
                  onClick={() => s.openModule(m.id)}
                >
                  {m.icon}
                  {badge ? <span className="hu-rail-dot" aria-label={`${badge} 项待处理`} /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="hu-tabs" role="tablist">
        {s.openTabs.map((id) => {
          const m = modules.find((x) => x.id === id);
          if (!m) return null;
          return (
            <span key={id} className="hu-tab" data-selected={id === s.activeModule || undefined}>
              <button type="button" role="tab" aria-selected={id === s.activeModule} tabIndex={id === s.activeModule ? 0 : -1} className="hu-tab-label" onClick={() => s.openModule(id)}>
                {m.title}
              </button>
              <button type="button" aria-label={`关闭${m.title}`} onClick={() => s.closeTab(id)}>×</button>
            </span>
          );
        })}
      </div>
      <main className="hu-main">
        {engineState !== "ready" ? (
          <Banner tone={engineState === "starting" ? "blue" : "danger"} action={engineState === "crashed" || engineState === "stopped" ? <button type="button" className="hu-btn" onClick={onRestartEngine}>重启引擎</button> : null}>
            {engineState === "starting" ? "工作台引擎正在启动…" : "工作台引擎未连接"}
          </Banner>
        ) : null}
        {Active && active && engineState === "ready" ? (
          <ModuleBoundary moduleId={active.id}>
            <Active />
          </ModuleBoundary>
        ) : (
          <div className="hu-empty-main">选择左侧的模块开始</div>
        )}
      </main>
      <footer className="hu-statusbar">
        <span data-testid="engine-state">{engineState === "ready" ? "引擎就绪" : engineState === "starting" ? "引擎启动中" : "引擎已停止"}</span>
        <span>{modules.length} 个模块</span>
        <span style={{ marginLeft: "auto" }}>{engineState === "ready" ? statusSlot : null}</span>
      </footer>
    </div>
  );
}
