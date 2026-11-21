import { LaunchMenu, type LaunchOptions } from "./LaunchMenu.js";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, TerminalView } from "@huhu/ui";
import { ArrowLeft, ArrowRight, ChevronDown, Folder, FolderOpen, History, Pencil, Plus, Trash2 } from "lucide-react";
import { CapabilityError, createRequestId, host, onOpenAgentSessionRequest, queryKey, registerExitParticipant, useCapability, useEngine, useQueryClient, type ExitRequest, type ModuleProps } from "@huhu/workbench";
import { emptyAgentSettings, type AgentSettingsFile } from "../shared/index.js";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { HistoryPanel, type HistoryAction, type HistorySelection } from "./history/HistoryPanel.js";
import { ReviewPanel } from "./ReviewPanel.js";
import { ProtectedLaunchDialog } from "./ProtectedLaunchDialog.js";
import { SpaceDirectoryNotice } from "./SpaceDirectoryNotice.js";
import { WorkspaceFilesDialog } from "./WorkspaceFilesDialog.js";
import { spaceCanLaunch, type Space } from "../shared/space.js";
import { WorkspaceCanvas, type WorkspaceSession as Session } from "./WorkspaceCanvas.js";
import {
  leaves,
  movePane,
  moveTab,
  placeSession,
  replacePane,
  sessionPlacement,
  type PaneLeaf,
  type SpaceLayout,
  type SplitDirection,
  type WorkspaceLaunchView,
  type WorkspaceTarget,
  type WorkspaceView,
} from "../shared/workspace-layout.js";
import { t } from "./i18n.js";

interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
}

interface LaunchIntent {
  space: Space;
  view: WorkspaceView;
  target: WorkspaceTarget;
  navigation: number;
  id: string;
  trigger?: HTMLButtonElement;
  position?: CSSProperties;
}
type ViewSelection = { tab: string; leaf: string; zoom: string | null };
type HistoryLocation = { spaceId: string; sessionId: string; terminalId: string; tab: string; leaf: string };
type LaunchParameters = LaunchOptions & { history?: HistorySelection & { action: HistoryAction } };

type LaunchRecovery = {
  intent: Omit<LaunchIntent, "trigger" | "position">;
  provider: string;
  options: LaunchParameters;
  outcome: "unknown" | "not-created";
};

export function AgentCliModule({ onNavigate, registerLeaveGuard }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [requestedSession, setRequestedSession] = useState<{ spaceId: string; sessionId: string; exact?: HistoryLocation } | null>(null);
  const [menu, setMenu] = useState<LaunchIntent | null>(null);
  const [environmentIntent, setEnvironmentIntent] = useState<LaunchIntent | null>(null);
  const [recoveries, setRecoveries] = useState<Record<string, LaunchRecovery | null>>({});
  const launcher = useRef<HTMLDivElement>(null);
  const [selections, setSelections] = useState<Record<string, ViewSelection | null>>({});
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ view: WorkspaceView; tab: string; leaf: string; session: Session; navigation: number } | null>(null);
  const [moveSource, setMoveSource] = useState<{ spaceId: string; tab: string; leaf: PaneLeaf; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const writeReceipt = useRef<Promise<boolean> | null>(null);
  const navigation = useRef(0);
  const [spaceForm, setSpaceForm] = useState<{ id?: string; revision?: number; name: string; folder: string } | null>(null);
  const [spaceDelete, setSpaceDelete] = useState<Space | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true); // 原型：会话历史在桌面宽度下常驻右侧
  const [showFiles, setShowFiles] = useState(false);
  const [filesDestination, setFilesDestination] = useState<Space | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const space = (spaces.data ?? []).find((s) => s.id === spaceId) ?? spaces.data?.[0] ?? null;
  const boundSpace = spaceCanLaunch(space);
  const sessions = useCapability<Session[]>("agent.sessions.list", { spaceId: space?.id }, { enabled: Boolean(space) });
  const workspace = useCapability<WorkspaceView>("agent.workspace.get", { spaceId: space?.id }, { enabled: Boolean(space) });
  const detected = useCapability<Detected[]>("agent.catalog.detect", {});
  const agentSettings = useCapability<{ settings: AgentSettingsFile }>("agent.settings.get", {});
  const core = useCapability<{ state: string; version: string | null }>("agent.core.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });
  useEffect(() => {
    if (showFiles || !filesDestination) return;
    ++navigation.current;
    setSpaceId(filesDestination.id);
    setActive(null);
    setMoveSource(null);
    setFilesDestination(null);
    void qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === engine.vaultId && String(query.queryKey[1]).startsWith("agent.") });
  }, [engine.vaultId, filesDestination, qc, showFiles]);
  const view = workspace.data;
  const recovery = space ? recoveries[space.id] : null;
  const inSpace = space ? selections[space.id] : null;
  const tab = view?.layout.tabs.find(({ id }) => id === inSpace?.tab) ?? view?.layout.tabs.find(({ pane }) => leaves(pane).some(({ sessionId }) => sessionId !== null)) ?? view?.layout.tabs[0];
  const openLeaves = tab ? leaves(tab.pane) : [];
  const currentLeaf = openLeaves.find(({ id }) => id === inSpace?.leaf) ?? openLeaves[0];
  const moving = moveSource?.spaceId === space?.id ? moveSource : null;
  const zoom = openLeaves.find(({ id }) => id === inSpace?.zoom)?.id ?? null;
  const editable = Boolean(view?.writable && !busy && !workspace.isFetching && !workspace.isError);
  const tabOrder = view?.layout.tabs ?? [];
  const currentTabIndex = tabOrder.findIndex(({ id }) => id === tab?.id);

  useEffect(() => {
    const check = (request: ExitRequest) => {
      if (request.signal.aborted) return false;
      const pending = writeReceipt.current;
      return pending ? request.waitForUser(pending) : true;
    };
    const exit = registerExitParticipant(check);
    const leave = registerLeaveGuard?.(check);
    return () => {
      leave?.();
      exit();
    };
  }, [registerLeaveGuard]);

  useEffect(() => {
    if (!moving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || writeReceipt.current) return;
      event.preventDefault();
      setMoveSource(null);
      setSelections((previous) => ({ ...previous, [moving.spaceId]: { tab: moving.tab, leaf: moving.leaf.id, zoom: null } }));
      setActive(moving.leaf.sessionId);
      setFocusTarget(moving.leaf.id);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [moving]);

  useLayoutEffect(() => {
    if (!focusTarget) return;
    const pane = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(focusTarget)}"]`);
    if (pane && !pane.hidden) {
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
        setMoveSource(null);
        setError(null);
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && ["agent.sessions.list", "agent.workspace.get"].includes(String(q.queryKey[1])) });
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
    if (space?.id !== requestedSession.spaceId || sessions.isFetching || workspace.isFetching || !sessions.isSuccess || !workspace.isSuccess) return;
    const session = sessions.data?.find(({ id }) => id === requestedSession.sessionId);
    const exact = requestedSession.exact;
    if (exact) {
      const placement = view && sessionPlacement(view.layout, exact.sessionId);
      if (session?.state === "running" && session.terminalId === exact.terminalId && placement?.tab === exact.tab && placement.leaf === exact.leaf) {
        setActive(exact.sessionId);
        setSelections((previous) => ({ ...previous, [exact.spaceId]: { tab: exact.tab, leaf: exact.leaf, zoom: null } }));
        setFocusTarget(exact.leaf);
      } else setError("原会话的分栏已变化，请从历史重新查询");
    } else if (!session) setError("未找到原会话。可以重连后从任务重试定位。");
    else {
      setActive(session.id);
      const owner = view?.layout.tabs.find((item) => leaves(item.pane).some(({ sessionId }) => sessionId === session.id));
      const leaf = owner && leaves(owner.pane).find(({ sessionId }) => sessionId === session.id);
      if (owner && leaf) {
        setSelections((previous) => ({ ...previous, [space.id]: { tab: owner.id, leaf: leaf.id, zoom: null } }));
        setFocusTarget(leaf.id);
      }
    }
    setRequestedSession(null);
  }, [requestedSession, spaces.data, spaces.isFetching, space?.id, sessions.data, sessions.isSuccess, sessions.isFetching, view, workspace.isSuccess, workspace.isFetching]);

  function beginWrite() {
    let settle!: (confirmed: boolean) => void;
    writeReceipt.current = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    setBusy(true);
    return (confirmed: boolean) => {
      writeReceipt.current = null;
      setBusy(false);
      settle(confirmed);
    };
  }

  async function rememberWorkspace(saved: WorkspaceView) {
    const key = queryKey(engine.vaultId, "agent.workspace.get", { spaceId: saved.spaceId });
    await qc.cancelQueries({ queryKey: key, exact: true });
    qc.setQueryData<WorkspaceView>(key, (previous) => (previous && previous.version > saved.version ? previous : saved));
    void qc.invalidateQueries({ queryKey: key, exact: true });
  }

  function startTarget(target: WorkspaceTarget, event?: MouseEvent<HTMLButtonElement>): LaunchIntent | null {
    if (!space || !boundSpace || !view || !editable || writeReceipt.current) return null;
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

  async function launch(intent: LaunchIntent, provider: string, options: LaunchParameters = {}) {
    if (writeReceipt.current) return;
    const { space, target, id } = intent;
    const stay = () => navigation.current === intent.navigation;
    const finish = beginWrite();
    let confirmed = false;
    setMenu(null);
    setError(null);
    try {
      const { history, ...settings } = options;
      const capability = history ? "agent.history.workspaceLaunch" : settings.environment ? "agent.workspace.launchProtected" : "agent.workspace.launch";
      const result = await engine.call<WorkspaceLaunchView>(capability, { spaceId: space.id, spaceRevision: space.revision, baseVersion: intent.view.version, requestId: id, target, provider, ...settings, ...history }, { write: true });
      setRecoveries((previous) => (previous[space.id]?.intent.id === id ? { ...previous, [space.id]: null } : previous));
      await rememberWorkspace(result.workspace);
      confirmed = result.placement !== null;
      if (stay()) {
        setActive(result.sessionId);
        if (result.placement) {
          const { tab, leaf } = result.placement;
          setSelections((previous) => ({ ...previous, [space.id]: { tab, leaf, zoom: null } }));
          setFocusTarget(leaf);
        } else setError("会话已启动，原分栏暂时无法使用。可从当前 Space 的 Agents 列表继续。");
      }
    } catch (e) {
      const outcome = e instanceof CapabilityError ? (e.code === "RUN_UNKNOWN" || e.code === "INTERNAL" ? "unknown" : e.details?.["reason"] === "confirmed_not_created" ? "not-created" : null) : "unknown";
      if (outcome) {
        setRecoveries((previous) => ({
          ...previous,
          [space.id]: { intent: { space, target, id, view: intent.view, navigation: intent.navigation }, provider, options, outcome },
        }));
      } else {
        setRecoveries((previous) => (previous[space.id]?.intent.id === id ? { ...previous, [space.id]: null } : previous));
      }
      if (stay()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      finish(confirmed);
      void refresh();
    }
  }

  function planHistory(selection: HistorySelection, action: HistoryAction) {
    const target: WorkspaceTarget | null = tab && currentLeaf ? { kind: "leaf", tab: tab.id, leaf: currentLeaf.id, ...(currentLeaf.sessionId && { direction: "right" }) } : null;
    const newTab = startTarget({ kind: "tab" });
    const current = target && startTarget(target);
    if (!newTab) return null;
    const options = { history: { ...selection, action } };
    return {
      tab: () => launch(newTab, selection.provider, options),
      ...(current && { pane: () => launch(current, selection.provider, options) }),
      paneLabel: currentLeaf?.sessionId ? "在当前分栏右侧打开" : "在当前空分栏打开",
    };
  }

  async function locateHistory(selection: HistorySelection) {
    if (!space) return;
    const startedAt = navigation.current;
    const result = await engine.call<HistoryLocation>("agent.history.locate", { spaceId: space.id, ...selection });
    if (navigation.current !== startedAt) return;
    ++navigation.current;
    setRequestedSession({ spaceId: result.spaceId, sessionId: result.sessionId, exact: result });
    setSpaceId(result.spaceId);
    setShowHistory(false);
    setMenu(null);
    setMoveSource(null);
    setError(null);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && ["agent.sessions.list", "agent.workspace.get"].includes(String(q.queryKey[1])) });
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
  // 定期在真实 Core 中核对待确认启动和运行中的会话。
  const anyRunning = list.some((s) => s.state === "running" || s.state === "launching" || s.state === "unknown");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.sessions.list" }), 5000);
    return () => clearInterval(id);
  }, [anyRunning, engine.vaultId, qc]);
  const currentSession = active ?? currentLeaf?.sessionId;
  const cur = list.find((s) => s.id === currentSession) ?? null;
  const preview = cur && (!view || !sessionPlacement(view.layout, cur.id)) ? cur : null;
  const stateBadge = (s: Session) => (
    <Badge tone={s.state === "running" ? "success" : s.state === "exited" ? "neutral" : s.state === "failed" ? "danger" : "warning"}>
      {s.state === "running" ? t.running : s.state === "exited" ? t.exited : s.state === "failed" ? t.failed : "待核实"}
    </Badge>
  );

  function tabFocus(tabId: string, leafId: string, sessionId: string | null, zoomId: string | null = null) {
    if (!space) return;
    setSelections((previous) => {
      const remembered = previous[space.id];
      if (remembered?.tab === tabId && remembered.leaf === leafId && remembered.zoom === zoomId) return previous;
      return { ...previous, [space.id]: { tab: tabId, leaf: leafId, zoom: zoomId } };
    });
    setActive(sessionId);
  }

  type Destination = { tab: string; leaf: PaneLeaf };

  async function commitWorkspace(operation: () => Promise<WorkspaceView>, onSaved?: (view: WorkspaceView) => Destination | null) {
    if (writeReceipt.current) return false;
    const generation = navigation.current;
    const finish = beginWrite();
    let confirmed = false;
    setError(null);
    try {
      const view = await operation();
      await rememberWorkspace(view);
      confirmed = true;
      if (navigation.current === generation && onSaved) {
        const focus = onSaved(view);
        setActive(focus?.leaf.sessionId ?? null);
        setSelections((previous) => ({ ...previous, [view.spaceId]: focus ? { tab: focus.tab, leaf: focus.leaf.id, zoom: null } : null }));
        setFocusTarget(focus?.leaf.id ?? null);
      }
      return true;
    } catch (e) {
      if (navigation.current === generation) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      finish(confirmed);
      setClosing(null);
      void refresh();
    }
  }

  function edit(basis: WorkspaceView, layout: SpaceLayout, focus?: Destination) {
    return commitWorkspace(() => engine.call<WorkspaceView>("agent.workspace.save", { spaceId: basis.spaceId, baseVersion: basis.version, layout }, { write: true }), focus ? () => focus : undefined);
  }

  function closePane(basis: WorkspaceView, tab: string, leaf: string, terminate = false) {
    const owner = basis.layout.tabs.find(({ id }) => id === tab);
    const target = owner && leaves(owner.pane).find(({ id }) => id === leaf);
    if (!target) return;
    return commitWorkspace(
      () => engine.call<WorkspaceView>("agent.workspace.close", { spaceId: basis.spaceId, baseVersion: basis.version, tab, leaf, sessionId: target.sessionId, terminate }, { write: true }),
      (saved) => {
        const next = saved.layout.tabs.find(({ id }) => id === tab) ?? saved.layout.tabs[0];
        return next ? { tab: next.id, leaf: leaves(next.pane)[0]! } : null;
      },
    );
  }

  function openExisting(session: Session) {
    ++navigation.current;
    setShowReview(false);
    dismissMenu(false);
    setMoveSource(null);
    setActive(session.id);
    const owner = view?.layout.tabs.find(({ pane }) => leaves(pane).some(({ sessionId }) => sessionId === session.id));
    const leaf = owner && leaves(owner.pane).find(({ sessionId }) => sessionId === session.id);
    if (owner && leaf) tabFocus(owner.id, leaf.id, session.id);
  }

  function moveTo(leaf: string, direction: SplitDirection) {
    if (!view || !tab || !moving || writeReceipt.current) return;
    const restoreSource = () => {
      const source = view.layout.tabs.find(({ id }) => id === moving.tab);
      if (!source || !leaves(source.pane).some(({ id, sessionId }) => id === moving.leaf.id && sessionId === moving.leaf.sessionId)) return;
      tabFocus(moving.tab, moving.leaf.id, moving.leaf.sessionId);
      setFocusTarget(moving.leaf.id);
    };
    if (moving.version !== view.version) {
      setError("工作区布局已更新，请重新选择要移动的分栏。");
      restoreSource();
      setMoveSource(null);
      return;
    }
    const next = movePane(view.layout, { tab: moving.tab, leaf: moving.leaf.id }, { tab: tab.id, leaf }, direction, createRequestId());
    if (next === view.layout) return;
    const generation = navigation.current;
    void edit(view, next, { tab: tab.id, leaf: moving.leaf }).then((saved) => {
      if (!saved && navigation.current === generation) restoreSource();
      setMoveSource(null);
    });
  }

  function reorderTab(by: -1 | 1) {
    const neighbor = tabOrder[currentTabIndex + by];
    if (!view || !tab || !neighbor || moving) return;
    void edit(view, moveTab(view.layout, tab.id, neighbor.id));
  }

  return (
    <div className={`hu-module-layout agent-layout${showHistory && boundSpace ? " agent-history-open" : ""}`} data-testid="agent-cli-module">
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
                setMoveSource(null);
                dismissMenu(false);
                setError(null);
              }}
            >
              <FolderOpen size={17} aria-hidden />
              <span>
                <strong>{s.name}</strong>
                <small title={s.root || undefined}>{s.root || "待绑定"}</small>
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
          {t.coreStatus} · {core.data?.state === "connected" ? `${core.data.version} ${t.connected}` : core.data?.state === "idle" ? "未启动" : t.unavailable}
        </div>
      </aside>
      <section className="hu-v9-session-main">
        <header className="agent-space-header">
          <div>
            <FolderOpen size={16} aria-hidden />
            <strong>{space?.name ?? t.title}</strong>
            <span className="agent-cwd">{space?.root || "先选择一个工作目录"}</span>
          </div>
          <IconButton icon={Folder} label="工作区文件" disabled={!boundSpace} onClick={() => setShowFiles(true)} />
          <button
            type="button"
            className="agent-history-toggle"
            aria-expanded={showHistory && boundSpace}
            aria-label={showHistory ? t.history.close : t.history.open}
            data-testid="agent-history-toggle"
            disabled={!boundSpace}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={15} aria-hidden />
          </button>
        </header>
        {space && boundSpace ? (
          <WorkspaceFilesDialog
            key={space.id}
            space={space}
            open={showFiles}
            writable={view?.writable === true}
            onClose={() => setShowFiles(false)}
            onSpace={(opened) => {
              setShowFiles(false);
              setFilesDestination(opened);
            }}
          />
        ) : null}
        {space ? <SpaceDirectoryNotice space={space} onBind={view?.writable ? () => setSpaceForm({ id: space.id, revision: space.revision, name: space.name, folder: "" }) : undefined} /> : null}
        {error ? (
          <div role="alert" className="hu-callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {recovery ? (
          <div className="hu-callout" role="status" data-testid="workspace-launch-recovery">
            <p>{recovery.outcome === "unknown" ? "启动结果待核实。可使用原请求找回终端。" : "确认尚未创建终端。可按原配置重试。"}</p>
            <Button disabled={busy} onClick={() => void launch({ ...recovery.intent, navigation: navigation.current }, recovery.provider, recovery.options)}>
              {recovery.outcome === "unknown" ? "核对原启动" : "重试原启动"}
            </Button>
          </div>
        ) : null}
        {!recovery
          ? list
              .filter(({ state }) => state === "unknown")
              .map((session) => (
                <div key={session.id} className="hu-callout" data-testid="workspace-persisted-launch-recovery">
                  <p role="status">{session.name} · 启动结果待核实</p>
                  <Button onClick={() => void act("agent.sessions.recover", session.id)}>核对原启动</Button>
                </div>
              ))
          : null}
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
              disabled={!editable || !boundSpace}
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
              onOpenEnvironment={
                host()
                  ? () => {
                      setEnvironmentIntent(menu);
                      setMenu(null);
                    }
                  : undefined
              }
              onOpenSettings={() => (dismissMenu(false), onNavigate?.("settings", "agent-cli"))}
              onClose={() => dismissMenu()}
            />
          </div>
        ) : null}
        {environmentIntent ? (
          <ProtectedLaunchDialog
            spaceId={environmentIntent.space.id}
            spaceRevision={environmentIntent.space.revision}
            onClose={() => {
              setEnvironmentIntent(null);
              requestAnimationFrame(() => environmentIntent.trigger?.focus());
            }}
            onLaunch={(provider, environment) => {
              setEnvironmentIntent(null);
              void launch(environmentIntent, provider, { environment });
            }}
          />
        ) : null}
        <div className="agent-workspace-tabs" role="group" aria-label="工作区标签">
          {tabOrder.length > 1 ? (
            <div className="agent-workspace-tab-order">
              <IconButton icon={ArrowLeft} label="左移当前标签" disabled={!editable || !!moving || currentTabIndex <= 0} onClick={() => reorderTab(-1)} />
              <IconButton icon={ArrowRight} label="右移当前标签" disabled={!editable || !!moving || currentTabIndex < 0 || currentTabIndex >= tabOrder.length - 1} onClick={() => reorderTab(1)} />
            </div>
          ) : null}
          {tabOrder.map((entry, index) => {
            const first = leaves(entry.pane)[0]!;
            const name = list.find(({ id }) => id === first.sessionId)?.name;
            return (
              <Button
                key={entry.id}
                aria-pressed={entry.id === tab?.id && !preview}
                data-testid="workspace-tab"
                data-tab-id={entry.id}
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
        {moving ? (
          <div className="agent-workspace-move" role="status">
            <span>选择移入方向，或拖到目标分栏的边缘。</span>
            <Button
              disabled={busy}
              onClick={() => {
                setMoveSource(null);
                tabFocus(moving.tab, moving.leaf.id, moving.leaf.sessionId);
                setFocusTarget(moving.leaf.id);
              }}
            >
              取消移动
            </Button>
          </div>
        ) : null}
        {workspace.isError ? (
          <div role="alert" className="hu-callout danger">
            <p>{workspace.error?.message ?? "工作区布局当前无法读取"}</p>
            <Button onClick={() => void Promise.all([workspace.refetch(), sessions.refetch()])}>重试</Button>
          </div>
        ) : null}
        {requestedSession && sessions.isError && !workspace.isError ? (
          <div role="alert" className="hu-callout danger">
            <p>暂时无法核对原会话。</p>
            <Button onClick={() => void Promise.all([workspace.refetch(), sessions.refetch()])}>重试定位</Button>
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
                  const next = placeSession(view.layout, { kind: "tab" }, preview.id, createRequestId());
                  if (!next) return;
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
            key={space?.id}
            pane={tab.pane}
            active={currentLeaf?.id ?? null}
            zoom={zoom}
            retained={moving?.leaf ?? null}
            sessions={list}
            endpoint={engine.endpoint}
            editable={editable}
            launchable={boundSpace}
            showReview={showReview && active === currentLeaf?.sessionId}
            status={stateBadge}
            onFocus={(leafId, sessionId) => {
              if (writeReceipt.current) ++navigation.current;
              tabFocus(tab.id, leafId, sessionId, zoom);
            }}
            onRequest={(event, leaf, direction) => {
              if (moving && direction) moveTo(leaf, direction);
              else setMenu(startTarget({ kind: "leaf", tab: tab.id, leaf, ...(direction ? { direction } : {}) }, event));
            }}
            onMoveStart={(leaf) => {
              if (!view) return;
              dismissMenu(false);
              setMoveSource({ spaceId: view.spaceId, tab: tab.id, leaf, version: view.version });
            }}
            onMoveDrop={moveTo}
            onMoveCancel={() => {
              if (!writeReceipt.current) setMoveSource(null);
            }}
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
              ++navigation.current;
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
            if (!writeReceipt.current) setClosing(null);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setClosing(null)}>
                取消
              </Button>
              <Button disabled={busy} onClick={() => void closePane(closing.view, closing.tab, closing.leaf)}>
                收起分栏
              </Button>
              <Button disabled={busy} variant="danger" onClick={() => void closePane(closing.view, closing.tab, closing.leaf, true)}>
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
              <input aria-label="工作目录" className="hu-flex-fill" value={spaceForm.folder} placeholder="/home/you/projects/huhu" onChange={(e) => setSpaceForm({ ...spaceForm, folder: e.target.value })} />
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
      {showHistory && boundSpace && space ? (
        <aside className="agent-history" aria-label="当前 Space 会话历史">
          <HistoryPanel
            key={space.id} // 切换 Space 时历史面板重新挂载：搜索框与筛选被清空（ACC-AG-05）
            space={space}
            installed={new Set((detected.data ?? []).filter((p) => p.installed).map((p) => p.id))}
            writable={Boolean(view?.writable)}
            canLaunch={editable}
            planLaunch={planHistory}
            onLocate={locateHistory}
          />
        </aside>
      ) : null}
    </div>
  );
}
