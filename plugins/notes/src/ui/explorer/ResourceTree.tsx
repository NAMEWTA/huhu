import { formatCounts, summarizeCounts, useEngine, useEngineEvents, useCapability } from "@huhu/workbench";
import { EyeOff, Eye } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFilesDeps, type ListedDirState } from "./filesDeps.js";
import { addHiddenRule, removeHiddenRule } from "./hiddenPaths.js";
import { r } from "./i18n.js";
import { useKnowledgeLocale } from "../useKnowledgeLocale.js";

// vendor 编辑器闭包很大：经 package exports 懒加载，notes 模块入口不静态引用（design §12）。
const OkExplorer = lazy(() => import("@huhu/editor/ok-explorer").then((m) => ({ default: m.OkExplorer })));

export interface ResourceTreeProps {
  /** 当前打开的文件路径（树据此高亮）。 */
  selected: string | null;
  onOpenFile(path: string, restricted?: boolean): void;
  onOpenFolder(path: string): void;
  /** A08：移动 / 重命名 / 复制 / 删除之前，先把打开着的相关文档落盘；false = 失败，操作取消。 */
  beforeMutate(paths: string[]): Promise<boolean>;
  /** 内部改名 / 移动完成后的重定位（标签、选中项、展开状态）。 */
  onMoved(moved: Record<string, string>): void;
  onTrashed?: ((path: string, trashId: string) => void) | undefined;
  /** 右键菜单里 Huhu 既有能力（移动到… / 星标 / 保存版本…）：交给宿主打开既有对话框或调用既有能力。 */
  onMenuAction(action: "move" | "favorite" | "version", path: string, kind: "file" | "folder"): void;
  isFavorite(path: string): boolean;
}

function useThemeMode(): "light" | "dark" {
  const read = () => (document.documentElement.dataset.mode === "dark" ? "dark" : "light");
  const [mode, setMode] = useState<"light" | "dark">(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setMode(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    return () => mo.disconnect();
  }, []);
  return mode;
}

/** 文件资源管理器：OK 文件树（真实文件系统）+ Huhu 的隐藏 / 计数。隐藏只作用于这里，`@` / 双链 / 搜索 / 标签不使用它。 */
export function ResourceTree(p: ResourceTreeProps) {
  const engine = useEngine();
  const locale = useKnowledgeLocale();
  const hiddenQ = useCapability<{ hiddenPaths: string[] }>("notes.hidden.get", {});
  const location = useCapability<{ root: string }>("vault.location", {});
  const hidden = useMemo(() => hiddenQ.data?.hiddenPaths ?? [], [hiddenQ.data]);
  const [showHidden, setShowHidden] = useState(false);
  const [managing, setManaging] = useState(false);
  const [token, setToken] = useState(0);
  const loaded = useRef(new Map<string, ListedDirState>());
  const [, bump] = useState(0);
  const mode = useThemeMode();

  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const showRef = useRef(showHidden);
  showRef.current = showHidden;
  const rootRef = useRef("");
  rootRef.current = location.data?.root ?? "";
  const cb = useRef(p);
  cb.current = p;

  // 外部 / 内部写入都会发 entity.changed / vault.dirChanged：树重新列举
  useEngineEvents((e) => {
    if (e.type === "entity.changed" || e.type === "vault.dirChanged" || e.type === "vault.fileChanged") {
      loaded.current.clear();
      setToken((t) => t + 1);
    }
  });
  useEffect(() => {
    loaded.current.clear();
    setToken((t) => t + 1);
  }, [hidden, showHidden]);

  const deps = useMemo(
    () =>
      createFilesDeps({
        engine,
        getHidden: () => hiddenRef.current,
        getShowHidden: () => showRef.current,
        beforeMutate: (paths) => cb.current.beforeMutate(paths),
        onMoved: (m) => cb.current.onMoved(m),
        onTrashed: (path, id) => cb.current.onTrashed?.(path, id),
        onListed: (dir, state) => {
          loaded.current.set(dir, state);
          bump((n) => n + 1);
        },
        getRoot: () => rootRef.current || "/",
      }),
    [engine],
  );

  const writeHidden = useCallback(
    async (next: string[]) => {
      await engine.call("notes.hidden.set", { hiddenPaths: next }, { write: true });
      await hiddenQ.refetch();
    },
    [engine, hiddenQ],
  );
  const onHide = useCallback((path: string) => writeHidden(addHiddenRule(hiddenRef.current, path)), [writeHidden]);
  const onOpen = useCallback((t: { kind: "file" | "folder" | "asset"; path: string; restricted?: boolean }) => (t.kind === "folder" ? cb.current.onOpenFolder(t.path) : cb.current.onOpenFile(t.path, t.restricted)), []);

  const menuItems = useCallback((path: string, kind: "file" | "folder") => {
    const isNote = kind === "file" && /\.md$/i.test(path);
    const act = (a: "move" | "favorite" | "version") => () => cb.current.onMenuAction(a, path, kind);
    return [
      { id: "move", label: r.move, onSelect: act("move") },
      ...(isNote
        ? [
            { id: "favorite", label: cb.current.isFavorite(path) ? r.unfavorite : r.favorite, onSelect: act("favorite") },
            { id: "version", label: r.saveVersion, onSelect: act("version") },
          ]
        : []),
    ];
  }, []);

  const summary = summarizeCounts(loaded.current, hidden);
  const counts = formatCounts(summary);

  return (
    <div className="notes-resource-tree" data-testid="notes-resource-tree">
      <div className="notes-resource-bar">
        <span data-testid="notes-resource-counts" title={counts.note ?? undefined}>
          {r.files(counts.files)} · {r.dirs(counts.dirs)}
          {counts.note ? <em> · {r.partial}</em> : null}
        </span>
        <span className="notes-resource-actions">
          {hidden.length > 0 ? (
            <button type="button" data-testid="notes-hidden-manage" aria-expanded={managing} onClick={() => setManaging((v) => !v)}>
              {r.manageHidden(hidden.length)}
            </button>
          ) : null}
          <button type="button" data-testid="notes-hidden-toggle" aria-pressed={showHidden} title={showHidden ? r.hideAgain : r.showHidden} onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
          </button>
        </span>
      </div>
      {managing && hidden.length > 0 ? (
        <ul className="notes-hidden-list" data-testid="notes-hidden-list" aria-label={r.hiddenTitle}>
          {hidden.map((rule) => (
            <li key={rule}>
              <span title={rule}>{rule}</span>
              <button
                type="button"
                data-testid="notes-hidden-restore"
                onClick={() => {
                  const next = removeHiddenRule(hidden, rule);
                  if (next) void writeHidden(next);
                }}
              >
                {r.restore}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="notes-resource-body" data-testid="notes-resource-body">
        <Suspense fallback={<div className="notes-resource-loading">{r.loading}</div>}>
          <OkExplorer deps={deps} onOpen={onOpen} onHide={onHide} menuItems={menuItems} locale={locale} refreshToken={token} mode={mode} activePath={p.selected} />
        </Suspense>
      </div>
    </div>
  );
}
