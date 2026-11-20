import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/launch.js";

test("邮件草稿保存失败时保留工作区，重试后可切换并继续编辑原草稿", async () => {
  const { app, page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const mail = page.getByRole("button", { name: "邮件", exact: true }).first();
    const tasks = page.getByRole("button", { name: "任务", exact: true }).first();
    await mail.click();
    await page.getByRole("button", { name: "写信", exact: true }).click();
    const editor = page.getByRole("form", { name: "写信" });
    const subject = editor.getByLabel("主题");
    await subject.fill("切换模块保留这份草稿");

    let rejected = 0;
    await page.route("**/api/v1/call", async (route) => {
      const { capability } = route.request().postDataJSON() as { capability: string };
      if (capability !== "mail.drafts.save" || rejected > 0) return route.continue();
      rejected++;
      await route.fulfill({ status: 200, json: { ok: false, error: { code: "INTERNAL", message: "测试草稿写入失败", retryable: false } } });
    });
    await tasks.click();
    await expect(editor).toContainText("测试草稿写入失败");
    await expect(subject).toHaveValue("切换模块保留这份草稿");
    await expect(page.getByTestId("tasks-module")).toHaveCount(0);

    await tasks.click();
    await expect(page.getByTestId("tasks-module")).toBeVisible();
    await mail.click();
    await page.getByRole("button", { name: "草稿", exact: true }).click();
    await expect(page.getByRole("button", { name: "切换模块保留这份草稿" })).toHaveCount(1);
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(subject).toHaveValue("切换模块保留这份草稿");
    expect(rejected).toBe(1);
    await page.unrouteAll({ behavior: "wait" });
    await Promise.all([app.waitForEvent("close", { timeout: 12_000 }), app.evaluate(({ app }) => app.quit())]);
  } finally {
    await close();
  }
});
