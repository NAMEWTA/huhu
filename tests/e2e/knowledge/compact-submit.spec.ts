import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { call, engineReady, holdBridgeTimers } from "./session-slow-bridge.js";

const title = "评论交付回归";
const latest = "撤销后立即发表的正文";

async function openTask(page: Page) {
  await page.getByRole("button", { name: "任务", exact: true }).first().click();
  await page.getByRole("button", { name: `打开任务 ${title}`, exact: true }).click();
}

for (const closeTask of [false, true]) {
  test(`H05 结算待定时${closeTask ? "发表并关闭" : "普通发表"}只发送最新正文一次`, async () => {
    const { page, close } = await openApp();
    try {
      await engineReady(page);
      const { id } = await call<{ id: string }>(page, "tasks.create", { title, type: "human", body: "", due: null, project: null, tags: [], reminders: [] });
      await openTask(page);
      const prose = page.getByTestId("comment-input").locator(".ProseMirror");
      await prose.click();
      const source = await holdBridgeTimers(prose);
      await page.keyboard.insertText("旧正文");
      await expect.poll(source).toContain("旧正文");
      await page.keyboard.press("ControlOrMeta+z");
      await expect(prose).toBeEmpty();
      const submit = page.getByTestId(closeTask ? "comment-submit-close" : "comment-submit");
      const writes: { taskId: string; body: string }[] = [];
      page.on("request", (request) => {
        if (request.method() !== "POST" || !request.url().endsWith("/api/v1/call")) return;
        const value = request.postDataJSON() as { capability: string; input: { taskId: string; body: string } };
        if (value.capability === "tasks.comments.add") writes.push(value.input);
      });
      await page.keyboard.insertText(latest);
      await expect(prose).toContainText(latest);
      expect(await source()).toContain("旧正文");
      await submit.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await expect.poll(() => writes).toEqual([{ taskId: id, body: latest }]);
      await expect(page.getByTestId("task-comment").and(page.locator('[data-source="human"]'))).toContainText(latest);
      if (closeTask) await expect.poll(async () => (await call<{ status: string }>(page, "tasks.read", { id })).status).toBe("completed");
      // 重载应用窗口，从任务列表重开持久化内容。
      await page.reload();
      await engineReady(page);
      if (closeTask) {
        await page.getByRole("button", { name: "任务", exact: true }).first().click();
        await page.getByRole("button", { name: /^已结束/ }).click();
        const group = page.locator('[data-group="completed"]').getByRole("button", { name: /^已完成/ });
        if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
        await page.getByTestId("task-row").filter({ hasText: title }).first().click();
      } else await openTask(page);
      await expect(page.getByTestId("task-comment").and(page.locator('[data-source="human"]'))).toHaveCount(1);
      await expect(page.getByTestId("task-comment").and(page.locator('[data-source="human"]'))).toContainText(latest);
      expect(writes).toEqual([{ taskId: id, body: latest }]);
    } finally {
      await close();
    }
  });
}

test("H05 撤销到空，点击发表不提交仍在源缓冲里的旧文本", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    await call(page, "tasks.create", { title, type: "human", body: "", due: null, project: null, tags: [], reminders: [] });
    await openTask(page);
    const prose = page.getByTestId("comment-input").locator(".ProseMirror");
    await prose.click();
    const source = await holdBridgeTimers(prose);
    await page.keyboard.insertText("撤销即为空");
    await expect.poll(source).toContain("撤销即为空");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(prose).toBeEmpty();
    expect(await source()).toContain("撤销即为空");
    const submitted = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "tasks.comments.add", { timeout: 800 }).catch(() => null);
    await page.getByTestId("comment-submit").evaluate((button: HTMLButtonElement) => button.click());
    expect(await submitted).toBeNull();
  } finally {
    await close();
  }
});

test("H05 档案正文失焦时保存待结算的完整文本", async () => {
  const { page, vault, close } = await openApp();
  try {
    await engineReady(page);
    await call(page, "archives.types.save", { name: "类型", fields: [] });
    await call(page, "archives.create", { type: "类型", name: "正文记录" });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: "类型" }).click();
    const row = page.getByTestId("archive-row").filter({ hasText: "正文记录" });
    await row.click();
    const prose = page.getByTestId("archive-body").locator(".ProseMirror");
    await prose.click();
    const source = await holdBridgeTimers(prose);
    await page.keyboard.insertText("首笔");
    await expect.poll(source).toContain("首笔");
    await page.keyboard.insertText("失焦前末字");
    await expect(prose).toContainText("首笔失焦前末字");
    expect(await source()).not.toContain("失焦前末字");
    await page.getByTestId("archive-view").getByRole("heading", { name: "正文记录" }).click();
    const read = () => readFileSync(path.join(vault, "Archives", "类型", "正文记录", "index.md"), "utf8");
    await expect.poll(read).toContain("首笔失焦前末字");
    await page.getByRole("button", { name: "关闭 正文记录", exact: true }).click();
    await row.click();
    await expect(prose).toContainText("首笔失焦前末字");
    expect(read()).toContain("首笔失焦前末字");
  } finally {
    await close();
  }
});
