import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B06、B07、C05：真实 Electron 里的鼠标选区、上下行光标、IME 组合输入（CDP imeSetComposition，不是真实输入法）、坏 YAML 诊断与修复入口。
// 预言机是浏览器自己的 caretRangeFromPoint；对照 rc.4 的取证见 evidence/repro/README.md。

const para = (n: number) => `第 ${n} 段：这是一段用来测试光标移动与鼠标选区的中文正文，包含 English words 和更多文字，需要足够长才能在窗口里折行成两到三行显示，继续补充一些文字让它更长一些，直到确实折行。`;
const DOC = ["# 选区", "", ...Array.from({ length: 6 }, (_, i) => `${para(i + 1)}\n`)].join("\n");

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page);
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = () => document.querySelector('[data-testid="markdown-editor"] .ProseMirror') as HTMLElement;
    (window as unknown as { __p: unknown }).__p = {
      focus() {
        const s = getSelection();
        if (!s?.focusNode) return null;
        const r = document.createRange();
        r.setStart(root(), 0);
        r.setEnd(s.focusNode, s.focusOffset);
        const c = document.createRange();
        c.setStart(s.focusNode, s.focusOffset);
        c.collapse(true);
        let rect = c.getClientRects()[0] ?? c.getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.height === 0)) rect = (s.focusNode.nodeType === 1 ? (s.focusNode as Element) : s.focusNode.parentElement!).getBoundingClientRect();
        return { offset: r.toString().length, y: Math.round(rect.top - root().getBoundingClientRect().top) };
      },
      anchor() {
        const s = getSelection();
        if (!s?.anchorNode) return null;
        const r = document.createRange();
        r.setStart(root(), 0);
        r.setEnd(s.anchorNode, s.anchorOffset);
        return r.toString().length;
      },
      text: () => getSelection()?.toString() ?? "",
      oracle(x1: number, y1: number, x2: number, y2: number) {
        const a = document.caretRangeFromPoint(x1, y1);
        const b = document.caretRangeFromPoint(x2, y2);
        if (!a || !b) return null;
        const fwd = a.compareBoundaryPoints(Range.START_TO_START, b) <= 0;
        const s = fwd ? a : b;
        const e = fwd ? b : a;
        const r = document.createRange();
        r.setStart(s.startContainer, s.startOffset);
        r.setEnd(e.startContainer, e.startOffset);
        return r.toString();
      },
    };
  });
}

test("B06：鼠标拖选（段内与跨段）与上下行光标，不错位、不反向、不原地不动", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "选区.md"), DOC);
    await gotoNotes(page);
    await treeItem(page, "选区.md").click();
    await expect(prose(page)).toContainText("第 3 段", { timeout: 30_000 });
    await installProbe(page);
    const loc = (n: number) =>
      prose(page)
        .locator("p")
        .filter({ hasText: `第 ${n} 段` })
        .first();

    // 段内拖选 ×6：与预言机的差异不超过 2 个字符（汉字中点命中取整）
    await loc(3).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(500);
    const b3 = (await loc(3).boundingBox())!;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(600); // 避开双击 / 三击判定
      const b4r = (await loc(4).boundingBox())!;
      await page.mouse.click(b4r.x + 6, b4r.y + b4r.height - 6); // 先把选区挪到别处：在已有选区内按下会启动文字拖放而不是新选区
      const x1 = b3.x + b3.width * (0.1 + 0.05 * i);
      const x2 = b3.x + b3.width * (0.55 + 0.06 * i);
      const y = b3.y + 10;
      await page.mouse.move(x1, y);
      await page.mouse.down();
      await page.mouse.move(x2, y, { steps: 10 });
      await page.mouse.up();
      const got = await page.evaluate(() => (window as unknown as { __p: { text(): string } }).__p.text());
      const want = (await page.evaluate(([a, b, c, d]) => (window as unknown as { __p: { oracle(...n: number[]): string | null } }).__p.oracle(a!, b!, c!, d!), [x1, y, x2, y])) ?? "";
      expect(got.length).toBeGreaterThan(0);
      expect(Math.abs(got.length - want.length)).toBeLessThanOrEqual(2);
    }

    // 逐行 ArrowDown ×12 / ArrowUp ×12：偏移单调、单步纵向位移不超过 3 行
    await page.mouse.click(b3.x + b3.width * 0.4, b3.y + 10);
    let prev = await page.evaluate(() => (window as unknown as { __p: { focus(): { offset: number; y: number } } }).__p.focus());
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("ArrowDown");
      const cur = await page.evaluate(() => (window as unknown as { __p: { focus(): { offset: number; y: number } } }).__p.focus());
      expect(cur.offset).toBeGreaterThanOrEqual(prev.offset);
      expect(Math.abs(cur.y - prev.y)).toBeLessThan(3 * 29 + 40);
      prev = cur;
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("ArrowUp");
      const cur = await page.evaluate(() => (window as unknown as { __p: { focus(): { offset: number; y: number } } }).__p.focus());
      expect(cur.offset).toBeLessThanOrEqual(prev.offset);
      expect(Math.abs(cur.y - prev.y)).toBeLessThan(3 * 29 + 40);
      prev = cur;
    }

    // Shift+ArrowDown 扩选：只增不减，锚点不动
    await page.mouse.click(b3.x + b3.width * 0.3, b3.y + 10);
    const a0 = await page.evaluate(() => (window as unknown as { __p: { anchor(): number } }).__p.anchor());
    let len = 0;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+ArrowDown");
      const t = await page.evaluate(() => (window as unknown as { __p: { text(): string } }).__p.text());
      expect(t.length).toBeGreaterThanOrEqual(len);
      expect(await page.evaluate(() => (window as unknown as { __p: { anchor(): number } }).__p.anchor())).toBe(a0);
      len = t.length;
    }
    expect(len).toBeGreaterThan(0);

    // 跨段拖选（第 2 段 → 第 4 段）：两端都在视口内，与预言机差异 ≤ 6 字符；选区文本同时含两段的片段
    await loc(3).evaluate((el) => el.scrollIntoView({ block: "center" }));
    const b2 = (await loc(2).boundingBox())!;
    const b4 = (await loc(4).boundingBox())!;
    const [x1, y1, x2, y2] = [b2.x + b2.width * 0.3, b2.y + 10, b4.x + b4.width * 0.6, b4.y + 10] as const;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 20 });
    await page.mouse.up();
    const got = await page.evaluate(() => (window as unknown as { __p: { text(): string } }).__p.text());
    const want = (await page.evaluate(([a, b, c, d]) => (window as unknown as { __p: { oracle(...n: number[]): string | null } }).__p.oracle(a!, b!, c!, d!), [x1, y1, x2, y2])) ?? "";
    expect(Math.abs(got.length - want.length)).toBeLessThanOrEqual(6);
    expect(got).toContain("第 3 段");
  } finally {
    await close();
  }
});

test("B07：IME 组合输入（CDP 合成，非真实输入法）——组合中不提交、提交后落盘、取消不留残余", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "输入法.md");
    writeFileSync(file, "# 输入法\n\n开头。\n");
    await gotoNotes(page);
    await treeItem(page, "输入法.md").click();
    await expect(prose(page)).toContainText("开头。", { timeout: 30_000 });
    const cdp = await page.context().newCDPSession(page);
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");

    // 组合中：拼音串显示在编辑器里，但不应被当作最终文本保存
    await cdp.send("Input.imeSetComposition", { text: "nihao", selectionStart: 5, selectionEnd: 5 });
    await expect(prose(page)).toContainText("nihao");
    await page.waitForTimeout(1500); // 超过 300 ms 防抖与 800 ms 自动保存
    expect(readFileSync(file, "utf8")).not.toContain("nihao");

    // 提交：拼音被替换为汉字，磁盘最终只含汉字
    await cdp.send("Input.insertText", { text: "你好" });
    await expect(prose(page)).toContainText("开头。你好");
    await expect(prose(page)).not.toContainText("nihao");
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toContain("你好");
    expect(readFileSync(file, "utf8")).not.toContain("nihao");

    // 取消：组合文本清空后不留残余
    await cdp.send("Input.imeSetComposition", { text: "x", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
    await page.waitForTimeout(500);
    await expect(prose(page)).not.toContainText("开头。你好x");

    // 组合进行中立即触发关闭 / 切换：已提交的内容不丢（flush 先排空）
    await cdp.send("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 });
    await cdp.send("Input.insertText", { text: "测试" });
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("你好测试", { timeout: 20_000 });
  } finally {
    await close();
  }
});

test("C05：坏 YAML——面板逐字给出诊断，修复入口是源码模式，修好后诊断消失且落盘", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "坏属性.md");
    const bad = "---\ntitle: [未闭合\nfoo: : bar\n---\n\n# 正文\n\n段落\n";
    writeFileSync(file, bad);
    await gotoNotes(page);
    await treeItem(page, "坏属性.md").click();
    await expect(prose(page)).toContainText("段落", { timeout: 30_000 });
    const alert = page.getByTestId("property-panel-yaml-error");
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toHaveAttribute("role", "alert");
    // 诊断文案逐字（Lingui 的 en / zh-Hans 两个编译目录之一）
    const text = (await alert.innerText()).replace(/\s+/g, " ");
    const en = "The properties block at the top of this doc has a formatting error. Switch to source mode to fix it.";
    const zh = "这个文档顶部的属性块有格式错误。请切换到源码模式修复。";
    expect(text.includes(en) || text.includes(zh)).toBe(true);
    // 诊断下面一行是 YAML 解析器的具体报错（非空）
    const detail = await alert.locator("span.block").innerText();
    expect(detail.trim().length).toBeGreaterThan(5);
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(bad); // 打开 / 展示诊断不改写文件

    // 修复入口：切到源码，改成合法 YAML
    await page.getByRole("tab", { name: "源码" }).click();
    const cm = page.getByTestId("markdown-editor").locator(".cm-content").first();
    await expect(cm).toContainText("未闭合", { timeout: 20_000 });
    await cm.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("---\ntitle: 修好了\n---\n\n# 正文\n\n段落");
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 15_000 }).toContain("title: 修好了");
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("段落", { timeout: 20_000 });
    await expect(page.getByTestId("property-panel-yaml-error")).toHaveCount(0);
  } finally {
    await close();
  }
});
