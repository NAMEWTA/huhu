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

/** 等树稳定：行列表连续两次（间隔 500 ms）一致——文件事件合并后的重新列举会改变行位置，在那之前点击会点到别的行。 */
export async function treeSettled(page: Page): Promise<void> {
  const snap = () => treeRows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.itemPath).join("|"));
  let prev = await snap();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const cur = await snap();
    if (cur === prev) return;
    prev = cur;
  }
}

/** 右键打开某行的菜单并点击菜单项。 */
export async function treeMenu(page: Page, row: Locator, item: string | RegExp): Promise<void> {
  const target = page.getByRole("menuitem", { name: item, exact: typeof item === "string" });
  // 树在文件事件合并后会重新列举并重绘，可能把刚打开的菜单关掉：整个“打开并点击”重试（最多 5 次）
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    await treeSettled(page);
    await row.first().click({ button: "right" });
    try {
      await target.click({ timeout: 3_000 });
      return;
    } catch (e) {
      last = e;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
  }
  throw last;
}

/** 重命名：菜单 → 内联输入（上游保持扩展名，所以只输入主名）→ Enter。 */
export async function treeRename(page: Page, row: Locator, newBaseName: string): Promise<void> {
  await treeMenu(page, row, "重命名");
  await page.keyboard.press("Control+A");
  await page.keyboard.type(newBaseName);
  await page.keyboard.press("Enter");
}
