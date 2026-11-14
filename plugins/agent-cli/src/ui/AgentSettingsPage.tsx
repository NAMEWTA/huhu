import { Button, ChoiceSwitch } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENT_CATALOG, entryOf, isEnabled, renderCommandLine, type AgentCatalogEntry, type AgentSettingsEntry, type AgentSettingsFile } from "../shared/index.js";
import { AgentIcon } from "./AgentIcon.js";

interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
  skipped?: true;
  path?: string;
  version?: string;
  via?: "path" | "installDir" | "override";
  detectedAt: string;
}
interface Resolved {
  command: string;
  argv: string[];
  env: Record<string, string>;
  warnings: string[];
  unsupported?: "headless";
}

const VIA: Record<string, string> = { path: "PATH", installDir: "安装目录", override: "命令覆盖" };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

/** 智能体设置页（agent-cli 插件）：检测结果、每个智能体的启用 / 默认 / 命令 / 模型 / Effort / 参数 / 环境，以及完整命令行预览。复刻 Orca 的“已安装”区。 */
export function AgentSettingsPage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const loaded = useCapability<{ settings: AgentSettingsFile; warning?: string }>("agent.settings.get", {});
  const detected = useCapability<Detected[]>("agent.catalog.detect", {});
  const core = useCapability<{ state: string; version: string | null; error?: string }>("agent.core.status", {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const refetch = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });

  async function call<T>(cap: string, input: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refetch();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refetch(); // 版本冲突时重新读取
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (loaded.isError)
    return (
      <div role="alert" className="hu-field-error">
        {loaded.error instanceof Error ? loaded.error.message : String(loaded.error)}
      </div>
    );
  if (!loaded.data) return <p>…</p>;
  const settings = loaded.data.settings;
  const save = (next: { defaultAgent: AgentSettingsFile["defaultAgent"]; agents: AgentSettingsFile["agents"]; waitingTasks?: boolean }) =>
    call("agent.settings.update", { expectedRevision: settings.revision, waitingTasks: settings.waitingTasks, ...next });
  const commit = (id: string, patch: AgentSettingsEntry) => save({ defaultAgent: settings.defaultAgent, agents: { ...settings.agents, [id]: { ...entryOf(settings, id), ...patch } } });
  const found = (detected.data ?? []).filter((d) => d.installed);
  const checkedAt = detected.data?.[0]?.detectedAt;
  const enabledEntries = AGENT_CATALOG.filter((e) => isEnabled(settings, e.id));

  return (
    <div data-testid="agent-settings">
      {error ? (
        <div role="alert" className="hu-field-error">
          {error}
        </div>
      ) : null}
      {loaded.data.warning ? (
        <div role="status" className="hu-callout">
          {loaded.data.warning}
        </div>
      ) : null}
      <section className="hu-settings-section hu-card-alt" data-testid="agent-core-row">
        <div className="row">
          <div className="grow">
            <strong>Herdr Core</strong>
            <p className="hu-hint-text">托管终端的后台进程。</p>
          </div>
          <span className="small muted">{core.data?.state === "connected" ? `${core.data.version ?? ""} 已连接` : (core.data?.error ?? "未连接")}</span>
          {confirmRestart ? (
            <>
              <span className="small">运行中的终端会保留。</span>
              <Button variant="primary" disabled={busy} data-testid="agent-core-restart-yes" onClick={() => void call("agent.core.restart", {}).then(() => setConfirmRestart(false))}>
                确认重启
              </Button>
              <Button onClick={() => setConfirmRestart(false)}>取消</Button>
            </>
          ) : (
            <Button disabled={busy} data-testid="agent-core-restart" onClick={() => setConfirmRestart(true)}>
              重启 Core
            </Button>
          )}
        </div>
      </section>
      <section className="hu-settings-section hu-card-alt">
        <div className="row">
          <div className="grow">
            <h2>已安装</h2>
            <p className="hu-hint-text" data-testid="agent-detect-summary">
              {found.length} 个已检测{checkedAt ? ` · 检测于 ${hhmm(checkedAt)}` : ""}
            </p>
          </div>
          <Button icon={RefreshCw} disabled={busy} data-testid="agent-redetect" onClick={() => void call("agent.catalog.detect", { refresh: true })}>
            刷新
          </Button>
        </div>
        <label className="hu-setting-row">
          <div>
            <strong>默认智能体</strong>
            <p>新建菜单里排第一，Ctrl+T 之外的快速启动也用它。</p>
          </div>
          <select
            aria-label="默认智能体"
            data-testid="agent-default"
            value={settings.defaultAgent ?? ""}
            disabled={busy}
            onChange={(e) => void save({ defaultAgent: (e.target.value || null) as AgentSettingsFile["defaultAgent"], agents: settings.agents })}
          >
            <option value="">自动（第一个可用）</option>
            {enabledEntries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="hu-setting-row">
          <div>
            <strong>独立会话等人工时建任务</strong>
            <p>终端里的程序（需支持 OSC 7501 状态上报）停下来等你批准或回答时，自动建一个任务并追加评论；关闭后只发通知。</p>
          </div>
          <input
            type="checkbox"
            aria-label="独立会话等人工时建任务"
            data-testid="agent-waiting-tasks"
            checked={settings.waitingTasks !== false}
            disabled={busy}
            onChange={(e) => void save({ defaultAgent: settings.defaultAgent, agents: settings.agents, waitingTasks: e.target.checked })}
          />
        </label>
        <div className="agent-rows">
          {AGENT_CATALOG.map((e) => (
            <AgentRow
              key={e.id}
              entry={e}
              det={detected.data?.find((d) => d.id === e.id)}
              user={entryOf(settings, e.id)}
              enabled={isEnabled(settings, e.id)}
              isDefault={settings.defaultAgent === e.id}
              open={open === e.id}
              busy={busy}
              onToggleOpen={() => setOpen(open === e.id ? null : e.id)}
              onCommit={(patch) => void commit(e.id, patch)}
              preview={(draft, mode) => engine.call<Resolved>("agent.launch.resolve", { agentId: e.id, mode, draft, preview: true })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentRow({
  entry,
  det,
  user,
  enabled,
  isDefault,
  open,
  busy,
  onToggleOpen,
  onCommit,
  preview,
}: {
  entry: AgentCatalogEntry;
  det: Detected | undefined;
  user: AgentSettingsEntry;
  enabled: boolean;
  isDefault: boolean;
  open: boolean;
  busy: boolean;
  onToggleOpen(): void;
  onCommit(patch: AgentSettingsEntry): void;
  preview(draft: AgentSettingsEntry, mode: "interactive" | "headless"): Promise<Resolved>;
}) {
  const [cmd, setCmd] = useState(user.command ?? "");
  useEffect(() => setCmd(user.command ?? ""), [user.command]);
  const [argInput, setArgInput] = useState("");
  const [envKey, setEnvKey] = useState("");
  const [envVal, setEnvVal] = useState("");
  const draft: AgentSettingsEntry = { ...user, enabled, ...(cmd.trim() ? { command: cmd } : { command: "" }) };
  const [line, setLine] = useState<{ interactive: Resolved | null; headless: Resolved | null }>({ interactive: null, headless: null });
  const key = JSON.stringify(draft);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void Promise.all([preview(draft, "interactive").catch(() => null), preview(draft, "headless").catch(() => null)]).then(([interactive, headless]) => live && setLine({ interactive, headless }));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const models = entry.options.models ?? [];
  const model = models.find((m) => m.id === user.model);
  const efforts = model ? model.efforts : [...new Set(models.flatMap((m) => m.efforts))];
  const canFast = entry.options.fast !== undefined && (model ? model.fast : models.some((m) => m.fast));
  const args = user.args ?? entry.fullAccessArgs;
  const customArgs = JSON.stringify(args) !== JSON.stringify(entry.fullAccessArgs);
  const env = Object.entries(user.env ?? {});
  const status = !enabled ? "已停用" : det?.installed ? `${det.version ?? "已检测"}${det.via ? ` · ${VIA[det.via]}` : ""}` : "未检测到";
  const text = (r: Resolved | null) => (r ? renderCommandLine(r) : "…");

  return (
    <article className={`agent-row${enabled ? "" : " off"}`} data-testid="agent-provider-row" data-provider={entry.id}>
      <header className="agent-row-head">
        <button type="button" className="agent-row-main" aria-expanded={open} onClick={onToggleOpen}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          <AgentIcon id={entry.id} size={20} name={entry.displayName} />
          <span className="agent-row-title">
            <strong>
              {entry.displayName}
              {isDefault ? <span className="agent-launch-menu-tag">默认</span> : null}
            </strong>
            <code data-testid="agent-command-preview">{text(line.interactive)}</code>
          </span>
        </button>
        <span className="small muted" title={det?.path}>
          {status}
        </span>
        <a className="icon-link" href={entry.homepage} target="_blank" rel="noreferrer" aria-label={`${entry.displayName} 文档`}>
          <ExternalLink size={14} aria-hidden />
        </a>
        <ChoiceSwitch checked={enabled} disabled={busy} label={`${enabled ? "停用" : "启用"} ${entry.displayName}`} onChange={(on) => onCommit({ enabled: on })} />
      </header>
      {open ? (
        <div className="agent-row-body hu-form-body">
          <label>
            命令
            <input
              aria-label={`${entry.displayName} 命令`}
              className="hu-input"
              placeholder={entry.launch.command}
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onBlur={() => cmd.trim() !== (user.command ?? "") && onCommit({ command: cmd.trim() })}
            />
            <span className="hu-hint-text">单个可执行文件（名字或绝对路径），不含参数。</span>
          </label>
          {models.length > 0 ? (
            <label>
              模型
              <select aria-label={`${entry.displayName} 模型`} value={user.model ?? ""} disabled={busy} onChange={(e) => onCommit({ model: e.target.value })}>
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
              <select aria-label={`${entry.displayName} Effort`} value={user.effort ?? ""} disabled={busy} onChange={(e) => onCommit({ effort: e.target.value })}>
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
              <input type="checkbox" checked={user.fast === true} disabled={busy} onChange={(e) => onCommit({ fast: e.target.checked })} /> 速度：Fast
            </label>
          ) : null}
          <div>
            <strong>权限</strong> <span data-testid="agent-permission">{customArgs ? "自定义（参数已修改）" : entry.fullAccessArgs.length > 0 ? "完全访问" : "无额外权限参数"}</span>
          </div>
          <div>
            参数
            <div className="agent-chips">
              {args.map((a, i) => (
                <span key={`${a}-${i}`} className="agent-chip">
                  <code>{a}</code>
                  <button type="button" aria-label={`删除参数 ${a}`} onClick={() => onCommit({ args: args.filter((_, j) => j !== i) })}>
                    <X size={11} aria-hidden />
                  </button>
                </span>
              ))}
              <input
                aria-label={`${entry.displayName} 添加参数`}
                className="hu-input agent-chip-input"
                placeholder="添加参数，回车确认"
                value={argInput}
                onChange={(e) => setArgInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && argInput.trim()) {
                    e.preventDefault();
                    onCommit({ args: [...args, argInput.trim()] });
                    setArgInput("");
                  }
                }}
              />
            </div>
            {customArgs ? (
              <Button variant="ghost" data-testid="agent-args-reset" onClick={() => onCommit({ args: undefined as unknown as string[] })}>
                恢复默认
              </Button>
            ) : null}
          </div>
          <div>
            环境
            {env.map(([k, v]) => (
              <div key={k} className="row">
                <code>{k}</code>=<code>{"•".repeat(Math.min(v.length, 8))}</code>
                <button type="button" aria-label={`删除环境变量 ${k}`} onClick={() => onCommit({ env: Object.fromEntries(env.filter(([x]) => x !== k)) })}>
                  <X size={11} aria-hidden />
                </button>
              </div>
            ))}
            <div className="row">
              <input aria-label="环境变量名" className="hu-input" placeholder="KEY" value={envKey} onChange={(e) => setEnvKey(e.target.value)} />
              <input aria-label="环境变量值" className="hu-input" placeholder="VALUE" value={envVal} onChange={(e) => setEnvVal(e.target.value)} />
              <Button
                disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)}
                onClick={() => {
                  onCommit({ env: { ...user.env, [envKey]: envVal } });
                  setEnvKey("");
                  setEnvVal("");
                }}
              >
                添加
              </Button>
            </div>
            <span className="hu-hint-text">明文保存在本机 Vault，不参与同步；密钥请放在保险箱。</span>
          </div>
          <div data-testid="agent-effective">
            <strong>有效命令行</strong>
            <pre className="agent-effective-line">交互：{text(line.interactive)}</pre>
            <pre className="agent-effective-line">无界面：{line.headless?.unsupported ? "不支持" : text(line.headless)}</pre>
            {[...(line.interactive?.warnings ?? []), ...(line.headless?.warnings ?? [])].map((w, i) => (
              <p key={i} className="hu-field-error">
                {w}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
