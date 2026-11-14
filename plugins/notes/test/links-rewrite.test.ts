import { describe, expect, test } from "vitest";
import { rewriteLinks } from "../src/shared/links-rewrite.js";

const all = ["X.md", "A.md", "B.md", "dir/C.md", "dir/D.md", "img.png"];
const ctx = (over: Partial<Parameters<typeof rewriteLinks>[1]> = {}, moves: [string, string][] = [["X.md", "Y.md"]]) => ({ filePath: "A.md", newFilePath: "A.md", moves: new Map(moves), allPaths: all, ...over });

describe("rewriteLinks", () => {
  test("ACC-KN-06：正文链接改写，代码块/行内代码不变", () => {
    const src = "见 [[X]] 与 [[X|别名]] 和 [[X#小节]]\n`[[X]]`\n```\n[[X]]\n```\n";
    const r = rewriteLinks(src, ctx());
    expect(r.text).toBe("见 [[Y]] 与 [[Y|别名]] 和 [[Y#小节]]\n`[[X]]`\n```\n[[X]]\n```\n");
    expect(r.changes).toBe(3);
  });
  test("路径形式保持是否带扩展名", () => {
    const r = rewriteLinks("[[dir/C]] [[dir/C.md]]", ctx({}, [["dir/C.md", "other/C2.md"]]));
    expect(r.text).toBe("[[other/C2]] [[other/C2.md]]");
  });
  test("无关链接与未解析链接保持不变", () => {
    const src = "[[B]] [[不存在]] [[dir/D]]";
    expect(rewriteLinks(src, ctx()).text).toBe(src);
    expect(rewriteLinks(src, ctx()).changes).toBe(0);
  });
  test("移动到别的目录：裸名称仍唯一则保持裸写法不变", () => {
    const r = rewriteLinks("[[C]]", ctx({}, [["dir/C.md", "new/C.md"]]));
    expect(r.text).toBe("[[C]]");
  });
  test("裸名称改名后变得不唯一 → 退回路径写法", () => {
    const paths = [...all, "z/Y.md"]; // 已有 z/Y.md；X 移动并改名为 sub/Y.md 后 Y 不再唯一
    expect(rewriteLinks("[[X]]", ctx({ allPaths: paths }, [["X.md", "sub/Y.md"]])).text).toBe("[[sub/Y]]");
    expect(rewriteLinks("[[X]]", ctx({}, [["X.md", "sub/Y.md"]])).text).toBe("[[Y]]"); // 仍唯一则保持裸写法
  });
  test("同名歧义：不改写并列出", () => {
    const paths = [...all, "other/X.md"];
    const r = rewriteLinks("[[X]]", ctx({ allPaths: paths }));
    expect(r.text).toBe("[[X]]");
    expect(r.ambiguous).toEqual(["X"]);
  });
  test("标准 Markdown 相对链接", () => {
    const r = rewriteLinks("[x](X.md#h) ![i](img.png) [web](https://e.com/X.md) [sec](#h)", ctx());
    expect(r.text).toBe("[x](Y.md#h) ![i](img.png) [web](https://e.com/X.md) [sec](#h)");
  });
  test("本文件被移动：指向其他文件的相对链接要重算", () => {
    const r = rewriteLinks("[b](B.md) [[B]]", ctx({ filePath: "A.md", newFilePath: "sub/A.md" }, [["A.md", "sub/A.md"]]));
    expect(r.text).toBe("[b](../B.md) [[B]]");
  });
  test("百分号编码风格保持", () => {
    const r = rewriteLinks("[n](%E7%AC%94%E8%AE%B0.md)", ctx({ allPaths: ["笔记.md", "A.md"] }, [["笔记.md", "归档/笔记.md"]]));
    expect(r.text).toBe(`[n](${encodeURI("归档/笔记.md")})`);
  });

  test("别名/标题里含多个分隔符时原样保留", () => {
    expect(rewriteLinks("[[X|a|b]] [[X#h#x]]", ctx()).text).toBe("[[Y|a|b]] [[Y#h#x]]");
  });
  test("括号出现在文件名里的标准链接", () => {
    const r = rewriteLinks("[p](X(1).md)", ctx({ allPaths: [...all, "X(1).md"] }, [["X(1).md", "Z(1).md"]]));
    expect(r.text).toBe("[p](Z(1).md)");
  });
});

describe("文件夹前缀改写（A10 / AR-S1）", () => {
  const paths = ["A.md", "设计/旧接口/index.md", "设计/旧接口/说明.md", "设计/旧接口/sub/x.md"];
  const fctx = {
    filePath: "A.md",
    newFilePath: "A.md",
    moves: new Map([
      ["设计/旧接口/index.md", "设计/新接口/index.md"],
      ["设计/旧接口/说明.md", "设计/新接口/说明.md"],
      ["设计/旧接口/sub/x.md", "设计/新接口/sub/x.md"],
    ]),
    allPaths: paths,
    folderMoves: new Map([["设计/旧接口", "设计/新接口"]]),
  };
  test("[[旧/]]、[[旧/子目录/]] 与其下文件的路径链接都跟着改；带标题与别名的写法保留", () => {
    const r = rewriteLinks("[[设计/旧接口/]] [[设计/旧接口/sub/|子]] [[设计/旧接口/说明]] [[设计/旧接口/说明.md#小节|别名]] [[设计/其他/]]", fctx);
    expect(r.text).toBe("[[设计/新接口/]] [[设计/新接口/sub/|子]] [[设计/新接口/说明]] [[设计/新接口/说明.md#小节|别名]] [[设计/其他/]]");
    expect(r.changes).toBe(4);
  });
  test("代码块内的文件夹链接不变；前缀相似但不是同一目录的不误改", () => {
    const r = rewriteLinks("`[[设计/旧接口/]]`\n```\n[[设计/旧接口/]]\n```\n[[设计/旧接口2/]]\n", fctx);
    expect(r.changes).toBe(0);
    expect(r.text).toContain("[[设计/旧接口2/]]");
  });
});
