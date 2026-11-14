import { Button, EmptyState, IconButton, SearchBox } from "@huhu/ui";
import { Archive, CalendarDays, ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Hash, MoreHorizontal, Star, Trash2, Upload } from "lucide-react";
import { VaultSwitchDialog, host } from "@huhu/workbench";
import { useMemo, useRef, useState } from "react";
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
  /** 点击文件夹名称（没有 index.md 的文件夹）：宿主可据此打开文件夹视图（例如档案首页）。 */
  onFolderClick?(path: string): void;
  /** 打开档案首页。 */
  onOpenArchives?(): void;
  onNewNote(folder?: string): void;
  /** 拖放移动：把笔记拖到文件夹（dir = 文件夹路径）或空白处（dir = ""，Vault 根）。 */
  onMoveNote(path: string, dir: string): void;
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
  const tree = useMemo(() => buildTree(p.notes, p.section === "all" ? p.folders : []), [p.notes, p.folders, p.section]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const caption = p.query ? n.caption.search(p.notes.length) : n.caption[p.section];

  const trash = p.section === "trash";
  const MIME = "application/x-huhu-file";
  const dropOn = (e: React.DragEvent<HTMLElement>, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("is-drop-target");
    if (trash) return;
    // 从系统里拖进来的 .md / .txt 文件：导入到 Vault（与“导入”按钮同一条路径；导入目录由导入流程决定，不随拖到的文件夹变化）
    if (dir === "" && e.dataTransfer.files.length > 0 && !e.dataTransfer.getData(MIME)) {
      p.onImport(e.dataTransfer.files);
      return;
    }
    try {
      const v = JSON.parse(e.dataTransfer.getData(MIME) || "null") as { kind?: string; path?: string } | null;
      if ((v?.kind === "note" || v?.kind === "folder") && v.path) p.onMoveNote(v.path, dir);
    } catch {
      /* 不是我们的拖动内容：忽略 */
    }
  };
  const dropProps = (dir: string) => ({
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (trash) return;
      e.preventDefault();
      e.currentTarget.classList.add("is-drop-target");
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => e.currentTarget.classList.remove("is-drop-target"),
    onDrop: (e: React.DragEvent<HTMLElement>) => dropOn(e, dir),
  });

  const fileRow = (note: NoteRef, depth: number) => (
    <div key={note.path} className={`hu-knowledge-tree-line${note.path === p.selected ? " is-selected" : ""}`} style={{ ["--tree-depth" as string]: depth }}>
      <button
        type="button"
        aria-current={note.path === p.selected ? "true" : undefined}
        className="notes-tree-item"
        data-testid={note.file ? "file-item" : "note-item"}
        draggable={!trash && !note.file}
        onDragStart={(e) => (e.dataTransfer.setData(MIME, JSON.stringify({ kind: "note", path: note.path })), (e.dataTransfer.effectAllowed = "move"))}
        onClick={() => p.onOpen(note.path)}
      >
        <span className="notes-tree-spacer" />
        <FileText size={15} aria-hidden />
        <span className="notes-tree-label">{note.title}</span>
        {note.file ? null : <span className="notes-tree-extension">.md</span>}
        {note.favorite ? <Star size={11} className="notes-star" aria-label="已星标" /> : null}
      </button>
      {note.file ? null : <IconButton icon={MoreHorizontal} label={`文件操作 ${note.title}`} className="hu-knowledge-tree-more" onClick={(e) => (e.stopPropagation(), p.onMenu(note, e.currentTarget))} />}
    </div>
  );
  const folderRow = (node: TreeNode, depth: number): React.ReactNode => {
    const open = p.expanded.has(node.path);
    // 文件夹笔记：带 index.md 的文件夹，点击名称打开 index.md，点击箭头展开或折叠
    const indexNote = trash ? undefined : node.notes.find((x) => /^index\.md$/i.test(x.path.split("/").at(-1) ?? ""));
    const chevron = open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />;
    return (
      <div key={node.path} className="knowledge-tree-folder">
        <div
          className={`hu-knowledge-tree-line notes-folder-line${indexNote ? " notes-has-folder-note" : ""}${indexNote && indexNote.path === p.selected ? " is-selected" : ""}`}
          style={{ ["--tree-depth" as string]: depth }}
          data-testid="folder-line"
          {...dropProps(node.path)}
        >
          {indexNote ? (
            <button
              type="button"
              className="notes-tree-chevron"
              style={{ ["--tree-depth" as string]: depth }}
              aria-label={`${open ? "折叠" : "展开"} ${node.name}`}
              aria-expanded={open}
              data-testid="folder-toggle"
              onClick={() => p.onToggleFolder(node.path)}
            >
              {chevron}
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={indexNote ? undefined : open}
            className="notes-tree-item"
            data-testid={indexNote ? "folder-note-item" : undefined}
            draggable={!trash}
            onDragStart={(e) => (e.dataTransfer.setData(MIME, JSON.stringify({ kind: "folder", path: node.path })), (e.dataTransfer.effectAllowed = "move"))}
            onClick={() => (indexNote ? (p.onOpen(indexNote.path), !open && p.onToggleFolder(node.path)) : (p.onFolderClick?.(node.path), p.onToggleFolder(node.path)))}
          >
            {indexNote ? null : chevron}
            {open ? <FolderOpen size={15} aria-hidden /> : <Folder size={15} aria-hidden />}
            {indexNote ? <i className="notes-folder-note-mark" aria-hidden /> : null}
            <span className="notes-tree-label">{node.name}</span>
            <small>{count(node)}</small>
          </button>
          <IconButton icon={FilePlus2} label={`在 ${node.path} 新建笔记`} className="hu-knowledge-tree-more" onClick={() => p.onNewNote(node.path)} />
          <IconButton
            icon={MoreHorizontal}
            label={`文件夹操作 ${node.name}`}
            className="hu-knowledge-tree-more"
            onClick={(e) => (e.stopPropagation(), p.onMenu({ path: node.path, id: null, title: node.name, folder: true }, e.currentTarget))}
          />
        </div>
        {open ? (
          <div role="group">
            {[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).map((f) => folderRow(f, depth + 1))}
            {node.notes.sort((a, b) => a.title.localeCompare(b.title)).map((note) => fileRow(note, depth + 1))}
            {node.folders.size === 0 && node.notes.length === 0 ? (
              <button type="button" className="notes-tree-empty" style={{ paddingLeft: 32 + (depth + 1) * 16 }} onClick={() => p.onNewNote(node.path)}>
                {n.emptyFolder}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

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
          <strong className="grow">{n.explorer}</strong>
          {!trash ? (
            <>
              <IconButton icon={FilePlus2} label={n.newNote} onClick={() => p.onNewNote()} />
              <IconButton icon={FolderPlus} label={n.newFolder} onClick={() => p.onNewFolder()} />
              {p.onOpenArchives ? <IconButton icon={Archive} label="档案" data-testid="notes-open-archives" onClick={p.onOpenArchives} /> : null}
            </>
          ) : null}
        </div>
        <SearchBox value={p.query} onChange={p.onQuery} placeholder={n.searchPlaceholder} />
        <div className="notes-explorer-filters" role="tablist" aria-label="文件分类">
          {SECTIONS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={p.section === s} className={p.section === s ? "active" : ""} data-testid={`notes-section-${s}`} onClick={() => p.onSection(s)}>
              <SectionIcon section={s} />
              <span>{n.sections[s]}</span>
            </button>
          ))}
        </div>
      </div>
      {p.section === "daily" ? (
        <div className="hu-knowledge-daily-picker">
          <input type="date" aria-label={n.dailyDate} value={p.dailyDate} onChange={(e) => p.onDailyDate(e.target.value)} />
          <Button icon={FilePlus2} onClick={() => p.onOpenDaily(p.dailyDate)}>
            {n.dailyOpen}
          </Button>
        </div>
      ) : null}
      {p.section === "tags" ? (
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
      <div className="hu-resource-list notes-explorer-tree" data-testid="notes-explorer-tree" {...dropProps("")} role={p.notes.length > 0 ? "group" : undefined} aria-label={p.notes.length > 0 ? caption : undefined}>
        <div className="notes-list-caption">
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
