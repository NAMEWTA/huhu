import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/launch.js";

/** 主要模块（rail 按钮名称）。每个都跑 axe，serious / critical 不允许出现。 */
const MODULES = ["工作台", "任务", "知识库", "收件箱", "档案", "保险箱", "自动化", "版本历史", "远程连接", "Agent CLI", "健康中心", "能力网关", "插件中心", "设置"];

async function violations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}（${v.impact}）：${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

test("axe：每个模块主页面没有 serious / critical 违规", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const found: Record<string, string[]> = {};
    for (const name of MODULES) {
      const rail = page.getByRole("button", { name, exact: true }).first();
      if ((await rail.count()) === 0) continue;
      await rail.click();
      await page.waitForTimeout(400);
      const v = await violations(page);
      if (v.length > 0) found[name] = v;
    }
    expect(found).toEqual({});
  } finally {
    await close();
  }
});

test("axe：命令面板与快速捕获对话框", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+Shift+N");
    await expect(page.getByTestId("quick-capture")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  } finally {
    await close();
  }
});

test("键盘：不碰鼠标新建笔记、新建任务并用空格勾选", async () => {
  const { page, vault, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 笔记：命令面板进入知识库 → Tab 到“新建笔记” → Enter → 填名称 → Enter
    await page.getByRole("button", { name: "知识库", exact: true }).first().focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "新建笔记" }).first().focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("new-note-dialog").getByLabel("文件名").fill("键盘笔记");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("note-item").filter({ hasText: "键盘笔记" })).toBeVisible();
    // 任务
    await page.getByRole("button", { name: "任务", exact: true }).first().focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: /新建任务/ })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("任务名称").fill("键盘任务");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("task-row").filter({ hasText: "键盘任务" })).toBeVisible();
    await page.getByTestId("task-row").filter({ hasText: "键盘任务" }).getByRole("checkbox").focus();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await import("node:fs")).readdirSync(`${vault}/Tasks`).length).toBe(1);
  } finally {
    await close();
  }
});
