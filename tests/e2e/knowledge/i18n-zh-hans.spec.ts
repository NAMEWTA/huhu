import { expect, test, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

/** 正文和文件名全部使用中文样本。扫描实际文案、提示和读屏名称，覆盖非 Lingui 的宿主字符串。 */
async function latinLabels(surface: Locator): Promise<string[]> {
  await expect(surface).toBeVisible();
  return surface.evaluate((root) => {
    const labels = new Set<string>();
    const add = (value: string | null) => {
      const label = value?.trim().replace(/\s+/g, " ") ?? "";
      if (/[a-z]{2}/i.test(label) && !/\p{Script=Han}/u.test(label)) labels.add(label);
    };
    function scan(element: Element): void {
      if (!element.getClientRects().length || getComputedStyle(element).visibility !== "visible") return;
      for (const key of ["aria-label", "placeholder", "title", "alt", "data-placeholder"]) add(element.getAttribute(key));
      if (element.matches("svg, svg *, script, style")) return;
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) add(node.textContent);
      }
      for (const child of element.children) scan(child);
      for (const child of element.shadowRoot?.children ?? []) scan(child);
    }
    scan(root);
    return [...labels].sort();
  });
}

const allowed = new Set([
  // 文件扩展名、编码和格式名。
  ".md",
  ".agents",
  ".huhu",
  "UTF-8",
  "Markdown",
  "HTML",
  "PDF",
  "CSV",
  "JSON",
  "YAML",
  // 编辑器提供的快捷键与命令缩写。
  "Esc",
  "Enter",
  "Tab",
  // 专有名词。
  "Excalidraw",
  "Mermaid",
]);

test("H03：简体中文知识库扫描编辑器、命令菜单、文件树和详情", async () => {
  const testInfo = test.info();
  const { app, page, vault, close } = await openApp();
  const result: Record<string, string[]> = {};
  try {
    writeFileSync(path.join(vault, "本地化样本.md"), "# 样本标题\n\n需要选中的正文。\n");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);
    const file = treeItem(page, "本地化样本");
    await file.click();
    const bar = page.getByTestId("note-toolbar");
    const editor = page.getByTestId("markdown-editor");
    const prose = editor.locator(".ProseMirror");
    await expect(prose).toContainText("需要选中的正文");
    result.toolbar = await latinLabels(bar);
    result.editor = await latinLabels(editor);
    result.tree = await latinLabels(page.locator(".notes-resource-tree"));

    const details = page.getByTestId("note-inspector");
    await bar.getByRole("button", { name: "文档详情" }).click();
    result.properties = await latinLabels(details);
    await details.getByRole("tab", { name: "批注" }).click();
    result.comments = await latinLabels(page.getByTestId("comments-panel"));
    await bar.getByRole("button", { name: "文档详情" }).click();

    await file.click({ button: "right" });
    result.treeMenu = await latinLabels(page.getByRole("menu").last());
    await page.keyboard.press("Escape");

    await prose.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Shift+Home");
    result.bubbleMenu = await latinLabels(page.getByTestId("bubble-menu-bar"));
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    result.slashMenu = await latinLabels(page.getByRole("listbox").last());
    await page.keyboard.press("Escape");
  } finally {
    await testInfo.attach("zh-Hans", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    console.log(JSON.stringify(result));
    await close();
  }
  const untranslated = Object.entries(result).flatMap(([surface, labels]) => labels.filter((label) => !allowed.has(label)).map((label) => `${surface}: ${label}`));
  expect(untranslated).toEqual([]);
});
