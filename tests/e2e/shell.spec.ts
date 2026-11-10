import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../apps/desktop");

async function launch(vault: string): Promise<ElectronApplication> {
  return electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
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
    await expect(page.getByTestId("tasks-module")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });

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
