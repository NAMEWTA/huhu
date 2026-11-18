import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B03–B05 复刻矩阵 §6（输入规则、粘贴）与 §7（快捷键）的数据驱动验证（真实 Electron）。
// 结果写入 test-results/s3/rules-run.json（不写入受版本管理的 evidence；需要留证时人工复制并写明环境）。

const OUT = path.resolve(import.meta.dirname, "../../../test-results/s3/rules-run.json");

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page);
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror:visible").first();

function save(patch: Record<string, unknown>): void {
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>;
  } catch {
    // 首次写入
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ ...prev, ...patch }, null, 2));
}

async function freshDoc(page: Page): Promise<void> {
  await prose(page).click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
}

const INPUT_RULES: Array<{ name: string; keys: string; sel: string; hasText?: string }> = [
  { name: "粗体 **x**", keys: "**粗体**", sel: "strong", hasText: "粗体" },
  { name: "斜体 *x*", keys: "*斜体*", sel: "em", hasText: "斜体" },
  { name: "行内代码 `x`", keys: "`码`", sel: "code", hasText: "码" },
  { name: "删除线 ~~x~~", keys: "~~删~~", sel: "s, del", hasText: "删" },
  { name: "一级标题 # ", keys: "# 标题一", sel: "h1", hasText: "标题一" },
  { name: "二级标题 ## ", keys: "## 标题二", sel: "h2", hasText: "标题二" },
  { name: "三级标题 ### ", keys: "### 标题三", sel: "h3", hasText: "标题三" },
  { name: "无序列表 - ", keys: "- 条目", sel: "ul li", hasText: "条目" },
  { name: "有序列表 1. ", keys: "1. 条目", sel: "ol li", hasText: "条目" },
  { name: "任务列表 [ ] ", keys: "[ ] 待办", sel: 'ul[data-type="taskList"] li, li[data-type="taskItem"]', hasText: "待办" },
  { name: "引用 > ", keys: "> 引文", sel: "blockquote", hasText: "引文" },
  { name: "代码块 ```", keys: "```\n代码", sel: "pre", hasText: "代码" },
  { name: "分隔线 ---", keys: "---", sel: "hr" },
  { name: "行内链接 [t](url)", keys: "[文字](https://example.com/x) ", sel: "a, [data-link]", hasText: "文字" },
  { name: "行内数学 $x$", keys: "$a^2$ ", sel: ".katex, [data-type='math-inline'], .math-inline" },
];

test("矩阵·输入规则：逐条输入 Markdown 简写，生成对应块 / 标记", async () => {
  test.setTimeout(300_000);
  const { page, vault, close } = await openApp();
  const results: Record<string, string> = {};
  try {
    writeFileSync(path.join(vault, "规则.md"), "起始\n");
    await gotoNotes(page);
    await treeItem(page, "规则.md").click();
    await expect(prose(page)).toContainText("起始", { timeout: 30_000 });
    for (const r of INPUT_RULES) {
      await freshDoc(page);
      await page.keyboard.type(r.keys, { delay: 15 });
      const loc = prose(page).locator(r.sel);
      const ok = (await loc.count()) > 0 && (r.hasText ? (await loc.first().innerText()).includes(r.hasText) : true);
      results[r.name] = ok ? "通过" : "未生成预期节点";
    }
    save({ inputRules: results });
    expect(Object.entries(results).filter(([, v]) => v !== "通过")).toEqual([]);
  } finally {
    await close();
  }
});

test("矩阵·快捷键与粘贴：格式键、块移动、纯文本 / HTML / 裸 URL 粘贴", async () => {
  test.setTimeout(300_000);
  const { page, vault, close } = await openApp();
  const results: Record<string, string> = {};
  const paste = (data: Record<string, string>) =>
    page.evaluate((d) => {
      const el = document.querySelector('[data-testid="markdown-editor"] .ProseMirror') as HTMLElement;
      el.focus();
      const dt = new DataTransfer();
      for (const [k, v] of Object.entries(d)) dt.setData(k, v);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, data);
  try {
    writeFileSync(path.join(vault, "快捷.md"), "起始\n");
    await gotoNotes(page);
    await treeItem(page, "快捷.md").click();
    await expect(prose(page)).toContainText("起始", { timeout: 30_000 });

    const keys: Array<[string, string, string]> = [
      ["Mod-b 粗体", "ControlOrMeta+b", "strong"],
      ["Mod-i 斜体", "ControlOrMeta+i", "em"],
      ["Mod-Shift-x 删除线", "ControlOrMeta+Shift+x", "s, del"],
      ["Mod-e 行内代码", "ControlOrMeta+e", "code"],
    ];
    let n = 0;
    for (const [name, combo, sel] of keys) {
      // 每个快捷键在独立文件里测：上一个测试留下的“存储标记”会让下一条的结果失真
      const file = `键${n++}.md`;
      writeFileSync(path.join(vault, file), "起始\n");
      await treeSettled(page);
      await treeItem(page, file).click();
      await expect(prose(page)).toContainText("起始", { timeout: 30_000 });
      await freshDoc(page);
      await page.keyboard.type("甲乙丙");
      // 前置条件：选中“甲乙丙”。直接在 DOM 里建立选区且**不等 selectionchange 被 ProseMirror 处理**，随即按快捷键：
      // 这正是“选区刚变、快捷键紧随其后”的竞态，由 RichMarkdownEditor 的 keydown 捕获先同步选区（P-S3-08），快捷键必须一次生效。
      // （旧写法用 Shift+Home 建选区：观察到约 1/10 次 Shift+Home 自身没有扩展选区——选区没建立，与快捷键无关，根因未定位，见 evidence/s3/parity-closeout.md。）
      await prose(page).evaluate((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode() as Text;
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, node.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? ""), "选区应已建立").toBe("甲乙丙");
      await page.keyboard.press(combo);
      await expect(prose(page).locator(sel), `${name} 首次按键就应生效`).not.toHaveCount(0, { timeout: 5_000 });
      results[name] = "通过";
    }

    // 块移动 Mod-Shift-ArrowUp：第二段上移后顺序对调
    await freshDoc(page);
    await page.keyboard.type("第一段");
    await page.keyboard.press("Enter");
    await page.keyboard.type("第二段");
    await page.keyboard.press("ControlOrMeta+Shift+ArrowUp");
    const order = (await prose(page).innerText()).replace(/\s+/g, "");
    results["Mod-Shift-ArrowUp 块上移"] = order.startsWith("第二段第一段") ? "通过" : `顺序仍为 ${order}`;

    // 撤销 / 重做：撤销后文本变化，重做后恢复
    const before = (await prose(page).innerText()).replace(/\s+/g, "");
    await page.keyboard.press("ControlOrMeta+z");
    const undone = (await prose(page).innerText()).replace(/\s+/g, "");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    const redone = (await prose(page).innerText()).replace(/\s+/g, "");
    results["Mod-z / Mod-Shift-z 撤销重做"] = undone !== before && redone === before ? "通过" : `撤销前 ${before} / 撤销后 ${undone} / 重做后 ${redone}`;

    // 粘贴：纯文本 Markdown → 结构化块
    await freshDoc(page);
    await paste({ "text/plain": "# 粘贴标题\n\n- 甲\n- 乙\n\n正文段" });
    results["粘贴 Markdown 文本"] = (await prose(page).locator("h1").count()) > 0 && (await prose(page).locator("ul li").count()) >= 2 ? "通过" : "未结构化";
    // 粘贴：HTML
    await freshDoc(page);
    await paste({ "text/html": "<h2>网页标题</h2><p>有 <strong>粗</strong> 有 <a href='https://example.com'>链接</a></p>", "text/plain": "网页标题 有 粗 有 链接" });
    results["粘贴 HTML"] = (await prose(page).locator("h2").count()) > 0 && (await prose(page).locator("strong").count()) > 0 && (await prose(page).locator("a, [data-link]").count()) > 0 ? "通过" : "未转换";
    // 粘贴：裸 URL
    await freshDoc(page);
    await paste({ "text/plain": "https://example.com/裸链" });
    results["粘贴裸 URL"] = (await prose(page).locator("a, [data-link]").count()) > 0 || (await prose(page).innerText()).includes("example.com") ? "通过（落为链接或文本）" : "无内容";

    save({ shortcutsAndPaste: results });
    expect(Object.entries(results).filter(([, v]) => !v.startsWith("通过"))).toEqual([]);
  } finally {
    await close();
  }
});
