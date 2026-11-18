import { describe, expect, test } from "vitest";
import { HTML_LIMIT, IMAGE_LIMIT, NO_EXT_TEXT_PROBE_LIMIT, NOTE_LIMIT, TEXT_LIMIT, chooseViewer, humanSize, limitLabel } from "../src/ui/viewers/dispatch";

describe("chooseViewer（design §11.1）", () => {
  test("文本 / JSON / HTML / PDF / 图片按扩展名分派，大小写不敏感", () => {
    expect(chooseViewer("a/说明.txt", 10).kind).toBe("text");
    expect(chooseViewer("a/说明.TXT", 10).kind).toBe("text");
    expect(chooseViewer("数据.json", 10).kind).toBe("json");
    expect(chooseViewer("数据.JSON", 10).kind).toBe("json");
    expect(chooseViewer("x/页面.html", 10).kind).toBe("html");
    expect(chooseViewer("页面.HTM", 10).kind).toBe("html");
    expect(chooseViewer("手册.PDF", 10).kind).toBe("pdf");
    for (const n of ["a.png", "a.JPG", "a.jpeg", "a.gif", "a.webp", "a.svg", "a.bmp"]) expect(chooseViewer(n, 10).kind, n).toBe("image");
  });
  test("代码 / 配置类文件可作为文本编辑；点开头的隐藏文件按文件名判断", () => {
    for (const n of ["a.yaml", "b.ts", "c.py", "d.sh", "e.csv", ".gitignore", ".env", "f.mmd"]) expect(chooseViewer(n, 10).kind, n).toBe("text");
  });
  test("PDF 不受文本上限约束（按范围读取）；其它超限落到 unknown 并带 too-large", () => {
    expect(chooseViewer("big.pdf", 900 * 1024 * 1024).kind).toBe("pdf");
    expect(chooseViewer("big.txt", TEXT_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "too-large" });
    expect(chooseViewer("big.json", TEXT_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "too-large" });
    expect(chooseViewer("big.png", IMAGE_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "too-large" });
    expect(chooseViewer("big.html", HTML_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "too-large" });
    expect(chooseViewer("ok.txt", TEXT_LIMIT).kind).toBe("text");
    // Markdown 笔记不受 1 MiB 约束（S3：源码优先打开大文档），但有自己的上限
    expect(chooseViewer("big.md", TEXT_LIMIT + 1).kind).toBe("text");
    expect(chooseViewer("big.md", NOTE_LIMIT).kind).toBe("text");
    expect(chooseViewer("big.md", NOTE_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "too-large" });
    expect(limitLabel("md")).toBe("16 MiB");
  });
  test("无扩展名：小文件探测内容，大文件与未知扩展名是 unknown", () => {
    expect(chooseViewer("LICENSE", 100)).toMatchObject({ kind: "text", probe: true });
    expect(chooseViewer("LICENSE", NO_EXT_TEXT_PROBE_LIMIT + 1)).toMatchObject({ kind: "unknown", reason: "unsupported" });
    expect(chooseViewer("二进制.bin", 6)).toMatchObject({ kind: "unknown", reason: "unsupported" });
    expect(chooseViewer("a.docx", 6).kind).toBe("unknown");
  });
  test("提示文字与上限一一对应；体积格式化", () => {
    expect(limitLabel("html")).toBe("8 MiB");
    expect(limitLabel("png")).toBe("10 MiB");
    expect(limitLabel("txt")).toBe("1 MiB");
    expect(humanSize(6)).toBe("6 B");
    expect(humanSize(2048)).toBe("2.0 KiB");
  });
});
