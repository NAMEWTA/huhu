import { describe, expect, test } from "vitest";
import { createCommentsPort, docNameOf, pathOfDocName } from "../src/ui/comments/commentAdapter.js";

describe("commentAdapter（S4）", () => {
  test("docName ↔ 路径：去扩展名；回查已知笔记（.md / .mdx / 文件夹笔记），找不到按 .md", () => {
    expect(docNameOf("笔记/一.md")).toBe("笔记/一");
    expect(docNameOf("a.mdx")).toBe("a");
    expect(pathOfDocName("笔记/一", ["笔记/一.md"])).toBe("笔记/一.md");
    expect(pathOfDocName("页", ["页.mdx"])).toBe("页.mdx");
    expect(pathOfDocName("Archives/人/甲", ["Archives/人/甲/index.md"])).toBe("Archives/人/甲/index.md");
    expect(pathOfDocName("不存在", [])).toBe("不存在.md");
    expect(pathOfDocName("已带后缀.md", [])).toBe("已带后缀.md");
  });

  test("port → comments.* 能力：写操作带 write；引用文字只传有值的字段，不夹带 PM 坐标", async () => {
    const calls: { cap: string; input: unknown; write: boolean }[] = [];
    const port = createCommentsPort(async (cap, input, o) => (calls.push({ cap, input, write: o?.write === true }), (cap === "comments.delete" ? { ok: true } : []) as never));
    await port.list();
    await port.list("a.md");
    await port.create({ path: "a.md", target: "body", quote: "q", prefix: "p", text: "t" });
    await port.create({ path: "a.md", target: "property", property: "status", text: "t" });
    await port.reply("c1", "r");
    await port.resolve("c1");
    await port.reopen("c1");
    await port.relocate("c1", { quote: "n", suffix: "s" });
    await port.delete("c1");
    expect(calls.map((c) => [c.cap, c.write])).toEqual([
      ["comments.list", false],
      ["comments.list", false],
      ["comments.create", true],
      ["comments.create", true],
      ["comments.reply", true],
      ["comments.resolve", true],
      ["comments.reopen", true],
      ["comments.relocate", true],
      ["comments.delete", true],
    ]);
    expect(calls[1]?.input).toEqual({ path: "a.md" });
    expect(calls[2]?.input).toEqual({ path: "a.md", target: "body", quote: "q", prefix: "p", text: "t" });
    expect(calls[3]?.input).toEqual({ path: "a.md", target: "property", property: "status", text: "t" });
    expect(calls[7]?.input).toEqual({ id: "c1", quote: "n", suffix: "s" });
    expect(JSON.stringify(calls[2]?.input)).not.toMatch(/"(start|end)"/);
  });
});
