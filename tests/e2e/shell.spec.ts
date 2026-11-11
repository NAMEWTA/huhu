import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../apps/desktop");

const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core")

async function launch(vault: string, extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}), ...extraEnv } });
}

test("窗口启动、appInfo 可用、window.open 被拒绝", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    expect(await page.title()).toBe("HUHU");
    const info = await page.evaluate(() => window.huhuHost.appInfo());
    expect(info).toMatchObject({ name: "HUHU", version: "0.0.1" });
    const before = app.windows().length;
    await page.evaluate(() => window.open("file:///etc/passwd"));
    await page.waitForTimeout(500);
    expect(app.windows().length).toBe(before);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("任务：新建、勾选完成并写入 Vault 文件；杀死 Engine 后显示未连接，可重启", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 }); // 默认打开工作台首页
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(page.getByTestId("tasks-module")).toBeVisible();

    await page.getByLabel("任务名称").fill("写发布说明");
    await page.getByRole("button", { name: "新建任务" }).click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    const files = readdirSync(path.join(vault, "Tasks"));
    expect(files).toHaveLength(1);
    expect(readFileSync(path.join(vault, "Tasks", files[0] as string), "utf8")).toContain("completed: false");

    await page.getByRole("checkbox", { name: /标记完成：写发布说明/ }).click();
    await expect(page.getByRole("group", { name: "已完成" })).toBeVisible();
    await expect.poll(() => readFileSync(path.join(vault, "Tasks", readdirSync(path.join(vault, "Tasks"))[0] as string), "utf8")).toContain("completed: true");

    // 杀死 Engine 进程 → 界面提示 → 重启恢复
    const pid = Number(readFileSync(path.join(vault, ".huhu/runtime", readdirSync(path.join(vault, ".huhu/runtime"))[0] as string, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
    process.kill(pid, "SIGKILL");
    await expect(page.getByText("工作台引擎未连接")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "重启引擎" }).click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.getByTestId("task-row")).toHaveCount(1);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("知识库：新建笔记、编辑自动保存到文件、预览双链、改名改写链接", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("notes-module")).toBeVisible();

    for (const n of ["目标", "来源"]) {
      await page.getByLabel("笔记名称").fill(n);
      await page.getByRole("button", { name: "新建笔记" }).click();
      await expect(page.getByTestId("note-item").filter({ hasText: `${n}.md` })).toBeVisible();
    }
    // 正在编辑「来源」（最后创建的）：写入指向「目标」的双链
    await page.getByTestId("markdown-editor").locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("链接到 [[目标]]");
    await expect(page.getByText("已保存")).toBeVisible({ timeout: 5000 });
    expect(readFileSync(path.join(vault, "来源.md"), "utf8")).toContain("链接到 [[目标]]");

    // 预览里双链可点击
    await page.getByRole("button", { name: "预览" }).click();
    await expect(page.getByText("目标", { exact: true }).first()).toBeVisible();

    // 改名「目标」→「新目标」，来源里的双链被改写
    await page.getByTestId("note-item").filter({ hasText: "目标.md" }).click();
    await page.getByRole("button", { name: "重命名", exact: true }).click();
    await page.getByLabel("重命名").fill("新目标");
    await page.getByRole("button", { name: "重命名", exact: true }).click();
    await expect.poll(() => readFileSync(path.join(vault, "来源.md"), "utf8")).toContain("[[新目标]]");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("收件箱与档案：捕获 → 转为任务；创建类型与档案并建立关系", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });

    await page.getByRole("button", { name: "收件箱" }).first().click();
    await page.getByLabel("快速捕获", { exact: true }).fill("整理发布清单");
    await page.getByRole("button", { name: "快速捕获" }).click();
    await expect(page.getByTestId("capture-item")).toHaveCount(1);
    expect(readdirSync(path.join(vault, "Inbox"))).toHaveLength(1);
    await page.getByTestId("capture-item").click();
    await page.getByRole("button", { name: "转为任务" }).click();
    await expect(page.getByText("这个想法已经开始行动")).toBeVisible({ timeout: 5000 });
    expect(readdirSync(path.join(vault, "Tasks"))).toHaveLength(1);

    await page.getByRole("button", { name: "档案" }).first().click();
    await page.getByLabel("类型名称").fill("项目");
    await page.getByRole("button", { name: "新建类型" }).click();
    await expect(page.getByRole("button", { name: /^项目/ })).toBeVisible();
    for (const n of ["甲", "乙"]) {
      await page.getByLabel("名称", { exact: true }).fill(n);
      await page.getByRole("button", { name: "新建档案" }).click();
      await expect(page.getByTestId("archive-row").filter({ hasText: n })).toBeVisible();
    }
    // 当前选中的是「乙」：把「甲」设为关联
    await page.getByLabel("关联档案", { exact: true }).selectOption({ label: "甲" });
    await expect.poll(() => readdirSync(path.join(vault, "Archives")).map((f) => readFileSync(path.join(vault, "Archives", f), "utf8")).filter((t) => /relatedIds:\s*\n?\s*-?\s*\[?archive-/.test(t) || t.includes("relatedIds: [archive-")).length).toBe(2);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("保险箱：设置主密码、新增凭据、显示、锁定后需要解锁、密文不含明文", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "保险箱" }).first().click();
    await expect(page.getByTestId("safe-setup")).toBeVisible();
    const submit = page.getByRole("button", { name: "创建保险箱" });
    await page.getByLabel("主密码", { exact: true }).fill("correct horse battery");
    await page.getByLabel("确认主密码").fill("correct horse battery");
    await expect(submit).toBeDisabled(); // 未勾选「我已了解」
    await page.getByLabel("我已了解").check();
    await submit.click();
    await expect(page.getByTestId("safe-unlocked")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("凭据名称").fill("GitHub");
    await page.getByLabel("秘密值").fill("HUHU-MARKER-7f3a");
    await page.getByRole("button", { name: "新增凭据" }).click();
    await expect(page.getByTestId("safe-item")).toHaveCount(1);
    await expect(page.getByTestId("secret-value")).toHaveText("••••••••");
    await page.getByRole("button", { name: "显示" }).click();
    await expect(page.getByTestId("secret-value")).toHaveText("HUHU-MARKER-7f3a");

    await page.getByRole("button", { name: "手动锁定" }).click();
    await expect(page.getByTestId("safe-locked")).toBeVisible();
    await page.getByLabel("主密码", { exact: true }).fill("wrong password!");
    await page.getByRole("button", { name: "解锁保险箱" }).click();
    await expect(page.getByText("主密码不正确")).toBeVisible();
    await page.getByLabel("主密码", { exact: true }).fill("correct horse battery");
    await page.getByRole("button", { name: "解锁保险箱" }).click();
    await expect(page.getByTestId("safe-unlocked")).toBeVisible({ timeout: 15_000 });

    const all: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (readFileSync(p).includes("HUHU-MARKER-7f3a")) all.push(p); } };
    walk(vault);
    expect(all).toEqual([]);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("设置与通知：切换主题立即生效并持久化，重启后仍保持；通知入口显示未读", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByLabel("主题").selectOption("suliworld");
    await page.getByLabel("明暗模式").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "suliworld");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).appearance).toMatchObject({ theme: "suliworld", mode: "dark" });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "suliworld", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");

    // 通知：任务提醒到点 → 状态栏出现未读
    await page.getByRole("button", { name: "任务" }).first().click();
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();
    await expect(page.getByText("没有通知")).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(vault, { recursive: true, force: true });
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
    await page.getByRole("button", { name: "停用 知识库" }).click();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/plugins.json"), "utf8")).builtin.notes).toEqual({ enabled: false });
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "插件中心" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.getByRole("button", { name: "启用 知识库" }).click();
    await expect(page.getByRole("button", { name: "知识库", exact: true })).toBeVisible({ timeout: 5000 });
  } finally {
    await app.close().catch(() => undefined);
    rmSync(vault, { recursive: true, force: true });
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
    await expect(page.getByTestId("card-open").locator("strong")).toHaveText("0");
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByLabel("任务名称").fill("首页测试任务");
    await page.getByRole("button", { name: "新建任务" }).click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);
    await page.getByRole("button", { name: "工作台", exact: true }).first().click();
    await expect(page.getByTestId("card-open").locator("strong")).toHaveText("1");
    await page.getByRole("button", { name: "健康中心" }).first().click();
    await expect(page.getByTestId("health-overall")).toHaveText("有需要留意的项目");
    await expect(page.getByTestId("health-check").filter({ hasText: "broken.md" })).toHaveAttribute("data-status", "warning");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});


test.skip(!existsSync(HERDR), "需要编译好的 Herdr Core");
test("Agent CLI：在 Space 里启动 shell，经 xterm 输入并看到输出；关闭视图后进程仍在，可重新打开", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
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
    } catch { /* 清理尽力而为 */ }
    rmSync(vault, { recursive: true, force: true });
  }
});

test("远程连接：新增主机（密码进保险箱）、确认指纹、连接、Exec、交互终端", async () => {
  const { startFakeSsh } = await import("../../plugins/ssh/test/fake-server.js");
  const srv = await startFakeSsh({ password: "e2e-ssh-pw" });
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 先设置保险箱
    await page.getByRole("button", { name: "保险箱" }).first().click();
    await page.getByLabel("主密码", { exact: true }).fill("correct horse battery");
    await page.getByLabel("确认主密码").fill("correct horse battery");
    await page.getByLabel("我已了解").check();
    await page.getByRole("button", { name: "创建保险箱" }).click();
    await expect(page.getByTestId("safe-unlocked")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "远程连接" }).first().click();
    await page.getByLabel("显示名称").fill("测试机");
    await page.getByLabel("主机名或 IP").fill("127.0.0.1");
    await page.getByLabel("端口", { exact: true }).fill(String(srv.port));
    await page.getByLabel("用户名").fill("u");
    await page.getByLabel("密码", { exact: true }).fill("e2e-ssh-pw");
    await page.getByRole("button", { name: "新增主机" }).click();
    await expect(page.getByRole("button", { name: /测试机/ })).toBeVisible();

    await page.getByRole("button", { name: "连接", exact: true }).click();
    await expect(page.getByTestId("hostkey-dialog")).toContainText("SHA256:");
    await page.getByRole("button", { name: "信任并连接" }).click();
    await expect(page.getByRole("button", { name: "断开" })).toBeVisible({ timeout: 10_000 });
    expect(readFileSync(path.join(vault, ".huhu/ssh/known_hosts"), "utf8")).toContain("ssh-ed25519");

    await page.getByLabel("命令", { exact: true }).fill("echo 来自远端");
    await page.getByRole("button", { name: "运行" }).click();
    await expect(page.getByTestId("exec-output")).toContainText("来自远端");
    await expect(page.getByTestId("exec-output")).toContainText("退出码: 0");

    await page.getByRole("button", { name: "新建终端" }).click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 10_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("Z"); // 假服务器按收到的每个按键回显 ECHO:<按键>
    await expect(page.locator(".xterm-rows")).toContainText("ECHO:Z", { timeout: 10_000 });

    // SFTP 文件：浏览、上传（同名需确认）、预览、下载、重命名、删除（需确认）
    srv.fs.files.set("/home/test/说明.txt", Buffer.from("远端说明文件"));
    const files = page.getByTestId("files-panel");
    await files.getByRole("button", { name: "刷新" }).click();
    await expect(files.getByTestId("files-path")).toHaveText("/home/test");
    await expect(files.getByTestId("files-row").filter({ hasText: "说明.txt" })).toBeVisible();
    await files.getByTestId("files-open").filter({ hasText: "说明.txt" }).click();
    await expect(files.getByTestId("files-preview")).toHaveText("远端说明文件");

    const local = mkdtempSync(path.join(tmpdir(), "huhu-e2e-up-"));
    writeFileSync(path.join(local, "上传.txt"), "来自本机");
    await files.getByTestId("files-upload-from").fill(path.join(local, "上传.txt"));
    await files.getByTestId("files-upload-go").click();
    await expect(files.getByTestId("files-row").filter({ hasText: "上传.txt" })).toBeVisible({ timeout: 10_000 });
    expect(srv.fs.files.get("/home/test/上传.txt")?.toString()).toBe("来自本机");
    writeFileSync(path.join(local, "上传.txt"), "改过的内容");
    await files.getByTestId("files-upload-from").fill(path.join(local, "上传.txt")); // 上一次成功后输入框已清空
    await files.getByTestId("files-upload-go").click(); // 同名：先确认
    await expect(files.getByTestId("files-overwrite")).toBeVisible();
    await files.getByTestId("files-overwrite-no").click();
    expect(srv.fs.files.get("/home/test/上传.txt")?.toString()).toBe("来自本机"); // 取消则远端不变
    await files.getByTestId("files-upload-go").click();
    await expect(files.getByTestId("files-overwrite")).toBeVisible();
    await files.getByTestId("files-overwrite-yes").click();
    await expect.poll(() => srv.fs.files.get("/home/test/上传.txt")?.toString()).toBe("改过的内容");

    await files.getByRole("button", { name: "下载 说明.txt" }).click();
    await files.getByTestId("files-save-to").fill(path.join(local, "下载回来.txt"));
    await files.getByTestId("files-download-go").click();
    await expect.poll(() => existsSync(path.join(local, "下载回来.txt"))).toBe(true);
    expect(readFileSync(path.join(local, "下载回来.txt"), "utf8")).toBe("远端说明文件");

    await files.getByRole("button", { name: "重命名 上传.txt" }).click();
    await files.getByTestId("files-rename-to").fill("已改名.txt");
    await files.getByTestId("files-rename-go").click();
    await expect(files.getByTestId("files-row").filter({ hasText: "已改名.txt" })).toBeVisible({ timeout: 10_000 });
    expect(srv.fs.files.has("/home/test/上传.txt")).toBe(false);

    await files.getByRole("button", { name: "删除 已改名.txt" }).click();
    await expect(files.getByTestId("files-delete-dialog")).toBeVisible();
    await files.getByTestId("files-delete-yes").click();
    await expect.poll(() => srv.fs.files.has("/home/test/已改名.txt")).toBe(false);
    expect([...srv.fs.files.keys()].filter((k) => k.includes("huhu-upload"))).toEqual([]);
    rmSync(local, { recursive: true, force: true });
  } finally {
    await app.close();
    await srv.close();
    rmSync(vault, { recursive: true, force: true });
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
  writeFileSync(path.join(cx, "sessions", "2026", "11", "09", "rollout-2026-11-09T10-00-00-codex-1.jsonl"), row({ type: "session_meta", payload: { id: "codex-1", cwd } }) + row({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "修复登录页" }] } }));
  writeFileSync(path.join(cx, "sessions", "2026", "11", "09", "rollout-2026-11-09T11-00-00-codex-2.jsonl"), row({ type: "session_meta", payload: { id: "codex-2", cwd: tmpdir() } })); // 不在这个 Space
  const app = await launch(vault, { CLAUDE_CONFIG_DIR: cfg, CODEX_HOME: cx });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("agent-cli-module")).toBeVisible();
    await page.getByTestId("agent-history-toggle").click();
    await expect(page.getByTestId("history-item")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId("history-title").filter({ hasText: "梳理发布清单" })).toBeVisible();
    await expect(page.getByTestId("history-title").filter({ hasText: "修复登录页" })).toBeVisible();
    // 恢复入口只对白名单里的会话开放：未知 id 被后端拒绝
    const err = await page.evaluate(async () => {
      const ep = await window.huhuHost.engine();
      const spaces = (await (await fetch(`${ep.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability: "agent.spaces.list", input: {}, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }) })).json()).data as { id: string; revision: number }[];
      const sp = spaces[0] as { id: string; revision: number };
      const r = await fetch(`${ep.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability: "agent.history.resume", input: { spaceId: sp.id, spaceRevision: sp.revision, provider: "claude", nativeSessionId: "不存在的会话", requestId: crypto.randomUUID() }, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }) });
      return ((await r.json()) as { error?: { code: string } }).error?.code;
    });
    expect(err).toBe("INVALID_INPUT");
  } finally {
    await app.close();
    for (const d of [vault, cfg, cx]) rmSync(d, { recursive: true, force: true });
  }
});

test("同步凭据：下拉只列出保险箱里允许 versioning 的令牌；保存后配置里只有 safe:// 引用，没有秘密", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.evaluate(async () => {
      const ep = await window.huhuHost.engine();
      const call = async (capability: string, input: unknown) => {
        const r = await fetch(`${ep.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }) });
        const j = (await r.json()) as { ok: boolean; data: any; error?: unknown }; // eslint-disable-line
        if (!j.ok) throw new Error(JSON.stringify(j.error));
        return j.data;
      };
      await call("git.init", {});
      await call("safe.setup", { password: "correct horse battery staple" });
      await call("safe.items.save", { name: "GitHub 令牌", type: "token", value: "ghp_e2e_secret_value", allowedModules: ["versioning"] });
      await call("safe.items.save", { name: "别的模块的令牌", type: "token", value: "other_secret", allowedModules: ["ssh"] });
    });
    await page.getByRole("button", { name: "版本与同步" }).first().click();
    await page.getByTestId("versioning-nav-sync").click();
    const sel = page.getByTestId("sync-credential");
    await expect(sel.locator("option")).toHaveText(["无（使用系统的 Git 凭据助手 / SSH agent）", "GitHub 令牌"], { timeout: 10_000 });
    await page.getByTestId("sync-remote").fill("https://example.invalid/team/notes.git");
    await sel.selectOption({ label: "GitHub 令牌" });
    await page.getByTestId("sync-credential-user").fill("alice");
    await page.getByTestId("sync-save").click();
    await expect(page.getByTestId("sync-message")).toHaveText("已保存");
    const cfg = readFileSync(path.join(vault, ".huhu/sync/config.json"), "utf8");
    expect(JSON.parse(cfg)).toMatchObject({ credential: expect.stringMatching(/^safe:\/\/item-[0-9a-z]+$/), credentialUser: "alice" });
    expect(cfg).not.toContain("ghp_e2e_secret_value");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
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
    await expect(page.getByTestId("svault-root")).toHaveText(realpathSync(vault));
    await page.getByTestId("svault-name").fill("我的第二大脑");
    await page.getByTestId("svault-description").fill("工作与学习");
    await page.getByTestId("svault-save").click();
    await expect(page.getByTestId("svault-note")).toHaveText("已保存");
    expect(JSON.parse(readFileSync(path.join(vault, ".huhu/vault.json"), "utf8"))).toMatchObject({ name: "我的第二大脑", description: "工作与学习" });
    await expect(page.getByTestId("svault-counts")).toContainText("篇笔记");
    await page.getByTestId("svault-name").fill("   ");
    await expect(page.getByTestId("svault-save")).toBeDisabled(); // 空名称不能保存
    await expect(page.getByTestId("svault-id")).toHaveText(/^vault-[0-9a-z]+$/);

    await page.getByTestId("settings-nav-shortcuts").click();
    await expect(page.getByTestId("shortcut-row")).toHaveCount(3);
    await expect(page.getByTestId("settings-shortcuts")).toContainText("命令面板");

    await page.getByTestId("settings-nav-about").click();
    await expect(page.getByTestId("about-version")).toHaveText("HUHU 0.0.1");
    await expect(page.getByTestId("about-electron")).toHaveText(/^\d+\.\d+\.\d+/);
    await expect(page.getByTestId("about-node")).toHaveText(/^\d+\.\d+\.\d+/);
    await page.getByTestId("about-notices").locator("summary").click();
    await expect(page.getByTestId("about-notices")).toContainText("Herdr Core");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
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
    await page.getByLabel("笔记名称").fill("备份内容");
    await page.getByRole("button", { name: "新建笔记" }).click();
    await expect(page.getByTestId("note-item").filter({ hasText: "备份内容.md" })).toBeVisible();
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-storage").click();
    await expect(page.getByTestId("storage-counts")).toContainText("篇笔记已建立索引");

    await page.getByTestId("storage-reindex").click();
    await expect(page.getByTestId("storage-reindex-msg")).toHaveText("索引已重建", { timeout: 20_000 });

    const zip = path.join(out, "备份.zip");
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
    rmSync(vault, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("网关·命令行：开发运行时说明没有打包好的启动脚本，不提供安装；速查表可见", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "网关" }).first().click();
    const cli = page.getByTestId("cli-section");
    await expect(cli).toBeVisible();
    await expect(cli.getByTestId("cli-state")).toHaveText(/未安装/);
    await expect(cli.getByTestId("cli-unsupported")).toContainText("开发运行");
    await expect(cli.getByTestId("cli-install")).toHaveCount(0);
    await expect(cli).toContainText("huhu call vault.info");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("设置：编辑器页的开关真正生效（关闭自动保存 → 只在点“保存”时写入；行号、字号、宽度）；外观的导航宽度与紧凑布局", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByLabel("导航栏宽度").fill("320");
    await expect(page.locator("html")).toHaveCSS("--sidebar-w", "320px");
    await page.getByLabel("紧凑布局").click();
    await expect(page.getByLabel("紧凑布局")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

    await page.getByTestId("settings-nav-editor").click();
    await page.getByLabel("自动保存").click();
    await expect(page.getByLabel("自动保存")).not.toBeChecked();
    await page.getByLabel("显示行号").click();
    await expect(page.getByLabel("显示行号")).toBeChecked();
    await page.getByLabel("正文字号").fill("20");
    await page.getByLabel("正文宽度").selectOption("680");
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).editor).toMatchObject({ autosave: false, lineNumbers: true, fontSize: 20, readableWidth: "680" });

    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByLabel("笔记名称").fill("手动保存");
    await page.getByRole("button", { name: "新建笔记" }).click();
    await expect(page.getByTestId("note-item").filter({ hasText: "手动保存.md" })).toBeVisible();
    const editor = page.getByTestId("markdown-editor");
    await expect(editor.locator(".cm-lineNumbers")).toBeVisible(); // 行号
    await expect(editor).toHaveCSS("max-width", "680px");
    await expect(editor.locator(".cm-content")).toHaveCSS("font-size", "20px");
    await editor.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("手动保存的正文");
    await page.waitForTimeout(2500); // 远超 800ms 的自动保存间隔
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("手动保存的正文");
    await page.getByTestId("note-save").click();
    await expect.poll(() => readFileSync(path.join(vault, "手动保存.md"), "utf8")).toContain("手动保存的正文");

    // 没点保存就离开：切换到另一篇笔记时未保存的编辑会被写入，不丢内容
    await page.keyboard.type("，离开前的补充");
    await page.waitForTimeout(1500);
    expect(readFileSync(path.join(vault, "手动保存.md"), "utf8")).not.toContain("离开前的补充");
    await page.getByLabel("笔记名称").fill("另一篇");
    await page.getByRole("button", { name: "新建笔记" }).click();
    await expect(page.getByTestId("note-item").filter({ hasText: "另一篇.md" })).toBeVisible();
    await expect.poll(() => readFileSync(path.join(vault, "手动保存.md"), "utf8"), { timeout: 10_000 }).toContain("离开前的补充");

    // 重新打开自动保存后恢复原行为
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByLabel("自动保存").click();
    await expect(page.getByLabel("自动保存")).toBeChecked();
    await page.getByRole("button", { name: "知识库" }).first().click();
    await expect(page.getByTestId("note-save")).toHaveCount(0);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
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
      const f = path.join(dir, id, name);
      if (existsSync(f)) return readFileSync(f, "utf8");
    }
    return "";
  };
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    await page.getByLabel("自动保存").click();
    await expect(page.getByLabel("自动保存")).not.toBeChecked();
    await page.getByRole("button", { name: "知识库" }).first().click();
    const edit = async (title: string) => {
      await page.getByLabel("笔记名称").fill(title);
      await page.getByRole("button", { name: "新建笔记" }).click();
      await page.getByTestId("note-item").filter({ hasText: `${title}.md` }).click();
      await page.getByTestId("markdown-editor").locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type(EDIT);
      await expect(page.getByTestId("note-save")).toBeEnabled();
      await page.waitForTimeout(1500);
      expect(readFileSync(path.join(vault, `${title}.md`), "utf8")).not.toContain(EDIT);
    };
    await edit("改名前");
    await page.getByRole("button", { name: "重命名", exact: true }).click();
    await page.getByLabel("重命名").fill("改名后");
    await page.getByRole("button", { name: "重命名", exact: true }).click();
    await expect.poll(() => existsSync(path.join(vault, "改名后.md"))).toBe(true);
    await expect.poll(() => readFileSync(path.join(vault, "改名后.md"), "utf8")).toContain(EDIT);
    expect(existsSync(path.join(vault, "改名前.md"))).toBe(false);

    await edit("回收站前");
    await page.getByRole("button", { name: "移到回收站", exact: true }).click();
    await expect.poll(() => trashed("回收站前.md")).toContain(EDIT);
    expect(existsSync(path.join(vault, "回收站前.md"))).toBe(false);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app = await launch(vault);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await app.close();
    // 预置一个还剩 2 秒、正在运行的专注：不必等 25 分钟
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date());
    mkdirSync(path.join(vault, ".huhu", "home"), { recursive: true });
    writeFileSync(path.join(vault, ".huhu", "home", "focus.json"), JSON.stringify({ remainingSec: 2, running: true, startedAt: new Date().toISOString(), completedToday: 0, dateKey: today }));
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 });
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
    await page.getByLabel("新习惯").fill("喝水");
    await page.getByRole("button", { name: "添加" }).click();
    await expect(page.getByTestId("habit-row")).toHaveCount(1);
    await page.getByLabel("喝水", { exact: true }).click();
    await expect(page.getByLabel("喝水", { exact: true })).toBeChecked();
    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await expect(page.getByTestId("habit-row")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByLabel("喝水", { exact: true })).toBeChecked();

    // 自定义：隐藏专注卡片，重启后仍隐藏
    await page.getByTestId("home-customize").click();
    await page.getByTestId("home-customize-panel").getByRole("checkbox", { name: "专注计时" }).click();
    await expect(page.getByTestId("card-focus")).toHaveCount(0);
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/home/widgets.json"), "utf8")).hidden).toEqual(["focus"]);

    // ACC-WB-08：停用任务插件，任务卡片隐藏
    await expect(page.getByTestId("card-open")).toBeVisible();
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.getByRole("button", { name: "停用 任务" }).click();
    await page.getByRole("button", { name: "工作台" }).first().click();
    await expect(page.getByTestId("card-open")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("card-today")).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(vault, { recursive: true, force: true });
  }
});

test("设置：时区改变后页面显示该时区的当前日期，非法时区被拒绝且不写入", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByTestId("settings-nav-datetime").click();
    await page.getByTestId("settings-zone").fill("Nowhere/Land");
    await expect(page.getByTestId("settings-zone-invalid")).toBeVisible();
    await page.getByTestId("settings-zone").fill("Pacific/Kiritimati");
    await expect(page.getByTestId("settings-zone-invalid")).toHaveCount(0);
    await expect.poll(() => { try { return JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).dateTime.zone; } catch { return null; } }, { timeout: 20_000 }).toBe("Pacific/Kiritimati"); // 文件尚未写出时读取会 ENOENT：视为“还没有”，继续等
    const expected = new Intl.DateTimeFormat("zh-CN", { timeZone: "Pacific/Kiritimati", dateStyle: "full" }).format(new Date());
    await expect(page.getByTestId("settings-zone-now")).toContainText(expected);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
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
        const r = await fetch(`${ep.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }) });
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
    await page.getByRole("button", { name: "版本与同步" }).first().click();
    await expect(page.getByTestId("history-entry")).toHaveCount(2, { timeout: 10_000 });
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
    await expect(page.getByTestId("git-staged")).toHaveCount(1);
    await page.getByLabel("提交说明").fill("第一次提交");
    await page.getByRole("button", { name: "提交", exact: true }).click();
    await expect(page.getByTestId("git-commit").filter({ hasText: "第一次提交" })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("Agent CLI 分屏：左右两格同时显示两个会话并各自输入；四格有空位提示；新建/点标签自动出现；切回单窗格", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  let page: Awaited<ReturnType<typeof app.firstWindow>> | undefined;
  try {
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "新终端", exact: true }).click();
      await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
      await expect(page.getByTestId("session-tab")).toHaveCount(i + 1, { timeout: 15_000 });
    }
    await page.getByTestId("layout-2").click();
    await expect(page.getByTestId("split-cell")).toHaveCount(2);
    await expect(page.getByTestId("terminal-view")).toHaveCount(2);
    for (const tv of await page.getByTestId("terminal-view").all()) await expect(tv).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    const picks = page.getByTestId("split-pick");
    expect(await picks.nth(0).inputValue()).not.toBe(await picks.nth(1).inputValue()); // 两格不是同一个会话
    const helpers = page.locator(".xterm-helper-textarea");
    await helpers.nth(0).focus(); await page.keyboard.type("echo LEFT-$((1+1))"); await page.keyboard.press("Enter");
    await helpers.nth(1).focus(); await page.keyboard.type("echo RIGHT-$((2+2))"); await page.keyboard.press("Enter");
    await expect(page.getByTestId("split-cell").nth(0).locator(".xterm-rows")).toContainText("LEFT-2", { timeout: 10_000 });
    await expect(page.getByTestId("split-cell").nth(1).locator(".xterm-rows")).toContainText("RIGHT-4", { timeout: 10_000 });
    await expect(page.getByTestId("split-cell").nth(0).locator(".xterm-rows")).not.toContainText("RIGHT-4"); // 各自独立

    await page.getByTestId("layout-4").click();
    await expect(page.getByTestId("split-cell")).toHaveCount(4);
    await expect(page.getByText("选一个运行中的会话显示在这里")).toHaveCount(2);
    // 新建的会话自动出现在空格里（分屏中不用手动去下拉框选）
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
    await expect(page.getByTestId("session-tab")).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByTestId("terminal-view")).toHaveCount(3);
    // 用户明确选“空”的格子不会被自动补满
    await page.getByTestId("split-pick").nth(2).selectOption("");
    await expect(page.getByTestId("terminal-view")).toHaveCount(2);
    await page.getByTestId("layout-1").click();
    await expect(page.getByTestId("split-view")).toHaveCount(0);
    await expect(page.getByTestId("terminal-view")).toHaveCount(1);
  } finally {
    await page?.evaluate(() => localStorage.removeItem("huhu.agentcli.layout")).catch(() => undefined); // 布局偏好存在共享的 Electron profile 里：不要影响后面的单窗格用例
    await app.close();
    rmSync(vault, { recursive: true, force: true });
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
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "新终端", exact: true }).click();
      await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
      await expect(page.getByTestId("session-tab")).toHaveCount(i + 1, { timeout: 15_000 });
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
    rmSync(vault, { recursive: true, force: true });
  }
});

test("Agent CLI 变更审查（ACC-AG-10）：显示工作树差异，在行上加意见，发送后会话终端收到文本并标记已发送；非 Git 目录给出说明", async () => {
  test.skip(!existsSync(HERDR), "需要 Herdr Core：先运行 node scripts/fetch-herdr.mjs");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });

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
    rmSync(vault, { recursive: true, force: true });
  }
});

test("同步：配置本地远端 → 预览 → 同步；远端副本制造冲突 → 界面逐块解决并推送", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const remote = mkdtempSync(path.join(tmpdir(), "huhu-e2e-remote-"));
  const clone = path.join(mkdtempSync(path.join(tmpdir(), "huhu-e2e-clone-")), "c");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "user.name=远端", "-c", "user.email=r@r", ...args], { encoding: "utf8" });
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
        const r = await fetch(`${ep.baseUrl}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${ep.token}`, "content-type": "application/json" }, body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }) });
        const j = (await r.json()) as { ok: boolean; data: any; error?: unknown }; // eslint-disable-line
        if (!j.ok) throw new Error(JSON.stringify(j.error));
        return j.data;
      };
      await call("git.init", {});
      const n = await call("notes.create", { name: "共享" });
      const v = (await call("notes.read", { path: n.path })).version;
      await call("notes.save", { path: n.path, text, expectedVersion: v });
    }, lines());
    await page.getByRole("button", { name: "版本与同步" }).first().click();
    await page.getByTestId("versioning-nav-sync").click();
    await expect(page.getByTestId("sync-page")).toBeVisible();
    await expect(page.getByTestId("sync-run")).toBeDisabled(); // 没有远端时不能同步

    await page.getByTestId("sync-remote").fill(remote);
    await page.getByTestId("sync-branch").fill("main");
    await page.getByTestId("sync-mode-full").click();
    await page.getByTestId("sync-save").click();
    await expect(page.getByTestId("sync-message")).toHaveText("已保存");
    await page.getByTestId("sync-preview").click();
    await expect(page.getByTestId("sync-preview-result")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("preview-push").filter({ hasText: "共享.md" })).toBeVisible();
    await page.getByTestId("sync-run").click();
    await expect(page.getByTestId("sync-message")).toContainText("同步完成", { timeout: 30_000 });

    // 另一台设备（克隆）改第 3 行并推送；本机也改第 3 行
    execFileSync("git", ["clone", "-q", remote, clone]);
    writeFileSync(path.join(clone, "共享.md"), lines({ 3: "远端改的" }));
    git(clone, "commit", "-aq", "-m", "远端修改"); git(clone, "push", "-q", "origin", "HEAD:main");
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
    rmSync(vault, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
    rmSync(path.dirname(clone), { recursive: true, force: true });
  }
});

test("自动化：内置规则存在且不可删除；预览列出跳过原因；新建通知规则并立即运行 → 激活记录与状态栏通知", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 一个手动任务：预览时应出现在"跳过"里
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByLabel("任务名称").fill("手动事项");
    await page.getByRole("button", { name: "新建任务" }).click();
    await expect(page.getByTestId("task-row")).toHaveCount(1);

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await expect(page.getByTestId("rule-row").filter({ hasText: "定时检查 Agent 任务" })).toContainText("内置");
    await expect(page.getByRole("button", { name: "删除", exact: true })).toHaveCount(0); // 内置规则没有删除入口
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect(page.getByTestId("preview-skipped").filter({ hasText: "手动事项" })).toContainText("执行方式非 Agent");
    expect(existsSync(path.join(vault, "Task Runs"))).toBe(false); // 预览不写文件

    await page.getByLabel("规则名称").fill("喝水提醒");
    await page.getByLabel("通知内容").fill("该喝水了");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByTestId("rule-row").filter({ hasText: "喝水提醒" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page.getByRole("button", { name: "激活记录" }).click();
    await expect(page.getByTestId("activation-row").filter({ hasText: "喝水提醒" })).toContainText("立即", { timeout: 10_000 });
    await page.getByTestId("bell").click();
    await expect(page.getByTestId("notification-panel")).toContainText("该喝水了", { timeout: 10_000 });
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("自动化规则编辑器：新建 Agent 规则（Space / CLI / 提示词 / 每天 09:30）默认暂停，编辑后提示词与时间写入规则文件", async () => {
  test.skip(process.platform === "win32", "用 POSIX 脚本冒充 claude；Windows 需要 .cmd 假程序，待补");
  const { chmodSync } = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-e2e-bin-"));
  writeFileSync(path.join(bin, "claude"), "#!/bin/sh\necho '2.0.0 (Claude Code)'\n"); chmodSync(path.join(bin, "claude"), 0o755);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault, { PATH: `${bin}${path.delimiter}${process.env["PATH"] ?? ""}` });
  const ruleFile = () => { const dir = path.join(vault, "Automations"); const f = readdirSync(dir).find((n) => n.includes("整理周报")); return f ? readFileSync(path.join(dir, f), "utf8") : ""; };
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const editor = page.getByTestId("rule-editor");
    await editor.getByLabel("规则名称").fill("整理周报");
    await editor.getByTestId("rule-kind").selectOption("agent_prompt");
    await expect(editor.getByTestId("rule-provider")).toContainText("Claude Code", { timeout: 15_000 }); // PATH 上的 claude 被检测到
    await expect(editor.getByTestId("rule-save")).toBeDisabled(); // 缺 Space / CLI / 提示词不能保存
    await editor.getByTestId("rule-space").selectOption({ index: 1 });
    await editor.getByTestId("rule-provider").selectOption("claude");
    await editor.getByTestId("rule-prompt").fill("请整理本周的工作记录，写成周报。");
    await editor.getByTestId("rule-preset").selectOption("daily");
    await editor.getByLabel("时刻").fill("09:30");
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
    expect(ruleFile()).toContain("agent_prompt");
    expect(ruleFile()).toMatch(/enabled: false/);

    // 编辑：改提示词和时间
    await page.getByTestId("rule-row").filter({ hasText: "整理周报" }).getByRole("button").first().click();
    await page.getByTestId("rule-edit").click();
    const edit = page.getByTestId("rule-editor");
    await expect(edit.getByTestId("rule-prompt")).toHaveValue("请整理本周的工作记录，写成周报。");
    await expect(edit.getByLabel("时刻")).toHaveValue("09:30");
    await edit.getByTestId("rule-prompt").fill("改成：只列出已完成的事项。");
    await edit.getByTestId("rule-preset").selectOption("weekdays");
    await edit.getByLabel("时刻").fill("18:00");
    await edit.getByTestId("rule-save").click();
    await expect.poll(ruleFile).toContain("改成：只列出已完成的事项。");
    expect(ruleFile()).toContain("0 18 * * 1-5");
    expect(ruleFile()).not.toContain("请整理本周的工作记录");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
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
    rmSync(vault, { recursive: true, force: true });
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
    await row.getByRole("checkbox").click(); // 受控复选框：状态在引擎回执后才改变
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/plugins.json"), "utf8")).capabilityExposure["tasks.create"]).toBe(true);
    await expect(row.getByRole("checkbox")).toBeChecked();
    await row.getByRole("checkbox").click();
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/plugins.json"), "utf8")).capabilityExposure["tasks.create"]).toBe(false);
    await page.getByLabel("筛选能力").fill("safe.items.reveal");
    await expect(page.getByTestId("cap-row").filter({ hasText: "safe.items.reveal" }).getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByTestId("cap-row").filter({ hasText: "safe.items.reveal" })).toContainText("不可开放");

    await page.getByLabel("令牌名称").fill("自动化脚本");
    await page.getByRole("button", { name: "创建令牌" }).click();
    await expect(page.getByTestId("fresh-token")).toContainText("huhu_");
    const token = (await page.getByTestId("fresh-token").locator("code").innerText()).trim();
    expect(readFileSync(path.join(vault, ".huhu/gateways.json"), "utf8")).not.toContain(token); // 只存哈希
    await expect(page.getByTestId("token-row")).toHaveCount(1);
    await page.getByRole("button", { name: "撤销 自动化脚本" }).click();
    await expect(page.getByTestId("token-row")).toHaveCount(0);

    await page.getByRole("textbox", { name: "测试台" }).fill("tasks.create");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-row").first()).toHaveAttribute("data-allowed", "false"); // 刚才关掉了
    await page.getByRole("textbox", { name: "测试台" }).fill("safe.items.reveal");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-row").first()).toContainText("永不对外");
    await page.getByRole("textbox", { name: "测试台" }).fill("no.such.cap");
    await page.getByRole("button", { name: "检查" }).click();
    await expect(page.getByTestId("bench-notfound")).toBeVisible();

    await page.getByLabel("启用 MCP 服务").click();
    await expect.poll(() => JSON.parse(readFileSync(path.join(vault, ".huhu/gateways.json"), "utf8")).mcp.enabled).toBe(true);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("自动化脚本管理：创建（相对路径被拒）、列表显示、删除", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await launch(vault);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "自动化" }).first().click();
    await page.getByRole("button", { name: "脚本" }).first().click();
    await page.getByLabel("脚本名称").fill("备份");
    await page.getByLabel("程序（绝对路径）").fill("backup.sh");
    await page.getByLabel("工作目录（绝对路径）").fill(vault);
    await page.getByRole("button", { name: "保存脚本" }).click();
    await expect(page.getByRole("alert")).toContainText("绝对路径");
    await page.getByLabel("程序（绝对路径）").fill("/bin/true");
    await page.getByLabel("环境变量引用（每行 NAME=safe://item-…）").fill("TOKEN=safe://item-abc");
    await page.getByRole("button", { name: "保存脚本" }).click();
    await expect(page.getByTestId("script-row")).toHaveCount(1);
    await expect(page.getByTestId("script-row")).toContainText("TOKEN");
    await page.getByRole("button", { name: "删除脚本 备份" }).click();
    await expect(page.getByTestId("script-row")).toHaveCount(0);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
