import { Badge, Banner, ControlsProvider, Hint, IconButton, MotionProvider, Segmented } from "@huhu/ui";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Folder, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { Component, Fragment, useEffect, useMemo, useState, useSyncExternalStore, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ModuleIconsContext, SettingsPagesContext, type ContributionRegistry, type ModuleContribution } from "../contributions.js";
import { host } from "../settings/host.js";
import { useRegionCycle } from "./region-cycle.js";
import { BrandMark } from "./BrandMark.js";
import { VaultMenu } from "./VaultMenu.js";
import { VaultSwitchDialog } from "./VaultSwitchDialog.js";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, type UiState } from "../state/ui-store.js";

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
  /** 面包屑栏右侧插槽（通知入口等，需要 EngineProvider 才能渲染）。 */
  statusSlot?: ReactNode;
  /** 底部状态栏内容（需要 EngineProvider）。 */
  statusBar?: ReactNode;
  /** 版本号，显示在窗口栏右侧。 */
  version?: string;
}

type NavSection = NonNullable<ModuleContribution["sections"]>[number];
const ENGINE_TEXT = { ready: "引擎就绪", starting: "引擎启动中", stopped: "引擎已停止", crashed: "引擎已停止" } as const;

/** 应用外壳（原型 App）：窗口栏 → 左侧图标栏 + 主区（标签条 → 面包屑栏 → 模块页面）。模块各自带自己的导航栏。 */
export function AppShell({ registry, ui, vaultName, engineState, onRestartEngine, statusSlot, statusBar, version }: AppShellProps) {
  const { modules, settingsPages } = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  const s = useStore(ui);
  const [switchOpen, setSwitchOpen] = useState(false);
  useRegionCycle();
  const [switchTarget, setSwitchTarget] = useState<{ path: string; name: string } | undefined>(undefined);
  const moduleIcons = useMemo(() => {
    const map: Record<string, ReactNode> = {};
    for (const m of modules) map[m.plugin] ??= m.icon; // 一个插件有多个模块时取第一个
    return map;
  }, [modules]);
  const active = modules.find((m) => m.id === s.activeModule) ?? null;
  const Active = active?.component;
  const main = modules.filter((m) => m.group !== "system");
  const system = modules.filter((m) => m.group === "system");
  const home = modules.find((m) => m.id === "home") ?? modules[0] ?? null;
  // 设置模块的导航由注册表里可见的设置页动态生成：系统组在前，插件组在后；插件停用后它的页随之消失
  const sections = useMemo<NavSection[]>(
    () => (active?.id === "settings" ? settingsPages.map((p) => ({ id: p.id, label: p.title, icon: p.icon, group: p.plugin === "kernel" ? "系统" : "插件" })) : (active?.sections ?? [])),
    [active, settingsPages],
  );
  // 当前分区不在可见列表里（插件被停用、切换 Vault 等）时，回到第一项
  const stored = (active && s.sections[active.id]) || "";
  const section = sections.some((x) => x.id === stored) ? stored : (sections[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  /** 模块内的跳转：不走 openModule 的“目标已是当前模块就切换侧栏折叠”逻辑；设置页不存在（插件已停用）时落到第一项并提示。 */
  const navigate = (id: string, target?: string) => {
    if (target) {
      if (id === "settings" && !settingsPages.some((p) => p.id === target)) setNotice("该插件未启用，对应的设置页不可用");
      else s.setSection(id, target);
    }
    if (s.activeModule !== id) s.openModule(id);
  };
  const setSection = (id: string) => active && s.setSection(active.id, id);
  const shellNav = active?.nav === "shell" && sections.length > 0;
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const x = e.clientX;
    const width = s.sidebarWidth;
    const move = (ev: PointerEvent) => s.setSidebarWidth(width + ev.clientX - x);
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
  };

  const railItem = (m: (typeof modules)[number]) => {
    const badge = m.badge?.() ?? null;
    const on = m.id === s.activeModule;
    return (
      <Hint key={m.id} label={m.title} side="right">
        <button className={`shell-rail-item${on ? " active" : ""}`} type="button" aria-label={m.title} aria-current={on ? "page" : undefined} onClick={() => s.openModule(m.id)}>
          {m.icon}
          {badge ? <span className="shell-rail-dot" aria-label={`${badge} 项待处理`} /> : null}
        </button>
      </Hint>
    );
  };

  return (
    <MotionProvider preference="system">
      <ControlsProvider>
        <ModuleIconsContext.Provider value={moduleIcons}>
          <SettingsPagesContext.Provider value={settingsPages}>
            <div className={`hu-app${s.focusMode ? " hu-focus-mode" : ""}`}>
              <header className="hu-window-bar">
                <button className="brand" type="button" onClick={() => home && s.openModule(home.id)} aria-label="huhu workbench 首页">
                  <BrandMark className="shell-brand-mark" />
                  <span>
                    huhu<span className="shell-brand-suffix">workbench</span>
                  </span>
                </button>
                {host()?.vault ? (
                  <VaultMenu
                    vaultName={vaultName}
                    onSwitch={(target) => {
                      setSwitchTarget(target);
                      setSwitchOpen(true);
                    }}
                  />
                ) : (
                  <div className="hu-window-center shell-vault-title-button" data-testid="vault-name">
                    <Folder size={13} aria-hidden />
                    <span>{vaultName}</span>
                    <ChevronDown size={12} aria-hidden />
                  </div>
                )}
                {host()?.vault ? <VaultSwitchDialog open={switchOpen} {...(switchTarget ? { target: switchTarget } : {})} onClose={() => setSwitchOpen(false)} /> : null}
                <div className="row">{version ? <Badge tone="neutral">{version}</Badge> : null}</div>
              </header>
              <div className="workbench">
                {!s.focusMode ? (
                  <nav className="rail" aria-label="功能图标栏" data-region="rail">
                    <div className="hu-rail-scroll">{main.map(railItem)}</div>
                    <div className="hu-rail-bottom">{system.map(railItem)}</div>
                  </nav>
                ) : null}
                {!s.focusMode && shellNav && active && !s.sidebarCollapsed ? (
                  <>
                    <aside className="hu-primary-nav" aria-label="模块侧栏" data-region="sidebar" style={{ width: s.sidebarWidth === SIDEBAR_DEFAULT ? "var(--sidebar-w, 220px)" : s.sidebarWidth }}>
                      <div className="hu-nav-heading">
                        <strong>{active.title}</strong>
                      </div>
                      <div className="shell-section-nav">
                        {sections.map((x, i) => (
                          <Fragment key={x.id}>
                            {x.group && x.group !== sections[i - 1]?.group ? <div className="shell-section-nav-group">{x.group}</div> : null}
                            <button type="button" title={x.label} data-testid={`${active.id}-nav-${x.id}`} className={x.id === section ? "active" : ""} aria-current={x.id === section ? "page" : undefined} onClick={() => setSection(x.id)}>
                              {x.icon}
                              <span>{x.label}</span>
                            </button>
                          </Fragment>
                        ))}
                      </div>
                      <div className="shell-nav-bottom">{active.description ? <div className="shell-nav-module-description">{active.description}</div> : null}</div>
                    </aside>
                    <div
                      className="shell-column-resizer"
                      role="separator"
                      aria-label="调整导航栏宽度"
                      aria-orientation="vertical"
                      aria-valuenow={s.sidebarWidth}
                      aria-valuemin={SIDEBAR_MIN}
                      aria-valuemax={SIDEBAR_MAX}
                      tabIndex={0}
                      onPointerDown={startResize}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") s.setSidebarWidth(s.sidebarWidth + 12);
                        if (e.key === "ArrowLeft") s.setSidebarWidth(s.sidebarWidth - 12);
                      }}
                    />
                  </>
                ) : null}
                <main className="hu-main-shell" data-region="content">
                  <div className="shell-tab-strip">
                    <nav className="hu-tab-list" aria-label="已打开的功能">
                      {s.openTabs.map((id) => {
                        const m = modules.find((x) => x.id === id);
                        if (!m) return null;
                        const on = id === s.activeModule;
                        return (
                          <div key={id} className={`hu-workspace-tab${on ? " active" : ""}`}>
                            <button type="button" aria-current={on ? "page" : undefined} onClick={() => s.openModule(id)}>
                              {m.icon}
                              <span>{m.title}</span>
                            </button>
                            {id !== "home" ? (
                              <button className="shell-tab-close" type="button" aria-label={`关闭${m.title}标签`} onClick={() => s.closeTab(id)}>
                                <X size={12} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      <IconButton icon={Plus} label="打开功能标签" onClick={() => s.setPaletteOpen(true)} />
                    </nav>
                    <div className="hu-tab-tools">
                      <IconButton icon={s.sidebarCollapsed ? PanelLeftOpen : PanelLeftClose} disabled={!shellNav} label={!shellNav ? "当前页面无需侧栏" : s.sidebarCollapsed ? "展开导航" : "收起导航"} onClick={() => s.toggleSidebar()} />
                      <IconButton icon={s.focusMode ? Minimize2 : Maximize2} label={s.focusMode ? "退出专注模式" : "专注模式"} onClick={() => s.setFocusMode(!s.focusMode)} />
                    </div>
                  </div>
                  <div className="hu-breadcrumb-bar">
                    <div className="hu-breadcrumb">
                      <Folder size={13} aria-hidden />
                      <span>{vaultName}</span>
                      <ChevronRight size={12} aria-hidden />
                      <span className="current">{active?.title ?? "—"}</span>
                    </div>
                    <div className="row">
                      <span className="shell-quiet-button" data-testid="engine-state">
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
                          <button type="button" className="hu-btn" onClick={onRestartEngine}>
                            重启引擎
                          </button>
                        ) : null
                      }
                    >
                      {engineState === "starting" ? "工作台引擎正在启动…" : "工作台引擎未连接"}
                    </Banner>
                  ) : null}
                  {notice ? (
                    <Banner tone="warning" data-testid="shell-notice">
                      {notice}
                    </Banner>
                  ) : null}
                  {active?.nav === "tabs" && sections.length > 0 ? (
                    <Segmented
                      className="hu-module-local-tabs"
                      label={`${active.title}页面`}
                      value={section}
                      options={sections.map((x) => ({ value: x.id, label: x.label, ...(x.tabIcon ? { icon: x.tabIcon } : {}) }))}
                      onChange={setSection}
                    />
                  ) : null}
                  <div className={`shell-main-body hu-module-${active?.id ?? "none"} hu-module-section-${section}`}>
                    <div className="shell-page-surface">
                      {Active && active && engineState === "ready" ? (
                        <ModuleBoundary moduleId={active.id}>
                          <Active section={section} onSection={setSection} onNavigate={navigate} />
                        </ModuleBoundary>
                      ) : (
                        <div className="hu-empty-main">选择左侧的模块开始</div>
                      )}
                    </div>
                  </div>
                </main>
              </div>
              <footer className="shell-status-bar">{engineState === "ready" ? statusBar : null}</footer>
            </div>
          </SettingsPagesContext.Provider>
        </ModuleIconsContext.Provider>
      </ControlsProvider>
    </MotionProvider>
  );
}
