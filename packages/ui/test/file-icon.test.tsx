import type { ReactElement } from "react";
import { describe, expect, test } from "vitest";
import { FileIcon, extensionOf, fileIconKind, fileIconSprite } from "../src/index.js";

describe("FileIcon 静态扩展名表（OP-D13 / F06）", () => {
  test("扩展名大小写不敏感；点开头的隐藏文件无扩展名；未知 → file", () => {
    expect(extensionOf("a/B.MD")).toBe("md");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("a.tar.gz")).toBe("gz");
    expect(fileIconKind("README.MD")).toBe("markdown");
    expect(fileIconKind("x.JSON")).toBe("json");
    expect(fileIconKind("x.txt")).toBe("text");
    expect(fileIconKind("x.pdf")).toBe("pdf");
    expect(fileIconKind("x.HTM")).toBe("html");
    expect(fileIconKind("x.png")).toBe("image");
    expect(fileIconKind("x.weird")).toBe("file");
    expect(fileIconKind("Makefile")).toBe("file");
  });
  test("渲染：目录 / Markdown 自绘字形 / lucide 类别，暴露 data-file-icon（直接调用组件函数检查元素树，不依赖 DOM）", () => {
    const el = (props: Parameters<typeof FileIcon>[0]) => FileIcon(props) as ReactElement<Record<string, unknown>>;
    expect(el({ name: "d", dir: true }).props["data-file-icon"]).toBe("folder");
    expect(el({ name: "d", dir: true, open: true }).props["data-file-icon"]).toBe("folder");
    const md = el({ name: "a.md" });
    expect(md.type).toBe("svg");
    expect(md.props["data-file-icon"]).toBe("markdown");
    expect(md.props["viewBox"]).toBe("0 0 32 32");
    expect(md.props["aria-hidden"]).toBe(true);
    for (const [n, k] of [
      ["a.json", "json"],
      ["a.pdf", "pdf"],
      ["a.html", "html"],
      ["a.png", "image"],
      ["a.xyz", "file"],
    ] as const)
      expect(el({ name: n }).props["data-file-icon"]).toBe(k);
  });
});

test("F06：压缩包扩展名使用独立类别", () => {
  for (const name of ["归档.ZIP", "backup.tar.gz", "sample.7z"]) expect(fileIconKind(name)).toBe("archive");
});

test("OP-D13：共享 sprite 的每个类别都有本地 SVG 字形", () => {
  const { icon, symbols } = fileIconSprite();
  for (const kind of ["markdown", "pdf", "json", "archive", "file", "folder", "folder-open"] as const) {
    expect(symbols).toContain(`id="${icon(kind).name}"`);
  }
  expect(symbols).not.toContain("undefined");
});
