import { chromium, expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { release, tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree, root } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { fixtureCoreCli } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";

const artifacts = process.env["HUHU_U0_DESKTOP_APP"] ?? root;
const size = { width: 1000, height: 720 };
const core = path.join(root, "resources/herdr/linux-x64/herdr-core");
const noteName = "中文现场.md";
const diskText = "# 现场\n\n初始正文\n";

test.use({ trace: "off" });
test.skip(process.platform !== "linux" || !process.env["HUHU_U0_DESKTOP_APP"], "U0 使用已构建的 Linux 桌面目录和独立 Web");

async function runOnHosts(info: TestInfo, sample: (host: Page, name: "electron" | "web", vault: string) => Promise<void>, prepare?: (vault: string) => void, windowSize = size) {
  const runtime = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-u0-")));
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  let browser: Browser | undefined;
  const results: unknown[] = [];
  const failures: string[] = [];
  try {
    desktop = await openApp({ XDG_RUNTIME_DIR: runtime }, prepare, artifacts);
    await engineReady(desktop.page);
    await desktop.app.evaluate(({ BrowserWindow }, { width, height }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setContentSize(width, height);
      window.webContents.setZoomFactor(1.25);
    }, windowSize);
    const electron = await desktop.app.evaluate(({ BrowserWindow }) => ({
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      window: BrowserWindow.getAllWindows()[0]!.getContentSize(),
      zoom: BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor(),
    }));
    await call(desktop.page, "web.share.start", { mode: "local", port: 0 });
    const { links } = await call<{ links: string[] }>(desktop.page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 800, height: 576 } });
    await web.goto(links[0]!);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    for (const [name, page] of [["electron", desktop.page], ["web", web]] as const) {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const geometry = await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        theme: document.documentElement.dataset.theme,
        mode: document.documentElement.dataset.mode,
        fontSize: getComputedStyle(document.body).fontSize,
      }));
      const attempt = await sample(page, name, desktop.vault).then(() => ({ sampled: true }), (error: unknown) => ({ sampled: false, error: error instanceof Error ? error.message : String(error) }));
      if ("error" in attempt) failures.push(`${name}: ${attempt.error}`);
      results.push({ name, geometry, errors, ...attempt });
    }
    await info.attach("environment", {
      body: JSON.stringify({ linux: release(), desktop: JSON.parse(readFileSync(path.join(artifacts, "out/build-info.json"), "utf8")), electron, webChromium: browser.version(), results }, null, 2),
      contentType: "application/json",
    });
    expect(results, failures.join("\n\n")).toMatchObject([{ sampled: true }, { sampled: true }]);
  } finally {
    await browser?.close();
    await desktop?.close();
    if (existsSync(core)) {
      for (const socket of readdirSync(runtime).filter((name) => /^huhu-[a-z0-9]{8}-[a-z0-9]{4}\.sock$/u.test(name))) {
        const cli = fixtureCoreCli(core, { ...process.env, HC_SESSION: "huhu", HC_SOCKET: path.join(runtime, socket) });
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
      }
    }
    rmTree(runtime);
  }
}

async function screenshot(info: TestInfo, page: Page, name: string) {
  const file = info.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await info.attach(name, { path: file, contentType: "image/png" });
}

test("U0 中文笔记编辑与受控保存失败", async ({ browserName }, info) => {
  void browserName;
  await runOnHosts(info, async (page, name, vault) => {
    const file = path.join(vault, noteName);
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    if (await autosave.isChecked()) await autosave.click();
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-section-all").click();
    await treeItem(page, noteName).click();
    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(editor).toContainText("初始正文");

    const save = page.getByTestId("note-save");
    const original = readFileSync(file, "utf8");
    const normal = name === "electron" ? "桌面连续中文" : "网页连续中文";
    const pending = name === "electron" ? "桌面失败重试" : "网页失败重试";
    const append = async (text: string) => {
      await editor.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText(text);
    };
    for (const text of [normal, "再写", "收尾"]) await append(text);
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => readFileSync(file, "utf8")).toContain(normal + "再写收尾");
    const saved = readFileSync(file, "utf8");
    expect(saved).not.toBe(original);
    await screenshot(info, page, `${name}-04-save-normal`);

    let requestId = "";
    const observeWrite = (route: import("@playwright/test").Route) => {
      if (route.request().method() !== "POST") return route.continue();
      const request = route.request().postDataJSON() as { capability: string; requestId: string; input?: { path?: string } };
      if (request.capability !== "notes.save" || request.input?.path !== noteName) return route.continue();
      requestId = request.requestId;
      return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "发生未预期错误" } } });
    };
    await page.route("**/api/v1/call", observeWrite);
    try {
      await append(pending);
      await save.click();
      await expect(page.getByText("保存失败：发生未预期错误", { exact: true })).toBeVisible();
      await expect(editor).toContainText(pending);
      expect(readFileSync(file, "utf8")).toBe(saved);
      await screenshot(info, page, `${name}-04-save-injected`);
    } finally {
      await page.unroute("**/api/v1/call", observeWrite);
    }
    await save.click();
    await expect.poll(() => readFileSync(file, "utf8")).toContain(pending);
    await info.attach(`${name}-save`, { body: JSON.stringify({ normal, pending, injectedErrorCode: "INTERNAL", requestId, savedBytesBefore: Buffer.byteLength(saved), retryBytes: Buffer.byteLength(readFileSync(file)) }), contentType: "application/json" });
  }, (vault) => writeFileSync(path.join(vault, noteName), diskText));
});

test("U0 快速捕获对话框的 slash 命中与层次", async ({ browserName }, info) => {
  void browserName;
  await runOnHosts(info, async (page, name) => {
    await page.getByRole("button", { name: "收件箱", exact: true }).first().click();
    await page.getByRole("button", { name: "快速捕获", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "快速捕获" });
    const editor = dialog.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("/");
    const option = page.locator("[data-slash-command]").first();
    const observation = await option.evaluate((element) => {
      const dialog = document.querySelector("dialog[open]");
      const bounds = element.getBoundingClientRect();
      const top = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { modal: dialog?.matches(":modal"), menuInModal: dialog?.contains(element), optionHit: element.contains(top), bounds: bounds.toJSON() };
    }, undefined, { timeout: 6_000 }).catch(() => ({ optionRendered: false }));
    await screenshot(info, page, `${name}-10-slash`);
    await page.keyboard.press("Escape");
    const afterEsc = await dialog.isVisible();
    await info.attach(`${name}-slash`, { body: JSON.stringify({ ...observation, dialogAfterEsc: afterEsc }), contentType: "application/json" });
  });
});

test("U1 Inbox、Task 和 Automation 在真实对话框中共享浮层与表单行为", async ({ browserName }, info) => {
  void browserName;
  await runOnHosts(info, async (page, name) => {
    const settings = page.getByRole("button", { name: "设置", exact: true }).first();
    await settings.click();
    await page.getByTestId("settings-nav-appearance").click();
    await page.getByTestId("theme-vercel").click();
    await page.getByRole("tab", { name: "深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");

    await page.getByRole("button", { name: "收件箱", exact: true }).first().click();
    const capture = page.getByRole("button", { name: "快速捕获", exact: true });
    await capture.click();
    const inbox = page.getByRole("dialog", { name: "快速捕获" });
    const editor = inbox.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("/");
    const slash = inbox.locator('[data-slash-command="heading2"]');
    await expect(slash).toBeVisible();
    await slash.click({ trial: true });
    await page.keyboard.press("Escape");
    await expect(slash).toHaveCount(0);
    await expect(editor).toBeFocused();
    await page.keyboard.press("Backspace");
    await page.keyboard.type("/");
    await slash.click();
    await expect(editor.locator("h2")).toHaveCount(1);
    await expect(editor).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inbox).toBeHidden();
    await expect(capture).toBeFocused();

    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    const taskNew = page.getByTestId("task-new");
    await taskNew.click();
    const task = page.getByTestId("task-editor");
    await expect(task).toBeVisible();
    await expect(page.getByTestId("task-due")).toHaveValue("");
    await task.getByTestId("task-project").focus();
    await expect(task.getByRole("listbox", { name: "任务项目" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(task.getByRole("listbox", { name: "任务项目" })).toBeHidden();
    await expect(task.getByTestId("task-project")).toBeFocused();

    const dateButton = task.getByRole("button", { name: "选择截止日期" });
    await dateButton.click();
    let calendar = task.getByRole("dialog", { name: "选择截止日期" });
    await expect(calendar.getByLabel("月", { exact: true }).locator('option[value="11"]')).toHaveText("十一月");
    expect(await calendar.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--panel)";
      element.append(probe);
      const themed = getComputedStyle(element).backgroundColor === getComputedStyle(probe).backgroundColor;
      probe.remove();
      return themed;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(calendar).toBeHidden();
    await expect(dateButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(task).toBeHidden();
    await expect(taskNew).toBeFocused();

    // Exercise the component with a host-provided document locale and with a narrow form on the same viewport.
    await page.evaluate(() => { document.documentElement.lang = "en-US"; });
    await taskNew.click();
    await task.evaluate((dialog) => { dialog.style.width = "460px"; });
    const taskAreas = task.locator(".hu-form-grid");
    await expect.poll(() => taskAreas.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(1);
    const title = `${"包含较长名称且同时保留正文和截止日期的任务".repeat(3)} ${name}`;
    await task.getByLabel("任务名称").fill(title);
    await task.getByTestId("task-body").locator(".ProseMirror").fill("正文仍然可编辑");
    await task.getByRole("button", { name: "Choose 截止日期" }).click();
    calendar = task.getByRole("dialog", { name: "Choose 截止日期" });
    await expect(calendar.getByLabel("Month", { exact: true }).locator('option[value="11"]')).toHaveText("November");
    await calendar.getByLabel("Year", { exact: true }).fill("2028");
    await calendar.getByLabel("Month", { exact: true }).selectOption("2");
    await calendar.getByLabel("Day", { exact: true }).selectOption("29");
    await calendar.getByRole("button", { name: "Apply" }).click();
    const due = task.getByTestId("task-due");
    await expect(due).toHaveValue("2028-02-29");
    await task.getByRole("button", { name: "Clear 截止日期" }).click();
    await expect(due).toHaveValue("");
    await expect(due).toBeFocused();
    await task.getByTestId("task-save").click();
    await expect(task).toBeHidden();
    const tasks = await call<{ title: string; due: string | null }[]>(page, "tasks.list", { category: "all" });
    expect(tasks.find((row) => row.title === title)).toMatchObject({ due: null });
    await page.evaluate(() => { document.documentElement.lang = "zh-CN"; });

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const ruleNew = page.getByTestId("rule-new");
    await ruleNew.click();
    const rule = page.getByTestId("rule-dialog");
    await rule.evaluate((dialog) => { dialog.style.width = "460px"; });
    await expect.poll(() => rule.locator(".hu-form-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(1);
    const kind = rule.getByTestId("rule-kind");
    await expect(kind.locator('option[value="terminal"]')).toHaveText("运行命令");
    if (await kind.evaluate(() => CSS.supports("appearance", "base-select"))) {
      await kind.click();
      await expect.poll(() => kind.evaluate((select) => select.matches(":open"))).toBe(true);
      await page.keyboard.press("Escape");
      await expect.poll(() => kind.evaluate((select) => select.matches(":open"))).toBe(false);
      await expect(rule).toBeVisible();
      await expect(kind).toBeFocused();
    }
    await kind.selectOption("reminder");
    await rule.getByLabel("规则名称").fill("按容器重排的提醒规则");
    await rule.getByLabel("通知内容").fill("内容");
    await expect(rule.getByTestId("rule-upcoming").locator("time")).toHaveCount(3);
    await expect(rule.getByTestId("rule-save")).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(rule).toBeHidden();
    await expect(ruleNew).toBeFocused();
  });
});

test("F22 命令面板隔离键盘焦点并在关闭或执行后恢复导航", async ({ browserName }, info) => {
  void browserName;
  await runOnHosts(info, async (page) => {
    const opener = page.getByTestId("window-titlebar").getByRole("button", { name: "搜索与命令", exact: true });
    const palette = page.getByRole("dialog", { name: "命令面板" });
    const search = palette.getByRole("combobox");
    await opener.click();
    await expect(search).toBeFocused();
    expect(await palette.evaluate((element) => element.matches(":modal"))).toBe(true);

    await page.keyboard.press("Shift+Tab");
    const close = palette.getByRole("button", { name: "关闭" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    for (const key of ["F6", "Shift+F6"]) {
      await page.keyboard.press(key);
      await expect(search).toBeFocused();
    }
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(opener).toBeFocused();

    await page.getByRole("button", { name: "收件箱", exact: true }).first().click();
    await page.getByRole("button", { name: "快速捕获", exact: true }).click();
    const outer = page.getByRole("dialog", { name: "快速捕获" });
    const title = outer.getByRole("textbox", { name: "标题" });
    await expect(title).toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(outer).toBeVisible();
    await expect(title).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(outer).toBeHidden();

    await opener.click();
    await search.fill("任务");
    for (const key of ["Escape", "Enter"]) {
      await search.dispatchEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true });
      await expect(search).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    const destination = page.getByRole("navigation", { name: "已打开的功能" }).getByRole("button", { name: "任务", exact: true });
    await expect(destination).toHaveAttribute("aria-current", "page");
    await expect(destination).toBeFocused();
  });
});

async function showAgent(page: Page) {
  await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
  await expect(page.getByTestId("agent-cli-module")).toBeVisible();
}

async function lastRow(terminal: Locator) {
  const line = terminal.locator(".xterm-rows > div").filter({ hasText: "U0-LAST-ROW" }).last();
  await expect(line).toHaveText(/U0-LAST-ROW/u, { timeout: 15_000 });
  return line.evaluate((element) => {
    const screen = element.closest(".xterm-screen")!.getBoundingClientRect();
    const row = element.getBoundingClientRect();
    const hit = document.elementFromPoint(row.left + 8, row.top + row.height / 2);
    const clippingAncestors: { className: string; overflow: string; bottom: number }[] = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const overflow = getComputedStyle(ancestor).overflowY;
      const bottom = ancestor.getBoundingClientRect().bottom;
      if (overflow !== "visible" && bottom < row.bottom - 1) clippingAncestors.push({ className: ancestor.className, overflow, bottom });
    }
    return { row: row.toJSON(), screen: screen.toJSON(), clippingAncestors, hitClass: hit?.className, hitInTerminal: !!hit?.closest(".xterm-screen"), rows: element.parentElement?.children.length };
  });
}

test("U0 真实 PTY 分栏拖动后的末行与光标", async ({ browserName }, info) => {
  void browserName;
  test.setTimeout(90_000);
  await runOnHosts(info, async (page, name, vault) => {
    if (name === "web") await page.reload();
    await showAgent(page);
    const affected = page.getByTestId("terminal-view").first();
    if (name === "electron") {
      await page.getByTestId("workspace-pane-launch").click();
      await page.getByTestId("launch-shell").click();
      await expect(affected).toHaveAttribute("data-state", "open");
      await page.getByTestId("workspace-split-down").first().click();
      await page.getByTestId("launch-shell").click();
      await expect(page.getByTestId("terminal-view")).toHaveCount(2);
      const handle = page.getByRole("separator", { name: "上下分栏高度" });
      const bounds = (await handle.boundingBox())!;
      const before = await handle.getAttribute("aria-valuenow");
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 40, { steps: 7 });
      await page.mouse.up();
      await expect(handle).not.toHaveAttribute("aria-valuenow", before!);
      await affected.locator(".xterm-helper-textarea").focus();
      await page.keyboard.type("sh .u0-terminal.sh");
      await page.keyboard.press("Enter");
    }
    const observation = await lastRow(affected);
    await screenshot(info, page, `${name}-12-terminal`);
    await info.attach(`${name}-terminal`, { body: JSON.stringify({ ...observation, ptySize: readFileSync(path.join(vault, ".u0-pty-size"), "utf8").trim() }), contentType: "application/json" });
  }, (vault) => writeFileSync(path.join(vault, ".u0-terminal.sh"), "stty size > .u0-pty-size\nread rows cols < .u0-pty-size\nprintf '\\033[2J\\033[H'\nfor i in 1 2 3 4 5 6 7 8 9; do printf 'PTY sample %s\\r\\n' \"$i\"; done\nprintf '\\033[%s;1H%s%s' \"$rows\" 'U0-LAST-' 'ROW'\nread answer\n"), { width: 1160, height: 960 });
});
