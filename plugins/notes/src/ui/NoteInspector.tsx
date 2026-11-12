import { Button, EmptyState, IconButton } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { ArrowUpRight, Database, FileText, ListChecks, X } from "lucide-react";
import { ChoiceSegmented } from "@huhu/ui";
import { CommentsPanel, type CommentActions, type CommentView } from "./CommentsPanel.js";
import { n } from "./i18n.js";

export type InspectorTab = "properties" | "outline" | "links" | "comments" | "history";
type Tab = InspectorTab;

/** 文档详情抽屉（原型 knowledge-inspector）：属性 / 大纲 / 关联（反向链接）/ 历史（由版本历史模块提供）。 */
export function NoteInspector({
  path,
  text,
  tags,
  tab,
  onTab,
  comments,
  activeComment,
  commentActions,
  readOnly,
  onClose,
  onOpen,
  onJump,
  onOpenHistory,
  onNavigate,
}: {
  path: string;
  text: string;
  tags: string[];
  tab: InspectorTab;
  onTab(t: InspectorTab): void;
  comments: CommentView[];
  activeComment: string | null;
  commentActions: CommentActions;
  readOnly: boolean;
  onClose(): void;
  onOpen(path: string): void;
  onJump(line: number): void;
  onOpenHistory(): void;
  /** 跳到其他模块（关联任务 / 档案）。 */
  onNavigate?(module: string): void;
}) {
  const setTab = onTab;
  const backlinks = useCapability<{ path: string; title: string }[]>("notes.backlinks", { path });
  const headings = text
    .split("\n")
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /^#{1,6}\s+\S/.test(l))
    .map(({ l, i }) => ({ level: (/^#+/.exec(l)?.[0].length ?? 1) as number, title: l.replace(/^#+\s+/, ""), line: i + 1 }));
  const title = n.props.tabs[tab];
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "根目录";
  return (
    <aside className="knowledge-inspector" aria-label={n.props.title} data-region="detail" data-testid="note-inspector">
      <header>
        <h3>{tab === "properties" ? n.props.title : tab === "outline" ? n.props.outline : tab === "links" ? n.props.links : tab === "comments" ? n.props.comments : n.props.history}</h3>
        <IconButton icon={X} label="关闭文档详情" onClick={onClose} />
      </header>
      <div className="knowledge-inspector-nav">
        <ChoiceSegmented label="详情分区" value={tab} onChange={(id) => setTab(id as Tab)} items={(Object.keys(n.props.tabs) as Tab[]).map((id) => ({ id, label: n.props.tabs[id] }))} />
      </div>
      <div className="knowledge-inspector-scroll" aria-label={title}>
        {tab === "properties" ? (
          <section>
            <h4>{n.basic}</h4>
            <dl className="knowledge-property-grid">
              <div>
                <dt>{n.fTitle}</dt>
                <dd>{path.split("/").at(-1)?.replace(/\.md$/, "")}</dd>
              </div>
              <div>
                <dt>{n.fFolder}</dt>
                <dd>{folder}</dd>
              </div>
              <div>
                <dt>{n.fTags}</dt>
                <dd>{tags.length ? tags.map((t) => `#${t}`).join(" ") : "—"}</dd>
              </div>
            </dl>
          </section>
        ) : tab === "outline" ? (
          headings.length ? (
            <div className="knowledge-outline">
              {headings.map((h) => (
                <button key={`${h.line}-${h.title}`} type="button" style={{ paddingLeft: 8 + (h.level - 1) * 12 }} onClick={() => onJump(h.line)}>
                  {h.title}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={FileText} title={n.outlineEmpty} hint={n.outlineEmptyHint} />
          )
        ) : tab === "links" ? (
          <section className="knowledge-detail-section">
            <h4>{n.backlinksN((backlinks.data ?? []).length)}</h4>
            {(backlinks.data ?? []).map((b) => (
              <button key={b.path} type="button" className="knowledge-link-row" onClick={() => onOpen(b.path)}>
                <FileText size={15} aria-hidden />
                <span>{b.title}</span>
                <ArrowUpRight size={13} aria-hidden />
              </button>
            ))}
            {(backlinks.data ?? []).length === 0 ? <p className="small muted">{n.noBacklinks}</p> : null}
            <RelatedSections path={path} onNavigate={onNavigate} />
          </section>
        ) : tab === "comments" ? (
          <CommentsPanel comments={comments} active={activeComment} readOnly={readOnly} actions={commentActions} />
        ) : (
          <EmptyState
            icon={FileText}
            title={n.historyEmpty}
            action={
              <Button variant="primary" onClick={onOpenHistory}>
                打开版本历史
              </Button>
            }
          />
        )}
      </div>
    </aside>
  );
}

/** 关联任务 / 档案：只在“关联”分区打开时才查询（Vault 很大时 notes.list 不便宜）；插件停用时对应查询失败，分区不显示。 */
function RelatedSections({ path, onNavigate }: { path: string; onNavigate?: ((module: string) => void) | undefined }) {
  const allNotes = useCapability<{ path: string; id: string | null }[]>("notes.list", { filter: "all" });
  const noteId = (allNotes.data ?? []).find((x) => x.path === path)?.id ?? null;
  const tasks = useCapability<{ id: string; title: string; completed: boolean; resources: { kind: string; path: string }[] }[]>("tasks.list", { category: "all" });
  const archives = useCapability<{ id: string; name: string; type: string; noteIds: string[] }[]>("archives.list", {});
  const relatedTasks = (tasks.data ?? []).filter((x) => x.resources.some((r) => r.path === path || (r.kind === "folder" && r.path !== "" && path.startsWith(`${r.path}/`))));
  const relatedArchives = noteId ? (archives.data ?? []).filter((x) => x.noteIds.includes(noteId)) : [];
  return (
    <>
      {!tasks.isError ? (
        <>
          <h4>{n.relatedTasksN(tasks.data ? relatedTasks.length : null)}</h4>
          {relatedTasks.map((x) => (
            <button key={x.id} type="button" className="knowledge-link-row" data-testid="related-task" onClick={() => onNavigate?.("tasks")}>
              <ListChecks size={15} aria-hidden />
              <span>{x.completed ? `✓ ${x.title}` : x.title}</span>
              <ArrowUpRight size={13} aria-hidden />
            </button>
          ))}
          {relatedTasks.length === 0 ? <p className="small muted">{n.noRelatedTasks}</p> : null}
        </>
      ) : null}
      {!archives.isError ? (
        <>
          <h4>{n.relatedArchivesN(archives.data ? relatedArchives.length : null)}</h4>
          {relatedArchives.map((x) => (
            <button key={x.id} type="button" className="knowledge-link-row" data-testid="related-archive" onClick={() => onNavigate?.("archives")}>
              <Database size={15} aria-hidden />
              <span>{x.name}</span>
              <ArrowUpRight size={13} aria-hidden />
            </button>
          ))}
          {relatedArchives.length === 0 ? <p className="small muted">{n.noRelatedArchives}</p> : null}
        </>
      ) : null}
    </>
  );
}
