import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Eye, History, Pin, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n.js";

interface Entry {
  provider: "claude" | "codex" | "pi";
  historyId: string;
  revision: string;
  nativeSessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  active: boolean;
  possiblyActive: boolean;
  pinned: boolean;
  canResume: boolean;
  canFork: boolean;
  resumeBlocked: string | null;
  forkBlocked: string | null;
}
type Browse = { entries: Entry[]; skipped: number; total: number; nextOffset: number | null; limitedProviders: Entry["provider"][] };
export type HistoryAction = "resume" | "fork";
export type HistorySelection = Pick<Entry, "provider" | "nativeSessionId" | "historyId"> & { allSpaces: boolean; historyRevision: string };
type LaunchPlan = { tab: () => Promise<void>; pane?: () => Promise<void>; paneLabel: string };
const PAGE_SIZE = 50;
const PROVIDERS = ["claude", "codex", "pi"] as const;
const reference = ({ provider, nativeSessionId, historyId, revision }: Entry) => ({ provider, nativeSessionId, historyId, historyRevision: revision });

interface Transcript {
  messages: { role: "user" | "assistant"; text: string; at: string | null }[];
  truncated: boolean;
}

function TranscriptDialog({ spaceId, allSpaces, entry, onClose, actions }: { spaceId: string; allSpaces: boolean; entry: Entry; onClose: () => void; actions: ReactNode }) {
  const transcript = useCapability<Transcript>("agent.history.read", { spaceId, allSpaces, ...reference(entry) });
  return (
    <Dialog open title={entry.title} description="只读的对话记录（用户与助手的文字；不含工具调用）。" testId="history-transcript" onClose={onClose} actions={actions}>
      {entry.forkBlocked ? <p id={`history-fork-reason-${entry.historyId}`}>{entry.forkBlocked}</p> : null}
      {transcript.isError ? (
        <div role="alert" className="hu-callout danger">
          <p>{transcript.error instanceof Error ? transcript.error.message : String(transcript.error)}</p>
        </div>
      ) : null}
      {!transcript.data && !transcript.isError ? <p className="agent-small-empty">…</p> : null}
      {transcript.data?.truncated ? <p className="agent-small-empty">只显示可读取的最近一段对话。</p> : null}
      <div style={{ display: "grid", gap: 10, maxHeight: "55vh", overflow: "auto" }}>
        {(transcript.data?.messages ?? []).map((m, i) => (
          <div key={i} data-testid="transcript-message" data-role={m.role} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <strong>{m.role === "user" ? "你" : "助手"}</strong>
            <div>{m.text}</div>
          </div>
        ))}
        {transcript.data && transcript.data.messages.length === 0 ? <p className="agent-small-empty">这次会话没有可显示的文字内容。</p> : null}
      </div>
    </Dialog>
  );
}

export function HistoryPanel({
  space,
  writable,
  canLaunch,
  planLaunch,
  onLocate,
}: {
  space: { id: string; name?: string; root?: string };
  writable: boolean;
  canLaunch: boolean;
  planLaunch: (selection: HistorySelection, action: HistoryAction) => LaunchPlan | null;
  onLocate: (selection: HistorySelection) => Promise<void>;
}) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [confirming, setConfirming] = useState<{ entry: Entry; action: HistoryAction; plan: LaunchPlan } | null>(null);
  const [destination, setDestination] = useState<"tab" | "pane">("tab");
  const [filter, setFilter] = useState<"all" | "active" | "resumable">("all");
  const [provider, setProvider] = useState<Entry["provider"] | "">("");
  const [allSpaces, setAllSpaces] = useState(false);
  const [offset, setOffset] = useState(0);
  const scope = { spaceId: space.id, allSpaces };
  const history = useCapability<Browse>("agent.history.list", { ...scope, query, filter, provider: provider || undefined, offset, limit: PAGE_SIZE });
  const results = useRef<HTMLHeadingElement>(null);
  const focusPage = useRef(false);

  useEffect(() => {
    if (focusPage.current && !history.isFetching && history.data) {
      focusPage.current = false;
      results.current?.focus();
    }
  }, [history.data, history.isFetching]);

  function changePage(next: number) {
    focusPage.current = true;
    setOffset(next);
  }

  function resetPage() {
    focusPage.current = false;
    setOffset(0);
    setError(null);
  }

  function selectLaunch(e: Entry, action: HistoryAction) {
    const plan = planLaunch({ ...reference(e), allSpaces }, action);
    if (!plan) return;
    setViewing(null);
    setDestination("tab");
    setConfirming({ entry: e, action, plan });
  }

  async function locate(e: Entry) {
    setBusy(e.historyId);
    setError(null);
    try {
      await onLocate({ ...reference(e), allSpaces });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function togglePin(e: Entry) {
    setError(null);
    try {
      await engine.call("agent.history.pin", { ...scope, ...reference(e), pinned: !e.pinned }, { write: true });
      if (offset > 0) changePage(0);
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.history.list" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const entries = history.data?.entries ?? [];
  const skipped = history.data?.skipped ?? 0;
  const FILTERS: ["all" | "active" | "resumable", string][] = [
    ["all", t.history.filterAll],
    ["active", t.history.active],
    ["resumable", t.history.filterResumable],
  ];
  return (
    <section data-testid="agent-history" aria-label={t.history.title} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="agent-sidebar-head">
        <span>
          <History size={15} aria-hidden />
          {t.history.title}
        </span>
        {history.data ? <span className="agent-count">{history.data.total}</span> : null}
      </div>
      <div className="agent-history-space">
        {space.name ?? ""}
        <small title={space.root}>{space.root}</small>
      </div>
      <div className="agent-history-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          aria-label={t.history.search}
          placeholder={t.history.searchPlaceholder}
          maxLength={256}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            resetPage();
          }}
        />
      </div>
      <div className="agent-history-filters">
        <label>
          范围{" "}
          <select
            value={allSpaces ? "all" : "space"}
            onChange={(event) => {
              setAllSpaces(event.currentTarget.value === "all");
              resetPage();
            }}
          >
            <option value="space">当前 Space</option>
            <option value="all">所有本机 Space</option>
          </select>
        </label>
        <label>
          提供方{" "}
          <select
            value={provider}
            onChange={(event) => {
              setProvider(PROVIDERS.find((id) => id === event.currentTarget.value) ?? "");
              resetPage();
            }}
          >
            <option value="">全部</option>
            {PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {t.history.provider[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="agent-history-filters" role="group" aria-label={t.history.filters}>
        {FILTERS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              resetPage();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="agent-history-list" aria-busy={history.isFetching}>
        {history.data ? (
          <h3 ref={results} tabIndex={-1} className="agent-small-empty">
            共 {history.data.total} 条记录{entries.length ? `，显示第 ${offset + 1}–${offset + entries.length} 条` : ""}
          </h3>
        ) : null}
        {history.isError ? (
          <div role="alert" className="hu-callout danger">
            <p>{history.error instanceof Error ? history.error.message : String(history.error)}</p>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="hu-callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {skipped > 0 ? (
          <p className="agent-small-empty" data-testid="history-skipped">
            {t.history.skipped(skipped)}
          </p>
        ) : null}
        {history.data?.limitedProviders.length ? <p className="agent-small-empty">{history.data.limitedProviders.map((id) => t.history.provider[id]).join("、")} 有更多历史文件，当前仅搜索最近的记录。</p> : null}
        {!history.data && !history.isError ? <p className="agent-small-empty">正在扫描会话历史…</p> : null}
        {history.data && entries.length === 0 ? <p className="agent-small-empty">{query || provider || filter !== "all" ? t.history.noMatch : t.history.empty}</p> : null}
        {entries.map((e) => {
          const resumeReasonId = !e.active && e.resumeBlocked ? `history-resume-reason-${e.historyId}` : undefined;
          return (
            <div key={e.historyId} className="agent-history-item" data-testid="history-item">
              <span className={`agent-provider-mark provider-${e.provider}`}>{e.provider.slice(0, 1).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong data-testid="history-title">{e.title}</strong>
                <small>
                  {t.history.provider[e.provider]}
                  {e.active ? ` · ${t.history.active}` : ""}
                </small>
                <time>{new Date(e.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                {resumeReasonId ? <small id={resumeReasonId}>{e.resumeBlocked}</small> : null}
              </span>
              <button
                type="button"
                className={`agent-pin${e.pinned ? " agent-pinned" : ""}`}
                aria-pressed={e.pinned}
                aria-label={e.pinned ? t.history.unpin(e.title) : t.history.pin(e.title)}
                disabled={!writable}
                data-testid="history-pin"
                onClick={() => void togglePin(e)}
              >
                <Pin size={12} aria-hidden />
              </button>
              <button type="button" className="agent-pin" aria-label={`查看记录 ${e.title}`} title="只读查看这次会话的对话记录" data-testid="history-view" onClick={() => setViewing(e)}>
                <Eye size={12} aria-hidden />
              </button>
              {e.active ? (
                <Button disabled={busy !== null} loading={busy === e.historyId} data-testid="history-locate" onClick={() => void locate(e)}>
                  前往会话
                </Button>
              ) : (
                <Button disabled={!e.canResume || !canLaunch} aria-describedby={resumeReasonId} data-testid="history-resume" onClick={() => selectLaunch(e, "resume")}>
                  {t.history.resume}
                </Button>
              )}
            </div>
          );
        })}
        {offset > 0 || history.data?.nextOffset != null ? (
          <div className="agent-history-filters" role="group" aria-label="历史分页">
            <button type="button" disabled={offset === 0 || history.isFetching} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>
              上一页
            </button>
            <button type="button" disabled={history.data?.nextOffset == null || history.isFetching} onClick={() => changePage(history.data?.nextOffset ?? offset)}>
              下一页
            </button>
          </div>
        ) : null}
      </div>
      <div className="agent-history-footnote">{t.history.note}</div>
      {viewing ? (
        <TranscriptDialog
          spaceId={space.id}
          allSpaces={allSpaces}
          entry={viewing}
          onClose={() => setViewing(null)}
          actions={
            <Button disabled={!canLaunch || !viewing.canFork} aria-describedby={viewing.forkBlocked ? `history-fork-reason-${viewing.historyId}` : undefined} data-testid="history-fork" onClick={() => selectLaunch(viewing, "fork")}>
              创建分支
            </Button>
          }
        />
      ) : null}
      {confirming ? (
        <Dialog
          open
          title={confirming.action === "resume" ? "恢复原会话" : "创建会话分支"}
          description={confirming.entry.title}
          testId="history-launch"
          onClose={() => setConfirming(null)}
          actions={
            <Button
              onClick={() => {
                const open = confirming.plan[destination];
                setConfirming(null);
                void open?.();
              }}
            >
              {confirming.action === "resume" ? "恢复会话" : "创建分支"}
            </Button>
          }
        >
          <p>
            {space.name} · {confirming.action === "fork" && confirming.entry.provider === "pi" ? space.root : confirming.entry.cwd}
          </p>
          <label>
            打开位置{" "}
            <select value={destination} onChange={(event) => setDestination(event.currentTarget.value === "pane" ? "pane" : "tab")}>
              <option value="tab">打开新标签页</option>
              {confirming.plan.pane ? <option value="pane">{confirming.plan.paneLabel}</option> : null}
            </select>
          </label>
        </Dialog>
      ) : null}
    </section>
  );
}
