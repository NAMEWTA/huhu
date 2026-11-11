import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, VaultFiles, VaultIndex } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { createAnchor, refind } from "../src/engine/comments/anchor.js";
import { CommentsService, parseMessages } from "../src/engine/comments/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup(doc: string) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-cm-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  writeFileSync(path.join(root, "笔记.md"), doc);
  const files = new VaultFiles(root);
  const index = new VaultIndex(root);
  await index.build();
  const ids: Record<string, string> = { "笔记.md": "note-1" };
  const events: string[] = [];
  const svc = new CommentsService({
    repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))),
    files,
    ensureId: async (rel) => ids[rel] ?? (ids[rel] = `note-${Object.keys(ids).length + 1}`),
    noteId: (rel) => ids[rel] ?? null,
    publish: (t, p) => events.push(`${t}:${JSON.stringify(p)}`),
    now: () => new Date("2026-11-11T08:00:00Z"),
  });
  const write = (text: string) => writeFileSync(path.join(root, "笔记.md"), text);
  return { svc, root, write, events, version: () => files.currentVersion("笔记.md") ?? "" };
}
const at = (body: string, needle: string, nth = 0) => {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = body.indexOf(needle, i + 1);
  return { start: i, end: i + needle.length };
};

describe("锚点（R-24）", () => {
  const body = "第一句：一套能力。\n\n第二句：一套能力。\n\n含 emoji 🎉 的一句。";
  test("重复句子：上下文让锚点唯一", () => {
    const { start, end } = at(body, "一套能力", 1);
    const a = createAnchor(body, start, end);
    expect(body.slice(a.start, a.end)).toBe("一套能力");
    expect(refind(body, a)).toMatchObject({ status: "anchored", start, end });
  });
  test("前面插入内容：锚点跟着位移", () => {
    const { start, end } = at(body, "一套能力", 1);
    const a = createAnchor(body, start, end);
    const moved = `新增一段。\n\n${body}`;
    const r = refind(moved, a);
    expect(r).toMatchObject({ status: "anchored", start: start + 7, end: end + 7 });
  });
  test("删除锚定处的那一句：orphaned，不贴到另一句（ACC-KN-08）", () => {
    const { start, end } = at(body, "第二句：一套能力。");
    const a = createAnchor(body, start, end);
    const next = body.replace("第二句：一套能力。", "");
    expect(refind(next, a)).toEqual({ status: "orphaned" });
  });
  test("emoji 与跨行选区", () => {
    const sel = at(body, "🎉 的一句");
    const a = createAnchor(body, sel.start, sel.end);
    expect(refind(body, a).status).toBe("anchored");
    const cross = { start: body.indexOf("第一句"), end: body.indexOf("第二句") + 3 };
    const b = createAnchor(body, cross.start, cross.end);
    expect(refind(body, b)).toMatchObject({ status: "anchored", start: cross.start, end: cross.end });
  });
  test("无效选区抛错", () => {
    expect(() => createAnchor("abc", 2, 2)).toThrow();
    expect(() => createAnchor("abc", 0, 10)).toThrow();
  });
});

describe("CommentsService", () => {
  const DOC = "# 标题\n\n这里有一套能力，值得批注。\n\n另一段：一套能力。\n";
  test("创建正文批注：写入 Comments/ 文件，消息格式，空内容拒绝", async () => {
    const { svc, root } = await setup(DOC);
    await expect(svc.create({ path: "笔记.md", target: "body", ...at(DOC, "一套能力"), text: "   ", author: "我" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const c = await svc.create({ path: "笔记.md", target: "body", ...at(DOC, "一套能力"), text: "这里要展开", author: "我" });
    expect(c.anchor?.exact).toBe("一套能力");
    expect(c.messages).toEqual([{ at: "2026-11-11T08:00:00Z", author: "我", text: "这里要展开" }]);
    expect(c.path.startsWith("Comments/note-1--")).toBe(true);
    expect(readFileSync(path.join(root, c.path), "utf8")).toContain("### 2026-11-11T08:00:00Z · 我");
    expect(svc.list("笔记.md")).toHaveLength(1);
  });
  test("文件级与属性批注没有锚点；属性批注必须有属性名", async () => {
    const { svc } = await setup(DOC);
    const f = await svc.create({ path: "笔记.md", target: "file", text: "整体意见", author: "我" });
    expect(f.anchor).toBeNull();
    await expect(svc.create({ path: "笔记.md", target: "property", text: "x", author: "我" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const p = await svc.create({ path: "笔记.md", target: "property", property: "tags", text: "标签不对", author: "我" });
    expect(p.property).toBe("tags");
  });
  test("回复、解决、重新打开、删除", async () => {
    const { svc } = await setup(DOC);
    const c = await svc.create({ path: "笔记.md", target: "file", text: "问题", author: "我" });
    const r = await svc.reply(c.id, "回复内容", "cli");
    expect(r.messages.map((m) => m.author)).toEqual(["我", "cli"]);
    expect((await svc.setResolved(c.id, true)).resolved).toBe(true);
    expect((await svc.setResolved(c.id, false)).resolved).toBe(false);
    await svc.delete(c.id);
    expect(svc.list("笔记.md")).toEqual([]);
  });
  test("保存后 refind：位移跟随；删除锚定句 → orphaned；已解决的不再重定位；重新选择位置恢复", async () => {
    const { svc, write, version } = await setup(DOC);
    const c = await svc.create({ path: "笔记.md", target: "body", ...at(DOC, "另一段：一套能力。"), text: "看这句", author: "我" });
    const resolved = await svc.create({ path: "笔记.md", target: "body", ...at(DOC, "# 标题"), text: "已处理", author: "我" });
    await svc.setResolved(resolved.id, true);

    const shifted = `前言一行\n\n${DOC}`;
    write(shifted);
    await svc.refind("笔记.md", shifted, version());
    const moved = svc.list("笔记.md").find((x) => x.id === c.id)!;
    expect(moved.state).toBe("anchored");
    expect(moved.anchor?.start).toBe(at(shifted, "另一段：一套能力。").start);

    const removed = shifted.replace("另一段：一套能力。", "");
    write(removed);
    await svc.refind("笔记.md", removed, version());
    const orphan = svc.list("笔记.md").find((x) => x.id === c.id)!;
    expect(orphan.state).toBe("orphaned");
    expect(svc.list("笔记.md").find((x) => x.id === resolved.id)?.anchor?.start).toBe(0); // 已解决的不动

    const re = await svc.relocate(c.id, ...(Object.values(at(removed, "前言一行")) as [number, number]));
    expect(re.state).toBe("anchored");
    expect(re.anchor?.exact).toBe("前言一行");
  });
  test("文档改名：批注的 documentPath 同步；永久删除：批注一起删除", async () => {
    const { svc } = await setup(DOC);
    const c = await svc.create({ path: "笔记.md", target: "file", text: "x", author: "我" });
    await svc.moveDocuments({ "笔记.md": "新/笔记.md" });
    expect(svc.list().find((x) => x.id === c.id)?.documentPath).toBe("新/笔记.md");
    await svc.deleteForDocument("note-1", "新/笔记.md");
    expect(svc.list()).toEqual([]);
  });
  test("消息解析容忍多行与空行", () => {
    const msgs = parseMessages("### 2026-11-11T08:00:00Z · 我\n\n第一行\n第二行\n\n### 2026-11-11T09:00:00Z · cli\n\n回复\n");
    expect(msgs).toEqual([
      { at: "2026-11-11T08:00:00Z", author: "我", text: "第一行\n第二行" },
      { at: "2026-11-11T09:00:00Z", author: "cli", text: "回复" },
    ]);
  });
});
