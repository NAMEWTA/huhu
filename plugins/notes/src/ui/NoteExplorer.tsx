import { Button, EmptyState, IconButton, SearchBox } from "@huhu/ui";
import { ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Hash, MoreHorizontal, Star, Upload } from "lucide-react";
import { useMemo, useRef } from "react";
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
}
export type Section = "all" | "favorites" | "daily" | "tags" | "trash";
const SECTIONS: Section[] = ["all", "favorites", "daily", "tags", "trash"];

interface TreeNode {
  name: string;
  path: string;
  folders: Map<string, TreeNode>;
  notes: NoteRef[];
}
function buildTree(notes: NoteRef[], folders: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: new Map(), notes: [] };
  const ensure = (parts: string[]): TreeNode => {
    let cur = root;
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      let next = cur.folders.get(part);
      if (!next) {
        next = { name: part, path: p, folders: new Map(), notes: [] };
        cur.folders.set(part, next);
      }
      cur = next;
    });
    return cur;
  };
  for (const f of folders) ensure(f.split("/").filter(Boolean));
  for (const note of notes) {
    const parts = note.path.split("/");
    ensure(parts.slice(0, -1)).notes.push(note);
  }
  return root;
}
const count = (node: TreeNode): number => node.notes.length + [...node.folders.values()].reduce((a, f) => a + count(f), 0);

export interface ExplorerProps {
  vaultName: string;
  section: Section;
  onSection(s: Section): void;
  notes: NoteRef[];
  allCount: number;
  folders: string[];
  tags: { tag: string; count: number }[];
  tag: string | null;
  onTag(t: string | null): void;
  query: string;
  onQuery(q: string): void;
  selected: string | null;
  onOpen(path: string): void;
  expanded: Set<string>;
  onToggleFolder(path: string): void;
  onNewNote(folder?: string): void;
  onNewFolder(parent?: string): void;
  onMenu(note: NoteRef, anchor: HTMLElement): void;
  onOpenDaily(date: string): void;
  onImport(files: FileList): void;
  dailyDate: string;
  onDailyDate(d: string): void;
}

/** 左侧资源栏（原型 knowledge-note-list）：Vault 头 → 文件资源管理器（新建 / 搜索 / 分类）→ 文件树 / 标签云 / 日记选择 → 底部导入。 */
export function NoteExplorer(p: ExplorerProps) {
  const tree = useMemo(() => buildTree(p.notes, p.section === "all" ? p.folders : []), [p.notes, p.folders, p.section]);
  const fileInput = useRef<HTMLInputElement>(null);
  const caption = p.query ? n.caption.search(p.notes.length) : n.caption[p.section];

  const fileRow = (note: NoteRef, depth: number) => (
    <div key={note.path} className={`knowledge-tree-line${note.path === p.selected ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: depth }}>
      <button type="button" role="treeitem" aria-selected={note.path === p.selected} className="knowledge-tree-item" data-testid="note-item" onClick={() => p.onOpen(note.path)}>
        <span className="knowledge-tree-spacer" />
        <FileText size={15} aria-hidden />
        <span className="knowledge-tree-label">{note.title}</span>
        <span className="knowledge-tree-extension">.md</span>
        {note.favorite ? <Star size={11} className="knowledge-star" aria-label="已星标" /> : null}
      </button>
      <IconButton icon={MoreHorizontal} label={`文件操作 ${note.title}`} className="knowledge-tree-more" onClick={(e) => (e.stopPropagation(), p.onMenu(note, e.currentTarget))} />
    </div>
  );
  const folderRow = (node: TreeNode, depth: number): React.ReactNode => {
    const open = p.expanded.has(node.path);
    return (
      <div key={node.path} className="knowledge-tree-folder">
        <div className="knowledge-tree-line knowledge-folder-line" style={{ ["--tree-depth" as string]: depth }}>
          <button type="button" role="treeitem" aria-expanded={open} className="knowledge-tree-item" onClick={() => p.onToggleFolder(node.path)}>
            {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
            {open ? <FolderOpen size={15} aria-hidden /> : <Folder size={15} aria-hidden />}
            <span className="knowledge-tree-label">{node.name}</span>
            <small>{count(node)}</small>
          </button>
          <IconButton icon={FilePlus2} label={`在 ${node.path} 新建笔记`} className="knowledge-tree-more" onClick={() => p.onNewNote(node.path)} />
          <IconButton
            icon={MoreHorizontal}
            label={`文件夹操作 ${node.name}`}
            className="knowledge-tree-more"
            onClick={(e) => (e.stopPropagation(), p.onMenu({ path: node.path, id: null, title: node.name, folder: true }, e.currentTarget))}
          />
        </div>
        {open ? (
          <div role="group">
            {[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((f) => folderRow(f, depth + 1))}
            {node.notes.sort((a, b) => a.title.localeCompare(b.title)).map((note) => fileRow(note, depth + 1))}
            {node.folders.size === 0 && node.notes.length === 0 ? (
              <button type="button" className="knowledge-tree-empty" style={{ paddingLeft: 32 + (depth + 1) * 16 }} onClick={() => p.onNewNote(node.path)}>
                {n.emptyFolder}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };
  const trash = p.section === "trash";

  return (
    <aside className="resource-pane knowledge-note-list" aria-label="知识库">
      <div className="knowledge-vault-head">
        <button type="button" disabled>
          <span className="knowledge-vault-symbol">
            <FolderOpen size={17} aria-hidden />
          </span>
          <span>
            <strong>{p.vaultName}</strong>
            <small>{n.vaultSub}</small>
          </span>
        </button>
      </div>
      <div className="resource-head knowledge-explorer-head">
        <div className="row">
          <strong className="grow">{n.explorer}</strong>
          {!trash ? (
            <>
              <IconButton icon={FilePlus2} label={n.newNote} onClick={() => p.onNewNote()} />
              <IconButton icon={FolderPlus} label={n.newFolder} onClick={() => p.onNewFolder()} />
            </>
          ) : null}
        </div>
        <SearchBox value={p.query} onChange={p.onQuery} placeholder={n.searchPlaceholder} />
        <div className="knowledge-explorer-filters" role="tablist" aria-label="文件分类">
          {SECTIONS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={p.section === s} className={p.section === s ? "active" : ""} data-testid={`notes-section-${s}`} onClick={() => p.onSection(s)}>
              {n.sections[s]}
            </button>
          ))}
        </div>
      </div>
      {p.section === "daily" ? (
        <div className="knowledge-daily-picker">
          <input type="date" aria-label={n.dailyDate} value={p.dailyDate} onChange={(e) => p.onDailyDate(e.target.value)} />
          <Button icon={FilePlus2} onClick={() => p.onOpenDaily(p.dailyDate)}>
            {n.dailyOpen}
          </Button>
        </div>
      ) : null}
      {p.section === "tags" ? (
        <div className="knowledge-tag-cloud">
          <button type="button" className={`chip${p.tag === null ? " active" : ""}`} onClick={() => p.onTag(null)}>
            {n.allTags}
          </button>
          {p.tags.map((t) => (
            <button key={t.tag} type="button" className={`chip${p.tag === t.tag ? " active" : ""}`} onClick={() => p.onTag(t.tag)}>
              <Hash size={11} aria-hidden /> {t.tag}
            </button>
          ))}
        </div>
      ) : null}
      <div className="resource-list knowledge-explorer-tree" role="tree" aria-label={caption}>
        <div className="knowledge-list-caption">
          <button type="button" className="active">
            {caption}
          </button>
          <span>{p.notes.length}</span>
        </div>
        {p.section === "all" && !p.query ? (
          <>
            {[...tree.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((f) => folderRow(f, 0))}
            {tree.notes.sort((a, b) => a.title.localeCompare(b.title)).map((note) => fileRow(note, 0))}
          </>
        ) : (
          p.notes.map((note) => fileRow(note, 0))
        )}
        {p.notes.length === 0 && (p.query || p.section !== "all" || p.folders.length > 0) ? <EmptyState icon={FileText} title={trash ? n.emptyTrash : n.noMatch} /> : null}
        {p.notes.length === 0 && p.section === "all" && !p.query && p.folders.length === 0 ? <EmptyState icon={FileText} title={n.emptyVault} hint={n.emptyVaultHint} /> : null}
      </div>
      <div className="knowledge-resource-footer">
        <input ref={fileInput} type="file" hidden accept=".md,.markdown,.txt" multiple onChange={(e) => e.target.files && p.onImport(e.target.files)} />
        <Button variant="ghost" icon={Upload} onClick={() => fileInput.current?.click()}>
          {n.import}
        </Button>
        <span>{n.fileCount(p.allCount)}</span>
      </div>
    </aside>
  );
}
