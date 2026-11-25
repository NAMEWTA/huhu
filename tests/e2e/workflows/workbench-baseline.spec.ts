import { chromium, expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { release, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

async function runOnHosts(info: TestInfo, sample: (host: Page, name: "electron" | "web", vault: string) => Promise<void>, prepare?: (vault: string) => void, windowSize = size, environment: Record<string, string> = {}) {
  const runtime = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-u0-")));
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  let browser: Browser | undefined;
  const results: unknown[] = [];
  const failures: string[] = [];
  try {
    desktop = await openApp({ ...environment, XDG_RUNTIME_DIR: runtime }, prepare, artifacts);
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

    if (name === "electron") {
      for (let index = 1; index <= 14; index++) {
        const project = `UX12 项目${String(index).padStart(2, "0")}`;
        await call(page, "tasks.create", { title: project, project, type: "human", tags: [] });
      }
    }
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    const taskNew = page.getByTestId("task-new");
    await taskNew.click();
    const task = page.getByTestId("task-editor");
    await expect(task).toBeVisible();
    await expect(page.getByTestId("task-due")).toHaveValue("");
    const project = task.getByTestId("task-project");
    await project.focus();
    const projectList = task.getByRole("listbox", { name: "任务项目" });
    await expect(projectList.getByRole("option")).toHaveCount(14);
    await page.keyboard.press("ArrowUp");
    const lastOption = projectList.getByRole("option").last();
    await expect(project).toHaveAttribute("aria-activedescendant", (await lastOption.getAttribute("id"))!);
    await expect.poll(() => lastOption.evaluate((option) => {
      const scroller = option.closest(".hu-combobox-list")!;
      return scroller.scrollTop > 0 && option.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().bottom + 1;
    })).toBe(true);
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
    const englishDateButton = task.getByRole("button", { name: "Choose 截止日期" });
    await englishDateButton.click();
    calendar = task.getByRole("dialog", { name: "Choose 截止日期" });
    await expect(calendar.getByLabel("Month", { exact: true }).locator('option[value="11"]')).toHaveText("November");
    await calendar.getByLabel("Year", { exact: true }).fill("2028");
    await calendar.getByLabel("Month", { exact: true }).selectOption("2");
    await calendar.getByLabel("Day", { exact: true }).selectOption("29");
    await calendar.getByRole("button", { name: "Apply" }).click();
    const due = task.getByTestId("task-due");
    await expect(due).toHaveValue("2028-02-29");
    await englishDateButton.click();
    await calendar.getByLabel("Year", { exact: true }).fill("2027");
    await expect(calendar.getByRole("button", { name: "Apply" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(due).toHaveValue("2028-02-29");
    await expect(englishDateButton).toBeFocused();
    await englishDateButton.click();
    await calendar.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(due).toHaveValue("");
    await expect(englishDateButton).toBeFocused();
    await due.fill("2028-02-29");
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
    await page.getByRole("dialog", { name: "放弃未保存的更改？" }).getByRole("button", { name: "放弃更改" }).click();
    await expect(rule).toBeHidden();
    await expect(ruleNew).toBeFocused();
  });
});

test("UX15 同步表单按容器重排，保存后从原计划继续管理", async ({ browserName }, info) => {
  void browserName;
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-ux15-"));
  try {
    const repository = path.join(fixture, `remote-${"long-repository-path-".repeat(5)}sync.git`);
    execFileSync("git", ["init", "--bare", repository]);
    const remote = pathToFileURL(repository).href;
    await runOnHosts(info, async (page, name) => {
      const mode = name === "electron" ? "full" : "follow";
      const branch = `ux15/${name}`;
      const rules = ["私有草稿/**", "scratch/**/*.tmp", "generated/"];
      const rail = page.locator('[data-region="rail"]');
      const settings = page.getByTestId("sync-settings");
      const grid = settings.locator(".hu-sync-settings-grid");
      const save = settings.getByTestId("sync-save");
      const openSettings = async () => {
        await rail.getByRole("button", { name: "设置", exact: true }).click();
        await page.getByTestId("settings-nav-versioning").click();
        await expect(settings).toBeVisible();
      };
      const columns = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      await page.setViewportSize({ width: 1600, height: 930 });
      await openSettings();
      await expect.poll(columns).toBe(2);
      await page.setViewportSize({ width: 480, height: 800 });
      await expect.poll(columns).toBe(1);
      await settings.getByTestId("sync-remote").fill(remote);
      await settings.getByTestId("sync-branch").fill(branch);
      await settings.getByTestId(`sync-mode-${mode}`).click();
      await settings.getByTestId("sync-pull-sec").fill("3600");
      if (mode === "full") await settings.getByTestId("sync-push-sec").fill("3600");
      await settings.getByTestId("sync-exclude").fill(rules.join("\n"));
      await expect.poll(() => settings.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const button = await save.boundingBox();
      expect(button?.height).toBeLessThan(60);
      await save.click();
      await expect(settings.getByTestId("sync-message")).toHaveText("已保存");
      const persisted = await call<{ remote: string; branch: string; mode: string; exclude: string[]; periodics: { pull: { planId: string }; sync: { planId: string } } }>(page, "sync.get", {});
      expect(persisted).toMatchObject({ remote, branch, mode, exclude: rules });
      const plan = mode === "full" ? persisted.periodics.sync : persisted.periodics.pull;
      await settings.getByRole("button", { name: mode === "full" ? "管理 Git 同步计划" : "管理 Git 拉取计划" }).click();
      await expect(page.getByTestId("plan-directory")).toBeVisible();
      await expect.poll(() => new URL(page.url()).searchParams.get("automation-plan")).toBe(plan.planId);
      await page.setViewportSize({ width: 1600, height: 930 });
      await openSettings();
      await expect(settings.getByTestId("sync-remote")).toHaveValue(remote);
      await expect(settings.getByTestId("sync-branch")).toHaveValue(branch);
      await expect(settings.getByTestId("sync-exclude")).toHaveValue(rules.join("\n"));
      await expect(settings.getByTestId(`sync-mode-${mode}`)).toBeChecked();
      await expect(save).toBeDisabled();
    });
  } finally {
    rmTree(fixture);
  }
});

test("UX16 Safe 三栏按账号取用明文，窄窗逐级返回并清理", async ({ browserName }, info) => {
  void browserName;
  const password = "UX16 synthetic fixture master";
  const accountSecret = "UX16 synthetic second password";
  type Session = { instanceId: string; generation: number; locked: boolean };
  await runOnHosts(info, async (page, name) => {
    if (name === "electron") {
      const initial = await call<Session>(page, "safe.status", {});
      await call(page, "safe.setup", { password, session: { instanceId: initial.instanceId, generation: initial.generation } });
      const status = await call<Session>(page, "safe.status", {});
      const session = { instanceId: status.instanceId, generation: status.generation };
      const first = await call<{ revision: number }>(page, "safe.entries.create", {
        session, expectedRevision: 0, name: "UX16 三账号站点", url: "https://three.example.test",
        accounts: [
          { account: "账号甲", password: "UX16 synthetic first password" },
          { account: "账号乙", password: accountSecret, email: "ux16-second@example.test" },
          { account: "账号丙", password: "UX16 synthetic third password" },
        ],
      });
      await call(page, "safe.entries.create", { session, expectedRevision: first.revision, name: "UX16 另一个站点", accounts: [{ account: "另一个站点的账号" }] });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-region="rail"]').getByRole("button", { name: "保险箱", exact: true }).click();
    if ((await call<Session>(page, "safe.status", {})).locked) {
      await page.getByLabel("主密码", { exact: true }).fill(password);
      await page.getByRole("button", { name: "解锁保险箱" }).click();
    }
    const grid = page.getByTestId("safe-unlocked");
    const entry = grid.getByTestId("safe-item").filter({ hasText: "UX16 三账号站点" });
    const summary = grid.getByTestId("safe-accounts");
    const accountRows = summary.getByTestId("safe-account-row");
    const second = accountRows.filter({ hasText: "账号乙" });
    const detail = grid.getByTestId("safe-account-detail");
    const secret = detail.getByTestId("secret-value");
    const reveals: string[] = [];
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/v1/call") || request.method() !== "POST") return;
      const body = request.postDataJSON();
      if (body?.capability === "safe.accounts.reveal") reveals.push(body.input.accountId);
    });
    await entry.click();
    await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(3);
    await expect(accountRows).toHaveCount(3);
    await expect(entry).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(detail).toBeVisible();
    await second.press("Enter");
    await expect(detail.getByRole("heading", { name: "账号乙", exact: true })).toBeFocused();
    await expect(detail).toContainText("ux16-second@example.test");
    await expect(secret).toHaveText("••••••••");
    expect(reveals).toEqual([]);
    await detail.getByRole("button", { name: "显示密码", exact: true }).click();
    await expect(secret).toHaveText(accountSecret);
    expect(reveals).toEqual([await second.getAttribute("data-account-id")]);

    await page.setViewportSize({ width: 490, height: 830 });
    await expect(summary).toBeHidden();
    await detail.getByRole("button", { name: "返回账号" }).click();
    await expect(second).toBeFocused();
    await expect(detail).toBeHidden();
    await expect(secret).toHaveText("••••••••");
    await summary.getByRole("button", { name: "返回条目" }).click();
    await expect(entry).toBeFocused();
    await entry.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");
    const addedName = `UX16 新增账号 ${name}`;
    await summary.getByRole("button", { name: "新增账号", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "新增账号" });
    await editor.getByLabel("账号（必填）").fill(addedName);
    await editor.getByLabel("密码", { exact: true }).fill("UX16 synthetic new password");
    await editor.getByTestId("safe-save").click();
    await expect(detail.getByRole("heading", { name: addedName, exact: true })).toBeFocused();
    await expect(secret).toHaveText("••••••••");
    expect(reveals).toHaveLength(1);
    await detail.getByRole("button", { name: "删除账号", exact: true }).click();
    await page.getByTestId("safe-remove-confirmation").getByRole("button", { name: "确认删除账号" }).click();
    await expect(accountRows).toHaveCount(3);
    await summary.getByRole("button", { name: "返回条目" }).click();
    await grid.getByTestId("safe-item").filter({ hasText: "UX16 另一个站点" }).click();
    await accountRows.filter({ hasText: "另一个站点的账号" }).click();
    await expect(detail.getByRole("heading", { name: "另一个站点的账号" })).toBeVisible();
    await expect(secret).toHaveText("未设置");
    await page.getByRole("button", { name: "手动锁定" }).click();
    await expect(page.getByTestId("safe-locked")).toBeVisible();
    await expect(secret).toHaveCount(0);
  });
});

test("UX17 外观按工作区重排四套主题，窄窗切换并重开保留", async ({ browserName }, info) => {
  void browserName;
  await runOnHosts(info, async (page, name) => {
    const openAppearance = async () => {
      await page.locator('[data-region="rail"]').getByRole("button", { name: "设置", exact: true }).click();
      await page.getByTestId("settings-nav-appearance").click();
      await expect(page.getByTestId("settings-appearance")).toBeVisible();
    };
    const appearance = page.getByTestId("settings-appearance");
    const grid = appearance.getByRole("group", { name: "主题", exact: true });
    const root = page.locator("html");
    const metrics = () => grid.evaluate((element) => {
      const scroll = element.closest<HTMLElement>(".shell-settings-content")!;
      const options = [...element.querySelectorAll("button")].map((card) => card.getBoundingClientRect());
      const bounds = scroll.getBoundingClientRect();
      return {
        columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
        scrollFillsWidth: Math.abs(bounds.width - scroll.parentElement!.clientWidth) <= 1,
        pageFits: scroll.scrollWidth <= scroll.clientWidth + 1,
        viewport: [window.innerWidth, window.innerHeight],
        width: element.clientWidth,
        lastColumnFillsGrid: Math.abs(options.at(-1)!.right - element.getBoundingClientRect().right) <= 1,
        fontSize: getComputedStyle(document.documentElement).getPropertyValue("--font-size"),
      };
    });
    await page.setViewportSize({ width: 1920, height: 940 });
    await openAppearance();
    await expect(grid.getByRole("button")).toHaveCount(4);
    await expect.poll(metrics).toMatchObject({ columns: 4, scrollFillsWidth: true, pageFits: true, lastColumnFillsGrid: true });
    const firstWide = await metrics();
    await page.setViewportSize({ width: 1200, height: 850 });
    await expect.poll(metrics).toMatchObject({ columns: 2, pageFits: true, lastColumnFillsGrid: true });
    await page.setViewportSize({ width: 490, height: 830 });
    await expect.poll(metrics).toMatchObject({ columns: 1, pageFits: true });
    const theme = name === "electron" ? "vercel" : "notion";
    const mode = name === "electron" ? "dark" : "light";
    await appearance.getByTestId(`theme-${theme}`).click();
    await expect(root).toHaveAttribute("data-theme", theme);
    await appearance.getByRole("tab", { name: mode === "dark" ? "深色" : "浅色", exact: true }).click();
    await expect(root).toHaveAttribute("data-mode", mode);
    const font = appearance.getByRole("slider", { name: "界面字号", exact: true });
    await font.press("Home");
    await expect.poll(metrics).toMatchObject({ fontSize: "12px" });
    await font.press("End");
    await expect.poll(metrics).toMatchObject({ fontSize: "18px", columns: 1, pageFits: true });
    const narrow = await metrics();
    expect(await call(page, "settings.get", {})).toMatchObject({ appearance: { theme, mode, fontSize: 18 } });
    await page.setViewportSize({ width: 1920, height: 940 });
    await page.reload();
    await openAppearance();
    await expect(root).toHaveAttribute("data-theme", theme);
    await expect(root).toHaveAttribute("data-mode", mode);
    await expect(appearance.getByTestId(`theme-${theme}`)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(metrics).toMatchObject({ fontSize: "18px", columns: 4, scrollFillsWidth: true, pageFits: true, lastColumnFillsGrid: true });
    await info.attach(`${name}-appearance-reflow`, { body: JSON.stringify({ firstWide, narrow, reopened: await metrics(), theme, mode }), contentType: "application/json" });
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

async function launchWorkspacePane(page: Page, launch: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/call" && request.postDataJSON()?.capability === "agent.workspace.launch";
    }),
    launch.click(),
  ]);
  const result = (await response.json()) as { ok: boolean; data?: { sessionId: string; placement: { leaf: string } } };
  expect(result).toMatchObject({ ok: true, data: { sessionId: expect.any(String), placement: { leaf: expect.any(String) } } });
  const { sessionId, placement } = result.data!;
  const pane = page.getByTestId("workspace-pane").and(page.locator(`[data-pane-id="${placement.leaf}"][data-session-id="${sessionId}"]`));
  await expect(pane.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
  return pane;
}

async function lastRow(terminal: Locator, marker = "U0-LAST-ROW") {
  const line = terminal.locator(".xterm-rows > div").filter({ hasText: marker }).last();
  await expect(line).toContainText(marker, { timeout: 15_000 });
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

test("UX08 实际 PTY 随分栏、视口和字号同步，末行完整可见", async ({ browserName }, info) => {
  void browserName;
  test.setTimeout(120_000);
  await runOnHosts(info, async (page, name, vault) => {
    await showAgent(page);
    const history = page.getByTestId("agent-history-toggle");
    if (await history.getAttribute("aria-expanded") === "true") await history.click();
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    const pane = await launchWorkspacePane(page, page.getByTestId("launch-shell"));
    const terminal = pane.getByTestId("terminal-view");
    await expect(terminal.getByTestId("terminal-observer")).toHaveCount(0);
    const verify = async (step: string) => {
      const marker = `UX08-${step}`;
      const output = path.join(vault, `.${marker}`);
      await terminal.locator(".xterm-helper-textarea").focus();
      await page.keyboard.type(`sh .ux08-terminal.sh ${marker}`);
      await page.keyboard.press("Enter");
      const observation = await lastRow(terminal, marker);
      const [rows = 0, cols = 0] = readFileSync(output, "utf8").trim().split(/\s+/u).map(Number);
      expect(observation.rows).toBe(rows);
      expect(observation.clippingAncestors).toEqual([]);
      expect(observation.hitInTerminal).toBe(true);
      expect(await terminal.locator(".xterm-rows > div").last().locator(".xterm-cursor").count()).toBeGreaterThan(0);
      await info.attach(`${name}-${step}`, { body: JSON.stringify({ ...observation, rows, cols }), contentType: "application/json" });
      await page.keyboard.press("Enter"); // 回到原 shell 及其滚动回看
      return { rows, cols };
    };
    const initial = await verify(`${name}-initial`);
    await pane.getByTestId("workspace-split-down").click();
    const sibling = await launchWorkspacePane(page, page.getByTestId("launch-shell"));
    await expect(page.getByTestId("terminal-view")).toHaveCount(2);
    expect((await verify(`${name}-split`)).rows).toBeLessThan(initial.rows);
    await sibling.getByRole("button", { name: "放大分栏" }).click();
    await expect(pane).toBeHidden();
    await sibling.getByRole("button", { name: "还原分栏" }).click();
    await expect(pane).toBeVisible();
    await page.setViewportSize({ width: 960, height: 680 });
    const resized = await verify(`${name}-viewport`);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--font-size", "18px");
      window.dispatchEvent(new Event("huhu:appearance-changed"));
    });
    expect((await verify(`${name}-font`)).cols).toBeLessThan(resized.cols);
  }, (vault) => writeFileSync(path.join(vault, ".ux08-terminal.sh"), `
set -eu
stty size > ".$1"
read -r rows cols < ".$1"
printf '\\033[?1049h\\033[2J\\033[H'
i=0
while [ "$i" -lt "$((rows * 3))" ]; do
  printf 'PTY sample %s\\r\\n' "$i"
  i=$((i + 1))
done
printf '\\033[%s;1H%s\\033[K' "$rows" "$1"
printf '\\033[%s;%sH#\\033[%s;%sH' "$rows" "$cols" "$rows" "$cols"
read -r answer
printf '\\033[?1049l'
`), { width: 1180, height: 940 });
});

test("UX09 全局会话行与 Space 树定位同一终端，切换及刷新保留布局", async ({ browserName }, info) => {
  void browserName;
  test.setTimeout(120_000);
  const otherName = "UX09 第二工作区";
  await runOnHosts(info, async (page, name, vault) => {
    if (name === "web") await page.reload();
    await showAgent(page);
    const panes = page.getByTestId("workspace-pane");
    const top = page.getByRole("navigation", { name: "全局会话" });
    const items = top.getByTestId("session-tab");
    if (name === "electron") {
      const start = async (count: number) => {
        await page.getByTestId(count === 1 ? "workspace-pane-launch" : "workspace-split-down").first().click();
        await page.getByTestId("launch-shell").click();
        await expect(panes.getByTestId("terminal-view")).toHaveCount(count);
      };
      await start(1);
      await start(2);
      await page.getByTestId("space-new").click();
      await page.getByLabel("Space 名称").fill(otherName);
      await page.getByLabel("工作目录", { exact: true }).fill(path.join(vault, "ux09-other"));
      await page.getByTestId("space-save").click();
      await expect(page.getByTestId("agent-space-item").filter({ hasText: otherName })).toHaveAttribute("aria-pressed", "true");
      await start(1);
      await start(2);
    }
    type Entry = { id: string; spaceId: string; terminalId: string | null };
    const list = () => call<Entry[]>(page, "agent.sessions.list", {});
    await expect(top).toHaveCount(1);
    await expect(items).toHaveCount(4);
    const before = await list();
    expect(new Set(before.map(({ spaceId }) => spaceId)).size).toBe(2);
    const left = before[0]!;
    const right = before.find(({ spaceId }) => spaceId !== left.spaceId)!;
    const bySession = (id: string) => page.locator(`[data-session-id="${id}"]`);
    const verify = async (entry: Entry, source: "session-tab" | "space-session") => {
      await page.getByTestId(source).and(bySession(entry.id)).click();
      await expect(items.and(bySession(entry.id))).toHaveAttribute("aria-current", "true");
      const treeItem = page.getByTestId("space-session").and(bySession(entry.id));
      await expect(treeItem).toHaveAttribute("aria-current", "true");
      await expect(treeItem.locator("img")).toHaveAttribute("src", (await items.and(bySession(entry.id)).locator("img").getAttribute("src"))!);
      await expect(panes.and(bySession(entry.id))).toHaveAttribute("data-active", "true");
      await expect(panes.and(bySession(entry.id)).getByTestId("terminal-view")).toHaveAttribute("data-state", "open");
      await expect(panes).toHaveCount(2);
    };
    await verify(left, "session-tab");
    await verify(right, "space-session");
    await verify(left, "space-session");
    await verify(right, "session-tab");
    const toggle = page.getByRole("button", { name: `收起 ${otherName}`, exact: true });
    await toggle.click();
    await expect(page.getByRole("button", { name: `展开 ${otherName}`, exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(items).toHaveCount(4);
    await page.reload();
    await showAgent(page);
    await verify(left, "session-tab");
    await verify(right, "space-session");
    expect((await list()).map(({ id, spaceId, terminalId }) => ({ id, spaceId, terminalId }))).toEqual(before.map(({ id, spaceId, terminalId }) => ({ id, spaceId, terminalId })));
    await info.attach(`${name}-session-navigation`, { body: JSON.stringify(before), contentType: "application/json" });
  }, (vault) => mkdirSync(path.join(vault, "ux09-other")), { width: 1340, height: 950 });
});

test("UX10 按需启动器支持模型搜索、键盘返回和窄窗启动", async ({ browserName }, info) => {
  void browserName;
  test.setTimeout(120_000);
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-ux10-"));
  const argvFile = path.join(bin, "claude.argv");
  const readArgv = () => existsSync(argvFile) ? readFileSync(argvFile, "utf8").trimEnd().split("\n") : [];
  writeFileSync(
    path.join(bin, "claude"),
    `#!/bin/sh
if [ "$1" = "--version" ]; then printf '2.1.0 (Claude Code)\\n'; exit 0; fi
printf '%s\\n' "$@" > "$0.argv"
printf 'UX10-ARGV:%s\\n' "$@"
while IFS= read -r line; do :; done
`,
    { mode: 0o700 },
  );
  try {
    await runOnHosts(
      info,
      async (page, name) => {
        await showAgent(page);
        const history = page.getByTestId("agent-history-toggle");
        if ((await history.getAttribute("aria-expanded")) === "true") await history.click();
        await page.setViewportSize({ width: 690, height: 525 });
        const trigger = page.getByRole("button", { name: "新终端", exact: true }).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("dialog", { name: "启动 Agent" });
        const provider = menu.getByTestId("launch-agent").filter({ hasText: "Claude Code" });
        const setup = menu.getByTestId("launch-submenu");
        const search = setup.getByRole("searchbox", { name: "搜索模型" });
        await expect(provider).toBeEnabled();
        await expect(setup).toHaveCount(0);
        const compact = await menu.boundingBox();
        await provider.focus();
        await page.keyboard.press("ArrowRight");
        await expect(search).toBeFocused();
        await search.fill("opus");
        await page.keyboard.press("Enter");
        await expect(setup.getByRole("radio", { name: "Opus", exact: true })).toBeChecked();
        await setup.getByLabel("推理档位").selectOption("high");
        await expect(setup.getByRole("checkbox", { name: /Fast/u })).toBeVisible();
        await search.fill("haiku");
        await page.keyboard.press("Enter");
        await expect(setup.getByRole("radio", { name: "Haiku", exact: true })).toBeChecked();
        await expect(setup.getByLabel("推理档位")).toHaveCount(0);
        await expect(setup.getByRole("checkbox", { name: /Fast/u })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(setup).toHaveCount(0);
        await expect(provider).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();

        await trigger.click();
        await provider.click();
        await search.fill("opus");
        await setup.getByRole("radio", { name: "Opus", exact: true }).check();
        await expect(setup.getByLabel("推理档位")).toHaveValue("");
        await setup.getByLabel("推理档位").selectOption("high");
        const prompt = `ux10-prompt-${name}`;
        await setup.getByLabel("附加提示词").fill(prompt);
        const bounds = await menu.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, viewport: { width: innerWidth, height: innerHeight } };
        });
        expect(bounds.width).toBeGreaterThan(compact!.width);
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport.width);
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport.height);
        const pane = await launchWorkspacePane(page, setup.getByRole("button", { name: "启动", exact: true }));
        await expect(menu).toHaveCount(0);
        await expect.poll(readArgv).toContain(prompt);
        const argv = readArgv();
        for (const [flag, value] of [["--model", "opus"], ["--effort", "high"]] as const) {
          const index = argv.indexOf(flag);
          expect(argv.slice(index, index + 2)).toEqual([flag, value]);
        }
        await expect(pane.locator(".xterm-rows")).toContainText(`UX10-ARGV:${prompt}`);
        await info.attach(`${name}-launcher-geometry`, { body: JSON.stringify({ compact, bounds, argv }), contentType: "application/json" });
      },
      undefined,
      { width: 1050, height: 800 },
      { PATH: `${bin}:${process.env["PATH"] ?? ""}` },
    );
  } finally {
    rmTree(bin);
  }
});
