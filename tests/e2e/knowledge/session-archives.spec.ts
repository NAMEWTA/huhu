import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree } from "../helpers/launch.js";
import { call, engineReady, holdBridgeTimers } from "./session-slow-bridge.js";

const index = "Archives/类型/记录/index.md";
const tail = "结算前末字";
const body = (page: Page) => page.getByTestId("archive-body").locator(".ProseMirror");

async function openRecord(page: Page) {
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await page.getByTestId("notes-open-archives").click();
  await page.getByTestId("archive-category-card").filter({ hasText: "类型" }).click();
  await page.getByTestId("archive-row").filter({ hasText: "记录" }).click();
  await expect(body(page)).toBeVisible();
}

async function seed(page: Page) {
  await engineReady(page);
  await call(page, "archives.types.save", { name: "类型", fields: [{ name: "编号", type: "text" }] });
  await call(page, "archives.create", { type: "类型", name: "记录", fields: { 编号: "007" } });
}

for (const switching of [false, true]) {
  test(`档案正文慢桥在${switching ? "切 Vault " : "退出"}前结算并在新实例读回`, async () => {
    const { app, page, vault, close } = await openApp();
    const other = mkdtempSync(path.join(tmpdir(), "huhu-archive-vault-"));
    try {
      await seed(page);
      await openRecord(page);
      await body(page).click();
      const source = await holdBridgeTimers(body(page));
      await page.keyboard.insertText("首笔");
      await expect.poll(source).toContain("首笔");
      await expect.poll(() => readFileSync(path.join(vault, index), "utf8")).toContain("首笔");
      await page.keyboard.insertText(tail);
      await expect(body(page)).toContainText(tail);
      expect(await source()).not.toContain(tail);
      if (switching) {
        // Vault 弹窗的焦点移动不能替退出协议提前提交正文。
        await body(page).evaluate((editor) => editor.addEventListener("focusout", (event) => event.stopPropagation()));
        await app.evaluate(({ dialog }, target) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
        }, other);
        await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
        await page.getByTestId("vault-open-other").click();
        await expect(page.getByTestId("svault-dirty-list")).toContainText(index);
        await Promise.all([page.waitForEvent("load"), page.getByTestId("svault-switch-save").click()]);
        await engineReady(page);
        await expect.poll(() => page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(other);
      }
      await app.close();
      const reopened = await openApp({ HUHU_VAULT: vault });
      try {
        await engineReady(reopened.page);
        expect(await reopened.page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
        const file = await call<{ text: string }>(reopened.page, "notes.read", { path: index });
        expect(file.text).toContain("首笔" + tail);
        expect(file.text).toContain("007");
        expect(readFileSync(path.join(vault, index), "utf8")).toBe(file.text);
      } finally {
        await reopened.close();
      }
    } finally {
      await close();
      rmTree(other);
    }
  });
}

test("手动保存模式切档案视图保留会话，明确保存后才写入", async () => {
  const { page, vault, close } = await openApp();
  try {
    await seed(page);
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    await autosave.click();
    await expect(autosave).not.toBeChecked();
    await openRecord(page);
    const disk = () => readFileSync(path.join(vault, index), "utf8");
    const original = disk();
    await page.getByTestId("archive-open-markdown").click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await prose.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText(tail);
    await expect(prose).toContainText(tail);
    expect(disk()).toBe(original);
    await page.getByTestId("archive-open-record-view").click();
    await expect(body(page)).toContainText(tail);
    expect(disk()).toBe(original);
    await page.getByTestId("archive-open-markdown").click();
    await expect(prose).toContainText(tail);
    await page.getByTestId("archive-open-record-view").click();
    await expect(body(page)).toContainText(tail);
    expect(disk()).toBe(original);
    await page.getByTestId("archive-save").click();
    await expect.poll(disk).toContain(tail);
  } finally {
    await close();
  }
});

test("回到档案视图的请求在目标标签关闭时取消", async () => {
  const { page, close } = await openApp();
  try {
    await seed(page);
    await openRecord(page);
    await page.getByTestId("archive-open-markdown").click();
    await expect(page.getByTestId("markdown-editor")).toBeVisible();
    const open = page.getByTestId("archive-open-record-view");
    const closeTarget = page.getByRole("button", { name: "关闭 记录", exact: true });
    await expect(closeTarget).toBeVisible();
    const target = await closeTarget.elementHandle();
    await open.evaluate((button, target) => {
      (button as HTMLButtonElement).click();
      (target as HTMLButtonElement).click();
    }, target);
    await expect(closeTarget).toHaveCount(0);
    await expect(page.getByTestId("markdown-editor")).toBeVisible();
  } finally {
    await close();
  }
});
