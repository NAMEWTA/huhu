import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeSettled } from "../helpers/tree.js";

async function openTree(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
}

test("A06 行内、右键与 Shift+F10 的目标一致，方向键和 Enter 可操作边缘菜单", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setSize(1000, 720);
      window.webContents.setZoomFactor(1);
    });
    const name = "项目-35.md";
    for (let i = 0; i < 35; i++) writeFileSync(path.join(vault, `项目-${i.toString().padStart(2, "0")}.md`), "正文\n");
    writeFileSync(path.join(vault, name), "底部正文\n");
    await openTree(page);
    const root = page.getByTestId("notes-resource-tree");
    const first = treeItem(page, "项目-00.md");
    await first.focus();
    await first.press("End");
    const row = treeItem(page, name);
    await expect(row).toBeFocused();
    const menu = page.getByRole("menu").first();
    const relative = page.getByRole("menuitem", { name: "相对路径", exact: true });
    const copyPath = page.getByRole("menuitem", { name: "复制路径", exact: true });
    const checkBounds = async () => {
      await expect
        .poll(() =>
          menu.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1;
          }),
        )
        .toBe(true);
    };
    const copied = () => app.evaluate(({ clipboard }) => clipboard.readText());
    const resetClipboard = () => app.evaluate(({ clipboard }) => clipboard.clear());
    await resetClipboard();
    await row.press("Shift+F10");
    await expect(menu).toBeVisible();
    await checkBounds();
    for (let step = 0; step < 15 && !(await copyPath.evaluate((item) => item.matches(":focus"))); step++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(copyPath).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(relative).toBeVisible();
    await page.keyboard.press("End");
    await expect(relative).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(copied).toBe(name);

    await resetClipboard();
    await row.click({ button: "right", position: { x: (await row.boundingBox())!.width - 38, y: 10 } });
    await expect(menu).toBeVisible();
    await checkBounds();
    await copyPath.hover();
    await relative.click();
    await expect.poll(copied).toBe(name);

    await resetClipboard();
    await row.hover();
    await root.getByRole("button", { name: "文件操作选项" }).click();
    await expect(menu).toBeVisible();
    await copyPath.hover();
    await relative.click();
    await expect.poll(copied).toBe(name);
    await row.press("Shift+F10");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(row).toBeFocused();
  } finally {
    await close();
  }
});

test("A07 拖到 Pierre 树空白处回到根目录，重名和移入自身保留原文件", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "目录", "子目录"), { recursive: true });
    writeFileSync(path.join(vault, "目录", "待移.txt"), "原始附件");
    writeFileSync(path.join(vault, "目录", "子目录", "占位.md"), "原有子文件\n");
    writeFileSync(path.join(vault, "重名.md"), "根目录源\n");
    writeFileSync(path.join(vault, "目录", "重名.md"), "子目录原文件\n");
    await openTree(page);
    const folder = treeFolder(page, "目录").and(page.locator('[data-item-path="目录/"]'));
    await folder.click();
    const file = treeItem(page, "待移.txt");
    await expect(file).toBeVisible();
    await treeSettled(page);
    const root = page.locator('[data-testid="notes-resource-tree"] [data-file-tree-virtualized-root]');
    const scroll = root.locator("[data-file-tree-virtualized-scroll]");
    const point = await scroll.evaluate((tree) => {
      const rect = tree.getBoundingClientRect();
      const shadow = tree.getRootNode() as ShadowRoot;
      const x = Math.round(rect.left + rect.width / 2);
      for (let y = Math.min(Math.floor(rect.bottom) - 4, innerHeight - 4); y > rect.top; y -= 4) {
        const hit = shadow.elementFromPoint(x, y);
        if (hit && tree.contains(hit) && !hit.closest("[data-item-path]")) return { x, y };
      }
      return null;
    });
    expect(point, "树视口应有可命中的空白区").not.toBeNull();
    const data = await page.evaluateHandle(() => new DataTransfer());
    try {
      await file.dispatchEvent("dragstart", { dataTransfer: data });
      await scroll.dispatchEvent("dragover", { dataTransfer: data, clientX: point!.x, clientY: point!.y });
      await expect(root).toHaveAttribute("data-file-tree-root-drag-target", "true");
      await scroll.dispatchEvent("drop", { dataTransfer: data, clientX: point!.x, clientY: point!.y });
    } finally {
      await data.dispose();
    }
    await expect.poll(() => existsSync(path.join(vault, "待移.txt"))).toBe(true);
    expect(readFileSync(path.join(vault, "待移.txt"), "utf8")).toBe("原始附件");
    expect(existsSync(path.join(vault, "目录", "待移.txt"))).toBe(false);

    const rootDupe = page.locator('[data-testid="notes-resource-tree"] [data-item-path="重名.md"]');
    await treeMenu(page, rootDupe, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目录");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(readFileSync(path.join(vault, "重名.md"), "utf8")).toBe("根目录源\n");
    expect(readFileSync(path.join(vault, "目录", "重名.md"), "utf8")).toBe("子目录原文件\n");
    await page.getByRole("button", { name: "取消", exact: true }).click();

    await treeMenu(page, folder, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目录/子目录");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(existsSync(path.join(vault, "目录", "子目录"))).toBe(true);
    expect(readFileSync(path.join(vault, "目录", "重名.md"), "utf8")).toBe("子目录原文件\n");
  } finally {
    await close();
  }
});
