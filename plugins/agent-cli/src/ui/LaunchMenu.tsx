import { scoreText } from "@huhu/workbench";
import { ChevronRight, Search, Settings2, SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AGENT_CATALOG, isEnabled, type AgentCatalogEntry, type AgentSettingsFile } from "../shared/index.js";
import { AgentIcon } from "./AgentIcon.js";

export interface LaunchOptions {
  model?: string;
  effort?: string;
  fast?: boolean;
  prompt?: string;
}
export interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
}

type Row = { kind: "shell" } | { kind: "agent"; entry: AgentCatalogEntry; installed: boolean; isDefault: boolean };

/**
 * 新建菜单（复刻 Orca 的新建标签入口）：搜索、新终端、已启用的智能体（默认在首，悬停 / → 打开子菜单选择模型、Effort、速度、附加提示词）、底部“智能体设置…”。
 * 子菜单里的选择只影响这一次启动，不写回设置；权限与参数在智能体设置里改。
 */
export function LaunchMenu({
  detected,
  settings,
  noSpace,
  onLaunch,
  onOpenSettings,
  onClose,
}: {
  detected: Detected[];
  settings: AgentSettingsFile;
  /** 没有 Space：新终端与智能体项置灰。 */
  noSpace: boolean;
  onLaunch(provider: string, o?: LaunchOptions): void;
  onOpenSettings(): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(0);
  const [sub, setSub] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const enabled = AGENT_CATALOG.filter((e) => isEnabled(settings, e.id));
    const first = settings.defaultAgent && enabled.some((e) => e.id === settings.defaultAgent) ? settings.defaultAgent : (enabled.find((e) => detected.find((d) => d.id === e.id)?.installed)?.id ?? null);
    const ordered = [...enabled.filter((e) => e.id === first), ...enabled.filter((e) => e.id !== first)];
    const agentRows: Row[] = ordered
      .filter((e) => !query.trim() || scoreText(query, e.displayName) >= 0 || scoreText(query, e.id) >= 0 || (e.options.models ?? []).some((m) => scoreText(query, m.label) >= 0 || scoreText(query, m.id) >= 0))
      .map((e) => ({ kind: "agent", entry: e, installed: detected.find((d) => d.id === e.id)?.installed === true, isDefault: e.id === first }));
    const shell = !query.trim() || ["终端", "terminal", "shell", "新终端"].some((w) => scoreText(query, w) >= 0);
    return [...(shell ? [{ kind: "shell" } as Row] : []), ...agentRows];
  }, [settings, detected, query]);
  useEffect(() => setFocus(0), [query]);
  const focused = rows[focus];
  const subEntry = sub ? AGENT_CATALOG.find((e) => e.id === sub) : undefined;
  const hasSub = (r: Row | undefined): r is Extract<Row, { kind: "agent" }> => r?.kind === "agent" && r.installed && !noSpace && Object.keys(r.entry.options).length > 0;

  const pick = (r: Row | undefined) => {
    if (!r || noSpace) return;
    if (r.kind === "shell") return onLaunch("shell");
    if (r.installed) onLaunch(r.entry.id);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") return void (e.preventDefault(), sub ? setSub(null) : onClose());
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return; // 子菜单内的输入不拦截
    if (e.key === "ArrowDown") return void (e.preventDefault(), setFocus((i) => Math.min(rows.length - 1, i + 1)), setSub(null));
    if (e.key === "ArrowUp") return void (e.preventDefault(), setFocus((i) => Math.max(0, i - 1)), setSub(null));
    if (e.key === "ArrowRight" && hasSub(focused)) return void (e.preventDefault(), setSub(focused.entry.id));
    if (e.key === "ArrowLeft" && sub) return void (e.preventDefault(), setSub(null));
    if (e.key === "Enter" && e.target === searchRef.current) return void (e.preventDefault(), pick(focused));
  };

  return (
    <div className="agent-launch-menu" role="menu" aria-label="新建" data-testid="launch-menu" onKeyDown={onKey}>
      <div className="agent-launch-menu-list">
        <label className="agent-launch-menu-search">
          <Search size={14} aria-hidden />
          <input ref={searchRef} aria-label="搜索智能体或模型" placeholder="搜索智能体或模型…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="launch-menu-search" />
        </label>
        {noSpace ? <p className="agent-launch-menu-hint">先选择或创建 Space</p> : null}
        {rows.map((r, i) =>
          r.kind === "shell" ? (
            <button
              key="shell"
              type="button"
              role="menuitem"
              className={`agent-launch-menu-row${focus === i ? " focused" : ""}`}
              disabled={noSpace}
              data-testid="launch-shell"
              onMouseEnter={() => (setFocus(i), setSub(null))}
              onClick={() => pick(r)}
            >
              <SquareTerminal size={16} aria-hidden />
              <span className="grow">新终端</span>
              <kbd>Ctrl+T</kbd>
            </button>
          ) : (
            <button
              key={r.entry.id}
              type="button"
              role="menuitem"
              aria-haspopup={hasSub(r) ? "menu" : undefined}
              aria-expanded={sub === r.entry.id}
              className={`agent-launch-menu-row${focus === i ? " focused" : ""}${r.installed ? "" : " off"}`}
              disabled={noSpace || !r.installed}
              data-testid="launch-agent"
              data-agent={r.entry.id}
              title={r.installed ? undefined : "未检测到，请在智能体设置中检查命令"}
              onMouseEnter={() => (setFocus(i), setSub(hasSub(r) ? r.entry.id : null))}
              onClick={() => pick(r)}
            >
              <AgentIcon id={r.entry.id} size={16} />
              <span className="grow">{r.entry.displayName}</span>
              {r.isDefault ? <span className="agent-launch-menu-tag">默认</span> : null}
              {!r.installed ? <span className="agent-launch-menu-tag">未检测到</span> : hasSub(r) ? <ChevronRight size={14} aria-hidden /> : null}
            </button>
          ),
        )}
        {rows.length === 0 ? <p className="agent-launch-menu-hint">没有匹配项</p> : null}
        <div className="agent-launch-menu-sep" />
        <button type="button" role="menuitem" className="agent-launch-menu-row" data-testid="launch-open-settings" onClick={onOpenSettings}>
          <Settings2 size={16} aria-hidden />
          <span className="grow">智能体设置…</span>
        </button>
      </div>
      {subEntry ? <LaunchSubmenu key={subEntry.id} entry={subEntry} settings={settings} query={query} onLaunch={(o) => onLaunch(subEntry.id, o)} /> : null}
    </div>
  );
}

function LaunchSubmenu({ entry, settings, query, onLaunch }: { entry: AgentCatalogEntry; settings: AgentSettingsFile; query: string; onLaunch(o: LaunchOptions): void }) {
  const user = settings.agents[entry.id] ?? {};
  const models = entry.options.models ?? [];
  const searched = query.trim() ? models.find((m) => scoreText(query, m.label) >= 0 || scoreText(query, m.id) >= 0) : undefined;
  const [model, setModel] = useState<string>(searched?.id ?? user.model ?? "");
  const current = models.find((m) => m.id === model);
  const efforts = current ? current.efforts : [...new Set(models.flatMap((m) => m.efforts))];
  const [effort, setEffort] = useState<string>(user.effort ?? "");
  const [fast, setFast] = useState(user.fast === true);
  const [prompt, setPrompt] = useState("");
  const canFast = entry.options.fast !== undefined && (current ? current.fast : models.some((m) => m.fast));
  return (
    <div className="agent-launch-menu-sub" data-testid="launch-submenu">
      <strong>{entry.displayName}</strong>
      {models.length > 0 ? (
        <label>
          模型
          <select aria-label="模型" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">智能体默认</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {entry.options.effort && efforts.length > 0 ? (
        <label>
          Effort
          <select aria-label="Effort" value={efforts.includes(effort) ? effort : ""} onChange={(e) => setEffort(e.target.value)}>
            <option value="">智能体默认</option>
            {efforts.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {canFast ? (
        <label className="row">
          <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} /> 速度：Fast
        </label>
      ) : null}
      {entry.interactive.prompt === "positional" ? (
        <label>
          附加提示词
          <textarea aria-label="附加提示词" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="可选" />
        </label>
      ) : null}
      <button
        type="button"
        className="hu-btn hu-btn-primary"
        data-testid="launch-submenu-start"
        onClick={() => onLaunch({ ...(model ? { model } : {}), ...(effort && efforts.includes(effort) ? { effort } : {}), ...(fast && canFast ? { fast: true } : {}), ...(prompt.trim() ? { prompt: prompt.trim() } : {}) })}
      >
        启动
      </button>
      <p className="agent-launch-menu-hint">权限与参数在智能体设置中修改</p>
    </div>
  );
}
