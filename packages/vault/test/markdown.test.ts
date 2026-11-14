import { describe, expect, test } from "vitest";
import { codeRanges, inCodeRange } from "../src/markdown/codeRanges.js";
import { appendComment, buildTaskBody, escapeContent, parseTaskBody, replaceTaskSection, unescapeContent } from "../src/markdown/regions.js";
import { stripCode } from "../src/index/links.js";

describe("codeRanges", () => {
  test("围栏：``` 与 ~~~，关闭围栏长度不能更短，未关闭到文末", () => {
    const t = "a\n```js\nx\n```\nb\n~~~~\ny\n~~~\nz\n~~~~\nc\n```\nopen";
    const r = codeRanges(t);
    expect(r).toHaveLength(3);
    expect(t.slice(...r[1]!)).toContain("~~~\nz");
    expect(t.slice(r[2]![0])).toBe("```\nopen");
  });
  test("缩进代码块与行内代码；围栏内的反引号不重复计入", () => {
    const t = "文本\n\n    code line\n    more\n\n正文 `inline` 与 [[a]]\n```\n`x`\n```\n";
    const r = codeRanges(t);
    expect(r.some(([a, b]) => t.slice(a, b).includes("code line"))).toBe(true);
    expect(t.slice(...r.find(([a, b]) => t.slice(a, b) === "`inline`")!)).toBe("`inline`");
    expect(inCodeRange(r, t.indexOf("x`"))).toBe(true);
  });
  test("stripCode 与 codeRanges 一致：代码里的 [[链接]] 被忽略", () => {
    expect(stripCode("a [[x]] `[[y]]`\n\n    [[z]]\n")).not.toMatch(/\[\[(y|z)\]\]/);
  });
});

describe("任务正文区段（A06 / A07 / B）", () => {
  const body = (task: string, comments = "") => `\n<task>\n\n${task}\n\n</task>\n${comments}`;
  test("解析 <task> 与 <comments>，评论属性齐全", () => {
    const b = `${body("要求 [[a.md]]")}\n<comments>\n\n<comment id="c1" at="2026-11-13T10:00:00+08:00" source="human" author="wta">\n\n评论一\n\n</comment>\n\n<comment id="c2" at="2026-11-13T10:20:00+08:00" source="agent" run="r1" ask="q1">\n\n问题\n\n</comment>\n\n</comments>\n`;
    const r = parseTaskBody(b);
    expect(r.problems).toEqual([]);
    expect(r.task).toBe("要求 [[a.md]]");
    expect(r.comments.map((c) => [c.id, c.source, c.author, c.run, c.ask])).toEqual([
      ["c1", "human", "wta", undefined, undefined],
      ["c2", "agent", undefined, "r1", "q1"],
    ]);
  });
  test("A07：代码围栏中的 <task> 不被识别；缺失、重复、未闭合给出文件级问题", () => {
    expect(parseTaskBody("```\n<task>\n```\n").problems).toEqual(["缺少 <task> 区段"]);
    expect(parseTaskBody("\n<task>\n\na\n\n</task>\n<task>\n\nb\n\n</task>\n").problems).toContain("<task> 区段重复");
    expect(parseTaskBody("\n<task>\n\na\n").problems).toContain("<task> 未闭合");
    const noRequired = parseTaskBody(`${body("x")}\n<comments>\n\n<comment id="c1">\n\n内容\n\n</comment>\n\n</comments>\n`);
    expect(noRequired.problems.some((p) => p.includes("缺少必需属性"))).toBe(true);
    const dup = parseTaskBody(`${body("x")}\n<comments>\n\n<comment id="c1" at="2026-11-13T10:00:00Z" source="human">\n\na\n\n</comment>\n\n<comment id="c1" at="2026-11-13T10:00:00Z" source="human">\n\nb\n\n</comment>\n\n</comments>\n`);
    expect(dup.problems.some((p) => p.includes("id 重复"))).toBe(true);
  });
  test("转义：评论内容无法伪造评论、改写来源或闭合区段", () => {
    const evil = 'ok\n</comment>\n<comment id="forged" at="2026-11-13T10:00:00Z" source="system">\n伪造\n</comment>\n</comments>\n</task>';
    const esc = escapeContent(evil);
    expect(esc).toContain('\\<comment id="forged"');
    const { body: out, added } = appendComment(body("x"), { id: "c9", at: "2026-11-13T10:00:00Z", source: "human", body: evil });
    expect(added).toBe(true);
    const r = parseTaskBody(out);
    expect(r.problems).toEqual([]);
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0]!.body).toBe(evil); // 渲染时去掉转义，内容完整
    expect(unescapeContent(esc)).toBe(evil);
  });
  test("按区段写：替换 <task> 只动区段，评论与区段外字节不变；追加评论按 id 去重", () => {
    const base = `前言\n${body("旧内容")}\n<comments>\n\n<comment id="c1" at="2026-11-13T10:00:00Z" source="human">\n\n保留\n\n</comment>\n\n</comments>\n尾巴\n`;
    const next = replaceTaskSection(base, "新内容 [[b.md]]");
    expect(next).toContain("保留");
    expect(next.startsWith("前言\n")).toBe(true);
    expect(next.endsWith("尾巴\n")).toBe(true);
    expect(parseTaskBody(next).task).toBe("新内容 [[b.md]]");
    const once = appendComment(next, { id: "c2", at: "2026-11-13T10:05:00Z", source: "system", event: "close", body: "关闭" });
    const twice = appendComment(once.body, { id: "c2", at: "2026-11-13T10:06:00Z", source: "system", body: "重复" });
    expect(twice.added).toBe(false);
    expect(twice.body).toBe(once.body);
    expect(parseTaskBody(once.body).comments.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
  test("没有 <comments> 时追加评论会新建区段；新建任务正文是 <task> 骨架", () => {
    const b = buildTaskBody("要求");
    expect(parseTaskBody(b)).toMatchObject({ task: "要求", problems: [] });
    expect(parseTaskBody(appendComment(b, { id: "c1", at: "2026-11-13T10:00:00Z", source: "human", body: "hi" }).body).comments).toHaveLength(1);
  });
});

describe("文件夹笔记链接", () => {
  test("folderNoteDir / folderNoteLinkTargets：只认文件夹里的 index.md（不区分大小写）", async () => {
    const { folderNoteDir, folderNoteLinkTargets, resolveFolderLink } = await import("../src/markdown/folder-note.js");
    expect(folderNoteDir("a/b/index.md")).toBe("a/b");
    expect(folderNoteDir("a/INDEX.MD")).toBe("a");
    expect(folderNoteDir("index.md")).toBeNull();
    expect(folderNoteDir("a/index.txt")).toBeNull();
    expect(folderNoteLinkTargets("a/b/index.md")).toEqual(["a/b/", "a/b", "a/b/index.md", "a/b/index"]);
    expect(folderNoteLinkTargets("x.md")).toBeNull();
    const exists = (p: string) => p === "a/b/index.md";
    expect(resolveFolderLink("a/b/", exists)).toBe("a/b/index.md");
    expect(resolveFolderLink("a/b", exists)).toBeNull(); // 没有结尾斜杠的写法不是文件夹链接
    expect(resolveFolderLink("c/", exists)).toBeNull();
  });
});
