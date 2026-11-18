import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DocumentSession, detectTextFormat, documentKindOf, type SessionEngine } from "../src/ui/documents/DocumentSession.js";
import { DocumentSessionRegistry } from "../src/ui/documents/DocumentSessionRegistry.js";

/** 内存里的“磁盘 + 引擎”：notes.read / save / draft.*，版本冲突与失败可注入。 */
class FakeEngine implements SessionEngine {
  files = new Map<string, { text: string; version: number }>();
  drafts = new Map<string, { text: string; baseVersion: string; savedAt: string }>();
  calls: string[] = [];
  failSave: Error | null = null;
  saveGate: Promise<void> | null = null;
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
    const i = input as { path: string; text?: string; expectedVersion?: string; baseVersion?: string };
    if (cap === "notes.read") {
      const f = this.files.get(i.path)!;
      return { path: i.path, text: f.text, version: String(f.version) } as T;
    }
    if (cap === "notes.save") {
      if (this.saveGate) await this.saveGate;
      if (this.failSave) throw this.failSave;
      const f = this.files.get(i.path)!;
      if (String(f.version) !== i.expectedVersion) throw Object.assign(new Error("版本冲突"), { code: "VERSION_CONFLICT" });
      this.files.set(i.path, { text: i.text!, version: f.version + 1 });
      return { version: String(f.version + 1) } as T;
    }
    if (cap === "notes.draft.get") return (this.drafts.get(i.path) ?? null) as T;
    if (cap === "notes.draft.save") {
      this.drafts.set(i.path, { text: i.text!, baseVersion: i.baseVersion!, savedAt: "2026-11-15T08:00:00" });
      return undefined as T;
    }
    if (cap === "notes.draft.discard") {
      this.drafts.delete(i.path);
      return undefined as T;
    }
    throw new Error(`未模拟：${cap}`);
  }
}

const mk = (eng: FakeEngine, path = "a.md", extra: Partial<ConstructorParameters<typeof DocumentSession>[0]> = {}) => new DocumentSession({ id: { vaultId: "v", path, epoch: 1 }, engine: eng, pollMs: 0, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DocumentSession：保存 / 冲突 / 草稿 / flush", () => {
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
    expect(s.getSnapshot().state).toBe("conflict");
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
    s.setText("2");
    await s.flushForExit();
    expect(eng.disk("a.md")).toBe("2");
    s.setText("3");
    await s.keepDraft();
    expect(eng.drafts.get("a.md")?.text).toBe("3");
    expect(eng.disk("a.md")).toBe("2");
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
