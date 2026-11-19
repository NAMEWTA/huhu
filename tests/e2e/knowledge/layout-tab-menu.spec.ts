import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "./session-slow-bridge.js";
import { treeFolder, treeItem, treeSettled } from "../helpers/tree.js";

test("B01：标签页就地右键、键盘菜单、复制和定位", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 700));
    writeFileSync(path.join(vault, "左边.md"), "# 左边\n");
    writeFileSync(path.join(vault, "编辑中.md"), "# 原文\n");
    mkdirSync(path.join(vault, "目录"));
    writeFileSync(path.join(vault, "目录/右边.md"), "# 右边\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    const rail = page.locator('[data-region="rail"]');
    await rail.getByRole("button", { name: "知识库", exact: true }).click();
    await treeSettled(page);
    await treeItem(page, "左边.md").click();
    await treeItem(page, "编辑中.md").click();
    await treeFolder(page, "目录").click();
    await treeItem(page, "目录/右边.md").click();
    const tab = (label: string) => page.getByTestId("document-tab").filter({ hasText: label });
    const menu = page.getByRole("menu", { name: "标签页操作" });

    await tab("右边").click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "关闭右侧" })).toBeDisabled();
    const bounds = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await menu.getByRole("menuitem", { name: "复制路径" }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("目录/右边.md");

    await tab("右边").press("Shift+F10");
    await expect(menu.getByRole("menuitem", { name: "关闭", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "在文件树中显示" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tab("右边")).toBeFocused();
    await tab("右边").press("ContextMenu");
    await menu.getByRole("menuitem", { name: "在文件树中显示" }).click();
    await expect(treeItem(page, "目录/右边.md")).toBeFocused();
  } finally {
    await close();
  }
});

for (const autosave of [false, true]) {
  for (const action of ["关闭", "关闭其他", "关闭右侧"]) {
    test(`B01 标签菜单 ${action}（${autosave ? "自动保存落盘" : "手动保存留草稿"}）`, async () => {
      const { page, vault, close } = await openApp();
      const file = path.join(vault, "编辑中.md");
      const original = "# 原文\n\n保留这行\n";
      const addition = "关闭前最后输入";
      const expected = original.replace("保留这行", `保留这行${addition}`);
      try {
        writeFileSync(path.join(vault, "左边.md"), "# 左边\n");
        writeFileSync(file, original);
        await engineReady(page);
        const rail = page.locator('[data-region="rail"]');
        if (!autosave) {
          await rail.getByRole("button", { name: "设置", exact: true }).click();
          await page.getByTestId("settings-nav-editor").click();
          const preference = page.getByRole("switch", { name: "自动保存" });
          await preference.click();
          await expect(preference).not.toBeChecked();
        }
        await rail.getByRole("button", { name: "知识库", exact: true }).click();
        await treeSettled(page);
        await treeItem(page, "左边.md").click();
        await treeItem(page, "编辑中.md").click();
        const dirtyTab = page.getByTestId("document-tab").and(page.getByRole("button", { name: "编辑中", exact: true }));
        const otherTab = page.getByTestId("document-tab").and(page.getByRole("button", { name: "左边", exact: true }));
        const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
        await expect(editor).toContainText("保留这行");
        await expect(otherTab).toBeVisible();
        await expect(dirtyTab).toHaveAttribute("aria-current", "true");
        await editor.getByText("保留这行", { exact: true }).click();
        await page.keyboard.press("End");
        await page.keyboard.insertText(addition);
        await expect(editor.getByText(`保留这行${addition}`, { exact: true })).toBeVisible();
        await (action === "关闭" ? dirtyTab : otherTab).click({ button: "right" });
        await page.getByRole("menuitem", { name: action, exact: true }).click();
        await expect(dirtyTab).toHaveCount(0);
        if (autosave) {
          await expect.poll(() => readFileSync(file, "utf8")).toBe(expected);
        } else {
          expect(readFileSync(file, "utf8")).toBe(original);
          await expect.poll(async () => (await call<{ text: string } | null>(page, "notes.draft.get", { path: "编辑中.md" }))?.text).toBe(expected);
          await treeItem(page, "编辑中.md").click();
          await page.getByTestId("note-draft-restore").click();
          await expect(editor).toContainText(addition);
          expect(readFileSync(file, "utf8")).toBe(original);
        }
      } finally {
        await close();
      }
    });
  }
}
