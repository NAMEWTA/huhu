import type { DocumentKind, SaveState, SetTextOrigin } from "@huhu/contracts";
import { createRequestId } from "@huhu/workbench";
import { diff3Merge } from "node-diff3";

/**
 * 一个打开文件的唯一写盘 / 冲突 / 草稿 / flush 权威（design §3.1，OP-D03）。
 * 与 React 无关：UI 通过 subscribe + getSnapshot 订阅；引擎调用经 `SessionEngine` 注入，便于单测。
 * 行为与抽取前的 `NoteDocument` 完全一致（自动保存 800 ms、保存串行、离开时落盘或留草稿、冲突三选一）。
 */

export const AUTOSAVE_MS = 800;
const MAX_PENDING_SAVE_NOTICES = 1000;

export interface SessionEngine {
  call<T>(capability: string, input: unknown, opts?: { write?: boolean }): Promise<T>;
}

export interface SessionDraft {
  text: string;
  baseVersion: string;
  savedAt: string;
  outcome?: "unknown";
}

interface DraftRecord {
  content: SessionDraft;
  version: string | undefined;
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
  /** 正文与最近确认的磁盘内容不同，或写入结果未核实，需要保留缓冲。 */
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

interface EditorComposition {
  isComposing(): boolean;
  onCompositionSettled(listener: Listener): () => void;
}

interface SaveSnapshot {
  readonly baselineGeneration: number;
  text: string;
  revision: number;
  equivalentMarkdown: MarkdownEquivalence | undefined;
  rebaseFailed?: boolean;
}

interface LateWriteConflict {
  ancestor: string | null;
  unknown: boolean;
}

interface ActiveFileWrite {
  writeId?: string;
  ownNoticeReceived?: boolean;
  reconciliation?: Promise<void>;
  externalChange?: { generation: number; loadSeq: number };
}

type SubmitFieldUpdate = (update: () => Promise<unknown>) => Promise<void>;

function isUnconfirmedWriteError(error: unknown): boolean {
  const result = error as { name?: string; details?: { outcome?: string } } | null;
  return error instanceof TypeError || result?.name === "AbortError" || result?.name === "TimeoutError" || result?.details?.outcome === "unknown";
}

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
  // 恢复草稿可使用更早的条件写版本，复读仍按最后观察的磁盘版本比较。
  private savedVersion = "";
  private lateWriteConflict: LateWriteConflict | null = null;
  private equivalentMarkdown: MarkdownEquivalence | undefined;
  private state: SaveState = "saved";
  private revision = 0;
  private baselineGeneration = 0;
  private flushError: string | null = null;
  private draft: DraftRecord | null = null;
  private draftVersionForBuffer: string | undefined;
  private draftDiscardRevision = 0;
  private pendingDraftDiscards = 0;
  private format: TextFormat = { bom: false, eol: "none", finalNewline: false };
  private loaded = false;
  private disposed = false;
  private fileWrites = 0;
  // 文件内容版本可以在撤销后重复，读请求用单调计数判断期间是否接纳过写入。
  private diskRevision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<boolean> | null = null;
  private activeFileWrite: ActiveFileWrite | null = null;
  private readonly pendingSaveNotices = new Set<string>();
  private readonly queuedSaves = new Set<SaveSnapshot>();
  private loadSeq = 0;
  private externalCheckSeq = 0;
  private deferredExternalCheck: { generation: number; loadSeq: number } | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly drainers = new Set<{ flush: () => void | Promise<void>; composition: EditorComposition | undefined; unsubscribe: (() => void) | undefined }>();
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
      draft: this.draft?.content ?? null,
      format: this.format,
      hasUnsaved: this.activeFileWrite !== null || this.hasUnsavedText(),
    };
  }

  private hasUnsavedText(): boolean {
    return this.lateWriteConflict?.unknown === true || (this.savedText !== null && this.text !== this.savedText);
  }

  /** 当前缓冲（不经订阅快照，供按键路径读取）。 */
  currentText(): string {
    return this.text;
  }

  // ---- 载入 ----
  private isBaselineCurrent(generation: number): boolean {
    return !this.disposed && generation === this.baselineGeneration;
  }

  private acceptBaseline(file: NoteFile): void {
    // 重载和冲突解决替换基线。同一基线上的保存回执只推进文件版本。
    this.baselineGeneration++;
    this.clearAutosave();
    this.version = file.version;
    this.savedVersion = file.version;
    this.savedText = file.text;
    this.lateWriteConflict = null;
    this.equivalentMarkdown = undefined;
    this.flushError = null;
  }

  private adoptLoadedFile(file: NoteFile): void {
    this.acceptBaseline(file);
    this.text = file.text;
    this.format = detectTextFormat(file.text);
    this.state = "saved";
    this.loaded = true;
    this.draftVersionForBuffer = undefined;
    this.revision++;
  }

  load(expectedRevision?: number, isCurrent = () => true): Promise<boolean> {
    return this.loadFile(expectedRevision, isCurrent, "load");
  }

  private async loadFile(expectedRevision: number | undefined, isCurrent: () => boolean, reason: "load" | "discard" | "external"): Promise<boolean> {
    const seq = ++this.loadSeq;
    const generation = this.baselineGeneration;
    const revision = this.revision;
    const canLoad = () => this.isBaselineCurrent(generation) && seq === this.loadSeq && isCurrent();
    const canAdopt = () => canLoad() && revision === this.revision;
    const discardEdits = reason === "discard";
    const discardVersion = discardEdits ? this.draftVersionForBuffer : undefined;
    while (canLoad()) {
      const diskRevision = this.diskRevision;
      const draftDiscardRevision = this.draftDiscardRevision;
      const discardPending = this.pendingDraftDiscards > 0;
      const canUseDraft = () => !discardPending && draftDiscardRevision === this.draftDiscardRevision;
      let file: NoteFile;
      let draft: (SessionDraft & { version?: string }) | null;
      let draftError: string | null = null;
      try {
        [file, draft] = await Promise.all([
          this.engine.call<NoteFile>("notes.read", { path: this.id.path }),
          this.engine.call<(SessionDraft & { version?: string }) | null>("notes.draft.get", { path: this.id.path, withVersion: true }).catch((error: unknown) => {
            if (expectedRevision !== undefined || discardEdits) throw error;
            draftError = `读取草稿失败：${error instanceof Error ? error.message : String(error)}`;
            return null;
          }),
        ]);
        if (!canAdopt()) return false;
        if (expectedRevision !== undefined || (!discardEdits && this.loaded && file.text !== this.text)) {
          if (reason === "external" && this.deferExternalCheckWhileComposing(generation, seq)) return false;
          // 接纳不同正文前，先结算复读期间仍留在编辑器中的输入。
          await this.drainEditors(canAdopt);
          if (!canAdopt()) return false;
          if (reason === "external" && this.deferExternalCheckWhileComposing(generation, seq)) return false;
        }
        if (expectedRevision !== undefined && (!canUseDraft() || expectedRevision !== this.revision || draft?.text !== this.text)) return false;
      } catch (error) {
        if (!canAdopt()) return false;
        if (diskRevision !== this.diskRevision) {
          await this.activeFileWrite?.reconciliation;
          continue;
        }
        if ((this.lateWriteConflict || discardEdits) && expectedRevision === undefined) {
          if (canAdopt()) this.fail(error);
          return false;
        }
        throw error;
      }
      if (revision !== this.revision) return false;
      if (diskRevision !== this.diskRevision) {
        await this.activeFileWrite?.reconciliation;
        continue;
      }

      if (discardVersion !== undefined && !canUseDraft()) return false;
      if (discardVersion !== undefined && draft?.version === discardVersion) {
        try {
          const discarded = await this.serializeWrite(async () => {
            if (!canAdopt() || !canUseDraft() || diskRevision !== this.diskRevision) return false;
            await this.discardDraftVersion(discardVersion);
            // 让删除前已取样的草稿读数失效。
            this.diskRevision++;
            return true;
          });
          if (!canAdopt()) return false;
          if (!discarded) continue;
        } catch (error) {
          if (!canAdopt()) return false;
          // 草稿可能在读取与删除之间被替换，重读时仍只允许删除原来的版本。
          if ((error as { code?: string })?.code === "VERSION_CONFLICT") continue;
          this.fail(error);
          return false;
        }
        if (diskRevision + 1 !== this.diskRevision) continue;
        draft = null;
      }

      this.adoptLoadedFile(file);
      if (canUseDraft()) {
        if (draftError !== null) this.flushError = draftError;
        else {
          this.draft = null;
          if (draft) {
            const { version, ...content } = draft;
            if (discardEdits || content.outcome === "unknown" || content.text !== file.text) this.draft = { content, version };
            else if (version !== undefined) this.discardKnownDraft(version);
          }
        }
      }
      this.emit();
      return true;
    }
    return false;
  }

  /** 用户确认放弃编辑时，连同当前缓冲对应的草稿一起丢弃。 */
  discardEditsAndReload(): Promise<boolean> {
    return this.loadFile(undefined, () => true, "discard");
  }

  // ---- 编辑 ----
  /** 把编辑器 / 源码 / 属性面板的新全文交给会话。 */
  setText(next: string, origin: SetTextOrigin = "editor", equivalentMarkdown?: MarkdownEquivalence): void {
    if (this.disposed || !this.loaded || next === this.text) return;
    const richOnly = this.text === this.savedText || this.equivalentMarkdown !== undefined;
    this.equivalentMarkdown = origin === "editor" && richOnly ? equivalentMarkdown : undefined;
    this.text = next;
    this.revision++;
    // 文件写入未结算时，撤销回上次确认的正文仍可排队保存。
    if (this.lateWriteConflict) this.state = "conflict";
    else {
      this.state = next === this.savedText && !this.activeFileWrite ? "saved" : "dirty";
      this.armAutosave();
    }
    this.emit();
  }
  private clearAutosave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private armAutosave(): void {
    this.clearAutosave();
    if (!this.autosave()) return;
    const generation = this.baselineGeneration;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.serializeWrite(async () => this.isBaselineCurrent(generation) && this.doSave(this.captureSave()));
    }, this.autosaveMs);
  }

  /** 注册在保存或检查未保存状态前向会话交付文本的编辑器。 */
  attachDrainer(fn: () => void | Promise<void>, composition?: EditorComposition): () => void {
    const drainer = { flush: fn, composition, unsubscribe: composition?.onCompositionSettled(this.resumeDeferredExternalCheck) };
    this.drainers.add(drainer);
    return () => {
      if (!this.drainers.delete(drainer)) return;
      drainer.unsubscribe?.();
      this.resumeDeferredExternalCheck();
    };
  }
  async drainEditors(isCurrent = () => true): Promise<void> {
    const generation = this.baselineGeneration;
    const results = await Promise.allSettled([...this.drainers].map(async ({ flush }) => flush()));
    if (!this.isBaselineCurrent(generation) || !isCurrent()) return;
    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
    if (failures.length) {
      const message = failures.map((error) => (error instanceof Error ? error.message : String(error))).join("；");
      this.setError(message);
      throw new AggregateError(failures, message);
    }
  }

  // ---- 保存（串行）----
  private captureSave(): SaveSnapshot {
    return { baselineGeneration: this.baselineGeneration, text: this.text, revision: this.revision, equivalentMarkdown: this.equivalentMarkdown };
  }

  private beginFileWrite(write: ActiveFileWrite): void {
    this.activeFileWrite = write;
    this.state = "saving";
    this.emit();
  }

  private async finishFileWrite(write: ActiveFileWrite): Promise<void> {
    if (this.activeFileWrite !== write) return;
    try {
      while (write.externalChange) await this.checkDeferredExternalChange(write);
    } finally {
      this.activeFileWrite = null;
      if (this.state === "dirty" && this.text === this.savedText && !this.flushError && !this.lateWriteConflict) this.state = "saved";
      this.emit();
    }
  }

  private async checkDeferredExternalChange(write: ActiveFileWrite): Promise<void> {
    const change = write.externalChange;
    if (!change) return;
    delete write.externalChange;
    const canCheck = () => this.isBaselineCurrent(change.generation) && change.loadSeq === this.loadSeq && !this.lateWriteConflict && !write.externalChange;
    if (!canCheck()) return;
    let file: NoteFile;
    try {
      file = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
    } catch {
      // 文件通知是尽力核对。正文保存和未确认写入分别由原回执及对账处理。
      return;
    }
    if (!canCheck() || this.matchesSavedFile(file)) return;
    this.diskRevision++;
    if (!this.hasUnsavedText() || this.text === file.text) {
      this.adoptLoadedFile(file);
    } else {
      // 仍沿用本地编辑的条件写版本和共同祖先，等待明确解决外部冲突。
      this.baselineGeneration++;
      this.clearAutosave();
      this.equivalentMarkdown = undefined;
      this.lateWriteConflict = { ancestor: this.savedText, unknown: false };
      this.state = "conflict";
    }
  }

  private async doSave({ baselineGeneration, text: body, revision: rev, equivalentMarkdown }: SaveSnapshot): Promise<boolean> {
    if (!this.isBaselineCurrent(baselineGeneration) || this.lateWriteConflict) return false;
    if (this.savedText !== null && body === this.savedText) {
      if (this.state === "dirty" && this.text === this.savedText) {
        this.state = "saved";
        this.emit();
      }
      return true;
    }
    if (this.savedText !== null && equivalentMarkdown?.(this.savedText, body)) {
      if (this.revision === rev) {
        this.text = this.savedText;
        this.equivalentMarkdown = undefined;
        this.revision++;
        this.state = "saved";
        this.flushError = null;
        this.emit();
      }
      return true;
    }
    const writeId = createRequestId();
    const write: ActiveFileWrite = { writeId };
    let outcome: "unsubmitted" | "unknown" | "acknowledged" | "rejected" = "unsubmitted";
    let writeUnconfirmed = false;
    try {
      this.beginFileWrite(write);
      if (!this.isBaselineCurrent(baselineGeneration)) return false;
      outcome = "unknown";
      const r = await this.engine.call<{ version: string }>("notes.save", { path: this.id.path, text: body, expectedVersion: this.version, writeId }, { write: true });
      outcome = "acknowledged";
      // 旧基线收到成功回执时，迟到的自身通知仍需要认领。
      if (!write.ownNoticeReceived) {
        this.pendingSaveNotices.add(writeId);
        if (this.pendingSaveNotices.size > MAX_PENDING_SAVE_NOTICES) {
          const oldest = this.pendingSaveNotices.values().next();
          if (!oldest.done) this.pendingSaveNotices.delete(oldest.value);
        }
      }
      if (!this.isBaselineCurrent(baselineGeneration)) return false;
      this.version = r.version;
      this.savedVersion = r.version;
      this.savedText = body;
      this.fileWrites++;
      this.diskRevision++;
      if (this.text === body) this.equivalentMarkdown = undefined;
      // 撤销可能回到该笔正文。保留编辑 revision，按实际落盘内容判断是否仍有修改。
      this.state = this.text === body ? "saved" : "dirty";
      this.flushError = null;
      if (this.text === body && this.draft?.content.outcome !== "unknown") {
        const draftVersion = this.draftVersionForBuffer ?? this.draft?.version;
        this.draft = null;
        this.draftVersionForBuffer = undefined;
        if (draftVersion !== undefined) this.discardKnownDraft(draftVersion);
      }
      if (this.isBaselineCurrent(baselineGeneration)) this.onSaved?.();
      return true;
    } catch (e) {
      writeUnconfirmed = isUnconfirmedWriteError(e);
      const conflict = !writeUnconfirmed && (e as { code?: string })?.code === "VERSION_CONFLICT";
      if (outcome === "unknown" && conflict) outcome = "rejected";
      if (!this.isBaselineCurrent(baselineGeneration)) return false;
      this.state = conflict ? "conflict" : "dirty";
      this.flushError = conflict ? null : e instanceof Error ? e.message : String(e);
      this.emit();
      return false;
    } finally {
      try {
        const crossedBaseline = !this.isBaselineCurrent(baselineGeneration);
        if (outcome === "rejected") {
          // 条件写拒绝已证明版本不同；未接纳的读数必须重新取样。
          this.diskRevision++;
        } else if (outcome === "unknown" || (outcome === "acknowledged" && crossedBaseline)) {
          await this.reconcileWrite(write, outcome === "unknown" && (crossedBaseline || writeUnconfirmed));
        }
      } finally {
        await this.finishFileWrite(write);
      }
    }
  }

  private reconcileWrite(write: ActiveFileWrite, writeUnconfirmed: boolean): Promise<void> {
    write.reconciliation = this.readDiskAfterWrite(writeUnconfirmed);
    return write.reconciliation;
  }

  /** 在原写入的队列位置复读，后续保存须等磁盘状态核实。 */
  private async readDiskAfterWrite(writeUnconfirmed: boolean): Promise<void> {
    if (this.disposed) return;
    // 已发写入可能比正在读取的重载或合并更晚落盘。
    this.diskRevision++;
    while (!this.disposed) {
      const generation = this.baselineGeneration;
      const diskRevision = this.diskRevision;
      const seq = this.loadSeq;
      const canReconcile = () => this.isBaselineCurrent(generation) && seq === this.loadSeq && diskRevision === this.diskRevision;
      let file: NoteFile;
      try {
        file = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
      } catch (error) {
        if (!canReconcile()) continue;
        this.acceptReconciledDisk(null, true, error instanceof Error ? error.message : String(error));
        return;
      }
      if (!canReconcile()) continue;

      const changed = !this.matchesSavedFile(file);
      if (changed || writeUnconfirmed) this.acceptReconciledDisk(changed ? file : null, writeUnconfirmed, this.flushError);
      return;
    }
  }

  private acceptReconciledDisk(file: NoteFile | null, unknown: boolean, error: string | null): void {
    const previous = this.lateWriteConflict;
    const ancestor = previous ? previous.ancestor : this.savedText;
    this.baselineGeneration++;
    this.clearAutosave();
    if (file) {
      this.version = file.version;
      this.savedVersion = file.version;
      this.savedText = file.text;
      this.format = detectTextFormat(file.text);
    }
    this.equivalentMarkdown = undefined;
    const unverified = unknown || previous?.unknown === true;
    this.lateWriteConflict = unverified || this.text !== this.savedText ? { ancestor, unknown: unverified } : null;
    this.state = this.lateWriteConflict ? "conflict" : "saved";
    this.flushError = error;
  }

  private serializeWrite(write: () => Promise<boolean>): Promise<boolean> {
    const previous = this.inflight;
    const run = async () => {
      if (previous) await previous.catch(() => false);
      return write();
    };
    let start!: () => void;
    const pending = new Promise<boolean>((resolve, reject) => {
      start = () => void run().then(resolve, reject);
    });
    // 先发布队尾，保证订阅者在收到写入状态时追加的工作仍排在这笔之后。
    this.inflight = pending;
    const clear = () => {
      if (this.inflight === pending) this.inflight = null;
    };
    void pending.then(clear, clear);
    start();
    return pending;
  }

  /** 明确保存先锁定正文，轮到写入时再取上一笔回执的版本。 */
  save(): Promise<boolean> {
    const snapshot = this.captureSave();
    return this.queueSave(snapshot, () => this.doSave(snapshot));
  }

  private queueSave(snapshot: SaveSnapshot, write: () => Promise<boolean>): Promise<boolean> {
    this.queuedSaves.add(snapshot);
    return this.serializeWrite(async () => {
      this.queuedSaves.delete(snapshot);
      if (!this.isBaselineCurrent(snapshot.baselineGeneration) || this.lateWriteConflict) return false;
      if (snapshot.rebaseFailed) {
        this.setError("档案字段与待保存的正文冲突，请确认内容后重试");
        return false;
      }
      return write();
    });
  }

  /** 档案字段与正文共用队列。预检结束后用 submit 包住实际更新请求。 */
  async writeFields(write: (version: string, submit: SubmitFieldUpdate) => Promise<unknown>): Promise<boolean> {
    const generation = this.baselineGeneration;
    const isCurrent = () => this.isBaselineCurrent(generation);
    try {
      await this.drainForWrite(generation);
    } catch {
      return false;
    }
    if (!isCurrent()) return false;
    const fieldSnapshot = this.captureSave();
    return this.queueSave(fieldSnapshot, async () => {
      if (this.savedText !== null && fieldSnapshot.text !== this.savedText && !(await this.doSave(fieldSnapshot))) return false;
      if (!isCurrent()) return false;
      const before = this.savedText ?? fieldSnapshot.text;
      const activity: ActiveFileWrite = {};
      let submitted = false;
      let acknowledged = false;
      let adoptedRead = false;
      let writeUnconfirmed = false;
      try {
        await write(this.version, async (update) => {
          if (!isCurrent()) return;
          this.beginFileWrite(activity);
          if (!isCurrent()) return;
          submitted = true;
          await update();
          acknowledged = true;
          this.diskRevision++;
        });
        if (!submitted || !isCurrent()) return false;
        const file = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
        if (!isCurrent()) return false;
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
        this.savedVersion = file.version;
        this.format = detectTextFormat(file.text);
        this.loaded = true;
        const previousRevision = this.revision++;
        // 排队的保存也要吸收档案字段的变更，同时保留各次保存自己的正文。
        for (const snapshot of this.queuedSaves) {
          if (snapshot.baselineGeneration !== generation || snapshot.rebaseFailed) continue;
          const rebased = mergeText(before, snapshot.text, file.text);
          snapshot.rebaseFailed = rebased.conflicts > 0;
          snapshot.text = rebased.text;
          snapshot.equivalentMarkdown = undefined;
          if (snapshot.revision === previousRevision) snapshot.revision = this.revision;
        }
        this.state = this.text === file.text ? "saved" : "dirty";
        this.flushError = null;
        adoptedRead = true;
        if (this.state === "dirty") this.armAutosave();
        return true;
      } catch (error) {
        writeUnconfirmed = isUnconfirmedWriteError(error);
        if (!isCurrent()) return false;
        this.state = this.text === this.savedText ? "saved" : "dirty";
        this.fail(error);
        return false;
      } finally {
        try {
          const crossedBaseline = !isCurrent();
          if (submitted && (!adoptedRead || crossedBaseline)) {
            await this.reconcileWrite(activity, !acknowledged && (crossedBaseline || writeUnconfirmed));
          }
        } finally {
          await this.finishFileWrite(activity);
        }
      }
    });
  }

  private preserveDraft(generation: number): Promise<boolean> {
    // 文件与草稿共用写入队列。离开界面与退出重叠时，也按顺序取快照。
    return this.serializeWrite(async () => {
      if (!this.isBaselineCurrent(generation)) return false;
      if (!this.hasUnsavedText()) return false;
      try {
        const saved = await this.engine.call<{ version?: string }>(
          "notes.draft.save",
          {
            path: this.id.path,
            text: this.text,
            baseVersion: this.version,
            withVersion: true,
            ...(this.lateWriteConflict?.unknown ? { outcome: "unknown" } : {}),
          },
          { write: true },
        );
        if (!this.isBaselineCurrent(generation)) return false;
        this.draftVersionForBuffer = saved?.version;
        return true;
      } catch (error) {
        if (!this.isBaselineCurrent(generation)) return false;
        throw error;
      }
    });
  }

  private async drainForWrite(generation: number): Promise<void> {
    try {
      await this.drainEditors().finally(() => {
        if (this.isBaselineCurrent(generation)) this.clearAutosave();
      });
    } catch (error) {
      if (!this.isBaselineCurrent(generation)) return;
      try {
        await this.preserveDraft(generation);
      } catch (draftError) {
        if (!this.isBaselineCurrent(generation)) return;
        const message = `${String(error)}；草稿保存失败：${String(draftError)}`;
        this.setError(message);
        throw new AggregateError([error, draftError], message);
      }
      if (this.isBaselineCurrent(generation)) throw error;
    }
  }

  /** 显式保存前结算编辑。手动保存以本次写入的回执为准，需要结清全文的操作可继续排空。 */
  async flush({ untilClean = this.autosave() }: { untilClean?: boolean } = {}): Promise<boolean> {
    const generation = this.baselineGeneration;
    while (this.isBaselineCurrent(generation)) {
      try {
        await this.drainForWrite(generation);
      } catch {
        return false;
      }
      if (!this.isBaselineCurrent(generation) || this.lateWriteConflict) return false;
      if (!untilClean) return this.savedText === null ? true : this.save();
      if (this.inflight) {
        await this.inflight;
        continue;
      }
      if (this.savedText === null || this.text === this.savedText) return true;
      if (!(await this.save())) return false;
    }
    return false;
  }

  /** 退出时自动保存，关闭自动保存或保存失败时保留草稿。 */
  async flushForExit(): Promise<"file" | "draft" | undefined> {
    const initialWrites = this.fileWrites;
    while (!this.disposed) {
      const generation = this.baselineGeneration;
      await this.drainForWrite(generation);
      while (this.inflight && this.isBaselineCurrent(generation)) await this.inflight;
      if (!this.isBaselineCurrent(generation)) continue;
      if (this.hasUnsavedText() && (!this.autosave() || !(await this.flush({ untilClean: true })))) {
        if (!this.isBaselineCurrent(generation)) continue;
        const preserved = await this.preserveDraft(generation);
        if (preserved && this.isBaselineCurrent(generation)) return "draft";
      }
      if (this.isBaselineCurrent(generation)) break;
    }
    return this.fileWrites !== initialWrites ? "file" : undefined;
  }

  /** 切换 Vault 前“保留草稿”。 */
  async keepDraft(): Promise<void> {
    while (!this.disposed) {
      const generation = this.baselineGeneration;
      await this.drainForWrite(generation);
      if (!this.isBaselineCurrent(generation)) continue;
      await this.preserveDraft(generation);
      if (this.isBaselineCurrent(generation)) return;
    }
  }

  /** 显式重开保留挂载的文件时，和销毁会话后重开一样提供草稿恢复。 */
  async reopenDraft(expectedRevision = this.revision, isCurrent = () => true): Promise<void> {
    const generation = this.baselineGeneration;
    const canReopen = () => this.isBaselineCurrent(generation) && isCurrent();
    await this.drainEditors(canReopen);
    if (!canReopen() || (!this.activeFileWrite && !this.hasUnsavedText())) return;
    // 隐藏时的 checkpoint 已落盘。只在返回期间发生新输入时更新草稿。
    const canReloadDraft = () => canReopen() && !this.activeFileWrite && !this.lateWriteConflict;
    if (canReloadDraft() && expectedRevision === this.revision && (await this.load(expectedRevision, canReloadDraft))) return;
    if (canReopen()) await this.keepDraft();
  }

  // ---- 外部变更 / 冲突 ----
  private isEditorComposing(): boolean {
    for (const { composition } of this.drainers) {
      if (composition?.isComposing()) return true;
    }
    return false;
  }

  private deferExternalCheckWhileComposing(generation: number, loadSeq: number): boolean {
    if (!this.isEditorComposing()) return false;
    this.deferredExternalCheck = { generation, loadSeq };
    return true;
  }

  private resumeDeferredExternalCheck = (): void => {
    const deferred = this.deferredExternalCheck;
    if (!deferred || this.isEditorComposing()) return;
    this.deferredExternalCheck = null;
    // 组合结算后重新取样，并按已交付的正文决定刷新还是核对冲突。
    if (this.isBaselineCurrent(deferred.generation) && deferred.loadSeq === this.loadSeq) this.notifyExternalChange();
  };

  private matchesSavedFile(file: NoteFile): boolean {
    return file.version === this.savedVersion && file.text === this.savedText;
  }

  /** 收到磁盘变更通知后刷新干净缓冲，或先复读磁盘确认冲突。 */
  notifyExternalChange(change?: string, writeId?: string): void {
    if (this.disposed) return;
    if (change === "deleted") {
      this.loadSeq++;
      const generation = this.baselineGeneration;
      this.setError("文件已移走或删除，未保存的编辑仍保留在当前会话");
      void this.keepDraft().catch((error: unknown) => {
        if (this.isBaselineCurrent(generation)) this.fail(error);
      });
      return;
    }
    if (writeId !== undefined) {
      if (this.activeFileWrite?.writeId === writeId) {
        this.activeFileWrite.ownNoticeReceived = true;
        return;
      }
      if (this.pendingSaveNotices.delete(writeId)) return;
    }
    if (this.lateWriteConflict) return;
    if (this.activeFileWrite) {
      this.activeFileWrite.externalChange = { generation: this.baselineGeneration, loadSeq: this.loadSeq };
      return;
    }
    const canReload = () => !this.activeFileWrite && !this.lateWriteConflict && !this.hasUnsavedText();
    if (canReload()) {
      const generation = this.baselineGeneration;
      const loading = this.loadFile(undefined, canReload, "external");
      const seq = this.loadSeq;
      void loading.catch((error: unknown) => {
        if (this.isBaselineCurrent(generation) && this.loadSeq === seq && canReload()) this.fail(error);
      });
    } else {
      void this.checkDirtyExternalChange();
    }
  }

  private async checkDirtyExternalChange(): Promise<void> {
    const generation = this.baselineGeneration;
    const loadSeq = this.loadSeq;
    const diskRevision = this.diskRevision;
    const checkSeq = ++this.externalCheckSeq;
    const canCheck = () => this.isBaselineCurrent(generation) && loadSeq === this.loadSeq && diskRevision === this.diskRevision && checkSeq === this.externalCheckSeq && !this.activeFileWrite && !this.lateWriteConflict;
    let file: NoteFile;
    try {
      file = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
    } catch {
      // 后续通知或脏缓冲轮询仍会核对磁盘，保留原保存状态和错误。
      return;
    }
    // 保存回执可能比对应的文件变更通知更早到达。
    if (!canCheck() || this.matchesSavedFile(file)) return;
    if (!this.hasUnsavedText()) {
      this.notifyExternalChange();
      return;
    }
    this.state = "conflict";
    this.emit();
  }

  private syncPoll(): void {
    const want = this.state === "dirty" && !this.activeFileWrite && this.pollMs > 0 && !this.disposed;
    if (want && !this.poll) {
      this.poll = setInterval(() => {
        if (this.state !== "dirty" || this.activeFileWrite) return;
        const generation = this.baselineGeneration;
        const diskRevision = this.diskRevision;
        void this.engine
          .call<NoteFile>("notes.read", { path: this.id.path })
          .then((f) => {
            if (this.isBaselineCurrent(generation) && this.diskRevision === diskRevision && !this.activeFileWrite && this.state === "dirty" && f.version !== this.version && f.text !== this.text) {
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
    await this.resolveConflict("keepMine");
  }

  /** 合并：以最后一次保存的内容为基线，我的修改与磁盘新内容做三方合并；冲突处写入标记。返回冲突块数（出错 -1）。 */
  merge(): Promise<number> {
    return this.resolveConflict("merge");
  }

  private async resolveConflict(action: "merge" | "keepMine"): Promise<number> {
    if (this.disposed) return -1;
    const generation = this.baselineGeneration;
    const seq = ++this.loadSeq;
    const canResolve = () => this.isBaselineCurrent(generation) && seq === this.loadSeq;
    this.clearError();
    while (canResolve()) {
      const diskRevision = this.diskRevision;
      let theirs: NoteFile;
      try {
        theirs = await this.engine.call<NoteFile>("notes.read", { path: this.id.path });
      } catch (error) {
        if (!canResolve()) return -1;
        if (diskRevision !== this.diskRevision) {
          await this.activeFileWrite?.reconciliation;
          continue;
        }
        this.fail(error);
        return -1;
      }
      if (!canResolve()) return -1;
      if (diskRevision !== this.diskRevision) {
        await this.activeFileWrite?.reconciliation;
        continue;
      }

      let conflicts = 0;
      if (action === "merge") {
        const ancestor = this.lateWriteConflict ? this.lateWriteConflict.ancestor : this.savedText;
        const merged = mergeText(ancestor ?? "", this.text, theirs.text);
        this.text = merged.text;
        conflicts = merged.conflicts;
        this.revision++;
      }
      this.acceptBaseline(theirs);
      this.state = this.text === theirs.text ? "saved" : "dirty";
      this.emit();
      return conflicts;
    }
    return -1;
  }

  /** 恢复草稿：沿用草稿的基线版本，磁盘之后被外部改过则保存时走冲突流程，而不是静默覆盖。 */
  restoreDraft(): void {
    if (!this.draft) return;
    const { content: d, version } = this.draft;
    this.baselineGeneration++;
    this.text = d.text;
    this.equivalentMarkdown = undefined;
    if (d.baseVersion !== this.version) this.version = d.baseVersion;
    if (d.outcome === "unknown") {
      const ancestor = this.lateWriteConflict ? this.lateWriteConflict.ancestor : this.savedText;
      this.lateWriteConflict = { ancestor, unknown: true };
      this.clearAutosave();
    }
    this.revision++;
    this.state = this.lateWriteConflict ? "conflict" : "dirty";
    this.draft = null;
    this.draftVersionForBuffer = version;
    if (!this.lateWriteConflict) this.armAutosave();
    this.emit();
  }
  discardDraft(): void {
    const version = this.draft?.version;
    this.draft = null;
    this.draftVersionForBuffer = undefined;
    this.discardKnownDraft(version);
    this.emit();
  }

  private discardKnownDraft(version: string | undefined): void {
    // 删除之前或删除在途时取到的草稿，都不能重新进入会话。
    this.draftDiscardRevision++;
    if (version === undefined) return;
    this.pendingDraftDiscards++;
    void this.discardDraftVersion(version)
      .catch(() => undefined)
      .finally(() => {
        this.pendingDraftDiscards--;
      });
  }

  private discardDraftVersion(expectedVersion: string): Promise<unknown> {
    return this.engine.call("notes.draft.discard", { path: this.id.path, expectedVersion }, { write: true });
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
      this.clearAutosave();
      if (this.poll) clearInterval(this.poll);
      this.poll = null;
    }
    this.disposed = true;
    this.deferredExternalCheck = null;
    this.listeners.clear();
    for (const { unsubscribe } of this.drainers) unsubscribe?.();
    this.drainers.clear();
  }
}
