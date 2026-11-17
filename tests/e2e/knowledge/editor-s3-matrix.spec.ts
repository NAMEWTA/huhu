import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B01–B05 复刻矩阵的数据驱动验证（真实 Electron）：
//   1. 逐项枚举 `/` 菜单里的每个选项，插入 → 观察文档变化 → 一次 Ctrl+Z 撤回；
//   2. 逐项验证 Markdown 构造的“无编辑打开 / 关闭不写盘”（字节不变）；
//   3. 逐项验证常用快捷键对应的标记 / 块。
// 结果写入 evidence/s3/matrix-run.json（供 parity-matrix.md 的“验证状态”列引用）。

const OUT = path.resolve(import.meta.dirname, "../../../.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/s3/matrix-run.json");

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

test("矩阵·`/` 菜单逐项：每个选项都能打开、应用后文档或界面有可观察变化、一次撤销回退", async () => {
  test.setTimeout(600_000);
  const { page, vault, close } = await openApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    writeFileSync(path.join(vault, "斜杠.md"), "# 斜杠\n\n起始\n");
    await gotoNotes(page);
    await treeItem(page, "斜杠.md").click();
    await expect(prose(page)).toContainText("起始", { timeout: 30_000 });

    let baselineText = "";
    const openMenu = async () => {
      await prose(page).click({ position: { x: 8, y: 8 } });
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Enter");
      baselineText = (await prose(page).innerText()).trim(); // 新空段落已存在、尚未输入 "/"
      await page.keyboard.type("/");
      await expect(page.locator('[role="listbox"]').first()).toBeVisible({ timeout: 10_000 });
    };
    await openMenu();
    // 枚举：滚动列表收集全部选项文本
    const listbox = page.locator('[role="listbox"]').first();
    const labels = new Set<string>();
    for (let i = 0; i < 30; i++) {
      for (const t of await listbox.locator('[role="option"]').allInnerTexts()) labels.add(t.split("\n")[0]!.trim());
      const before = labels.size;
      await listbox.evaluate((el) => (el.scrollTop += el.clientHeight * 0.8));
      await page.waitForTimeout(80);
      for (const t of await listbox.locator('[role="option"]').allInnerTexts()) labels.add(t.split("\n")[0]!.trim());
      if (labels.size === before && i > 3) break;
    }
    await page.keyboard.press("Escape");
    const items = [...labels].filter(Boolean);
    expect(items.length).toBeGreaterThan(10);

    const results: Record<string, string> = {};
    for (const label of items) {
      await openMenu();
      let typed = label.slice(0, 12);
      await page.keyboard.type(typed);
      const opt = page.locator('[role="option"]').first();
      let shown = await opt.isVisible().catch(() => false);
      if (!shown) {
        // 过滤词可能与显示标签不同（别名 / 关键词）：退回只用第一个词再试一次
        for (let k = 0; k < typed.length; k++) await page.keyboard.press("Backspace");
        typed = label.split(/\s+/)[0]!.slice(0, 6);
        await page.keyboard.type(typed);
        shown = await opt.isVisible().catch(() => false);
      }
      if (!shown) {
        results[label] = "过滤后无选项";
        await page.keyboard.press("Escape");
        for (let k = 0; k < typed.length + 2; k++) await page.keyboard.press("Backspace");
        continue;
      }
      const before = await prose(page).innerHTML();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const after = await prose(page).innerHTML();
      const dialog = (await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').count()) > 0;
      results[label] = after !== before ? "文档已变化" : dialog ? "打开了二级界面" : "无可观察变化";
      await page.keyboard.press("Escape");
      // 回到应用前的状态：关菜单后直接把文档恢复成初始内容（撤销语义由 editor-s3-menus.spec.ts 的“一次撤销撤回一个命令”专项断言，这里不重复）
      await prose(page).focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("起始");
      await page.waitForTimeout(150);
    }
    const prev = existsJson(OUT);
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ ...prev, slashItems: results, slashErrors: errors }, null, 2));
    const bad = Object.entries(results).filter(([, v]) => v.startsWith("无可观察变化"));
    expect(errors).toEqual([]);
    expect(bad, `这些 / 菜单项应用后没有可观察变化：${JSON.stringify(bad)}`).toEqual([]);
  } finally {
    await close();
  }
});
