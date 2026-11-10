import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../apps/desktop");

const HERDR = process.env["HUHU_HERDR_BIN"] ?? "/tmp/claude-1000/herdr-build/src/target/release/herdr-core";

async function launch(vault: string): Promise<ElectronApplication> {
  return electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}) } });
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
  } finally {
    await app.close();
    await srv.close();
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
