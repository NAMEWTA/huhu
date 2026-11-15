import type { DocumentKind, SaveState, SetTextOrigin } from "@huhu/contracts";
import { diff3Merge } from "node-diff3";

/**
 * 一个打开文件的唯一写盘 / 冲突 / 草稿 / flush 权威（design §3.1，OP-D03）。
 * 与 React 无关：UI 通过 subscribe + getSnapshot 订阅；引擎调用经 `SessionEngine` 注入，便于单测。
 * 行为与抽取前的 `NoteDocument` 完全一致（自动保存 800 ms、保存串行、离开时落盘或留草稿、冲突三选一）。
 */

export const AUTOSAVE_MS = 800;

export interface SessionEngine {
  call<T>(capability: string, input: unknown, opts?: { write?: boolean }): Promise<T>;
}

export interface SessionDraft {
  text: string;
  baseVersion: string;
  savedAt: string;
}

export interface TextFormat {
  bom: boolean;
  eol: "lf" | "crlf" | "cr" | "mixed" | "none";
  finalNewline: boolean;
}

/** 读取时记录文本格式（BOM / 换行 / 末尾换行）；会话本身永远保存原样字符串，保存时逐字节还原（F02）。 */
export function detectTextFormat(text: string): TextFormat {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const eol: TextFormat["eol"] = kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf > 0 ? "crlf" : lf > 0 ? "lf" : "cr";
  return { bom: text.charCodeAt(0) === 0xfeff, eol, finalNewline: /[\r\n]$/.test(text) };
}

export function documentKindOf(path: string): DocumentKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

export interface SessionSnapshot {
  readonly loaded: boolean;
  readonly text: string;
  readonly state: SaveState;
  readonly baseVersion: string;
  readonly dirtyRevision: number;
  readonly flushError: string | null;
  readonly draft: SessionDraft | null;
  readonly format: TextFormat;
  /** 有未保存编辑（与最近一次落盘内容不同）。 */
  readonly hasUnsaved: boolean;
}

export interface SessionOptions {
  id: { vaultId: string; path: string; epoch: number };
  engine: SessionEngine;
  /** 读取当前“自动保存”设置；默认开启。 */
  autosave?: () => boolean;
  autosaveMs?: number;
  /** 保存成功后（例如使反向链接查询失效）。 */
  onSaved?: () => void;
  /** 磁盘兜底轮询间隔（仅 dirty 时）。0 = 关闭。 */
  pollMs?: number;
}

interface NoteFile {
  path: string;
  text: string;
  version: string;
}

type Listener = () => void;

export class DocumentSession {
  readonly id: SessionOptions["id"];
  readonly kind: DocumentKind;
  private readonly engine: SessionEngine;
  private readonly autosave: () => boolean;
  private readonly autosaveMs: number;
  private readonly pollMs: number;
  private readonly onSaved: (() => void) | undefined;

  private text = "";
  private version = "";
  private savedText: string | null = null;
  private state: SaveState = "saved";
  private revision = 0;
  private flushError: string | null = null;
  private draft: SessionDraft | null = null;
  private format: TextFormat = { bom: false, eol: "none", finalNewline: false };
  private loaded = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<boolean> | null = null;
  private loadSeq = 0;
  private readonly listeners = new Set<Listener>();
  private readonly drainers = new Set<() => void>();
  private snap: SessionSnapshot;

  constructor(opts: SessionOptions) {
    this.id = opts.id;
    this.kind = documentKindOf(opts.id.path);
    this.engine = opts.engine;
    this.autosave = opts.autosave ?? (() => true);
    this.autosaveMs = opts.autosaveMs ?? AUTOSAVE_MS;
    this.pollMs = opts.pollMs ?? 2500;
    this.onSaved = opts.onSaved;
    this.snap = this.build();
  }

  // ---- 订阅 ----
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): SessionSnapshot => this.snap;
  private emit(): void {
    this.snap = this.build();
    this.syncPoll();
    for (const l of [...this.listeners]) l();
  }
  private build(): SessionSnapshot {
    return {
      loaded: this.loaded,
      text: this.text,
      state: this.state,
      baseVersion: this.version,
      dirtyRevision: this.revision,
      flushError: this.flushError,
      draft: this.draft,
      format: this.format,
      hasUnsaved: this.savedText !== null && this.text !== this.savedText,
    };
  }

  /** 当前缓冲（不经订阅快照，供按键路径读取）。 */
  currentText(): string {
    return this.text;
  }

  // ---- 载入 ----
  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    const f = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
    if (this.disposed || seq !== this.loadSeq) return; // 迟到结果丢弃
    this.text = f.text;
    this.version = f.version;
    this.savedText = f.text;
    this.format = detectTextFormat(f.text);
    this.state = "saved";
    this.loaded = true;
    this.revision++;
    this.flushError = null;
    this.emit();
    // 手动保存模式离开时留下的草稿
    const d = await this.engine.call<SessionDraft | null>("notes.draft.get", { path: this.id.path }).catch(() => null);
    if (this.disposed || seq !== this.loadSeq) return;
    if (d && d.text !== f.text) this.draft = d;
    else {
      this.draft = null;
      if (d) void this.engine.call("notes.draft.discard", { path: this.id.path }, { write: true }).catch(() => undefined);
    }
    this.emit();
  }

  // ---- 编辑 ----
  /** 把编辑器 / 源码 / 属性面板的新全文交给会话。 */
  setText(next: string, _origin: SetTextOrigin = "editor"): void {
    if (!this.loaded || next === this.text) return;
    this.text = next;
    this.revision++;
    this.state = "dirty";
    this.armAutosave();
    this.emit();
  }
  private armAutosave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.autosave()) this.timer = setTimeout(() => void this.save(), this.autosaveMs); // 关闭自动保存：只在 Mod+S 或点“保存”时写入
  }

  /** 注册“编辑 → 会话”的待排空来源（编辑器的 300 ms 防抖）。flush() 先调用它们。 */
  attachDrainer(fn: () => void): () => void {
    this.drainers.add(fn);
    return () => this.drainers.delete(fn);
  }
  private drain(): void {
    for (const d of [...this.drainers]) d();
  }

  // ---- 保存（串行）----
  private async doSave(): Promise<boolean> {
    const body = this.text;
    const rev = this.revision;
    this.state = "saving";
    this.emit();
    try {
      const r = await this.engine.call<{ version: string }>("notes.save", { path: this.id.path, text: body, expectedVersion: this.version }, { write: true });
      this.version = r.version;
      this.savedText = body;
      // 回执只清除它所对应的 dirtyRevision：期间又有新输入则仍为 dirty（C06）
      this.state = this.revision === rev && this.text === body ? "saved" : "dirty";
      this.flushError = null;
      if (this.text === body) {
        this.draft = null;
        void this.engine.call("notes.draft.discard", { path: this.id.path }, { write: true }).catch(() => undefined);
      }
      this.emit();
      this.onSaved?.();
      return true;
    } catch (e) {
      const conflict = (e as { code?: string })?.code === "VERSION_CONFLICT";
      this.state = conflict ? "conflict" : "dirty";
      this.flushError = conflict ? null : e instanceof Error ? e.message : String(e);
      this.emit();
      return false;
    }
  }

  /** 保存串行化：自动保存在途时，Mod+S 或改名前的落盘要等它完成，否则会拿旧版本号造成假冲突。 */
  save(): Promise<boolean> {
    const prev = this.inflight;
    const run = async (): Promise<boolean> => {
      if (prev) await prev.catch(() => false);
      if (this.savedText !== null && this.text === this.savedText) return true;
      return this.doSave();
    };
    const p = run();
    this.inflight = p;
    void p.finally(() => {
      if (this.inflight === p) this.inflight = null;
    });
    return p;
  }

  /** 排空编辑防抖后保存（切视图 / 切标签 / 关闭 / 改名前调用）。 */
  async flush(): Promise<boolean> {
    this.drain();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.savedText !== null && this.text !== this.savedText) return this.save();
    return true;
  }

  /** 应用退出前：自动保存模式落盘，手动模式留草稿（与离开笔记时一致）。 */
  async flushForExit(): Promise<void> {
    this.drain();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.savedText === null || this.text === this.savedText) return;
    if (this.autosave()) await this.save();
    else await this.engine.call("notes.draft.save", { path: this.id.path, text: this.text, baseVersion: this.version }, { write: true });
  }

  /** 切换 Vault 前“保留草稿”。 */
  async keepDraft(): Promise<void> {
    this.drain();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.engine.call("notes.draft.save", { path: this.id.path, text: this.text, baseVersion: this.version }, { write: true });
  }

  // ---- 外部变更 / 冲突 ----
  /** 磁盘上的文件被外部改了：无未保存编辑就直接载入；有则进入冲突（保存中不打断）。 */
  notifyExternalChange(): void {
    if (this.savedText !== null && this.text === this.savedText && this.state !== "saving") void this.load();
    else if (this.state !== "saving") {
      this.state = "conflict";
      this.emit();
    }
  }
  private syncPoll(): void {
    const want = this.state === "dirty" && this.pollMs > 0 && !this.disposed;
    if (want && !this.poll) {
      this.poll = setInterval(() => {
        if (this.state !== "dirty") return;
        void this.engine
          .call<NoteFile>("notes.read", { path: this.id.path })
          .then((f) => {
            if (this.state === "dirty" && f.version !== this.version && f.text !== this.text) {
              this.state = "conflict";
              this.emit();
            }
          })
          .catch(() => undefined);
      }, this.pollMs);
    } else if (!want && this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }

  /** 读出磁盘版本，供“查看差异”。 */
  async readDisk(): Promise<string> {
    return (await this.engine.call<NoteFile>("notes.read", { path: this.id.path })).text;
  }
  private fail(e: unknown): void {
    this.flushError = e instanceof Error ? e.message : String(e);
    this.emit();
  }
  setError(message: string): void {
    this.flushError = message;
    this.emit();
  }
  clearError(): void {
    if (this.flushError === null) return;
    this.flushError = null;
    this.emit();
  }

  /** 保留我的修改：以磁盘上的新版本为基线继续编辑；下次保存会覆盖磁盘上的外部修改（用户明确选择）。 */
  async keepMine(): Promise<void> {
    this.clearError();
    try {
      const theirs = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
      this.version = theirs.version;
      this.savedText = theirs.text;
      this.state = this.text === theirs.text ? "saved" : "dirty";
      this.emit();
    } catch (e) {
      this.fail(e);
    }
  }

  /** 合并：以最后一次保存的内容为基线，我的修改与磁盘新内容做三方合并；冲突处写入标记。返回冲突块数（出错 -1）。 */
  async merge(): Promise<number> {
    this.clearError();
    try {
      const theirs = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
      const base = this.savedText ?? "";
      const parts = diff3Merge(this.text.split("\n"), base.split("\n"), theirs.text.split("\n"), { excludeFalseConflicts: true });
      const lines: string[] = [];
      let conflicts = 0;
      for (const part of parts) {
        if ("ok" in part && part.ok) lines.push(...part.ok);
        else if (part.conflict) {
          conflicts++;
          lines.push("<<<<<<< 我的修改", ...part.conflict.a, "=======", ...part.conflict.b, ">>>>>>> 磁盘上的新内容");
        }
      }
      const merged = lines.join("\n");
      // 之后的保存以磁盘上的新版本为准；合并结果相对它就是“我的未保存修改”
      this.text = merged;
      this.version = theirs.version;
      this.savedText = theirs.text;
      this.revision++;
      this.state = merged === theirs.text ? "saved" : "dirty";
      this.emit();
      return conflicts;
    } catch (e) {
      this.fail(e);
      return -1;
    }
  }

  /** 恢复草稿：沿用草稿的基线版本，磁盘之后被外部改过则保存时走冲突流程，而不是静默覆盖。 */
  restoreDraft(): void {
    const d = this.draft;
    if (!d) return;
    this.text = d.text;
    if (d.baseVersion !== this.version) this.version = d.baseVersion;
    this.revision++;
    this.state = "dirty";
    this.draft = null;
    this.armAutosave();
    this.emit();
  }
  discardDraft(): void {
    this.draft = null;
    void this.engine.call("notes.draft.discard", { path: this.id.path }, { write: true }).catch(() => undefined);
    this.emit();
  }

  /** 最后一次落盘的内容（冲突横幅判断“是否有我的修改”用）。 */
  lastSavedText(): string | null {
    return this.savedText;
  }

  /** 引用归零：离开时把未保存的编辑写入——自动保存模式落盘（失败改存草稿），手动模式留草稿（ACC-KN-04）。 */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.drain();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const unsaved = this.savedText !== null && this.text !== this.savedText;
    const snap = { text: this.text, baseVersion: this.version };
    if (unsaved) {
      if (this.autosave()) {
        // 走串行队列：在途的自动保存完成后再用新版本号写，不会丢最后几个字；失败（冲突 / I/O）改存草稿，不让编辑静默丢失
        const ok = await this.save().catch(() => false);
        if (!ok) await this.engine.call("notes.draft.save", { path: this.id.path, ...snap }, { write: true }).catch(() => undefined);
      } else await this.engine.call("notes.draft.save", { path: this.id.path, ...snap }, { write: true }).catch(() => undefined);
    }
    this.disposed = true;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.listeners.clear();
    this.drainers.clear();
  }
}
