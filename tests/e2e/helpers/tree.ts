import type { Locator, Page } from "@playwright/test";

/** 知识库文件树（OK FileTree，行在 shadow DOM 里，Playwright 的 CSS 选择器自动穿透）。 */
export const treeRows = (page: Page): Locator => page.locator('[data-testid="notes-resource-tree"] [data-item-path]');
export const treeFileRows = (page: Page): Locator => page.locator('[data-testid="notes-resource-tree"] [data-item-type="file"]');

/** 按显示名找行：OK 树省略 .md 扩展名，所以对 `x.md` 去掉后缀再匹配；非 Markdown 保留原名。 */
export function treeItem(page: Page, name: string | RegExp): Locator {
  const text = typeof name === "string" ? name.replace(/\.md$/i, "") : name;
  return treeRows(page).filter({ hasText: text });
}

/** 文件夹行（data-item-type="folder"）。 */
export function treeFolder(page: Page, name: string): Locator {
  return page.locator('[data-testid="notes-resource-tree"] [data-item-type="folder"]').filter({ hasText: name });
}

/** 右键打开某行的菜单并点击菜单项。 */
export async function treeMenu(page: Page, row: Locator, item: string | RegExp): Promise<void> {
  await row.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: item, exact: typeof item === "string" }).click();
}

/** 重命名：菜单 → 内联输入（上游保持扩展名，所以只输入主名）→ Enter。 */
export async function treeRename(page: Page, row: Locator, newBaseName: string): Promise<void> {
  await treeMenu(page, row, "Rename");
  await page.keyboard.press("Control+A");
  await page.keyboard.type(newBaseName);
  await page.keyboard.press("Enter");
}
