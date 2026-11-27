import { _electron as electron, chromium, expect, test, type Browser, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, TaskDto } from "../../packages/contracts/src/index.js";
import { HerdrClient } from "../../packages/herdr-client/src/client.js";
import { HerdrCore } from "../../packages/herdr-client/src/herdr-core.js";
import { patchFrontmatter } from "../../packages/vault/src/semantic/frontmatter.js";
import { machineId } from "../../packages/vault/src/vault.js";
import { startCodexResponsesFixture } from "../../plugins/agent-cli/test/fixtures/codex-responses.js";
import type { RecentTaskRun } from "../../plugins/tasks/src/engine/dispatch-store.js";
import { candidateEnvironment } from "./helpers/candidate-package.js";
import { rmTree, USER_DATA_ARG } from "./helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeRename } from "./helpers/tree.js";
import { call, engineReady } from "./knowledge/session-slow-bridge.js";

const root = path.resolve(import.meta.dirname, "../../apps/desktop");

const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

async function launch(vault: string, extraEnv: Record<string, string> = {}, appRoot = root): Promise<ElectronApplication> {
  return electron.launch({ args: [appRoot, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}), ...extraEnv } });
}

/** 不指定 HUHU_VAULT 启动：显示启动页。目录选择框用主进程里的桩替换（原生对话框无法被 Playwright 驱动）。 */
/** 应用版本号：单一来源是 apps/desktop/package.json（由 sync-version 同步，预发布时带 -rc.N 后缀）。 */
const APP_VERSION = (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }).version;

async function launchBare(): Promise<ElectronApplication> {
  const env = { ...process.env, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}) } as Record<string, string>;
  delete env["HUHU_VAULT"];
  return electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env });
}
async function stubPick(app: ElectronApplication, ...paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, queue) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [queue.shift() ?? ""] })) as typeof dialog.showOpenDialog;
  }, paths);
}

test("启动页：新建空白 Vault、非空目录被拒绝、示例 Vault、切换 Vault 回到启动页", async () => {
  const base = mkdtempSync(path.join(tmpdir(), "huhu-launch-"));
  const empty = path.join(base, "空白");
  const busy = path.join(base, "已有内容");
  const demo = path.join(base, "示例");
  mkdirSync(busy);
  writeFileSync(path.join(busy, "a.txt"), "已有");
  const app = await launchBare();
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });

    await stubPick(app, busy);
    await page.getByTestId("vault-new").click();
    await expect(page.getByTestId("vault-error")).toContainText("必须为空");
    expect(readdirSync(busy)).toEqual(["a.txt"]); // 不动已有内容

    await stubPick(app, empty);
    mkdirSync(empty);
    await page.getByTestId("vault-new").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    expect(existsSync(path.join(empty, ".huhu/vault.json"))).toBe(true);

    // 切换 Vault：回到启动页，且最近列表里有刚才的目录；打开示例 Vault
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-vault").click();
    await page.getByTestId("svault-switch").click();
    await page.getByTestId("svault-switch-confirm").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("vault-recent")).toContainText("空白");
    await stubPick(app, demo);
    await page.getByTestId("vault-demo").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    expect(existsSync(path.join(demo, "欢迎使用 HUHU.md"))).toBe(true);
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(treeItem(page, "欢迎使用 HUHU")).toBeVisible();
  } finally {
    await app.close();
    rmTree(base);
  }
});

test("窗口启动、appInfo 可用、window.open 被拒绝", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    expect(await page.title()).toBe("HUHU");
    const info = await page.evaluate(() => window.huhuHost.appInfo());
    expect(info).toMatchObject({ name: "HUHU", version: APP_VERSION });
    const before = app.windows().length;
    await page.evaluate(() => window.open("file:///etc/passwd"));
    await page.waitForTimeout(500);
    expect(app.windows().length).toBe(before);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("任务：新建、改状态为已完成并写入 Vault 文件；杀死 Engine 后显示未连接，可重启", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 }); // 默认打开工作台首页
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(page.getByTestId("tasks-module")).toBeVisible();

    await page.getByTestId("task-new").click();
    await page.getByTestId("task-editor").getByLabel("任务名称").fill("写发布说明");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    const files = readdirSync(path.join(vault, "Tasks"));
    expect(files).toHaveLength(1);
    const file = () => readFileSync(path.join(vault, "Tasks", readdirSync(path.join(vault, "Tasks"))[0] as string), "utf8");
    expect(file()).toContain("status: not_started");
    expect(file()).toContain("type: human");

    await page
      .getByTestId("task-row")
      .getByRole("combobox", { name: /任务状态 写发布说明/ })
      .selectOption("completed");
    await expect(page.locator('section[data-group="completed"] [data-testid=task-row]')).toHaveCount(1);
    await expect.poll(file).toContain("status: completed");

    // 杀死 Engine 进程 → 界面提示 → 重启恢复
    const pid = Number(readFileSync(path.join(vault, ".huhu/runtime", readdirSync(path.join(vault, ".huhu/runtime"))[0] as string, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
    process.kill(pid, "SIGKILL");
    await expect(page.getByText("工作台引擎未连接")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "重启引擎" }).click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.getByTestId("task-row")).toHaveCount(1);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

/** 知识库：新建一篇笔记（对话框流程）。 */
async function newNote(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "新建笔记" }).first().click();
  await page.getByTestId("new-note-dialog").getByLabel("文件名").fill(name);
  await page.getByTestId("new-note-submit").click();
  await expect(treeItem(page, name)).toBeVisible(); // 树经事件合并后重新列举，等行出现再继续
}

/** 知识库：用笔记操作菜单重命名当前笔记。 */
async function renameCurrentNote(page: import("@playwright/test").Page, newName: string): Promise<void> {
  await page.getByRole("button", { name: "笔记操作" }).click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "重命名" }).fill(newName);
  await page.getByTestId("name-dialog-submit").click();
}

/** 知识库：把当前笔记移到回收站（带确认）。 */
async function trashCurrentNote(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "笔记操作" }).click();
  await page.getByRole("menuitem", { name: "移到回收站" }).click();
  await page.getByRole("button", { name: "移到回收站", exact: true }).last().click();
}

test("知识库：新建笔记、编辑自动保存到文件、预览双链、改名改写链接", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("notes-module")).toBeVisible();

    for (const n of ["目标", "来源"]) {
      await newNote(page, n);
      await expect(treeItem(page, `${n}.md`)).toBeVisible();
    }
    // 正在编辑「来源」（最后创建的）：写入指向「目标」的双链
    await page.getByTestId("markdown-editor").locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("链接到 [[目标]]");
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 5000 });
    expect(readFileSync(path.join(vault, "来源.md"), "utf8")).toContain("链接到 [[目标]]");

    // 预览里双链可点击
    await page.getByRole("tab", { name: "阅读" }).click();
    await expect(page.getByText("目标", { exact: true }).first()).toBeVisible();

    // 改名「目标」→「新目标」，来源里的双链被改写
    await treeItem(page, "目标.md").click();
    await renameCurrentNote(page, "新目标");
    await expect.poll(() => readFileSync(path.join(vault, "来源.md"), "utf8")).toContain("[[新目标]]");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("知识库：文件夹重命名、移动、删除（整体进回收站）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByRole("button", { name: "新建文件夹" }).first().click();
    await page.getByRole("textbox").last().fill("资料");
    await page.getByTestId("name-dialog-submit").click();
    await page.getByRole("button", { name: "新建文件夹" }).first().click();
    await page.getByRole("textbox").last().fill("归档");
    await page.getByTestId("name-dialog-submit").click();
    await expect.poll(() => existsSync(path.join(vault, "资料"))).toBe(true);

    await treeRename(page, treeFolder(page, "资料"), "资料库");
    await expect.poll(() => existsSync(path.join(vault, "资料库"))).toBe(true);
    expect(existsSync(path.join(vault, "资料"))).toBe(false);

    await treeMenu(page, treeFolder(page, "资料库"), "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("归档");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect.poll(() => existsSync(path.join(vault, "归档/资料库"))).toBe(true);

    await treeMenu(page, treeFolder(page, "归档"), /^删除/);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Move to|Delete|移到|删除/i })
      .first()
      .click();
    await expect.poll(() => existsSync(path.join(vault, "归档"))).toBe(false);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("外部扩展（ACC-PL-03/04）：发现页安装快速剪藏，权限确认后运行命令写入收件箱；卸载保留数据", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.getByRole("tab", { name: "发现插件" }).click();
    await expect(page.getByTestId("plugin-example")).toHaveCount(3);
    await page.locator('[data-testid="plugin-example"][data-plugin="quick-clip"]').getByTestId("plugin-example-install").click();
    const dialog = page.getByTestId("plugin-permission-dialog");
    await expect(dialog).toContainText("inbox.write");
    await expect(dialog).toContainText("inbox.capture");
    await expect(dialog).toContainText("只安装你信任的扩展");
    await page.getByTestId("plugin-install-confirm").click();
    await expect(page.getByTestId("plugin-detail")).toContainText("快速剪藏", { timeout: 15_000 });
    await page.getByTestId("plugin-command-run").click();
    await expect(page.getByTestId("plugin-command-result")).toContainText("已运行");
    await expect.poll(() => (existsSync(path.join(vault, "Inbox")) ? readdirSync(path.join(vault, "Inbox")).length : 0)).toBe(1);
    expect(readFileSync(path.join(vault, "Inbox", readdirSync(path.join(vault, "Inbox"))[0] as string), "utf8")).toContain("source: plugin:quick-clip");

    // 命令面板里也能运行扩展命令
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByLabel("搜索模块、命令和内容").fill("快速剪藏");
    await expect(page.getByRole("option", { name: /快速剪藏/ })).toBeVisible();
    await page.keyboard.press("Escape");

    writeFileSync(path.join(vault, ".huhu/plugins/data/quick-clip/keep.txt"), "保留");
    await page.getByTestId("plugin-uninstall").click();
    await page.getByTestId("plugin-uninstall-confirm").click();
    await expect.poll(() => existsSync(path.join(vault, ".huhu/plugins/external/quick-clip"))).toBe(false);
    expect(existsSync(path.join(vault, ".huhu/plugins/data/quick-clip/keep.txt"))).toBe(true);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("手动保存：外部改动出现合并 Banner、合并后两边改动都在（ACC-KN-05）；离开后留下草稿并可恢复（ACC-KN-04）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click(); // 关闭自动保存
    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "合并笔记");
    const file = path.join(vault, "合并笔记.md");
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n我的新行");
    await expect(page.getByTestId("save-state")).toHaveText("未保存修改");
    // 外部编辑器在末尾追加另一行
    writeFileSync(file, `${readFileSync(file, "utf8")}\n外部的新行\n`);
    await expect(page.getByTestId("note-merge")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("note-merge").click();
    await expect(editor).toContainText("我的新行");
    await expect(editor).toContainText("外部的新行");
    await page.getByTestId("note-save").click();
    await expect.poll(() => readFileSync(file, "utf8")).toContain("我的新行");
    expect(readFileSync(file, "utf8")).toContain("外部的新行");

    // 再改一处，不保存就离开：文件不变，回来时提示草稿
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("草稿里的字");
    const onDisk = readFileSync(file, "utf8");
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "合并笔记").click();
    await expect(page.getByTestId("note-draft-restore")).toBeVisible({ timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toBe(onDisk);
    await page.getByTestId("note-draft-restore").click();
    await expect(editor).toContainText("草稿里的字");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("大文件（ACC-KN-10）：50 MiB 日志在文件树中只显示元信息卡片，不当作文本加载", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  writeFileSync(path.join(vault, "服务器.log"), Buffer.alloc(50 * 1024 * 1024, 0x41));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "服务器.log").click();
    await expect(page.getByTestId("file-card")).toBeVisible();
    await expect(page.getByTestId("file-size")).toHaveText("50.0 MiB");
    await expect(page.getByTestId("markdown-editor")).toHaveCount(0);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("Agent CLI：新建 Space 指向 Vault 外目录，只写 .huhu/agent-cli/spaces/，不启动任何进程（ACC-AG-01）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const outside = mkdtempSync(path.join(tmpdir(), "huhu-space-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await page.getByTestId("space-new").click();
    await page.getByLabel("Space 名称").fill("外部项目");
    await page.getByLabel("工作目录").fill(outside);
    await page.getByTestId("space-save").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "外部项目" })).toBeVisible();
    const dir = path.join(vault, ".huhu/agent-cli/spaces");
    await expect.poll(() => readdirSync(dir).length).toBeGreaterThanOrEqual(2); // 默认 Space + 新建的
    expect(readdirSync(outside)).toEqual([]); // 不在目录里写任何东西
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(outside);
  }
});

test("点窗口 X 立即退出：防抖窗口里的编辑先落盘，不丢字", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "退出落盘");
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("立刻关闭窗口前输入的内容");
    // 不等 800ms 自动保存：直接关窗口（与用户点 X 一致）
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.close();
    });
    // macOS 上关掉最后一个窗口应用不会退出（系统惯例），但窗口 close 时的落盘照样发生：此时直接检查文件，再退出应用
    if (process.platform === "darwin") {
      await expect.poll(() => readFileSync(path.join(vault, "退出落盘.md"), "utf8")).toContain("立刻关闭窗口前输入的内容");
      await app.close(); // 应用还在运行：必须退出，否则下一个用例的单实例锁会让新实例直接退出
    } else await closed;
    expect(readFileSync(path.join(vault, "退出落盘.md"), "utf8")).toContain("立刻关闭窗口前输入的内容");
  } finally {
    rmTree(vault);
  }
});

test("ACC-KN-01：含 BOM、CRLF、GFM 表格与未知 HTML 块的笔记，打开并切换三种视图、不编辑、关闭后，文件字节与 mtime 不变", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const file = path.join(vault, "原样.md");
  const raw = Buffer.from('\uFEFF# 原样\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n<custom-block data-x="1">未知块</custom-block>\r\n\r\n正文\r\n', "utf8");
  writeFileSync(file, raw);
  const before = statSync(file).mtimeMs;
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "原样").click();
    await expect(page.getByTestId("markdown-editor")).toBeVisible();
    for (const mode of ["源码", "阅读", "实时预览"]) {
      await page.getByRole("tab", { name: mode }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: "任务", exact: true }).first().click(); // 离开 = 关闭文档
    await page.waitForTimeout(1500);
    expect(readFileSync(file).equals(raw)).toBe(true);
    expect(statSync(file).mtimeMs).toBe(before);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("ACC-SY-05：切换主题为 Vercel 深色，所有模块同时切换；重开 Vault 后保持", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-appearance").click();
    await page
      .getByRole("button", { name: /Vercel/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "深色" }).click();
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme", "vercel");
    await expect(root).toHaveAttribute("data-mode", "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    for (const name of ["知识库", "任务", "收件箱", "Agent CLI", "插件中心"]) {
      await page.getByRole("button", { name, exact: true }).first().click();
      await expect(root).toHaveAttribute("data-theme", "vercel");
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg); // 各模块同一套令牌
    }
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).appearance).toMatchObject({ theme: "vercel", mode: "dark" });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "vercel");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("ACC-AG-08：有运行中的会话，退出 HUHU 再打开同一 Vault，会话仍在运行并可重新连接", async () => {
  test.skip(!existsSync(HERDR), "需要编译好的 Herdr Core");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("echo BEFORE-QUIT-$((6*7))");
    await page.keyboard.press("Enter");
    await expect(page.locator(".xterm-rows")).toContainText("BEFORE-QUIT-42", { timeout: 10_000 });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("session-tab")).toHaveCount(1, { timeout: 20_000 });
    await page.getByTestId("session-tab").click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("echo AFTER-RESTART-$((7*6))");
    await page.keyboard.press("Enter");
    await expect(page.locator(".xterm-rows")).toContainText("AFTER-RESTART-42", { timeout: 10_000 });
  } finally {
    await app.close();
    try {
      const id = JSON.parse(readFileSync(path.join(vault, ".huhu/vault.json"), "utf8")).id as string;
      const { spawnSync } = await import("node:child_process");
      const runtime = path.join(vault, ".huhu/runtime", readdirSync(path.join(vault, ".huhu/runtime"))[0] as string, "herdr");
      const sock = path.join(process.env["XDG_RUNTIME_DIR"] ?? tmpdir(), `huhu-${id.replace(/^vault-/, "").slice(0, 8)}-${readdirSync(path.join(vault, ".huhu/runtime"))[0]?.slice(0, 4)}.sock`);
      spawnSync(HERDR, ["server", "stop"], { env: { ...process.env, HC_SESSION: "huhu", HC_SOCKET: sock, XDG_STATE_HOME: path.join(runtime, "state"), XDG_CONFIG_HOME: path.join(runtime, "config") } });
    } catch {
      /* 清理尽力而为 */
    }
    rmTree(vault);
  }
});

test("文档标签条：打开多篇笔记各有一个标签，点标签切换，关闭标签后切到相邻的一篇", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  writeFileSync(path.join(vault, "甲.md"), "# 甲\n");
  writeFileSync(path.join(vault, "乙.md"), "# 乙\n");
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "甲").click();
    await treeItem(page, "乙").click();
    const tabs = page.getByTestId("document-tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.filter({ hasText: "乙" })).toHaveAttribute("aria-current", "true");
    await tabs.filter({ hasText: "甲" }).click();
    await expect(tabs.filter({ hasText: "甲" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: "关闭 甲" }).click();
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toContainText("乙");
    await expect(tabs.first()).toHaveAttribute("aria-current", "true");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("批注：选中正文添加、回复、解决、删除；删除锚定句后变为 orphaned（ACC-KN-08）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "批注笔记");
    const editor = page.getByTestId("markdown-editor");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("需要批注的一句话。");
    // 选中刚输入的这一行 → 工具栏“添加批注”触发 OK 的选区入口（浮动输入框，引用文字 + 上下文）
    await page.keyboard.press("Shift+Home");
    await page.getByRole("button", { name: "添加批注" }).first().click();
    const composer = page.getByTestId("comment-composer");
    await expect(composer).toBeVisible();
    await composer.getByRole("textbox").click();
    await page.keyboard.type("这里要展开");
    await page.keyboard.press("Enter");
    // 发表后详情栏自动打开批注页，线程进入同一份真实存储（Comments/ 下的 Markdown 文件）
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    const dir = path.join(vault, "Comments");
    await expect.poll(() => readdirSync(dir).length).toBe(1);
    expect(readFileSync(path.join(dir, readdirSync(dir)[0] as string), "utf8")).toMatch(/exact: 需要批注的一句话。/);
    // 正文里有 OK 锚点层提供的高亮装饰
    await expect(editor.locator(".ProseMirror [data-comment-thread]").first()).toBeVisible();

    const comment = page.getByTestId("comment-thread");
    await comment.hover();
    await comment.getByTestId("comment-edit").click();
    await comment.getByRole("textbox", { name: "编辑这条评论" }).fill("收到");
    await comment.getByTestId("comment-edit-save").click();
    await expect(comment.getByTestId("thread-comment-body")).toContainText("收到");

    // 删除锚定处的文字并保存 → orphaned
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("全换成别的内容");
    await expect.poll(() => readFileSync(path.join(dir, readdirSync(dir)[0] as string), "utf8"), { timeout: 10_000 }).toMatch(/state: orphaned/);
    await expect(page.getByTestId("comment-orphaned")).toBeVisible();

    await page.getByTestId("thread-delete").click({ force: true });
    await page.getByTestId("comment-delete-confirm").click();
    await expect.poll(() => readdirSync(dir).length).toBe(0);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("快速捕获：任意页面 Mod+Shift+N 写入 Inbox，来源为 quick", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.keyboard.press("ControlOrMeta+Shift+N");
    await page.getByLabel("快速捕获内容").fill("路上想到的点子");
    await page.keyboard.press("Enter");
    const inbox = path.join(vault, "Inbox");
    await expect.poll(() => (existsSync(inbox) ? readdirSync(inbox).length : 0)).toBe(1); // 目录在第一次写入时才创建
    const file = readdirSync(inbox)[0] as string;
    expect(readFileSync(path.join(vault, "Inbox", file), "utf8")).toMatch(/source: quick/);
    await expect(page.getByTestId("quick-capture")).toBeHidden();
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("收件箱与档案：捕获 → 转为任务；创建类型与档案并建立关系", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });

    await page.getByRole("button", { name: "收件箱" }).first().click();
    await page.getByLabel("快速捕获想法").fill("整理发布清单");
    await page.getByRole("button", { name: "收集", exact: true }).click();
    await expect(page.getByTestId("capture-item")).toHaveCount(1);
    expect(readdirSync(path.join(vault, "Inbox"))).toHaveLength(1);
    await page.getByTestId("capture-item").click();
    await page.getByRole("button", { name: /^转为任务/ }).click();
    await page.getByTestId("convert-dialog").getByRole("button", { name: "创建任务并完成处理" }).click();
    await expect(page.getByText("这个想法已经开始行动")).toBeVisible({ timeout: 5000 });
    expect(readdirSync(path.join(vault, "Tasks"))).toHaveLength(1);

    // 档案并入笔记模块：Archives/<类型>/<名称>/ 下的文件夹笔记
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-open-archives").click();
    await expect(page.getByTestId("archives-home")).toBeVisible();
    await page.getByRole("button", { name: "新建第一个类型" }).first().click();
    const typeDialog = page.getByTestId("archive-category-dialog");
    await typeDialog.getByLabel("类型名称").fill("项目");
    await page.getByTestId("archive-field-add").click();
    await typeDialog.getByLabel("字段名").fill("负责人");
    await page.getByTestId("archive-category-save").click();
    await expect(page.getByTestId("archive-category-view")).toBeVisible();
    expect(readFileSync(path.join(vault, "Archives/项目/index.md"), "utf8")).toContain("name: 负责人");
    for (const n of ["甲", "乙"]) {
      await page.getByTestId("archive-new").click();
      await page.getByTestId("archive-dialog").getByLabel("档案名称").fill(n);
      await page.getByTestId("archive-save").click();
      await expect(page.getByTestId("archive-view")).toBeVisible();
      await expect.poll(() => existsSync(path.join(vault, "Archives/项目", n, "index.md"))).toBe(true);
      if (n === "甲") await page.getByTestId("archive-category-link").click();
    }
    // 乙的档案视图：就地填字段，失焦后保存到 index.md 的 frontmatter
    await page.getByTestId("archive-fields").getByLabel("负责人").fill("小王");
    await page.getByTestId("archive-fields").getByLabel("负责人").blur();
    await expect.poll(() => readFileSync(path.join(vault, "Archives/项目/乙/index.md"), "utf8")).toContain('负责人: "小王"');
    // 在档案里新建笔记（面包屑可回到档案视图）
    await page.getByTestId("archive-new-note").click();
    await page.getByLabel("笔记名称").fill("跟进记录");
    await page.getByTestId("archive-note-save").click();
    await expect(page.getByTestId("archive-breadcrumb")).toBeVisible();
    expect(existsSync(path.join(vault, "Archives/项目/乙/跟进记录.md"))).toBe(true);
    await page.getByTestId("archive-breadcrumb").click();
    await expect(page.getByTestId("archive-view")).toBeVisible();
  } finally {
    await app.close();
    rmTree(vault);
  }
});

const safeMaster = "safe playwright fixture";

async function setupPersonalSafe(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "保险箱", exact: true }).first().click();
  await expect(page.getByTestId("safe-setup")).toBeVisible();
  const submit = page.getByRole("button", { name: "创建保险箱" });
  await page.getByLabel("主密码", { exact: true }).fill(safeMaster);
  await page.getByLabel("确认主密码").fill(safeMaster);
  await expect(submit).toBeDisabled();
  await page.getByLabel("我已了解").check();
  await submit.click();
  await expect(page.getByTestId("safe-new")).toBeEnabled({ timeout: 15_000 });
}

async function revealAfter(page: Page, beforeRelease: () => Promise<void>) {
  const fetched = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const match = "**/api/v1/call";
  await page.route(match, async (route) => {
    if (route.request().postDataJSON()?.capability !== "safe.accounts.reveal") return route.continue();
    const response = await route.fetch();
    fetched.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } catch {
      // Leaving an account or session can abort the renderer's request.
    } finally {
      await response.dispose();
    }
  });
  try {
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await fetched.promise;
    await beforeRelease();
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
}

test("保险箱：多账号创建、编辑、显隐与锁定清除", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await setupPersonalSafe(page);
    const entryName = "合成条目" + "长名称".repeat(22);
    const longUrl = "https://example.test/" + "a".repeat(120);
    const longNote = "备注长文本".repeat(40);
    const firstPassword = "  e2e-secret-first  ";
    const secondPassword = "e2e-secret-second";
    const dialog = page.getByTestId("safe-item-dialog");
    const row = page.getByTestId("safe-item");
    const secret = page.getByTestId("secret-value");
    const newEntry = page.getByTestId("safe-new");
    const addAccount = dialog.getByRole("button", { name: "再添加一个账号" });
    const save = dialog.getByTestId("safe-save");
    const accounts = page.getByTestId("safe-accounts").getByTestId("safe-account-row");
    let reveals = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "safe.accounts.reveal") reveals++;
    });
    await newEntry.press("Enter");
    const name = dialog.getByLabel("名称（必填）");
    await expect(name).toBeFocused();
    await save.press("Enter");
    await expect(name).toBeFocused();
    await name.fill(entryName);
    await dialog.getByLabel("网址").fill(longUrl);
    await dialog.getByLabel("账号（必填）").fill("同名账号");
    await dialog.getByLabel("手机号").fill("0012345");
    await dialog.getByLabel("密码", { exact: true }).fill(firstPassword);
    await addAccount.press("Enter");
    await expect(dialog.getByLabel("账号（必填）").last()).toBeFocused();
    await dialog.getByLabel("账号（必填）").last().fill("同名账号");
    await dialog.getByLabel("密码", { exact: true }).last().fill(secondPassword);
    await dialog.getByLabel("备注").last().fill(longNote);
    await addAccount.press("Enter");
    await dialog.getByLabel("账号（必填）").last().fill("空密码账号");
    await save.press("Enter");
    await expect(row).toContainText("3 个账号");
    await expect(secret).toHaveText("••••••••");
    expect(reveals).toBe(0);
    await expect(page.getByText("0012345", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await expect(secret).toHaveJSProperty("textContent", firstPassword);
    await page.getByRole("button", { name: "隐藏密码" }).press("Enter");
    await expect(secret).toHaveText("••••••••");

    await revealAfter(page, async () => {
      await accounts.nth(1).press("Enter");
      await expect(secret).toHaveText("••••••••");
    });
    await expect(secret).toHaveText("••••••••");
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await expect(secret).toHaveText(secondPassword);
    await accounts.nth(2).press("Enter");
    await expect(secret).toHaveText("未设置");
    await expect(page.getByRole("button", { name: "显示密码" })).toBeDisabled();
    await expect(page.getByText(secondPassword, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "编辑条目" }).press("Enter");
    const changedUrl = longUrl + "/updated";
    await dialog.getByLabel("网址").fill(changedUrl);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveAccessibleName("放弃本次编辑？");
    const continueEditing = dialog.getByRole("button", { name: "继续编辑" });
    await expect(continueEditing).toBeFocused();
    await continueEditing.press("Enter");
    await expect(dialog.getByLabel("网址")).toHaveValue(changedUrl);
    await save.press("Enter");
    await expect(row).toContainText(changedUrl);
    await expect(row).toContainText("3 个账号");

    await accounts.nth(1).press("Enter");
    await page.getByRole("button", { name: "编辑账号" }).press("Enter");
    await expect(dialog.getByLabel("备注")).toHaveValue(longNote);
    await expect(dialog.getByLabel("新密码")).toHaveValue("");
    await expect(dialog.getByLabel("新密码")).toBeDisabled();
    await dialog.getByLabel("备注").fill("只更新第二个账号");
    await save.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("只更新第二个账号", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("safe-desktop-masked.png") });
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await expect(secret).toHaveText(secondPassword);
    await accounts.nth(2).press("Enter");
    await page.getByRole("button", { name: "编辑账号" }).press("Enter");
    await dialog.getByLabel("密码操作").selectOption("set");
    await dialog.getByLabel("新密码").fill("e2e-added-then-cleared");
    await save.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(secret).toHaveText("••••••••");
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await expect(secret).toHaveText("e2e-added-then-cleared");
    await page.getByRole("button", { name: "编辑账号" }).press("Enter");
    await dialog.getByLabel("密码操作").selectOption("clear");
    await save.press("Enter");
    await expect(secret).toHaveText("未设置");

    await accounts.nth(0).press("Enter");
    await expect(secret).toHaveText("••••••••");
    await expect(page.getByText("0012345", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "显示密码" }).press("Enter");
    await expect(secret).toHaveJSProperty("textContent", firstPassword);
    await page.getByRole("button", { name: "工作台", exact: true }).first().click();
    await expect(page.getByTestId("safe-unlocked")).toHaveCount(0);
    await page.getByRole("button", { name: "保险箱", exact: true }).first().click();
    await row.press("Enter");
    await expect(secret).toHaveText("••••••••");
    await page.getByRole("button", { name: "编辑账号" }).click();
    await dialog.getByLabel("密码操作").selectOption("set");
    await dialog.getByLabel("新密码").fill("draft-secret-not-saved");
    await dialog.getByRole("button", { name: "锁定保险箱" }).press("Enter");
    await expect(page.getByTestId("safe-locked")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await page.getByLabel("主密码", { exact: true }).fill("wrong password!");
    await page.getByRole("button", { name: "解锁保险箱" }).click();
    await expect(page.getByText("主密码不正确")).toBeVisible();
    await page.getByLabel("主密码", { exact: true }).fill(safeMaster);
    await page.getByRole("button", { name: "解锁保险箱" }).click();
    await expect(page.getByTestId("safe-unlocked")).toBeVisible({ timeout: 15_000 });

    await row.press("Enter");
    await expect(secret).toHaveText("••••••••");
    await revealAfter(page, async () => {
      const endpoint = await page.evaluate(() => window.huhuHost.engine());
      const response = await page.request.post(`${endpoint.baseUrl}/api/v1/call`, {
        headers: { authorization: `Bearer ${endpoint.token}` },
        data: { capability: "safe.lock", input: {}, requestId: "external-safe-lock" },
      });
      expect(await response.json()).toMatchObject({ ok: true });
      await expect(page.getByTestId("safe-locked")).toBeVisible({ timeout: 2500 });
    });
    await expect(secret).toHaveCount(0);

    const markers = [firstPassword.trim(), secondPassword, "e2e-added-then-cleared", "draft-secret-not-saved", entryName, changedUrl, longNote];
    const all: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (markers.some((marker) => readFileSync(p).includes(marker))) all.push(p);
      }
    };
    walk(vault);
    expect(all).toEqual([]);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("保险箱：按指定账号删除，最后一个账号单独确认并可取消", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await setupPersonalSafe(page);
    const endpoint = await page.evaluate(() => window.huhuHost.engine());
    async function call<T>(capability: string, input: object): Promise<T> {
      const result = await page.request.post(`${endpoint.baseUrl}/api/v1/call`, {
        headers: { authorization: `Bearer ${endpoint.token}` },
        data: { capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() },
      });
      const reply = (await result.json()) as { ok: boolean; data: T };
      expect(reply.ok).toBe(true);
      return reply.data;
    }
    const session = await call<{ instanceId: string; generation: number }>("safe.status", {});
    const accounts = [
      { account: "同名账号", note: "甲一" },
      { account: "同名账号", note: "甲二" },
    ];
    await call("safe.entries.create", { session, expectedRevision: 0, name: "站点甲", accounts });
    await call("safe.entries.create", { session, expectedRevision: 1, name: "站点乙", accounts });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "保险箱", exact: true }).first().click();
    const sites = page.getByTestId("safe-item");
    const alpha = sites.filter({ hasText: "站点甲" });
    const beta = sites.filter({ hasText: "站点乙" });
    await alpha.click();
    const choices = page.getByTestId("safe-accounts").getByTestId("safe-account-row");
    await choices.nth(1).click();
    await expect(page.getByText("甲二", { exact: true })).toBeVisible();
    const dialog = page.getByTestId("safe-remove-confirmation");
    await page.getByRole("button", { name: "删除账号", exact: true }).click();
    await expect(dialog).toContainText("站点甲");
    await dialog.getByRole("button", { name: "确认删除账号" }).click();
    await expect(choices).toHaveCount(1);
    await expect(page.getByText("甲一", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "删除账号", exact: true }).click();
    await expect(dialog).toContainText("仅剩的账号");
    await dialog.getByRole("button", { name: "删除整个条目…" }).click();
    await expect(dialog).toContainText("1 个账号");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(alpha).toBeVisible();
    await page.getByRole("button", { name: "删除条目", exact: true }).click();
    await dialog.getByRole("button", { name: "确认删除条目" }).click();
    await expect(alpha).toHaveCount(0);
    await expect(beta).toContainText("2 个账号");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("保险箱：本机 Web 邀请加入后可初始化、锁定并解锁", async () => {
  const chrome = process.platform === "win32" ? path.join(process.env["ProgramFiles"] ?? "C:/Program Files", "Google/Chrome/Application/chrome.exe") : "";
  const executablePath = [chrome, chromium.executablePath()].find((file) => file && existsSync(file));
  test.skip(!executablePath, "需要本机 Chrome 或 Playwright Chromium");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByRole("tab", { name: "服务端" }).click();
    const share = page.getByTestId("web-share-panel");
    await expect(share.getByRole("combobox", { name: "分享范围" })).toHaveValue("lan");
    await share.getByRole("combobox", { name: "分享范围" }).selectOption("local");
    await expect(share.getByRole("combobox", { name: "分享范围" })).toHaveValue("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await share.getByRole("button", { name: "创建邀请" }).click();
    const invitation = page.getByRole("dialog", { name: "Web 邀请链接" });
    const link = await invitation.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
    await invitation.getByRole("button", { name: "完成" }).click();
    expect(new URL(link).hostname).toBe("127.0.0.1");

    const browser = await chromium.launch({ executablePath: executablePath!, headless: true });
    try {
      const tab = await browser.newPage();
      await tab.goto(link);
      await expect(tab.getByTestId("home-dashboard")).toBeVisible();
      await tab.getByRole("button", { name: "保险箱", exact: true }).first().click();
      await expect(tab.getByTestId("safe-setup")).toBeVisible();
      await tab.getByLabel("主密码", { exact: true }).fill(safeMaster);
      await tab.getByLabel("确认主密码").fill(safeMaster);
      await tab.getByLabel("我已了解").check();
      await tab.getByRole("button", { name: "创建保险箱" }).click();
      await expect(tab.getByTestId("safe-unlocked")).toBeVisible();
      await tab.getByRole("button", { name: "手动锁定" }).click();
      await expect(tab.getByTestId("safe-locked")).toBeVisible();
      await tab.getByLabel("主密码", { exact: true }).fill(safeMaster);
      await tab.getByRole("button", { name: "解锁保险箱" }).click();
      await expect(tab.getByTestId("safe-unlocked")).toBeVisible();
      await tab.getByRole("button", { name: "工作台", exact: true }).first().click();
      await expect(tab.getByTestId("home-dashboard")).toBeVisible();
    } finally {
      await browser.close();
    }
    await share.getByRole("button", { name: "停止分享" }).click();
    await page.getByRole("dialog", { name: "停止 Web 分享" }).getByRole("button", { name: "确认停止" }).click();
    await expect(share.getByText("已停止", { exact: true })).toBeVisible();
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("保险箱：窄窗创建三账号，保存回执丢失与编辑冲突", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  let cleanupPage: Page | undefined;
  let failed = false;
  const cleanupErrors: unknown[] = [];
  try {
    const page = await app.firstWindow();
    cleanupPage = page;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([390, 844]);
    await setupPersonalSafe(page);
    const dialog = page.getByTestId("safe-item-dialog");
    const name = dialog.getByLabel("名称（必填）");
    const save = dialog.getByTestId("safe-save");
    const row = page.getByTestId("safe-item");
    const match = "**/api/v1/call";
    const entryName = "窄窗长名称".repeat(15);
    let dropReceipt = true;
    await page.route(match, async (route) => {
      if (!dropReceipt || route.request().postDataJSON()?.capability !== "safe.entries.create") return route.continue();
      dropReceipt = false;
      const response = await route.fetch();
      try {
        expect(await response.json()).toMatchObject({ ok: true });
        await route.abort();
      } finally {
        await response.dispose();
      }
    });
    await page.getByTestId("safe-new").press("Enter");
    await name.fill(entryName);
    await dialog.getByLabel("网址").fill("https://example.test/" + "x".repeat(180));
    for (let index = 0; index < 3; index++) {
      if (index) await dialog.getByRole("button", { name: "再添加一个账号" }).press("Enter");
      await dialog
        .getByLabel("账号（必填）")
        .last()
        .fill(`窄窗账号 ${index + 1}`);
    }
    await save.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("未收到保存确认");
    await expect(name).toHaveValue(entryName);
    await save.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("版本已变化");
    await dialog.getByRole("button", { name: "核对当前条目" }).press("Enter");
    await expect(dialog.getByRole("status")).toContainText("已刷新条目列表");
    await expect(save).toBeDisabled();
    await expect(name).toHaveValue(entryName);
    await dialog.getByRole("button", { name: "取消编辑" }).press("Enter");
    await dialog.getByRole("button", { name: "放弃更改" }).press("Enter");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("3 个账号");
    await row.press("Enter");
    await expect(page.getByRole("heading", { name: entryName })).toBeFocused();
    await expect(row).toBeHidden();
    await page.getByRole("button", { name: "返回条目" }).press("Enter");
    await expect(row).toBeFocused();
    await row.press("Enter");
    await expect(page.getByTestId("safe-unlocked")).toBeVisible();
    await expect.poll(() => page.getByTestId("safe-unlocked").evaluate((grid) => grid.scrollWidth - grid.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath("safe-narrow-detail.png") });

    const endpoint = await page.evaluate(() => window.huhuHost.engine());
    let commitCompetingEdit = true;
    await page.route(match, async (route) => {
      const body = route.request().postDataJSON();
      if (!commitCompetingEdit || body?.capability !== "safe.entries.update") return route.fallback();
      commitCompetingEdit = false;
      const response = await page.request.post(`${endpoint.baseUrl}/api/v1/call`, {
        headers: { authorization: `Bearer ${endpoint.token}` },
        data: { ...body, requestId: "safe-test-competing-edit", input: { ...body.input, name: "另一窗口已保存" } },
      });
      expect(await response.json()).toMatchObject({ ok: true });
      await route.continue();
    });
    await page.getByRole("button", { name: "编辑条目" }).press("Enter");
    await name.fill("冲突时保留本次编辑");
    await save.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("版本已变化");
    await expect(name).toHaveValue("冲突时保留本次编辑");
    await dialog.getByRole("button", { name: "重读当前版本" }).press("Enter");
    await dialog.getByRole("button", { name: "重读并替换表单" }).press("Enter");
    await expect(name).toHaveValue("另一窗口已保存");
    await name.fill("重新核对后保存");
    await save.press("Enter");
    await expect(page.getByRole("heading", { name: "重新核对后保存" })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "手动锁定" }).click();
    await expect(page.getByTestId("safe-locked")).toBeVisible();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await cleanupPage?.unrouteAll({ behavior: "ignoreErrors" });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await app.close();
      rmTree(vault);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (failed && cleanupErrors.length) {
      await test
        .info()
        .attach("safe-narrow-cleanup", { body: cleanupErrors.map(String).join("\n"), contentType: "text/plain" })
        .catch(() => {});
    }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "窄窗验收清理失败");
});

test("设置与通知：切换主题立即生效并持久化，重启后仍保持；通知入口显示未读", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("theme-vercel").click();
    await page.getByRole("tab", { name: "深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "vercel");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).appearance).toMatchObject({ theme: "vercel", mode: "dark" });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "vercel", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");

    // 通知：任务提醒到点 → 状态栏出现未读
    await page.getByRole("button", { name: "任务" }).first().click();
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();
    await expect(page.getByText("没有通知")).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmTree(vault);
  }
});

test("插件中心：停用知识库后 rail 项消失，依赖提示；重启后保持；再启用恢复", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "知识库" }).first()).toBeVisible();
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.locator('[data-plugin="notes"]').click();
    await expect(page.getByTestId("plugin-capabilities")).toContainText("notes.create"); // 已注册能力
    await expect(page.getByTestId("plugin-open")).toBeVisible();
    await page.getByRole("switch", { name: "停用 知识库" }).click();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/plugins.json"), "utf8")).builtin.notes).toEqual({ enabled: false });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "插件中心" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.locator('[data-plugin="notes"]').click();
    await page.getByRole("switch", { name: "启用 知识库" }).click();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toBeVisible({ timeout: 5000 });
  } finally {
    await app.close().catch(() => undefined);
    rmTree(vault);
  }
});

test("首页与健康中心：卡片反映真实数据；坏文件出现在健康检查里", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  mkdirSync(path.join(vault, "Tasks"), { recursive: true });
  writeFileSync(path.join(vault, "Tasks", "broken.md"), "---\na: [1\n---\n"); // 无法解析的任务文件
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("card-open").locator("strong")).toContainText("0");
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    await page.getByTestId("task-editor").getByLabel("任务名称").fill("首页测试任务");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await page.getByRole("button", { name: "工作台", exact: true }).first().click();
    await expect(page.getByTestId("card-open").locator("strong")).toContainText("1");
    await page.getByRole("button", { name: "健康中心" }).first().click();
    // 未运行诊断前是“尚未检查”，所有项为“未检查”，不显示“正常”（ACC-SY-01）
    await expect(page.getByTestId("health-overall")).toHaveText("尚未检查");
    await expect(page.getByTestId("health-check").first()).toHaveAttribute("data-status", "unchecked");
    await page.getByTestId("health-run").click();
    // 总体状态取最差的一项：坏文件是 warning；本机 Herdr Core 偶尔没来得及拉起时还会有 error，这里只断言不是“正常”
    await expect(page.getByTestId("health-overall")).toHaveText(/有需要(留意的项目|处理的问题)/);
    await expect(page.getByTestId("health-check").filter({ hasText: "broken.md" })).toHaveAttribute("data-status", "warning");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("ACC-AG-04 Agent CLI：在 Space 里启动 shell，经 xterm 输入并看到输出；关闭视图后进程仍在，可重新打开", async () => {
  test.skip(!existsSync(HERDR), "需要编译好的 Herdr Core");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("echo E2E-TERM-$((6*7))");
    await page.keyboard.press("Enter");
    await expect(page.locator(".xterm-rows")).toContainText("E2E-TERM-42", { timeout: 10_000 });
    // 切换到别的模块（视图卸载 = detach），再回来：同一个会话仍在运行
    await page.getByRole("button", { name: "工作台", exact: true }).first().click();
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("session-tab")).toHaveCount(1);
    await page.getByTestId("session-tab").click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("echo STILL-HERE");
    await page.keyboard.press("Enter");
    await expect(page.locator(".xterm-rows")).toContainText("STILL-HERE", { timeout: 10_000 });
  } finally {
    await app.close();
    // 结束这个 Vault 的 Herdr Core 实例
    try {
      const id = JSON.parse(readFileSync(path.join(vault, ".huhu/vault.json"), "utf8")).id as string;
      const { spawnSync } = await import("node:child_process");
      const runtime = path.join(vault, ".huhu/runtime", readdirSync(path.join(vault, ".huhu/runtime"))[0] as string, "herdr");
      const sock = path.join(process.env["XDG_RUNTIME_DIR"] ?? tmpdir(), `huhu-${id.replace(/^vault-/, "").slice(0, 8)}-${readdirSync(path.join(vault, ".huhu/runtime"))[0]?.slice(0, 4)}.sock`);
      spawnSync(HERDR, ["server", "stop"], { env: { ...process.env, HC_SESSION: "huhu", HC_SOCKET: sock, XDG_STATE_HOME: path.join(runtime, "state"), XDG_CONFIG_HOME: path.join(runtime, "config") } });
    } catch {
      /* 清理尽力而为 */
    }
    rmTree(vault);
  }
});

test("远程连接：使用模块密码完成指纹确认、Exec、交互终端和 SFTP", async () => {
  const { startFakeSsh } = await import("../../plugins/ssh/test/fake-server.js");
  const srv = await startFakeSsh({ password: "e2e-ssh-pw" });
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "远程连接" }).first().click();
    await page.getByRole("button", { name: "新增 SSH 主机" }).click();
    const hostDialog = page.getByTestId("ssh-host-dialog");
    await hostDialog.getByLabel("显示名称").fill("测试机");
    await hostDialog.getByLabel("主机名或 IP").fill("127.0.0.1");
    await hostDialog.getByLabel("端口", { exact: true }).fill(String(srv.port));
    await hostDialog.getByLabel("用户名").fill("u");
    await hostDialog.getByLabel("密码", { exact: true }).fill("e2e-ssh-pw");
    await hostDialog.getByRole("button", { name: "新增主机" }).click();
    await expect(page.getByRole("button", { name: /测试机/ })).toBeVisible();

    await page.getByRole("button", { name: "连接", exact: true }).click();
    await expect(page.getByTestId("hostkey-dialog")).toContainText("SHA256:");
    await page.getByRole("button", { name: "信任并连接" }).click();
    await expect(page.getByRole("button", { name: "断开" })).toBeVisible({ timeout: 10_000 });
    expect(readFileSync(path.join(vault, ".huhu/ssh/known_hosts"), "utf8")).toContain("ssh-ed25519");

    await page.getByRole("tab", { name: "Exec" }).click();
    await page.getByLabel("命令", { exact: true }).fill("echo 来自远端");
    await page.getByRole("button", { name: "运行" }).click();
    await expect(page.getByTestId("exec-output")).toContainText("来自远端");
    await expect(page.getByTestId("exec-output")).toContainText("退出码: 0");

    await page.getByRole("tab", { name: "交互终端" }).click();
    await page.getByRole("button", { name: "新建终端" }).first().click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 10_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("Z"); // 假服务器按收到的每个按键回显 ECHO:<按键>
    await expect(page.locator(".xterm-rows")).toContainText("ECHO:Z", { timeout: 10_000 });

    // SFTP 接续当前连接。传输冲突和文件变更由 ssh-workspaces.spec.ts 覆盖。
    await page.getByRole("tab", { name: "文件" }).click();
    srv.fs.files.set("/home/test/说明.txt", Buffer.from("远端说明文件"));
    const files = page.getByTestId("files-panel");
    await files.getByRole("button", { name: "刷新" }).click();
    await expect(files.getByTestId("files-path")).toHaveText("/home/test");
    await expect(files.getByTestId("files-row").filter({ hasText: "说明.txt" })).toBeVisible();
    await files.getByTestId("files-open").filter({ hasText: "说明.txt" }).click();
    await expect(files.getByTestId("files-preview")).toHaveText("远端说明文件");

    const local = path.join(vault, "上传.txt");
    writeFileSync(local, "来自本机");
    await files.getByTestId("files-upload-from").fill(local);
    await files.getByTestId("files-upload-go").click();
    await expect(files.getByTestId("files-note")).toHaveText("已加入传输中心");
    await expect.poll(() => srv.fs.files.get("/home/test/上传.txt")?.toString(), { timeout: 10_000 }).toBe("来自本机");
    await files.getByRole("button", { name: "刷新" }).click();
    await expect(files.getByTestId("files-row").filter({ hasText: "上传.txt" })).toBeVisible();
  } finally {
    await app.close();
    await srv.close();
    rmTree(vault);
  }
});

test("Agent CLI 历史：列出 Space 目录下 Claude 与 Codex 的原生历史会话（只读扫描），其他目录的会话不出现", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const cfg = mkdtempSync(path.join(tmpdir(), "huhu-e2e-claude-"));
  const cx = mkdtempSync(path.join(tmpdir(), "huhu-e2e-codex-"));
  const cwd = realpathSync(vault);
  const bucket = path.join(cfg, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(bucket, { recursive: true });
  writeFileSync(path.join(bucket, "claude-sess-1.jsonl"), `${JSON.stringify({ type: "user", cwd, sessionId: "claude-sess-1", message: { role: "user", content: "梳理发布清单" } })}\n`);
  mkdirSync(path.join(cx, "sessions", "2026", "11", "09"), { recursive: true });
  const row = (r: unknown) => `${JSON.stringify(r)}\n`;
  writeFileSync(
    path.join(cx, "sessions", "2026", "11", "09", "rollout-2026-11-09T10-00-00-codex-1.jsonl"),
    row({ type: "session_meta", payload: { id: "codex-1", cwd } }) + row({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "修复登录页" }] } }),
  );
  writeFileSync(path.join(cx, "sessions", "2026", "11", "09", "rollout-2026-11-09T11-00-00-codex-2.jsonl"), row({ type: "session_meta", payload: { id: "codex-2", cwd: tmpdir() } })); // 不在这个 Space
  const app = await launch(vault, { CLAUDE_CONFIG_DIR: cfg, CODEX_HOME: cx });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("agent-cli-module")).toBeVisible();
    await expect(page.getByTestId("history-item")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId("history-title").filter({ hasText: "梳理发布清单" })).toBeVisible();
    await expect(page.getByTestId("history-title").filter({ hasText: "修复登录页" })).toBeVisible();
    for (const row of await page.getByTestId("history-item").all()) {
      const resume = row.getByTestId("history-resume");
      await expect(resume).toBeDisabled();
      await expect(resume).toHaveAccessibleDescription(/没有有效的原生会话 UUID，仅可预览/);
    }
    // 恢复入口只对白名单里的会话开放：未知 id 被后端拒绝
    const err = await page.evaluate(async () => {
      const ep = await window.huhuHost.engine();
      const spaces = (
        await (
          await fetch(`${ep.baseUrl}/api/v1/call`, {
            method: "POST",
            headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
            body: JSON.stringify({ capability: "agent.spaces.list", input: {}, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
          })
        ).json()
      ).data as { id: string; revision: number }[];
      const sp = spaces[0] as { id: string; revision: number };
      const r = await fetch(`${ep.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          capability: "agent.history.resume",
          input: { spaceId: sp.id, spaceRevision: sp.revision, provider: "claude", nativeSessionId: "不存在的会话", requestId: crypto.randomUUID() },
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      return ((await r.json()) as { error?: { code: string } }).error?.code;
    });
    expect(err).toBe("INVALID_INPUT");
  } finally {
    await app.close();
    for (const d of [vault, cfg, cx]) rmTree(d);
  }
});

test("Agent CLI 历史：Codex 和 Pi 在大量其他 Space 记录中分页并预览旧会话", async () => {
  test.setTimeout(60_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-e2e-history-"));
  const profile = path.join(fixture, "codex");
  const codex = path.join(profile, "sessions", "2026", "09", "01");
  const pi = path.join(fixture, "pi");
  const cwd = realpathSync(vault);
  const outside = realpathSync(fixture);
  const jsonl = (...rows: unknown[]) => rows.map((row) => JSON.stringify(row) + "\n").join("");
  let app: ElectronApplication | undefined;
  let browser: Browser | undefined;
  async function checkHistory(page: Page) {
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByRole("heading", { name: "共 52 条记录，显示第 1–50 条" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("history-item")).toHaveCount(50);
    await page.getByRole("group", { name: "历史分页" }).getByRole("button", { name: "下一页" }).click();
    await expect(page.getByRole("heading", { name: "共 52 条记录，显示第 51–52 条" })).toBeVisible();
    for (const title of ["Codex 原有记录", "Pi 原有记录"]) {
      await page.getByRole("button", { name: `查看记录 ${title}`, exact: true }).click();
      const dialog = page.getByTestId("history-transcript");
      await expect(dialog.getByTestId("transcript-message")).toContainText(title);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
  try {
    mkdirSync(codex, { recursive: true });
    mkdirSync(pi);
    const old = new Date("2026-09-01T00:00:00Z");
    const original = path.join(codex, "rollout-2026-09-01T00-00-00-f09-codex.jsonl");
    writeFileSync(original, jsonl({ type: "session_meta", payload: { id: "f09-codex", cwd } }, { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Codex 原有记录" }] } }));
    const originalPi = path.join(pi, "original.jsonl");
    const writePi = (file: string, id: string, dir: string, title: string) => writeFileSync(file, jsonl({ type: "session", version: 3, id, cwd: dir }, { type: "message", message: { role: "user", content: title } }));
    writePi(originalPi, "f09-pi", cwd, "Pi 原有记录");
    utimesSync(original, old, old);
    utimesSync(originalPi, old, old);
    for (let i = 0; i < 2001; i++) {
      writeFileSync(path.join(codex, `rollout-outside-${i}.jsonl`), jsonl({ type: "session_meta", payload: { id: `outside-${i}`, cwd: outside } }));
      writePi(path.join(pi, `outside-${i}.jsonl`), `outside-${i}`, outside, "不相关记录");
    }
    for (let i = 0; i < 50; i++) writePi(path.join(pi, `inside-${i}.jsonl`), `inside-${i}`, cwd, `较新记录 ${i}`);

    app = await launch(vault, { CODEX_HOME: profile, PI_CODING_AGENT_SESSION_DIR: pi, CLAUDE_CONFIG_DIR: path.join(fixture, "empty") });
    const page = await app.firstWindow();
    await engineReady(page);
    await checkHistory(page);
    expect(await call(page, "web.share.start", { mode: "local", port: 0 })).toMatchObject({ state: "running" });
    const { links } = await call<{ links: string[] }>(page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    await web.goto(links[0]!);
    await checkHistory(web);
  } finally {
    await browser?.close();
    await app?.close();
    rmTree(vault);
    rmTree(fixture);
  }
});

test("Agent CLI 历史：Claude 与 Codex 在原目录创建独立分支，恢复原会话并定位分栏", async () => {
  test.skip(process.platform !== "linux" || !existsSync(HERDR), "此隔离夹具使用 Linux CLI 和本地 Core");
  test.setTimeout(90_000);
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-native-history-")));
  const vault = path.join(base, "vault");
  const cwd = path.join(vault, "project");
  const cc = path.join(base, "Claude data");
  const cx = path.join(base, "Codex data");
  const bucket = path.join(cc, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  const rollouts = path.join(cx, "sessions", "2026", "11", "21");
  for (const dir of [cwd, bucket, rollouts]) mkdirSync(dir, { recursive: true });
  const claudeId = "79fc8333-8db7-463a-a6d6-02fbb2216496";
  const codexId = "01998fe4-0316-7140-97c3-74965ba41745";
  const codexChild = "01998fe4-0316-7140-97c3-74965ba41746";
  const codexPath = (id: string) => path.join(rollouts, `rollout-2026-11-21T10-00-00-${id}.jsonl`);
  const claudeSource = path.join(bucket, claudeId + ".jsonl");
  const claudeOriginal = JSON.stringify({ type: "user", cwd, message: { role: "user", content: "Claude 原始历史" } }) + "\n";
  const codexOriginal =
    [
      { type: "session_meta", payload: { id: codexId, cwd } },
      { type: "event_msg", payload: { type: "user_message", message: "Codex 原始历史" } },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n";
  writeFileSync(claudeSource, claudeOriginal);
  writeFileSync(codexPath(codexId), codexOriginal);
  const claude = path.join(base, "claude.cjs");
  const codex = path.join(base, "codex.cjs");
  writeFileSync(
    claude,
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const a = process.argv.slice(2);
const output = (text) => fs.writeSync(1, text + "\\n");
if (a[0] === "--version") output("2.1.211 (Claude Code)");
else if (a[0] === "--help") output("  -r, --resume [id]\\n  --fork-session\\n  --session-id <uuid>");
else if (a[a.indexOf("--resume") + 1] === ${JSON.stringify(claudeId)} && process.cwd() === ${JSON.stringify(cwd)}) {
  if (a.includes("--fork-session")) fs.copyFileSync(${JSON.stringify(claudeSource)}, path.join(${JSON.stringify(bucket)}, a[a.indexOf("--session-id") + 1] + ".jsonl"), fs.constants.COPYFILE_EXCL);
  console.log("Claude fixture ready");
  setInterval(() => {}, 1000);
} else process.exit(1);
`,
    { mode: 0o755 },
  );
  writeFileSync(
    codex,
    `#!${process.execPath}
const fs = require("node:fs");
const a = process.argv.slice(2);
const source = { id: ${JSON.stringify(codexId)}, path: ${JSON.stringify(codexPath(codexId))}, cwd: ${JSON.stringify(cwd)} };
const child = { id: ${JSON.stringify(codexChild)}, path: ${JSON.stringify(codexPath(codexChild))}, cwd: source.cwd, forkedFromId: source.id };
const output = (text) => fs.writeSync(1, text + "\\n");
if (a[0] === "--version") output("codex-cli 0.170.0");
else if (a[1] === "--help") output(a[0] === "resume" ? "Usage: codex resume [SESSION_ID]" : "  --listen <URL>");
else if (process.env.CODEX_HOME !== ${JSON.stringify(cx)} || process.cwd() !== source.cwd) process.exit(1);
else if (a[0] === "app-server") {
const handle = (line) => {
  const { id, method, params } = JSON.parse(line);
  if (!id) return;
  let result;
  if (method === "initialize") result = {};
  if (method === "thread/read" && params.threadId === source.id) result = { thread: source };
  if (method === "thread/fork" && params.path === source.path && params.deferGoalContinuation) {
    fs.writeFileSync(child.path, JSON.stringify({ type: "session_meta", payload: { id: child.id, cwd: child.cwd } }) + "\\n", { flag: "wx" });
    result = { thread: child };
  }
  output(JSON.stringify(result ? { id, result } : { id, error: { message: "unexpected history call" } }));
};
const chunk = Buffer.alloc(4096);
let remaining = "";
for (let length; (length = fs.readSync(0, chunk));) {
  const lines = (remaining + chunk.toString("utf8", 0, length)).split("\\n");
  remaining = lines.pop();
  for (const line of lines) handle(line);
}
}
else if (a[0] === "resume" && [source.id, child.id].includes(a[1])) {
  console.log("Codex fixture ready");
  setInterval(() => {}, 1000);
} else process.exit(1);
`,
    { mode: 0o755 },
  );
  const app = await launch(vault, { CLAUDE_CONFIG_DIR: cc, CODEX_HOME: cx, PI_CODING_AGENT_SESSION_DIR: path.join(base, "no-pi-history") });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    async function call<T>(capability: string, input: object = {}): Promise<T> {
      const result = await page.evaluate(
        async ({ capability, input }) => {
          const ep = await window.huhuHost.engine();
          const id = crypto.randomUUID();
          const response = await fetch(`${ep.baseUrl}/api/v1/call`, {
            method: "POST",
            headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
            body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
          });
          return (await response.json()) as CapabilityResult<unknown>;
        },
        { capability, input },
      );
      expect(result.ok, JSON.stringify(result)).toBe(true);
      return (result as { data: T }).data;
    }
    await call("agent.settings.update", { expectedRevision: 0, defaultAgent: null, agents: { claude: { command: claude }, codex: { command: codex }, pi: { enabled: false } } });
    const [space] = await call<{ id: string; name: string; revision: number }[]>("agent.spaces.list");
    expect(space).toBeDefined();
    await call("agent.spaces.save", { id: space!.id, name: space!.name, root: cwd, expectedRevision: space!.revision });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const confirm = page.getByTestId("history-launch");
    const historyRow = (title: string) => page.getByTestId("history-item").filter({ hasText: title });
    const search = page.getByRole("searchbox", { name: "搜索会话历史" });
    const sessions = () => call<{ id: string; nativeSessionId?: string; state: string; cwd: string }[]>("agent.sessions.list", { spaceId: space!.id });
    for (const original of [
      { title: "Claude 原始历史", id: claudeId },
      { title: "Codex 原始历史", id: codexId },
    ]) {
      await search.fill(original.id);
      await historyRow(original.title).getByTestId("history-view").click();
      await page.getByTestId("history-fork").click();
      await expect(confirm.getByLabel("打开位置")).toHaveValue("tab");
      await confirm.getByRole("button", { name: "创建分支" }).click();
      let childId = codexChild;
      if (original.id === claudeId) {
        const children = () => readdirSync(bucket).filter((name) => name.endsWith(".jsonl") && name !== claudeId + ".jsonl");
        await expect.poll(children).toHaveLength(1);
        childId = path.basename(children()[0]!, ".jsonl");
      }
      expect(childId).not.toBe(original.id);
      await expect.poll(async () => (await sessions()).find(({ nativeSessionId }) => nativeSessionId === childId)).toMatchObject({ state: "running", cwd });
      await historyRow(original.title).getByTestId("history-resume").click();
      await confirm.getByLabel("打开位置").selectOption("pane");
      await confirm.getByRole("button", { name: "恢复会话" }).click();
      await expect.poll(async () => (await sessions()).find(({ nativeSessionId }) => nativeSessionId === original.id)).toMatchObject({ state: "running", cwd });
      const restored = (await sessions()).find(({ nativeSessionId }) => nativeSessionId === original.id)!;
      await page.getByTestId("history-item").getByTestId("history-locate").click();
      await expect(page.getByTestId("workspace-pane").and(page.locator(`[data-session-id="${restored.id}"]`))).toHaveAttribute("data-active", "true");
      await page.getByTestId("agent-history-toggle").click();
      await expect(search).toBeVisible();
      await search.clear();
    }
    expect(readFileSync(claudeSource, "utf8")).toBe(claudeOriginal);
    expect(readFileSync(codexPath(codexId), "utf8")).toBe(codexOriginal);
    expect(await sessions()).toHaveLength(4);
  } finally {
    await app.close();
    rmTree(base);
  }
});

test("Agent CLI 历史：在 Windows 原生 Pi 上分支、恢复并跨 Space 定位原分栏", async () => {
  const piCommand = process.env["HUHU_PI_HISTORY_E2E"];
  test.skip(!piCommand || !existsSync(piCommand) || !existsSync(HERDR), "需要独立的 Pi CLI 与本地 Core");
  test.setTimeout(90_000);
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-pi-history-")));
  const vault = path.join(base, "Vault");
  const other = path.join(base, "其他 Space");
  const agentDir = path.join(base, "pi-config");
  const historyDir = path.join(base, "pi history");
  for (const dir of [vault, other, agentDir, historyDir]) mkdirSync(dir);
  writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ cacheWarming: "off", defaultProjectTrust: "never", enableInstallTelemetry: false, httpProxy: "http://127.0.0.1:9" }));
  const source = path.join(historyDir, "origin 中文.jsonl");
  const time = "2026-11-01T10:00:00.000Z";
  const rows = [
    { type: "session", version: 3, id: "history-original-a", timestamp: time, cwd: vault },
    { type: "message", id: "p1", parentId: null, timestamp: time, message: { role: "user", content: "Pi 原始消息", timestamp: Date.parse(time) } },
  ];
  const original = rows.map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(source, original);
  const app = await launch(vault, { CLAUDE_CONFIG_DIR: agentDir, CODEX_HOME: agentDir, PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: historyDir });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    async function call<T>(capability: string, input: object = {}) {
      return page.evaluate(
        async ({ capability, input }) => {
          const ep = await window.huhuHost.engine();
          const id = crypto.randomUUID();
          return (await (
            await fetch(`${ep.baseUrl}/api/v1/call`, {
              method: "POST",
              headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
              body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
            })
          ).json()) as { ok: boolean; data: T; error?: { code: string; message: string } };
        },
        { capability, input },
      );
    }
    const set = await call("agent.settings.update", { expectedRevision: 0, defaultAgent: null, agents: { pi: { command: piCommand, args: ["--no-extensions", "--no-tools"] } } });
    expect(set.ok, set.error?.message).toBe(true);
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const originSpace = page.getByTestId("agent-space-item").first();
    const originName = await originSpace.locator("strong").textContent();
    const entries = page.getByTestId("history-item");
    const entry = entries.filter({ hasText: "Pi 原始消息" });
    await expect(entry).toHaveCount(1);
    await entry.getByTestId("history-view").click();
    await expect(page.getByTestId("history-transcript").getByTestId("transcript-message")).toContainText("Pi 原始消息");
    expect(readFileSync(source, "utf8")).toBe(original);
    await page.getByTestId("history-fork").click();
    const confirm = page.getByTestId("history-launch");
    await expect(confirm.getByLabel("打开位置")).toHaveValue("tab");
    await confirm.getByRole("button", { name: "创建分支" }).click();
    await expect.poll(() => readdirSync(historyDir).filter((name) => name.endsWith(".jsonl")).length, { timeout: 20_000 }).toBe(2);
    const forkFile = readdirSync(historyDir).find((name) => name.endsWith(".jsonl") && name !== path.basename(source));
    const fork = JSON.parse(readFileSync(path.join(historyDir, forkFile!), "utf8").split("\n")[0]!) as { id: string; cwd: string; parentSession: string };
    expect(fork.id).toMatch(/^huhu-/);
    expect(path.relative(vault, fork.cwd)).toBe("");
    expect(path.relative(source, fork.parentSession)).toBe("");
    expect(readFileSync(source, "utf8")).toBe(original);

    const originalRow = entries.filter({ hasText: "Pi 原始消息" }).filter({ has: page.getByTestId("history-resume").and(page.locator(":enabled")) });
    await originalRow.getByTestId("history-resume").click();
    await confirm.getByLabel("打开位置").selectOption("pane");
    await confirm.getByRole("button", { name: "恢复会话" }).click();
    const spaces = await call<{ id: string; name: string; revision: number }[]>("agent.spaces.list");
    const originalSpaceId = spaces.data.find((space) => space.name === originName)!.id;
    type AgentSession = { id: string; state: string; terminalId: string; nativeSessionId?: string };
    const list = () => call<AgentSession[]>("agent.sessions.list", { spaceId: originalSpaceId });
    await expect.poll(async () => (await list()).data.find((x) => x.nativeSessionId === "history-original-a")?.state).toBe("running");
    const originalBinding = (await list()).data.find((x) => x.nativeSessionId === "history-original-a")!;
    const pane = page.getByTestId("workspace-pane").and(page.locator(`[data-session-id="${originalBinding.id}"]`));
    await expect(pane).toBeVisible();
    await page.getByTestId("space-new").click();
    const newSpace = page.getByTestId("space-dialog");
    await newSpace.getByLabel("Space 名称").fill("验证其他空间");
    await newSpace.getByLabel("工作目录", { exact: true }).fill(other);
    await newSpace.getByTestId("space-save").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "验证其他空间" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("combobox", { name: /范围/ }).selectOption("all");
    await page.getByRole("searchbox", { name: "搜索会话历史" }).fill("history-original-a");
    await expect(entries).toHaveCount(1);
    await entries.getByTestId("history-locate").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: originName! })).toHaveAttribute("aria-pressed", "true");
    await expect(pane).toHaveAttribute("data-active", "true");
    const relocated = (await list()).data;
    expect(relocated).toHaveLength(2);
    expect(relocated.find(({ id }) => id === originalBinding.id)?.terminalId).toBe(originalBinding.terminalId);
    expect(readFileSync(source, "utf8").startsWith(original)).toBe(true);

    const child = relocated.find(({ nativeSessionId }) => nativeSessionId === fork.id)!;
    expect(child.state).toBe("running");
    type HistoryRow = { historyId: string; revision: string; title: string; active: boolean; possiblyActive: boolean; canResume: boolean; canFork: boolean };
    const forkSnapshot = async () => (await call<{ entries: HistoryRow[] }>("agent.history.list", { spaceId: originalSpaceId, provider: "pi", query: fork.id })).data.entries[0];
    await expect.poll(forkSnapshot).toBeDefined();
    const originalFork = (await forkSnapshot())!;
    const childPath = path.join(historyDir, forkFile!);
    renameSync(childPath, childPath + ".saved");
    writeFileSync(childPath, [fork, { ...rows[1], message: { ...rows[1]!.message, content: "Pi 替换分支样本" } }].map((row) => JSON.stringify(row)).join("\n") + "\n");
    await expect.poll(forkSnapshot, { timeout: 8_000 }).toMatchObject({ title: "Pi 替换分支样本", active: false, possiblyActive: true, canResume: false, canFork: false });
    const replacement = (await forkSnapshot())!;
    expect(replacement.historyId).not.toBe(originalFork.historyId);
    const ref = { spaceId: originalSpaceId, provider: "pi", nativeSessionId: fork.id, historyId: replacement.historyId, historyRevision: replacement.revision };
    expect(await call("agent.history.locate", ref)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const launch = { ...ref, spaceRevision: spaces.data.find(({ id }) => id === originalSpaceId)!.revision, requestId: crypto.randomUUID() };
    expect(await call("agent.history.resume", { ...launch, action: "resume" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await call("agent.history.resume", { ...launch, action: "fork" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect((await list()).data.map(({ id, terminalId }) => ({ id, terminalId }))).toEqual(relocated.map(({ id, terminalId }) => ({ id, terminalId })));

    const ordinaryInput = { spaceId: originalSpaceId, spaceRevision: launch.spaceRevision, provider: "pi", requestId: crypto.randomUUID() };
    const ordinary = await call<AgentSession>("agent.sessions.launch", ordinaryInput);
    expect(ordinary).toMatchObject({ ok: true, data: { state: "running", nativeSessionId: expect.stringMatching(/^huhu-[a-f0-9]{64}$/) } });
    const ordinaryId = ordinary.data.nativeSessionId!;
    const same = await call<AgentSession>("agent.sessions.launch", ordinaryInput);
    expect(same.data).toMatchObject({ id: ordinary.data.id, terminalId: ordinary.data.terminalId, nativeSessionId: ordinaryId });
    // Model traffic is disabled in this fixture. Simulate later native history becoming visible.
    writeFileSync(path.join(historyDir, "ordinary-later.jsonl"), [{ ...rows[0], id: ordinaryId }, { ...rows[1] }].map((row) => JSON.stringify(row)).join("\n") + "\n");
    const ordinarySnapshot = async () => (await call<{ entries: HistoryRow[] }>("agent.history.list", { spaceId: originalSpaceId, provider: "pi", query: ordinaryId })).data.entries[0];
    await expect.poll(ordinarySnapshot, { timeout: 8_000 }).toMatchObject({ active: false, possiblyActive: true, canResume: false, canFork: false });
    const ordinaryHistory = (await ordinarySnapshot())!;
    expect(await call("agent.history.resume", { ...ordinaryInput, requestId: crypto.randomUUID(), nativeSessionId: ordinaryId, historyId: ordinaryHistory.historyId, historyRevision: ordinaryHistory.revision })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect((await list()).data).toHaveLength(3);
  } finally {
    await app.close();
    rmTree(base);
  }
});

test("同步设置用 Versioning 凭据补配旧 HTTPS 目标，换目标后明确提示重新配置", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const first = "https://example.invalid/team/notes.git";
  const second = "https://example.invalid/team/other.git";
  const retiredReference = "safe://item-retiredfixture";
  const secret = crypto.randomUUID();
  const configDir = path.join(vault, ".huhu", "sync");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ remote: first, branch: "main", mode: "off", credential: retiredReference, credentialUser: "previous-user" }));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(vault, {}, process.env["HUHU_VERSIONING_E2E_APP"] ?? root);
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const calls: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/call") {
        const input = request.postDataJSON() as { capability?: string };
        if (input.capability) calls.push(input.capability);
      }
    });
    await page.evaluate(async () => {
      const ep = await window.huhuHost.engine();
      const response = await fetch(`${ep.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability: "plugins.setEnabled", input: { id: "safe", enabled: false }, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      if (!(await response.json()).ok) throw new Error("Synthetic Vault could not disable Safe");
    });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-versioning").click();
    const panel = page.getByTestId("sync-auth-panel");
    const remote = page.getByTestId("sync-remote");
    const state = panel.getByTestId("sync-auth-state");
    await expect(remote).toHaveValue(first);
    await expect(state).toHaveText("请在此重新配置该 Git 远端的认证");
    await expect(page.getByTestId("sync-credential")).toHaveCount(0);
    await panel.getByLabel("用户名").fill("new-fixture-user");
    const token = panel.getByLabel("密码或令牌");
    await expect(token).toHaveAttribute("type", "password");
    await token.fill(secret);
    await panel.getByRole("button", { name: "保存认证" }).click();
    await expect(state).toHaveText("认证已配置");
    await expect(token).toHaveValue("");
    await expect(panel.getByLabel("用户名")).toHaveValue("");
    await remote.fill(second);
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("先保存远端地址，再配置该远端的认证。")).toBeVisible();
    await page.getByTestId("sync-save").click();
    await expect(state).toHaveText("请在此重新配置该 Git 远端的认证");
    const cfg = readFileSync(path.join(configDir, "config.json"), "utf8");
    const stored = JSON.parse(cfg);
    expect(stored).toMatchObject({ remote: second, branch: "main" });
    expect(stored).not.toHaveProperty("mode");
    await expect(page.getByTestId("sync-mode-off")).toBeChecked();
    expect([secret, retiredReference, "previous-user", "new-fixture-user"].some((material) => cfg.includes(material))).toBe(false);
    expect(calls).not.toContain("safe.items.list");
    await remote.fill(first);
    await page.getByTestId("sync-save").click();
    await expect(state).toHaveText("认证已配置");
    await panel.getByRole("button", { name: "清除认证" }).click();
    await expect(state).toHaveText("尚未配置认证");
  } finally {
    await app?.close();
    rmTree(vault);
  }
});

test("设置：当前 Vault 改名与描述（写入 vault.json）、快捷键表、关于页的版本与开源声明", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();

    await page.getByTestId("settings-nav-vault").click();
    // 显示的是打开时的路径；macOS 的临时目录 /var 是 /private/var 的符号链接，两种写法都算对
    await expect.poll(() => page.getByTestId("svault-root").inputValue()).toEqual(expect.stringMatching(/./));
    expect([realpathSync(vault), path.resolve(vault)]).toContain(await page.getByTestId("svault-root").inputValue());
    await page.getByTestId("svault-name").fill("我的第二大脑");
    await page.getByTestId("svault-description").fill("工作与学习");
    await page.getByTestId("svault-save").click();
    await expect(page.getByTestId("svault-note")).toHaveText("已保存");
    expect(JSON.parse(readFileSync(path.join(vault, ".huhu/vault.json"), "utf8"))).toMatchObject({ name: "我的第二大脑", description: "工作与学习" });
    await expect(page.getByTestId("svault-counts")).toContainText("Markdown 笔记");
    await page.getByTestId("svault-name").fill("   ");
    await expect(page.getByTestId("svault-save")).toBeDisabled(); // 空名称不能保存
    await expect(page.getByTestId("svault-id")).toHaveText(/^vault-[0-9a-z]+$/);

    await page.getByTestId("settings-nav-shortcuts").click();
    await expect(page.getByTestId("shortcut-row")).toHaveCount(6);
    await expect(page.getByTestId("settings-shortcuts")).toContainText("命令面板");

    await page.getByTestId("settings-nav-about").click();
    await expect(page.getByTestId("about-version")).toHaveText(`HUHU ${APP_VERSION}`);
    await expect(page.getByTestId("about-electron")).toHaveText(/^\d+\.\d+\.\d+/);
    await expect(page.getByTestId("about-node")).toHaveText(/^\d+\.\d+\.\d+/);
    await page.getByTestId("about-notices").locator("summary").click();
    await expect(page.getByTestId("about-notices")).toContainText("Herdr Core");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("设置·Agent 接入：指南文件自动创建；手改后为冲突且不被覆盖；备份并恢复内置版本（ACC-PL-07）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const skill = path.join(vault, ".agents/skills/huhu/SKILL.md");
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect.poll(() => existsSync(skill)).toBe(true);
    writeFileSync(skill, "我手改的指南");
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-agent-access").click();
    await expect(page.getByTestId("guide-file").first()).toHaveAttribute("data-status", "conflict");
    await page.getByTestId("guide-restore").click();
    await page.getByTestId("guide-restore-confirm").click();
    await expect(page.getByTestId("guide-file").first()).toHaveAttribute("data-status", "current");
    expect(readFileSync(skill, "utf8")).toContain("HUHU Vault 操作指南");
    await expect(page.getByTestId("guide-backup")).toHaveCount(1);
    const backups = path.join(vault, ".huhu/guide/backups");
    const id = readdirSync(backups)[0] as string;
    expect(readFileSync(path.join(backups, id, ".agents/skills/huhu/SKILL.md"), "utf8")).toBe("我手改的指南");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("设置：数据与存储——重建索引、导出数据包（结果带 SHA-256）、导入到空目录；非法路径给出明确错误", async () => {
  const { createHash } = await import("node:crypto");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const out = mkdtempSync(path.join(tmpdir(), "huhu-e2e-out-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "备份内容");
    await expect(treeItem(page, "备份内容.md")).toBeVisible();
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-data").click();
    // 文件结构（默认分区）：受管文件列表与只读预览，可按领域筛选与搜索
    await expect(page.getByTestId("storage-file").filter({ hasText: "备份内容.md" })).toBeVisible();
    await expect(page.getByTestId("storage-file").filter({ hasText: "vault.json" })).toBeVisible(); // .huhu 下的配置
    await page.getByTestId("storage-domain").selectOption("config");
    await expect(page.getByTestId("storage-file").filter({ hasText: "备份内容.md" })).toHaveCount(0);
    await page.getByTestId("storage-domain").selectOption("notes");
    await page.getByTestId("storage-file").filter({ hasText: "备份内容.md" }).click();
    await expect(page.getByTestId("storage-preview")).toContainText("备份内容");
    await page.getByRole("tab", { name: "存储规则" }).click();
    await expect(page.getByTestId("storage-rules")).toContainText("可靠性材料");
    await page.getByRole("tab", { name: "索引与恢复" }).click();
    await expect(page.getByTestId("storage-counts")).toContainText("篇笔记已建立索引");

    await page.getByTestId("storage-reindex").click();
    await expect(page.getByTestId("storage-reindex-msg")).toHaveText("索引已重建", { timeout: 20_000 });
    await page.getByTestId("storage-index-clear").click();
    await expect(page.getByTestId("storage-reindex-msg")).toContainText("已清除搜索索引");
    await page.getByTestId("storage-reindex").click();
    await expect(page.getByTestId("storage-reindex-msg")).toHaveText("索引已重建", { timeout: 20_000 });

    const zip = path.join(out, "备份.zip");
    await page.getByRole("tab", { name: "导出与迁移" }).click();
    await page.getByTestId("storage-export-path").fill("相对路径.zip");
    await page.getByTestId("storage-export").click();
    await expect(page.getByTestId("storage-export-msg")).toContainText("绝对路径");
    await page.getByTestId("storage-export-path").fill(zip);
    await page.getByTestId("storage-export").click();
    await expect(page.getByTestId("storage-export-result")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("export-path")).toHaveText(zip);
    expect(await page.getByTestId("export-sha").textContent()).toBe(createHash("sha256").update(readFileSync(zip)).digest("hex"));

    const target = path.join(out, "导入后");
    await page.getByTestId("storage-import-zip").fill(zip);
    await page.getByTestId("storage-import-target").fill(target);
    await page.getByTestId("storage-import").click();
    await expect(page.getByTestId("storage-import-result")).toContainText("已导入", { timeout: 20_000 });
    expect(existsSync(path.join(target, ".huhu/vault.json"))).toBe(true);
    expect(readFileSync(path.join(target, "备份内容.md"), "utf8")).toBe(readFileSync(path.join(vault, "备份内容.md"), "utf8"));
    await page.getByTestId("storage-import").click(); // 目标不再为空
    await expect(page.getByTestId("storage-import-msg")).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(out);
  }
});

test("网关·命令行：开发运行时说明没有打包好的启动脚本，不提供安装；速查表可见", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "网关" }).first().click();
    await page.getByRole("tab", { name: "CLI" }).click();
    const cli = page.getByTestId("cli-section");
    await expect(cli).toBeVisible();
    await expect(cli.getByTestId("cli-state")).toHaveText(/未安装/);
    await expect(cli.getByTestId("cli-unsupported")).toContainText("开发运行");
    await expect(cli.getByTestId("cli-install")).toHaveCount(0);
    await expect(cli).toContainText("huhu call vault.info");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("设置：编辑器页的开关真正生效（关闭自动保存 → 只在点“保存”时写入；行号、字号、宽度）；外观的导航宽度与紧凑布局", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByLabel("导航栏宽度", { exact: true }).fill("280");
    await expect(page.locator("html")).toHaveCSS("--sidebar-w", "280px");
    await page.getByRole("switch", { name: "紧凑显示" }).click();
    await expect(page.getByRole("switch", { name: "紧凑显示" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click();
    await expect(page.getByRole("switch", { name: "自动保存" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "显示行号" })).toBeChecked(); // 默认显示行号（US-KN-03）
    await page.getByLabel("正文字号").fill("20");
    await page.getByLabel("正文宽度").selectOption("680");
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).editor).toMatchObject({ autosave: false, lineNumbers: true, fontSize: 20, readableWidth: "680" });

    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "手动保存");
    await expect(treeItem(page, "手动保存.md")).toBeVisible();
    const editor = page.getByTestId("markdown-editor");
    // 编辑设置：字号与可读宽度落到 OK 编辑器的容器上（行号只属于源码视图，见 S3 的设置对等清单）
    await expect(editor.locator(".tiptap-editor")).toHaveCSS("--content-max-width", "680px");
    await expect(editor.locator(".ProseMirror")).toHaveCSS("font-size", "20px");
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("手动保存的正文");
    await page.waitForTimeout(2500); // 远超 800ms 的自动保存间隔
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("手动保存的正文");
    await page.getByTestId("note-save").click();
    await expect.poll(() => readFileSync(path.join(vault, "手动保存.md"), "utf8")).toContain("手动保存的正文");
    const state = page.getByTestId("save-state");
    await expect(state).toHaveText("已保存");
    // Mod+S 立即保存（快捷键登记表里的“立即保存当前笔记”）：手动保存模式下按键后落盘
    await editor.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("，快捷键保存");
    await page.waitForTimeout(1500);
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("快捷键保存");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => readFileSync(path.join(vault, "手动保存.md"), "utf8")).toContain("快捷键保存");
    await expect(state).toHaveText("已保存");

    // 没点保存就离开：手动保存模式不改动文件，编辑留作草稿，回来时可恢复
    await page.keyboard.type("，离开前的补充");
    await page.waitForTimeout(1500);
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("离开前的补充");
    await newNote(page, "另一篇");
    await expect(treeItem(page, "另一篇.md")).toBeVisible();
    await treeItem(page, "手动保存.md").click();
    await expect(page.getByTestId("note-draft-restore")).toBeVisible({ timeout: 10_000 });
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("离开前的补充");
    await page.getByTestId("note-draft-restore").click();
    await expect(page.getByTestId("markdown-editor")).toContainText("离开前的补充");

    // 重新打开自动保存后恢复原行为
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click();
    await expect(page.getByRole("switch", { name: "自动保存" })).toBeChecked();
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("note-save")).toHaveCount(0);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("知识库：关闭自动保存后，未保存的编辑在“重命名”和“移到回收站”之前先落盘，不丢内容", async () => {
  const EDIT = "未保存的编辑XYZ";
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  const trashed = (name: string): string => {
    const dir = path.join(vault, ".huhu", "trash");
    if (!existsSync(dir)) return "";
    for (const id of readdirSync(dir)) {
      const entry = path.join(dir, id);
      const metadata = path.join(entry, "meta.json");
      if (!existsSync(metadata) || JSON.parse(readFileSync(metadata, "utf8")).originalPath !== name) continue;
      const f = path.join(entry, "payload", "entry");
      if (existsSync(f)) return readFileSync(f, "utf8");
    }
    return "";
  };
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByRole("switch", { name: "自动保存" }).click();
    await expect(page.getByRole("switch", { name: "自动保存" })).not.toBeChecked();
    await page.getByRole("button", { name: "知识库" }).first().click();
    const edit = async (title: string) => {
      await newNote(page, title);
      await treeItem(page, `${title}.md`).click();
      await page.getByTestId("markdown-editor").locator(".ProseMirror").click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(EDIT);
      await expect(page.getByTestId("note-save")).toBeEnabled();
      await page.waitForTimeout(1500);
      expect(readFileSync(path.join(vault, `${title}.md`), "utf8")).not.toContain(EDIT);
    };
    await edit("改名前");
    await renameCurrentNote(page, "改名后");
    await expect.poll(() => existsSync(path.join(vault, "改名后.md"))).toBe(true);
    await expect.poll(() => readFileSync(path.join(vault, "改名后.md"), "utf8")).toContain(EDIT);
    expect(existsSync(path.join(vault, "改名前.md"))).toBe(false);

    await edit("回收站前");
    await trashCurrentNote(page);
    await expect.poll(() => trashed("回收站前.md")).toContain(EDIT);
    expect(existsSync(path.join(vault, "回收站前.md"))).toBe(false);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("知识库：输入后立刻切换到另一篇，磁盘内容包含最后一个字符（会话销毁时落盘，不等 800 ms 自动保存）", async () => {
  const LAST = "最后一个字Ω";
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await newNote(page, "甲");
    await newNote(page, "乙");
    await treeItem(page, "甲.md").click();
    await page.getByTestId("markdown-editor").locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(LAST);
    await treeItem(page, "乙.md").click(); // 立刻离开：远小于自动保存间隔
    await expect.poll(() => readFileSync(path.join(vault, "甲.md"), "utf8")).toContain(LAST);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { plan } = await call<{ plan: { planId: string; revision: string } }>(page, "home.focus.update", { action: "start" });
    const intentId = crypto.randomUUID();
    const scheduledFor = new Date(Date.now() + 3_000).toISOString();
    expect(
      await call(
        page,
        "automations.plans.submit",
        {
          planId: plan.planId,
          expectedRevision: plan.revision,
          intentId,
          change: "reschedule",
          trigger: { kind: "once", scheduledFor },
        },
        intentId,
      ),
    ).toMatchObject({ outcome: "completed", plan: { planId: plan.planId, nextAt: scheduledFor } });
    // 正常退出会暂停运行中的专注，先验证 Engine 到点结算。
    await expect(page.getByTestId("focus-completed")).toHaveText("今日完成 1 次", { timeout: 15_000 });
    await expect(page.getByTestId("focus-time")).toHaveText("25:00");
    await expect(page.getByTestId("focus-start")).toBeVisible();
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notification-panel")).toContainText("专注完成");
    await page.getByTestId("bell").click();

    // 开始后暂停：显示不再走，状态持久化
    await page.getByTestId("focus-start").click();
    await expect(page.getByTestId("focus-pause")).toBeVisible();
    await page.getByTestId("focus-pause").click();
    await expect(page.getByTestId("focus-start")).toBeVisible();
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/home/focus.json"), "utf8")).running).toBe(false);

    // 习惯：添加、勾选，重启后保持
    await page.getByTestId("home-customize").click();
    await page.getByRole("button", { name: "添加卡片", exact: true }).click();
    await page.getByRole("button", { name: "添加 习惯", exact: true }).click();
    await page.getByTestId("home-dashboard-save").click();
    await page.getByLabel("新习惯").fill("喝水");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await expect(page.getByTestId("habit-row")).toHaveCount(1);
    await page.getByLabel("喝水", { exact: true }).click();
    await expect(page.getByLabel("喝水", { exact: true })).toBeChecked();
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("habit-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByLabel("喝水", { exact: true })).toBeChecked();
    await expect(page.getByTestId("focus-completed")).toHaveText("今日完成 1 次");

    // 自定义：隐藏专注卡片，重启后仍隐藏
    await page.getByTestId("home-customize").click();
    await page.locator('[data-instance-id="default-focus"]').getByRole("checkbox", { name: "隐藏" }).click();
    await expect(page.getByTestId("card-focus")).toHaveCount(0);
    await page.getByTestId("home-dashboard-save").click();
    await expect(page.getByTestId("home-dashboard").getByRole("status")).toContainText("布局已保存");
    expect(JSON.parse(readFileSync(path.join(vault, ".huhu/home/widgets.json"), "utf8")).instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));

    // ACC-WB-08：停用任务插件，任务卡片隐藏
    await expect(page.getByTestId("card-open")).toBeVisible();
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.locator('[data-plugin="tasks"]').click();
    await page.getByRole("switch", { name: "停用 任务" }).click();
    await page.getByRole("button", { name: "工作台" }).first().click();
    await expect(page.getByTestId("card-open")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("card-today")).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    rmTree(vault);
  }
});

test("设置：时区改变后页面显示该时区的当前日期，非法时区被拒绝且不写入", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-date-time").click();
    await page.getByTestId("settings-zone").fill("Nowhere/Land");
    await expect(page.getByTestId("settings-zone-invalid")).toBeVisible();
    await page.getByTestId("settings-zone").fill("Pacific/Kiritimati");
    await expect(page.getByTestId("settings-zone-invalid")).toHaveCount(0);
    await expect
      .poll(
        () => {
          try {
            return JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).dateTime.zone;
          } catch {
            return null;
          }
        },
        { timeout: 20_000 },
      )
      .toBe("Pacific/Kiritimati"); // 文件尚未写出时读取会 ENOENT：视为“还没有”，继续等
    const expected = new Intl.DateTimeFormat("zh-CN", { timeZone: "Pacific/Kiritimati", dateStyle: "full" }).format(new Date());
    await expect(page.getByTestId("settings-zone-now")).toContainText(expected);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("文件历史：保存后立即切出 Vault 或关闭，重开只记录一次末次修订", async () => {
  test.setTimeout(90_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-history-lifecycle-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(vault);
    let page = await app.firstWindow();
    await engineReady(page);
    const { path: note } = await call<{ path: string }>(page, "notes.create", { name: "末次修订" });
    const save = async (text: string) => {
      const { version } = await call<{ version: string }>(page, "notes.read", { path: note });
      await call(page, "notes.save", { path: note, text, expectedVersion: version });
    };
    const history = async () => {
      const entries = await call<{ id: string }[]>(page, "history.timeline", { path: note });
      return Promise.all(entries.map(({ id: entryId }) => call<{ text: string }>(page, "history.read", { path: note, entryId })));
    };

    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-vault").click();
    await page.getByTestId("svault-switch").click();
    await save("切出 Vault 前的正文");
    await page.getByTestId("svault-switch-confirm").click();
    await expect(page.getByTestId("vault-launch")).toBeVisible();
    await app.close();
    app = undefined;

    app = await launch(vault);
    page = await app.firstWindow();
    await engineReady(page);
    expect(await history()).toEqual([{ text: "切出 Vault 前的正文" }]);
    await save("关闭窗口前的正文");
    await app.close();
    app = undefined;

    app = await launch(vault);
    page = await app.firstWindow();
    await engineReady(page);
    expect(await history()).toEqual([{ text: "关闭窗口前的正文" }, { text: "切出 Vault 前的正文" }]);
  } finally {
    await app?.close();
    rmTree(vault);
  }
});

test("版本与同步：文件历史查看/恢复；Git 页初始化、暂存、提交", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 用 Engine 能力准备数据（界面之外的前置步骤）
    await page.evaluate(async () => {
      const ep = await window.huhuHost.engine();
      const call = async (capability: string, input: unknown) => {
        const r = await fetch(`${ep.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        const j = (await r.json()) as { ok: boolean; data: any; error?: unknown }; // eslint-disable-line
        if (!j.ok) throw new Error(JSON.stringify(j.error));
        return j.data;
      };
      const n = await call("notes.create", { name: "历史笔记" });
      let v = (await call("notes.read", { path: n.path })).version;
      v = (await call("notes.save", { path: n.path, text: "# 历史笔记\n\n第一版\n", expectedVersion: v })).version;
      await call("history.checkpoint", { path: n.path, title: "第一版" });
      await call("notes.save", { path: n.path, text: "# 历史笔记\n\n第二版\n", expectedVersion: v });
      await call("history.checkpoint", { path: n.path, title: "第二版" });
    });
    await page.getByRole("button", { name: "版本历史" }).first().click();
    const entries = page.getByTestId("history-entry");
    await expect(entries.filter({ hasText: /· 编辑$/ })).toHaveCount(2, { timeout: 10_000 });
    await expect(entries.filter({ hasText: /· 命名版本$/ })).toHaveCount(2);
    await expect(page.getByTestId("history-content")).toContainText("第二版");
    await page.getByTestId("history-entry").filter({ hasText: "第一版" }).click();
    await expect(page.getByTestId("history-content")).toContainText("第一版");
    await page.getByRole("button", { name: "恢复到此版本" }).click();
    await expect(page.getByText("已恢复，恢复前的内容已保存为一个版本")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => readFileSync(path.join(vault, "历史笔记.md"), "utf8")).toContain("第一版");
    await expect(page.getByTestId("history-entry").filter({ hasText: "恢复前" })).toHaveCount(1);

    await page.getByRole("button", { name: "Git", exact: true }).click();
    await expect(page.getByTestId("git-not-repo")).toBeVisible();
    await page.getByRole("button", { name: "初始化 Git 仓库" }).click();
    await expect(page.getByTestId("git-page")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("git-change").filter({ hasText: "历史笔记.md" })).toBeVisible();
    await page.getByTestId("git-change").filter({ hasText: "历史笔记.md" }).getByRole("button", { name: "暂存" }).click();
    await page.getByRole("button", { name: "暂存区", exact: true }).click();
    await expect(page.getByTestId("git-staged")).toHaveCount(1);
    await page.getByLabel("提交说明").fill("第一次提交");
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await page.getByRole("button", { name: "提交历史", exact: true }).click();
    await expect(page.getByTestId("git-commit").filter({ hasText: "第一次提交" })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("Agent 启动环境在桌面写入保护值，重开编辑时只显示状态", async () => {
  test.skip(process.platform !== "win32", "本机保护由 Windows Credential Manager 提供");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-agent-cli").click();
    const section = page.getByTestId("agent-environment-settings");
    await section.getByRole("button", { name: "新建启动环境" }).click();
    const dialog = page.getByRole("dialog", { name: "新建启动环境" });
    await dialog.getByLabel("环境名称").fill("回归启动环境");
    await dialog.getByRole("button", { name: "添加保护变量" }).click();
    await dialog.getByLabel("变量名").fill("HUHU_E2E_AGENT_PROFILE");
    await dialog.getByLabel("替换保护值").fill("fixture-agent-profile-private");
    await dialog.getByRole("button", { name: "保存启动环境" }).click();
    await expect(dialog).toBeHidden();
    await expect(section).toContainText("HUHU_E2E_AGENT_PROFILE · 已配置");
    await section.getByRole("button", { name: "编辑启动环境 回归启动环境" }).click();
    await expect(page.getByRole("dialog", { name: "编辑启动环境" }).getByLabel("替换保护值")).toHaveValue("");
    await page.keyboard.press("Escape");
    const location = path.join(vault, ".huhu", "module-credentials");
    for (const file of readdirSync(location)) expect(readFileSync(path.join(location, file), "utf8")).not.toContain("fixture-agent-profile-private");
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("Agent 受保护启动在 Safe 未初始化、锁定和停用时接入真实终端", async () => {
  const native = process.env["HUHU_AGENT_PTY_HOST"] ?? path.resolve(import.meta.dirname, "../../native/agent-pty/bin/huhu-agent-pty.exe");
  test.skip(process.platform !== "win32" || !existsSync(HERDR) || !existsSync(native), "需要 Windows Core 与 Windows 原生终端宿主");
  test.setTimeout(90_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-env-vault-"));
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-env-probe-"));
  const entry = path.join(fixture, "check.mjs");
  const proof = path.join(fixture, "proof.json");
  const secret = "fixture-native-env-private-" + crypto.randomUUID();
  writeFileSync(
    entry,
    [
      'import { writeFileSync } from "node:fs";',
      'import { createHash } from "node:crypto";',
      'const value = process.env.HUHU_E2E_AGENT_PRIVATE ?? "";',
      'writeFileSync(process.env.HUHU_E2E_AGENT_PROOF, JSON.stringify({ tty: [process.stdin.isTTY, process.stdout.isTTY], hash: createHash("sha256").update(value).digest("hex") }));',
      'process.stdout.write("protected-output " + value + "\\n");',
      "process.stdin.setRawMode(true);",
      'process.stdin.on("data", () => process.exit(0));',
      "setTimeout(() => process.exit(32), 20000).unref();",
    ].join("\n"),
  );
  const app = await launch(vault, { HUHU_AGENT_PTY_HOST: native });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = async <T>(capability: string, input: unknown): Promise<T> =>
      page.evaluate(
        async ({ capability, input }) => {
          const endpoint = await window.huhuHost.engine();
          const response = await fetch(endpoint.baseUrl + "/api/v1/call", {
            method: "POST",
            headers: { authorization: "Bearer " + endpoint.token, "content-type": "application/json" },
            body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
          });
          const result = (await response.json()) as { ok: boolean; data: T; error?: { code?: string; message?: string } };
          if (!result.ok) throw new Error(result.error?.code + " " + result.error?.message);
          return result.data;
        },
        { capability, input },
      );
    const settings = await call<{ settings: { revision: number } }>("agent.settings.get", {});
    await call("agent.settings.update", { expectedRevision: settings.settings.revision, defaultAgent: "pi", agents: { pi: { command: entry, args: [] } } });
    const profile = await call<{ id: string }>("agent.launch.environments.save", {
      expectedRevision: null,
      name: "终端实测",
      provider: "pi",
      ordinary: [{ name: "HUHU_E2E_AGENT_PROOF", value: proof }],
      protectedNames: ["HUHU_E2E_AGENT_PRIVATE"],
      changes: [{ name: "HUHU_E2E_AGENT_PRIVATE", action: "replace", value: secret }],
    });
    const state = await call<{ initialized: boolean }>("safe.status", {});
    expect(state.initialized).toBe(false);
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("agent-cli-module")).toBeVisible();
    let launchReason = "";
    page.on("response", (response) => {
      if (!response.url().endsWith("/api/v1/call") || response.request().method() !== "POST") return;
      const request = response.request().postDataJSON() as { capability?: string };
      if (request?.capability !== "agent.workspace.launchProtected") return;
      void response.json().then(
        (reply: { error?: { code?: string; details?: { reason?: string } } }) => {
          launchReason = [reply.error?.code, reply.error?.details?.reason].filter(Boolean).join("/");
        },
        () => undefined,
      );
    });

    for (const stage of ["uninitialized", "locked", "disabled"]) {
      if (stage === "locked") {
        await call("safe.setup", { password: "fixture-safe-password-2026" });
        await call("safe.lock", {});
        expect(await call("safe.status", {})).toMatchObject({ initialized: true, locked: true });
      }
      if (stage === "disabled") expect(await call("plugins.setEnabled", { id: "safe", enabled: false })).toMatchObject({ state: "disabled" });
      rmSync(proof, { force: true });
      await page.locator(".agent-add-cli").click();
      await page.getByRole("menuitem", { name: "使用启动环境…" }).click();
      const dialog = page.getByRole("dialog", { name: "使用启动环境" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("combobox", { name: "启动环境", exact: true }).selectOption(profile.id);
      await dialog.getByRole("button", { name: "预览启动" }).click();
      await expect(dialog).toContainText(entry);
      await expect(dialog).toContainText("HUHU_E2E_AGENT_PRIVATE");
      await expect(dialog).not.toContainText(secret);
      expect(existsSync(proof)).toBe(false);
      await dialog.getByRole("button", { name: "确认启动" }).click();
      const module = page.getByTestId("agent-cli-module");
      await expect
        .poll(
          async () => {
            if (existsSync(proof)) return "started";
            const errors = await module.getByRole("alert").allTextContents();
            return [launchReason, ...errors].filter(Boolean).join(" ").replaceAll(secret, "[REDACTED]") || "pending";
          },
          { timeout: 15000 },
        )
        .toBe("started");
      expect(JSON.parse(readFileSync(proof, "utf8"))).toEqual({ tty: [true, true], hash: createHash("sha256").update(secret).digest("hex") });
      const sessions = () => call<{ id: string; state: string }[]>("agent.sessions.list", {});
      await expect.poll(async () => (await sessions()).some((session) => session.state === "running")).toBe(true);
      const active = (await sessions()).find((session) => session.state === "running")!;
      await expect.poll(async () => (await call<{ text: string }>("agent.sessions.output", { id: active.id })).text).toContain("protected-output");
      const { text } = await call<{ text: string }>("agent.sessions.output", { id: active.id });
      expect(text).not.toContain(secret);
      await page.getByTestId("workspace-pane").locator(".xterm").last().click();
      await page.keyboard.type("q");
      await expect.poll(async () => (await call<{ id: string; state: string }[]>("agent.sessions.list", {})).find((session) => session.id === active.id)?.state).toBe("exited");
    }
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(fixture);
  }
});

test("Agent 文件面板按两个 Space 开文件，并从授权仓库建立和打开 worktree", async () => {
  test.skip(!existsSync(HERDR), "需要本机 Herdr Core");
  test.setTimeout(65_000);
  const base = mkdtempSync(path.join(tmpdir(), "huhu-agent-files-"));
  const vault = path.join(base, "vault");
  const first = path.join(base, "first");
  const second = path.join(base, "second");
  const checkout = path.join(base, "checkout");
  for (const directory of [vault, first, second, checkout]) mkdirSync(directory);
  writeFileSync(path.join(first, "same.txt"), "第一 Space 的实际内容");
  writeFileSync(path.join(second, "same.txt"), "第二 Space 的实际内容");
  execFileSync("git", ["-C", first, "init", "--initial-branch=main", "-q"]);
  execFileSync("git", ["-C", first, "add", "--", "same.txt"]);
  execFileSync("git", ["-C", first, "-c", "user.name=HUHU Fixture", "-c", "user.email=huhu@example.test", "commit", "-qm", "file fixture"]);
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const add = async (name: string, directory: string) => {
      await page.getByTestId("space-new").click();
      await page.getByLabel("Space 名称").fill(name);
      await page.getByLabel("工作目录").fill(directory);
      await page.getByTestId("space-save").click();
      await expect(page.getByTestId("agent-space-item").filter({ hasText: name })).toHaveAttribute("aria-pressed", "true");
    };
    const trigger = page.getByRole("button", { name: "工作区文件", exact: true });
    const dialog = page.getByRole("dialog", { name: "工作区文件" });
    const verify = async (directory: string, contents: string) => {
      await trigger.click();
      await dialog.getByRole("button", { name: "same.txt", exact: true }).click();
      await expect(dialog.getByRole("region", { name: "所选文件" })).toContainText(path.join(directory, "same.txt"));
      await expect(dialog.locator("pre")).toHaveText(contents);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    };
    await add("第一仓库", first);
    await verify(first, "第一 Space 的实际内容");
    await add("第二目录", second);
    await verify(second, "第二 Space 的实际内容");

    await page.getByTestId("agent-space-item").filter({ hasText: "第一仓库" }).click();
    await trigger.click();
    await dialog.getByRole("button", { name: "Git worktree", exact: true }).click();
    await expect(dialog.getByRole("region", { name: "Git worktree" })).toContainText(first);
    await stubPick(app, checkout);
    await dialog.getByRole("button", { name: "选择空目录" }).click();
    await dialog.getByLabel("新分支").fill("review-fixture");
    await dialog.getByRole("button", { name: "建立 worktree" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "review-fixture" })).toHaveAttribute("aria-pressed", "true");
    expect(execFileSync("git", ["-C", first, "worktree", "list", "--porcelain"], { encoding: "utf8" })).toContain("branch refs/heads/review-fixture");
    await verify(checkout, "第一 Space 的实际内容");

    await page.getByTestId("agent-space-item").filter({ hasText: "第一仓库" }).click();
    await trigger.click();
    await dialog.getByRole("button", { name: "Git worktree", exact: true }).click();
    await dialog.getByRole("button", { name: "打开工作区", exact: true }).last().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "review-fixture" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "review-fixture" })).toHaveCount(1);
  } finally {
    await app.close();
    rmTree(base);
  }
});

test("Agent CLI 递归分栏在两个 Space 隔离，终端身份、比例和收起的会话在重开后保留", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  test.setTimeout(120_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const outside = mkdtempSync(path.join(tmpdir(), "huhu-space-"));
  let app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const spaces = page.getByTestId("agent-space-item");
    const panes = page.getByTestId("workspace-pane");
    const start = async (button: ReturnType<Page["getByTestId"]>, count: number) => {
      await button.click();
      await page.getByTestId("launch-shell").click();
      await expect(page.getByTestId("terminal-view")).toHaveCount(count, { timeout: 20_000 });
    };
    await start(page.getByTestId("workspace-pane-launch"), 1);
    const firstId = (await panes.first().getAttribute("data-pane-id"))!;
    const first = page.locator(`[data-pane-id="${firstId}"]`);
    await expect(first.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    const attached = await first.getByTestId("terminal-view").elementHandle();
    await start(first.getByTestId("workspace-split-right"), 2);
    const secondId = (await panes.nth(1).getAttribute("data-pane-id"))!;
    const second = page.locator(`[data-pane-id="${secondId}"]`);
    const primaryDivider = page.getByRole("separator", { name: "左右分栏宽度" }).first();
    await expect(primaryDivider).toHaveAttribute("aria-valuenow", "50");
    await primaryDivider.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(primaryDivider).toHaveAttribute("aria-valuenow", "60");
    await expect(primaryDivider).toHaveAttribute("data-saved-ratio", "60");
    await expect(primaryDivider).toHaveAttribute("aria-disabled", "false");
    await primaryDivider.hover();
    const handle = await primaryDivider.boundingBox();
    expect(handle).toBeTruthy();
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2 - 45, handle!.y + handle!.height / 2);
    await expect(primaryDivider).not.toHaveAttribute("aria-valuenow", "60");
    await expect(primaryDivider).toHaveAttribute("data-saved-ratio", "60");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(primaryDivider).toHaveAttribute("aria-valuenow", "60");

    const output = async (pane: ReturnType<Page["locator"]>, expression: string, expected: string) => {
      await expect(pane.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
      await pane.locator(".xterm-helper-textarea").focus();
      await page.keyboard.type(expression);
      await page.keyboard.press("Enter");
      await expect(pane.locator(".xterm-rows")).toContainText(expected, { timeout: 15_000 });
    };
    await output(first, 'echo "LEFT-$((1+1))"', "LEFT-2");
    await second.getByRole("button", { name: "放大分栏" }).click();
    await expect(first).toBeHidden();
    await output(second, 'echo "RIGHT-$((2+2))"', "RIGHT-4");
    await second.getByRole("button", { name: "还原分栏" }).click();
    await expect(first).toBeVisible();
    await expect(first.locator(".xterm-rows")).not.toContainText("RIGHT-4");

    await start(first.getByTestId("workspace-split-up"), 3);
    await start(second.getByTestId("workspace-split-down"), 4);
    await start(panes.last().getByTestId("workspace-split-left"), 5);
    await start(panes.first().getByTestId("workspace-split-down"), 6);
    expect(await attached?.evaluate((element) => element.isConnected)).toBe(true);
    const idsBefore = await panes.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-pane-id")));
    await expect(panes).toHaveCount(6);
    expect(new Set(idsBefore).size).toBe(6);

    await page.getByTestId("space-new").click();
    await page.getByLabel("Space 名称").fill("分栏的另一工作区");
    await page.getByLabel("工作目录").fill(outside);
    await page.getByTestId("space-save").click();
    await expect(spaces.filter({ hasText: "分栏的另一工作区" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("terminal-view")).toHaveCount(0);
    await start(page.getByTestId("workspace-pane-launch"), 1);
    await spaces.filter({ hasNotText: "分栏的另一工作区" }).click();
    await expect(panes).toHaveCount(6);
    expect(await panes.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-pane-id")))).toEqual(idsBefore);

    await first.getByTestId("workspace-pane-close").click();
    await expect(page.getByTestId("workspace-pane-close-dialog")).toBeVisible();
    await page.getByRole("button", { name: "收起分栏" }).click();
    await expect(panes).toHaveCount(5);
    await expect(page.getByTestId("session-tab")).toHaveCount(7);

    await app.close();
    app = await launch(vault);
    const reopened = await app.firstWindow();
    await expect(reopened.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await reopened.setViewportSize({ width: 1600, height: 1050 });
    await reopened.getByRole("button", { name: "Agent CLI" }).first().click();
    await reopened.getByTestId("agent-space-item").filter({ hasNotText: "分栏的另一工作区" }).click();
    await expect(reopened.getByTestId("workspace-pane")).toHaveCount(5);
    expect(await reopened.getByTestId("workspace-pane").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-pane-id")))).toEqual(idsBefore.filter((id) => id !== firstId));
    const restoredDivider = reopened.getByRole("separator", { name: "左右分栏宽度" }).first();
    await expect(restoredDivider).toHaveAttribute("data-saved-ratio", "60");
    const max = Number(await restoredDivider.getAttribute("aria-valuemax"));
    await expect(restoredDivider).toHaveAttribute("aria-valuenow", String(Math.min(60, max)));
    await reopened.getByTestId("agent-space-item").filter({ hasText: "分栏的另一工作区" }).click();
    await expect(reopened.getByTestId("workspace-pane")).toHaveCount(1);
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(outside);
  }
});

test("Agent CLI 跨标签移动分栏与重排标签保留实际终端", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  test.setTimeout(120_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.setViewportSize({ width: 1560, height: 900 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const panes = page.getByTestId("workspace-pane");
    const workspaceTabs = (target: Page) => target.getByRole("navigation", { name: "全局会话" }).locator("[data-tab-id]");
    const tabs = workspaceTabs(page);
    const shell = async (trigger: ReturnType<Page["getByTestId"]>) => {
      await trigger.click();
      await page.getByTestId("launch-shell").click();
    };
    await shell(page.getByTestId("workspace-pane-launch"));
    await expect(panes.first().getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 20_000 });
    const sourceId = (await panes.first().getAttribute("data-pane-id"))!;
    const source = page.locator(`[data-pane-id="${sourceId}"]`);
    await shell(source.getByTestId("workspace-split-right"));
    await expect(panes).toHaveCount(2);
    await shell(page.getByRole("button", { name: "新终端", exact: true }));
    await expect(tabs).toHaveCount(2);
    const order = await tabs.evaluateAll((items) => items.map((item) => item.getAttribute("data-tab-id")));
    const other = page.locator(`[data-tab-id="${order[1]}"]`);
    await tabs.first().click();
    await expect(source.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 20_000 });
    const terminal = await source.getByTestId("terminal-view").elementHandle();
    const sessionId = await source.getAttribute("data-session-id");
    await source.getByTestId("workspace-pane-move").click();
    await other.click();
    await expect(source).toBeHidden();
    const targetId = await panes.first().getAttribute("data-pane-id");
    await panes.first().getByRole("button", { name: "向左移动" }).focus();
    await page.keyboard.press("Enter");
    await expect(source).toBeVisible();
    expect(await terminal?.evaluate((element) => element.isConnected)).toBe(true);
    await expect(source).toHaveAttribute("data-session-id", sessionId!);
    expect(await panes.evaluateAll((items) => items.map((item) => item.getAttribute("data-pane-id")))).toEqual([sourceId, targetId]);
    await expect(page.getByTestId("session-tab")).toHaveCount(3);
    await page.getByRole("button", { name: "左移当前标签" }).click();
    await expect(tabs.first()).toHaveAttribute("data-tab-id", order[1]!);
    await app.close();

    app = await launch(vault);
    const reopened = await app.firstWindow();
    await expect(reopened.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await reopened.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(workspaceTabs(reopened).first()).toHaveAttribute("data-tab-id", order[1]!);
    await expect(reopened.locator(`[data-pane-id="${sourceId}"]`)).toHaveAttribute("data-session-id", sessionId!);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("Agent CLI 关窗等分栏保存回执，再打开看到已提交布局", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  let page: Page | undefined;
  const kept = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.route("**/api/v1/call", async (route) => {
      const body = route.request().postDataJSON() as { capability?: string } | null;
      if (body?.capability !== "agent.workspace.close") return route.continue();
      const result = await route.fetch();
      expect(await result.json()).toMatchObject({ ok: true, data: { layout: { tabs: [] } } });
      kept.resolve();
      await release.promise;
      return route.fulfill({ response: result });
    });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await page.getByTestId("workspace-pane-close").click();
    await kept.promise;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await expect(page.waitForEvent("close", { timeout: 500 })).rejects.toThrow(/Timeout/);
    const closed = page.waitForEvent("close");
    release.resolve();
    await closed;
    await app.close();

    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByText("这个 Space 没有打开的标签")).toBeVisible();
  } finally {
    release.resolve();
    if (page && !page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await app.close();
    rmTree(vault);
  }
});

test("Agent CLI 的启动响应丢失后，用原请求找回原终端及目标分栏", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  let page: Page | undefined;
  try {
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const requests: string[] = [];
    await page.route("**/api/v1/call", async (route) => {
      const body = route.request().postDataJSON() as { capability?: string; input?: { requestId?: string } } | null;
      if (body?.capability !== "agent.workspace.launch" || !body.input?.requestId) return route.continue();
      requests.push(body.input.requestId);
      if (requests.length > 1) return route.continue();
      const original = await route.fetch();
      expect(await original.json()).toMatchObject({ ok: true, data: { sessionId: expect.any(String), placement: { leaf: expect.any(String) } } });
      await route.abort("connectionreset");
    });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const pane = page.getByTestId("workspace-pane");
    const original = await pane.getAttribute("data-pane-id");
    await pane.getByTestId("workspace-pane-launch").click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("workspace-launch-recovery")).toContainText("待核实", { timeout: 20_000 });
    await expect(page.getByTestId("session-tab")).toHaveCount(1);
    await page.getByRole("button", { name: "核对原启动" }).click();
    await expect(pane.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 20_000 });
    await expect(pane).toHaveAttribute("data-pane-id", original!);
    await expect(page.getByTestId("session-tab")).toHaveCount(1);
    await expect(page.getByTestId("workspace-launch-recovery")).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(new Set(requests).size).toBe(1);
  } finally {
    await page?.unrouteAll({ behavior: "wait" });
    await app.close();
    rmTree(vault);
  }
});

test("Agent CLI：shell 里 exit 之后，会话标记为已结束（带退出码），不再提供终端；其他会话不受影响", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "新终端", exact: true }).click();
      await page.getByTestId("launch-shell").click();
      await expect(page.getByTestId("session-tab")).toHaveCount(i + 1, { timeout: 15_000 });
      await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    }
    await page.getByTestId("session-tab").first().click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("exit 7");
    await page.keyboard.press("Enter");
    // 切走再回来触发会话列表刷新（对账）
    await expect(async () => {
      await page.getByRole("button", { name: "工作台", exact: true }).first().click();
      await page.getByRole("button", { name: "Agent CLI" }).first().click();
      await expect(page.getByTestId("session-tab").filter({ hasText: "已结束" })).toHaveCount(1, { timeout: 2000 });
    }).toPass({ timeout: 20_000, intervals: [2500] });
    await page.getByTestId("session-tab").filter({ hasText: "已结束" }).click();
    await expect(page.getByText("这个会话已经结束（退出码 7）")).toBeVisible();
    await expect(page.getByTestId("session-tab").filter({ hasText: "运行中" })).toHaveCount(1);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("Agent CLI 变更审查（ACC-AG-10）：显示工作树差异，在行上加意见，发送后会话终端收到文本并标记已发送；非 Git 目录给出说明", async () => {
  test.skip(process.platform === "win32", "Windows 的终端是 PowerShell，回显与报错格式不同，E2EREVIEW 的断言不适用");
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });

    await page.getByTestId("agent-review-toggle").click();
    await expect(page.getByTestId("review-panel")).toContainText("不是 Git 仓库"); // Vault 目录还不是仓库

    execFileSync("git", ["-C", vault, "init", "-q", "-b", "main"]);
    writeFileSync(path.join(vault, "审查.md"), "第一行\n第二行\n第三行\n");
    await page.getByTestId("agent-review-toggle").click(); // 关闭再打开：重新读取差异
    await page.getByTestId("agent-review-toggle").click();
    await expect(page.getByTestId("review-file").filter({ hasText: "审查.md" })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("review-file").filter({ hasText: "审查.md" }).click();
    await expect(page.getByTestId("diff-line")).toHaveCount(3);
    await page.getByRole("button", { name: "在 审查.md 的新第 2 行添加意见" }).click();
    await page.getByTestId("review-comment-input").fill("E2EREVIEW 第二行请补充来源");
    await page.getByTestId("review-comment-save").click();
    await expect(page.getByTestId("review-comment")).toContainText("待发送");
    await expect(page.getByTestId("review-send")).toBeEnabled(); // 由当前终端视图的控制握手授权
    await page.getByTestId("review-send").click();
    await expect(page.getByTestId("review-confirm")).toBeVisible(); // 先预览，确认后才发送
    await expect(page.getByTestId("review-shell-warning")).toBeVisible(); // shell 会话会把文字当命令执行
    await expect(page.getByTestId("review-preview")).toContainText("审查.md:新2 — E2EREVIEW");
    await page.getByTestId("review-confirm-yes").click();
    await expect(page.getByTestId("review-comment")).toContainText("已发送", { timeout: 10_000 });
    await expect(page.locator(".xterm-rows")).toContainText("E2EREVIEW", { timeout: 10_000 }); // 终端收到了意见文本
    await expect(page.getByTestId("review-send")).toBeDisabled(); // 没有待发送的了
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("同步：配置本地远端 → 预览 → 同步；远端副本制造冲突 → 界面逐块解决并推送", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const remote = mkdtempSync(path.join(tmpdir(), "huhu-e2e-remote-"));
  const clone = path.join(mkdtempSync(path.join(tmpdir(), "huhu-e2e-clone-")), "c");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "core.autocrlf=false", "-c", "user.name=远端", "-c", "user.email=r@r", ...args], { encoding: "utf8" });
  execFileSync("git", ["init", "--bare", "-q", "--initial-branch=main", remote]);
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const lines = (edit: Record<number, string> = {}) => Array.from({ length: 12 }, (_, i) => `${edit[i] ?? `第${i}行`}\n`).join("");
    // 界面之外的前置步骤：初始化仓库并写一篇 12 行的笔记
    await page.evaluate(async (text) => {
      const ep = await window.huhuHost.engine();
      const call = async (capability: string, input: unknown) => {
        const r = await fetch(`${ep.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        const j = (await r.json()) as { ok: boolean; data: any; error?: unknown }; // eslint-disable-line
        if (!j.ok) throw new Error(JSON.stringify(j.error));
        return j.data;
      };
      await call("git.init", {});
      const n = await call("notes.create", { name: "共享" });
      const v = (await call("notes.read", { path: n.path })).version;
      await call("notes.save", { path: n.path, text, expectedVersion: v });
    }, lines());
    await page.getByRole("button", { name: "版本历史" }).first().click();
    await page.getByTestId("versioning-nav-sync").click();
    await expect(page.getByTestId("sync-page")).toBeVisible();
    await expect(page.getByTestId("sync-run")).toBeDisabled(); // 没有远端时不能同步

    await page.getByTestId("sync-open-settings").click(); // 同步配置在设置页的“版本与同步”里
    await page.getByTestId("sync-remote").fill(remote);
    await page.getByTestId("sync-branch").fill("main");
    await page.getByTestId("sync-mode-full").click();
    await page.getByTestId("sync-save").click();
    await expect(page.getByTestId("sync-message")).toHaveText("已保存");
    await page.getByRole("button", { name: "版本历史" }).first().click();
    await page.getByTestId("versioning-nav-sync").click();
    await page.getByTestId("sync-preview").click();
    await expect(page.getByTestId("sync-preview-result")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("preview-push").filter({ hasText: "共享.md" })).toBeVisible();
    await page.getByTestId("sync-run").click();
    await expect(page.getByTestId("sync-message")).toContainText("同步完成", { timeout: 30_000 });

    // 另一台设备（克隆）改第 3 行并推送；本机也改第 3 行
    execFileSync("git", ["-c", "core.autocrlf=false", "clone", "-q", remote, clone]);
    writeFileSync(path.join(clone, "共享.md"), lines({ 3: "远端改的" }));
    git(clone, "commit", "-aq", "-m", "远端修改");
    git(clone, "push", "-q", "origin", "HEAD:main");
    writeFileSync(path.join(vault, "共享.md"), lines({ 3: "本地改的" }));

    await page.getByTestId("sync-run").click();
    await expect(page.getByTestId("sync-conflict-banner")).toContainText("1 个文件存在冲突", { timeout: 30_000 });
    await expect(page.getByTestId("sync-state")).toHaveText("有冲突");
    expect(readFileSync(path.join(vault, "共享.md"), "utf8")).toBe(lines({ 3: "本地改的" })); // 工作区没有冲突标记
    expect(existsSync(path.join(vault, ".git/MERGE_HEAD"))).toBe(false);

    await page.getByTestId("sync-resolve").click();
    await expect(page.getByTestId("conflict-view")).toBeVisible();
    await expect(page.getByTestId("conflict-block")).toHaveCount(1);
    await expect(page.getByTestId("block-ours")).toHaveText("本地改的\n");
    await expect(page.getByTestId("block-theirs")).toHaveText("远端改的\n");
    await expect(page.getByTestId("conflict-apply")).toBeDisabled(); // 没选完不能应用
    await expect(page.getByTestId("conflict-progress")).toHaveText("已选 0 / 1");
    await page.getByTestId("block-pick-both").click();
    await expect(page.getByTestId("conflict-progress")).toHaveText("已选 1 / 1");
    await page.getByTestId("conflict-apply").click();
    await expect(page.getByTestId("conflict-message")).toContainText("冲突已解决", { timeout: 30_000 });
    await expect(page.getByTestId("conflict-message")).toContainText("已推送");
    expect(readFileSync(path.join(vault, "共享.md"), "utf8")).toBe(lines({ 3: "本地改的\n远端改的" }));
    git(clone, "pull", "-q", "--no-rebase", "origin", "main");
    expect(readFileSync(path.join(clone, "共享.md"), "utf8")).toBe(lines({ 3: "本地改的\n远端改的" }));
    expect(existsSync(path.join(vault, ".huhu/sync/conflict.json"))).toBe(false);
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(remote);
    rmTree(path.dirname(clone));
  }
});

test("自动化：新 Vault 没有内置规则；新建任务扫描规则后预览列出跳过原因；新建提醒规则并立即运行 → 激活记录与状态栏通知", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 一个 human 任务：预览时应出现在"跳过"里
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    await page.getByTestId("task-editor").getByLabel("任务名称").fill("手动事项");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await expect(page.getByTestId("rule-row")).toHaveCount(0); // 没有内置规则
    await page.getByTestId("rule-new").click();
    await page.getByLabel("规则名称").fill("处理 Agent 任务");
    await page.getByTestId("rule-kind").selectOption("agent_tasks");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByTestId("rule-row").filter({ hasText: "处理 Agent 任务" }).click();
    await page.getByRole("button", { name: "预览将处理的任务" }).click();
    await expect(page.getByTestId("preview-skipped").filter({ hasText: "手动事项" })).toContainText("执行方式非 Agent");
    expect(existsSync(path.join(vault, "Task Runs"))).toBe(false); // 预览不写文件

    await page.getByTestId("rule-new").click();
    await page.getByLabel("规则名称").fill("喝水提醒");
    await page.getByTestId("rule-kind").selectOption("reminder");
    await page.getByLabel("通知内容").fill("该喝水了");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByTestId("rule-row").filter({ hasText: "喝水提醒" }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page.getByRole("button", { name: "激活记录" }).click();
    await expect(page.getByTestId("activation-row").filter({ hasText: "喝水提醒" })).toContainText("立即", { timeout: 10_000 });
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notification-panel")).toContainText("该喝水了", { timeout: 10_000 });
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("自动化：每分钟规则离线 70 天后补跑，重启保留原计划点", async () => {
  test.setTimeout(90_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(vault);
    const page = await app.firstWindow();
    await engineReady(page);
    const rule = await call<{ id: string; path: string }>(page, "automations.create", {
      title: "每分钟检查",
      trigger: { preset: "custom", cron: "* * * * *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "恢复定时检查", taskId: null },
    });
    await app.close();
    app = undefined;

    const last = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 70 * 86_400_000).toISOString().replace(".000Z", "Z");
    const rulePath = path.join(vault, rule.path);
    writeFileSync(rulePath, patchFrontmatter(readFileSync(rulePath, "utf8"), { enabled: true, updatedAt: last }));
    const activationsDir = path.join(vault, ".huhu", "automations", "activations");
    mkdirSync(activationsDir, { recursive: true });
    writeFileSync(
      path.join(activationsDir, `${last.slice(0, 7)}.ndjson`),
      JSON.stringify({
        activationId: "act-f10-fixture",
        ruleId: rule.id,
        trigger: "schedule",
        scheduledFor: last,
        startedAt: last,
        finishedAt: last,
        summary: { state: "succeeded" },
      }) + "\n",
    );

    type Activation = { activationId: string; ruleId: string; scheduledFor: string | null };
    const read = async (window: Page) => (await call<Activation[]>(window, "automations.activations", {})).filter((row) => row.ruleId === rule.id && row.scheduledFor && row.scheduledFor !== last);
    const mostRecentBeforeOpen = Math.floor(Date.now() / 60_000) * 60_000;
    app = await launch(vault);
    const reopened = await app.firstWindow();
    await engineReady(reopened);
    await expect.poll(() => read(reopened)).not.toEqual([]);
    const [recovered] = await read(reopened);
    expect(Date.parse(recovered!.scheduledFor!)).toBeGreaterThanOrEqual(mostRecentBeforeOpen);
    await reopened.getByRole("button", { name: "自动化", exact: true }).first().click();
    await reopened.getByRole("button", { name: "激活记录" }).click();
    await expect(reopened.getByTestId("activation-row").filter({ hasText: "每分钟检查" }).first()).toBeVisible();

    await app.close();
    app = undefined;
    app = await launch(vault);
    const restarted = await app.firstWindow();
    await engineReady(restarted);
    expect((await read(restarted)).filter(({ scheduledFor }) => scheduledFor === recovered!.scheduledFor)).toEqual([recovered]);
  } finally {
    await app?.close();
    rmTree(vault);
  }
});

test("自动化规则编辑器：新建 Agent 规则（Space / CLI / 提示词 / 每天 09:30）默认暂停，编辑后提示词与时间写入规则文件", async () => {
  test.skip(process.platform === "win32", "用 POSIX 脚本冒充 claude；Windows 需要 .cmd 假程序，待补");
  const { chmodSync } = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-e2e-bin-"));
  writeFileSync(path.join(bin, "claude"), "#!/bin/sh\necho '2.0.0 (Claude Code)'\n");
  chmodSync(path.join(bin, "claude"), 0o755);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault, { PATH: `${bin}${path.delimiter}${process.env["PATH"] ?? ""}` });
  const ruleFile = () => {
    const dir = path.join(vault, "Automations");
    const f = readdirSync(dir).find((n) => n.includes("整理周报"));
    return f ? readFileSync(path.join(dir, f), "utf8") : "";
  };
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    const editor = page.getByTestId("rule-editor");
    await editor.getByLabel("规则名称").fill("整理周报");
    await editor.getByTestId("rule-kind").selectOption("agent_prompt");
    await expect(editor.getByTestId("rule-provider")).toContainText("Claude Code", { timeout: 15_000 }); // PATH 上的 claude 被检测到
    await expect(editor.getByTestId("rule-save")).toBeDisabled(); // 缺 Space / CLI / 提示词不能保存
    await editor.getByTestId("rule-space").selectOption({ index: 1 });
    await editor.getByTestId("rule-provider").selectOption("claude");
    await editor.getByTestId("rule-prompt").fill("请整理本周的工作记录，写成周报。");
    await editor.getByTestId("rule-preset").selectOption("daily");
    await editor.getByLabel("时刻", { exact: true }).fill("09:30");
    await expect(editor.getByTestId("rule-cron")).toHaveText("30 9 * * *");
    await expect(editor.getByTestId("rule-upcoming")).toContainText("接下来三次"); // 合法时显示接下来三次激活
    await editor.getByTestId("rule-preset").selectOption("custom");
    await editor.getByLabel("cron 表达式").fill("not a cron");
    await expect(editor.getByTestId("rule-trigger-error")).toContainText("cron 表达式无效");
    await expect(editor.getByTestId("rule-save")).toBeDisabled();
    await editor.getByTestId("rule-preset").selectOption("daily");
    await editor.getByTestId("rule-save").click();
    await expect(page.getByTestId("rule-row").filter({ hasText: "整理周报" })).toContainText("已暂停", { timeout: 10_000 });
    await expect.poll(ruleFile).toContain("请整理本周的工作记录，写成周报。");
    expect(ruleFile()).toContain("source: prompt");
    expect(ruleFile()).toMatch(/enabled: false/);

    // 编辑：改提示词和时间
    await page.getByTestId("rule-row").filter({ hasText: "整理周报" }).click();
    await page.getByTestId("rule-edit").click();
    const edit = page.getByTestId("rule-editor");
    await expect(edit.getByTestId("rule-prompt")).toHaveValue("请整理本周的工作记录，写成周报。");
    await expect(edit.getByLabel("时刻", { exact: true })).toHaveValue("09:30");
    await edit.getByTestId("rule-prompt").fill("改成：只列出已完成的事项。");
    await edit.getByTestId("rule-preset").selectOption("weekdays");
    await edit.getByLabel("时刻", { exact: true }).fill("18:00");
    await edit.getByTestId("rule-save").click();
    await expect.poll(ruleFile).toContain("改成：只列出已完成的事项。");
    expect(ruleFile()).toContain("0 18 * * 1-5");
    expect(ruleFile()).not.toContain("请整理本周的工作记录");
  } finally {
    await app.close();
    rmTree(vault);
    rmTree(bin);
  }
});

async function stopAutomationFixtureCore(vault: string, runtime: string): Promise<void> {
  const meta = path.join(vault, ".huhu", "vault.json");
  if (!existsSync(meta)) return;
  const { id: vaultId } = JSON.parse(readFileSync(meta, "utf8")) as { id: string };
  const machine = machineId();
  const runtimeDir = path.join(vault, ".huhu", "runtime", machine, "herdr");
  if (!existsSync(runtimeDir)) return;
  const core = new HerdrCore({ bin: HERDR, vaultId, machineId: machine, runtimeDir });
  if (process.platform === "win32") {
    await core.stop({ requireConfirmation: true });
    return;
  }
  const endpoint = path.join(runtime, path.basename(core.endpoint));
  if (!existsSync(endpoint)) return;
  const client = new HerdrClient({ endpoint });
  const deadline = AbortSignal.timeout(8_000);
  try {
    await client.connect(deadline);
    expect(await client.call("server.stop", {}, deadline)).toMatchObject({ stopped: true });
  } finally {
    client.close();
  }
  await expect.poll(() => existsSync(endpoint), { timeout: 8_000 }).toBe(false);
}

test("自动化运行：Agent 规则经 Tasks 派遣，运行页显示已完成和结果并可定位原会话", async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(100_000);
  const provider = process.env["HUHU_CODEX_DISPATCH_BIN"];
  if (!provider || !path.isAbsolute(provider)) throw new Error("HUHU_CODEX_DISPATCH_BIN 需要指向验收固定的 Codex 可执行文件");
  const sandbox = mkdtempSync(path.join(process.platform === "win32" ? tmpdir() : "/tmp", "huhu-auto-"));
  const vault = path.join(sandbox, "vault");
  const home = path.join(sandbox, "home");
  const providerHome = path.join(sandbox, "provider");
  const runtime = path.join(sandbox, "runtime");
  const userData = path.join(sandbox, "desktop");
  const title = "整理周报";
  const result = "周报已整理";
  const env: Record<string, string> = {
    ...candidateEnvironment(),
    HUHU_HERDR_BIN: path.resolve(HERDR),
    HUHU_VAULT: vault,
    HOME: home,
    USERPROFILE: home,
    XDG_RUNTIME_DIR: runtime,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_STATE_HOME: path.join(home, ".state"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    PI_CODING_AGENT_DIR: path.join(home, ".pi"),
    PI_CODING_AGENT_SESSION_DIR: path.join(home, ".pi", "sessions"),
    HUHU_CODEX_DISPATCH_HOME: providerHome,
  };
  if (process.platform === "win32") {
    for (const key of ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "USERNAME", "SYSTEMDRIVE", "PROGRAMDATA"]) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    Object.assign(env, { LOCALAPPDATA: path.join(home, "local"), APPDATA: path.join(home, "roaming"), TEMP: sandbox, TMP: sandbox });
  } else {
    Object.assign(env, { SHELL: "/bin/sh", TMPDIR: sandbox });
  }
  let app: ElectronApplication | undefined;
  let responses: Awaited<ReturnType<typeof startCodexResponsesFixture>> | undefined;
  let failed = false;
  const cleanupFailures: string[] = [];
  try {
    for (const dir of [vault, home, providerHome, runtime, userData]) mkdirSync(dir, { mode: 0o700 });
    responses = await startCodexResponsesFixture({ seedReply: result });
    writeFileSync(path.join(providerHome, "config.toml"), responses.config, { mode: 0o600 });
    app = await electron.launch({ args: [root, "--no-sandbox", `--user-data-dir=${userData}`], env });
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });

    async function call<T>(capability: string, input: unknown = {}): Promise<T> {
      const reply = (await page.evaluate(
        async ([cap, payload]) => {
          const endpoint = await window.huhuHost.engine();
          const response = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
            method: "POST",
            headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
            body: JSON.stringify({ capability: cap, input: payload, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
          });
          return response.json();
        },
        [capability, input] as const,
      )) as CapabilityResult<T>;
      if (!reply.ok) throw new Error(`${capability}: ${reply.error.code}`);
      return reply.data;
    }
    const { settings } = await call<{ settings: { revision: number } }>("agent.settings.get");
    await call("agent.settings.update", {
      expectedRevision: settings.revision,
      defaultAgent: "codex",
      agents: { codex: { command: provider }, claude: { enabled: false }, pi: { enabled: false } },
    });
    const observed: unknown[] = [];
    page.on("response", async (response) => {
      if (!response.url().endsWith("/api/v1/call") || response.request().method() !== "POST") return;
      const capability = response.request().postDataJSON()?.capability;
      if (capability !== "tasks.dispatch.recent" && capability !== "tasks.read") return;
      const at = performance.now();
      const reply = (await response.json().catch(() => undefined)) as CapabilityResult<RecentTaskRun[] | TaskDto> | undefined;
      const data = reply?.ok ? reply.data : undefined;
      observed.push({
        at,
        capability,
        status: response.status(),
        ...(Array.isArray(data)
          ? { runs: data.filter((run) => run.title === title).map(({ dispatch, run }) => ({ taskId: dispatch.taskId, runId: dispatch.runId, delivery: run?.result?.delivery })) }
          : { taskId: data?.id, resultRuns: data?.comments.filter(({ event }) => event === "result").map(({ run }) => run) }),
      });
    });

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    const editor = page.getByTestId("rule-editor");
    await editor.getByLabel("规则名称").fill(title);
    await editor.getByTestId("rule-kind").selectOption("agent_prompt");
    await editor.getByTestId("rule-space").selectOption({ index: 1 });
    await editor.getByTestId("rule-provider").selectOption("codex");
    await editor.getByTestId("rule-prompt").fill("请整理本周的工作记录。");
    await editor.getByTestId("rule-save").click();
    await page.getByTestId("rule-row").filter({ hasText: title }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const row = page.getByTestId("run-row").filter({ hasText: title });
    await expect(row).toContainText("已完成", { timeout: 45_000 });
    await row.getByRole("button", { name: title, exact: true }).click();
    const detail = page.getByTestId("run-detail");
    await expect(detail.getByTestId("run-state")).toHaveText("已完成");
    const resultView = detail.getByTestId("managed-run-result");
    try {
      await expect(resultView).toContainText(result);
    } catch (error) {
      await testInfo.attach("自动化运行结果读取", {
        contentType: "application/json",
        body: JSON.stringify({ observed, resultViews: await resultView.count(), readers: await resultView.locator(".ok-root, [data-ok-editor]").count() }),
      });
      throw error;
    }

    const runs = (await call<RecentTaskRun[]>("tasks.dispatch.recent")).filter((run) => run.title === title);
    expect(runs).toHaveLength(1);
    const { dispatch } = runs[0]!;
    const task = await call<TaskDto>("tasks.read", { id: dispatch.taskId });
    const receipts = task.comments.filter(({ run, event }) => run === dispatch.runId && event === "result");
    expect(receipts).toMatchObject([{ session: expect.any(String), body: result }]);
    const sessionId = receipts[0]!.session;
    expect(dispatch.session?.id).toBe(sessionId);
    await expect(detail.locator("[data-run-id]")).toHaveAttribute("data-run-id", dispatch.runId);
    await detail.getByRole("button", { name: "定位原会话", exact: true }).click();
    await page.getByTestId("workspace-session-preview").getByRole("button", { name: "放入新标签", exact: true }).click();
    const pane = page.getByTestId("workspace-pane").and(page.locator(`[data-session-id="${sessionId}"]`));
    await expect(pane).toHaveAttribute("data-active", "true");
    expect(responses.requests).toHaveLength(1);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const steps = [
      ["关闭 Electron", () => app?.close()],
      ["关闭独立 Core", () => stopAutomationFixtureCore(vault, runtime)],
      ["关闭回环响应服务", () => responses?.close()],
      [
        "删除独立测试目录",
        () => {
          if (!cleanupFailures.length) rmTree(sandbox);
        },
      ],
    ] as const;

    for (const [label, cleanup] of steps) {
      try {
        await cleanup();
      } catch {
        cleanupFailures.push(label);
      }
    }
    if (cleanupFailures.length) {
      await testInfo.attach("automation-fixture-cleanup", { body: cleanupFailures.join("\n"), contentType: "text/plain" }).catch(() => {});
    }
  }
  if (!failed && cleanupFailures.length) throw new Error(`自动化夹具清理失败：${cleanupFailures.join("、")}`);
});

test("任务界面：分类计数、搜索、新建对话框（截止日 / 项目 / Agent 执行）、列表 / 看板 / 月历、详情面板、编辑与删除", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    const editor = page.getByTestId("task-editor");

    // 新建 1：今天到期 + 项目
    await page.getByTestId("task-new").click();
    await editor.getByLabel("任务名称").fill("写周报");
    await editor.getByTestId("task-due").fill(todayStr);
    await editor.getByLabel("任务项目").fill("工作");
    await editor.getByTestId("task-body").locator(".ProseMirror").fill("整理本周完成的事项");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-detail")).toContainText("写周报"); // 保存后自动打开详情
    await expect(page.getByTestId("detail-body")).toContainText("整理本周完成的事项");

    // 新建 2：无截止日，空标题不能保存
    await page.getByTestId("task-new").click();
    await page.getByTestId("task-save").click();
    await expect(editor.getByRole("alert").first()).toContainText("请填写任务名称");
    await editor.getByLabel("任务名称").fill("买咖啡豆");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-row")).toHaveCount(2);

    // Agent 执行需要 Space 与 CLI；保存不会启动 Agent
    await page.getByTestId("task-new").click();
    await editor.getByLabel("任务名称").fill("让 Agent 整理");
    await editor.getByTestId("task-type").selectOption("agent");
    await expect(editor.getByTestId("task-agent-fields")).toContainText("任务保存后不会立即启动Agent");
    await page.getByTestId("task-save").click();
    await expect(editor.getByRole("alert").first()).toContainText("Agent 执行需要选择");
    await editor.getByRole("button", { name: "取消" }).click();
    await editor.getByRole("button", { name: "放弃修改" }).click(); // 有未保存的修改：先确认放弃
    await expect(editor).toHaveCount(0);

    // 分类与计数：今日 1 件，全部 2 件
    await expect(page.getByRole("button", { name: /^今日/ })).toContainText("1");
    await expect(page.getByRole("button", { name: /^全部任务/ })).toContainText("2");
    await page.getByRole("button", { name: /^今日/ }).click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await expect(page.getByTestId("task-count")).toHaveText("1 件任务");
    await page.getByRole("button", { name: /^全部任务/ }).click();

    // 搜索（标题 / 正文 / 项目）
    await page.getByTestId("task-search").fill("咖啡");
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await page.getByTestId("task-search").fill("工作");
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await page.getByTestId("task-search").fill("");

    // 看板：改状态后卡片移到“已完成”列
    await page.getByTestId("task-views").getByRole("tab", { name: "看板" }).click();
    await expect(page.getByTestId("board-not_started").getByTestId("board-card")).toHaveCount(2);
    await page.getByTestId("board-not_started").getByTestId("board-card").filter({ hasText: "买咖啡豆" }).getByTestId("task-status").selectOption("completed");
    await expect(page.getByTestId("board-completed").getByTestId("board-card")).toHaveCount(1, { timeout: 10_000 });

    // 月历：今天的任务出现在当月
    await page.getByTestId("task-views").getByRole("tab", { name: "月历" }).click();
    await expect(page.getByTestId("task-calendar").getByRole("button", { name: "写周报" })).toBeVisible();
    await page.getByTestId("task-calendar").getByRole("button", { name: "写周报" }).click();
    await expect(page.getByTestId("detail-title")).toHaveText("写周报");

    // 编辑：改标题
    await page.getByTestId("task-views").getByRole("tab", { name: "列表" }).click();
    await page.getByTestId("detail-edit").click();
    await editor.getByLabel("任务名称").fill("写本周周报");
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("detail-title")).toHaveText("写本周周报");
    await expect.poll(() => readdirSync(path.join(vault, "Tasks")).some((f) => f.includes("写本周周报"))).toBe(true);

    // 删除（二次确认）
    await page.getByTestId("detail-delete").click();
    await page.getByTestId("detail-delete-dialog").getByRole("button", { name: "取消" }).click(); // 先取消一次：任务还在
    await expect(page.getByTestId("task-detail")).toHaveCount(1);
    await page.getByTestId("detail-delete").click();
    await page.getByTestId("detail-delete-confirm").click();
    await expect(page.getByTestId("task-detail")).toHaveCount(0);
    await expect(page.getByTestId("task-row")).toHaveCount(1);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("命令面板：Ctrl+K 打开，搜索并跳转模块，Esc 关闭；内容搜索命中笔记", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  writeFileSync(path.join(vault, "蜻蜓观察.md"), "# 蜻蜓观察\n独特词汇：蜻蜓点水\n");
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByLabel("搜索模块、命令和内容").fill("收件");
    await expect(page.getByTestId("palette-item").first()).toContainText("收件箱");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(page.getByTestId("inbox-module")).toBeVisible();

    await page.keyboard.press("Control+K");
    await page.getByLabel("搜索模块、命令和内容").fill("蜻蜓点水");
    await expect(page.getByTestId("palette-item").filter({ hasText: "蜻蜓观察" })).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("能力网关：开放/关闭能力开关、不可开放的能力无开关；创建令牌只显示一次并可撤销；MCP 开关", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "能力网关" }).first().click();
    await expect(page.getByTestId("gateway-module")).toBeVisible();
    await page.getByLabel("筛选能力").fill("tasks.create");
    const row = page.getByTestId("cap-row").filter({ hasText: "tasks.create" }).first();
    const policyFile = path.join(vault, ".huhu/gateway/tool-access.json");
    await row.getByRole("switch").click();
    const enable = page.getByRole("dialog", { name: "开放工具" });
    await expect(enable).toContainText("tasks.create");
    expect(JSON.parse(readFileSync(policyFile, "utf8")).choices["tasks.create"]).toBe(false);
    await enable.getByRole("button", { name: "保存选择" }).click();
    await expect.poll(() => JSON.parse(readFileSync(policyFile, "utf8")).choices["tasks.create"]).toBe(true);
    await expect(row.getByRole("switch")).toBeChecked();
    await row.getByRole("switch").click();
    await page.getByRole("dialog", { name: "关闭工具" }).getByRole("button", { name: "保存选择" }).click();
    await expect.poll(() => JSON.parse(readFileSync(policyFile, "utf8")).choices["tasks.create"]).toBe(false);
    await page.getByLabel("筛选能力").fill("gateway.tokens.create");
    await expect(page.getByTestId("cap-row").filter({ hasText: "gateway.tokens.create" }).getByRole("switch")).toHaveCount(0);
    await expect(page.getByTestId("cap-row").filter({ hasText: "gateway.tokens.create" })).toContainText("不可开放");
    await page.getByLabel("筛选能力").fill("safe.accounts.reveal");
    const revealRow = page.locator('[data-cap="safe.accounts.reveal"]');
    await expect(revealRow).toContainText("逐项开放");
    await expect(revealRow.getByRole("switch")).not.toBeChecked();
    await revealRow.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "开启所选" })).toBeDisabled();
    await page.getByLabel("批量范围").selectOption("plugin:safe");
    await page.getByRole("button", { name: "预览批量操作" }).click();
    const batch = page.getByRole("dialog", { name: "开启插件全部 · safe" });
    await expect(batch).toContainText("safe.entries.list");
    await expect(batch).not.toContainText("safe.accounts.reveal");
    await batch.getByRole("button", { name: "取消" }).click();
    await revealRow.getByRole("switch").click();
    await page.getByRole("dialog", { name: "开放工具" }).getByRole("button", { name: "保存选择" }).click();
    await expect(revealRow.getByRole("switch")).toBeChecked();
    await revealRow.getByRole("switch").click();
    await page.getByRole("dialog", { name: "关闭工具" }).getByRole("button", { name: "保存选择" }).click();
    await expect(revealRow.getByRole("switch")).not.toBeChecked();

    await page.getByRole("tab", { name: "服务端" }).click();
    await page.getByLabel("令牌名称").fill("自动化脚本");
    await page.getByRole("button", { name: "创建令牌" }).click();
    await expect(page.getByTestId("fresh-token")).toContainText("huhu_");
    const token = (await page.getByTestId("fresh-token").locator("code").innerText()).trim();
    expect(readFileSync(path.join(vault, ".huhu/gateways.json"), "utf8")).not.toContain(token); // 只存哈希
    await expect(page.getByTestId("token-row")).toHaveCount(1);
    await page.getByRole("button", { name: "撤销 自动化脚本" }).click();
    await expect(page.getByTestId("token-row")).toHaveCount(0);

    await page.getByRole("tab", { name: "MCP" }).click();
    await page.getByRole("textbox", { name: "测试台" }).fill("tasks.create");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-row").first()).toHaveAttribute("data-allowed", "false"); // 刚才关掉了
    await page.getByRole("textbox", { name: "测试台" }).fill("gateway.tokens.create");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-row").first()).toContainText("永不对外");
    await page.getByRole("textbox", { name: "测试台" }).fill("no.such.cap");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-notfound")).toBeVisible();

    const mcpToggle = page.getByRole("switch", { name: "启用 MCP 服务" });
    await expect(mcpToggle).not.toBeChecked();
    await mcpToggle.click();
    await expect(mcpToggle).toBeChecked();
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/gateways.json"), "utf8")).mcp?.enabled).toBe(true);
    // 测试台：真实调用（桌面身份）；参数不是合法 JSON 时不能调用
    await page.getByLabel("测试台", { exact: true }).fill("vault.info");
    await page.getByLabel("调用参数 JSON").fill("{坏的");
    await expect(page.getByTestId("bench-invoke")).toBeDisabled();
    await page.getByLabel("调用参数 JSON").fill("{}");
    await page.getByTestId("bench-invoke").click();
    await expect(page.getByTestId("bench-result")).toHaveAttribute("data-ok", "true");
    await expect(page.getByTestId("bench-result")).toContainText("name");
    // 目录来自协议真实权限，先开放内置资源所依赖的能力。
    for (const capability of ["vault.indexEntries", "notes.list", "notes.read"]) {
      await call(page, "gateway.update", { capability, exposed: true });
    }
    await page.getByRole("tab", { name: "Resources" }).click();
    await expect(page.getByTestId("mcp-resources")).toContainText("huhu://notes/recent");
    await page.getByRole("tab", { name: "Templates" }).click();
    await expect(page.getByTestId("mcp-templates")).toContainText("huhu://notes/{id}");
    await page.getByRole("tab", { name: "Prompts" }).click();
    await expect(page.getByTestId("mcp-prompts")).toContainText("knowledge-synthesis");
    await page.getByRole("tab", { name: "Tools" }).click();
    await expect(page.getByTestId("cap-row").first()).toBeVisible();
  } finally {
    await app.close();
    rmTree(vault);
  }
});

test("自动化终端命令：新建 terminal 规则并立即运行，输出写入运行记录文件", async () => {
  test.skip(process.platform === "win32", "命令用 POSIX echo");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    const editor = page.getByTestId("rule-editor");
    await editor.getByLabel("规则名称").fill("打招呼");
    await editor.getByTestId("rule-kind").selectOption("terminal");
    await expect(editor.getByTestId("rule-save")).toBeDisabled(); // 没有命令不能保存
    await editor.getByTestId("rule-command").fill("echo e2e-terminal-ok");
    await editor.getByTestId("rule-save").click();
    await page.getByTestId("rule-row").filter({ hasText: "打招呼" }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await expect
      .poll(
        () => {
          const dir = path.join(vault, "Automation Runs");
          return existsSync(dir)
            ? readdirSync(dir)
                .map((f) => readFileSync(path.join(dir, f), "utf8"))
                .join("\n")
            : "";
        },
        { timeout: 15_000 },
      )
      .toContain("e2e-terminal-ok");
  } finally {
    await app.close();
    rmTree(vault);
  }
});
