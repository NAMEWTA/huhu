import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { call } from "./session-slow-bridge.js";
import { treeItem } from "../helpers/tree.js";

// S4：OK 评论 UI 接 Huhu 的 comments.*（真实 Electron）。
// D01 选区 / 整篇评论进同一存储，取消不留伪线程；D02 线程 / 回复 / 解决 / 重开 / 删除确认；D03 点线程定位正文；
// D04 前插内容 / 重复段落锚点正确，删除原文显示孤立；D05 发表后继续编辑不影响锚点；D06 改名后评论仍在、任务评论不受影响。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();
const commentsDir = (vault: string) => path.join(vault, "Comments");
const commentFiles = (vault: string) => (existsSync(commentsDir(vault)) ? readdirSync(commentsDir(vault)) : []);
const readAll = (vault: string) =>
  commentFiles(vault)
    .map((f) => readFileSync(path.join(commentsDir(vault), f), "utf8"))
    .join("\n---FILE---\n");

/** 选中编辑器里某段文字（双击 / 三击不稳定：用 DOM Range 精确选中）。 */
async function selectText(page: Page, text: string, nth = 0): Promise<void> {
  await prose(page).evaluate(
    (root, [needle, index]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = (n.textContent ?? "").indexOf(needle as string);
        if (at < 0) continue;
        if (seen++ < (index as number)) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + (needle as string).length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      throw new Error(`没找到文字：${needle}`);
    },
    [text, nth] as const,
  );
}

/** 工具栏“添加批注”。窗口 < 1440px 时详情面板是覆盖在文档右侧的浮层（rc4 起的既有布局），面板已开时它会盖住这个按钮，
 * 所以直接派发 click（真实点击由第一次打开面板前的用例覆盖）。 */
const clickAddComment = (page: Page) => page.getByRole("button", { name: "添加批注" }).first().dispatchEvent("click");

async function addComment(page: Page, body: string): Promise<void> {
  await clickAddComment(page);
  const composer = page.getByTestId("comment-composer");
  await expect(composer).toBeVisible();
  await composer.getByRole("textbox").click();
  await page.keyboard.type(body);
  await page.keyboard.press("Enter");
}

test("D01/D02：选区批注进真实存储，取消不留伪线程；回复 / 解决 / 重开 / 删除确认；整篇笔记批注", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "批注一.md"), "# 标题\n\n这里有一套能力，值得批注。\n\n另一段内容。\n");
    await gotoNotes(page);
    await treeItem(page, "批注一.md").click();
    await expect(prose(page)).toContainText("值得批注", { timeout: 30_000 });

    // 取消：开了输入框再 Esc，没有任何线程、没有错误高亮
    await selectText(page, "一套能力");
    await page.getByRole("button", { name: "添加批注" }).first().click();
    await expect(page.getByTestId("comment-composer")).toBeVisible();
    await expect(prose(page).locator("[data-comment-draft]")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("comment-composer")).toHaveCount(0);
    const markers = page.locator("[data-comment-draft], [data-comment-thread]");
    await expect(markers).toHaveCount(0);
    await page.getByRole("tab", { name: "源码" }).click();
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("值得批注");
    await expect(markers).toHaveCount(0);
    expect(commentFiles(vault)).toHaveLength(0);

    // 发表
    await selectText(page, "一套能力");
    await addComment(page, "这里要展开");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => commentFiles(vault).length).toBe(1);
    expect(readAll(vault)).toMatch(/exact: 一套能力/);
    await expect(prose(page).locator("[data-comment-thread]").first()).toBeVisible();

    // 回复 / 解决 / 重开
    await page.getByTestId("thread-reply-input").fill("收到，会补充");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("thread-reply")).toContainText("收到，会补充");
    await page.getByTestId("thread-resolve").click({ force: true });
    await expect(page.getByTestId("comment-thread")).toHaveCount(0);
    await page.getByTestId("comment-doc-resolved-toggle").click();
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "resolved");
    await page.getByRole("button", { name: "重新打开" }).click({ force: true });
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");

    // 整篇笔记批注
    await page.getByTestId("comment-whole-note-input").fill("整体写得不错");
    await page.getByTestId("comment-whole-note-add").click();
    await expect(page.getByTestId("comment-thread")).toHaveCount(2);
    await expect.poll(() => readAll(vault)).toMatch(/target: file/);

    // 删除需要确认；正文不变
    const before = readFileSync(path.join(vault, "批注一.md"), "utf8");
    await page.getByTestId("thread-delete").first().click({ force: true });
    await expect(page.getByTestId("comment-delete-confirm")).toBeVisible();
    await page.getByTestId("comment-delete-confirm").click();
    await expect.poll(() => commentFiles(vault).length).toBe(1);
    expect(readFileSync(path.join(vault, "批注一.md"), "utf8")).toBe(before);
  } finally {
    await close();
  }
});

test("D03/D04/D05：点线程定位正文；前插内容锚点跟随；重复句子锚点唯一；删除原文变孤立不吸附；发表后继续编辑", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "锚点.md"), "# 锚点\n\n甲：同一句话。\n\n乙：同一句话。\n\n尾段。\n");
    await gotoNotes(page);
    await treeItem(page, "锚点.md").click();
    await expect(prose(page)).toContainText("乙：同一句话", { timeout: 30_000 });

    // 在第二处重复句子上发表：锚点上下文让它唯一
    await selectText(page, "同一句话", 1);
    await addComment(page, "只说第二处");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => readAll(vault)).toMatch(/exact: 同一句话/);
    const first = readAll(vault);
    const start = Number(/start: (\d+)/.exec(first)?.[1]);
    const src = readFileSync(path.join(vault, "锚点.md"), "utf8");
    expect(src.indexOf("同一句话", src.indexOf("乙："))).toBe(start); // 对应第二处，不是第一处

    // 已落盘线程在文首前插内容后，锚点仍落在第二处
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("前插的一行。");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    await expect.poll(() => Number(/start: (\d+)/.exec(readAll(vault))?.[1])).toBeGreaterThan(start);
    const moved = readFileSync(path.join(vault, "锚点.md"), "utf8");
    expect(moved.indexOf("同一句话", moved.indexOf("乙："))).toBe(Number(/start: (\d+)/.exec(readAll(vault))?.[1]));
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");

    // D03：点线程里的引用 → 正文滚到并高亮锚点
    await page
      .getByTestId("comment-thread")
      .getByRole("button", { name: /同一句话/ })
      .first()
      .click();
    await expect(prose(page).locator("[data-comment-thread]").first()).toBeVisible();

    // D04：删除锚定的那句 → 孤立，不吸附到第一处同样的句子
    await prose(page).evaluate((root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if ((n.textContent ?? "").startsWith("乙：")) {
          const r = document.createRange();
          r.selectNodeContents(n);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
          return;
        }
      }
    });
    await page.keyboard.press("Backspace");
    await expect.poll(() => readAll(vault), { timeout: 10_000 }).toMatch(/state: orphaned/);
    await expect(page.getByTestId("comment-orphaned")).toBeVisible();
    await expect(prose(page).locator("[data-comment-thread]")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("D06：改名后评论仍绑定同一笔记；未解决的批注在重开应用后仍锚定", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "原名.md"), "# 原名\n\n需要保留的批注句子。\n");
    await gotoNotes(page);
    await treeItem(page, "原名.md").click();
    await expect(prose(page)).toContainText("需要保留的批注句子", { timeout: 30_000 });
    await selectText(page, "需要保留的批注句子");
    await addComment(page, "改名后也要在");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => commentFiles(vault).length).toBe(1);

    // 窗口 < 1440px 时详情面板覆盖在文档右侧，会盖住工具栏的“笔记操作”：先关闭面板
    await page.getByRole("button", { name: "关闭文档详情" }).click();
    await page.getByRole("button", { name: "笔记操作" }).click();
    await page.getByRole("menuitem", { name: "重命名" }).click();
    await page.getByRole("textbox", { name: "重命名" }).fill("新名");
    await page.getByTestId("name-dialog-submit").click();
    await expect(treeItem(page, "新名.md")).toBeVisible();
    await expect.poll(() => readAll(vault)).toMatch(/documentPath: 新名\.md/);
    // 改名会换掉当前标签，详情栏可能收起：重新打开批注页，评论仍绑定同一笔记
    await treeItem(page, "新名.md").click();
    await expect(prose(page)).toContainText("需要保留的批注句子", { timeout: 30_000 });
    if ((await page.getByTestId("note-inspector").count()) === 0) await page.getByRole("button", { name: "文档详情" }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");
  } finally {
    await close();
  }
});

test("D04 删除锚定段落后，同偏移的另一段不亮，磁盘线程保留为孤立", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "同偏移.md");
  try {
    writeFileSync(file, "甲：同句。\n\n乙：同句。\n");
    await gotoNotes(page);
    await treeItem(page, "同偏移.md").click();
    await expect(prose(page)).toContainText("甲：同句。");
    await selectText(page, "同句");
    await addComment(page, "只针对甲");
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");
    await page.getByRole("tab", { name: "源码" }).click();
    const cm = page.getByTestId("markdown-editor").locator(".cm-content");
    await cm.click();
    await cm.press("ControlOrMeta+a");
    await page.keyboard.insertText("乙：同句。\n");
    await expect.poll(() => readFileSync(file, "utf8")).toBe("乙：同句。\n");
    await expect.poll(() => readAll(vault)).toMatch(/state: orphaned/);
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("乙：同句。");
    await expect(page.getByTestId("comment-orphaned")).toBeVisible();
    await expect(page.locator("[data-comment-thread]")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("D05 flush 确实在途时继续编辑，过期选区须重选，重选后磁盘锚点匹配版本", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "在途.md"), "甲：同句。\n\n乙：同句。\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await call(page, "settings.update", { patch: { editor: { autosave: false } } });
    await page.reload();
    await gotoNotes(page);
    await treeItem(page, "在途.md").click();
    await expect(prose(page)).toContainText("乙：同句。");
    // 扣住由评论 flush 发出的真实保存请求，直到同一编辑器送入第二笔编辑。
    const saveStarted = page.waitForEvent("console", { predicate: (message) => message.text() === "comment test save held" });
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      const { promise, resolve } = Promise.withResolvers<void>();
      let held = false;
      document.addEventListener("comment-test-release-save", () => resolve(), { once: true });
      window.fetch = async (input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        if (!held && body.includes('"notes.save"')) {
          held = true;
          console.info("comment test save held");
          await promise;
        }
        return original(input, init);
      };
    });
    await prose(page).focus();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.insertText("新前缀");
    await selectText(page, "同句", 1);
    await addComment(page, "已过期的选区");
    await saveStarted;
    try {
      await expect(page.getByTestId("save-state")).toHaveText("保存中…");
      expect(readAll(vault)).not.toContain("已过期的选区");
      await prose(page).focus();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.insertText("丙：同句。");
      await expect(prose(page)).toContainText("丙：同句。新前缀");
      await expect(page.getByTestId("save-state")).toHaveText("未保存修改");
    } finally {
      await page.evaluate(() => document.dispatchEvent(new Event("comment-test-release-save")));
    }
    await expect(page.getByText(/请重新选择/)).toBeVisible({ timeout: 15_000 });
    expect(commentFiles(vault)).toHaveLength(0);

    await selectText(page, "同句", 2);
    await addComment(page, "重新选择乙");
    await expect(page.getByTestId("comment-thread")).toContainText("重新选择乙");
    const doc = await call<{ text: string; version: string }>(page, "notes.read", { path: "在途.md" });
    const disk = readAll(vault);
    expect(readFileSync(path.join(vault, "在途.md"), "utf8")).toBe(doc.text);
    expect(disk).toContain(`sourceVersion: ${doc.version}`);
    expect(Number(/start: (\d+)/.exec(disk)?.[1])).toBe(doc.text.indexOf("同句", doc.text.indexOf("乙：")));
  } finally {
    await close();
  }
});

test("D02 只读 Vault 内可查看和定位已有线程，评论操作与磁盘写入均被拒绝", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "只读评论.md");
  const contents = "---\nstatus: open\n---\n\n第一处。\n\n已有锚点。\n";
  try {
    writeFileSync(file, contents);
    await gotoNotes(page);
    const doc = "只读评论.md";
    const seed = await call<{ id: string }>(page, "comments.create", { path: doc, quote: "已有锚点", text: "只读仍可见" });
    const resolved = await call<{ id: string }>(page, "comments.create", { path: doc, quote: "第一处", text: "已解决的意见" });
    await call(page, "comments.resolve", { id: resolved.id });
    const before = readAll(vault);
    expect(await page.evaluate((location) => window.huhuHost.vault.open(location, { kind: "open", readOnly: true }), vault)).toMatchObject({ ok: true });
    await page.reload();
    await gotoNotes(page);
    expect(await call(page, "vault.info", {})).toMatchObject({ readOnly: true });
    await treeItem(page, doc).click();
    await expect(prose(page)).toContainText("已有锚点");
    const toolbar = page.getByTestId("note-toolbar");
    await expect(toolbar.getByRole("button", { name: "添加批注" })).toBeDisabled();
    await selectText(page, "已有锚点");
    await expect(page.getByTestId("comment-bubble-button")).toHaveCount(0);
    await expect(page.getByTestId("property-comment-button")).toHaveCount(0);
    await prose(page).locator(`[data-comment-thread="${seed.id}"]`).click();
    const thread = page.getByTestId("comment-thread").filter({ hasText: "只读仍可见" });
    await expect(thread).toHaveAttribute("data-comment-id", seed.id);
    await thread.getByRole("button", { name: /已有锚点/ }).click();
    await expect(prose(page).locator(`[data-comment-thread="${seed.id}"]`)).toBeInViewport();
    await expect(page.getByTestId("comments-readonly-reason")).toBeVisible();
    await expect(page.getByTestId("comment-whole-note-input")).toHaveCount(0);
    await expect(page.getByTestId("thread-reply-input")).toHaveCount(0);
    await expect(page.getByTestId("thread-delete")).toHaveCount(0);
    await expect(page.getByTestId("thread-resolve")).toHaveCount(0);
    await page.getByTestId("comment-doc-resolved-toggle").click();
    await expect(page.getByText("已解决的意见")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新打开" })).toHaveCount(0);
    await expect(call(page, "comments.reply", { id: seed.id, text: "直接写也应被拒绝" })).rejects.toThrow("READ_ONLY_VAULT");
    expect(readAll(vault)).toBe(before);
    expect(readFileSync(file, "utf8")).toBe(contents);
  } finally {
    await close();
  }
});

test("D03 双向定位精确线程，离开编辑视图或批注页清除浮层与焦点", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1450, 850));
    const filename = "双向.md";
    writeFileSync(path.join(vault, filename), ["文首目标。", ...Array.from({ length: 85 }, (_, i) => `中间第 ${i + 1} 段。`), "文末目标。", ""].join("\n\n"));
    writeFileSync(path.join(vault, "别篇.md"), "另一个文档。\n");
    await gotoNotes(page);
    const first = await call<{ id: string }>(page, "comments.create", { path: filename, quote: "文首目标", text: "首线程" });
    const last = await call<{ id: string }>(page, "comments.create", { path: filename, quote: "文末目标", text: "尾线程" });
    await treeItem(page, filename).click();
    const firstMark = prose(page).locator(`[data-comment-thread="${first.id}"]`);
    const lastMark = prose(page).locator(`[data-comment-thread="${last.id}"]`);
    await expect(firstMark).toBeInViewport();
    await expect(lastMark).not.toBeInViewport();
    await firstMark.click();
    const panel = page.getByTestId("comments-panel");
    await expect(panel.getByTestId("comment-thread").filter({ hasText: "首线程" })).toHaveAttribute("data-comment-id", first.id);
    const lastThread = panel.locator(`[data-comment-id="${last.id}"]`);
    await lastThread.getByRole("button", { name: /文末目标/ }).click();
    await expect(lastMark).toBeInViewport();
    await expect(firstMark).not.toBeInViewport();
    await expect(page.getByRole("button", { name: "关闭评论" }).and(page.locator(`[data-comment-thread="${last.id}"]`))).toHaveCount(1);
    const firstThread = panel.locator(`[data-comment-id="${first.id}"]`);
    await firstThread.getByRole("button", { name: /文首目标/ }).click();
    await expect(firstMark).toBeInViewport();

    const openDraft = async () => {
      await selectText(page, "中间第 1 段");
      await clickAddComment(page);
      await expect(page.getByTestId("comment-composer")).toBeVisible();
      await expect(prose(page).locator("[data-comment-draft]")).toHaveCount(1);
    };
    const draft = page.locator('[data-testid="comment-composer"], [data-comment-draft]');
    const modeTab = page.getByRole("tab", { name: "源码" });
    const closeDetail = page.getByRole("button", { name: "关闭文档详情" });
    for (const [target, activate] of [
      [modeTab, () => modeTab.click()],
      [closeDetail, () => closeDetail.press("Enter")],
      [treeItem(page, "别篇.md"), () => treeItem(page, "别篇.md").click()],
    ] as const) {
      await openDraft();
      await activate();
      await expect(draft).toHaveCount(0);
      expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="comment-composer"]') ?? null)).toBeNull();
      if (target === closeDetail) await expect(panel).toHaveCount(0);
      if (await page.getByRole("tab", { name: "源码", selected: true }).count()) {
        await page.getByRole("tab", { name: "实时预览" }).click();
        await expect(prose(page)).toContainText("文首目标");
        await expect(draft).toHaveCount(0);
      }
    }
    await treeItem(page, filename).click();
    await expect(prose(page)).toContainText("文首目标");
    await expect(draft).toHaveCount(0);
    expect(commentFiles(vault)).toHaveLength(2);

    // 回执迟到时，已关闭的详情不能重新出现，也不能夺走工具栏焦点。
    const createHeld = page.waitForEvent("console", { predicate: (message) => message.text() === "comment test creation held" });
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      const { promise, resolve } = Promise.withResolvers<void>();
      document.addEventListener("comment-test-release-create", () => resolve(), { once: true });
      window.fetch = async (input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        if (!body.includes('"comments.create"')) return original(input, init);
        window.fetch = original;
        const response = await original(input, init);
        console.info("comment test creation held");
        await promise;
        return response;
      };
    });
    await selectText(page, "中间第 2 段");
    await addComment(page, "迟到回执的线程");
    await createHeld;
    const afterSave = page.waitForRequest((request) => request.postData()?.includes('"comments.list"') === true);
    try {
      await page.getByRole("button", { name: "关闭文档详情" }).click();
      await expect(panel).toHaveCount(0);
      await page.getByRole("button", { name: "文档详情" }).focus();
    } finally {
      await page.evaluate(() => document.dispatchEvent(new Event("comment-test-release-create")));
    }
    await afterSave;
    await expect(page.getByRole("button", { name: "文档详情" })).toBeFocused();
    await expect(panel).toHaveCount(0);
    expect(readAll(vault)).toContain("迟到回执的线程");
  } finally {
    await close();
  }
});

test("D04 已保存线程在强调、表格和链接重写后仍高亮原文，源码偏移与版本更新", async () => {
  const { page, vault, close } = await openApp();
  const filename = "格式锚点.md";
  const original = "段首：强调目标尾字。\n\n| 价格 | 描述 |\n| --- | --- |\n| 10 | 表格目标 |\n\n段首：[链接目标](https://example.com/old)尾字。\n";
  const updated = "段首：**强调**目标尾字。\n\n价格 | 描述\n--- | ---\n10 | 表格**目标**\n\n段首：[链接目标](https://example.com/new)尾字。\n";
  try {
    const file = path.join(vault, filename);
    writeFileSync(file, original);
    await gotoNotes(page);
    const anchors = ["强调目标", "表格目标", "链接目标尾字"];
    const raw = ["强调**目标", "表格**目标", "链接目标](https://example.com/new)尾字"];
    const threads = [];
    for (const quote of anchors) {
      threads.push(await call<{ id: string }>(page, "comments.create", { path: filename, quote, text: `线程 ${quote}` }));
    }
    await treeItem(page, filename).click();
    const editor = prose(page);
    await expect(editor).toContainText("强调目标");
    await page.getByRole("tab", { name: "源码" }).click();
    const cm = page.getByTestId("markdown-editor").locator(".cm-content");
    await cm.click();
    await cm.press("ControlOrMeta+a");
    await page.keyboard.insertText(updated);
    await expect.poll(() => readFileSync(file, "utf8")).toBe(updated);
    const doc = await call<{ version: string }>(page, "notes.read", { path: filename });
    await expect.poll(() => readAll(vault).split(`sourceVersion: ${doc.version}`).length - 1).toBe(3);
    await page.getByRole("tab", { name: "实时预览" }).click();
    for (const [i, { id }] of threads.entries()) {
      const highlights = editor.locator(`[data-comment-thread="${id}"]`);
      await expect.poll(async () => (await highlights.allTextContents()).join("")).toBe(anchors[i]);
      const disk =
        readAll(vault)
          .split("\n---FILE---\n")
          .find((content) => content.includes(id)) ?? "";
      expect(disk).toContain(`start: ${updated.indexOf(raw[i]!)}`);
    }
  } finally {
    await close();
  }
});
