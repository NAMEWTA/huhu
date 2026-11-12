import { DatabaseSync } from "node:sqlite";

const CJK = /[㐀-鿿豈-﫿]/;

/** 中日韩文本按二元切分，其余按空白/标点分词并小写。 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const chunk of text.toLowerCase().split(/[\s\p{P}\p{S}]+/u)) {
    if (!chunk) continue;
    let run = "";
    const flush = () => {
      if (run.length === 1) tokens.push(run);
      for (let i = 0; i + 1 < run.length; i++) tokens.push(run.slice(i, i + 2));
      run = "";
    };
    let word = "";
    for (const ch of chunk) {
      if (CJK.test(ch)) {
        if (word) {
          tokens.push(word);
          word = "";
        }
        run += ch;
      } else {
        flush();
        word += ch;
      }
    }
    flush();
    if (word) tokens.push(word);
  }
  return tokens;
}

export interface SearchDoc {
  path: string;
  kind: string;
  title: string;
  body: string;
  tags: string;
}

export interface SearchHit {
  path: string;
  kind: string;
  title: string;
  score: number;
}

/**
 * 全文索引：Node 内置的 SQLite（`node:sqlite`）+ FTS5，内存库。倒排表由 SQLite 紧凑存放，不占 Engine 的 JS 堆
 * （原先的 JS 对象索引在 10,000 篇笔记时常驻内存超过 600 MiB 目标）。
 * 分词仍是本文件的 `tokenize`（中文二元切分、英文小写）：写入时把每个字段变成去重后的词表（空格分隔），
 * FTS5 只负责按空格切分与前缀匹配；查询用同一分词器，每个词都要命中（任意字段）。
 * 打分用 bm25，标题权重 3、标签 2、正文与路径 1。 */
export class SearchIndex {
  private db = SearchIndex.open();
  private ids = new Map<string, number>();

  private static open(): DatabaseSync {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, kind UNINDEXED, title UNINDEXED, ftitle, fbody, ftags, fpath, tokenize = 'unicode61 remove_diacritics 0')`);
    return db;
  }

  /** 词表：去重后以空格连接；FTS5 的 unicode61 分词器会按空白与标点再切一次，词内不含这些字符，所以与 `tokenize` 的结果一致。 */
  private static words(text: string): string {
    return [...new Set(tokenize(text))].join(" ");
  }

  upsert(doc: SearchDoc): void {
    this.removePath(doc.path);
    const r = this.db
      .prepare("INSERT INTO docs(path, kind, title, ftitle, fbody, ftags, fpath) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(doc.path, doc.kind, doc.title, SearchIndex.words(doc.title), SearchIndex.words(doc.body), SearchIndex.words(doc.tags), SearchIndex.words(doc.path));
    this.ids.set(doc.path, Number(r.lastInsertRowid));
  }

  removePath(p: string): void {
    const id = this.ids.get(p);
    if (id !== undefined) {
      this.db.prepare("DELETE FROM docs WHERE rowid = ?").run(id);
      this.ids.delete(p);
    }
  }

  clear(): void {
    this.db.close();
    this.db = SearchIndex.open();
    this.ids.clear();
  }

  /** 释放数据库（索引被新建的一份替换后调用）。 */
  close(): void {
    if (this.db.isOpen) this.db.close();
    this.ids.clear();
  }

  get size(): number {
    return this.ids.size;
  }

  query(term: string, opts: { kind?: string; limit?: number } = {}): SearchHit[] {
    const toks = [...new Set(tokenize(term))];
    if (toks.length === 0) return [];
    // 每个词：双引号包住（词里的双引号翻倍），加 * 表示前缀；词之间是 AND
    const match = toks.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" AND ");
    const rows = this.db
      .prepare(`SELECT path, kind, title, -bm25(docs, 0, 0, 0, 3.0, 1.0, 2.0, 1.0) AS score FROM docs WHERE docs MATCH ?${opts.kind ? " AND kind = ?" : ""} ORDER BY score DESC LIMIT ?`)
      .all(match, ...(opts.kind ? [opts.kind] : []), opts.limit ?? 50) as { path: string; kind: string; title: string; score: number }[];
    return rows.map((r) => ({ path: r.path, kind: r.kind, title: r.title, score: r.score }));
  }
}
