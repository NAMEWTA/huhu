import { create, insert, remove, search, type AnyOrama } from "@orama/orama";

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
 * Orama 全文索引；索引与查询用同一分词器，并对词去重：Orama 为每个词做词频计数的做法对重复词是 O(n²)，
 * 1 MiB 的笔记会让全量索引耗时上百秒（Engine 启动超时）。去重后只损失词频打分，复杂度与词表大小成正比。
 * 标题、正文、标签、路径参与检索，查询与文档用同一分词器。 */
export class SearchIndex {
  private db: AnyOrama = this.make();
  private ids = new Map<string, string>();

  private make(): AnyOrama {
    return create({
      schema: { path: "string", kind: "string", title: "string", body: "string", tags: "string" } as const,
      components: { tokenizer: { language: "english", tokenize: (raw: string) => [...new Set(tokenize(raw))], normalizationCache: new Map() } as never },
    });
  }

  upsert(doc: SearchDoc): void {
    this.removePath(doc.path);
    const id = String(insert(this.db, { ...doc, pathText: doc.path } as never));
    this.ids.set(doc.path, id);
  }

  removePath(p: string): void {
    const id = this.ids.get(p);
    if (id !== undefined) {
      remove(this.db, id);
      this.ids.delete(p);
    }
  }

  clear(): void {
    this.db = this.make();
    this.ids.clear();
  }

  get size(): number {
    return this.ids.size;
  }

  query(term: string, opts: { kind?: string; limit?: number } = {}): SearchHit[] {
    const toks = tokenize(term);
    if (toks.length === 0) return [];
    const res = search(this.db, {
      term: toks.join(" "),
      properties: ["title", "body", "tags", "path"],
      boost: { title: 3, tags: 2 },
      limit: opts.limit ?? 50,
      ...(opts.kind ? { where: { kind: opts.kind } } : {}),
      threshold: 0,
    } as never) as { hits: { score: number; document: SearchDoc }[] };
    return res.hits.map((h) => ({ path: h.document.path, kind: h.document.kind, title: h.document.title, score: h.score }));
  }
}
