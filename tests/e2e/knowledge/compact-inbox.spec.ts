import { expect, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "./session-slow-bridge.js";

const captureBody = (page: Page) => page.locator(".inbox-knowledge-inbox-note");
const captureRow = (page: Page, title: string) => page.getByTestId("capture-item").filter({ has: page.getByText(title, { exact: true }) });
const openInbox = (page: Page) => page.getByRole("button", { name: "收件箱", exact: true }).first().click();
const editCapture = (page: Page) => page.getByRole("button", { name: "编辑收集条目" }).click();

async function copySelection(app: ElectronApplication, page: Page, body: Locator, selection: "all" | "inside" | "across" | "space" | "boundary" | "gap") {
  await body.evaluate((element, selection) => {
    const [first, last] = element.querySelectorAll("p");
    if (!first?.firstChild || !last?.firstChild) throw new Error("缺少选区段落");
    const range = document.createRange();
    if (selection === "all") range.selectNodeContents(element);
    else {
      const fromFirst = selection === "across" || selection === "boundary" || selection === "gap";
      const start = selection === "across" ? 2 : selection === "boundary" || selection === "gap" ? first.textContent.length : 6;
      const end = selection === "gap" ? 0 : selection === "across" ? 8 : selection === "boundary" ? 4 : selection === "space" ? 7 : 17;
      range.setStart(fromFirst ? first.firstChild : last.firstChild, start);
      range.setEnd(last.firstChild, end);
    }
    const current = window.getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
  }, selection);
  await app.evaluate(({ clipboard }) => clipboard.clear());
  await page.keyboard.press("ControlOrMeta+c");
  return app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    return {
      text: await clipboard.readText(),
      html: item?.types.includes("text/html") ? await (await item.getType("text/html")).text() : "",
    };
  });
}

test("G07 收件正文的普通段落与原 OK 阅读器复制两种 MIME 一致，富格式保持原节点", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await engineReady(page);
    writeFileSync(path.join(vault, "下一页.md"), "# 双链落点\n\n收件正文引用内容。\n");
    const text = "第一段自然语言。\n\nSecond paragraph for the inbox";
    const plain = await call<{ path: string }>(page, "inbox.capture", { title: "普通段落", body: text });
    // Frontmatter forces the unchanged OK reader. OK removes it before reading.
    await call(page, "inbox.capture", { title: "原 OK 阅读", body: `---\nprobe: true\n---\n\n${text}` });
    const rich = [
      ["格式", "有 **重点** 和 [链接](https://example.com)。", "strong", "重点"],
      ["列表", "- 第一项\n- 第二项", "ul > li:nth-child(2)", "第二项"],
      ["代码", "```js\nconst answer = 42\n```", "pre", "const answer = 42"],
      ["双链", "参见 [[下一页]]。", "[data-wiki-link]", "下一页"],
      ["空正文", "", "[data-compact-paragraphs] p", "这条记录还没有补充内容。"],
    ] as const;
    for (const [title, body] of rich) await call(page, "inbox.capture", { title, body });
    const file = path.join(vault, plain.path);
    const before = readFileSync(file, "utf8");

    await openInbox(page);
    await captureRow(page, "普通段落").click();
    const paragraphs = captureBody(page).locator("[data-compact-paragraphs]");
    await expect(paragraphs.locator("p")).toHaveText(text.split("\n\n"));
    await expect(paragraphs).toHaveAttribute("contenteditable", "false");
    const selections = ["all", "inside", "across", "boundary", "gap", "space"] as const;
    const observed = [];
    for (const selection of selections) observed.push(await copySelection(app, page, paragraphs, selection));
    expect(observed[0]?.text).toContain("第一段自然语言。");
    expect(observed[0]?.html).toContain("data-pm-slice");

    await captureRow(page, "原 OK 阅读").click();
    const ok = captureBody(page).locator(".ProseMirror");
    await expect(ok.locator("p")).toHaveText(text.split("\n\n"));
    for (const [i, selection] of selections.entries()) {
      expect(await copySelection(app, page, ok, selection), selection).toEqual(observed[i]);
    }

    for (const [title, , selector, expected] of rich) {
      await captureRow(page, title).click();
      await expect(captureBody(page).locator(selector).first()).toContainText(expected);
      if (title !== "空正文") await expect(ok).toHaveAttribute("contenteditable", "false");
      if (title === "格式") await expect(ok.getByRole("link", { name: /链接/ })).toHaveAttribute("href", "https://example.com");
    }
    // The projection for the last selected record wins even while a rich mount is pending.
    await captureRow(page, "双链").click();
    await captureRow(page, "普通段落").click();
    await expect(paragraphs.locator("p")).toHaveText(text.split("\n\n"));
    await expect(ok).toHaveCount(0);
    expect(readFileSync(file, "utf8")).toBe(before);
    await captureRow(page, "双链").click();

    const navigation = await page.evaluateHandle(() => {
      const url = new URL(location.href);
      url.searchParams.set("inbox-navigation", "probe");
      url.hash = "";
      history.replaceState(history.state, "", url);
      const observed = { href: location.href, timeOrigin: performance.timeOrigin, hashUrl: "" };
      window.addEventListener(
        "hashchange",
        (event) => {
          observed.hashUrl = event.newURL;
        },
        { once: true },
      );
      return observed;
    });
    const beforeNavigation = await navigation.jsonValue();
    const expectedHashUrl = new URL(beforeNavigation.href);
    expectedHashUrl.hash = `#/${encodeURIComponent("下一页")}`;
    await ok.locator("[data-wiki-link]").click();
    // OkRoot consumes the fragment, so observe the URL from the hashchange event.
    await expect.poll(() => navigation.evaluate(({ hashUrl }) => hashUrl)).toBe(expectedHashUrl.href);
    await expect(page.getByTestId("document-tabs").getByRole("button", { name: "下一页", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("markdown-editor")).toContainText("收件正文引用内容。");
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(beforeNavigation.timeOrigin);
    await expect(page).toHaveURL(beforeNavigation.href);
  } finally {
    await close();
  }
});

async function undoRedo(page: Page, editor: Locator, text: string, initial: string) {
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(text);
  await expect(editor).toHaveText(initial + text);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toHaveText(initial);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor).toHaveText(initial + text);
  await page.keyboard.press("ControlOrMeta+End");
}

async function compose(page: Page, editor: Locator, save: Locator, read: () => string) {
  const before = read();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "nihao", selectionStart: 5, selectionEnd: 5 });
  await expect(editor).toContainText("nihao");
  // A pointer click moves focus first, which can commit composition. Invoke
  // the real save action without blurring to exercise the in-composition guard.
  const write = page
    .waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/call") && ["inbox.update", "inbox.convert", "tasks.create", "tasks.update"].includes(request.postDataJSON()?.capability), { timeout: 600 })
    .catch(() => null);
  await save.evaluate((button: HTMLButtonElement) => button.click());
  expect(await write).toBeNull();
  await expect(editor).toBeVisible();
  expect(read()).toBe(before);
  await cdp.send("Input.insertText", { text: "你好" });
  await expect(editor).toContainText("你好");
  await cdp.send("Input.imeSetComposition", { text: "quxiao", selectionStart: 6, selectionEnd: 6 });
  await expect(editor).toContainText("quxiao");
  await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
  await expect(editor).not.toContainText(/nihao|quxiao/);
  await cdp.detach();
}

test("H05 收件想法 compact 保存、重开、@ 引用、撤销重做与 IME，取消不写盘", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "Reference.md"), "# 引用材料\n");
    await engineReady(page);
    const created = await call<{ path: string }>(page, "inbox.capture", { title: "需要编辑的想法", body: "开头" });
    const read = () => readFileSync(path.join(vault, created.path), "utf8");
    await openInbox(page);
    await captureRow(page, "需要编辑的想法").click();
    await editCapture(page);
    const dialog = page.getByRole("dialog", { name: "编辑收集条目" });
    const editor = dialog.getByLabel("内容", { exact: true });
    const save = dialog.getByRole("button", { name: "保存修改" });
    await undoRedo(page, editor, "改动", "开头");
    await compose(page, editor, save, read);
    await page.keyboard.press("End");
    await page.keyboard.type(" @Refer");
    await page
      .getByTestId("editor-ref-menu")
      .getByRole("option", { name: /Reference\.md/ })
      .click();
    await expect(editor).toContainText("Reference.md");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect.poll(read).toContain("开头改动你好 [[Reference.md]]");

    await page.reload();
    await engineReady(page);
    await openInbox(page);
    await captureRow(page, "需要编辑的想法").click();
    await editCapture(page);
    await expect(editor).toContainText("开头改动你好");
    await expect(editor).toContainText("Reference.md");
    const persisted = read();
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("取消的草稿");
    await expect(editor).toContainText("取消的草稿");
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
    await editCapture(page);
    await expect(editor).toContainText("Reference.md");
    await expect(editor).not.toContainText("取消的草稿");
    expect(read()).toBe(persisted);
    expect(persisted).not.toMatch(/nihao|quxiao/);
  } finally {
    await close();
  }
});

for (const convert of [false, true]) {
  test(`H05 ${convert ? "收件转任务" : "新建任务"}的描述可撤销重做，IME 提交后写入磁盘`, async () => {
    const { page, vault, close } = await openApp();
    try {
      await engineReady(page);
      const title = convert ? "从想法创建任务" : "新建描述测试任务";
      const initial = convert ? "想法原文" : "";
      if (convert) {
        await call(page, "inbox.capture", { title, body: initial });
        await openInbox(page);
        await captureRow(page, title).click();
        await page.getByRole("button", { name: /^转为任务/ }).click();
      } else {
        await page.getByRole("button", { name: "任务", exact: true }).first().click();
        await page.getByTestId("task-new").click();
        await page.getByLabel("任务名称").fill(title);
      }
      const dialog = page.getByTestId(convert ? "convert-dialog" : "task-editor");
      const editor = convert ? dialog.getByLabel("内容", { exact: true }) : dialog.getByTestId("task-body").locator(".ProseMirror");
      const save = convert ? dialog.getByRole("button", { name: "创建任务并完成处理" }) : dialog.getByTestId("task-save");
      const tasks = path.join(vault, "Tasks");
      const read = () =>
        existsSync(tasks)
          ? readdirSync(tasks)
              .filter((file) => file.endsWith(".md"))
              .map((file) => readFileSync(path.join(tasks, file), "utf8"))
              .join("\n")
          : "";
      await undoRedo(page, editor, "描述改动", initial);
      await compose(page, editor, save, read);
      await save.click();
      await expect(dialog).toBeHidden();
      await expect.poll(read).toContain(initial + "描述改动你好");
      expect(read()).not.toMatch(/nihao|quxiao/);

      await page.reload();
      await engineReady(page);
      await page.getByRole("button", { name: "任务", exact: true }).first().click();
      await page.getByRole("button", { name: `打开任务 ${title}` }).click();
      await page.getByTestId("detail-edit").click();
      await expect(page.getByTestId("task-body").locator(".ProseMirror")).toContainText(initial + "描述改动你好");
    } finally {
      await close();
    }
  });
}

test("H05 已有任务经 TaskEditor 输入、撤销、再次组合、保存与重开", async () => {
  const { page, vault, close } = await openApp();
  try {
    await engineReady(page);
    const title = "修改已有任务";
    const initial = "已有描述";
    await call(page, "tasks.create", { title, type: "human", body: initial });
    const openTask = async () => {
      await page.getByRole("button", { name: "任务", exact: true }).first().click();
      await page.getByRole("button", { name: `打开任务 ${title}` }).click();
      await page.getByTestId("detail-edit").click();
    };
    await openTask();
    const dialog = page.getByTestId("task-editor");
    const editor = dialog.getByTestId("task-body").locator(".ProseMirror");
    const save = dialog.getByTestId("task-save");
    const folder = path.join(vault, "Tasks");
    const filename = readdirSync(folder).find((entry) => entry.endsWith(".md"))!;
    const read = () => readFileSync(path.join(folder, filename), "utf8");
    await expect(editor).toHaveText(initial);
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("将被撤销");
    await expect(editor).toHaveText(initial + "将被撤销");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).toHaveText(initial);
    await page.keyboard.press("End");
    await compose(page, editor, save, read);
    await expect(editor).toHaveText(initial + "你好");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect.poll(read).toContain(initial + "你好");
    expect(read()).not.toMatch(/将被撤销|nihao|quxiao/);
    await page.reload();
    await engineReady(page);
    await openTask();
    await expect(editor).toHaveText(initial + "你好");
  } finally {
    await close();
  }
});
