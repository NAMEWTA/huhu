import { _electron as electron, expect, test } from "@playwright/test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, root } from "./helpers/launch.js";

const MODULES = ["工作台", "任务", "知识库", "收件箱", "档案", "保险箱", "自动化", "版本历史", "远程连接", "Agent CLI", "健康中心", "能力网关", "插件中心", "设置"];

for (const size of [
  { width: 1024, height: 768 },
  { width: 960, height: 600 },
]) {
  test(`ACC-WB-09 状态巡检：${size.width}×${size.height} 下所有模块没有页面级水平滚动`, async () => {
    const { app, page, close } = await openApp();
    try {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setContentSize(s.width, s.height), size);
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const wide: string[] = [];
      for (const name of MODULES) {
        const rail = page.getByRole("button", { name, exact: true }).first();
        if ((await rail.count()) === 0) continue;
        await rail.click();
        await page.waitForTimeout(300);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 1) wide.push(`${name}（溢出 ${over}px）`);
      }
      expect(wide).toEqual([]);
    } finally {
      await close();
    }
  });
}

test("Engine 断开：显示未连接 Banner，可重启恢复", async () => {
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const fs = await import("node:fs");
    const runtime = `${vault}/.huhu/runtime`;
    const pid = Number(fs.readFileSync(`${runtime}/${fs.readdirSync(runtime)[0]}/engine.json`, "utf8").match(/"pid":(\d+)/)?.[1]);
    process.kill(pid, "SIGKILL");
    await expect(page.getByText("工作台引擎未连接")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "重启引擎" }).click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  } finally {
    await close();
  }
});

test("插件停用：模块入口消失，页面不报错", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "插件中心" }).first().click();
    await page.locator('[data-plugin="archives"]').click();
    await page.getByRole("switch", { name: "停用 档案" }).click();
    await expect(page.getByRole("button", { name: "档案", exact: true })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId("plugin-detail")).toContainText("已停用");
  } finally {
    await close();
  }
});

test("ACC-WB-09 状态巡检：1.5× 缩放下所有模块没有页面级水平滚动", async () => {
  const { app, page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5));
    await page.waitForTimeout(500);
    const wide: string[] = [];
    for (const name of MODULES) {
      const rail = page.getByRole("button", { name, exact: true }).first();
      if ((await rail.count()) === 0) continue;
      await rail.click();
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) wide.push(`${name}（溢出 ${over}px）`);
    }
    expect(wide).toEqual([]);
  } finally {
    // 缩放级别会按来源记在用户数据目录里：不还原的话，之后启动的所有用例都会是 1.5×
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1)).catch(() => undefined);
    await close();
  }
});

test("ACC-WB-09 状态巡检：只读 Vault 下所有模块可以打开，没有页面报错和水平滚动", async () => {
  test.skip(process.platform === "win32" || process.getuid?.() === 0, "需要非 root 的 POSIX 权限");
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-ro-patrol-"));
  writeFileSync(path.join(dir, "只读笔记.md"), "# 只读笔记\n\n内容\n");
  chmodSync(dir, 0o555);
  const env = { ...process.env } as Record<string, string>;
  delete env["HUHU_VAULT"];
  const app = await electron.launch({ args: [root, "--no-sandbox"], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.evaluate(({ dialog }, d) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [d] })) as typeof dialog.showOpenDialog;
    }, dir);
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    // 启动页在读取宿主状态时会重绘；点击偶尔落在被替换的按钮上，所以点击和等待提示一起重试
    await expect(async () => {
      await page.getByTestId("vault-open").click({ timeout: 3000 });
      await expect(page.getByTestId("vault-readonly")).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 30_000 });
    await page.getByTestId("vault-readonly").click();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    const wide: string[] = [];
    for (const name of MODULES) {
      const rail = page.getByRole("button", { name, exact: true }).first();
      if ((await rail.count()) === 0) continue;
      await rail.click();
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) wide.push(`${name}（溢出 ${over}px）`);
    }
    expect(wide).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});
