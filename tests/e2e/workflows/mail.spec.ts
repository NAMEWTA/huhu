import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

test("工作台命令从首页打开邮件缓存搜索并交接焦点", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByLabel("搜索模块、命令和内容").fill("搜索已缓存邮件");
    await page.getByTestId("palette-item").filter({ hasText: "搜索已缓存邮件" }).click();
    const search = page.getByRole("dialog", { name: "搜索已缓存邮件" });
    await expect(search).toBeVisible();
    await expect(search.getByRole("combobox", { name: "主题、联系人或正文" })).toBeFocused();
  } finally {
    await close();
  }
});

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

test("桌面邮件用原生选择结果导入受管附件，重开草稿后可移除", async () => {
  const { app, page, vault, close } = await openApp();
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-mail-picker-"));
  const bytes = Buffer.from("合成附件夹具");
  const name = "样本 附件.txt";
  const file = path.join(dir, name);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const managed = path.join(vault, ".huhu/mail/attachments", digest);
  writeFileSync(file, bytes);
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await app.evaluate(({ dialog }, selected) => {
      const choices = [undefined, selected];
      dialog.showOpenDialog = (async () => {
        const choice = choices.shift();
        return { canceled: !choice, filePaths: choice ? [choice] : [] };
      }) as typeof dialog.showOpenDialog;
    }, file);
    const malformed = await page.evaluate(async () => {
      const { vaultId } = await window.huhuHost.engine();
      const input = { operationId: crypto.randomUUID(), draftId: crypto.randomUUID(), expectedRevision: crypto.randomUUID(), vaultId, path: "untrusted-renderer-path" };
      return window.huhuHost.mailDraftAttachments.selectAndAdd(input);
    });
    expect(malformed).toEqual({ status: "failed", reason: "unavailable" });

    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: "写信", exact: true }).click();
    const composer = page.getByRole("form", { name: "写信" });
    await composer.getByLabel("主题").fill("保留附件的草稿");
    const add = composer.getByRole("button", { name: "添加附件" });
    await add.click();
    await expect(add).toBeEnabled();
    expect(existsSync(managed)).toBe(false);
    await add.click();
    await expect(composer.getByText("附件已保存。")).toBeVisible();
    expect(readFileSync(managed)).toEqual(bytes);
    rmSync(file);

    await page.reload();
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: "草稿", exact: true }).click();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(composer.getByLabel("主题")).toHaveValue("保留附件的草稿");
    await expect(composer.getByText(name, { exact: false })).toBeVisible();
    await composer.getByRole("button", { name: `移除附件 ${name}` }).click();
    await expect(composer.getByText("附件已移除。")).toBeVisible();
    expect(existsSync(managed)).toBe(false);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});
