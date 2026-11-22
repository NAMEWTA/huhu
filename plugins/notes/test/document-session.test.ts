import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DocumentSession, detectTextFormat, documentKindOf, type SessionEngine } from "../src/ui/documents/DocumentSession.js";
import { DocumentSessionRegistry } from "../src/ui/documents/DocumentSessionRegistry.js";

/** 内存里的“磁盘 + 引擎”：notes.read / save / draft.*，版本冲突与失败可注入。 */
class FakeEngine implements SessionEngine {
  files = new Map<string, { text: string; version: number }>();
  drafts = new Map<string, { text: string; baseVersion: string; savedAt: string }>();
  calls: string[] = [];
  failSave: Error | null = null;
  failDraft: Error | null = null;
  saveGate: Promise<void> | null = null;
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
    const i = input as { path: string; text?: string; expectedVersion?: string; baseVersion?: string };
    if (cap === "notes.read") {
      const f = this.files.get(i.path)!;
      if (this.readGate) await this.readGate;
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
      if (this.failDraft) throw this.failDraft;
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
    const fields = s.writeFields(async (version) => {
      started.resolve(version);
      await release.promise;
      eng.externalWrite(path, eng.disk(path).replace("编号: 旧", "编号: 新"));
    });
    expect(await started.promise).toBe("2");
    s.setText("---\n编号: 旧\n---\n\n正文首字末字\n");
    const exit = s.flush();
    release.resolve();
    expect(await fields).toBe(true);
    expect(await exit).toBe(true);
    expect(s.getSnapshot().baseVersion).toBe("4");
    expect(eng.disk(path)).toBe("---\n编号: 新\n---\n\n正文首字末字\n");
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
    await expect(s.flushForExit()).resolves.toBeUndefined();
    s.setText("2");
    await expect(s.flushForExit()).resolves.toBe("file");
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
