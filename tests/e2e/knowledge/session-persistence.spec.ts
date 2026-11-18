import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

async function openNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
}

test("H01 关闭无编辑笔记零次保存，单次输入只保存一次，重开读取同一内容", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "保真.md");
    const original = "---\ntitle: '007'\n---\n\n原始正文\n";
    writeFileSync(file, original);
    const writes: string[] = [];
    page.on("request", (req) => {
      if (!req.url().endsWith("/api/v1/call") || req.method() !== "POST") return;
      const call = req.postDataJSON() as { capability?: string; input?: { path?: string; text?: string } };
      if (call.capability === "notes.save" && call.input?.path === "保真.md") writes.push(call.input.text ?? "");
    });
    await openNotes(page);
    const doc = treeItem(page, "保真.md");
    const closeTab = page.getByRole("button", { name: "关闭 保真", exact: true });
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await doc.click();
    await expect(prose).toContainText("原始正文");
    await closeTab.click();
    await expect(prose).toHaveCount(0);
    await doc.click();
    await expect(prose).toContainText("原始正文");
    expect(writes).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(original);

    await prose.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("单次输入");
    await expect.poll(() => readFileSync(file, "utf8")).toContain("单次输入");
    const saved = readFileSync(file, "utf8");
    await closeTab.click();
    await expect(prose).toHaveCount(0);
    await doc.click();
    await expect(prose).toContainText("原始正文单次输入");
    expect(writes).toEqual([saved]);
    expect(saved).toContain("title: '007'");
    expect(readFileSync(file, "utf8")).toBe(saved);
  } finally {
    await close();
  }
});

test("C05 坏 YAML 保留原文，使用源码入口修好并关闭重开后属性恢复", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "坏属性.md");
    const original = "---\ntitle: [未闭合\ncode: '007'\n---\n\n正文保留\n";
    const repaired = original.replace("[未闭合", "已修复");
    writeFileSync(file, original);
    await openNotes(page);
    const doc = treeItem(page, "坏属性.md");
    await doc.click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(prose).toContainText("正文保留");
    await expect(page.getByTestId("property-panel-yaml-error")).toBeVisible();
    await expect(doc).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    const source = page.getByTestId("markdown-editor").locator(".cm-content").first();
    await expect(source).toContainText("未闭合");
    await expect(source).toContainText("007");
    expect(readFileSync(file, "utf8")).toBe(original);
    await source.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(repaired);
    await expect.poll(() => readFileSync(file, "utf8")).toBe(repaired);
    await page.getByRole("button", { name: "关闭 坏属性", exact: true }).click();
    await doc.click();
    await page.getByRole("tab", { name: "实时预览", exact: true }).click();
    await expect(page.getByTestId("property-panel-yaml-error")).toHaveCount(0);
    await expect(page.getByTestId("editor-properties")).toContainText("title");
    await expect(page.getByTestId("editor-properties")).toContainText("code");
    await expect(prose).toContainText("正文保留");
    expect(readFileSync(file, "utf8")).toBe(repaired);
  } finally {
    await close();
  }
});
