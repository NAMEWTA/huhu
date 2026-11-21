import { expect, test } from "@playwright/test";
import { openApp } from "../../../tests/e2e/helpers/launch.js";
import { aiFixture } from "./fixtures/ai.js";

test("桌面邮件 AI 设置用合成消息测试，失败可修正并保留已保存设置", async () => {
  const provider = await aiFixture();
  const { app, page, close } = await openApp();
  try {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "邮件", exact: true }).click();
    await page.getByText("邮件 AI 设置", { exact: true }).click();
    const form = page.getByRole("form", { name: "邮件 AI 设置" });
    const status = page.getByRole("status").filter({ visible: true });
    const enabled = form.getByRole("checkbox", { name: "启用邮件 AI" });
    const model = form.getByRole("textbox", { name: "模型" });
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await form.getByRole("textbox", { name: "目标服务地址" }).fill(provider.url);
    await model.fill("synthetic-ui-model");
    await form.getByRole("button", { name: "测试连接" }).click();
    await expect(status.filter({ hasText: "连接测试通过。" })).toBeVisible();
    await expect(page.getByText(/已保存 · 关闭 · Key 未配置/)).toBeVisible();
    await form.getByRole("button", { name: "保存 AI 设置" }).click();
    await expect(status.filter({ hasText: "邮件 AI 设置已保存。" })).toBeVisible();
    await expect(page.getByText(/已保存 · 启用 · Key 未配置/)).toContainText("synthetic-ui-model");
    provider.behavior.status = 500;
    await model.fill("recoverable-draft-model");
    await form.getByRole("button", { name: "保存 AI 设置" }).click();
    await expect(status.filter({ hasText: "邮件 AI 服务未返回可用文本。" })).toBeVisible();
    await expect(model).toHaveValue("recoverable-draft-model");
    await expect(page.getByText(/已保存 · 启用 · Key 未配置/)).toContainText("synthetic-ui-model");
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests.every(({ authorization }) => authorization === undefined)).toBe(true);
    expect(provider.requests[0]?.body).toEqual({ model: "synthetic-ui-model", messages: [{ role: "user", content: "Huhu Mail connection test. Reply with OK." }], stream: false });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    const mail = page.getByText("邮件 AI 设置", { exact: true });
    if (!(await mail.isVisible())) await page.getByRole("button", { name: "邮件", exact: true }).click();
    await mail.click();
    await expect(model).toHaveValue("synthetic-ui-model");
    await expect(form.getByLabel("新 API Key")).toHaveCount(0);
    expect(provider.requests).toHaveLength(3);
    expect(pageErrors).toEqual([]);
    console.log("Desktop runtime", await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome })));
  } finally {
    await Promise.all([close(), provider.close()]);
  }
});
