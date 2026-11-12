import { LaunchPanel, type LaunchOptions, type ModelOption } from "./LaunchPanel.js";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, TerminalView } from "@huhu/ui";
import { ChevronDown, Folder, FolderOpen, History, Plus } from "lucide-react";
import { CapabilityError, host, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { HistoryPanel } from "./history/HistoryPanel.js";
import { ReviewPanel } from "./ReviewPanel.js";
import { SplitView } from "./SplitView.js";
import { choose, fillCells, reveal, type Layout, type SplitState } from "./split-layout.js";
import { t } from "./i18n.js";

interface Space {
  id: string;
  name: string;
  root: string;
  revision: number;
}
interface Session {
  id: string;
  spaceId: string;
  provider: string;
  name: string;
  state: string;
  terminalId: string | null;
  exitCode?: number | null;
  error?: string;
}
interface Provider {
  provider: string;
  displayName: string;
  status: string;
  models?: ModelOption[];
}

export function AgentCliModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [spaceForm, setSpaceForm] = useState<{ name: string; folder: string } | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true); // 原型：会话历史在桌面宽度下常驻右侧
  const [showReview, setShowReview] = useState(false);
  const [layout, setLayoutState] = useState<Layout>(() => {
    try {
      const v = Number(localStorage.getItem("huhu.agentcli.layout"));
      return v === 2 || v === 4 ? v : 1;
    } catch {
      return 1;
    }
  });
  const [split, setSplit] = useState<SplitState>({ picks: [], hidden: [] }); // 用户的选择；显示哪些由 fillCells 每次现算（会话结束、切换 Space、新建会话都自动跟上）
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      localStorage.setItem("huhu.agentcli.layout", String(l));
    } catch {
      /* 仅个人偏好，存不了就算了 */
    }
  };
  const [error, setError] = useState<string | null>(null);
  const space = (spaces.data ?? []).find((s) => s.id === spaceId) ?? spaces.data?.[0] ?? null;
  const sessions = useCapability<Session[]>("agent.sessions.list", space ? { spaceId: space.id } : {});
  const providers = useCapability<Provider[]>("agent.providers.detect", {});
  const core = useCapability<{ state: string; version: string | null }>("agent.core.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });

  async function launch(provider: string, o: LaunchOptions = {}) {
    if (!space) return;
    setError(null);
    try {
      const s = await engine.call<Session>("agent.sessions.launch", { spaceId: space.id, spaceRevision: space.revision, provider, ...o, requestId: crypto.randomUUID() }, { write: true });
      setActive(s.id);
      setMenu(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function act(cap: string, id: string) {
    setError(null);
    try {
      await engine.call(cap, { id }, { write: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const [chosen, setChosen] = useState<string | null>(null);
  const chosenProvider = (providers.data ?? []).find((p) => p.provider === chosen) ?? null;
  const list = sessions.data ?? [];
  // 有会话在运行时每 5 秒刷新一次列表：程序结束后徽标会自己变成“已结束”
  const anyRunning = list.some((s) => s.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.sessions.list" }), 5000);
    return () => clearInterval(id);
  }, [anyRunning, engine.vaultId, qc]);
  const cur = list.find((s) => s.id === active) ?? null;
  const shown = layout === 1 ? [] : fillCells(layout, split.picks, list, active, split.hidden);
  const stateBadge = (s: Session) => <Badge tone={s.state === "running" ? "success" : s.state === "exited" ? "neutral" : "danger"}>{s.state === "running" ? t.running : s.state === "exited" ? t.exited : t.failed}</Badge>;
  return (
    <div className={`module-layout v9-agent-layout${showHistory ? " history-open" : ""}`} data-testid="agent-cli-module" style={showHistory && space ? undefined : { gridTemplateColumns: "224px minmax(300px, 1fr)" }}>
      <aside className="v9-spaces" aria-label={t.spaces}>
        <div className="v9-sidebar-head">
          <span>Spaces</span>
          <IconButton icon={Plus} label="新建 Space" onClick={() => setSpaceForm({ name: "", folder: "" })} />
        </div>
        <div className="v9-vault-caption">
          <Folder size={13} aria-hidden /> {t.spaces}
        </div>
        <div className="v9-space-list">
          {(spaces.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`v9-space-item${space?.id === s.id ? " active" : ""}`}
              aria-pressed={space?.id === s.id}
              title={s.root}
              onClick={() => {
                setSpaceId(s.id);
                setActive(null);
                setSplit({ picks: [], hidden: [] });
              }}
            >
              <FolderOpen size={17} aria-hidden />
              <span>
                <strong>{s.name}</strong>
                <small title={s.root}>{s.root}</small>
              </span>
              <span className="v9-count">{space?.id === s.id ? list.length : ""}</span>
            </button>
          ))}
        </div>
        <button type="button" className="v9-create-space" data-testid="space-new" onClick={() => setSpaceForm({ name: "", folder: "" })}>
          <Plus size={14} aria-hidden />
          新建 Space
        </button>
        <div className="v9-core-note" data-testid="core-status">
          <span className="status-dot" />
          {t.coreStatus} · {core.data?.state === "connected" ? `${core.data.version} ${t.connected}` : t.unavailable}
        </div>
      </aside>
      <section className="v9-session-main">
        <header className="v9-space-header">
          <div>
            <FolderOpen size={16} aria-hidden />
            <strong>{space?.name ?? t.title}</strong>
            <span className="v9-cwd">{space?.root ?? "先选择一个工作目录"}</span>
          </div>
          <button type="button" className="v9-history-toggle" aria-expanded={showHistory} aria-label={showHistory ? t.history.close : t.history.open} data-testid="agent-history-toggle" onClick={() => setShowHistory(!showHistory)}>
            <History size={15} aria-hidden />
          </button>
        </header>
        {error ? (
          <div role="alert" className="callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        <div className="v9-tabs">
          <div className="v9-open-tabs" role="tablist" aria-label={t.sessions}>
            {list.map((s) => (
              <div key={s.id} className={`v9-session-tab${s.id === active ? " active" : ""}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={s.id === active}
                  data-testid="session-tab"
                  onClick={() => {
                    setActive(s.id);
                    if (layout !== 1 && s.state === "running") setSplit(reveal(layout, shown, split, s.id));
                    else if (split.hidden.includes(s.id)) setSplit({ ...split, hidden: split.hidden.filter((h) => h !== s.id) });
                  }}
                >
                  <span className={`v9-provider-mark provider-${s.provider}`}>{s.provider === "shell" ? "›" : s.provider.slice(0, 1).toUpperCase()}</span>
                  {s.name} {stateBadge(s)}
                </button>
              </div>
            ))}
          </div>
          <div className="v9-tab-actions">
            <button type="button" className="v9-add-cli" aria-label={t.newTerminal} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Plus size={17} aria-hidden />
              <ChevronDown size={12} aria-hidden />
            </button>
            <div role="radiogroup" aria-label={t.split.label} className="row">
              {(
                [
                  [1, t.split.single],
                  [2, t.split.two],
                  [4, t.split.four],
                ] as const
              ).map(([l, text]) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={layout === l}
                  className={`v9-subtle-button${layout === l ? " active" : ""}`}
                  data-testid={`layout-${l}`}
                  onClick={() => setLayout(l)}
                  onKeyDown={(e) => {
                    const order: Layout[] = [1, 2, 4];
                    const k = order.indexOf(l);
                    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? order[(k + 1) % 3] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? order[(k + 2) % 3] : undefined;
                    if (to) {
                      e.preventDefault();
                      setLayout(to);
                      document.querySelector<HTMLElement>(`[data-testid="layout-${to}"]`)?.focus();
                    }
                  }}
                  tabIndex={layout === l ? 0 : -1}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </div>
        {menu ? (
          <div className="v9-launcher" style={{ position: "static", flexShrink: 0, minHeight: "min-content", margin: "8px 16px", width: "fit-content", maxWidth: "calc(100% - 32px)" }}>
            {chosenProvider ? (
              <LaunchPanel
                key={chosenProvider.provider}
                label={chosenProvider.displayName}
                models={chosenProvider.models ?? []}
                space={space ? { name: space.name, root: space.root } : null}
                onStart={(o) => void launch(chosenProvider.provider, o).then(() => setChosen(null))}
              />
            ) : null}
            <section role="menu" aria-label={t.newTerminal} className="v9-provider-menu">
              <button type="button" role="menuitem" onClick={() => void launch("shell")}>
                <span className="v9-provider-mark">›</span> {t.newTerminal}（shell）
              </button>
              <div className="v9-menu-divider" />
              <div className="v9-menu-caption">当前 Space · {space?.name ?? "未选择"}</div>
              <div className="v9-menu-folder" title={space?.root}>
                {space?.root ?? "请先创建 Space"}
              </div>
              {(providers.data ?? [])
                .filter((p) => p.status === "found")
                .map((p) => (
                  <button key={p.provider} type="button" role="menuitem" className={chosen === p.provider ? "selected" : ""} aria-haspopup="true" aria-expanded={chosen === p.provider} onClick={() => setChosen(p.provider)}>
                    <span className={`v9-provider-mark provider-${p.provider}`}>{p.displayName.slice(0, 1)}</span>
                    <span>{p.displayName}</span>
                  </button>
                ))}
              {(providers.data ?? []).every((p) => p.status !== "found") ? <p className="v9-small-empty">{t.noProviders}</p> : null}
            </section>
          </div>
        ) : null}
        {list.length === 0 ? (
          <EmptyState icon={FolderOpen} title={space ? "在这个 Space 开始工作" : "创建你的第一个 Space"} hint={space ? "点击顶部 + 选择检测到的 AI CLI，工作目录自动使用当前 Space。" : "Space 绑定一个工作目录，会话和历史按 Space 隔离。"} />
        ) : null}
        {layout !== 1 ? (
          <>
            <div className="row" style={{ padding: "6px 16px" }}>
              <Button aria-expanded={showReview} data-testid="agent-review-toggle" disabled={!cur || cur.state !== "running"} onClick={() => setShowReview(!showReview)}>
                {showReview ? t.review.close : t.review.open}
              </Button>
              <span className="muted small">{t.split.reviewHint}</span>
            </div>
            <SplitView layout={layout} cells={shown} sessions={list} onChange={(i, v) => setSplit(choose(shown, split, i, v))} onAct={(cap, id) => void act(cap, id)} />
          </>
        ) : cur && cur.state === "running" ? (
          <div className="v9-terminal-grid panes-1">
            <section className="v9-terminal-pane" aria-label={cur.name}>
              <div className="v9-terminal-heading">
                <span className={`v9-provider-mark provider-${cur.provider}`}>{cur.provider === "shell" ? "›" : cur.provider.slice(0, 1).toUpperCase()}</span>
                <strong title={cur.name}>{cur.provider === "shell" ? "Shell" : ((providers.data ?? []).find((p) => p.provider === cur.provider)?.displayName ?? cur.provider)}</strong>
                {stateBadge(cur)}
                <span className="grow" />
                <Button onClick={() => void act("agent.sessions.interrupt", cur.id)}>{t.interrupt}</Button>
                <Button variant="danger" onClick={() => void act("agent.sessions.kill", cur.id)}>
                  {t.kill}
                </Button>
                <Button aria-expanded={showReview} data-testid="agent-review-toggle" onClick={() => setShowReview(!showReview)}>
                  {showReview ? t.review.close : t.review.open}
                </Button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <TerminalView key={cur.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={cur.id} ariaLabel={t.terminalLabel} />
              </div>
            </section>
          </div>
        ) : cur ? (
          <EmptyState icon={FolderOpen} title={cur.state === "exited" ? t.exitedTitle(cur.exitCode ?? null) : (cur.error ?? t.failed)} {...(cur.state === "exited" ? { hint: cur.error ?? t.exitedHint } : {})} />
        ) : list.length > 0 ? (
          <EmptyState icon={FolderOpen} title={t.selectSession} />
        ) : null}
        {showReview && cur && space ? <ReviewPanel key={cur.id} spaceId={space.id} sessionId={cur.id} running={cur.state === "running"} provider={cur.provider} /> : null}
        <footer className="v9-main-footer">
          <span>{space ? `${list.length} 个会话 · 当前 Space` : "尚无 Space"}</span>
          <span>关闭标签只分离视图 · 会话记录保留</span>
        </footer>
      </section>
      {spaceForm ? (
        <Dialog
          open
          title="新建 Space"
          description="为 Agent CLI 选择工作目录。这里不会创建或删除磁盘文件。"
          error={spaceError}
          testId="space-dialog"
          onClose={() => (setSpaceForm(null), setSpaceError(null))}
          actions={
            <>
              <Button onClick={() => (setSpaceForm(null), setSpaceError(null))}>取消</Button>
              <Button
                variant="primary"
                icon={Plus}
                disabled={!spaceForm.name.trim() || !spaceForm.folder.trim()}
                data-testid="space-save"
                onClick={() =>
                  void (async () => {
                    setSpaceError(null);
                    try {
                      const created = await engine.call<Space>("agent.spaces.save", { name: spaceForm.name.trim(), root: spaceForm.folder.trim() }, { write: true });
                      setSpaceForm(null);
                      setSpaceId(created.id);
                      setActive(null);
                      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
                    } catch (e) {
                      setSpaceError(e instanceof CapabilityError || e instanceof Error ? e.message : String(e));
                    }
                  })()
                }
              >
                创建 Space
              </Button>
            </>
          }
        >
          <Field label="Space 名称">
            <input aria-label="Space 名称" autoFocus value={spaceForm.name} placeholder="例如：HUHU 开发" onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })} />
          </Field>
          <Field label="工作目录">
            <div className="row">
              <input aria-label="工作目录" className="grow" value={spaceForm.folder} placeholder="/home/you/projects/huhu" onChange={(e) => setSpaceForm({ ...spaceForm, folder: e.target.value })} />
              {host()?.pickOpenPath ? (
                <Button
                  onClick={() =>
                    void host()
                      ?.pickOpenPath("directory")
                      .then((p) => p && setSpaceForm({ ...spaceForm, folder: p, name: spaceForm.name || (p.split(/[\\/]/).filter(Boolean).at(-1) ?? "") }))
                  }
                >
                  选择…
                </Button>
              ) : null}
            </div>
          </Field>
          <p className="hint-text">当前 Space 新建的每个 CLI 都使用这个目录。</p>
        </Dialog>
      ) : null}
      {showHistory && space ? (
        <aside className="v9-history" aria-label="当前 Space 会话历史">
          <HistoryPanel
            key={space.id} // 切换 Space 时历史面板重新挂载：搜索框与筛选被清空（ACC-AG-05）
            space={space}
            installed={new Set((providers.data ?? []).filter((p) => p.status === "found").map((p) => p.provider))}
            onResumed={(id) => {
              setActive(id);
            }}
          />
        </aside>
      ) : null}
    </div>
  );
}
