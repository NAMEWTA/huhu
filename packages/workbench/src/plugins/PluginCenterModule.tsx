import { Badge, Button, ChoiceSwitch, Dialog, EmptyState, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { Blocks, Command, ExternalLink, Info, Lock, Monitor, PackageOpen, Plug, RefreshCw, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { ModuleProps } from "../contributions.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";

interface PluginInfo {
  id: string;
  title: string;
  description: string;
  version: string;
  origin: string;
  state: "active" | "disabled" | "failed";
  error?: string;
  dependsOn: string[];
  permissions: string[];
  contributes?: { modules: string[]; settingsPages: string[]; capabilities: string[] };
}
type Filter = "all" | "enabled" | "disabled";

const TITLE: Record<string, string> = { installed: "插件中心", discover: "发现外部扩展", runtime: "插件运行时", permissions: "权限与依赖" };
const tone = (s: PluginInfo["state"]) => (s === "failed" ? "danger" : s === "active" ? "success" : "neutral");

/** 插件中心（原型 PluginCenterV3）：左侧资源列表（内置 / 外部）+ 详情；运行时与权限清单。启用 / 停用走统一生命周期，停用前列出会被一并停用的插件。 */
export function PluginCenterModule({ section, onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const list = useCapability<PluginInfo[]>("plugins.list", {});
  const [origin, setOrigin] = useState<"builtin" | "external">("builtin");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; alsoDisabled: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plugins = list.data ?? [];
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

  const byOrigin = useMemo(() => plugins.filter((p) => (origin === "builtin" ? p.origin === "builtin" : p.origin !== "builtin")), [plugins, origin]);
  const visible = byOrigin.filter((p) => (filter === "all" || (filter === "enabled" ? p.state === "active" : p.state !== "active")) && `${p.title}${p.id}${p.description}`.toLowerCase().includes(query.toLowerCase()));
  const current = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  const counts = { builtin: plugins.filter((p) => p.origin === "builtin").length, external: plugins.filter((p) => p.origin !== "builtin").length };

  async function setEnabled(id: string, enabled: boolean) {
    setError(null);
    setBusy(true);
    try {
      await engine.call("plugins.setEnabled", { id, enabled }, { write: true });
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  /** 依赖它的、当前启用的插件（传递闭包）。 */
  const dependents = (id: string): string[] => {
    const out = new Set<string>();
    const walk = (x: string) => {
      for (const p of plugins)
        if (p.state === "active" && p.dependsOn.includes(x) && !out.has(p.id)) {
          out.add(p.id);
          walk(p.id);
        }
    };
    walk(id);
    return [...out];
  };
  const toggle = (p: PluginInfo, on: boolean) => {
    if (on) return void setEnabled(p.id, true);
    const d = dependents(p.id);
    if (d.length) setConfirm({ id: p.id, alsoDisabled: d });
    else void setEnabled(p.id, false);
  };

  return (
    <div className="module-layout system-layout plugin-v3" data-testid="plugin-center">
      <aside className="resource-pane">
        <div className="resource-head">
          <span>插件与扩展</span>
          <Badge>{plugins.length}</Badge>
        </div>
        <div className="plugin-origin-tabs">
          <button type="button" className={origin === "builtin" ? "active" : ""} onClick={() => (setOrigin("builtin"), setQuery(""), setFilter("all"))}>
            <ShieldCheck size={14} aria-hidden /> 内置 <small>{counts.builtin}</small>
          </button>
          <button type="button" className={origin === "external" ? "active" : ""} onClick={() => (setOrigin("external"), setQuery(""), setFilter("all"))}>
            <PackageOpen size={14} aria-hidden /> 外部 <small>{counts.external}</small>
          </button>
        </div>
        <div className="system-pane-search">
          <SearchBox value={query} onChange={setQuery} placeholder={origin === "builtin" ? "搜索内置功能…" : "搜索外部扩展…"} />
        </div>
        <div className="resource-list system-resource-list">
          {visible.map((p) => (
            <button key={p.id} type="button" className={`plugin-list-row ${p.id === current?.id ? "active" : ""}`} data-testid="plugin-row" data-plugin={p.id} onClick={() => setSelectedId(p.id)}>
              <span className="plugin-mini-icon">
                <Blocks size={17} aria-hidden />
              </span>
              <span className="grow">
                <strong>{p.title}</strong>
                <small>{p.id}</small>
              </span>
              <span className={`tiny-status ${p.state === "active" ? "on" : p.state === "failed" ? "failed" : ""}`} aria-label={t.plugins.states[p.state]} />
            </button>
          ))}
          {visible.length === 0 ? <EmptyState icon={origin === "builtin" ? ShieldCheck : PackageOpen} title={query ? "没有匹配的插件" : origin === "external" ? "尚未安装外部扩展" : "此筛选下没有插件"} /> : null}
        </div>
        <div className="resource-footer">
          <ShieldCheck size={13} aria-hidden />
          <span>{origin === "builtin" ? "随应用交付 · 可停用，不可卸载" : "独立安装 · 可停用与卸载"}</span>
        </div>
      </aside>
      <div className="view-content">
        <PageHead
          title={TITLE[section] ?? "插件中心"}
          description="内置功能随应用交付，外部扩展独立管理。两类插件均使用统一的权限与生命周期。"
          actions={
            <Button icon={RefreshCw} onClick={() => void refresh()}>
              刷新
            </Button>
          }
        />
        <div className="system-scroll scroll">
          {error ? (
            <div role="alert" className="callout danger">
              <p>{error}</p>
            </div>
          ) : null}
          {section === "discover" ? (
            <div className="callout">
              <PackageOpen size={18} aria-hidden />
              <div>
                <strong>外部扩展</strong>
                <p>外部扩展包的安装与托管尚未开放；当前所有功能都是随应用交付的内置插件。</p>
              </div>
            </div>
          ) : section === "runtime" ? (
            <>
              <div className="metric-grid">
                <div>
                  <strong>{counts.builtin}</strong>
                  <span>内置功能</span>
                </div>
                <div>
                  <strong>{counts.external}</strong>
                  <span>已安装外部扩展</span>
                </div>
                <div>
                  <strong>{plugins.filter((p) => p.state === "active").length}</strong>
                  <span>活动插件</span>
                </div>
                <div>
                  <strong>{plugins.filter((p) => p.state === "failed").length}</strong>
                  <span>隔离故障</span>
                </div>
              </div>
              <section className="card system-section">
                <div className="card-head">
                  <h2>生命周期与服务租约</h2>
                  <Badge>内部运行时不作为独立终端模块</Badge>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>插件</th>
                      <th>来源</th>
                      <th>状态</th>
                      <th>贡献</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plugins.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.title}</strong>
                        </td>
                        <td>{p.origin === "builtin" ? "内置" : "外部"}</td>
                        <td>
                          <Badge tone={tone(p.state)}>{t.plugins.states[p.state]}</Badge>
                        </td>
                        <td>{p.state === "active" ? "已注册" : "已撤销"}</td>
                        <td>
                          {p.state === "failed" ? (
                            <Button variant="ghost" disabled={busy} onClick={() => void setEnabled(p.id, true)}>
                              重试恢复
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : section === "permissions" ? (
            <>
              <div className="callout">
                <ShieldCheck size={18} aria-hidden />
                <p>内置与外部插件使用同一授权检查。停用插件会撤销它的视图、命令和对外能力。</p>
              </div>
              <section className="card system-section">
                <div className="card-head">
                  <h2>权限与依赖清单</h2>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>插件 / 来源</th>
                      <th>请求权限</th>
                      <th>依赖</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plugins.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.title}
                          <div className="small muted">{p.origin === "builtin" ? "内置功能" : "外部扩展"}</div>
                        </td>
                        <td>
                          <div className="permission-tags">{p.permissions.length ? p.permissions.map((x) => <code key={x}>{x}</code>) : <span className="muted">无</span>}</div>
                        </td>
                        <td>{p.dependsOn.join(", ") || "无"}</td>
                        <td>
                          <Badge tone={tone(p.state)}>{t.plugins.states[p.state]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <>
              <div className="plugin-filter-row">
                <Segmented<Filter>
                  label="状态筛选"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "全部" },
                    { value: "enabled", label: "已启用" },
                    { value: "disabled", label: "已停用" },
                  ]}
                />
                <span className="small muted">
                  {origin === "builtin" ? "内置功能" : "外部扩展"} · {visible.length} 项
                </span>
              </div>
              {current ? (
                <article className="plugin-detail card" data-testid="plugin-detail">
                  <div className="plugin-detail-top">
                    <span className="plugin-hero-icon">
                      <Blocks size={28} aria-hidden />
                    </span>
                    <div className="grow">
                      <div className="row">
                        <h1>{current.title}</h1>
                        <Badge>{current.origin === "builtin" ? "内置功能" : "外部扩展"}</Badge>
                        <Badge tone={tone(current.state)}>{t.plugins.states[current.state]}</Badge>
                      </div>
                      <p>{current.description}</p>
                      <div className="plugin-meta">
                        <code>@huhu/plugin-{current.id}</code>
                        <span>v{current.version}</span>
                        <span>{current.origin === "builtin" ? "随应用交付与更新" : "用户扩展目录"}</span>
                      </div>
                      {current.error ? <p className="field-error">{current.error}</p> : null}
                    </div>
                    <ChoiceSwitch checked={current.state === "active"} disabled={busy} label={`${current.state === "active" ? t.plugins.disable : t.plugins.enable} ${current.title}`} onChange={(on) => toggle(current, on)} />
                  </div>
                  <div className="plugin-detail-actions">
                    {current.state === "active" && (current.contributes?.modules.length ?? 0) > 0 && onNavigate ? (
                      <Button icon={ExternalLink} data-testid="plugin-open" onClick={() => onNavigate(current.contributes!.modules[0]!)}>
                        打开
                      </Button>
                    ) : null}
                    {current.state === "active" && (current.contributes?.settingsPages.length ?? 0) > 0 && onNavigate ? (
                      <Button icon={SettingsIcon} data-testid="plugin-settings" onClick={() => onNavigate("settings")}>
                        设置
                      </Button>
                    ) : null}
                    <div className="grow" />
                    {current.origin === "builtin" ? (
                      <span className="plugin-bundled-note">
                        <Lock size={13} aria-hidden /> 内置功能不可卸载
                      </span>
                    ) : null}
                  </div>
                  <div className="plugin-detail-body">
                    <div className="plugin-origin-explainer">
                      <Info size={17} aria-hidden />
                      <div>
                        <strong>{current.origin === "builtin" ? "内置功能" : "外部扩展"}</strong>
                        <p>{current.origin === "builtin" ? "随应用一起交付，使用与外部扩展相同的权限与生命周期；可停用，不可卸载。" : "独立安装在用户扩展目录，可停用与卸载；业务数据与配置在卸载后保留。"}</p>
                      </div>
                    </div>
                    <div>
                      <h3>贡献到工作台</h3>
                      <div className="contribution-grid">
                        <div>
                          <Monitor size={17} aria-hidden />
                          <strong>界面</strong>
                          <small>视图、菜单与设置</small>
                        </div>
                        <div>
                          <Command size={17} aria-hidden />
                          <strong>命令</strong>
                          <small>统一命令入口</small>
                        </div>
                        <div>
                          <Plug size={17} aria-hidden />
                          <strong>能力</strong>
                          <small>受控应用服务</small>
                        </div>
                      </div>
                    </div>
                    <div data-testid="plugin-capabilities">
                      <h3>已注册能力 · {current.contributes?.capabilities.length ?? 0}</h3>
                      <div className="permission-tags">{(current.contributes?.capabilities ?? []).length ? current.contributes!.capabilities.map((c) => <code key={c}>{c}</code>) : <span className="muted">无</span>}</div>
                    </div>
                    <div className="field-grid">
                      <div>
                        <h3>依赖与生命周期</h3>
                        <p>{current.dependsOn.length ? `依赖：${current.dependsOn.join("、")}。` : "无其他业务插件依赖。"} 停用后释放所属租约与贡献。</p>
                      </div>
                      <div>
                        <h3>请求权限</h3>
                        <div className="permission-tags">{current.permissions.length ? current.permissions.map((x) => <code key={x}>{x}</code>) : <span className="muted">无</span>}</div>
                      </div>
                    </div>
                  </div>
                </article>
              ) : (
                <EmptyState
                  icon={origin === "builtin" ? ShieldCheck : PackageOpen}
                  title={query ? "未找到匹配结果" : origin === "external" ? "让工作台按需生长" : "此筛选下没有插件"}
                  hint={origin === "external" ? "外部扩展的安装与托管尚未开放。" : "修改搜索或状态筛选。"}
                />
              )}
              <div className="callout system-note">
                <Info size={17} aria-hidden />
                <p>内置与外部是交付来源；启用、停用和故障是运行状态。列表发现和实际调用都会检查模块状态。</p>
              </div>
            </>
          )}
        </div>
      </div>
      {confirm ? (
        <Dialog
          open
          title={t.plugins.confirmTitle}
          onClose={() => setConfirm(null)}
          error={error}
          testId="plugin-confirm"
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>{t.plugins.cancel}</Button>
              <Button variant="danger" onClick={() => void setEnabled(confirm.id, false)}>
                {t.plugins.disable}
              </Button>
            </>
          }
        >
          <p className="confirm-description">{t.plugins.confirmBody(confirm.alsoDisabled)}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
