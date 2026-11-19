import { Button, EmptyState, IconButton, SearchBox } from "@huhu/ui";
import { Archive, CalendarDays, ChevronDown, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Hash, MoreHorizontal, Star, Trash2, Upload } from "lucide-react";
import { VaultSwitchDialog, host } from "@huhu/workbench";
import { useRef, useState } from "react";
import { ResourceTree } from "./explorer/ResourceTree.js";
import { n } from "./i18n.js";

export interface NoteRef {
  path: string;
  id: string | null;
  title: string;
  trashId?: string;
  deletedAt?: string;
  favorite?: boolean;
  tags?: string[];
  /** 文件夹（只在文件资源管理器的菜单里用，path 是文件夹路径）。 */
  folder?: boolean;
  /** 非 Markdown 文件（图片、日志……）：只显示元信息，不当作文本加载。 */
  file?: { size: number; mtimeMs: number };
}
export type Section = "all" | "favorites" | "daily" | "tags" | "trash";
const SECTIONS: Section[] = ["all", "favorites", "daily", "tags", "trash"];
const SECTION_ICON = { all: Folder, favorites: Star, daily: CalendarDays, tags: Hash, trash: Trash2 } as const;

export interface ExplorerProps {
  vaultName: string;
  section: Section;
  onSection(s: Section): void;
  notes: NoteRef[];
  allCount: number;
  tags: { tag: string; count: number }[];
  tag: string | null;
  onTag(t: string | null): void;
  query: string;
  onQuery(q: string): void;
  selected: string | null;
  onOpen(path: string): void;
  /** 点击文件夹名称（没有 index.md 的文件夹）：宿主可据此打开文件夹视图（例如档案首页）。 */
  onFolderClick?(path: string): void;
  /** 点击顶部“档案”分区：打开 / 聚焦档案首页标签（S6）。 */
  onOpenArchives?(): void;
  /** 活动标签属于档案时侧栏切到档案上下文（S6，E02）：分区条高亮“档案”，树区域换成 `archivesPanel`。 */
  archivesActive?: boolean;
  archivesPanel?: React.ReactNode;
  onNewNote(folder?: string): void;
  /** A08：树里的移动 / 重命名 / 复制 / 删除之前，先落盘打开着的相关文档；false = 取消。 */
  beforeMutate(paths: string[]): Promise<boolean>;
  /** 树里的内部改名 / 移动完成：标签、选中项重定位。 */
  onMoved(moved: Record<string, string>): void;
  onTrashed?: ((path: string, trashId: string) => void) | undefined;
  onMenuAction(action: "move" | "favorite" | "version", path: string, kind: "file" | "folder"): void;
  isFavorite(path: string): boolean;
  onNewFolder(parent?: string): void;
  onMenu(note: NoteRef, anchor: HTMLElement): void;
  onOpenDaily(date: string): void;
  onImport(files: FileList): void;
  dailyDate: string;
  onDailyDate(d: string): void;
}

function SectionIcon({ section }: { section: Section }) {
  const Icon = SECTION_ICON[section];
  return <Icon size={13} aria-hidden />;
}

/** 左侧资源栏（原型 knowledge-note-list）：Vault 头 → 文件资源管理器（新建 / 搜索 / 分类）→ 文件树 / 标签云 / 日记选择 → 底部导入。 */
export function NoteExplorer(p: ExplorerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const caption = p.query ? n.caption.search(p.notes.length) : n.caption[p.section];

  const trash = p.section === "trash";
  const fileRow = (note: NoteRef, depth: number) => (
    <div key={note.path} className={`hu-knowledge-tree-line${note.path === p.selected ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: depth }}>
      <button type="button" aria-current={note.path === p.selected ? "true" : undefined} className="notes-tree-item" data-testid={note.file ? "file-item" : "note-item"} onClick={() => p.onOpen(note.path)}>
        <span className="notes-tree-spacer" />
        <FileText size={15} aria-hidden />
        <span className="notes-tree-label">{note.title}</span>
        {note.file ? null : <span className="notes-tree-extension">.md</span>}
        {note.favorite ? <Star size={11} className="notes-star" aria-label="已星标" /> : null}
      </button>
      {note.file ? null : <IconButton icon={MoreHorizontal} label={`文件操作 ${note.title}`} className="hu-knowledge-tree-more" onClick={(e) => (e.stopPropagation(), p.onMenu(note, e.currentTarget))} />}
    </div>
  );
  return (
    <aside className="hu-resource-pane notes-note-list" aria-label="知识库">
      <div className="notes-vault-head">
        <button type="button" title="切换 Vault" data-testid="notes-vault-switch" disabled={!host()?.vault} onClick={() => setSwitchOpen(true)}>
          <span className="notes-vault-symbol">
            <FolderOpen size={17} aria-hidden />
          </span>
          <span>
            <strong>{p.vaultName}</strong>
            <small>{n.vaultSub}</small>
          </span>
          <ChevronDown size={13} aria-hidden />
        </button>
        {host()?.vault ? <VaultSwitchDialog open={switchOpen} onClose={() => setSwitchOpen(false)} /> : null}
      </div>
      <div className="hu-resource-head hu-knowledge-explorer-head">
        <div className="row">
          <strong className="hu-flex-fill">{n.explorer}</strong>
          {!trash ? (
            <>
              <IconButton icon={FilePlus2} label={n.newNote} onClick={() => p.onNewNote()} />
              <IconButton icon={FolderPlus} label={n.newFolder} onClick={() => p.onNewFolder()} />
            </>
          ) : null}
        </div>
        <SearchBox value={p.query} onChange={p.onQuery} placeholder={n.searchPlaceholder} />
        <div className="notes-explorer-filters" role="tablist" aria-label="文件分类">
          {SECTIONS.map((s) => {
            const on = !p.archivesActive && p.section === s;
            return (
              <button key={s} type="button" role="tab" aria-selected={on} className={on ? "active" : ""} data-testid={`notes-section-${s}`} onClick={() => p.onSection(s)}>
                <SectionIcon section={s} />
                <span>{n.sections[s]}</span>
              </button>
            );
          })}
          {p.onOpenArchives ? (
            <button type="button" role="tab" aria-selected={p.archivesActive === true} className={p.archivesActive ? "active" : ""} data-testid="notes-open-archives" onClick={p.onOpenArchives}>
              <Archive size={13} aria-hidden />
              <span>{n.sections.archives}</span>
            </button>
          ) : null}
        </div>
      </div>
      {p.archivesActive ? (
        <div className="hu-resource-list notes-explorer-tree" data-testid="notes-archives-tree">
          {p.archivesPanel}
        </div>
      ) : null}
      {!p.archivesActive && p.section === "daily" ? (
        <div className="hu-knowledge-daily-picker">
          <input type="date" aria-label={n.dailyDate} value={p.dailyDate} onChange={(e) => p.onDailyDate(e.target.value)} />
          <Button icon={FilePlus2} onClick={() => p.onOpenDaily(p.dailyDate)}>
            {n.dailyOpen}
          </Button>
        </div>
      ) : null}
      {!p.archivesActive && p.section === "tags" ? (
        <div className="notes-tag-cloud">
          <button type="button" className={`notes-chip${p.tag === null ? " active" : ""}`} onClick={() => p.onTag(null)}>
            {n.allTags}
          </button>
          {p.tags.map((t) => (
            <button key={t.tag} type="button" className={`notes-chip${p.tag === t.tag ? " active" : ""}`} onClick={() => p.onTag(t.tag)}>
              <Hash size={11} aria-hidden /> {t.tag}
            </button>
          ))}
        </div>
      ) : null}
      {p.archivesActive ? null : (
        <div className="hu-resource-list notes-explorer-tree" data-testid="notes-explorer-tree" role={p.notes.length > 0 ? "group" : undefined} aria-label={p.notes.length > 0 ? caption : undefined}>
          <div className="notes-list-caption">
            <button type="button" className="active">
              {caption}
            </button>
            <span>{p.notes.length}</span>
          </div>
          {p.section === "all" && !p.query ? (
            <ResourceTree
              selected={p.selected}
              onOpenFile={p.onOpen}
              onOpenFolder={(path) => p.onFolderClick?.(path)}
              beforeMutate={p.beforeMutate}
              onMoved={p.onMoved}
              onTrashed={p.onTrashed}
              onMenuAction={p.onMenuAction}
              isFavorite={p.isFavorite}
            />
          ) : (
            p.notes.map((note) => fileRow(note, 0))
          )}
          {p.notes.length === 0 && (p.query || p.section !== "all") ? <EmptyState icon={FileText} title={trash ? n.emptyTrash : n.noMatch} /> : null}
        </div>
      )}
      <div className="hu-knowledge-resource-footer">
        <input ref={fileInput} type="file" hidden accept=".md,.markdown,.txt" multiple onChange={(e) => e.target.files && p.onImport(e.target.files)} />
        <Button variant="ghost" icon={Upload} onClick={() => fileInput.current?.click()}>
          {n.import}
        </Button>
        <span>{n.fileCount(p.allCount)}</span>
      </div>
    </aside>
  );
}
