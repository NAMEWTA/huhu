import { Badge, Banner, ControlsProvider, Hint, IconButton, MotionProvider } from "@huhu/ui";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Folder, Maximize2, Minimize2, Plus, Search, X } from "lucide-react";
import { Component, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ContributionRegistry } from "../contributions.js";
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
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
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
  /** 面包屑栏右侧插槽（通知入口等，需要 EngineProvider 才能渲染）。 */
  statusSlot?: ReactNode;
  /** 版本号，显示在窗口栏右侧。 */
  version?: string;
}

const ENGINE_TEXT = { ready: "引擎就绪", starting: "引擎启动中", stopped: "引擎已停止", crashed: "引擎已停止" } as const;

/** 应用外壳（原型 App）：窗口栏 → 左侧图标栏 + 主区（标签条 → 面包屑栏 → 模块页面）。模块各自带自己的导航栏。 */
export function AppShell({ registry, ui, vaultName, engineState, onRestartEngine, statusSlot, version }: AppShellProps) {
  const { modules } = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const s = useStore(ui);
  const active = modules.find((m) => m.id === s.activeModule) ?? null;
  const Active = active?.component;
  const main = modules.filter((m) => m.group !== "system");
  const system = modules.filter((m) => m.group === "system");
  const home = modules.find((m) => m.id === "home") ?? modules[0] ?? null;

  const railItem = (m: (typeof modules)[number]) => {
    const badge = m.badge?.() ?? null;
    const on = m.id === s.activeModule;
    return (
      <Hint key={m.id} label={m.title} side="right">
        <button className={`rail-item${on ? " active" : ""}`} type="button" aria-label={m.title} aria-current={on ? "page" : undefined} onClick={() => s.openModule(m.id)}>
          {m.icon}
          {badge ? <span className="rail-dot" aria-label={`${badge} 项待处理`} /> : null}
        </button>
      </Hint>
    );
  };

  return (
    <MotionProvider preference="system">
      <ControlsProvider>
        <div className={`app${s.focusMode ? " focus-mode" : ""}`}>
          <header className="window-bar">
            <button className="brand" type="button" onClick={() => home && s.openModule(home.id)} aria-label="HUHU 工作台首页">
              <span className="brand-mark">h</span>
              <span>
                huhu<span className="brand-suffix">workbench</span>
              </span>
            </button>
            <div className="window-center vault-title-button" data-testid="vault-name">
              <Folder size={13} aria-hidden />
              <span>{vaultName}</span>
              <ChevronDown size={12} aria-hidden />
            </div>
            <div className="row">{version ? <Badge tone="neutral">{version}</Badge> : null}</div>
          </header>
          <div className="workbench">
            {!s.focusMode ? (
              <nav className="rail" aria-label="功能图标栏">
                <div className="rail-scroll">{main.map(railItem)}</div>
                <div className="rail-bottom">{system.map(railItem)}</div>
              </nav>
            ) : null}
            <main className="main-shell">
              <div className="tab-strip">
                <div className="tab-list" role="tablist">
                  {s.openTabs.map((id) => {
                    const m = modules.find((x) => x.id === id);
                    if (!m) return null;
                    const on = id === s.activeModule;
                    return (
                      <div key={id} className={`workspace-tab${on ? " active" : ""}`}>
                        <button type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => s.openModule(id)}>
                          {m.icon}
                          <span>{m.title}</span>
                        </button>
                        {id !== "home" ? (
                          <button className="tab-close" type="button" aria-label={`关闭${m.title}标签`} onClick={() => s.closeTab(id)}>
                            <X size={12} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <IconButton icon={Plus} label="打开功能标签" onClick={() => s.setPaletteOpen(true)} />
                </div>
                <div className="tab-tools">
                  <IconButton icon={s.focusMode ? Minimize2 : Maximize2} label={s.focusMode ? "退出专注模式" : "专注模式"} onClick={() => s.setFocusMode(!s.focusMode)} />
                </div>
              </div>
              <div className="breadcrumb-bar">
                <div className="breadcrumb">
                  <Folder size={13} aria-hidden />
                  <span>{vaultName}</span>
                  <ChevronRight size={12} aria-hidden />
                  <span className="current">{active?.title ?? "—"}</span>
                </div>
                <div className="row">
                  <span className="quiet-button" data-testid="engine-state">
                    {engineState === "ready" ? <CheckCircle2 size={13} aria-hidden /> : <AlertCircle size={13} aria-hidden />}
                    <span>{ENGINE_TEXT[engineState]}</span>
                  </span>
                  <IconButton icon={Search} label="搜索与命令" onClick={() => s.setPaletteOpen(true)} />
                  {engineState === "ready" ? statusSlot : null}
                </div>
              </div>
              {engineState !== "ready" ? (
                <Banner
                  tone={engineState === "starting" ? "blue" : "danger"}
                  action={
                    engineState === "crashed" || engineState === "stopped" ? (
                      <button type="button" className="btn" onClick={onRestartEngine}>
                        重启引擎
                      </button>
                    ) : null
                  }
                >
                  {engineState === "starting" ? "工作台引擎正在启动…" : "工作台引擎未连接"}
                </Banner>
              ) : null}
              <div className={`main-body module-${active?.id ?? "none"}`}>
                <div className="huhu-page-surface">
                  {Active && active && engineState === "ready" ? (
                    <ModuleBoundary moduleId={active.id}>
                      <Active />
                    </ModuleBoundary>
                  ) : (
                    <div className="hu-empty-main">选择左侧的模块开始</div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </div>
      </ControlsProvider>
    </MotionProvider>
  );
}
