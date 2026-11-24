import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore, defineCapability } from "@huhu/kernel";
import { EngineClient } from "@huhu/workbench";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { DocumentSession, detectTextFormat, documentKindOf, type BrowserNoteDraft, type SessionDraft, type SessionEngine } from "../src/ui/documents/DocumentSession.js";
import { DocumentSessionRegistry } from "../src/ui/documents/DocumentSessionRegistry.js";

/** 内存里的“磁盘 + 引擎”：notes.read / save / draft.*，版本冲突与失败可注入。 */
class FakeEngine implements SessionEngine {
  files = new Map<string, { text: string; version: number }>();
  drafts = new Map<string, SessionDraft>();
  calls: string[] = [];
  saveWriteIds: (string | undefined)[] = [];
  failSave: Error | null = null;
  failDraft: Error | null = null;
  failDraftRead: Error | null = null;
  failDraftDiscard: Error | null = null;
  draftDiscardGate: Promise<void> | null = null;
  failRead: Error | null = null;
  saveGate: Promise<void> | null = null;
  saveReceiptGate: Promise<void> | null = null;
  readGate: Promise<void> | null = null;
  constructor(init: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(init)) this.files.set(p, { text: t, version: 1 });
  }
  disk(p: string): string {
    return this.files.get(p)?.text ?? "";
  }
  externalWrite(p: string, text: string): void {
    const f = this.files.get(p)!;
    this.files.set(p, { text, version: f.version + 1 });
  }
  async call<T>(cap: string, input: unknown): Promise<T> {
    this.calls.push(cap);
    const i = input as { path: string; text?: string; expectedVersion?: string; baseVersion?: string; outcome?: "unknown"; withVersion?: boolean; writeId?: string };
    if (cap === "notes.read") {
      if (this.failRead) throw this.failRead;
      const f = this.files.get(i.path)!;
      if (this.readGate) await this.readGate;
      return { path: i.path, text: f.text, version: String(f.version) } as T;
    }
    if (cap === "notes.save") {
      this.saveWriteIds.push(i.writeId);
      if (this.saveGate) await this.saveGate;
      if (this.failSave) throw this.failSave;
      const f = this.files.get(i.path)!;
      if (String(f.version) !== i.expectedVersion) throw Object.assign(new Error("版本冲突"), { code: "VERSION_CONFLICT" });
      this.files.set(i.path, { text: i.text!, version: f.version + 1 });
      if (this.saveReceiptGate) await this.saveReceiptGate;
      return { version: String(f.version + 1) } as T;
    }
    if (cap === "notes.draft.get") {
      if (this.failDraftRead) throw this.failDraftRead;
      const draft = this.drafts.get(i.path);
      return (draft && i.withVersion ? { ...draft, version: JSON.stringify(draft) } : (draft ?? null)) as T;
    }
    if (cap === "notes.draft.save") {
      if (this.failDraft) throw this.failDraft;
      const draft = { text: i.text!, baseVersion: i.baseVersion!, savedAt: "2026-11-15T08:00:00", ...(i.outcome ? { outcome: i.outcome } : {}) };
      this.drafts.set(i.path, draft);
      return (i.withVersion ? { ok: true, version: JSON.stringify(draft) } : undefined) as T;
    }
    if (cap === "notes.draft.discard") {
      if (this.draftDiscardGate) await this.draftDiscardGate;
      if (this.failDraftDiscard) throw this.failDraftDiscard;
      if (i.expectedVersion !== undefined && i.expectedVersion !== JSON.stringify(this.drafts.get(i.path))) throw Object.assign(new Error("草稿版本冲突"), { code: "VERSION_CONFLICT" });
      this.drafts.delete(i.path);
      return undefined as T;
    }
    throw new Error(`未模拟：${cap}`);
  }
}

const mk = (eng: FakeEngine, path = "a.md", extra: Partial<ConstructorParameters<typeof DocumentSession>[0]> = {}) => new DocumentSession({ id: { vaultId: "v", path, epoch: 1 }, engine: eng, pollMs: 0, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function browserDraftFixture(): BrowserNoteDraft {
  let saved: (SessionDraft & { version: string }) | null = null;
  let version = 0;
  return {
    read: () => saved,
    write: (content) => {
      saved = { ...content, version: String(++version) };
      return saved.version;
    },
    discard: (expected) => {
      if (saved?.version === expected) saved = null;
    },
  };
}

describe("F06 Web 本地草稿", () => {
  test.each([true, false])("浏览器刷新前于 800 ms 内保留正文（自动保存 %s）", async (autosave) => {
    const browserDraft = browserDraftFixture();
    const eng = new FakeEngine({ "a.md": "old" });
    const original = mk(eng, "a.md", { autosave: () => autosave, browserDraft });
    await original.load();
    original.attachDrainer(() => original.setText("last input"));
    original.checkpointForBrowser();
    expect(browserDraft.read()).toMatchObject({ text: "last input", baseVersion: "1" });
    expect(eng.calls).not.toContain("notes.save");

    const reopened = mk(eng, "a.md", { autosave: () => autosave, browserDraft });
    await reopened.load();
    expect(reopened.getSnapshot()).toMatchObject({ text: "old", draft: { text: "last input" } });
    reopened.restoreDraft();
    expect(await reopened.flush({ untilClean: true })).toBe(true);
    expect(eng.disk("a.md")).toBe("last input");
    expect(browserDraft.read()).toBeNull();
    expect(eng.calls.filter((name) => name.startsWith("notes.draft."))).toEqual([]);
  });

  test("断网后的未知草稿在重开后仍可明确丢弃", async () => {
    const browserDraft = browserDraftFixture();
    const eng = new FakeEngine({ "a.md": "old" });
    const original = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await original.load();
    original.setText("offline");
    eng.failSave = new TypeError("network disconnected");
    expect(await original.flush()).toBe(false);
    expect(browserDraft.read()).toMatchObject({ text: "offline", outcome: "unknown" });
    const reopened = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await reopened.load();
    expect(reopened.getSnapshot().draft).toMatchObject({ text: "offline", outcome: "unknown" });
    reopened.discardDraft();
    expect(browserDraft.read()).toBeNull();
    expect(eng.disk("a.md")).toBe("old");
  });

  test("慢回执已提交时，重开读到同一正文即可清理本地草稿", async () => {
    const browserDraft = browserDraftFixture();
    const eng = new FakeEngine({ "a.md": "old" });
    let receipt!: () => void;
    eng.saveReceiptGate = new Promise<void>((resolve) => { receipt = resolve; });
    const original = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await original.load();
    original.setText("committed");
    const saving = original.save();
    await vi.advanceTimersByTimeAsync(0);
    expect(eng.disk("a.md")).toBe("committed");
    expect(browserDraft.read()).toMatchObject({ outcome: "unknown", matchesSubmitted: true });
    const reopened = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await reopened.load();
    expect(reopened.getSnapshot()).toMatchObject({ text: "committed", draft: null, hasUnsaved: false });
    expect(browserDraft.read()).toBeNull();
    receipt();
    expect(await saving).toBe(true);
  });

  test("在途时撤销到旧正文，即使磁盘目前仍是旧正文也保留撤销稿", async () => {
    const browserDraft = browserDraftFixture();
    const eng = new FakeEngine({ "a.md": "old" });
    let publish!: () => void;
    eng.saveGate = new Promise<void>((resolve) => { publish = resolve; });
    const original = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await original.load();
    original.setText("submitted");
    const saving = original.save();
    await vi.advanceTimersByTimeAsync(0);
    original.setText("old");
    const reopened = mk(eng, "a.md", { autosave: () => false, browserDraft });
    await reopened.load();
    expect(reopened.getSnapshot().draft).toMatchObject({ text: "old", outcome: "unknown" });
    expect(reopened.getSnapshot().draft?.matchesSubmitted).toBeUndefined();
    publish();
    await saving;
    expect(eng.disk("a.md")).toBe("submitted");
    expect(browserDraft.read()).toMatchObject({ text: "old" });
  });
});

describe("DocumentSession：保存 / 冲突 / 草稿 / flush", () => {
  test("OP-D03：忽略富文本等价规范化，显式源码格式与属性修改仍逐字节保存", async () => {
    const baseline = "---\ntitle: 样本\n---\n\n正文\r\n";
    const normalized = baseline.replace("正文\r\n", "正文\n");
    const eng = new FakeEngine({ "a.md": baseline });
    const session = mk(eng);
    const equivalent = vi.fn((before: string, after: string) => before.replaceAll("\r\n", "\n") === after);
    await session.load();
    session.setText(normalized, "editor", equivalent);
    expect(await session.flush()).toBe(true);
    expect(equivalent).toHaveBeenCalledExactlyOnceWith(baseline, normalized);
    expect(eng.calls).not.toContain("notes.save");
    expect(eng.disk("a.md")).toBe(baseline);
    expect(session.getSnapshot()).toMatchObject({ state: "saved", text: baseline, hasUnsaved: false });

    session.setText(normalized, "source", equivalent);
    expect(await session.flush()).toBe(true);
    expect(equivalent).toHaveBeenCalledTimes(1);
    expect(eng.disk("a.md")).toBe(normalized);
    const property = normalized.replace("title: 样本", 'title: "样本"');
    session.setText(property, "editor", equivalent);
    expect(await session.flush()).toBe(true);
    expect(eng.disk("a.md")).toBe(property);
  });
  test("载入后 saved；输入后 dirty，800 ms 自动保存", async () => {
    const eng = new FakeEngine({ "a.md": "hello" });
    const s = mk(eng);
    await s.load();
    expect(s.getSnapshot()).toMatchObject({ loaded: true, text: "hello", state: "saved" });
    s.setText("hello!", "editor");
    expect(s.getSnapshot().state).toBe("dirty");
    expect(eng.disk("a.md")).toBe("hello");
    await vi.advanceTimersByTimeAsync(799);
    expect(eng.disk("a.md")).toBe("hello");
    await vi.advanceTimersByTimeAsync(2);
    expect(eng.disk("a.md")).toBe("hello!");
    expect(s.getSnapshot().state).toBe("saved");
  });

  test("关闭自动保存：不自动写盘，flush 才写", async () => {
    const eng = new FakeEngine({ "a.md": "x" });
    const s = mk(eng, "a.md", { autosave: () => false });
    await s.load();
    s.setText("xy");
    await vi.advanceTimersByTimeAsync(5000);
    expect(eng.disk("a.md")).toBe("x");
    expect(await s.flush()).toBe(true);
    expect(eng.disk("a.md")).toBe("xy");
  });

  test("关闭自动保存：手动保存期间的新输入留给下一次手动保存", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始正文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const call = vi.spyOn(eng, "call");
    const saves = () => call.mock.calls.filter(([capability]) => capability === "notes.save").map(([, input]) => input);
    const release = Promise.withResolvers<void>();
    eng.saveGate = release.promise;
    session.setText("A");
    const firstSave = session.flush();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(saves()).toEqual([{ path, text: "A", expectedVersion: "1", writeId: expect.any(String) }]);
      expect(session.getSnapshot().state).toBe("saving");
      session.setText("A+B");
    } finally {
      release.resolve();
    }

    expect(await firstSave).toBe(true);
    expect(eng.disk(path)).toBe("A");
    expect(saves()).toHaveLength(1);
    expect(session.getSnapshot()).toMatchObject({ state: "dirty", text: "A+B", hasUnsaved: true });

    expect(await session.flush()).toBe(true);
    expect(eng.disk(path)).toBe("A+B");
    expect(saves()).toEqual([
      { path, text: "A", expectedVersion: "1", writeId: expect.any(String) },
      { path, text: "A+B", expectedVersion: "2", writeId: expect.any(String) },
    ]);
    expect(session.getSnapshot()).toMatchObject({ state: "saved", text: "A+B", hasUnsaved: false });
  });

  test("关闭自动保存：并发手动保存按各次触发时的正文和前一回执版本写入", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始正文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const call = vi.spyOn(eng, "call");
    const saves = () => call.mock.calls.filter(([capability]) => capability === "notes.save").map(([, input]) => input);
    const firstReceipt = Promise.withResolvers<void>();
    const secondReceipt = Promise.withResolvers<void>();
    eng.saveGate = firstReceipt.promise;

    try {
      session.setText("A");
      const firstSave = session.flush();
      await vi.advanceTimersByTimeAsync(0);

      session.setText("A+B");
      const secondSave = session.flush();
      await vi.advanceTimersByTimeAsync(0);
      expect(saves()).toEqual([{ path, text: "A", expectedVersion: "1", writeId: expect.any(String) }]);
      session.setText("A+B+C");

      eng.saveGate = secondReceipt.promise;
      firstReceipt.resolve();
      expect(await firstSave).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe("A");
      expect(saves()).toEqual([
        { path, text: "A", expectedVersion: "1", writeId: expect.any(String) },
        { path, text: "A+B", expectedVersion: "2", writeId: expect.any(String) },
      ]);

      secondReceipt.resolve();
      expect(await secondSave).toBe(true);
      expect(eng.disk(path)).toBe("A+B");
      expect(session.getSnapshot()).toMatchObject({ state: "dirty", text: "A+B+C", baseVersion: "3", hasUnsaved: true });
    } finally {
      firstReceipt.resolve();
      secondReceipt.resolve();
    }
  });

  test("flush 先排空“编辑 → 会话”的防抖，磁盘含最后一个字符（输入后立刻关闭）", async () => {
    const eng = new FakeEngine({ "a.md": "abc" });
    const s = mk(eng);
    await s.load();
    let pending = "abc";
    s.attachDrainer(() => s.setText(pending, "editor")); // 模拟编辑器 300 ms 防抖里还没交给会话的内容
    pending = "abcd";
    expect(s.currentText()).toBe("abc");
    expect(await s.flush()).toBe(true);
    expect(eng.disk("a.md")).toBe("abcd");
  });

  test("显式保存仍会结算正在组合的编辑器", async () => {
    const eng = new FakeEngine({ "a.md": "原稿" });
    const session = mk(eng);
    await session.load();
    const detach = session.attachDrainer(() => session.setText("编辑器显式交付的正文"), { isComposing: () => true, onCompositionSettled: () => () => undefined });
    try {
      expect(await session.flush()).toBe(true);
      expect(eng.disk("a.md")).toBe("编辑器显式交付的正文");
    } finally {
      detach();
    }
  });

  test.each(["flush", "flushForExit", "keepDraft", "dispose"] as const)("%s 等待异步编辑器交付才读稿", async (action) => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const s = mk(eng);
    await s.load();
    const delivery = Promise.withResolvers<void>();
    const detach = s.attachDrainer(async () => {
      await delivery.promise;
      s.setText("初始和末字", "editor");
    });
    const complete = s[action]();
    expect(eng.calls).not.toContain("notes.save");
    expect(eng.calls).not.toContain("notes.draft.save");
    delivery.resolve();
    await complete;
    detach();
    if (action === "keepDraft") {
      expect(eng.drafts.get("a.md")?.text).toBe("初始和末字");
      expect(eng.disk("a.md")).toBe("初始");
    } else expect(eng.disk("a.md")).toBe("初始和末字");
  });

  test.each(["flushForExit", "dispose"] as const)("%s 等待其它 drainer、报告拒绝并保留可恢复的快照", async (action) => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const s = mk(eng, "a.md", { pollMs: 500 });
    await s.load();
    const delivery = Promise.withResolvers<void>();
    s.attachDrainer(async () => {
      await delivery.promise;
      s.setText("已交付正文");
    });
    s.attachDrainer(() => {
      throw new Error("端口断开");
    });
    const result = expect(s[action]()).rejects.toThrow("端口断开");
    delivery.resolve();
    await result;
    expect(eng.drafts.get("a.md")?.text).toBe("已交付正文");
    expect(eng.disk("a.md")).toBe("初始");
    expect(s.getSnapshot().flushError).toContain("端口断开");
    if (action === "dispose") expect(vi.getTimerCount()).toBe(0);
  });

  test("档案条件写与新正文使用同一版本队列", async () => {
    const path = "Archives/类型/记录/index.md";
    const eng = new FakeEngine({ [path]: "---\n编号: 旧\n---\n\n正文\n" });
    const s = mk(eng, path, { autosave: () => false });
    await s.load();
    s.setText("---\n编号: 旧\n---\n\n正文首字\n");
    const started = Promise.withResolvers<string>();
    const release = Promise.withResolvers<void>();
    const fields = s.writeFields((version, submit) =>
      submit(async () => {
        started.resolve(version);
        await release.promise;
        eng.externalWrite(path, eng.disk(path).replace("编号: 旧", "编号: 新"));
      }),
    );
    expect(await started.promise).toBe("2");
    s.setText("---\n编号: 旧\n---\n\n正文首字末字\n");
    const saving = s.flush();
    await vi.advanceTimersByTimeAsync(0);
    s.setText("---\n编号: 旧\n---\n\n正文首字末字再编辑\n");
    release.resolve();
    expect(await fields).toBe(true);
    expect(await saving).toBe(true);
    expect(s.getSnapshot().baseVersion).toBe("4");
    expect(eng.disk(path)).toBe("---\n编号: 新\n---\n\n正文首字末字\n");
    expect(s.getSnapshot()).toMatchObject({ state: "dirty", text: "---\n编号: 新\n---\n\n正文首字末字再编辑\n" });
  });

  test("排队的档案字段操作不能抢先保存触发后的正文", async () => {
    const path = "Archives/类型/记录/index.md";
    const body = (text: string, field = "旧") => `---\n编号: ${field}\n---\n\n${text}\n`;
    const eng = new FakeEngine({ [path]: body("原文") });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const calls = vi.spyOn(eng, "call");
    const gate = Promise.withResolvers<void>();
    eng.saveGate = gate.promise;
    session.setText(body("A"));
    const first = session.save();
    const fields = session.writeFields((version, submit) =>
      submit(async () => {
        expect(version).toBe("2");
        eng.externalWrite(path, eng.disk(path).replace("编号: 旧", "编号: 新"));
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    session.setText(body("A+B"));
    const second = session.save();
    session.setText(body("A+B+C"));
    gate.resolve();
    expect(await Promise.all([first, fields, second])).toEqual([true, true, true]);
    const saved = calls.mock.calls.filter(([capability]) => capability === "notes.save").map(([, input]) => input);
    expect(saved).toEqual([
      { path, text: body("A"), expectedVersion: "1", writeId: expect.any(String) },
      { path, text: body("A+B", "新"), expectedVersion: "3", writeId: expect.any(String) },
    ]);
    expect(eng.disk(path)).toBe(body("A+B", "新"));
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "4", text: body("A+B+C", "新"), state: "dirty", hasUnsaved: true });
  });

  test("相邻的档案字段操作各自保留冻结的正文并吸收前一笔字段差异", async () => {
    const path = "Archives/类型/记录/index.md";
    const body = (text: string, first = "旧", second = "旧") => `---\n编号: ${first}\n\n地点: ${second}\n---\n\n${text}\n`;
    const eng = new FakeEngine({ [path]: body("原文") });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const firstStarted = Promise.withResolvers<string>();
    const releaseFirst = Promise.withResolvers<void>();
    const first = session.writeFields((version, submit) =>
      submit(async () => {
        firstStarted.resolve(version);
        await releaseFirst.promise;
        eng.externalWrite(path, body("原文", "新"));
      }),
    );
    expect(await firstStarted.promise).toBe("1");
    session.setText(body("A"));
    const updateSecond = vi.fn(async (version: string) => {
      expect(version).toBe("3");
      expect(eng.disk(path)).toBe(body("A", "新"));
      eng.externalWrite(path, body("A", "新", "新"));
    });
    const second = session.writeFields((version, submit) => submit(() => updateSecond(version)));
    await vi.advanceTimersByTimeAsync(0);
    session.setText(body("A+B"));
    releaseFirst.resolve();

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(updateSecond).toHaveBeenCalledTimes(1);
    expect(eng.disk(path)).toBe(body("A", "新", "新"));
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "4", text: body("A+B", "新", "新"), hasUnsaved: true, state: "dirty" });
  });

  test("重载期间停在档案预检的旧字段操作不能提交，也不能启动排队的字段操作", async () => {
    const path = "Archives/类型/记录/index.md";
    const eng = new FakeEngine({ [path]: "原文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const preflight = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const update = vi.fn(async (_version: string) => undefined);
    const fields = session.writeFields(async (version, submit) => {
      preflight.resolve();
      await release.promise;
      await submit(() => update(version));
    });
    await preflight.promise;
    const queuedUpdate = vi.fn(async () => undefined);
    const queuedFields = session.writeFields(queuedUpdate);
    await vi.advanceTimersByTimeAsync(0);
    eng.externalWrite(path, "重载后的正文");
    expect(await session.load()).toBe(true);
    release.resolve();

    expect(await Promise.all([fields, queuedFields])).toEqual([false, false]);
    expect(update).not.toHaveBeenCalled();
    expect(queuedUpdate).not.toHaveBeenCalled();
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "2", text: "重载后的正文", state: "saved", flushError: null });
  });

  test("迟到的档案回读不能重基重载后的新保存", async () => {
    const path = "Archives/类型/记录/index.md";
    const eng = new FakeEngine({ [path]: "编号: 旧\n\n正文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const releaseRead = Promise.withResolvers<void>();
    eng.readGate = releaseRead.promise;
    const fields = session.writeFields((_version, submit) =>
      submit(async () => {
        eng.externalWrite(path, "编号: 字段写入\n\n正文");
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);
    eng.readGate = null;
    eng.externalWrite(path, "编号: 外部\n\n正文");
    session.notifyExternalChange("modified");
    expect(await session.load()).toBe(true);
    session.setText("编号: 外部\n\n正文和新输入");
    const saving = session.save();
    releaseRead.resolve();

    expect(await Promise.all([fields, saving])).toEqual([false, true]);
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(4);
    expect(eng.disk(path)).toBe("编号: 外部\n\n正文和新输入");
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "4", text: eng.disk(path), state: "saved", hasUnsaved: false, flushError: null });
  });

  test("档案预检仍可自动刷新，提交后至字段回读接纳前保护缓冲", async () => {
    const path = "Archives/类型/记录/index.md";
    const original = "编号: 旧\n\n正文";
    const updated = "编号: 新\n\n正文";
    const eng = new FakeEngine({ [path]: original });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const revision = session.getSnapshot().dirtyRevision;
    const preflight = Promise.withResolvers<void>();
    const submitted = Promise.withResolvers<void>();
    const releasePreflight = Promise.withResolvers<void>();
    const releaseAutoRead = Promise.withResolvers<void>();
    const releaseUpdate = Promise.withResolvers<void>();
    const releaseFieldRead = Promise.withResolvers<void>();
    const fields = session.writeFields(async (_version, submit) => {
      preflight.resolve();
      await releasePreflight.promise;
      await submit(async () => {
        submitted.resolve();
        await releaseUpdate.promise;
        eng.externalWrite(path, updated);
      });
    });
    try {
      await preflight.promise;
      expect(session.getSnapshot().hasUnsaved).toBe(false);
      const reads = () => eng.calls.filter((capability) => capability === "notes.read").length;
      eng.readGate = releaseAutoRead.promise;
      session.notifyExternalChange("modified");
      expect(reads()).toBe(2);
      eng.readGate = null;

      releasePreflight.resolve();
      await submitted.promise;
      expect(session.getSnapshot()).toMatchObject({ text: original, hasUnsaved: true });
      releaseAutoRead.resolve();
      session.notifyExternalChange("modified");
      await vi.advanceTimersByTimeAsync(0);
      expect(reads()).toBe(2);
      expect(session.getSnapshot().dirtyRevision).toBe(revision);

      eng.readGate = releaseFieldRead.promise;
      releaseUpdate.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe(updated);
      expect(reads()).toBe(3);
      expect(session.getSnapshot()).toMatchObject({ text: original, hasUnsaved: true });
      session.notifyExternalChange("modified");
      expect(reads()).toBe(3);
      releaseFieldRead.resolve();

      expect(await fields).toBe(true);
      expect(session.getSnapshot()).toMatchObject({ text: updated, baseVersion: "2", state: "saved", hasUnsaved: false });
    } finally {
      releasePreflight.resolve();
      releaseAutoRead.resolve();
      releaseUpdate.resolve();
      releaseFieldRead.resolve();
    }
  });

  test.each([
    { label: "干净缓冲", localEdit: false },
    { label: "本地仍在编辑", localEdit: true },
  ])("档案字段回读取样后的外部通知仍须处理：$label", async ({ localEdit }) => {
    const path = "Archives/类型/记录/index.md";
    const original = "---\n编号: 旧\n---\n\n正文\n";
    const fieldsOnDisk = original.replace("编号: 旧", "编号: 新");
    const external = fieldsOnDisk.replace("正文", "外部正文");
    const local = original.replace("正文", "本地正文");
    const eng = new FakeEngine({ [path]: original });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const releaseFieldRead = Promise.withResolvers<void>();
    eng.readGate = releaseFieldRead.promise;
    const writing = session.writeFields((_version, submit) =>
      submit(async () => {
        eng.externalWrite(path, fieldsOnDisk);
      }),
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe(fieldsOnDisk);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);
      expect(session.getSnapshot()).toMatchObject({ text: original, hasUnsaved: true });

      eng.readGate = null;
      if (localEdit) session.setText(local);
      eng.externalWrite(path, external);
      session.notifyExternalChange("modified");
      expect(session.currentText()).toBe(localEdit ? local : original);
      releaseFieldRead.resolve();
      await writing;
      await vi.advanceTimersByTimeAsync(0);

      expect(eng.disk(path)).toBe(external);
      expect(eng.calls).not.toContain("notes.save");
      if (localEdit) {
        expect(session.getSnapshot()).toMatchObject({ text: fieldsOnDisk.replace("正文", "本地正文"), state: "conflict", hasUnsaved: true });
      } else {
        expect(session.getSnapshot()).toMatchObject({ text: external, baseVersion: "3", state: "saved", hasUnsaved: false });
      }
    } finally {
      releaseFieldRead.resolve();
    }
  });

  test.each(["成功回执", "写入后失败"] as const)("已发字段更新跨重载（%s），复读实际磁盘并淘汰旧队列", async (outcome) => {
    const path = "Archives/类型/记录/index.md";
    const original = "编号: 旧\n\n正文";
    const written = "编号: 新\n\n正文";
    const local = "编号: 旧\n\n保留本地正文";
    const eng = new FakeEngine({ [path]: original });
    const session = mk(eng, path);
    await session.load();
    const started = Promise.withResolvers<string>();
    const releaseUpdate = Promise.withResolvers<void>();
    const update = vi.fn(async (version: string) => {
      started.resolve(version);
      await releaseUpdate.promise;
      eng.externalWrite(path, written);
      if (outcome === "写入后失败") throw Object.assign(new Error("字段已写入，保存身份记录时冲突"), { code: "VERSION_CONFLICT" });
    });
    const fields = session.writeFields((version, submit) => submit(() => update(version)));
    try {
      expect(await started.promise).toBe("1");
      expect(await session.load()).toBe(true);
      session.setText(local);
      const saving = session.save();
      const queuedUpdate = vi.fn(async () => undefined);
      const queuedFields = session.writeFields((_version, submit) => submit(queuedUpdate));
      await vi.advanceTimersByTimeAsync(0);
      releaseUpdate.resolve();

      expect(await Promise.all([fields, saving, queuedFields])).toEqual([false, false, false]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(queuedUpdate).not.toHaveBeenCalled();
      expect(eng.calls).not.toContain("notes.save");
      expect(eng.disk(path)).toBe(written);
      expect(session.lastSavedText()).toBe(written);
      expect(session.getSnapshot()).toMatchObject({ text: local, baseVersion: "2", state: "conflict", hasUnsaved: true });
      const edited = `${local}及后续输入`;
      session.setText(edited);
      await vi.advanceTimersByTimeAsync(900);
      expect(eng.calls).not.toContain("notes.save");
      expect(session.getSnapshot().state).toBe("conflict");
      expect(await session.flush({ untilClean: true })).toBe(false);
      expect(await session.flushForExit()).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: edited, baseVersion: "2" });
    } finally {
      releaseUpdate.resolve();
    }
  });

  test("跨重载的字段响应丢失时，相同磁盘读数不解除保护", async () => {
    const path = "Archives/类型/记录/index.md";
    const eng = new FakeEngine({ [path]: "原文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const started = Promise.withResolvers<void>();
    const releaseUpdate = Promise.withResolvers<void>();
    const fields = session.writeFields((_version, submit) =>
      submit(async () => {
        started.resolve();
        await releaseUpdate.promise;
        throw new TypeError("写入请求的连接断开");
      }),
    );
    try {
      await started.promise;
      expect(await session.load()).toBe(true);
      releaseUpdate.resolve();
      expect(await fields).toBe(false);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);
      expect(eng.disk(path)).toBe("原文");
      expect(session.getSnapshot()).toMatchObject({ text: "原文", baseVersion: "1", state: "conflict", hasUnsaved: true });
      expect(await session.save()).toBe(false);
      expect(await session.flush({ untilClean: true })).toBe(false);
      expect(await session.flushForExit()).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: "原文", baseVersion: "1" });
    } finally {
      releaseUpdate.resolve();
    }
  });

  test("同基线的字段响应丢失时，复读未变也不能结算为干净", async () => {
    const path = "Archives/类型/记录/index.md";
    const eng = new FakeEngine({ [path]: "原文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const fields = session.writeFields((_version, submit) =>
      submit(async () => {
        throw new TypeError("字段请求连接丢失");
      }),
    );

    expect(await fields).toBe(false);
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);
    expect(eng.disk(path)).toBe("原文");
    expect(session.getSnapshot()).toMatchObject({ text: "原文", baseVersion: "1", state: "conflict", hasUnsaved: true });
    expect(await session.flush({ untilClean: true })).toBe(false);
    expect(await session.flushForExit()).toBe("draft");
    expect(eng.drafts.get(path)).toMatchObject({ text: "原文", baseVersion: "1" });
  });

  test("C06：保存在途时又有新输入，旧回执不清除新的 dirtyRevision", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const s = mk(eng);
    await s.load();
    let open!: () => void;
    eng.saveGate = new Promise<void>((r) => (open = r));
    s.setText("12");
    const p = s.save();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getSnapshot().state).toBe("saving");
    s.setText("123"); // 在途期间继续输入
    open();
    eng.saveGate = null;
    await p;
    expect(eng.disk("a.md")).toBe("12");
    expect(s.getSnapshot()).toMatchObject({ state: "dirty", hasUnsaved: true });
    await vi.advanceTimersByTimeAsync(900);
    expect(eng.disk("a.md")).toBe("123");
    expect(s.getSnapshot().state).toBe("saved");
  });

  test.each(["A", "X"])("保存期间撤销到 %s 后按实际落盘正文显示状态", async (undoText) => {
    const eng = new FakeEngine({ "a.md": "X" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    const gate = Promise.withResolvers<void>();
    eng.saveGate = gate.promise;
    session.setText("A");
    const saving = session.save();
    session.setText("A+B");
    session.setText(undoText);
    gate.resolve();
    expect(await saving).toBe(true);
    expect(eng.disk("a.md")).toBe("A");
    expect(session.getSnapshot()).toMatchObject({ state: undoText === "A" ? "saved" : "dirty", hasUnsaved: undoText !== "A" });
  });

  test("手动模式撤销回已落盘正文时立即显示已保存", async () => {
    const eng = new FakeEngine({ "a.md": "原文" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("已编辑");
    session.setText("原文");
    expect(session.getSnapshot()).toMatchObject({ state: "saved", hasUnsaved: false });
    expect(eng.calls).not.toContain("notes.save");
  });

  test("手动保存已落盘但回执未到时，撤销仍可排队第二次明确保存", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const call = vi.spyOn(eng, "call");
    const saves = () => call.mock.calls.filter(([capability]) => capability === "notes.save").map(([, input]) => input);
    const receipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const first = session.flush();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe("A");
      expect(session.getSnapshot().baseVersion).toBe("1");

      session.setText("X");
      const stateBeforeSecondSave = session.getSnapshot().state;
      const second = session.flush();
      await vi.advanceTimersByTimeAsync(0);
      expect(saves()).toEqual([{ path, text: "A", expectedVersion: "1", writeId: expect.any(String) }]);
      expect(eng.disk(path)).toBe("A");

      eng.saveReceiptGate = null;
      receipt.resolve();
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(saves()).toEqual([
        { path, text: "A", expectedVersion: "1", writeId: expect.any(String) },
        { path, text: "X", expectedVersion: "2", writeId: expect.any(String) },
      ]);
      expect(eng.disk(path)).toBe("X");
      expect(session.getSnapshot()).toMatchObject({ text: "X", state: "saved", baseVersion: "3", hasUnsaved: false });
      expect(stateBeforeSecondSave).toBe("dirty"); // 手动保存按钮只在 dirty 时可用。
    } finally {
      receipt.resolve();
    }
  });

  test("保存串行：在途自动保存完成后，后续保存用新版本号，不产生假冲突", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const s = mk(eng);
    await s.load();
    s.setText("a");
    const p1 = s.save();
    s.setText("ab");
    const p2 = s.save();
    expect(await p1).toBe(true);
    expect(await p2).toBe(true);
    expect(eng.disk("a.md")).toBe("ab");
    expect(s.getSnapshot().state).toBe("saved");
  });

  test("版本冲突 → conflict；keepMine 以磁盘版本为基线，再保存覆盖", async () => {
    const eng = new FakeEngine({ "a.md": "base" });
    const s = mk(eng);
    await s.load();
    s.setText("mine");
    eng.externalWrite("a.md", "theirs");
    expect(await s.save()).toBe(false);
    expect(s.getSnapshot().state).toBe("conflict");
    expect(s.getSnapshot().flushError).toBeNull();
    await s.keepMine();
    expect(s.getSnapshot().state).toBe("dirty");
    expect(await s.save()).toBe(true);
    expect(eng.disk("a.md")).toBe("mine");
  });

  test("merge：三方合并，非冲突改动各自保留", async () => {
    const eng = new FakeEngine({ "a.md": "l1\nl2\nl3\nl4\nl5" });
    const s = mk(eng);
    await s.load();
    s.setText("l1\nmine\nl3\nl4\nl5");
    eng.externalWrite("a.md", "l1\nl2\nl3\nl4\ntheirs");
    expect(await s.merge()).toBe(0);
    expect(s.currentText()).toBe("l1\nmine\nl3\nl4\ntheirs");
    expect(s.getSnapshot().state).toBe("dirty");
    expect(await s.save()).toBe(true);
    expect(eng.disk("a.md")).toBe("l1\nmine\nl3\nl4\ntheirs");
  });

  test.each(["load", "merge", "keepMine"] as const)("冲突解决 %s 后旧排队保存不能借新版本覆盖磁盘", async (action) => {
    const base = "a\nmiddle\nz";
    const external = "a\nmiddle\nz2";
    const mine = "a2\nmiddle\nz";
    const eng = new FakeEngine({ "a.md": base });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    const gate = Promise.withResolvers<void>();
    eng.saveGate = gate.promise;
    session.setText("a1\nmiddle\nz");
    const first = session.save();
    session.setText(mine);
    const second = session.save();
    eng.externalWrite("a.md", external);
    if (action === "load") expect(await session.load()).toBe(true);
    else if (action === "merge") expect(await session.merge()).toBe(0);
    else await session.keepMine();
    gate.resolve();
    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(eng.disk("a.md")).toBe(external);
    expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
    expect(session.getSnapshot()).toMatchObject({
      text: { load: external, merge: "a2\nmiddle\nz2", keepMine: mine }[action],
      state: action === "load" ? "saved" : "dirty",
      baseVersion: "2",
    });
    if (action === "keepMine") {
      expect(await session.save()).toBe(true);
      expect(eng.disk("a.md")).toBe(mine);
      expect(session.getSnapshot()).toMatchObject({ baseVersion: "3", state: "saved" });
    }
  });

  test("保留我的修改后迟到的成功回执不能回退基线或清掉草稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始" });
    const draft = { text: "已有草稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" };
    eng.drafts.set(path, draft);
    const onSaved = vi.fn();
    const session = mk(eng, path, { autosave: () => false, onSaved });
    await session.load();
    const releaseReceipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = releaseReceipt.promise;
    session.setText("A");
    const saving = session.save();
    expect(eng.disk(path)).toBe("A");
    session.setText("A+B");
    const queued = session.save();
    session.setText("A");
    eng.externalWrite(path, "外部改动");
    await session.keepMine();
    releaseReceipt.resolve();

    expect(await Promise.all([saving, queued])).toEqual([false, false]);
    expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
    expect(eng.calls).not.toContain("notes.draft.discard");
    expect(eng.drafts.get(path)).toEqual(draft);
    expect(onSaved).not.toHaveBeenCalled();
    expect(eng.disk(path)).toBe("外部改动");
    expect(session.lastSavedText()).toBe("外部改动");
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "3", text: "A", state: "dirty", hasUnsaved: true, flushError: null, draft });
  });

  test("同版本重载后旧请求才落盘时，重新核对磁盘并在退出时保留撤销正文", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const call = vi.spyOn(eng, "call");
    const allowedToWrite = Promise.withResolvers<void>();
    eng.saveGate = allowedToWrite.promise;
    session.setText("A");
    const saving = session.flush();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(call).toHaveBeenCalledWith("notes.save", { path, text: "A", expectedVersion: "1", writeId: expect.any(String) }, { write: true });
      expect(eng.disk(path)).toBe("X");

      session.setText("X");
      expect(await session.load()).toBe(true);
      expect(session.getSnapshot()).toMatchObject({ text: "X", baseVersion: "1" });
      const reads = () => eng.calls.filter((capability) => capability === "notes.read").length;
      const readsBeforeWrite = reads();
      allowedToWrite.resolve();
      await saving;
      expect(eng.disk(path)).toBe("A");

      const flushed = await session.flush({ untilClean: true });
      const afterFlush = session.getSnapshot();
      const exited = await session.flushForExit();
      const savesOfA = call.mock.calls.filter(([capability, input]) => capability === "notes.save" && (input as { text: string }).text === "A");
      expect(savesOfA).toHaveLength(1);
      expect(eng.disk(path)).toBe("A");
      expect(afterFlush.text).toBe("X");
      expect.soft(reads()).toBeGreaterThan(readsBeforeWrite);
      expect.soft(afterFlush.state).not.toBe("saved");
      expect.soft(afterFlush.hasUnsaved).toBe(true);
      expect.soft(flushed).toBe(false);
      expect.soft(exited).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "2" });
    } finally {
      allowedToWrite.resolve();
    }
  });

  test("旧成功回执复读未发现变化时，新基线排队的保存继续执行", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const onSaved = vi.fn();
    const session = mk(eng, path, { autosave: () => false, onSaved });
    await session.load();
    const call = vi.spyOn(eng, "call");
    const receipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      expect(eng.disk(path)).toBe("A");
      eng.externalWrite(path, "外部版本");
      expect(await session.load()).toBe(true);
      session.setText("新基线编辑");
      const saving = session.save();
      eng.saveReceiptGate = null;
      receipt.resolve();

      expect(await Promise.all([oldSave, saving])).toEqual([false, true]);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);
      expect(call.mock.calls.filter(([capability]) => capability === "notes.save").map(([, input]) => input)).toEqual([
        { path, text: "A", expectedVersion: "1", writeId: expect.any(String) },
        { path, text: "新基线编辑", expectedVersion: "3", writeId: expect.any(String) },
      ]);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(eng.disk(path)).toBe("新基线编辑");
      expect(session.getSnapshot()).toMatchObject({ text: "新基线编辑", baseVersion: "4", state: "saved", hasUnsaved: false });
    } finally {
      receipt.resolve();
    }
  });

  test("跨重载对账完成后，旧自身通知不会卡住进行中的下一笔保存或退出", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始" });
    const session = mk(eng, path);
    await session.load();
    const oldReceipt = Promise.withResolvers<void>();
    const currentReceipt = Promise.withResolvers<void>();
    const read = Promise.withResolvers<void>();
    eng.saveReceiptGate = oldReceipt.promise;
    session.setText("A");
    const oldSave = session.save();
    let saving: Promise<boolean> | undefined;
    let exit: ReturnType<DocumentSession["flushForExit"]> | undefined;
    try {
      expect(eng.disk(path)).toBe("A");
      expect(await session.load()).toBe(true);
      oldReceipt.resolve();
      expect(await oldSave).toBe(false);
      expect(session.getSnapshot()).toMatchObject({ text: "A", baseVersion: "2", state: "saved" });
      const reads = () => eng.calls.filter((capability) => capability === "notes.read").length;
      expect(reads()).toBe(3);

      eng.saveReceiptGate = currentReceipt.promise;
      session.setText("B");
      saving = session.save();
      expect(eng.disk(path)).toBe("B");
      expect(eng.saveWriteIds).toEqual([expect.any(String), expect.any(String)]);
      expect(eng.saveWriteIds[0]).not.toBe(eng.saveWriteIds[1]);
      session.notifyExternalChange("modified", eng.saveWriteIds[1]);
      session.notifyExternalChange("modified", eng.saveWriteIds[0]);
      eng.readGate = read.promise;
      exit = session.flushForExit();
      const settled = vi.fn();
      void Promise.all([saving, exit]).then(settled);
      currentReceipt.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect.soft(settled).toHaveBeenCalledExactlyOnceWith([true, "file"]);
      expect.soft(reads()).toBe(3);
      expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "3", state: "saved", hasUnsaved: false, flushError: null });
    } finally {
      oldReceipt.resolve();
      currentReceipt.resolve();
      read.resolve();
      await Promise.all([oldSave, saving, exit]);
    }
  });

  test("跨重载对账完成后，干净视图忽略旧自身通知并刷新其他来源通知", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const receipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const saving = session.save();
    try {
      expect(eng.disk(path)).toBe("A");
      expect(await session.load()).toBe(true);
      receipt.resolve();
      expect(await saving).toBe(false);
      const reads = () => eng.calls.filter((capability) => capability === "notes.read").length;
      expect(reads()).toBe(3);
      expect(eng.saveWriteIds).toEqual([expect.any(String)]);

      eng.failRead = new Error("暂时不可读");
      session.notifyExternalChange("modified", eng.saveWriteIds[0]);
      await vi.advanceTimersByTimeAsync(0);
      expect.soft(reads()).toBe(3);
      expect.soft(session.getSnapshot()).toMatchObject({ text: "A", baseVersion: "2", state: "saved", hasUnsaved: false, flushError: null });

      eng.failRead = null;
      eng.externalWrite(path, "其他来源的新正文");
      const readsBeforeExternal = reads();
      session.notifyExternalChange("modified", "another-workbench");
      await vi.advanceTimersByTimeAsync(0);
      expect(reads()).toBe(readsBeforeExternal + 1);
      expect(session.getSnapshot()).toMatchObject({ text: "其他来源的新正文", baseVersion: "3", state: "saved", hasUnsaved: false, flushError: null });
    } finally {
      receipt.resolve();
      await saving;
    }
  });

  test("对账读数返回前再次重载时，按最新基线重新核对", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    const releaseStaleRead = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      session.setText("X");
      expect(await session.load()).toBe(true);
      eng.readGate = releaseStaleRead.promise;
      allowWrite.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe("A");
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);

      eng.readGate = null;
      eng.externalWrite(path, "再次重载");
      expect(await session.load()).toBe(true);
      session.setText("再次重载后的编辑");
      const saving = session.save();
      expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
      releaseStaleRead.resolve();

      expect(await Promise.all([oldSave, saving])).toEqual([false, true]);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(5);
      expect(eng.disk(path)).toBe("再次重载后的编辑");
      expect(session.getSnapshot()).toMatchObject({ text: eng.disk(path), baseVersion: "4", state: "saved", hasUnsaved: false });
    } finally {
      allowWrite.resolve();
      releaseStaleRead.resolve();
    }
  });

  test("对账已经发现磁盘偏离时，仍在等待的重载读数不能替换缓冲", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    const releaseReconciliation = Promise.withResolvers<void>();
    const releaseReload = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      session.setText("X");
      expect(await session.load()).toBe(true);
      eng.readGate = releaseReconciliation.promise;
      allowWrite.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);

      eng.readGate = releaseReload.promise;
      const reloading = session.load();
      eng.readGate = null;
      releaseReconciliation.resolve();
      expect(await oldSave).toBe(false);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(5);
      releaseReload.resolve();

      expect(await reloading).toBe(false);
      expect(eng.disk(path)).toBe("A");
      expect(session.getSnapshot()).toMatchObject({ text: "X", baseVersion: "2", state: "conflict", hasUnsaved: true });
    } finally {
      allowWrite.resolve();
      releaseReconciliation.resolve();
      releaseReload.resolve();
    }
  });

  test("保存落盘后对账尚未返回，外部通知不能自动重载覆盖撤销正文", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const receipt = Promise.withResolvers<void>();
    const releaseReconciliation = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const saving = session.save();
    try {
      expect(eng.disk(path)).toBe("A");
      session.setText("X");
      eng.readGate = releaseReconciliation.promise;
      receipt.reject(Object.assign(new Error("正文已落盘，刷新索引失败"), { code: "INTERNAL" }));
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);

      eng.readGate = null;
      session.notifyExternalChange("modified", eng.saveWriteIds[0]);
      session.notifyExternalChange("modified");
      await vi.advanceTimersByTimeAsync(0);
      const textDuringReconciliation = session.currentText();
      releaseReconciliation.resolve();
      expect(await saving).toBe(false);

      const exit = await session.flushForExit();
      expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
      expect(eng.disk(path)).toBe("A");
      expect.soft(textDuringReconciliation).toBe("X");
      expect.soft(session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true });
      expect.soft(exit).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "2" });
    } finally {
      receipt.resolve();
      releaseReconciliation.resolve();
    }
  });

  test.each([
    { label: "截断的 HTTP 200 响应", response: () => new Response('{"ok":'), unknown: true },
    { label: "Engine 标记未知", response: () => Response.json({ ok: false, error: { code: "INTERNAL", message: "结果未知", details: { outcome: "unknown" } } }), unknown: true },
    { label: "同盘普通 INTERNAL", response: () => Response.json({ ok: false, error: { code: "INTERNAL", message: "正文保存失败", details: { correlationId: "save-1" } } }), unknown: false },
  ])("真实 EngineClient 的保存边界：$label", async ({ response, unknown }) => {
    const path = "a.md";
    const releaseFailure = Promise.withResolvers<void>();
    const saves: { text?: string; expectedVersion?: string }[] = [];
    let disk = { path, text: "X", version: "1" };
    let draft: unknown = null;
    const engine = new EngineClient({ baseUrl: "http://127.0.0.1:1", vaultId: "v" }, async (_url, init) => {
      const { capability, input } = JSON.parse(String(init?.body)) as { capability: string; input: { text?: string; expectedVersion?: string } };
      if (capability === "notes.save") {
        saves.push(input);
        if (saves.length === 1) {
          await releaseFailure.promise;
          return response();
        }
        disk = { path, text: input.text!, version: "2" };
        return Response.json({ ok: true, data: { version: disk.version } });
      }
      if (capability === "notes.read") return Response.json({ ok: true, data: disk });
      if (capability === "notes.draft.get") return Response.json({ ok: true, data: draft });
      if (capability === "notes.draft.save") draft = input;
      if (capability === "notes.draft.save" || capability === "notes.draft.discard") return Response.json({ ok: true, data: null });
      throw new Error(`未模拟：${capability}`);
    });
    const session = new DocumentSession({ id: { vaultId: "v", path, epoch: 1 }, engine, autosave: () => false, pollMs: 0 });
    await session.load();
    session.setText("A");
    const saving = session.save();
    session.setText("X");
    releaseFailure.resolve();
    expect(await saving).toBe(false);
    expect(disk.text).toBe("X");
    expect(saves).toEqual([{ path, text: "A", expectedVersion: "1", writeId: expect.any(String) }]);

    if (unknown) {
      expect(session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true });
      expect(await session.flush({ untilClean: true })).toBe(false);
      expect(await session.flushForExit()).toBe("draft");
      expect(draft).toMatchObject({ path, text: "X", baseVersion: "1" });
      expect(saves).toHaveLength(1);
    } else {
      expect(session.getSnapshot()).toMatchObject({ text: "X", flushError: "正文保存失败", hasUnsaved: false });
      expect(await session.flush({ untilClean: true })).toBe(true);
      session.setText("下一次明确保存");
      expect(await session.save()).toBe(true);
      expect(disk.text).toBe("下一次明确保存");
      expect(saves[1]).toEqual({ path, text: disk.text, expectedVersion: "1", writeId: expect.any(String) });
    }
  });

  test("迟到写入复读失败时阻止干净结算，退出草稿和明确重载可重试", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      session.setText("X");
      expect(await session.load()).toBe(true);
      eng.failRead = new Error("无法核对正文");
      allowWrite.resolve();

      expect(await oldSave).toBe(false);
      expect(eng.disk(path)).toBe("A");
      expect(session.getSnapshot()).toMatchObject({ text: "X", baseVersion: "1", state: "conflict", hasUnsaved: true, flushError: "无法核对正文" });
      expect(await session.flush({ untilClean: true })).toBe(false);
      expect(await session.load()).toBe(false);
      eng.failDraft = new Error("草稿暂时不可写");
      await expect(session.flushForExit()).rejects.toThrow("草稿暂时不可写");
      eng.failDraft = null;
      expect(await session.flushForExit()).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "1" });

      eng.failRead = null;
      expect(await session.load()).toBe(true);
      expect(await session.flush({ untilClean: true })).toBe(true);
      expect(session.getSnapshot()).toMatchObject({ text: "A", baseVersion: "2", state: "saved", hasUnsaved: false });
    } finally {
      allowWrite.resolve();
    }
  });

  test.each(["keepMine", "merge"] as const)("迟到写入对账后可用 %s 解决冲突，再明确保存", async (action) => {
    const path = "a.md";
    const base = "首行\n\n正文\n\n末行";
    const written = base.replace("末行", "写入末行");
    const mine = base.replace("首行", "本地首行");
    const eng = new FakeEngine({ [path]: base });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    session.setText(written);
    const oldSave = session.save();
    try {
      session.setText(base);
      expect(await session.load()).toBe(true);
      session.setText(mine);
      allowWrite.resolve();
      expect(await oldSave).toBe(false);
      expect(session.getSnapshot()).toMatchObject({ text: mine, baseVersion: "2", state: "conflict" });
      expect(await session.save()).toBe(false);

      if (action === "keepMine") await session.keepMine();
      else expect(await session.merge()).toBe(0);
      const expected = action === "merge" ? mine.replace("末行", "写入末行") : mine;
      expect(session.getSnapshot()).toMatchObject({ text: expected, state: "dirty", hasUnsaved: true });
      expect(eng.disk(path)).toBe(written);
      expect(await session.save()).toBe(true);
      expect(eng.disk(path)).toBe(expected);
      expect(session.getSnapshot()).toMatchObject({ text: expected, baseVersion: "3", state: "saved", hasUnsaved: false });
    } finally {
      allowWrite.resolve();
    }
  });

  test("恢复草稿后复读磁盘未变时，保留草稿的条件写版本", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const draft = { text: "旧稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" };
    eng.drafts.set(path, draft);
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const receipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      expect(eng.disk(path)).toBe("A");
      expect(await session.load()).toBe(true);
      session.restoreDraft();
      receipt.resolve();

      expect(await oldSave).toBe(false);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);
      expect(session.getSnapshot()).toMatchObject({ text: "旧稿", baseVersion: "1", state: "dirty", hasUnsaved: true });
      expect(await session.save()).toBe(false);
      expect(session.getSnapshot().state).toBe("conflict");
      expect(eng.disk(path)).toBe("A");
    } finally {
      receipt.resolve();
    }
  });

  test("merge：同一行冲突写入标记并报告块数", async () => {
    const eng = new FakeEngine({ "a.md": "x" });
    const s = mk(eng);
    await s.load();
    s.setText("mine");
    eng.externalWrite("a.md", "theirs");
    expect(await s.merge()).toBe(1);
    expect(s.currentText()).toContain("<<<<<<< 我的修改");
  });

  test("外部变更：干净缓冲直接载入；有未保存编辑进入冲突；保存中不打断", async () => {
    const eng = new FakeEngine({ "a.md": "v1" });
    const s = mk(eng);
    await s.load();
    eng.externalWrite("a.md", "v2");
    s.notifyExternalChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.currentText()).toBe("v2");
    s.setText("v2-mine");
    eng.externalWrite("a.md", "v3");
    s.notifyExternalChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getSnapshot()).toMatchObject({ text: "v2-mine", state: "conflict", hasUnsaved: true });
  });

  test("自身保存回执后才收到文件通知，下一笔编辑仍可保存", async () => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("A");
    expect(await session.save()).toBe(true);
    session.setText("B");

    session.notifyExternalChange("modified");
    await vi.advanceTimersByTimeAsync(0);

    expect(eng.disk("a.md")).toBe("A");
    expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "2", state: "dirty", hasUnsaved: true });
    expect(await session.save()).toBe(true);
    expect(eng.disk("a.md")).toBe("B");
  });

  test("自身保存通知早于回执时，额外读盘不会阻塞保存队列与退出", async () => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const session = mk(eng);
    await session.load();
    const receipt = Promise.withResolvers<void>();
    const read = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const first = session.save();
    eng.saveReceiptGate = null;
    session.notifyExternalChange("modified", eng.saveWriteIds[0] ?? "own-save-fixture");
    eng.readGate = read.promise;
    session.setText("B");
    const second = session.save();
    const exit = session.flushForExit();
    const settled = vi.fn();
    void Promise.all([first, second, exit]).then(settled);
    try {
      receipt.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledExactlyOnceWith([true, true, "file"]);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(1);
      expect(eng.saveWriteIds).toEqual([expect.any(String), expect.any(String)]);
      expect(eng.saveWriteIds[0]).not.toBe(eng.saveWriteIds[1]);
      expect(eng.disk("a.md")).toBe("B");
      expect(session.getSnapshot()).toMatchObject({ text: "B", state: "saved", hasUnsaved: false, flushError: null });
    } finally {
      read.resolve();
      await Promise.all([first, second, exit]);
    }
  });

  test("自身保存通知晚于回执时，读盘失败不会显示为保存失败", async () => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("A");
    expect(await session.save()).toBe(true);
    session.setText("B");

    eng.failRead = new Error("复读暂时失败");
    session.notifyExternalChange("modified", eng.saveWriteIds[0] ?? "own-save-fixture");
    await vi.advanceTimersByTimeAsync(0);

    expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "2", state: "dirty", flushError: null });
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(1);
    eng.failRead = null;
    session.notifyExternalChange("modified", "other-write");
    await vi.advanceTimersByTimeAsync(0);
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2); // 另一会话即使提交相同正文也会复读
    expect(session.getSnapshot()).toMatchObject({ text: "B", state: "dirty", flushError: null });
    expect(await session.save()).toBe(true);
    expect(eng.disk("a.md")).toBe("B");
  });

  test("自身通知与无标识 watcher 通知交错，保留真实的外部冲突", async () => {
    const eng = new FakeEngine({ "a.md": "初始" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    const receipt = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const saving = session.save();
    try {
      session.setText("B");
      eng.externalWrite("a.md", "C");
      session.notifyExternalChange("modified");
      session.notifyExternalChange("modified", eng.saveWriteIds[0] ?? "own-save-fixture");
      receipt.resolve();
      expect(await saving).toBe(true);
      expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "2", state: "conflict", hasUnsaved: true });
      expect(await session.save()).toBe(false);
      expect(eng.disk("a.md")).toBe("C");
    } finally {
      receipt.resolve();
    }
  });

  test("另一会话的通知会复读，暂时读不到磁盘时保留缓冲及保存状态", async () => {
    const eng = new FakeEngine({ "a.md": "A" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("B");
    eng.failRead = new Error("暂时不可读");
    session.notifyExternalChange("modified", "other-write");
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot()).toMatchObject({ text: "B", state: "dirty", flushError: null });
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);

    eng.failRead = null;
    eng.externalWrite("a.md", "C");
    session.notifyExternalChange("modified", "other-write-next");
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot()).toMatchObject({ text: "B", state: "conflict", flushError: null });
    expect(await session.save()).toBe(false);
    expect(eng.disk("a.md")).toBe("C");
  });

  test.each(["保存", "重载"] as const)("外部通知的迟到读数在%s接纳新基线后不能误报冲突", async (action) => {
    const eng = new FakeEngine({ "a.md": "A" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("B");
    const read = Promise.withResolvers<void>();
    eng.readGate = read.promise;
    session.notifyExternalChange("modified");
    eng.readGate = null;
    try {
      if (action === "保存") {
        expect(await session.save()).toBe(true);
      } else {
        eng.externalWrite("a.md", "C");
        expect(await session.load()).toBe(true);
      }
      session.setText("下一笔输入");
      read.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(session.lastSavedText()).toBe(action === "保存" ? "B" : "C");
      expect(session.getSnapshot()).toMatchObject({ text: "下一笔输入", baseVersion: "2", state: "dirty", hasUnsaved: true });
    } finally {
      read.resolve();
    }
  });

  test("较早的通知读到的外部改动已撤销，迟到读数不能覆盖较新的检查", async () => {
    const eng = new FakeEngine({ "a.md": "A" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    session.setText("B");
    const baseline = eng.files.get("a.md")!;
    const read = Promise.withResolvers<void>();
    eng.externalWrite("a.md", "C");
    eng.readGate = read.promise;
    session.notifyExternalChange("modified");
    eng.readGate = null;
    try {
      // 引擎的内容版本在文件恢复为同一字节串后也可恢复为同一值。
      eng.files.set("a.md", baseline);
      session.notifyExternalChange("modified");
      await vi.advanceTimersByTimeAsync(0);
      read.resolve();
      await vi.advanceTimersByTimeAsync(0);

      expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "1", state: "dirty", hasUnsaved: true });
    } finally {
      read.resolve();
    }
  });

  test("兜底轮询：dirty 且磁盘版本变化 → 冲突", async () => {
    const eng = new FakeEngine({ "a.md": "v1" });
    const s = mk(eng, "a.md", { pollMs: 1000, autosave: () => false });
    await s.load();
    s.setText("mine");
    eng.externalWrite("a.md", "other");
    await vi.advanceTimersByTimeAsync(1100);
    expect(s.getSnapshot().state).toBe("conflict");
  });

  test("草稿：载入时发现草稿；恢复沿用草稿基线版本；丢弃清除", async () => {
    const eng = new FakeEngine({ "a.md": "disk" });
    eng.drafts.set("a.md", { text: "draft", baseVersion: "0", savedAt: "2026-11-15T08:00:00" });
    const s = mk(eng);
    await s.load();
    expect(s.getSnapshot().draft?.text).toBe("draft");
    s.restoreDraft();
    expect(s.getSnapshot()).toMatchObject({ text: "draft", state: "dirty", baseVersion: "0", draft: null });
    expect(await s.save()).toBe(false); // 草稿之后磁盘被改过：走冲突流程而不是静默覆盖
    expect(s.getSnapshot().state).toBe("conflict");

    const eng2 = new FakeEngine({ "b.md": "disk" });
    eng2.drafts.set("b.md", { text: "stale", baseVersion: "1", savedAt: "2026-11-15T08:00:00" });
    const s2 = mk(eng2, "b.md");
    await s2.load();
    s2.discardDraft();
    expect(eng2.drafts.has("b.md")).toBe(false);
    expect(s2.getSnapshot().draft).toBeNull();
  });

  test("与磁盘相同的草稿被自动丢弃", async () => {
    const eng = new FakeEngine({ "a.md": "same" });
    eng.drafts.set("a.md", { text: "same", baseVersion: "1", savedAt: "x" });
    const s = mk(eng);
    await s.load();
    expect(s.getSnapshot().draft).toBeNull();
    expect(eng.drafts.size).toBe(0);
  });

  test.each([false, true])("保存无关正文仍保留尚未处理的未知草稿（自动保存 %s）", async (autosave) => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    const draft = { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" } as const;
    eng.drafts.set(path, draft);
    const session = mk(eng, path, { autosave: () => autosave });
    await session.load();
    session.setText("B");
    if (autosave) await vi.advanceTimersByTimeAsync(900);
    else expect(await session.save()).toBe(true);

    expect(eng.disk(path)).toBe("B");
    expect(session.getSnapshot()).toMatchObject({ text: "B", state: "saved", hasUnsaved: false, draft });
    expect(eng.drafts.get(path)).toEqual(draft);
    expect(eng.calls).not.toContain("notes.draft.discard");
  });

  test("保存无关正文仍保留尚未处理的未知草稿（草稿尚未载入）", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const draft = { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" } as const;
    eng.drafts.set(path, draft);
    session.setText("B");

    expect(await session.save()).toBe(true);
    expect(eng.disk(path)).toBe("B");
    expect(eng.drafts.get(path)).toEqual(draft);
    expect(eng.calls).not.toContain("notes.draft.discard");
  });

  test("同一缓冲的普通草稿在正文保存后清除", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    session.setText("B");
    await session.keepDraft();
    expect(eng.drafts.get(path)?.text).toBe("B");

    expect(await session.save()).toBe(true);
    expect(eng.disk(path)).toBe("B");
    expect(eng.drafts.has(path)).toBe(false);
  });

  test("确认放弃并重载会丢弃已恢复的未知草稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const draft = { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" } as const;
    eng.drafts.set(path, draft);
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    session.restoreDraft();
    expect(session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true });

    expect(await session.load()).toBe(true);
    expect(session.getSnapshot().draft).toEqual(draft);
    expect(eng.drafts.get(path)).toEqual(draft);
    session.restoreDraft();

    expect(await session.discardEditsAndReload()).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ text: "X", state: "saved", hasUnsaved: false, draft: null });
    expect(eng.drafts.has(path)).toBe(false);
    expect(eng.calls).not.toContain("notes.save");
    const reopened = mk(eng, path);
    await reopened.load();
    expect(reopened.getSnapshot().draft).toBeNull();
  });

  test("确认放弃并重载若草稿删除失败，仍保留已恢复的未知正文", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    const draft = { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" } as const;
    eng.drafts.set(path, draft);
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    session.restoreDraft();
    eng.failDraftDiscard = new Error("草稿暂时不能删除");

    expect(await session.discardEditsAndReload()).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true, flushError: "草稿暂时不能删除" });
    expect(eng.drafts.get(path)).toEqual(draft);
    eng.failDraftDiscard = null;
    expect(await session.discardEditsAndReload()).toBe(true);
    expect(eng.drafts.has(path)).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ text: "A", state: "saved", hasUnsaved: false, draft: null });
  });

  test("确认放弃并重载普通编辑时保留尚未恢复的未知草稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    const draft = { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" } as const;
    eng.drafts.set(path, draft);
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    session.setText("B");
    eng.externalWrite(path, "C");
    session.notifyExternalChange("modified");
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().state).toBe("conflict");

    expect(await session.discardEditsAndReload()).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ text: "C", state: "saved", hasUnsaved: false, draft });
    expect(eng.drafts.get(path)).toEqual(draft);
    expect(eng.calls).not.toContain("notes.draft.discard");
  });

  test.each(["确认前", "确认已读草稿后"] as const)("确认放弃只处理当前缓冲的草稿，保留另一会话%s写下的新稿", async (timing) => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "A" });
    eng.drafts.set(path, { text: "X", baseVersion: "1", savedAt: "2026-11-15T08:00:00", outcome: "unknown" });
    const old = mk(eng, path, { autosave: () => false });
    const other = mk(eng, path, { autosave: () => false });
    await old.load();
    await other.load();
    old.restoreDraft();
    other.restoreDraft();
    other.setText("Y");

    if (timing === "确认前") await other.keepDraft();
    const releaseDiscard = Promise.withResolvers<void>();
    eng.draftDiscardGate = releaseDiscard.promise;
    const reloading = old.discardEditsAndReload();
    try {
      if (timing === "确认已读草稿后") {
        await vi.advanceTimersByTimeAsync(0);
        expect(eng.calls).toContain("notes.draft.discard");
        await other.keepDraft();
      }
      releaseDiscard.resolve();
      expect(await reloading).toBe(true);
      expect(eng.disk(path)).toBe("A");
      expect(eng.drafts.get(path)).toMatchObject({ text: "Y", outcome: "unknown" });
      expect(old.getSnapshot()).toMatchObject({ text: "A", state: "saved", hasUnsaved: false, draft: { text: "Y", outcome: "unknown" } });
    } finally {
      releaseDiscard.resolve();
    }
  });

  test("dispose：自动保存模式落盘；落盘失败改存草稿；手动模式留草稿", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const s = mk(eng);
    await s.load();
    s.setText("12");
    await s.dispose();
    expect(eng.disk("a.md")).toBe("12");

    const eng2 = new FakeEngine({ "a.md": "1" });
    const s2 = mk(eng2);
    await s2.load();
    s2.setText("12");
    eng2.externalWrite("a.md", "ext");
    await s2.dispose();
    expect(eng2.disk("a.md")).toBe("ext");
    expect(eng2.drafts.get("a.md")?.text).toBe("12");

    const eng3 = new FakeEngine({ "a.md": "1" });
    const s3 = mk(eng3, "a.md", { autosave: () => false });
    await s3.load();
    s3.setText("12");
    await s3.dispose();
    expect(eng3.disk("a.md")).toBe("1");
    expect(eng3.drafts.get("a.md")?.text).toBe("12");
  });

  test("flushForExit / keepDraft", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const s = mk(eng);
    await s.load();
    await expect(s.flushForExit()).resolves.toBeUndefined();
    s.setText("2");
    await expect(s.flushForExit()).resolves.toBe("file");
    expect(eng.disk("a.md")).toBe("2");
    s.setText("3");
    await s.keepDraft();
    expect(eng.drafts.get("a.md")?.text).toBe("3");
    expect(eng.disk("a.md")).toBe("2");
  });

  test("切 Vault 的留稿跨对账切代时仍写入当前正文，写失败会拒绝切换", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    session.setText("A");
    const oldSave = session.save();
    try {
      session.setText("X");
      expect(await session.load()).toBe(true);
      session.setText("B");
      const draftError = new Error("草稿写入失败，不能切换 Vault");
      eng.failDraft = draftError;
      const outcome = Promise.allSettled([session.keepDraft()]);
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls).not.toContain("notes.draft.save");
      expect(eng.disk(path)).toBe("X");

      allowWrite.resolve();
      expect(await oldSave).toBe(false);
      expect(await outcome).toEqual([{ status: "rejected", reason: draftError }]);
      expect(eng.calls.filter((capability) => capability === "notes.draft.save")).toHaveLength(1);
      expect(eng.drafts.has(path)).toBe(false);
      expect(session.getSnapshot()).toMatchObject({ text: "B", baseVersion: "2", state: "conflict", hasUnsaved: true });

      eng.failDraft = null;
      await expect(session.keepDraft()).resolves.toBeUndefined();
      expect(eng.drafts.get(path)).toMatchObject({ text: "B", baseVersion: "2" });
      expect(eng.disk(path)).toBe("A");
    } finally {
      allowWrite.resolve();
    }
  });

  test("撤销回旧磁盘正文后，回执或对账待定期间都参加切 Vault 留稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const receipt = Promise.withResolvers<void>();
    const releaseReconciliation = Promise.withResolvers<void>();
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const saving = session.save();
    try {
      expect(eng.disk(path)).toBe("A");
      session.setText("X");
      const beforeReceipt = session.getSnapshot();
      eng.readGate = releaseReconciliation.promise;
      receipt.reject(Object.assign(new Error("正文已落盘，刷新索引失败"), { code: "INTERNAL" }));
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(2);
      const duringReconciliation = session.getSnapshot();
      eng.readGate = null;

      const keeping = session.keepDraft();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls).not.toContain("notes.draft.save");
      releaseReconciliation.resolve();
      expect(await saving).toBe(false);
      await keeping;

      expect(eng.disk(path)).toBe("A");
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "2" });
      expect.soft(beforeReceipt).toMatchObject({ text: "X", hasUnsaved: true });
      expect(duringReconciliation).toMatchObject({ text: "X", hasUnsaved: true });
    } finally {
      receipt.resolve();
      releaseReconciliation.resolve();
    }
  });

  test("手动保存回执在途时退出：以该回执的版本保留后续输入的草稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "初始正文" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const release = Promise.withResolvers<void>();
    eng.saveGate = release.promise;
    session.setText("A");
    const saving = session.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().state).toBe("saving");
    session.setText("A+B");
    const exiting = session.flushForExit();
    release.resolve();

    await expect(saving).resolves.toBe(true);
    await expect(exiting).resolves.toBe("draft");
    expect(eng.disk(path)).toBe("A");
    expect(eng.drafts.get(path)).toMatchObject({ text: "A+B", baseVersion: "2" });
  });

  test("迟到的载入结果被丢弃", async () => {
    const eng = new FakeEngine({ "a.md": "one" });
    const s = mk(eng);
    const first = s.load();
    eng.externalWrite("a.md", "two");
    const second = s.load();
    await Promise.all([first, second]);
    expect(s.currentText()).toBe("two");
  });

  test("重载等待磁盘读取期间同基线保存成功，重载重新读取磁盘", async () => {
    const eng = new FakeEngine({ "a.md": "旧正文" });
    const session = mk(eng, "a.md", { autosave: () => false });
    await session.load();
    const allowSave = Promise.withResolvers<void>();
    const releaseOldRead = Promise.withResolvers<void>();
    eng.saveGate = allowSave.promise;
    session.setText("已保存正文");
    const saving = session.save();
    eng.readGate = releaseOldRead.promise;
    const loading = session.load();
    eng.readGate = null;
    allowSave.resolve();
    expect(await saving).toBe(true);
    releaseOldRead.resolve();

    expect(await loading).toBe(true);
    expect(eng.calls.filter((capability) => capability === "notes.read")).toHaveLength(3);
    expect(session.getSnapshot()).toMatchObject({ baseVersion: "2", text: "已保存正文", state: "saved", hasUnsaved: false });
  });

  test("同基线保存落盘后回执失败，尚未接纳的重载读数不能造成假干净", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "X" });
    const session = mk(eng, path, { autosave: () => false });
    await session.load();
    const allowWrite = Promise.withResolvers<void>();
    const receipt = Promise.withResolvers<void>();
    const releaseReload = Promise.withResolvers<void>();
    const releaseReconciliation = Promise.withResolvers<void>();
    eng.saveGate = allowWrite.promise;
    eng.saveReceiptGate = receipt.promise;
    session.setText("A");
    const saving = session.save();
    try {
      session.setText("X");
      eng.readGate = releaseReload.promise;
      const loading = session.load();
      eng.readGate = null;
      const reads = () => eng.calls.filter((capability) => capability === "notes.read").length;
      expect(reads()).toBe(2);
      expect(eng.disk(path)).toBe("X");

      allowWrite.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.disk(path)).toBe("A");
      eng.readGate = releaseReconciliation.promise;
      receipt.reject(new TypeError("正文已写入，响应连接断开"));
      await vi.advanceTimersByTimeAsync(0);
      expect.soft(reads()).toBe(3);
      eng.readGate = null;
      releaseReload.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect.soft(reads()).toBe(3); // 旧取样释放后仍须等待写入对账，不能抢先重载。
      releaseReconciliation.resolve();
      expect(await saving).toBe(false);
      await loading;

      const flushed = await session.flush({ untilClean: true });
      const snapshot = session.getSnapshot();
      const exit = await session.flushForExit();
      expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
      expect(eng.disk(path)).toBe("A");
      expect.soft(reads()).toBeGreaterThan(2);
      expect.soft(snapshot).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true });
      expect.soft(flushed).toBe(false);
      expect.soft(exit).toBe("draft");
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "2" });
    } finally {
      allowWrite.resolve();
      receipt.resolve();
      releaseReload.resolve();
      releaseReconciliation.resolve();
    }
  });

  test("重开草稿读取期间的待结算输入保留在当前编辑器", async () => {
    const eng = new FakeEngine({ "a.md": "原文" });
    const s = mk(eng, "a.md", { autosave: () => false });
    await s.load();
    s.setText("第一笔");
    let pending = "第一笔";
    s.attachDrainer(() => s.setText(pending));
    const started = Promise.withResolvers<void>();
    const done = Promise.withResolvers<void>();
    const call = eng.call.bind(eng);
    eng.call = async <T>(cap: string, input: unknown): Promise<T> => {
      if (cap === "notes.read") {
        started.resolve();
        await done.promise;
      }
      return call<T>(cap, input);
    };
    const reopening = s.reopenDraft();
    await started.promise;
    pending = "第一笔和后来输入";
    done.resolve();
    await reopening;
    expect(s.currentText()).toBe("第一笔和后来输入");
    expect(eng.disk("a.md")).toBe("原文");
    await expect(s.flushForExit()).resolves.toBe("draft");
    expect(eng.drafts.get("a.md")?.text).toBe("第一笔和后来输入");
  });

  test("编码：BOM / CRLF / 末尾换行原样读写，不规范化", async () => {
    const text = "﻿line1\r\nline2\r\n";
    const eng = new FakeEngine({ "a.md": text });
    const s = mk(eng);
    await s.load();
    expect(s.getSnapshot().format).toEqual({ bom: true, eol: "crlf", finalNewline: true });
    expect(s.currentText()).toBe(text);
    s.setText(`${text}line3\r\n`);
    await s.flush();
    expect(Buffer.from(eng.disk("a.md"))).toEqual(Buffer.from(`${text}line3\r\n`));
    // 不做任何编辑也不写盘
    const writes = eng.calls.filter((c) => c === "notes.save").length;
    await s.flush();
    expect(eng.calls.filter((c) => c === "notes.save").length).toBe(writes);
  });

  test("detectTextFormat / documentKindOf", () => {
    expect(detectTextFormat("a\nb")).toEqual({ bom: false, eol: "lf", finalNewline: false });
    expect(detectTextFormat("a\r\nb\n").eol).toBe("mixed");
    expect(detectTextFormat("a\rb").eol).toBe("cr");
    expect(detectTextFormat("abc").eol).toBe("none");
    expect(documentKindOf("x/Y.JSON")).toBe("json");
    expect(documentKindOf("a.md")).toBe("markdown");
    expect(documentKindOf("a.txt")).toBe("text");
  });
});

describe("DocumentSessionRegistry：按 (vaultId, path) 引用计数", () => {
  const make = (eng: FakeEngine) => (id: ConstructorParameters<typeof DocumentSession>[0]["id"]) => new DocumentSession({ id, engine: eng, pollMs: 0 });

  test("同一文件的两个引用共用一个会话；归零才销毁并落盘", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const reg = new DocumentSessionRegistry();
    const a = await reg.acquire("v", "a.md", make(eng));
    const b = await reg.acquire("v", "a.md", make(eng));
    expect(a.session).toBe(b.session);
    expect(reg.refs("v", "a.md")).toBe(2);
    await a.session.load();
    a.session.setText("12");
    await a.release();
    expect(reg.size).toBe(1);
    expect(eng.disk("a.md")).toBe("1"); // 还有引用：不销毁、不强制落盘
    await b.release();
    expect(reg.size).toBe(0);
    expect(eng.disk("a.md")).toBe("12"); // 归零 → dispose → 落盘
  });

  test("重复 release 无效；不同 Vault / 路径是不同会话", async () => {
    const eng = new FakeEngine({ "a.md": "1", "b.md": "2" });
    const reg = new DocumentSessionRegistry();
    const a = await reg.acquire("v1", "a.md", make(eng));
    const a2 = await reg.acquire("v2", "a.md", make(eng));
    const b = await reg.acquire("v1", "b.md", make(eng));
    expect(new Set([a.session, a2.session, b.session]).size).toBe(3);
    expect(new Set([a.session.id.epoch, a2.session.id.epoch, b.session.id.epoch]).size).toBe(3);
    await a.release();
    await a.release();
    expect(reg.size).toBe(2);
  });

  test("B09：同路径切 Vault 后，旧 Vault 的延迟载入和保存回执互不影响", async () => {
    const old = new FakeEngine({ "a.md": "旧库已存" });
    const next = new FakeEngine({ "a.md": "新库已存" });
    const reg = new DocumentSessionRegistry();
    const a = await reg.acquire("old", "a.md", make(old));
    await a.session.load();
    const read = Promise.withResolvers<void>();
    const write = Promise.withResolvers<void>();
    old.readGate = read.promise;
    old.saveGate = write.promise;
    const oldLoad = a.session.load();
    a.session.setText("旧库修改");
    const oldSave = a.session.save();
    const releasing = a.release();

    const b = await reg.acquire("next", "a.md", make(next));
    await b.session.load();
    b.session.setText("新库当前编辑");
    expect(b.session.id.epoch).not.toBe(a.session.id.epoch);
    write.resolve();
    expect(await oldSave).toBe(true);
    await releasing;
    read.resolve();
    expect(await oldLoad).toBe(false);
    expect(b.session.getSnapshot()).toMatchObject({ text: "新库当前编辑", hasUnsaved: true, state: "dirty" });
    expect(old.disk("a.md")).toBe("旧库修改");
    expect(next.disk("a.md")).toBe("新库已存");
    await b.release();
    expect(next.disk("a.md")).toBe("新库当前编辑");
  });

  test("销毁中重新打开：等旧会话写完，再建新会话并读到最新内容", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const reg = new DocumentSessionRegistry();
    const a = await reg.acquire("v", "a.md", make(eng));
    await a.session.load();
    a.session.setText("12");
    const releasing = a.release();
    const b = await reg.acquire("v", "a.md", make(eng));
    await releasing;
    expect(b.session).not.toBe(a.session);
    await b.session.load();
    expect(b.session.currentText()).toBe("12");
  });

  test("未知写入超时后，同文草稿跨两次重开仍可恢复撤销正文", async () => {
    const path = "a.txt";
    const timeoutMs = 10;
    const eng = new FakeEngine({ [path]: "X" });
    const releaseWrite = Promise.withResolvers<void>();
    const committed = Promise.withResolvers<void>();
    eng.saveGate = releaseWrite.promise;
    const capabilities = new CapabilityRegistry();
    capabilities.register(
      defineCapability({
        name: "notes.save",
        plugin: "notes",
        scope: "write",
        input: z.object({ path: z.string(), text: z.string(), expectedVersion: z.string() }),
        output: z.object({ version: z.string() }),
        exposable: true,
        defaultExposed: true,
        timeoutMs,
        handler: async (_context, input) => {
          const result = await eng.call<{ version: string }>("notes.save", input);
          committed.resolve();
          return result;
        },
      }),
    );
    const dispatcher = new Dispatcher({
      registry: capabilities,
      audit: new GatewayAudit(),
      idempotency: new IdempotencyStore(),
      isPluginEnabled: () => true,
      toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
      grantedPermissions: () => [],
      pluginOrigin: () => "builtin",
    });
    let saveReply: unknown;
    const engine = new EngineClient({ baseUrl: "http://127.0.0.1:1", vaultId: "v" }, async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as Parameters<Dispatcher["call"]>[1];
      if (request.capability === "notes.save") {
        saveReply = await dispatcher.call("desktop", request);
        return Response.json(saveReply);
      }
      return Response.json({ ok: true, data: await eng.call(request.capability, request.input) });
    });
    const sessions = new DocumentSessionRegistry();
    const open = (autosave = false) => sessions.acquire("v", path, (id) => new DocumentSession({ id, engine, autosave: () => autosave, pollMs: 0 }));
    try {
      const first = await open();
      expect(await first.session.load()).toBe(true);
      first.session.setText("A", "plain");
      const saving = first.session.save();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls).toContain("notes.save");
      first.session.setText("X", "plain");
      await vi.advanceTimersByTimeAsync(timeoutMs);
      expect(await saving).toBe(false);
      expect(saveReply).toMatchObject({ ok: false, error: { retryable: false, details: { outcome: "unknown" } } });
      expect(first.session.getSnapshot()).toMatchObject({ text: "X", hasUnsaved: true, state: "conflict" });
      expect(eng.disk(path)).toBe("X");
      await first.release();
      expect(eng.drafts.get(path)).toMatchObject({ text: "X", baseVersion: "1", outcome: "unknown" });

      const beforeCommit = await open(true);
      expect(beforeCommit.session).not.toBe(first.session);
      expect(await beforeCommit.session.load()).toBe(true);
      expect(eng.disk(path)).toBe("X");
      expect.soft(beforeCommit.session.getSnapshot().draft).toMatchObject({ text: "X", baseVersion: "1", outcome: "unknown" });
      expect.soft(eng.calls).not.toContain("notes.draft.discard");
      beforeCommit.session.restoreDraft();
      expect(beforeCommit.session.getSnapshot()).toMatchObject({ text: "X", state: "conflict", hasUnsaved: true });
      expect(await beforeCommit.session.flush({ untilClean: true })).toBe(false);
      await vi.advanceTimersByTimeAsync(900);
      expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
      await beforeCommit.release();

      releaseWrite.resolve();
      await committed.promise;
      expect(eng.disk(path)).toBe("A");
      const afterCommit = await open(true);
      expect(afterCommit.session).not.toBe(beforeCommit.session);
      expect(await afterCommit.session.load()).toBe(true);
      expect(afterCommit.session.getSnapshot().draft).toMatchObject({ text: "X", baseVersion: "1", outcome: "unknown" });
      afterCommit.session.restoreDraft();
      expect(afterCommit.session.getSnapshot()).toMatchObject({ text: "X", baseVersion: "1", state: "conflict", hasUnsaved: true });
      await vi.advanceTimersByTimeAsync(900);
      expect(eng.disk(path)).toBe("A");
      expect(eng.calls.filter((capability) => capability === "notes.save")).toHaveLength(1);
      await afterCommit.release();
    } finally {
      releaseWrite.resolve();
    }
  });

  test("正文和草稿都写失败时保留同一会话；重开并成功保存后才清理", async () => {
    const eng = new FakeEngine({ "a.md": "原稿" });
    const reg = new DocumentSessionRegistry();
    const teardown = vi.fn();
    const a = await reg.acquire("v", "a.md", make(eng), () => teardown);
    await a.session.load();
    a.session.setText("含最后一笔的草稿");
    eng.failSave = new Error("正文磁盘写入失败");
    eng.failDraft = new Error("草稿磁盘写入失败");
    await expect(a.release()).rejects.toThrow("草稿磁盘写入失败");
    expect(reg.get("v", "a.md")).toBe(a.session);
    expect(a.session.getSnapshot()).toMatchObject({ text: "含最后一笔的草稿", hasUnsaved: true });
    expect(teardown).not.toHaveBeenCalled();
    expect(eng.disk("a.md")).toBe("原稿");
    expect(eng.drafts.has("a.md")).toBe(false);

    const b = await reg.acquire("v", "a.md", make(eng));
    expect(b.session).toBe(a.session);
    eng.failSave = null;
    eng.failDraft = null;
    await b.release();
    expect(eng.disk("a.md")).toBe("含最后一笔的草稿");
    expect(reg.size).toBe(0);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  test("OP-D03：停放后由 provider 持有引用；另一视图使用同一会话，驱逐只归还停放引用", async () => {
    const eng = new FakeEngine({ "a.md": "原稿" });
    const reg = new DocumentSessionRegistry();
    const a = await reg.acquire("v", "a.md", make(eng));
    await a.session.load();
    const evict = reg.retainForPark(a.session);
    expect(reg.refs("v", "a.md")).toBe(2);
    await a.release();
    expect(reg.refs("v", "a.md")).toBe(1);
    const b = await reg.acquire("v", "a.md", make(eng));
    expect(b.session).toBe(a.session);
    expect(reg.refs("v", "a.md")).toBe(2);
    await evict();
    expect(reg.refs("v", "a.md")).toBe(1);
    await b.release();
    expect(reg.get("v", "a.md")).toBeUndefined();
  });

  test("首个活动租约恢复时读取停放期间错过通知的正文", async () => {
    const eng = new FakeEngine({ "a.md": "桌面已保存正文" });
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", "a.md", make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();

    expect(reg.refs("v", "a.md")).toBe(1);
    expect(before.session.getSnapshot().hasUnsaved).toBe(false);
    eng.externalWrite("a.md", "Web 写入的新正文");
    eng.calls.length = 0;

    const resumed = await reg.acquire("v", "a.md", make(eng));
    expect(resumed.session).toBe(before.session);
    await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ text: "Web 写入的新正文", baseVersion: "2", state: "saved", hasUnsaved: false }));
    expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(1);
    const anotherView = await reg.acquire("v", "a.md", make(eng));
    expect(anotherView.session).toBe(resumed.session);
    expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(1);

    await Promise.all([anotherView.release(), resumed.release(), evict()]);
    expect(eng.calls).not.toContain("notes.save");
  });

  test("恢复干净的停放会话时保留可恢复草稿", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const draft = { text: "本地草稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" };
    eng.drafts.set(path, draft);
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", path, make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "Web 正文");
    eng.calls.length = 0;

    const resumed = await reg.acquire("v", path, make(eng));
    await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ text: "Web 正文", baseVersion: "2", hasUnsaved: false, draft }));
    expect(eng.drafts.get(path)).toEqual(draft);
    expect(eng.calls).not.toContain("notes.draft.discard");
    await Promise.all([resumed.release(), evict()]);
    expect(eng.calls).not.toContain("notes.save");
  });

  test.each(["读到草稿后", "删除草稿期间"] as const)("停放恢复读取发生在%s时，用户丢弃的草稿不再出现", async (timing) => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    eng.drafts.set(path, { text: "待丢弃的草稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" });
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", path, make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "Web 正文");
    eng.calls.length = 0;

    const read = Promise.withResolvers<void>();
    const discard = Promise.withResolvers<void>();
    eng.readGate = read.promise;
    if (timing === "删除草稿期间") {
      eng.draftDiscardGate = discard.promise;
      before.session.discardDraft();
      expect(eng.drafts.has(path)).toBe(true);
    }
    const resumed = await reg.acquire("v", path, make(eng));
    try {
      expect(eng.calls).toContain("notes.read");
      if (timing === "读到草稿后") {
        expect(eng.calls).toContain("notes.draft.get");
        resumed.session.discardDraft();
        expect(eng.drafts.has(path)).toBe(false);
      }
      read.resolve();
      await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ text: "Web 正文", baseVersion: "2", draft: null }));
      discard.resolve();
      await vi.waitFor(() => expect(eng.drafts.has(path)).toBe(false));
      expect(resumed.session.getSnapshot().draft).toBeNull();
      expect(eng.calls).not.toContain("notes.save");
    } finally {
      read.resolve();
      discard.resolve();
      await Promise.all([resumed.release(), evict()]);
    }
  });

  test("停放恢复读草稿失败时保留恢复入口并报告错误，重读成功后清除错误", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const draft = { text: "本地草稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" };
    eng.drafts.set(path, draft);
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", path, make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "Web 正文");
    eng.failDraftRead = new Error("草稿暂时不可读");

    const resumed = await reg.acquire("v", path, make(eng));
    try {
      await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ text: "Web 正文", baseVersion: "2", hasUnsaved: false, draft, flushError: expect.stringContaining("草稿暂时不可读") }));
      expect(eng.drafts.get(path)).toEqual(draft);

      eng.failDraftRead = null;
      eng.drafts.delete(path);
      resumed.session.notifyExternalChange();
      await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ draft: null, flushError: null }));
      expect(eng.calls).not.toContain("notes.save");
    } finally {
      await Promise.all([resumed.release(), evict()]);
    }
  });

  test("恢复仍有本地编辑的停放会话时确认冲突并保留正文", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const reg = new DocumentSessionRegistry();
    const makeManual = (id: ConstructorParameters<typeof DocumentSession>[0]["id"]) => new DocumentSession({ id, engine: eng, autosave: () => false, pollMs: 0 });
    const before = await reg.acquire("v", path, makeManual);
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    before.session.setText("停放后交付的本地编辑");
    eng.externalWrite(path, "Web 正文");
    eng.calls.length = 0;

    const resumed = await reg.acquire("v", path, makeManual);
    await vi.waitFor(() => expect(resumed.session.getSnapshot()).toMatchObject({ text: "停放后交付的本地编辑", baseVersion: "1", state: "conflict", hasUnsaved: true }));
    expect(eng.calls).toEqual(["notes.read"]);
    expect(eng.disk(path)).toBe("Web 正文");
    await Promise.all([resumed.release(), evict()]);
    expect(eng.calls).not.toContain("notes.save");
  });

  test("停放恢复读取在途时保留新输入，并发租约共用同一次核对", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const reg = new DocumentSessionRegistry();
    const makeManual = (id: ConstructorParameters<typeof DocumentSession>[0]["id"]) => new DocumentSession({ id, engine: eng, autosave: () => false, pollMs: 0 });
    const before = await reg.acquire("v", path, makeManual);
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "Web 正文");
    eng.calls.length = 0;

    const held = Promise.withResolvers<void>();
    eng.readGate = held.promise;
    const [resumed, anotherView] = await Promise.all([reg.acquire("v", path, makeManual), reg.acquire("v", path, makeManual)]);
    expect(resumed.session).toBe(anotherView.session);
    expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(1);
    resumed.session.setText("读盘期间的新输入");
    held.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(resumed.session.getSnapshot()).toMatchObject({ text: "读盘期间的新输入", baseVersion: "1", state: "dirty", hasUnsaved: true });
    expect(eng.disk(path)).toBe("Web 正文");
    await Promise.all([anotherView.release(), resumed.release(), evict()]);
    expect(eng.calls).not.toContain("notes.save");
  });

  test("停放恢复接纳磁盘正文前等待编辑器交付，保留待结算输入", async () => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const reg = new DocumentSessionRegistry();
    const makeManual = (id: ConstructorParameters<typeof DocumentSession>[0]["id"]) => new DocumentSession({ id, engine: eng, autosave: () => false, pollMs: 0 });
    const before = await reg.acquire("v", path, makeManual);
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "Web 正文");
    const read = Promise.withResolvers<void>();
    const delivery = Promise.withResolvers<void>();
    eng.readGate = read.promise;
    const resumed = await reg.acquire("v", path, makeManual);
    const drain = vi.fn(async () => {
      await delivery.promise;
      resumed.session.setText("原稿和待结算输入");
    });
    const detach = resumed.session.attachDrainer(drain);

    try {
      read.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(drain).toHaveBeenCalledOnce();
      expect(resumed.session.getSnapshot()).toMatchObject({ text: "原稿", baseVersion: "1" });
      delivery.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(resumed.session.getSnapshot()).toMatchObject({ text: "原稿和待结算输入", baseVersion: "1", hasUnsaved: true });
      expect(eng.disk(path)).toBe("Web 正文");
      expect(eng.calls).not.toContain("notes.save");
    } finally {
      read.resolve();
      delivery.resolve();
      detach();
      await Promise.all([resumed.release(), evict()]);
    }
  });

  test.each(["提交", "取消"] as const)("停放恢复在组合输入%s前不启动自动保存，结算后重新核对磁盘", async (finish) => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    const original = eng.files.get(path)!;
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", path, make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "已被撤销的外部正文");
    eng.calls.length = 0;

    const read = Promise.withResolvers<void>();
    eng.readGate = read.promise;
    const resumed = await reg.acquire("v", path, make(eng));
    const session = resumed.session;
    let composing = true;
    let onSettled: (() => void) | undefined;
    const drain = vi.fn(() => {
      if (composing) session.setText("原稿nihao");
    });
    const detach = session.attachDrainer(drain, {
      isComposing: () => composing,
      onCompositionSettled: (listener: () => void) => {
        onSettled = listener;
        return () => {
          onSettled = undefined;
        };
      },
    });
    try {
      expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(1);
      // 真正的文件版本取决于字节，恢复原字节会再次匹配旧条件写版本。
      eng.files.set(path, original);
      eng.readGate = null;
      read.resolve();
      await vi.advanceTimersByTimeAsync(801);
      expect(eng.disk(path)).toBe("原稿");
      expect(eng.calls).not.toContain("notes.save");
      expect(drain).not.toHaveBeenCalled();
      expect(session.getSnapshot()).toMatchObject({ text: "原稿", baseVersion: "1", state: "saved" });

      if (finish === "提交") session.setText("原稿你好");
      else eng.externalWrite(path, "取消后重新读取的磁盘正文");
      composing = false;
      onSettled?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(2);
      if (finish === "提交") {
        expect(session.getSnapshot()).toMatchObject({ text: "原稿你好", state: "dirty" });
        await vi.advanceTimersByTimeAsync(801);
        expect(eng.disk(path)).toBe("原稿你好");
        expect(eng.calls.filter((call) => call === "notes.save")).toHaveLength(1);
      } else {
        expect(session.getSnapshot()).toMatchObject({ text: "取消后重新读取的磁盘正文", state: "saved" });
        expect(eng.calls).not.toContain("notes.save");
      }
    } finally {
      read.resolve();
      detach();
      await Promise.all([resumed.release(), evict()]);
    }
  });

  test.each(["后台读取失败", "显式重载失败", "文件删除", "恢复草稿切换基线"] as const)("停放恢复的待复读在组合取消时检查后续操作：%s", async (later) => {
    const path = "a.md";
    const eng = new FakeEngine({ [path]: "原稿" });
    eng.drafts.set(path, { text: "恢复的本地稿", baseVersion: "1", savedAt: "2026-11-15T08:00:00" });
    const reg = new DocumentSessionRegistry();
    const before = await reg.acquire("v", path, make(eng));
    await before.session.load();
    const evict = reg.retainForPark(before.session);
    await before.release();
    eng.externalWrite(path, "外部正文");
    eng.calls.length = 0;
    const readCount = () => eng.calls.filter((call) => call === "notes.read").length;
    const read = Promise.withResolvers<void>();
    eng.readGate = read.promise;
    const resumed = await reg.acquire("v", path, make(eng));
    const session = resumed.session;
    let composing = true;
    let onSettled: (() => void) | undefined;
    const drain = vi.fn();
    const detach = session.attachDrainer(drain, {
      isComposing: () => composing,
      onCompositionSettled: (listener) => {
        onSettled = listener;
        return () => {
          onSettled = undefined;
        };
      },
    });
    try {
      expect(readCount()).toBe(1);
      eng.readGate = null;
      read.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(drain).not.toHaveBeenCalled();
      expect(session.getSnapshot()).toMatchObject({ text: "原稿", baseVersion: "1", flushError: null });

      if (later === "后台读取失败" || later === "显式重载失败") {
        eng.failRead = new Error("暂时无法读取正文");
        if (later === "显式重载失败") await expect(session.load()).rejects.toThrow("暂时无法读取正文");
        session.notifyExternalChange("modified");
        await vi.advanceTimersByTimeAsync(0);
        expect(session.getSnapshot()).toMatchObject({ text: "原稿", baseVersion: "1", flushError: "暂时无法读取正文" });
        eng.failRead = null;
      } else if (later === "文件删除") {
        eng.files.delete(path);
        session.notifyExternalChange("deleted");
        await vi.advanceTimersByTimeAsync(0);
        expect(session.getSnapshot().flushError).toMatch(/已移走或删除/);
        // 路径即使又可读，也须经新通知或重开才能刷新。
        eng.files.set(path, { text: "同路径的新文件", version: 3 });
      } else {
        session.restoreDraft();
        expect(session.getSnapshot()).toMatchObject({ text: "恢复的本地稿", state: "dirty" });
      }

      const readsBeforeCancel = readCount();
      const beforeCancel = session.getSnapshot();
      composing = false;
      onSettled?.();
      await vi.advanceTimersByTimeAsync(0);

      if (later === "后台读取失败") {
        expect(readCount()).toBe(readsBeforeCancel + 1);
        expect(session.getSnapshot()).toMatchObject({ text: "外部正文", baseVersion: "2", state: "saved", flushError: null });
      } else {
        expect(readCount()).toBe(readsBeforeCancel);
        expect(session.getSnapshot()).toEqual(beforeCancel);
      }
      expect(eng.calls).not.toContain("notes.save");
    } finally {
      read.resolve();
      eng.failRead = null;
      detach();
      await Promise.all([resumed.release(), evict()]);
    }
  });

  test("C06：停放时文件已消失，草稿写成后最后引用仍可释放，恢复路径后可读取草稿", async () => {
    const eng = new FakeEngine({ "a.md": "原稿" });
    const reg = new DocumentSessionRegistry();
    const makeManual = (id: ConstructorParameters<typeof DocumentSession>[0]["id"]) => new DocumentSession({ id, engine: eng, autosave: () => false, pollMs: 0 });
    const a = await reg.acquire("v", "a.md", makeManual);
    await a.session.load();
    const evict = reg.retainForPark(a.session);
    a.session.setText("移除前的脏稿");
    eng.files.delete("a.md");
    const held = Promise.withResolvers<void>();
    eng.readGate = held.promise;
    const finishing = expect(a.release()).rejects.toThrow();
    await vi.waitFor(() => expect(eng.calls.filter((call) => call === "notes.read")).toHaveLength(2));
    const removing = evict();
    held.resolve();
    await finishing;
    await expect(removing).resolves.toBeUndefined();
    expect(reg.size).toBe(0);
    expect(eng.drafts.get("a.md")?.text).toBe("移除前的脏稿");

    eng.files.set("a.md", { text: "原稿", version: 1 });
    const reopened = await reg.acquire("v", "a.md", makeManual);
    await reopened.session.load();
    expect(reopened.session.getSnapshot().draft?.text).toBe("移除前的脏稿");
    await reopened.release();
  });

  test("A08：父目录结算同 Vault 全部相关会话，失败保留文本与操作重试条件", async () => {
    const paths = ["docs/active.json", "docs/nested/parked.md", "docs-extra/other.txt"];
    const makeEngine = () => new FakeEngine(Object.fromEntries(paths.map((path) => [path, "旧"])));
    const eng = makeEngine();
    const otherVault = makeEngine();
    const reg = new DocumentSessionRegistry();
    const [active, parked, sibling, foreign] = await Promise.all([reg.acquire("v", paths[0]!, make(eng)), reg.acquire("v", paths[1]!, make(eng)), reg.acquire("v", paths[2]!, make(eng)), reg.acquire("other", paths[0]!, make(otherVault))]);
    const releasePark = reg.retainForPark(parked.session);
    for (const lease of [active, parked, sibling, foreign]) await lease.session.load();
    eng.failSave = new Error("失败");
    eng.failDraft = new Error("草稿也失败");
    parked.session.setText("停放末字");
    await expect(parked.release()).rejects.toThrow();
    for (const lease of [active, sibling, foreign]) lease.session.setText("新");
    expect(await reg.flushPaths("v", ["docs"])).toBe(false);
    expect(parked.session.currentText()).toBe("停放末字");
    eng.failSave = null;
    eng.failDraft = null;
    expect(await reg.flushPaths("v", ["docs"])).toBe(true);
    expect(paths.map((path) => eng.disk(path))).toEqual(["新", "停放末字", "旧"]);
    expect(otherVault.disk(paths[0]!)).toBe("旧");
    await releasePark();
    await Promise.all([active.release(), sibling.release(), foreign.release()]);
  });

  test("bind 的清理函数在销毁时调用一次", async () => {
    const eng = new FakeEngine({ "a.md": "1" });
    const reg = new DocumentSessionRegistry();
    const off = vi.fn();
    const bind = vi.fn(() => off);
    const a = await reg.acquire("v", "a.md", make(eng), bind);
    const b = await reg.acquire("v", "a.md", make(eng), bind);
    expect(bind).toHaveBeenCalledTimes(1);
    await a.release();
    expect(off).not.toHaveBeenCalled();
    await b.release();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
