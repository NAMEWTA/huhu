import { chromium, expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../e2e/helpers/launch.js";
import { treeItem } from "../e2e/helpers/tree.js";

type Side = "ok" | "huhu";
type StepState = { status: "observed" | "failed"; value?: unknown; error?: string };

const viewport = { width: 1440, height: 900 };
const fixtures = {
  tabs: "# Tab parity\n\nLeft tab\n",
  slash: "# Slash parity\n\nSlash anchor\n",
  comments: "# Comment parity\n\nAnchor sentence to discuss.\n\nUnrelated paragraph.\n",
  "block-type": "# Block type parity\n\nConvert this block\n",
  footnote: "# Footnote parity\n\nFootnote content\n",
  table: "# Table parity\n\n| Name | Value |\n| --- | --- |\n| First row | 1 |\n| Second row | 2 |\n| Third row | 3 |\n",
  link: "# Link parity\n\n[Edit link](https://example.com/old)\n",
};
type Feature = keyof typeof fixtures;

type Surface = {
  side: Side;
  page: Page;
  editor: Locator;
  file: string;
  capture(step: string, action: () => Promise<unknown>): Promise<void>;
};

const output = process.env["PARITY_OK_OUTPUT"];
const base = process.env["PARITY_OK_URL"];
const okContent = process.env["PARITY_OK_CONTENT"];
const enabled = (process.env["PARITY_OK_SIDE"] ?? "both") as Side | "both";

async function selectLine(editor: Locator, page: Page, line: string): Promise<void> {
  await editor.getByText(line, { exact: true }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(line);
}

async function diskContains(file: string, value: string | RegExp): Promise<void> {
  const disk = expect.poll(() => readFileSync(file, "utf8"));
  if (typeof value === "string") await disk.toContain(value);
  else await disk.toMatch(value);
}

async function slash({ editor, page, capture, file }: Surface): Promise<void> {
  const menu = page.getByRole("listbox", { name: /Slash commands|斜杠命令/ });
  const options = menu.getByRole("option");
  const lastBlock = editor.locator(":scope > :last-child");
  const selectLastBlock = async (collapse: boolean) => {
    await editor.focus();
    await lastBlock.evaluate((node, atEnd) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (atEnd) range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }, collapse);
  };
  const show = async (query = "") => {
    await selectLastBlock(true);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("/" + query);
    await expect(lastBlock).toHaveText("/" + query);
  };
  const names = () => options.allTextContents();
  const clean = async () => {
    await page.keyboard.press("Escape");
    if ((await lastBlock.textContent())?.startsWith("/")) {
      await selectLastBlock(false);
      await page.keyboard.press("Backspace");
      await expect(lastBlock).not.toHaveText(/^\//);
    }
    await expect(menu).toBeHidden();
  };
  await capture("categories-and-order", async () => {
    await show();
    await expect(menu).toBeVisible();
    const groups = await menu.getByRole("group").evaluateAll((items) =>
      items.map((item) => ({
        name: item.firstElementChild?.textContent?.trim(),
        options: [...item.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim()),
      })),
    );
    await page.keyboard.press("ArrowDown");
    const selected = await menu.locator('[aria-selected="true"]').textContent();
    await page.keyboard.press("ArrowUp");
    const previous = await menu.locator('[aria-selected="true"]').textContent();
    const preview = page.locator(".ok-suggestion-preview:visible");
    return { groups, selected, previous, preview: (await preview.count()) ? await preview.textContent() : null };
  });
  await clean();

  for (const [key, query] of [
    ["english", "accordion"],
    ["chinese", "折叠"],
    ["alias", "h2"],
    ["no-results", "zzzzparitynoresult"],
  ]) {
    await capture(key, async () => {
      await show(query);
      const status = page.getByText(/^(No results|无结果|没有结果)$/).first();
      await expect(menu.or(status)).toBeVisible();
      return { query, options: await names(), status: (await status.isVisible()) ? await status.textContent() : null };
    });
    await clean();
  }

  for (const key of ["Enter", "Tab", "Mouse"] as const) {
    await capture(key.toLowerCase(), async () => {
      await show("heading");
      await expect(menu).toBeVisible();
      const option = options.filter({ hasText: /^(Heading 2|二级标题)$/ }).first();
      if (key === "Mouse") await option.click();
      else {
        const index = await option.evaluate((node) => [...node.closest('[role="listbox"]')!.querySelectorAll('[role="option"]')].indexOf(node));
        for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
        await page.keyboard.press(key);
      }
      await expect(menu).toBeHidden();
      await page.keyboard.insertText("Chosen by " + key);
      await expect(editor.getByRole("heading", { level: 2, name: "Chosen by " + key })).toBeVisible();
      await diskContains(file, "## Chosen by " + key);
      return { selected: "Heading 2", mark: await editor.getByRole("heading", { name: "Chosen by " + key }).evaluate((node) => node.outerHTML) };
    });
    await clean();
  }

  await capture("escape", async () => {
    await show("heading");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    return { focused: await editor.evaluate((node) => document.activeElement === node), lastBlock: await editor.evaluate((node) => node.lastElementChild?.textContent) };
  });
  await clean();

  await capture("viewport-edge", async () => {
    await selectLastBlock(true);
    for (let i = 0; i < 35; i++) {
      await page.keyboard.press("Enter");
      await page.keyboard.insertText("Filler " + (i + 1));
    }
    await show();
    await expect(menu).toBeVisible();
    const menuRect = await menu.boundingBox();
    const caret = await editor.evaluate(() => window.getSelection()?.getRangeAt(0).getBoundingClientRect().toJSON());
    const viewportSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    return { menuRect, caret, viewport: viewportSize, fits: !!menuRect && menuRect.y >= 0 && menuRect.x >= 0 && menuRect.y + menuRect.height <= viewportSize.height && menuRect.x + menuRect.width <= viewportSize.width };
  });
  await clean();
  await diskContains(file, /^# Slash parity\n\nSlash anchor$/m);
  await diskContains(file, /\nFiller 35\s*$/);
}

const neighborName = "parity-tab-neighbor.md";

async function tabs({ side, page, capture }: Surface): Promise<void> {
  const huhu = side === "huhu";
  const left = huhu ? page.getByTestId("document-tab").filter({ hasText: "parity-tabs" }) : page.getByRole("button", { name: "parity-tabs.md", exact: true });
  const right = huhu ? page.getByTestId("document-tab").filter({ hasText: "parity-tab-neighbor" }) : page.getByRole("button", { name: neighborName, exact: true });
  const menu = page.getByRole("menu");
  await capture("context-menu", async () => {
    await (huhu ? treeItem(page, neighborName) : page.getByRole("treeitem", { name: neighborName, exact: true })).click();
    await expect(right).toBeVisible();
    await left.click({ button: "right" });
    await expect(menu).toBeVisible();
    return { items: await menu.getByRole("menuitem").allTextContents() };
  });
  await page.keyboard.press("Escape");
  await capture("keyboard-and-escape", async () => {
    await left.press("Shift+F10");
    await expect(menu).toBeVisible();
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    return { focused, restored: await left.evaluate((node) => document.activeElement === node) };
  });
  await capture("close-others", async () => {
    await left.click({ button: "right" });
    await menu.getByRole("menuitem", { name: /^(Close others|关闭其他)$/ }).click();
    await expect(right).toHaveCount(0);
    await expect(left).toBeVisible();
    return { left: await left.count(), right: await right.count() };
  });
}

async function blockType({ editor, page, capture, file }: Surface): Promise<void> {
  await capture("open-and-choose-heading-2", async () => {
    await selectLine(editor, page, "Convert this block");
    await page.getByRole("button", { name: /^(Text|文本)$/ }).click();
    const menu = page.getByRole("menu");
    const options = await menu.getByRole("menuitem").allTextContents();
    await menu.getByRole("menuitem", { name: /Heading 2|二级标题/ }).click();
    await expect(editor.getByRole("heading", { level: 2, name: "Convert this block" })).toBeVisible();
    await diskContains(file, "## Convert this block");
    return { options, heading: await editor.locator("h2").textContent() };
  });
}

async function footnote({ editor, page, capture, file }: Surface): Promise<void> {
  await capture("convert-selection", async () => {
    await selectLine(editor, page, "Footnote content");
    await page.getByTestId("footnote-bubble-button").click();
    const ref = editor.locator("sup[data-footnote-ref]");
    const definition = editor.locator("[data-footnote-def]");
    await expect(ref).toBeVisible();
    await expect(definition).toContainText("Footnote content");
    await diskContains(file, /^\[\^[^\]]+\]: Footnote content/m);
    const id = await ref.getAttribute("data-footnote-id");
    return { ref: id, definition: await definition.getAttribute("data-footnote-id"), matches: id === (await definition.getAttribute("data-footnote-id")), text: await definition.textContent() };
  });
}

async function table({ editor, page, capture, file }: Surface): Promise<void> {
  await capture("drag-second-row-below-third", async () => {
    const start = editor.getByRole("cell", { name: "Second row", exact: true });
    const target = editor.getByRole("cell", { name: "Third row", exact: true });
    await start.getByText("Second row", { exact: true }).click();
    const handle = page.getByRole("button", { name: /Row options|行选项/ });
    await expect(handle).toBeVisible();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("Missing row geometry");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 5, to.y + to.height - 1, { steps: 10 });
    await page.mouse.up();
    const rows = editor.getByRole("row");
    await expect(rows).toHaveText([/Name.*Value/, /First row.*1/, /Third row.*3/, /Second row.*2/]);
    await diskContains(file, /First row[^\n]*\n[^\n]*Third row[^\n]*\n[^\n]*Second row/);
    return { rows: await rows.allTextContents() };
  });
}

async function link({ editor, page, capture, file }: Surface): Promise<void> {
  const input = page.getByLabel(/^(Link URL|链接 URL|链接地址)$/);
  await capture("shortcut", async () => {
    await selectLine(editor, page, "Edit link");
    await page.keyboard.press("Control+k");
    const palette = page.getByText("搜索与命令", { exact: true });
    const dialog = page.getByRole("dialog", { name: /^(Edit markdown link|编辑 markdown 链接)$/ });
    await expect.poll(async () => (await dialog.isVisible()) || (await input.isVisible()) || (await palette.isVisible())).toBe(true);
    const properties = await dialog.isVisible();
    const bubble = await input.isVisible();
    if (bubble) await expect(input).toBeFocused();
    const initialUrl = properties ? await dialog.locator("input").first().inputValue() : bubble ? await input.inputValue() : null;
    return { properties, bubble, initialUrl, searchPalette: await palette.isVisible() };
  });
  await page.keyboard.press("Escape");
  if (await input.isVisible()) await page.keyboard.press("Escape");
  await capture("edit-existing-destination", async () => {
    await selectLine(editor, page, "Edit link");
    if (!(await input.isVisible())) await page.getByRole("button", { name: /^(Insert link|插入链接)$/ }).click();
    await expect(input).toBeVisible();
    const initialUrl = await input.inputValue();
    await input.fill("https://example.com/new");
    await input.press("Enter");
    await diskContains(file, "[Edit link](https://example.com/new)");
    const mark = editor.getByText("Edit link", { exact: true }).first();
    await expect(mark).toBeVisible();
    return { initialUrl, markup: await mark.evaluate((node) => node.outerHTML), markdownUpdated: true };
  });
}

async function comments({ editor, page, side, capture }: Surface): Promise<void> {
  const huhu = side === "huhu";
  const bodyText = "Compare **bold** detail.";
  const reply = "Follow-up **reply**.";
  const body = page.getByTestId("thread-comment-body");
  const thread = huhu ? page.getByTestId("comment-thread") : body;
  const highlight = editor.locator("[data-comment-thread]");
  const marker = page.getByRole("button", { name: /^(Open comment|Close comment|打开批注|关闭批注|打开评论|关闭评论)$/ });
  const resolvedToggle = huhu ? page.getByTestId("comment-doc-resolved-toggle") : page.getByRole("button", { name: /Show resolved comments|显示已解决的评论/ });
  const deleteButton = huhu ? page.getByTestId("thread-delete") : page.getByRole("button", { name: /Delete this comment|删除这条评论/ });
  await capture("create-and-highlight", async () => {
    await selectLine(editor, page, "Anchor sentence to discuss.");
    await page.getByTestId("comment-bubble-button").click();
    const input = page.getByTestId("comment-composer").getByRole("textbox");
    await input.fill(bodyText);
    await input.press("Enter");
    await expect(highlight).toHaveText("Anchor sentence to discuss.");
    await expect(marker).toHaveCount(1);
    return { highlight: await highlight.evaluate((node) => node.outerHTML), markerCount: await marker.count() };
  });
  await capture("edge-marker", async () => {
    const name = await marker.getAttribute("aria-label");
    await marker.click();
    await expect(body).toContainText("Compare");
    await expect(marker).toHaveAccessibleName(/^(Close comment|关闭评论|关闭批注)$/);
    return { available: true, name, activeName: await marker.getAttribute("aria-label"), thread: await body.textContent() };
  });
  await capture("open-thread-and-render-markdown", async () => {
    await highlight.click();
    await expect(body).toContainText("Compare");
    return { text: await body.textContent(), strong: await body.locator("strong").allTextContents() };
  });
  await capture("reply", async () => {
    const input = huhu ? page.getByTestId("thread-reply-input") : page.getByRole("textbox", { name: /^(Reply|回复)/ });
    if (!(await input.count())) return { available: false };
    await input.fill(reply);
    await input.press("Enter");
    const posted = page.getByTestId("thread-reply");
    await expect(posted).toContainText("Follow-up");
    return { available: true, text: await posted.textContent(), strong: await posted.locator("strong").allTextContents() };
  });
  await capture("resolve", async () => {
    const resolve = huhu ? page.getByTestId("thread-resolve") : page.getByRole("button", { name: /^(Resolve|解决|标记为已解决)$/ });
    if (!(await resolve.count())) return { available: false };
    await resolve.press("Enter");
    await expect(thread).toHaveCount(0);
    return { available: true, activeThreadCount: await thread.count() };
  });
  await capture("filter-resolved", async () => {
    if (!(await resolvedToggle.count())) return { available: false };
    await resolvedToggle.click();
    await expect(thread).toBeVisible();
    return { available: true, state: await thread.getAttribute("data-state"), text: await thread.textContent() };
  });
  await capture("reopen", async () => {
    const reopen = page.getByRole("button", { name: /^(Reopen|重新打开)$/ });
    if (!(await reopen.count())) return { available: false };
    await reopen.press("Enter");
    if (huhu) await expect(thread).toHaveAttribute("data-state", "anchored");
    return { available: true, text: await thread.textContent() };
  });
  await capture("delete-confirmation", async () => {
    await deleteButton.press("Enter");
    const confirm = huhu ? page.getByTestId("comment-delete-confirm") : page.getByRole("alertdialog").getByRole("button", { name: /Delete|Confirm|删除|确认/ });
    await expect.poll(async () => (await confirm.isVisible()) || (await thread.count()) === 0).toBe(true);
    return { confirmation: await confirm.isVisible(), remainingBeforeConfirm: await thread.count() };
  });
  await capture("delete-thread", async () => {
    const confirm = huhu ? page.getByTestId("comment-delete-confirm") : page.getByRole("alertdialog").getByRole("button", { name: /Delete|Confirm|删除|确认/ });
    if (await confirm.isVisible()) await confirm.press("Enter");
    await expect(thread).toHaveCount(0);
    await expect(editor.locator("[data-comment-thread]")).toHaveCount(0);
    return { threadCount: await thread.count(), highlightCount: await editor.locator("[data-comment-thread]").count() };
  });
}

const actions: Record<Feature, (surface: Surface) => Promise<void>> = { tabs, slash, comments, "block-type": blockType, footnote, table, link };

async function withEvidence(side: Side, feature: Feature, file: string, page: Page, run: (capture: Surface["capture"]) => Promise<void>) {
  if (!output) throw new Error("Set PARITY_OK_OUTPUT to an evidence directory");
  const destination = path.resolve(output, feature);
  mkdirSync(destination, { recursive: true });
  const steps: Record<string, StepState> = {};
  const capture: Surface["capture"] = async (step, action) => {
    try {
      steps[step] = { status: "observed", value: await action() };
    } catch (error) {
      steps[step] = { status: "failed", error: String(error) };
    }
    await page.screenshot({ path: path.join(destination, side + "-" + step + ".png"), animations: "disabled" });
  };
  try {
    await run(capture);
  } finally {
    writeFileSync(path.join(destination, side + ".json"), JSON.stringify(steps, null, 2) + "\n");
    writeFileSync(path.join(destination, side + ".md"), readFileSync(file));
  }
}

for (const feature of Object.keys(fixtures) as Feature[]) {
  for (const side of ["ok", "huhu"] as const) {
    if (enabled !== "both" && enabled !== side) continue;
    test(feature + " / " + side, async () => {
      const filename = "parity-" + feature + ".md";
      const action = actions[feature];
      if (side === "ok") test.setTimeout(480_000);
      if (side === "ok") {
        if (!base || !okContent) throw new Error("Set PARITY_OK_URL and PARITY_OK_CONTENT");
        const file = path.join(okContent, filename);
        writeFileSync(file, fixtures[feature]);
        if (feature === "tabs") writeFileSync(path.join(path.dirname(file), neighborName), "# Tab neighbor\n");
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage({ viewport, locale: "zh-CN" });
          page.setDefaultNavigationTimeout(180_000);
          await withEvidence(side, feature, file, page, async (capture) => {
            await page.goto(base + "/#/" + filename.replace(/\.md$/, ""), { waitUntil: "domcontentloaded" });
            await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans", { timeout: 45_000 });
            const editor = page.locator(".tiptap-editor .ProseMirror:visible").first();
            await expect(editor).toContainText(fixtures[feature].split("\n")[0]!.slice(2), { timeout: 45_000 });
            await action({ side, file, page, editor, capture });
          });
        } finally {
          await browser.close();
        }
      } else {
        const { page, vault, app, close } = await openApp();
        const file = path.join(vault, filename);
        try {
          writeFileSync(file, fixtures[feature]);
          if (feature === "tabs") writeFileSync(path.join(path.dirname(file), neighborName), "# Tab neighbor\n");
          await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height), viewport);
          await withEvidence(side, feature, file, page, async (capture) => {
            await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
            await page.getByRole("button", { name: "知识库", exact: true }).first().click();
            await treeItem(page, filename).click();
            const editor = page.getByTestId("markdown-editor").locator(".ProseMirror:visible").first();
            await expect(editor).toContainText(fixtures[feature].split("\n")[0]!.slice(2), { timeout: 30_000 });
            await action({ side, file, page, editor, capture });
          });
        } finally {
          await close();
        }
      }
    });
  }
}
