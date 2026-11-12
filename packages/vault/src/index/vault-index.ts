import { readFileSync } from "node:fs";
import path from "node:path";
import { splitDocument, parseFrontmatter } from "../semantic/frontmatter.js";
import { isIgnored, takeSnapshot } from "../watch/snapshot.js";
import { parseTags, parseWikiLinks, type WikiLink } from "./links.js";
import { SearchIndex, type SearchHit } from "./search.js";

const MAX_INDEX_BYTES = 10 * 1024 * 1024;

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size: number;
  mtimeMs: number;
}

interface NoteMeta {
  path: string;
  title: string;
  tags: string[];
  links: WikiLink[];
}

export interface BuildProgress {
  indexing: boolean;
}

/** 内存索引：路径树、笔记元数据、反链、全文检索。构建可取消，取消保留旧索引。 */
export class VaultIndex {
  private tree = new Map<string, TreeEntry>();
  private notes = new Map<string, NoteMeta>();
  private search = new SearchIndex();
  private _indexing = false;
  private cancelRequested = false;
  /** 已经完成过一次内容索引（之后重建才有“旧索引”可以保留）。 */
  private built = false;
  /** 重建期间被监听器/自写更新过的路径：新索引换上后按磁盘现状补一遍，避免这些更新被整体替换冲掉。 */
  private dirty = new Set<string>();

  constructor(private readonly root: string) {}

  get indexing(): boolean {
    return this._indexing;
  }

  /** 先同步给出路径树，再后台（分批让出事件循环）建立内容索引。 */
  async build(): Promise<boolean> {
    const snap = takeSnapshot(this.root, false);
    this.tree = this.treeFrom(snap);
    return this.rebuildContent([...snap.keys()]);
  }

  /** 重建；返回 false 表示被取消（旧索引保持不变）。 */
  async reindex(): Promise<boolean> {
    return this.build();
  }

  /** 是否有已完成的旧索引（首次建立索引时取消没有意义：取消后搜索会是空的）。 */
  get hasContentIndex(): boolean {
    return this.built;
  }

  /** 取消正在进行的重建；首次建立索引不可取消（没有旧索引可保留）。 */
  cancel(): void {
    if (this.built) this.cancelRequested = true;
  }

  private treeFrom(snap: ReturnType<typeof takeSnapshot>): Map<string, TreeEntry> {
    const t = new Map<string, TreeEntry>();
    for (const [p, info] of snap) {
      t.set(p, { path: p, type: "file", size: info.size, mtimeMs: info.mtimeMs });
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!t.has(d)) t.set(d, { path: d, type: "dir", size: 0, mtimeMs: 0 });
      }
    }
    return t;
  }

  private async rebuildContent(paths: string[]): Promise<boolean> {
    this._indexing = true;
    this.cancelRequested = false;
    this.dirty.clear();
    const nextNotes = new Map<string, NoteMeta>();
    const nextSearch = new SearchIndex();
    try {
      let i = 0;
      for (const p of paths) {
        if (++i % 50 === 0) {
          await new Promise((r) => setImmediate(r));
          if (this.cancelRequested) return false;
        }
        this.indexFile(p, nextNotes, nextSearch);
      }
      this.notes = nextNotes;
      this.search = nextSearch;
      this.built = true;
      this._indexing = false;
      const touched = [...this.dirty];
      this.dirty.clear();
      this.refreshPaths(touched);
      return true;
    } finally {
      this._indexing = false;
    }
  }

  private indexFile(rel: string, notes: Map<string, NoteMeta>, search: SearchIndex): void {
    const ext = path.extname(rel).toLowerCase();
    const entry = this.tree.get(rel);
    const base = path.basename(rel, ext);
    if (ext !== ".md" && ext !== ".txt") {
      search.upsert({ path: rel, kind: "file", title: base, body: "", tags: "" });
      return;
    }
    if ((entry?.size ?? 0) > MAX_INDEX_BYTES) {
      search.upsert({ path: rel, kind: "note", title: base, body: "", tags: "" });
      return;
    }
    let text = "";
    try {
      text = readFileSync(path.join(this.root, rel), "utf8");
    } catch {
      return; // 读取时文件已消失：下一批监听事件会处理
    }
    const fm = parseFrontmatter(text);
    const body = splitDocument(text).body;
    const huhuKind = (fm.data["huhu"] as { kind?: string } | undefined)?.kind;
    const title = typeof fm.data["title"] === "string" ? (fm.data["title"] as string) : (/^#\s+(.+)$/m.exec(body)?.[1] ?? base);
    const fmTags = Array.isArray(fm.data["tags"]) ? (fm.data["tags"] as unknown[]).map(String) : [];
    const tags = [...new Set([...fmTags, ...parseTags(body)])];
    const links = parseWikiLinks(body);
    if (!huhuKind) notes.set(rel, { path: rel, title, tags, links });
    search.upsert({ path: rel, kind: huhuKind ?? "note", title, body, tags: tags.join(" ") });
  }

  /**
   * 对账：按磁盘现状补上“建立索引的快照”与“监听器启动”之间发生的变化（监听器以自己的快照为基线，不会报告这段时间的写入）。
   * 返回有变化的路径数；Engine 在监听器启动后调用一次。
   */
  reconcile(): { path: string; change: "created" | "modified" | "deleted" }[] {
    const snap = takeSnapshot(this.root, false);
    const changes: { path: string; change: "created" | "modified" | "deleted" }[] = [];
    for (const [p, info] of snap) {
      const known = this.tree.get(p);
      if (!known || known.type !== "file") changes.push({ path: p, change: "created" });
      else if (known.size !== info.size || known.mtimeMs !== info.mtimeMs) changes.push({ path: p, change: "modified" });
    }
    for (const [p, e] of this.tree) if (e.type === "file" && !snap.has(p)) changes.push({ path: p, change: "deleted" });
    if (changes.length > 0) this.applyChanges(changes);
    return changes;
  }

  /** 监听事件的增量更新。 */
  applyChanges(changes: { path: string; change: "created" | "modified" | "deleted" | "renamed"; from?: string }[]): void {
    if (this._indexing)
      for (const c of changes) {
        this.dirty.add(c.path);
        if (c.from) this.dirty.add(c.from);
      }
    for (const c of changes) {
      if (isIgnored(c.path)) continue;
      if (c.change === "deleted" || c.change === "renamed") {
        const gone = c.change === "deleted" ? c.path : (c.from as string);
        this.tree.delete(gone);
        this.notes.delete(gone);
        this.search.removePath(gone);
      }
      if (c.change !== "deleted") {
        const snap = takeSnapshot(path.join(this.root, path.dirname(c.path) === "." ? "" : path.dirname(c.path)), false);
        const info = snap.get(path.basename(c.path));
        if (info) {
          this.tree.set(c.path, { path: c.path, type: "file", size: info.size, mtimeMs: info.mtimeMs });
          const parts = c.path.split("/");
          for (let i = 1; i < parts.length; i++) {
            const d = parts.slice(0, i).join("/");
            if (!this.tree.has(d)) this.tree.set(d, { path: d, type: "dir", size: 0, mtimeMs: 0 });
          }
          this.indexFile(c.path, this.notes, this.search);
        }
      }
    }
  }

  /** 自写操作后按磁盘现状刷新指定路径（监听器会过滤自写回声，索引需要主动更新）。 */
  refreshPaths(paths: string[]): void {
    for (const p of paths) {
      let exists = false;
      try {
        exists = takeSnapshot(path.join(this.root, path.dirname(p) === "." ? "" : path.dirname(p)), false).has(path.basename(p));
      } catch {
        // 父目录已不存在（例如文件夹被整体移走）：按已删除处理
      }
      this.applyChanges([{ path: p, change: exists ? "modified" : "deleted" }]);
    }
  }

  entries(prefix = ""): TreeEntry[] {
    return [...this.tree.values()].filter((e) => !prefix || e.path === prefix || e.path.startsWith(`${prefix}/`)).sort((a, b) => a.path.localeCompare(b.path));
  }

  query(term: string, opts: { kind?: string; limit?: number } = {}): { indexing: boolean; hits: SearchHit[] } {
    return { indexing: this._indexing, hits: this.search.query(term, opts) };
  }

  /** 反向链接：按目标笔记的文件名（不含扩展名）或完整路径匹配。 */
  backlinks(targetPath: string): { path: string; title: string }[] {
    const base = path.basename(targetPath, path.extname(targetPath));
    const noExt = targetPath.replace(/\.[^./]+$/, "");
    return [...this.notes.values()].filter((n) => n.path !== targetPath && n.links.some((l) => l.target === base || l.target === noExt || l.target === targetPath)).map((n) => ({ path: n.path, title: n.title }));
  }

  /** 全部标签及出现的笔记数（标签云用）。 */
  allTags(): { tag: string; count: number }[] {
    const m = new Map<string, number>();
    for (const n of this.notes.values()) for (const t of new Set(n.tags)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  tagsOf(rel: string): string[] {
    return this.notes.get(rel)?.tags ?? [];
  }

  counts(): Record<string, number> {
    let files = 0;
    for (const e of this.tree.values()) if (e.type === "file") files++;
    return { files, notes: this.notes.size };
  }
}
