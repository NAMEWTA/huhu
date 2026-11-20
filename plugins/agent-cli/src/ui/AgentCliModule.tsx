import { LaunchMenu, type LaunchOptions } from "./LaunchMenu.js";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, TerminalView } from "@huhu/ui";
import { ChevronDown, Folder, FolderOpen, History, Pencil, Plus, Trash2 } from "lucide-react";
import { CapabilityError, createRequestId, host, onOpenAgentSessionRequest, queryKey, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { emptyAgentSettings, type AgentSettingsFile } from "../shared/index.js";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { HistoryPanel } from "./history/HistoryPanel.js";
import { ReviewPanel } from "./ReviewPanel.js";
import { WorkspaceCanvas, type WorkspaceSession as Session } from "./WorkspaceCanvas.js";
import { leaves, removePane, replacePane, splitPane, type PaneLeaf, type SpaceLayout, type SplitDirection, type WorkspaceView } from "../shared/workspace-layout.js";
import { t } from "./i18n.js";

interface Space {
  id: string;
  name: string;
  root: string;
  revision: number;
}
interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
}

type LaunchTarget = { kind: "tab" } | { kind: "leaf"; tab: string; leaf: string; direction?: SplitDirection };
interface LaunchIntent {
  space: Space;
  view: WorkspaceView;
  target: LaunchTarget;
  navigation: number;
  id: string;
  trigger?: HTMLButtonElement;
  position?: CSSProperties;
}
type ViewSelection = { tab: string; leaf: string; zoom: string | null };

function addSession(layout: SpaceLayout, target: LaunchTarget, sessionId: string): { layout: SpaceLayout; tab: string; leaf: string } {
  const opened: PaneLeaf = { kind: "leaf", id: createRequestId(), sessionId };
  if (target.kind === "tab") {
    const tab = createRequestId();
    return { tab, leaf: opened.id, layout: { tabs: [...layout.tabs, { id: tab, pane: opened }] } };
  }
  const { tab, leaf, direction } = target;
  return {
    tab,
    leaf: direction ? opened.id : leaf,
    layout: {
      tabs: layout.tabs.map((item) => {
        if (item.id !== tab) return item;
        const pane = direction ? splitPane(item.pane, leaf, direction, createRequestId(), opened) : replacePane(item.pane, leaf, (current) => (current.kind === "leaf" && !current.sessionId ? { ...current, sessionId } : current));
        return { ...item, pane };
      }),
    },
  };
}

export function AgentCliModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [requestedSession, setRequestedSession] = useState<{ spaceId: string; sessionId: string } | null>(null);
  const [menu, setMenu] = useState<LaunchIntent | null>(null);
  const launcher = useRef<HTMLDivElement>(null);
  const [selections, setSelections] = useState<Record<string, ViewSelection | null>>({});
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ view: WorkspaceView; tab: string; leaf: string; session: Session; navigation: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const navigation = useRef(0);
  const [spaceForm, setSpaceForm] = useState<{ id?: string; revision?: number; name: string; folder: string } | null>(null);
  const [spaceDelete, setSpaceDelete] = useState<Space | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true); // 原型：会话历史在桌面宽度下常驻右侧
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const space = (spaces.data ?? []).find((s) => s.id === spaceId) ?? spaces.data?.[0] ?? null;
  const sessions = useCapability<Session[]>("agent.sessions.list", { spaceId: space?.id }, { enabled: Boolean(space) });
  const workspace = useCapability<WorkspaceView>("agent.workspace.get", { spaceId: space?.id }, { enabled: Boolean(space) });
  const detected = useCapability<Detected[]>("agent.catalog.detect", {});
  const agentSettings = useCapability<{ settings: AgentSettingsFile }>("agent.settings.get", {});
  const core = useCapability<{ state: string; version: string | null }>("agent.core.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });
  const view = workspace.data;
  const inSpace = space ? selections[space.id] : null;
  const tab = view?.layout.tabs.find(({ id }) => id === inSpace?.tab) ?? view?.layout.tabs.find(({ pane }) => leaves(pane).some(({ sessionId }) => sessionId !== null)) ?? view?.layout.tabs[0];
  const openLeaves = tab ? leaves(tab.pane) : [];
  const currentLeaf = openLeaves.find(({ id }) => id === inSpace?.leaf) ?? openLeaves[0];
  const zoom = openLeaves.find(({ id }) => id === inSpace?.zoom)?.id ?? null;
  const editable = Boolean(view?.writable && !busy && !workspace.isFetching && !workspace.isError);

  useLayoutEffect(() => {
    if (!focusTarget) return;
    const pane = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(focusTarget)}"]`);
    if (pane) {
      (pane.querySelector<HTMLElement>(".xterm-helper-textarea") ?? pane).focus();
      setFocusTarget(null);
    }
  }, [focusTarget, tab]);

  const dismissMenu = (restore = true) => {
    setMenu(null);
    if (restore && menu?.trigger?.isConnected) menu.trigger.focus();
  };
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || launcher.current?.contains(event.target) || menu.trigger?.contains(event.target)) return;
      setMenu(null);
      if (menu.trigger?.isConnected) menu.trigger.focus();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);

  useEffect(
    () =>
      onOpenAgentSessionRequest((request) => {
        if (request.vaultId !== engine.vaultId) return;
        ++navigation.current;
        setRequestedSession(request);
        setSpaceId(request.spaceId);
        setMenu(null);
        setError(null);
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.sessions.list" });
      }),
    [engine.vaultId, qc],
  );

  useEffect(() => {
    if (!requestedSession || spaces.isFetching || !spaces.data) return;
    if (!spaces.data.some(({ id }) => id === requestedSession.spaceId)) {
      setError("原会话的工作区已不可用");
      setRequestedSession(null);
      return;
    }
    if (space?.id !== requestedSession.spaceId || sessions.isFetching || !sessions.isFetched || (!workspace.isFetched && !workspace.isError)) return;
    const session = sessions.data?.find(({ id }) => id === requestedSession.sessionId);
    if (!session) setError("未找到原会话。可以重连后从任务重试定位。");
    else {
      setActive(session.id);
      const owner = view?.layout.tabs.find((item) => leaves(item.pane).some(({ sessionId }) => sessionId === session.id));
      const leaf = owner && leaves(owner.pane).find(({ sessionId }) => sessionId === session.id);
      if (owner && leaf) setSelections((previous) => ({ ...previous, [space.id]: { tab: owner.id, leaf: leaf.id, zoom: null } }));
    }
    setRequestedSession(null);
  }, [requestedSession, spaces.data, spaces.isFetching, space?.id, sessions.data, sessions.isFetched, sessions.isFetching, view, workspace.isFetched, workspace.isError]);

  async function saveWorkspace(basis: WorkspaceView, layout: SpaceLayout) {
    const key = queryKey(engine.vaultId, "agent.workspace.get", { spaceId: basis.spaceId });
    try {
      const saved = await engine.call<WorkspaceView>("agent.workspace.save", { spaceId: basis.spaceId, baseVersion: basis.version, layout }, { write: true });
      await qc.cancelQueries({ queryKey: key, exact: true });
      qc.setQueryData<WorkspaceView>(key, (previous) => (previous && previous.version > saved.version ? previous : saved));
      return saved;
    } finally {
      void qc.invalidateQueries({ queryKey: key, exact: true });
    }
  }

  function startTarget(target: LaunchTarget, event?: MouseEvent<HTMLButtonElement>): LaunchIntent | null {
    if (!space || !view || !editable || working.current) return null;
    const intent: LaunchIntent = { space, view, target, navigation: navigation.current, id: createRequestId() };
    if (!event) return intent;
    const trigger = event.currentTarget;
    const bounds = trigger.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom;
    const flip = below < Math.min(360, window.innerHeight / 2) && bounds.top > below;
    const position = {
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 608)),
      maxHeight: Math.max(96, (flip ? bounds.top : below) - 16),
      ...(flip ? { bottom: below + bounds.height + 8 } : { top: bounds.bottom + 8 }),
    };
    return { ...intent, trigger, position };
  }

  async function launch(intent: LaunchIntent, provider: string, o: LaunchOptions = {}) {
    if (working.current) return;
    const stay = () => navigation.current === intent.navigation;
    working.current = true;
    setBusy(true);
    setMenu(null);
    setError(null);
    let opened: Session | undefined;
    try {
      opened = await engine.call<Session>("agent.sessions.launch", { spaceId: intent.space.id, spaceRevision: intent.space.revision, provider, ...o, requestId: intent.id }, { write: true });
      const next = addSession(intent.view.layout, intent.target, opened.id);
      await saveWorkspace(intent.view, next.layout);
      if (stay()) {
        setSelections((previous) => ({ ...previous, [intent.space.id]: { tab: next.tab, leaf: next.leaf, zoom: null } }));
        setActive(opened.id);
        setFocusTarget(next.leaf);
      }
    } catch (e) {
      if (stay()) {
        if (opened) setActive(opened.id);
        setError(opened ? "会话已启动，布局未能更新。可从当前 Space 的 Agents 列表打开。" : e instanceof Error ? e.message : String(e));
      }
    } finally {
      working.current = false;
      setBusy(false);
      void refresh();
    }
  }
  // Ctrl+T（macOS ⌘T）：新建普通终端。只在本模块激活时生效；终端获得焦点时不拦截（Claude Code 的 TUI 自己用 Ctrl+T）
  const newShell = useRef<() => void>(() => undefined);
  newShell.current = () => {
    const intent = startTarget({ kind: "tab" });
    if (intent) void launch(intent, "shell");
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "t") return;
      if (e.target instanceof Element && e.target.closest(".xterm")) return;
      e.preventDefault();
      newShell.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function act(cap: string, id: string) {
    setError(null);
    try {
      await engine.call(cap, { id }, { write: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const list = sessions.data ?? [];
  // 有会话在运行时每 5 秒刷新一次列表：程序结束后徽标会自己变成“已结束”
  const anyRunning = list.some((s) => s.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.sessions.list" }), 5000);
    return () => clearInterval(id);
  }, [anyRunning, engine.vaultId, qc]);
  const currentSession = active ?? currentLeaf?.sessionId;
  const cur = list.find((s) => s.id === currentSession) ?? null;
  const preview = cur && !view?.layout.tabs.some(({ pane }) => leaves(pane).some(({ sessionId }) => sessionId === cur.id)) ? cur : null;
  const stateBadge = (s: Session) => <Badge tone={s.state === "running" ? "success" : s.state === "exited" ? "neutral" : "danger"}>{s.state === "running" ? t.running : s.state === "exited" ? t.exited : t.failed}</Badge>;

  function tabFocus(tabId: string, leafId: string, sessionId: string | null, zoomId: string | null = null) {
    if (!space) return;
    setSelections((previous) => {
      const remembered = previous[space.id];
      if (remembered?.tab === tabId && remembered.leaf === leafId && remembered.zoom === zoomId) return previous;
      return { ...previous, [space.id]: { tab: tabId, leaf: leafId, zoom: zoomId } };
    });
    setActive(sessionId);
  }

  async function edit(basis: WorkspaceView, next: SpaceLayout, focus?: { tab: string; leaf: PaneLeaf } | null, kill?: Session) {
    if (working.current) return;
    const generation = navigation.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (kill) {
        const actual = await engine.call<WorkspaceView>("agent.workspace.get", { spaceId: basis.spaceId });
        if (actual.version !== basis.version) throw new Error("分栏已更新。请重新选择要关闭的会话。");
        await engine.call("agent.sessions.kill", { id: kill.id }, { write: true });
        let done = false;
        for (let i = 0; i < 12 && !done; i++) {
          const sessions = await engine.call<Session[]>("agent.sessions.list", { spaceId: basis.spaceId });
          done = sessions.find(({ id }) => id === kill.id)?.state === "exited";
          if (!done) await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!done) throw new Error("尚未核实终端已退出，原分栏仍可查看。");
      }
      await saveWorkspace(basis, next);
      if (navigation.current === generation && focus !== undefined) {
        setActive(focus?.leaf.sessionId ?? null);
        setSelections((previous) => ({ ...previous, [basis.spaceId]: focus ? { tab: focus.tab, leaf: focus.leaf.id, zoom: null } : null }));
        setFocusTarget(focus?.leaf.id ?? null);
      }
    } catch (e) {
      if (navigation.current === generation) setError(e instanceof Error ? e.message : String(e));
    } finally {
      working.current = false;
      setBusy(false);
      setClosing(null);
      void refresh();
    }
  }

  function closePane(basis: WorkspaceView, tabId: string, leafId: string, kill?: Session) {
    const tabs = basis.layout.tabs.flatMap((entry) => {
      if (entry.id !== tabId) return [entry];
      const pane = removePane(entry.pane, leafId);
      return pane ? [{ ...entry, pane }] : [];
    });
    const nextTab = tabs.find(({ id }) => id === tabId) ?? tabs[0];
    const nextLeaf = nextTab && leaves(nextTab.pane)[0];
    return edit(basis, { tabs }, nextLeaf && nextTab ? { tab: nextTab.id, leaf: nextLeaf } : null, kill);
  }

  function openExisting(session: Session) {
    ++navigation.current;
    setShowReview(false);
    dismissMenu(false);
    setActive(session.id);
    const owner = view?.layout.tabs.find(({ pane }) => leaves(pane).some(({ sessionId }) => sessionId === session.id));
    const leaf = owner && leaves(owner.pane).find(({ sessionId }) => sessionId === session.id);
    if (owner && leaf) tabFocus(owner.id, leaf.id, session.id);
  }

  return (
    <div className={`hu-module-layout agent-layout${showHistory && space ? " agent-history-open" : ""}`} data-testid="agent-cli-module">
      <aside className="agent-spaces" aria-label={t.spaces}>
        <div className="agent-sidebar-head">
          <span>Spaces</span>
          <span className="row">
            {space ? <IconButton icon={Pencil} label="编辑 Space" data-testid="space-edit" onClick={() => setSpaceForm({ id: space.id, revision: space.revision, name: space.name, folder: space.root })} /> : null}
            {space ? <IconButton icon={Trash2} label="删除 Space" data-testid="space-delete" onClick={() => setSpaceDelete(space)} /> : null}
            <IconButton icon={Plus} label="新建 Space" onClick={() => setSpaceForm({ name: "", folder: "" })} />
          </span>
        </div>
        <div className="agent-vault-caption">
          <Folder size={13} aria-hidden /> {t.spaces}
        </div>
        <div className="agent-space-list">
          {(spaces.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`agent-space-item${space?.id === s.id ? " active" : ""}`}
              data-testid="agent-space-item"
              aria-pressed={space?.id === s.id}
              title={s.root}
              onClick={() => {
                ++navigation.current;
                setSpaceId(s.id);
                setActive(null);
                setRequestedSession(null);
                setClosing(null);
                dismissMenu(false);
                setError(null);
              }}
            >
              <FolderOpen size={17} aria-hidden />
              <span>
                <strong>{s.name}</strong>
                <small title={s.root}>{s.root}</small>
              </span>
              <span className="agent-count">{space?.id === s.id ? list.length : ""}</span>
            </button>
          ))}
        </div>
        <button type="button" className="agent-create-space" data-testid="space-new" onClick={() => setSpaceForm({ name: "", folder: "" })}>
          <Plus size={14} aria-hidden />
          新建 Space
        </button>
        <div className="hu-v9-core-note" data-testid="core-status">
          <span className="shell-status-dot" />
          {t.coreStatus} · {core.data?.state === "connected" ? `${core.data.version} ${t.connected}` : t.unavailable}
        </div>
      </aside>
      <section className="hu-v9-session-main">
        <header className="agent-space-header">
          <div>
            <FolderOpen size={16} aria-hidden />
            <strong>{space?.name ?? t.title}</strong>
            <span className="agent-cwd">{space?.root ?? "先选择一个工作目录"}</span>
          </div>
          <button type="button" className="agent-history-toggle" aria-expanded={showHistory} aria-label={showHistory ? t.history.close : t.history.open} data-testid="agent-history-toggle" onClick={() => setShowHistory(!showHistory)}>
            <History size={15} aria-hidden />
          </button>
        </header>
        {error ? (
          <div role="alert" className="hu-callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        <div className="agent-tabs">
          <div className="agent-open-tabs" role="tablist" aria-label="Agents">
            {list.map((s) => (
              <div key={s.id} className={`agent-session-tab${s.id === currentSession ? " active" : ""}`}>
                <button type="button" role="tab" aria-selected={s.id === currentSession} data-testid="session-tab" onClick={() => openExisting(s)}>
                  <span className={`agent-provider-mark provider-${s.provider}`}>{s.provider === "shell" ? "›" : s.provider.slice(0, 1).toUpperCase()}</span>
                  {s.name} {stateBadge(s)}
                  {s.waiting?.active ? (
                    <Badge tone="warning" data-testid="session-waiting">
                      {t.needsYou}
                    </Badge>
                  ) : null}
                </button>
              </div>
            ))}
          </div>
          <div className="agent-tab-actions">
            <button
              type="button"
              className="agent-add-cli"
              aria-label={t.newTerminal}
              disabled={!editable}
              aria-expanded={menu?.target.kind === "tab"}
              onClick={(event) => (menu?.target.kind === "tab" ? dismissMenu() : setMenu(startTarget({ kind: "tab" }, event)))}
            >
              <Plus size={17} aria-hidden />
              <ChevronDown size={12} aria-hidden />
            </button>
          </div>
        </div>
        {menu ? (
          <div className="agent-launcher agent-workspace-launcher" ref={launcher} style={menu.position}>
            <LaunchMenu
              detected={detected.data ?? []}
              settings={agentSettings.data?.settings ?? emptyAgentSettings()}
              noSpace={false}
              onLaunch={(provider, options) => void launch(menu, provider, options)}
              onOpenSettings={() => (dismissMenu(false), onNavigate?.("settings", "agent-cli"))}
              onClose={() => dismissMenu()}
            />
          </div>
        ) : null}
        <div className="agent-workspace-tabs" role="group" aria-label="工作区标签">
          {view?.layout.tabs.map((entry, index) => {
            const first = leaves(entry.pane)[0]!;
            const name = list.find(({ id }) => id === first.sessionId)?.name;
            return (
              <Button
                key={entry.id}
                aria-pressed={entry.id === tab?.id && !preview}
                data-testid="workspace-tab"
                onClick={() => {
                  ++navigation.current;
                  dismissMenu(false);
                  setShowReview(false);
                  tabFocus(entry.id, first.id, first.sessionId);
                }}
              >
                {name ?? `标签 ${index + 1}`}
              </Button>
            );
          })}
        </div>
        {workspace.isError ? (
          <div role="alert" className="hu-callout danger">
            <p>{workspace.error?.message ?? "工作区布局当前无法读取"}</p>
            <Button onClick={() => void workspace.refetch()}>重试</Button>
          </div>
        ) : null}
        {preview ? (
          <div className="agent-workspace-preview" data-testid="workspace-session-preview">
            <div className="agent-workspace-pane-header">
              <strong>{preview.name}</strong>
              {stateBadge(preview)}
              <Button
                disabled={!editable}
                onClick={() => {
                  if (!view) return;
                  const next = addSession(view.layout, { kind: "tab" }, preview.id);
                  const assigned = next.layout.tabs.at(-1)!;
                  void edit(view, next.layout, { tab: next.tab, leaf: leaves(assigned.pane)[0]! });
                }}
              >
                放入新标签
              </Button>
              {preview.state === "running" ? (
                <Button aria-expanded={showReview} data-testid="agent-review-toggle" onClick={() => setShowReview(!showReview)}>
                  {showReview ? t.review.close : t.review.open}
                </Button>
              ) : null}
            </div>
            {preview.state === "running" ? (
              <div className="agent-workspace-pane-body">
                <TerminalView key={preview.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={preview.id} ariaLabel={t.terminalLabel} />
              </div>
            ) : (
              <EmptyState icon={FolderOpen} title={preview.state === "exited" ? t.exitedTitle(preview.exitCode ?? null) : (preview.error ?? t.failed)} />
            )}
          </div>
        ) : tab ? (
          <WorkspaceCanvas
            key={tab.id}
            pane={tab.pane}
            active={currentLeaf?.id ?? null}
            zoom={zoom}
            sessions={list}
            endpoint={engine.endpoint}
            editable={editable}
            showReview={showReview && active === currentLeaf?.sessionId}
            status={stateBadge}
            onFocus={(leafId, sessionId) => tabFocus(tab.id, leafId, sessionId, zoom)}
            onRequest={(event, leaf, direction) => setMenu(startTarget({ kind: "leaf", tab: tab.id, leaf, ...(direction ? { direction } : {}) }, event))}
            onClose={(leafId) => {
              if (!view) return;
              const leaf = openLeaves.find(({ id }) => id === leafId);
              const session = list.find(({ id }) => id === leaf?.sessionId);
              if (session?.state === "running") setClosing({ view, tab: tab.id, leaf: leafId, session, navigation: navigation.current });
              else if (leaf?.sessionId && !session && !sessions.isSuccess) setError("载入原会话后才能关闭这个分栏。");
              else void closePane(view, tab.id, leafId);
            }}
            onZoom={(leaf) => {
              const current = openLeaves.find(({ id }) => id === leaf);
              if (!current) return;
              tabFocus(tab.id, leaf, current.sessionId, zoom ? null : leaf);
              setFocusTarget(leaf);
            }}
            onResize={(id, ratio) => {
              if (!view) return;
              const tabs = view.layout.tabs.map((entry) => {
                if (entry.id !== tab.id) return entry;
                return { ...entry, pane: replacePane(entry.pane, id, (node) => (node.kind === "split" ? { ...node, ratio } : node)) };
              });
              void edit(view, { tabs });
            }}
            onReview={(sessionId) => {
              setShowReview(active !== sessionId || !showReview);
              setActive(sessionId);
            }}
            onInterrupt={(id) => void act("agent.sessions.interrupt", id)}
          />
        ) : !space || view ? (
          <EmptyState icon={FolderOpen} title={space ? "这个 Space 没有打开的标签" : "创建你的第一个 Space"} hint={space ? "使用新终端打开标签，或从 Agents 打开现有会话。" : "Space 绑定工作目录，隔离会话和历史。"} />
        ) : !workspace.isError ? (
          <p role="status" className="hu-hint-text">
            正在读取工作区…
          </p>
        ) : null}
        {showReview && cur && space ? <ReviewPanel key={cur.id} spaceId={space.id} sessionId={cur.id} running={cur.state === "running"} provider={cur.provider} /> : null}
        <footer className="agent-main-footer">
          <span>{space ? `${list.length} 个会话 · 当前 Space` : "尚无 Space"}</span>
          <span>关闭标签只分离视图 · 会话记录保留</span>
        </footer>
      </section>
      {closing && closing.navigation === navigation.current ? (
        <Dialog
          open
          title={`关闭“${closing.session.name}”的分栏？`}
          testId="workspace-pane-close-dialog"
          onClose={() => {
            if (!working.current) setClosing(null);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setClosing(null)}>
                取消
              </Button>
              <Button disabled={busy} onClick={() => void closePane(closing.view, closing.tab, closing.leaf)}>
                收起分栏
              </Button>
              <Button disabled={busy} variant="danger" onClick={() => void closePane(closing.view, closing.tab, closing.leaf, closing.session)}>
                终止并关闭
              </Button>
            </>
          }
        >
          <p>收起后仍可从 Agents 回到该会话。终止会结束该终端以及它的子进程。</p>
        </Dialog>
      ) : null}
      {spaceDelete ? (
        <Dialog
          open
          title={`删除 Space “${spaceDelete.name}”`}
          description="只删除 Space 配置，不会删除工作目录里的任何文件；已结束会话的历史记录保留。"
          error={spaceError}
          testId="space-delete-dialog"
          onClose={() => (setSpaceDelete(null), setSpaceError(null))}
          actions={
            <>
              <Button onClick={() => (setSpaceDelete(null), setSpaceError(null))}>取消</Button>
              <Button
                variant="danger"
                icon={Trash2}
                data-testid="space-delete-confirm"
                onClick={() =>
                  void (async () => {
                    setSpaceError(null);
                    try {
                      await engine.call("agent.spaces.delete", { id: spaceDelete.id }, { write: true });
                      ++navigation.current;
                      setSpaceDelete(null);
                      setSpaceId(null);
                      setActive(null);
                      setRequestedSession(null);
                      setMenu(null);
                      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
                    } catch (e) {
                      setSpaceError(e instanceof CapabilityError || e instanceof Error ? e.message : String(e));
                    }
                  })()
                }
              >
                删除 Space
              </Button>
            </>
          }
        >
          <p>{spaceDelete.root}</p>
        </Dialog>
      ) : null}
      {spaceForm ? (
        <Dialog
          open
          title={spaceForm.id ? "编辑 Space" : "新建 Space"}
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
                      const created = await engine.call<Space>(
                        "agent.spaces.save",
                        { name: spaceForm.name.trim(), root: spaceForm.folder.trim(), ...(spaceForm.id ? { id: spaceForm.id, expectedRevision: spaceForm.revision ?? 0 } : {}) },
                        { write: true },
                      );
                      ++navigation.current;
                      setSpaceForm(null);
                      setSpaceId(created.id);
                      setActive(null);
                      setRequestedSession(null);
                      setMenu(null);
                      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
                    } catch (e) {
                      setSpaceError(e instanceof CapabilityError || e instanceof Error ? e.message : String(e));
                    }
                  })()
                }
              >
                {spaceForm.id ? "保存 Space" : "创建 Space"}
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
          <p className="hu-hint-text">当前 Space 新建的每个 CLI 都使用这个目录。</p>
        </Dialog>
      ) : null}
      {showHistory && space ? (
        <aside className="agent-history" aria-label="当前 Space 会话历史">
          <HistoryPanel
            key={space.id} // 切换 Space 时历史面板重新挂载：搜索框与筛选被清空（ACC-AG-05）
            space={space}
            installed={new Set((detected.data ?? []).filter((p) => p.installed).map((p) => p.id))}
            onResumed={(id) => setRequestedSession({ spaceId: space.id, sessionId: id })}
          />
        </aside>
      ) : null}
    </div>
  );
}
