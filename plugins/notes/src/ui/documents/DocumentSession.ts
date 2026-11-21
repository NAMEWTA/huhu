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
export type MarkdownEquivalence = (baseline: string, current: string) => boolean;

function mergeText(base: string, mine: string, theirs: string): { text: string; conflicts: number } {
  const parts = diff3Merge(mine.split("\n"), base.split("\n"), theirs.split("\n"), { excludeFalseConflicts: true });
  const lines: string[] = [];
  let conflicts = 0;
  for (const part of parts) {
    if ("ok" in part && part.ok) lines.push(...part.ok);
    else if (part.conflict) {
      conflicts++;
      lines.push("<<<<<<< 我的修改", ...part.conflict.a, "=======", ...part.conflict.b, ">>>>>>> 磁盘上的新内容");
    }
  }
  return { text: lines.join("\n"), conflicts };
}

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
  private equivalentMarkdown: MarkdownEquivalence | undefined;
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
  private readonly drainers = new Set<() => void | Promise<void>>();
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
    for (const l of this.listeners) l();
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
  async load(expectedRevision?: number, isCurrent = () => true): Promise<boolean> {
    const seq = ++this.loadSeq;
    const revision = this.revision;
    const [f, d] = await Promise.all([
      this.engine.call<NoteFile>("notes.read", { path: this.id.path }),
      this.engine.call<SessionDraft | null>("notes.draft.get", { path: this.id.path }).catch((error: unknown) => {
        if (expectedRevision !== undefined) throw error;
        return null;
      }),
    ]);
    if (this.disposed || seq !== this.loadSeq || !isCurrent()) return false;
    if (expectedRevision !== undefined) {
      // 重开读取期间编辑器仍可输入，先结算可能还没有进会话的正文。
      await this.drainEditors();
      if (this.disposed || seq !== this.loadSeq || !isCurrent() || expectedRevision !== this.revision || d?.text !== this.text) return false;
    }
    if (revision !== this.revision) return false;
    this.text = f.text;
    this.version = f.version;
    this.savedText = f.text;
    this.equivalentMarkdown = undefined;
    this.format = detectTextFormat(f.text);
    this.state = "saved";
    this.loaded = true;
    this.revision++;
    this.flushError = null;
    if (d && d.text !== f.text) this.draft = d;
    else {
      this.draft = null;
      if (d) void this.engine.call("notes.draft.discard", { path: this.id.path }, { write: true }).catch(() => undefined);
    }
    this.emit();
    return true;
  }

  // ---- 编辑 ----
  /** 把编辑器 / 源码 / 属性面板的新全文交给会话。 */
  setText(next: string, origin: SetTextOrigin = "editor", equivalentMarkdown?: MarkdownEquivalence): void {
    if (this.disposed || !this.loaded || next === this.text) return;
    const richOnly = this.text === this.savedText || this.equivalentMarkdown !== undefined;
    this.equivalentMarkdown = origin === "editor" && richOnly ? equivalentMarkdown : undefined;
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

  /** 注册在保存或检查未保存状态前向会话交付文本的编辑器。 */
  attachDrainer(fn: () => void | Promise<void>): () => void {
    this.drainers.add(fn);
    return () => this.drainers.delete(fn);
  }
  async drainEditors(): Promise<void> {
    const results = await Promise.allSettled([...this.drainers].map(async (drain) => drain()));
    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
    if (failures.length) {
      const message = failures.map((error) => (error instanceof Error ? error.message : String(error))).join("；");
      this.setError(message);
      throw new AggregateError(failures, message);
    }
  }

  // ---- 保存（串行）----
  private async doSave(): Promise<boolean> {
    const body = this.text;
    if (this.savedText !== null && this.equivalentMarkdown?.(this.savedText, body)) {
      this.text = this.savedText;
      this.equivalentMarkdown = undefined;
      this.revision++;
      this.state = "saved";
      this.flushError = null;
      this.emit();
      return true;
    }
    const rev = this.revision;
    this.state = "saving";
    this.emit();
    try {
      const r = await this.engine.call<{ version: string }>("notes.save", { path: this.id.path, text: body, expectedVersion: this.version }, { write: true });
      this.version = r.version;
      this.savedText = body;
      if (this.text === body) this.equivalentMarkdown = undefined;
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

  private serializeWrite(write: () => Promise<boolean>): Promise<boolean> {
    const previous = this.inflight;
    const pending = (async () => {
      if (previous) await previous.catch(() => false);
      return write();
    })();
    this.inflight = pending;
    const clear = () => {
      if (this.inflight === pending) this.inflight = null;
    };
    void pending.then(clear, clear);
    return pending;
  }

  /** 保存串行化：明确保存等待旧回执，并使用更新后的版本。 */
  save(): Promise<boolean> {
    return this.serializeWrite(async () => (this.savedText !== null && this.text === this.savedText ? true : this.doSave()));
  }

  /** 档案字段的写入与正文保存共用队列，回读的新版本作为后续编辑的基准。 */
  async writeFields(write: (version: string) => Promise<unknown>): Promise<boolean> {
    try {
      await this.drainForWrite();
    } catch {
      return false;
    }
    return this.serializeWrite(async () => {
      if (this.savedText !== null && this.text !== this.savedText && !(await this.doSave())) return false;
      const before = this.text;
      this.state = "saving";
      this.emit();
      try {
        await write(this.version);
        const file = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
        const merged = this.text === before ? { text: file.text, conflicts: 0 } : mergeText(before, this.text, file.text);
        if (merged.conflicts) {
          this.state = "conflict";
          this.setError("档案已写入，仍有与磁盘版本冲突的未保存编辑");
          return false;
        }
        this.text = merged.text;
        this.savedText = file.text;
        this.equivalentMarkdown = undefined;
        this.version = file.version;
        this.format = detectTextFormat(file.text);
        this.loaded = true;
        this.revision++;
        this.state = this.text === file.text ? "saved" : "dirty";
        this.flushError = null;
        if (this.state === "dirty") this.armAutosave();
        this.emit();
        return true;
      } catch (error) {
        this.state = this.text === this.savedText ? "saved" : "dirty";
        this.fail(error);
        return false;
      }
    });
  }

  private async preserveDraft(): Promise<void> {
    // 文件与草稿共用写入队列。离开界面与退出重叠时，也按顺序取快照。
    await this.serializeWrite(async () => {
      if (this.savedText !== null && this.text !== this.savedText) {
        await this.engine.call("notes.draft.save", { path: this.id.path, text: this.text, baseVersion: this.version }, { write: true });
      }
      return true;
    });
  }

  private async drainForWrite(): Promise<void> {
    try {
      await this.drainEditors().finally(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
      });
    } catch (error) {
      try {
        await this.preserveDraft();
      } catch (draftError) {
        const message = `${String(error)}；草稿保存失败：${String(draftError)}`;
        this.setError(message);
        throw new AggregateError([error, draftError], message);
      }
      throw error;
    }
  }

  /** 显式保存前结算编辑；交付失败时保留已经交付的草稿，不用不完整的正文覆盖文件。 */
  async flush(): Promise<boolean> {
    while (true) {
      try {
        await this.drainForWrite();
      } catch {
        return false;
      }
      if (this.inflight) {
        await this.inflight;
        continue;
      }
      if (this.savedText === null || this.text === this.savedText) return true;
      if (!(await this.save())) return false;
    }
  }

  /** 退出时自动保存，关闭自动保存或保存失败时保留草稿。 */
  async flushForExit(): Promise<void> {
    await this.drainForWrite();
    await this.inflight;
    if (this.savedText === null || this.text === this.savedText) return;
    if (this.autosave() && (await this.flush())) return;
    await this.preserveDraft();
  }

  /** 切换 Vault 前“保留草稿”。 */
  async keepDraft(): Promise<void> {
    await this.drainForWrite();
    await this.preserveDraft();
  }

  /** 显式重开保留挂载的文件时，和销毁会话后重开一样提供草稿恢复。 */
  async reopenDraft(expectedRevision = this.revision, isCurrent = () => true): Promise<void> {
    await this.drainEditors();
    if (this.disposed || !isCurrent() || this.savedText === null || this.text === this.savedText) return;
    // 隐藏时的 checkpoint 已落盘。只在返回期间发生新输入时更新草稿。
    if (expectedRevision === this.revision && (await this.load(expectedRevision, isCurrent))) return;
    if (!this.disposed && isCurrent()) await this.keepDraft();
  }

  // ---- 外部变更 / 冲突 ----
  /** 磁盘上的文件被外部改了：无未保存编辑就直接载入；有则进入冲突（保存中不打断）。 */
  notifyExternalChange(change?: string): void {
    if (this.disposed) return;
    if (change === "deleted") {
      this.loadSeq++;
      this.setError("文件已移走或删除，未保存的编辑仍保留在当前会话");
      void this.keepDraft().catch((error: unknown) => this.fail(error));
      return;
    }
    if (this.savedText !== null && this.text === this.savedText && this.state !== "saving") void this.load().catch((error: unknown) => this.fail(error));
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
      this.equivalentMarkdown = undefined;
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
      const { text: merged, conflicts } = mergeText(this.savedText ?? "", this.text, theirs.text);
      // 之后的保存以磁盘上的新版本为准；合并结果相对它就是“我的未保存修改”
      this.text = merged;
      this.version = theirs.version;
      this.savedText = theirs.text;
      this.equivalentMarkdown = undefined;
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
    this.equivalentMarkdown = undefined;
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
    try {
      await this.flushForExit();
    } finally {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (this.poll) clearInterval(this.poll);
      this.poll = null;
    }
    this.disposed = true;
    this.listeners.clear();
    this.drainers.clear();
  }
}
