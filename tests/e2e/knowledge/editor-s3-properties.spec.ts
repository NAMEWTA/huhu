import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";
import { holdBridgeTimers } from "./session-slow-bridge.js";

// S3 / C01–C05：OK 属性面板接入笔记顶部；属性与正文共用同一缓冲、同一文件；未触碰的 YAML 原样保留。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page); // 树在文件事件合并后会重新列举；稳定后再点
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

test("S3：属性显示、只改属性不丢正文与其它键、改正文保留 frontmatter、未保存正文时改属性落同一文件", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "属性.md");
    writeFileSync(file, "---\ntitle: 标题甲\ncount: 0\nflag: false\nzip: 007\ntags:\n  - a\n  - b\n---\n\n# 正文\n\n段落一\n");
    await gotoNotes(page);
    await treeItem(page, "属性.md").click();
    await expect(prose(page)).toContainText("段落一", { timeout: 30_000 });

    // C01：顶部显示属性
    const panel = page.getByTestId("editor-properties");
    await expect(panel).toContainText("title");
    await expect(panel).toContainText("count");
    await expect(panel).toContainText("tags");

    // 无编辑不写盘：停留后磁盘不变（false / 0 / 前导零文本不被改写）
    const original = readFileSync(file, "utf8");
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(original);

    const read = () => readFileSync(file, "utf8");
    const saveState = page.getByTestId("save-state");
    const title = panel.locator("textarea, input[type=text], input:not([type])").first();

    // 等待本次修改的实际文件内容，保存状态可能还在显示上一份已保存快照。
    const afterProperty = original.replace("title: 标题甲", "title: 标题乙");
    await title.fill("标题乙");
    await title.blur();
    await expect.poll(read, { timeout: 10_000 }).toBe(afterProperty);
    await expect(saveState).toHaveText("已保存");

    // C03：只改正文，frontmatter 的全部字节仍一致。
    const afterBody = afterProperty.replace("段落一", "段落一追加正文");
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("追加正文");
    await expect.poll(read, { timeout: 10_000 }).toBe(afterBody);
    await expect(saveState).toHaveText("已保存");

    // C04：正文有未保存修改时立即改属性，最终的同一文件包含两项修改。
    const final = afterBody.replace("title: 标题乙", "title: 标题丙").replace("追加正文", "追加正文再加一段");
    await page.keyboard.type("再加一段");
    await title.fill("标题丙");
    await title.blur();
    await expect.poll(read, { timeout: 10_000 }).toBe(final);
    await expect(saveState).toHaveText("已保存");
  } finally {
    await close();
  }
});

test("C04：正文仍待慢桥交付时改属性，末字和属性一同写入", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "属性.md");
    const original = "---\ntitle: 原题\nzip: 007\n---\n\n正文\n";
    const read = () => readFileSync(file, "utf8");
    writeFileSync(file, original);
    await gotoNotes(page);
    await treeItem(page, "属性.md").click();
    const editor = prose(page);
    await expect(editor).toContainText("正文");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    const source = await holdBridgeTimers(editor);
    await page.keyboard.insertText("首笔");
    const first = original.replace("正文", "正文首笔");
    await expect.poll(read, { timeout: 10_000 }).toBe(first);

    await page.keyboard.insertText("末字");
    await expect(editor).toContainText("正文首笔末字");
    expect(await source()).toBe(first);
    expect(read()).toBe(first);
    const title = page.getByTestId("editor-properties").locator("textarea, input[type=text], input:not([type])").first();
    await title.fill("新题");
    await title.blur();
    const final = first.replace("title: 原题", "title: 新题").replace("首笔", "首笔末字");
    await expect.poll(read, { timeout: 10_000 }).toBe(final);
    await expect(page.getByTestId("save-state")).toHaveText("已保存");
  } finally {
    await close();
  }
});

test("C04：先编辑未保存的属性，再写正文，一次保存包含两项修改", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "逆序属性.md");
  const original = "---\ntitle: 原题\nzip: 007\n---\n\n正文\n";
  try {
    writeFileSync(file, original);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    await autosave.click();
    await expect(autosave).not.toBeChecked();
    await gotoNotes(page);
    await treeItem(page, "逆序属性.md").click();
    const editor = prose(page);
    await expect(editor).toContainText("正文");
    const title = page.getByTestId("editor-properties").locator("textarea, input[type=text], input:not([type])").first();
    await title.fill("新题");
    await editor.click(); // blur 交付属性，立即继续编辑正文
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("末字");
    await expect(editor).toContainText("正文末字");
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("save-state")).toHaveText("已保存");
    expect(readFileSync(file, "utf8")).toBe(original.replace("原题", "新题").replace("正文", "正文末字"));
  } finally {
    await close();
  }
});

test("S3：坏 YAML 不被清空——面板给出诊断，源码里的原文保留", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "坏.md");
    const bad = "---\ntitle: [未闭合\nfoo: : bar\n---\n\n# 正文\n\n段落\n";
    writeFileSync(file, bad);
    await gotoNotes(page);
    await treeItem(page, "坏.md").click();
    await expect(prose(page)).toContainText("段落", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(bad); // 打开不改写
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("未闭合", { timeout: 20_000 });
  } finally {
    await close();
  }
});

test("H01 BOM＋CRLF 笔记的 YAML 可读，编辑后逐字节保留文件格式", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "文件格式.md");
    const original = "\uFEFF---\r\ntitle: 格式标题\r\n---\r\n\r\n正文";
    writeFileSync(file, original);
    await gotoNotes(page);
    await treeItem(page, "文件格式.md").click();
    await expect(page.getByTestId("editor-properties").locator('textarea[data-key="title"]')).toHaveValue("格式标题");
    const body = prose(page).getByText("正文", { exact: true });
    await expect(body).toBeVisible();
    expect(readFileSync(file)).toEqual(Buffer.from(original));
    await body.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("已编辑");
    await expect.poll(() => readFileSync(file)).toEqual(Buffer.from(original + "已编辑"));
  } finally {
    await close();
  }
});

test("H04 页面图标和封面通过 Vault 媒体路径显示本地图片", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "封面 图.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+YhXYAAAAASUVORK5CYII=", "base64"));
    writeFileSync(path.join(vault, "图标封面.md"), "---\nicon: 封面 图.png\nbanner: 封面 图.png\n---\n\n正文\n");
    await gotoNotes(page);
    await treeItem(page, "图标封面.md").click();
    for (const testId of ["page-icon-preview", "page-cover-preview"]) {
      const image = page.getByTestId(testId).locator("img");
      await expect(image).toHaveAttribute("src", "/%E5%B0%81%E9%9D%A2%20%E5%9B%BE.png");
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    }
  } finally {
    await close();
  }
});

const titleInput = (panel: ReturnType<Page["getByTestId"]>) => panel.locator("textarea, input[type=text], input:not([type])").first();

for (const [name, bom, eol] of [
  ["BOM", "\uFEFF", "\n"],
  ["CRLF", "", "\r\n"],
  ["BOM + CRLF", "\uFEFF", "\r\n"],
] as const) {
  test(`C01–C03：${name} 属性同步、只读及磁盘字节保真`, async () => {
    const { page, vault, close } = await openApp();
    try {
      const file = path.join(vault, "属性保真.md");
      const original = bom + ["---", "title: 原题", "when: 2026-11", "zip: 007", "---", "", "# 正文", "", "段落", ""].join(eol);
      const read = () => readFileSync(file);
      writeFileSync(file, original);
      await gotoNotes(page);
      await treeItem(page, "属性保真.md").click();
      await expect(prose(page)).toContainText("段落");
      const top = page.getByTestId("editor-properties");
      await expect(titleInput(top)).toHaveValue("原题");
      await page.getByRole("button", { name: "文档详情", exact: true }).click();
      const detail = page.getByTestId("inspector-properties");
      await expect(titleInput(detail)).toHaveValue("原题");

      await titleInput(top).fill("顶栏改");
      await titleInput(top).blur();
      await expect(titleInput(detail)).toHaveValue("顶栏改");
      await expect.poll(read).toEqual(Buffer.from(original.replace("原题", "顶栏改")));

      await titleInput(detail).fill("详情改");
      await titleInput(detail).blur();
      await expect(titleInput(top)).toHaveValue("详情改");
      const afterProperty = original.replace("原题", "详情改");
      await expect.poll(read).toEqual(Buffer.from(afterProperty));

      await prose(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText("补");
      const afterBody = afterProperty.replace("段落", "段落补");
      await expect.poll(read).toEqual(Buffer.from(afterBody));

      await page.getByRole("tab", { name: "阅读" }).click();
      for (const panel of [top, detail]) {
        await expect(panel.getByTestId("readonly-property-value").and(panel.locator('[data-key="title"]'))).toHaveText("详情改");
        await expect(panel.getByTestId("readonly-property-value").and(panel.locator('[data-key="when"]'))).toHaveText("2026-11");
        await expect(panel.locator("textarea, input, [contenteditable=true]")).toHaveCount(0);
      }
      expect(read()).toEqual(Buffer.from(afterBody));
    } finally {
      await close();
    }
  });
}

test("B10：大纲只列解析树标题，并跳到第二个同名标题的实际位置", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "大纲.md"), "\uFEFF---\n# YAML 伪标题\ntitle: 目录\n---\n\n## 重复\n\n```md\n# 围栏伪标题\n```\n\n**短标题**\n------\n\n## 重复\n");
    await gotoNotes(page);
    await treeItem(page, "大纲.md").click();
    const editor = prose(page);
    await expect(editor.getByRole("heading", { name: "重复" })).toHaveCount(2);
    await page.getByRole("button", { name: "文档详情", exact: true }).click();
    const inspector = page.getByTestId("note-inspector");
    await inspector.getByRole("tab", { name: "大纲" }).click();
    const outline = inspector.locator(".notes-outline");
    await expect(outline.getByRole("button")).toHaveText(["重复", "短标题", "重复"]);
    await outline.getByRole("button", { name: "重复" }).last().click();
    await expect
      .poll(() =>
        editor.evaluate((el) => {
          const anchor = window.getSelection()?.anchorNode;
          return !!anchor && el.querySelectorAll("h2")[2]?.contains(anchor);
        }),
      )
      .toBe(true);

    await page.getByRole("tab", { name: "源码" }).click();
    await outline.getByRole("button", { name: "短标题" }).click();
    await expect.poll(() => page.locator(".cm-activeLine").filter({ hasText: "**短标题**" }).count()).toBe(1);
  } finally {
    await close();
  }
});

test("B09/C03/F02：源码坐标与 CRLF、BOM 混合换行文件的字节一致", async () => {
  const { page, vault, close } = await openApp();
  const fixtures = [
    ["CRLF.md", "first\r\n\r\nSECOND\r\n"],
    ["BOM 混合.md", "\uFEFFfirst\r\n\nSECOND\r\n"],
  ] as const;
  try {
    for (const [name, original] of fixtures) writeFileSync(path.join(vault, name), original);
    await gotoNotes(page);
    for (const [name, original] of fixtures) {
      const file = path.join(vault, name);
      const expected = Buffer.from(original.replace("SECOND", "XECOND"));
      await treeItem(page, name).click();
      await expect(prose(page)).toContainText("SECOND");
      await page.getByRole("tab", { name: "源码" }).click();
      const line = page.locator(".cm-content .cm-line").filter({ hasText: /^SECOND$/ });
      await line.click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Delete");
      await page.keyboard.insertText("X");
      await expect.poll(() => readFileSync(file)).toEqual(expected);
      await page.getByRole("tab", { name: "实时预览" }).click();
      await expect(prose(page)).toContainText("XECOND");
      await page.getByRole("button", { name: `关闭 ${name.replace(/\.md$/i, "")}`, exact: true }).click();
      await treeItem(page, name).click();
      await expect(prose(page)).toContainText("XECOND");
      expect(readFileSync(file)).toEqual(expected);
      await page.getByRole("button", { name: `关闭 ${name.replace(/\.md$/i, "")}`, exact: true }).click();
    }
  } finally {
    await close();
  }
});

test("F02：Markdown、TXT 和 JSON 在显式转换前保留旧编码字节", async () => {
  const { page, vault, close } = await openApp();
  const chinese = [0xc4, 0xe3, 0xba, 0xc3];
  const fixtures = [
    { name: "旧笔记.md", bytes: Buffer.from([...chinese, 0x0a]), text: "你好\n" },
    { name: "旧文本.txt", bytes: Buffer.from([...chinese, 0x0a]), text: "你好\n" },
    { name: "旧数据.json", bytes: Buffer.concat([Buffer.from('{"text":"'), Buffer.from(chinese), Buffer.from('"}\n')]), text: '{"text":"你好"}\n' },
  ];
  try {
    for (const { name, bytes } of fixtures) writeFileSync(path.join(vault, name), bytes);
    await gotoNotes(page);
    for (const { name, bytes, text } of fixtures) {
      const file = path.join(vault, name);
      await treeItem(page, name).click();
      await expect(page.getByTestId("file-encoding-unsupported")).toBeVisible();
      await expect(page.locator(".ProseMirror[contenteditable=true], .cm-content[contenteditable=true]")).toHaveCount(0);
      const convert = page.getByRole("button", { name: "转换并保存为 UTF-8" });
      await expect(convert).toBeDisabled();
      await page.getByLabel("原文件编码").selectOption("gb18030");
      expect(readFileSync(file)).toEqual(bytes);
      await convert.click();
      await expect.poll(() => readFileSync(file)).toEqual(Buffer.from(text));
      const editor = name.endsWith(".md") ? prose(page) : page.locator(".cm-content");
      await expect(editor).toContainText("你好");
      await page.getByRole("button", { name: `关闭 ${name.replace(/\.md$/i, "")}`, exact: true }).click();
    }
  } finally {
    await close();
  }
});
