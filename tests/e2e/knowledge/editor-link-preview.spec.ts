import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

test("Q3 外链预览默认关闭，开启后使用桌面请求并在失败时保留 URL", async () => {
  const { page, vault, close } = await openApp();
  const url = "http://example.invalid/info";
  try {
    writeFileSync(path.join(vault, "外链.md"), `[外链](${url})\n`);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 40_000 });
    const settings = page.getByRole("button", { name: "设置" }).first();
    const notes = page.getByRole("button", { name: "知识库" }).first();
    const toggle = page.getByRole("switch", { name: "联网获取外链预览" });
    await settings.click();
    await page.getByTestId("settings-nav-editor").click();
    await expect(toggle).not.toBeChecked();
    const request = () => page.evaluate((target) => window.huhuHost.externalLinkPreview(target), url);
    await expect(request()).resolves.toEqual({ ok: false, reason: "disabled" });

    await toggle.click();
    await expect(toggle).toBeChecked();
    const settingsFile = path.join(vault, ".huhu", "settings.json");
    await expect.poll(() => JSON.parse(readFileSync(settingsFile, "utf8"))).toMatchObject({ editor: { linkPreviews: true } });
    await expect(request()).resolves.toMatchObject({ ok: false, reason: /dns-failure|timeout/ });
    await notes.click();
    await treeSettled(page);
    await treeItem(page, "外链.md").click();
    const link = page.getByTestId("markdown-editor").getByRole("link", { name: /example\.invalid/ });
    await expect(link).toHaveAttribute("href", url);
    await link.hover();
    await expect(page.locator('[data-slot="internal-link-prop-panel-text"]')).toHaveAttribute("href", url);
    await expect(page.locator('[data-slot="external-link-preview-card"]')).toHaveCount(0);
  } finally {
    await close();
  }
});
