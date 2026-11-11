import { _electron as electron, expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { openApp, root } from "./helpers/launch.js";

/**
 * 视觉自查截图（quality.md §4：1440×900 与 1024×768）：HUHU_SHOTS_DIR=<目录> 时才运行，截图写入该目录供与原型对照。
 */
const DIR = process.env["HUHU_SHOTS_DIR"];
test.skip(!DIR, "设置 HUHU_SHOTS_DIR 才截图");

const MODULES = ["工作台", "任务", "知识库", "收件箱", "档案", "保险箱", "自动化", "版本历史", "远程连接", "Agent CLI", "健康中心", "能力网关", "插件中心", "设置"];

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`截图 ${size.width}×${size.height}：各模块主页面`, async () => {
    mkdirSync(DIR!, { recursive: true });
    const { app, page, close } = await openApp();
    try {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setContentSize(s.width, s.height), size);
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      for (const name of MODULES) {
        const rail = page.getByRole("button", { name, exact: true }).first();
        if ((await rail.count()) === 0) continue;
        await rail.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(DIR!, `${size.width}-${name}.png`) });
      }
      // 插件中心发现页、设置·Agent 接入
      await page.getByRole("button", { name: "插件中心", exact: true }).first().click();
      await page.getByRole("tab", { name: "发现插件" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR!, `${size.width}-插件中心-发现.png`) });
      await page.getByRole("button", { name: "设置", exact: true }).first().click();
      await page.getByTestId("settings-nav-agent-access").click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR!, `${size.width}-设置-Agent接入.png`) });
    } finally {
      await close();
    }
  });
}

test("截图 1440×900：启动页", async () => {
  mkdirSync(DIR!, { recursive: true });
  const env = { ...process.env } as Record<string, string>;
  delete env["HUHU_VAULT"];
  const app = await electron.launch({ args: [root, "--no-sandbox"], env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900));
    await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(DIR!, "1440-启动页.png") });
  } finally {
    await app.close();
  }
});
