import { Badge, Button, EmptyState, ReviewDiff, Segmented, buildDiffRows } from "@huhu/ui";
import { Cloud, FileText, GitBranch, History, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { CapabilityError, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { useState } from "react";
import { ConflictView } from "./conflicts/ConflictView.js";
import { t } from "./i18n.js";
import { SyncPage } from "./sync/SyncPage.js";

interface Entry {
  id: string;
  at: string;
  source: string;
  title: string | null;
  path: string;
}
interface NoteRef {
  path: string;
  title: string;
}
interface GitStatus {
  isRepo: boolean;
  installed?: boolean;
  branch: string | null;
  files: { path: string; index: string; worktree: string; from?: string }[];
}
interface Commit {
  id: string;
  short: string;
  author: string;
  at: string;
  subject: string;
}

type Tab = "history" | "git" | "sync" | "conflicts";
const TAB_ICON = { history: History, git: GitBranch, sync: Cloud } as const;

/** 版本历史（原型 version-v9）：顶部三个功能（文件历史 / Git / 同步）+ 左侧资源栏 + 主区。 */
export function VersioningModule({ onNavigate }: ModuleProps) {
  const [tab, setTab] = useState<Tab>("history");
  const syncStatus = useCapability<{ name: string; detail: string }>("sync.status", {});
  const state = syncStatus.data?.name ?? "idle";
  return (
    <div className="module-layout version-v9" data-testid="versioning-module">
      <header className="version-v9-top">
        <div className="version-v9-title">
          <History size={18} aria-hidden />
          <strong>{t.heading}</strong>
        </div>
        <nav aria-label="版本功能">
          {(["history", "git", "sync"] as const).map((k) => {
            const Icon = TAB_ICON[k];
            return (
              <button key={k} type="button" aria-pressed={tab === k || (k === "sync" && tab === "conflicts")} data-testid={`versioning-nav-${k}`} onClick={() => setTab(k)}>
                <Icon size={14} aria-hidden /> {t.nav[k]}
                {k === "sync" && state !== "idle" && state !== "not-configured" ? <Badge tone={state === "conflict" || state === "auth-failed" ? "danger" : "warning"}>{t.sync.state[state] ?? state}</Badge> : null}
              </button>
            );
          })}
        </nav>
      </header>
      {tab === "history" ? (
        <FileHistory onNavigate={onNavigate} />
      ) : tab === "git" ? (
        <GitPage />
      ) : (
        <div className="version-v9-body">
          <main className="version-v9-main">
            <div className="version-v9-sync-main">{tab === "sync" ? <SyncPage onResolve={() => setTab("conflicts")} /> : <ConflictView onBack={() => setTab("sync")} />}</div>
          </main>
        </div>
      )}
    </div>
  );
}

function useAct() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const act = async <T,>(cap: string, input: unknown): Promise<T | null> => {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof CapabilityError && e.code === "VERSION_CONFLICT" ? t.conflict : e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  return { engine, act, error };
}

function FileHistory({ onNavigate }: { onNavigate?: ModuleProps["onNavigate"] }) {
  const { engine, act, error } = useAct();
  const notes = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const [path, setPath] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const file = path ?? notes.data?.[0]?.path ?? null;
  const timeline = useCapability<Entry[]>("history.timeline", file ? { path: file } : { path: "x.md" });
  const entries = file ? (timeline.data ?? []) : [];
  const chosen = entries.find((e) => e.id === sel) ?? entries[0] ?? null;
  const content = useCapability<{ text: string }>("history.read", chosen && file ? { path: chosen.path, entryId: chosen.id } : { path: "x.md", entryId: "0".repeat(40) });
  const current = useCapability<{ text: string }>("notes.read", file ? { path: file } : { path: "x.md" });
  // 对比基准（规格：与前一版 / 与当前内容）：前一版 = 时间线里比所选版本更早的那一项；最早的一版与空文件比
  const [base, setBase] = useState<"current" | "previous">("current");
  const chosenIndex = chosen ? entries.findIndex((e) => e.id === chosen.id) : -1;
  const previous = chosenIndex >= 0 ? (entries[chosenIndex + 1] ?? null) : null;
  const previousContent = useCapability<{ text: string }>("history.read", previous && base === "previous" ? { path: previous.path, entryId: previous.id } : { path: "x.md", entryId: "0".repeat(40) });
  const baseText = base === "current" ? (current.data?.text ?? null) : previous ? (previousContent.data?.text ?? null) : "";
  // 与当前比：历史版本 → 当前内容；与前一版比：前一版 → 所选版本（这一版改了什么）。头部的 +n −m 与下面的差异视图同一份数据
  const diffBefore = base === "current" ? (content.data?.text ?? null) : baseText;
  const diffAfter = base === "current" ? baseText : (content.data?.text ?? null);
  const stats = chosen && diffBefore !== null && diffAfter !== null ? buildDiffRows(diffBefore, diffAfter) : null;

  async function restore() {
    if (!file || !chosen) return;
    const cur = await engine.call<{ version: string }>("notes.read", { path: file });
    const r = await act("history.restore", { path: file, entryId: chosen.id, expectedCurrentVersion: cur.version });
    setOk(r !== null);
  }
  return (
    <div className="version-v9-body" data-testid="file-history">
      <aside className="version-v9-sidebar">
        <div className="version-v9-sidebar-title">{t.nav.history}</div>
        <label className="version-v9-file-picker">
          {t.pickFile}
          <select
            aria-label={t.pickFile}
            value={file ?? ""}
            onChange={(e) => {
              setPath(e.target.value);
              setSel(null);
              setOk(false);
            }}
          >
            {(notes.data ?? []).map((n) => (
              <option key={n.path} value={n.path}>
                {n.path}
              </option>
            ))}
          </select>
        </label>
        <form
          className="version-v9-sidebar-actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (file && name.trim()) void act("history.checkpoint", { path: file, title: name.trim() }).then((r) => r !== null && setName(""));
          }}
        >
          <input aria-label={t.checkpointName} placeholder={t.checkpointName} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" icon={Plus} disabled={!file || !name.trim()}>
            {t.checkpoint}
          </Button>
        </form>
        <div className="version-v9-entry-list">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              className={chosen?.id === e.id ? "active" : ""}
              aria-current={chosen?.id === e.id}
              data-testid="history-entry"
              onClick={() => {
                setSel(e.id);
                setOk(false);
              }}
            >
              <History size={14} aria-hidden />
              <span>
                <strong>{e.title ?? new Date(e.at).toLocaleString("zh-CN")}</strong>
                <small>
                  {new Date(e.at).toLocaleString("zh-CN")} · {(t.source as Record<string, string>)[e.source] ?? e.source}
                </small>
              </span>
            </button>
          ))}
          {entries.length === 0 ? <p className="version-v9-empty">{t.noHistory}</p> : null}
        </div>
        <p className="version-v9-note">每条历史属于一个文件。恢复前保留当前有效正文；查看差异不会改写内容。</p>
      </aside>
      <main className="version-v9-main">
        {error ? (
          <p role="alert" className="version-v9-error">
            {error}
          </p>
        ) : null}
        {ok ? (
          <div role="status" className="version-v9-note">
            {t.restored}
          </div>
        ) : null}
        <div className="version-v9-diff-heading">
          <div>
            <FileText size={15} aria-hidden />
            <strong title={file ?? ""}>{file ?? "—"}</strong>
          </div>
          <div className="row">
            <Segmented<"current" | "previous">
              label="对比基准"
              value={base}
              onChange={setBase}
              options={[
                { value: "current", label: "与当前内容" },
                { value: "previous", label: "与前一版" },
              ]}
            />
            {stats ? (
              <span className="version-v9-stats" data-testid="history-stats">
                <span className="added">+{stats.added}</span> <span className="removed">−{stats.removed}</span>
              </span>
            ) : null}
            {onNavigate ? (
              <Button variant="ghost" icon={Pencil} data-testid="history-edit-current" onClick={() => onNavigate("notes")}>
                编辑当前文件
              </Button>
            ) : null}
            <Button variant="ghost" icon={RotateCcw} disabled={!chosen || content.data?.text === current.data?.text} onClick={() => void restore()}>
              {t.restore}
            </Button>
          </div>
        </div>
        {chosen ? (
          <div className="version-v9-diff" data-testid="history-content">
            <div className="version-v9-diff-labels">
              {base === "current" ? (
                <>
                  <span>所选历史版本</span>
                  <span>当前有效内容</span>
                </>
              ) : (
                <>
                  <span>{previous ? "前一版本" : "（没有更早的版本）"}</span>
                  <span>所选历史版本</span>
                </>
              )}
            </div>
            <ReviewDiff before={diffBefore ?? ""} after={diffAfter ?? ""} path={file ?? "document.md"} />
          </div>
        ) : (
          <EmptyState icon={History} title="选择文件查看历史" hint="查看和预览不会改写文件。" />
        )}
      </main>
    </div>
  );
}

/** git.diff 返回的统一差异文本 → 与 ReviewDiff 同款的统一视图（只读）。 */
function PatchView({ patch }: { patch: string }) {
  const rows = patch.split("\n");
  return (
    <section className="review-diff" aria-label="Git 差异">
      <div className="review-body review-unified">
        {rows.map((line, i) => {
          const kind = line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "remove" : "same";
          return (
            <div key={i} className={`review-unified-row ${kind}`}>
              <i>{kind === "add" ? "+" : kind === "remove" ? "−" : " "}</i>
              <code>{kind === "same" ? line : line.slice(1) || " "}</code>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type GitArea = "worktree" | "staged" | "commits";

function GitPage() {
  const { act, error } = useAct();
  const status = useCapability<GitStatus>("git.status", {});
  const log = useCapability<Commit[]>("git.log", { limit: 50 });
  const [msg, setMsg] = useState("");
  const [area, setArea] = useState<GitArea>("worktree");
  const [query, setQuery] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
  const [selCommit, setSelCommit] = useState<string | null>(null);
  const files = status.data?.files ?? [];
  const staged = files.filter((f) => f.index !== " " && f.index !== "?");
  const changes = files.filter((f) => f.worktree !== " " || f.index === "?");
  const shown = (area === "staged" ? staged : changes).filter((f) => f.path.toLowerCase().includes(query.toLowerCase()));
  const target = area === "commits" ? null : (shown.find((f) => f.path === selPath) ?? shown[0] ?? null);
  const commit = (log.data ?? []).find((c) => c.id === selCommit) ?? (log.data ?? [])[0] ?? null;
  const diff = useCapability<{ diff: string }>("git.diff", area === "commits" ? (commit ? { commit: commit.id } : {}) : target ? { path: target.path, staged: area === "staged" } : {});
  if (!status.data) return <p>…</p>;
  if (status.data.installed === false) {
    return (
      <div className="version-v9-body" data-testid="git-missing">
        <main className="version-v9-main">
          <EmptyState
            icon={GitBranch}
            title="需要安装 Git"
            hint="Git 页与同步需要本机安装 Git。Windows：安装 Git for Windows（git-scm.com）；macOS：在终端运行 xcode-select --install 或用 Homebrew 安装 git；Linux：用发行版的包管理器安装 git。装好后重新打开此页。"
          />
        </main>
      </div>
    );
  }
  if (!status.data.isRepo) {
    return (
      <div className="version-v9-body" data-testid="git-not-repo">
        <main className="version-v9-main">
          <EmptyState
            icon={GitBranch}
            title={t.git.notRepo}
            hint={t.git.initNote}
            action={
              <Button variant="primary" onClick={() => void act("git.init", {})}>
                {t.git.init}
              </Button>
            }
          />
          {error ? (
            <p role="alert" className="version-v9-error">
              {error}
            </p>
          ) : null}
        </main>
      </div>
    );
  }
  return (
    <div className="version-v9-body" data-testid="git-page">
      <aside className="version-v9-sidebar">
        <div className="version-v9-sidebar-title">
          <GitBranch size={14} aria-hidden /> {status.data.branch ?? "-"}
        </div>
        <div className="version-v9-git-filters">
          {(
            [
              ["worktree", "工作区"],
              ["staged", "暂存区"],
              ["commits", "提交历史"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={area === k} onClick={() => setArea(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="version-v9-search">
          <Search size={13} aria-hidden />
          <input aria-label="搜索变更文件" placeholder="搜索文件…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="version-v9-entry-list">
          {area === "commits"
            ? (log.data ?? []).map((c) => (
                <button key={c.id} type="button" className={commit?.id === c.id ? "active" : ""} data-testid="git-commit" onClick={() => setSelCommit(c.id)}>
                  <GitBranch size={14} aria-hidden />
                  <span>
                    <strong>{c.subject}</strong>
                    <small>
                      {new Date(c.at).toLocaleString("zh-CN")} · <code>{c.short}</code> · {c.author}
                    </small>
                  </span>
                </button>
              ))
            : shown.map((f) => (
                <div key={`${area}-${f.path}`} className={`version-v9-file-row${target?.path === f.path ? " active" : ""}`} data-testid={area === "staged" ? "git-staged" : "git-change"}>
                  <button type="button" className={target?.path === f.path ? "active" : ""} onClick={() => setSelPath(f.path)}>
                    <FileText size={14} aria-hidden />
                    <span>
                      <strong>{f.path.split("/").at(-1)}</strong>
                      <small>
                        {f.index === "?" ? "未跟踪" : f.worktree === "D" || f.index === "D" ? "已删除" : "已修改"} · {f.path}
                      </small>
                    </span>
                  </button>
                  {area === "staged" ? <Button onClick={() => void act("git.unstage", { paths: [f.path] })}>{t.git.unstage}</Button> : <Button onClick={() => void act("git.stage", { paths: [f.path] })}>{t.git.stage}</Button>}
                </div>
              ))}
          {area !== "commits" && shown.length === 0 ? <p className="version-v9-empty">{files.length === 0 ? t.git.clean : "此区域没有变更"}</p> : null}
          {area === "commits" && (log.data ?? []).length === 0 ? <p className="version-v9-empty">尚无提交</p> : null}
        </div>
        <p className="version-v9-note">工作区、暂存区和提交分别保存。暂存后的新编辑仍留在工作区。</p>
      </aside>
      <main className="version-v9-main">
        {error ? (
          <p role="alert" className="version-v9-error">
            {error}
          </p>
        ) : null}
        <div className="version-v9-diff-heading">
          <div>
            <FileText size={15} aria-hidden />
            <strong>{area === "commits" ? (commit?.subject ?? "—") : (target?.path ?? "—")}</strong>
          </div>
        </div>
        {diff.data?.diff ? <PatchView patch={diff.data.diff} /> : <EmptyState icon={GitBranch} title="当前没有可比较的变更" hint="查看和预览不会改写文件。" />}
        <details className="version-v9-manual" open={area === "staged"}>
          <summary>手动暂存与提交</summary>
          <form
            className="version-v9-sidebar-actions"
            onSubmit={(e) => {
              e.preventDefault();
              if (msg.trim() && staged.length) void act("git.commit", { message: msg }).then((r) => r !== null && setMsg(""));
            }}
          >
            <input aria-label={t.git.message} placeholder={t.git.message} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!msg.trim() || staged.length === 0}>
              {t.git.commit}
            </Button>
          </form>
        </details>
      </main>
    </div>
  );
}
