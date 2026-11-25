import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { openNoteProperties, treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B01–B05 复刻矩阵的数据驱动验证（真实 Electron）：
//   1. 逐项在独立文档中应用 `/` 菜单选项，验证实际命令效果；
//   2. 逐项验证 Markdown 构造的“无编辑打开 / 关闭不写盘”（字节不变）；
//   3. 逐项验证常用快捷键对应的标记 / 块。
// 将每项实际断言的结果保存到各次测试的输出目录。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page);
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

const SAMPLES = {
  标题与段落: "# 一级\n\n## 二级\n\n### 三级\n\n正文段落。\n",
  强调与删除线: "**粗** *斜* ~~删~~ `码` 末尾\n",
  无序有序任务列表: "- 甲\n- 乙\n  - 乙一\n\n1. 一\n2. 二\n\n- [ ] 待办\n- [x] 完成\n",
  引用与分隔线: "> 引用一\n> 引用二\n\n---\n\n后文\n",
  围栏代码块: "```ts\nconst a: number = 1;\n```\n\n~~~\n波浪线围栏\n~~~\n",
  表格: "| 列甲 | 列乙 |\n| --- | :-: |\n| 1 | 2 |\n| 3 | 4 |\n",
  链接与图片: "[文字](https://example.com/a?b=1) ![图](./img.png) <https://example.com>\n",
  双链与标签: "见 [[另一篇]] 与 [[目录/笔记|别名]] #标签 #嵌套/标签\n",
  数学: "行内 $a^2+b^2$ 与块：\n\n$$\n\\int_0^1 x\\,dx\n$$\n",
  脚注: "正文[^1]\n\n[^1]: 脚注内容\n",
  前置属性: "---\ntitle: 标题\ntags:\n  - a\n  - b\ncount: 007\nflag: false\n---\n\n正文\n",
  混合换行与尾随空格: "行一  \n行二\\\n行三\n",
  Mermaid围栏: "```mermaid\ngraph TD;\nA-->B;\n```\n",
};

const SAMPLE_RESULTS: Record<keyof typeof SAMPLES, { selector: string; text?: string; count?: number }[]> = {
  标题与段落: [
    { selector: "h1", text: "一级" },
    { selector: "h2", text: "二级" },
    { selector: "h3", text: "三级" },
    { selector: "p", text: "正文段落。" },
  ],
  强调与删除线: [
    { selector: "strong", text: "粗" },
    { selector: "em", text: "斜" },
    { selector: "s", text: "删" },
    { selector: "code", text: "码" },
  ],
  无序有序任务列表: [
    { selector: "li li, [role=listitem] [role=listitem]", text: "乙一" },
    { selector: "ol li", count: 2 },
    { selector: 'input[type="checkbox"]:checked', count: 1 },
  ],
  引用与分隔线: [
    { selector: "blockquote", text: "引用一" },
    { selector: "hr", count: 1 },
  ],
  围栏代码块: [
    { selector: "pre", count: 2 },
    { selector: "pre", text: "const a: number = 1;" },
  ],
  表格: [
    { selector: "th", count: 2 },
    { selector: "td", count: 4 },
    { selector: "tr:last-child td:last-child", text: "4" },
  ],
  链接与图片: [{ selector: "img[alt='图']", count: 1 }],
  双链与标签: [
    { selector: "[data-wiki-link]", count: 2 },
    { selector: "[data-tag]", count: 2 },
  ],
  数学: [{ selector: ".katex", count: 2 }],
  脚注: [
    { selector: ".footnote-backref", count: 1 },
    { selector: "aside[data-footnote-def]", text: "脚注内容" },
  ],
  前置属性: [{ selector: "p", text: "正文" }],
  混合换行与尾随空格: [{ selector: "p br", count: 2 }],
  Mermaid围栏: [{ selector: ".mermaid svg[aria-roledescription]", text: "A" }],
};

test("矩阵·Markdown 构造：按类型与内容逐项断言，无编辑打开关闭字节不变", async () => {
  test.setTimeout(240_000);
  const { page, vault, close } = await openApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const results: Record<string, { bytesUnchanged: boolean; assertions: (typeof SAMPLE_RESULTS)[keyof typeof SAMPLES] }> = {};
  try {
    for (const [name, md] of Object.entries(SAMPLES)) writeFileSync(path.join(vault, `${name}.md`), md);
    writeFileSync(path.join(vault, "img.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+YhXYAAAAASUVORK5CYII=", "base64"));
    await gotoNotes(page);
    for (const name of Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]) {
      const md = SAMPLES[name];
      await treeItem(page, `${name}.md`).click();
      await expect(page.getByTestId("note-document")).toBeVisible({ timeout: 30_000 });
      await prose(page).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1800); // 超过防抖与自动保存
      const after = readFileSync(path.join(vault, `${name}.md`), "utf8");
      const assertions = SAMPLE_RESULTS[name];
      for (const { selector, count, text } of assertions) {
        const feature = prose(page).locator(selector);
        if (count !== undefined) await expect.soft(feature, name).toHaveCount(count);
        if (text !== undefined) await expect.soft(feature.filter({ hasText: text }), name).toHaveCount(1);
      }
      if (name === "链接与图片") {
        const links = await documentNodes(prose(page));
        const mark = (href: string) => expect.objectContaining({ type: "link", attrs: expect.objectContaining({ href }) });
        expect
          .soft(links)
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({ text: "文字", marks: expect.arrayContaining([mark("https://example.com/a?b=1")]) }),
              expect.objectContaining({ text: "https://example.com", marks: expect.arrayContaining([mark("https://example.com")]) }),
            ]),
          );
        await expect
          .poll(() =>
            prose(page)
              .locator("img[alt='图']")
              .evaluate((image: HTMLImageElement) => image.naturalWidth),
          )
          .toBe(1);
      }
      if (name === "前置属性") await expect(await openNoteProperties(page)).toContainText("count");
      results[name] = { bytesUnchanged: after === md, assertions };
    }
    writeFileSync(test.info().outputPath("construct-matrix.json"), JSON.stringify({ constructs: results, constructErrors: errors }, null, 2));
    for (const [name, r] of Object.entries(results)) {
      expect(r.bytesUnchanged, `${name} 无编辑打开不得改写文件`).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

const STARTING_TEXT = "斜杠起始段落";
const SLASH_ITEM_COUNT = 36;

function slashFixtureName(index: number): string {
  return `斜杠-${String(index).padStart(2, "0")}`;
}

interface EditorNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: EditorNode[];
  content?: EditorNode[];
}

async function documentNodes(editor: Locator): Promise<EditorNode[]> {
  return editor.evaluate((element) => {
    const root = element as HTMLElement & { editor?: { state: { doc: { toJSON(): EditorNode } } } };
    if (!root.editor) throw new Error("编辑器尚未挂载");
    const result: EditorNode[] = [];
    function visit(node: EditorNode) {
      result.push(node);
      node.content?.forEach(visit);
    }
    visit(root.editor.state.doc.toJSON());
    return result;
  });
}

const slashEffects: Record<string, object> = {
  heading1: { type: "heading", attrs: expect.objectContaining({ level: 1 }) },
  heading2: { type: "heading", attrs: expect.objectContaining({ level: 2 }) },
  heading3: { type: "heading", attrs: expect.objectContaining({ level: 3 }) },
  bulletList: { type: "list", attrs: expect.objectContaining({ ordered: false }), content: [expect.objectContaining({ type: "listItem", attrs: expect.objectContaining({ checked: null }) })] },
  orderedList: { type: "list", attrs: expect.objectContaining({ ordered: true, start: 1 }), content: [expect.objectContaining({ type: "listItem" })] },
  taskList: { type: "list", attrs: expect.objectContaining({ ordered: false }), content: [expect.objectContaining({ type: "listItem", attrs: expect.objectContaining({ checked: false }) })] },
  blockquote: { type: "blockquote", content: [expect.objectContaining({ type: "paragraph" })] },
  codeBlock: { type: "codeBlock", attrs: expect.objectContaining({ language: "js" }) },
  table: {
    type: "table",
    content: Array.from({ length: 3 }, (_, row) =>
      expect.objectContaining({
        type: "tableRow",
        content: Array.from({ length: 3 }, () => expect.objectContaining({ type: row === 0 ? "tableHeader" : "tableCell" })),
      }),
    ),
  },
  separator: { type: "thematicBreak", attrs: expect.objectContaining({ sourceRaw: "---" }) },
  footnote: { type: "footnoteReference", attrs: expect.objectContaining({ identifier: "1" }) },
  inlineMath: { type: "mathInline" },
  link: { type: "text", marks: [expect.objectContaining({ type: "link", attrs: expect.objectContaining({ href: "" }) })] },
  "component-Tag": { type: "tag" },
};

const htmlStarters: Record<string, RegExp> = {
  html: /<h1 style=/,
  chart: /<svg|<table|--chart-/,
  "stat-cards": /--chart-|<div/,
  "custom-svg": /<svg/,
  "interactive-control": /type=["']range["']/,
};

function slashEffect(command: string): object {
  const explicit = slashEffects[command];
  if (explicit) return explicit;
  if (command.startsWith("embed-starter-")) {
    const body = htmlStarters[command.slice("embed-starter-".length)];
    if (!body) throw new Error(`斜杠 HTML 模板缺少断言: ${command}`);
    return { type: "codeBlock", attrs: expect.objectContaining({ language: "html", meta: "preview" }), content: [expect.objectContaining({ type: "text", text: expect.stringMatching(body) })] };
  }
  if (command.startsWith("component-")) {
    return { type: "jsxComponent", attrs: expect.objectContaining({ componentName: command.slice("component-".length) }) };
  }
  throw new Error(`斜杠命令缺少断言: ${command}`);
}

async function openSlashFixture(page: Page, index: number) {
  const name = slashFixtureName(index);
  const editor = prose(page);
  const row = treeItem(page, `${name}.md`);
  const heading = editor.getByRole("heading", { name, exact: true });
  // 用文档标题确认本轮夹具已打开，避免文件树刷新期间提前向编辑器发送按键。
  await expect(async () => {
    if (!(await heading.isVisible())) {
      await row.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await row.click({ position: { x: 32, y: 10 } });
    }
    await expect(heading).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const paragraphs = editor.locator(":scope > p");
  await expect(paragraphs).toHaveText([STARTING_TEXT]);
  await paragraphs.first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(paragraphs).toHaveText([STARTING_TEXT, ""]);
  await expect
    .poll(() =>
      paragraphs.last().evaluate((paragraph) => {
        const selection = window.getSelection();
        return selection?.isCollapsed && paragraph.contains(selection.anchorNode);
      }),
    )
    .toBe(true);
  await page.keyboard.type("/");
  const listbox = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
  await expect(listbox).toBeVisible();
  return { editor, listbox };
}

test("矩阵·`/` 菜单逐项：36 个选项各从独立文档触发并验证命令效果", async () => {
  test.setTimeout(600_000);
  const { page, vault, close } = await openApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    for (let index = 0; index <= SLASH_ITEM_COUNT; index++) {
      const name = slashFixtureName(index);
      writeFileSync(path.join(vault, `${name}.md`), `# ${name}\n\n${STARTING_TEXT}\n`);
    }
    await gotoNotes(page);
    const catalog = await openSlashFixture(page, 0);
    for (const category of ["基础块", "插入", "组件", "媒体", "嵌入预览"]) {
      await expect(catalog.listbox.getByRole("group", { name: category, exact: true }).getByRole("option").first()).toBeVisible();
    }
    await expect(catalog.listbox.getByRole("group", { name: /^(Skills|技能)$/ })).toHaveCount(0);
    const labels = (await catalog.listbox.getByRole("option").allTextContents()).map((label) => label.trim());
    expect(labels).toHaveLength(SLASH_ITEM_COUNT);
    expect(new Set(labels).size).toBe(SLASH_ITEM_COUNT);
    await page.keyboard.press("Escape");
    await expect(catalog.listbox).toBeHidden();

    const results: Record<string, { command: string; passed: boolean }> = {};
    for (const [index, label] of labels.entries()) {
      await test.step(label, async () => {
        const { editor, listbox } = await openSlashFixture(page, index + 1);
        const option = listbox.getByRole("option", { name: label, exact: true });
        const command = await option.getAttribute("data-slash-command");
        if (!command) throw new Error(`缺少斜杠命令 ID: ${label}`);
        const errorCount = test.info().errors.length;

        if (command === "component-File") {
          const [chooser] = await Promise.all([page.waitForEvent("filechooser"), option.click()]);
          const contents = Buffer.from("斜杠命令上传的文件\n");
          await chooser.setFiles({ name: "slash-matrix.txt", mimeType: "text/plain", buffer: contents });
          await expect(editor.getByRole("link", { name: /^slash-matrix\.txt/ })).toHaveAttribute("href", /\/attachments\/slash-matrix\.txt$/);
          expect(readFileSync(path.join(vault, "attachments", "slash-matrix.txt"))).toEqual(contents);
        } else if (command === "emoji") {
          await option.click();
          const picker = page.getByTestId("emoji-picker-popover");
          await expect(picker).toBeVisible();
          await picker.getByRole("searchbox").fill("party popper");
          await picker.getByRole("gridcell").filter({ hasText: "🎉" }).click({ timeout: 15_000 });
          await expect(picker).toBeHidden();
          await expect(editor.locator(":scope > p").last()).toHaveText("🎉");
        } else {
          // 等预览选中目标后走菜单的键盘提交入口，避免鼠标按下与浮层重新布局竞争。
          await option.hover();
          await expect(option).toHaveAttribute("aria-selected", "true");
          await expect(editor).toBeFocused();
          await page.keyboard.press("Enter");
          const effect = slashEffect(command);
          await expect.soft.poll(() => documentNodes(editor), { message: `${command} 的节点类型与属性` }).toEqual(expect.arrayContaining([expect.objectContaining(effect)]));
          if (command === "heading1") await expect(editor.locator("h1")).toHaveCount(2);
          if (command === "footnote") {
            await expect.poll(() => documentNodes(editor)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "footnoteDefinition", attrs: expect.objectContaining({ identifier: "1" }) })]));
          }
        }
        await expect(listbox).toBeHidden();
        await page.keyboard.press("Escape");
        results[label] = { command, passed: errorCount === test.info().errors.length };
      });
    }
    expect(Object.keys(results)).toEqual(labels);
    expect(errors).toEqual([]);
    writeFileSync(test.info().outputPath("slash-matrix.json"), JSON.stringify({ slashItems: results, slashErrors: errors }, null, 2));
  } finally {
    await close();
  }
});
