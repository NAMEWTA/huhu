import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
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
      if (/[a-z]{2}/i.test(label)) labels.add(label);
    };
    function scan(element: Element): void {
      if (!element.getClientRects().length || getComputedStyle(element).visibility !== "visible") return;
      for (const key of ["aria-label", "placeholder", "title", "alt", "data-placeholder"]) add(element.getAttribute(key));
      if (element.matches("svg, svg *, script, style, .cm-content, .ok-mirror-state code, .ok-mirror-source-badge code, .ok-mirror-badge code")) return;
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
  "Control",
  "Ctrl",
  "Shift",
  "Alt",
  // 专有名词。
  "Excalidraw",
  "Mermaid",
  "KaTeX",
  "LaTeX",
  "URL",
  "AI",
  "HTML5",
  "SVG",
  "GFM",
  "CommonMark",
  "HTTP",
  "HTTPS",
  "http",
  "https",
  "px",
  "rem",
  "MDX",
  "md",
  "txt",
  "JavaScript",
  "CSS",
  "Cmd",
  "rgb",
  "lucide",
  "Lightbulb",
  "excalidraw",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "mkv",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
  "aac",
  "opus",
  "auto",
  "inherit",
  "initial",
  "unset",
  "guides/install 或 https://example.com",
]);
const allowedWords = new Set([...allowed].map((label) => label.toLowerCase()));

function untranslatedLabels(result: Record<string, string[]>): string[] {
  return Object.entries(result).flatMap(([surface, labels]) =>
    labels.filter((label) => !allowed.has(label) && (label.replace(/#[a-f\d]{6}\b/gi, "").match(/[a-z][a-z0-9-]+/gi) ?? []).some((word) => !allowedWords.has(word.toLowerCase()))).map((label) => `${surface}: ${label}`),
  );
}

async function openSlash(page: Page, prose: Locator) {
  await prose.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("/");
  const slash = page.getByRole("listbox", { name: "斜杠命令" });
  await expect(slash).toBeVisible();
  return slash;
}

test("H03：简体中文知识库扫描编辑器、命令菜单、文件树和详情", async () => {
  const testInfo = test.info();
  const { app, page, vault, close } = await openApp();
  const result: Record<string, string[]> = {};
  try {
    writeFileSync(path.join(vault, "本地化样本.md"), "# 样本标题\n\n需要选中的正文。\n");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
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
    const resourceTree = page.locator(".notes-resource-tree");
    await expect(resourceTree.getByRole("button", { name: "文件操作选项", includeHidden: true })).toHaveAttribute("aria-label", "文件操作选项");
    result.tree = await latinLabels(resourceTree);

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
    const bubble = page.getByTestId("bubble-menu-bar");
    await expect(bubble.getByRole("button", { name: "粗体" })).toBeVisible();
    result.bubbleMenu = await latinLabels(bubble);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const slash = page.getByRole("listbox", { name: "斜杠命令" });
    result.slashMenu = await latinLabels(slash);
    await page.keyboard.type("accordion");
    await expect(slash.getByRole("option", { name: "折叠面板" })).toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    await testInfo.attach("zh-Hans", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    console.log(JSON.stringify(result));
    await close();
  }
  expect(untranslatedLabels(result)).toEqual([]);
});

test("H03：实际应用每个斜杠命令后扫描块、占位与属性", async () => {
  test.setTimeout(240_000);
  const { app, page, vault, close } = await openApp();
  const result: Record<string, string[]> = {};
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    const sample = path.join(vault, "块文案.md");
    writeFileSync(sample, "# 样本\n\n起始\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);
    await treeItem(page, "块文案.md").click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(prose).toContainText("起始");
    const menu = await openSlash(page, prose);
    const commands = await menu.getByRole("option").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-slash-command") ?? ""));
    expect(commands.length).toBeGreaterThan(20);
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands).not.toContain("");
    await page.keyboard.press("Escape");
    for (const command of commands) {
      // Source mode resets the fixture even when the previous block owns an embedded editor.
      await page.keyboard.press("Escape");
      await page.getByRole("tab", { name: "源码", exact: true }).click();
      const source = page.getByTestId("markdown-editor").locator(".cm-content");
      await source.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText("起始");
      await expect(source).toHaveText("起始");
      await page.getByRole("tab", { name: "实时预览", exact: true }).click();
      await expect(prose).toHaveText("起始");
      const slash = await openSlash(page, prose);
      const option = slash.locator(`[data-slash-command="${command}"]`);
      if (command === "component-File") {
        const chooser = page.waitForEvent("filechooser");
        await option.click();
        await (await chooser).setFiles({ name: "样本.txt", mimeType: "text/plain", buffer: Buffer.from("附件") });
        await expect(prose).toContainText("样本.txt");
      } else {
        await option.click();
      }
      await expect(slash).toBeHidden();
      // The current integration routes the emoji command to a separately supplied picker.
      if (command !== "emoji") {
        await expect.poll(() => prose.innerHTML(), { message: command }).not.toMatch(/^<p>起始<\/p>(?:<p><br[^>]*><\/p>)?$/);
      }
      const block = prose.locator("[data-jsx-gear]").first();
      const propPanel = page.locator("[data-prop-panel]:visible");
      if ((await block.count()) && !(await propPanel.count())) {
        const placeholder = prose.locator("[data-descriptor-placeholder]").first();
        if (await placeholder.isVisible()) await placeholder.click();
        else await block.click({ force: true });
      }
      if (await propPanel.count()) {
        const advanced = propPanel.locator("[data-prop-panel-advanced-trigger]");
        if ((await advanced.count()) && (await advanced.getAttribute("data-state")) === "closed") await advanced.click();
      }
      const popup = page.locator('[data-radix-popper-content-wrapper]:visible, [role="dialog"]:visible');
      const labels = await latinLabels(prose);
      for (const panel of await popup.all()) labels.push(...(await latinLabels(panel)));
      result[command] = [...new Set(labels)].sort();
      if (command === "component-Embed") {
        await expect(prose.getByText("嵌入 URL", { exact: true })).toBeVisible();
        await expect(block).toHaveAttribute("aria-label", "嵌入属性");
        const src = propPanel.locator("#prop-src");
        await src.fill("无效地址");
        await expect(prose.getByText("URL 必须以 http:// 或 https:// 开头", { exact: true })).toBeVisible();
        result[`${command}-invalid`] = await latinLabels(prose);
      }
      if (["component-img", "component-video", "component-audio"].includes(command)) {
        const input = propPanel.locator("#prop-src");
        await input.fill("无效地址");
        const alert = propPanel.locator("[data-prop-media-error]");
        await expect(alert).toContainText("缺少文件扩展名");
        result[`${command}-invalid`] = await latinLabels(alert);
      }
      if (command.startsWith("embed-starter-")) {
        const preview = prose.locator("iframe").first().contentFrame().locator("body");
        await expect(preview).not.toBeEmpty();
        result[`${command}-preview`] = await latinLabels(preview);
      }
      await page.keyboard.press("Escape");
    }
  } finally {
    await test.info().attach("斜杠命令结果", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    console.log(JSON.stringify(result));
    await close();
  }
  expect(untranslatedLabels(result)).toEqual([]);
});

test("H03：设置即时切换编辑器语言并保留未保存草稿", async () => {
  const { app, page, vault, close } = await openApp();
  const sample = path.join(vault, "语言切换.md");
  const original = '# 标题\n\n原文\n\n<Embed src="" />\n';
  const navigate = (name: string) => page.locator('[data-region="rail"]').getByRole("button", { name, exact: true }).click();
  try {
    writeFileSync(sample, original);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1510, 900));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    await navigate("设置");
    await page.getByTestId("settings-nav-editor").click();
    const language = page.getByLabel("知识库编辑器语言", { exact: true });
    const autosave = page.getByRole("switch", { name: "自动保存" });
    await expect(language).toHaveValue("zh-Hans");
    await autosave.click();
    await expect(autosave).not.toBeChecked();
    await navigate("知识库");
    await treeSettled(page);
    await treeItem(page, "语言切换.md").click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(prose.getByText("嵌入 URL", { exact: true })).toBeVisible();
    await prose.focus();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.insertText("未保存的草稿");
    await expect(prose).toContainText("未保存的草稿");
    const originalEditor = await prose.elementHandle();
    await page.getByTestId("note-toolbar").getByRole("button", { name: "文档详情" }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await expect(page.getByTestId("comments-panel")).toBeVisible();
    await navigate("设置");
    await language.selectOption("en");
    await expect(prose.getByText("Embed a URL", { exact: true })).toHaveCount(1);
    await expect(prose.locator("[data-jsx-gear]")).toHaveAttribute("aria-label", "Embed properties");
    expect(JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).editor.knowledgeLocale).toBe("en");
    await expect(page.locator('.notes-resource-tree [aria-label="File options"]')).toHaveCount(1);
    await expect(page.getByTestId("comments-panel")).toContainText("Add comment");
    await navigate("知识库");
    expect(await prose.evaluate((node, prior) => node === prior, originalEditor)).toBe(true);
    await expect(prose).toContainText("未保存的草稿");
    expect(readFileSync(sample, "utf8")).toBe(original);
    await navigate("设置");
    await language.selectOption("zh-Hans");
    await expect(prose.getByText("嵌入 URL", { exact: true })).toHaveCount(1);
    await expect(prose.locator("[data-jsx-gear]")).toHaveAttribute("aria-label", "嵌入属性");
    await navigate("知识库");
    expect(untranslatedLabels({ editor: await latinLabels(prose) })).toEqual([]);
    await expect(prose).toContainText("未保存的草稿");
  } finally {
    await close();
  }
});
