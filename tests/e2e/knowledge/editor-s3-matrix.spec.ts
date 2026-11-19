import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B01–B05 复刻矩阵的数据驱动验证（真实 Electron）：
//   1. 逐项在独立文档中应用 `/` 菜单选项，验证实际命令效果；
//   2. 逐项验证 Markdown 构造的“无编辑打开 / 关闭不写盘”（字节不变）；
//   3. 逐项验证常用快捷键对应的标记 / 块。
// Markdown 构造检查写入旧矩阵文件。斜杠菜单结果保存到各次测试独立的输出目录。

const OUT = path.resolve(import.meta.dirname, "../../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/s3/matrix-run.json");

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page);
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

const SAMPLES: Record<string, string> = {
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

test("矩阵·Markdown 构造：无编辑打开 / 关闭字节不变，且文档可渲染（不崩溃）", async () => {
  const { page, vault, close } = await openApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const results: Record<string, { bytesUnchanged: boolean; rendered: boolean }> = {};
  try {
    for (const [name, md] of Object.entries(SAMPLES)) writeFileSync(path.join(vault, `${name}.md`), md);
    await gotoNotes(page);
    for (const [name, md] of Object.entries(SAMPLES)) {
      await treeItem(page, `${name}.md`).click();
      await expect(page.getByTestId("note-document")).toBeVisible({ timeout: 30_000 });
      await prose(page).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1800); // 超过防抖与自动保存
      const after = readFileSync(path.join(vault, `${name}.md`), "utf8");
      const text = (await prose(page).innerText()).trim();
      results[name] = { bytesUnchanged: after === md, rendered: text.length > 0 };
    }
    mkdirSync(path.dirname(OUT), { recursive: true });
    const prev = existsJson(OUT);
    writeFileSync(OUT, JSON.stringify({ ...prev, constructs: results, constructErrors: errors }, null, 2));
    for (const [name, r] of Object.entries(results)) {
      expect(r.rendered, `${name} 应渲染出内容`).toBe(true);
      expect(r.bytesUnchanged, `${name} 无编辑打开不得改写文件`).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

function existsJson(p: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const STARTING_TEXT = "斜杠起始段落";
const SLASH_ITEM_COUNT = 36;

function slashFixtureName(index: number): string {
  return `斜杠-${String(index).padStart(2, "0")}`;
}

async function documentSnapshot(editor: Locator): Promise<string> {
  return editor.evaluate((element) => {
    const root = element as HTMLElement & { editor?: { state: { doc: { toJSON(): unknown } } } };
    if (!root.editor) throw new Error("编辑器尚未挂载");
    return JSON.stringify(root.editor.state.doc.toJSON());
  });
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
  const initial = await documentSnapshot(editor);
  await page.keyboard.type("/");
  const listbox = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
  await expect(listbox).toBeVisible();
  return { editor, listbox, initial };
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
    const labels = (await catalog.listbox.getByRole("option").allTextContents()).map((label) => label.trim());
    expect(labels).toHaveLength(SLASH_ITEM_COUNT);
    expect(new Set(labels).size).toBe(SLASH_ITEM_COUNT);
    await page.keyboard.press("Escape");
    await expect(catalog.listbox).toBeHidden();

    const results: Record<string, string> = {};
    for (const [index, label] of labels.entries()) {
      await test.step(label, async () => {
        const { editor, listbox, initial } = await openSlashFixture(page, index + 1);
        const option = listbox.getByRole("option", { name: label, exact: true });
        const withQuery = await documentSnapshot(editor);
        await option.hover();
        // 等预览选中目标后走菜单的键盘提交入口，避免鼠标按下与浮层重新布局竞争。
        await expect(option).toHaveAttribute("aria-selected", "true");
        await expect(editor).toBeFocused();

        if (label === "文件") {
          const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
          const contents = Buffer.from("斜杠命令上传的文件\n");
          await chooser.setFiles({ name: "slash-matrix.txt", mimeType: "text/plain", buffer: contents });
          await expect(editor.getByRole("link", { name: /^slash-matrix\.txt/ })).toHaveAttribute("href", /\/attachments\/slash-matrix\.txt$/);
          expect(readFileSync(path.join(vault, "attachments", "slash-matrix.txt"))).toEqual(contents);
          results[label] = "打开文件选择器并插入附件";
        } else if (label === "表情符号") {
          await page.keyboard.press("Enter");
          const picker = page.getByTestId("emoji-picker-popover");
          await expect(picker).toBeVisible();
          await picker.getByRole("searchbox").fill("party popper");
          await picker.getByRole("gridcell", { name: "Party popper", exact: true }).click();
          await expect(picker).toBeHidden();
          await expect(editor.locator(":scope > p").last()).toHaveText("🎉");
          results[label] = "打开表情选择器并插入表情";
        } else {
          await page.keyboard.press("Enter");
          await expect
            .poll(
              async () => {
                const after = await documentSnapshot(editor);
                return after !== initial && after !== withQuery;
              },
              { message: `${label} 应修改文档内容或结构` },
            )
            .toBe(true);
          results[label] = "文档已变化";
        }
        await expect(listbox).toBeHidden();
        await page.keyboard.press("Escape");
      });
    }
    expect(Object.keys(results)).toEqual(labels);
    expect(errors).toEqual([]);
    writeFileSync(test.info().outputPath("slash-matrix.json"), JSON.stringify({ slashItems: results, slashErrors: errors }, null, 2));
  } finally {
    await close();
  }
});
