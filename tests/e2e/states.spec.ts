import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/launch.js";

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
