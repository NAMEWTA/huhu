import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHugeVault } from "../../perf/huge-vault.js";
import { rmTree, root, USER_DATA_ARG } from "../helpers/launch.js";
import { treeFolder, treeRows } from "../helpers/tree.js";

// 105,000 个真实文件；不把昂贵的规模验收加入常规 E2E。
// 构建桌面端后：HUHU_E2E_HUGE_VAULT=1 pnpm e2e tests/e2e/knowledge/huge-vault.spec.ts
// Linux 无显示环境时，在 pnpm 前加 xvfb-run -a。
test.skip(process.env["HUHU_E2E_HUGE_VAULT"] !== "1", "按需运行大 Vault 文件树验收");

test("10 万文件 Vault：仅统计已展开目录，平铺大目录正确标记部分结果", async () => {
  test.setTimeout(300_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-huge-e2e-"));
  try {
    expect(createHugeVault(vault).files).toBe(105_000);
    const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 90_000 });
      await page.getByRole("button", { name: "知识库", exact: true }).first().click();
      const counts = page.getByTestId("notes-resource-counts");
      const section = treeFolder(page, "分区0").first();
      await expect(section).toBeVisible({ timeout: 45_000 });
      await expect(counts).toHaveText(/^0 个文件 ·/);

      await section.click();
      await expect(treeRows(page).and(page.locator('[data-item-path^="分区0/"]')).first()).toBeVisible({ timeout: 45_000 });
      await expect(counts).toHaveText(/^800 个文件 ·/);

      // 虚拟文件树只渲染可视区；滚到底以定位排序在最后的平铺目录。
      await page
        .locator("[data-file-tree-virtualized-scroll]")
        .first()
        .evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
      await treeFolder(page, "巨型目录").first().click();
      await expect(treeRows(page).and(page.locator('[data-item-path^="巨型目录/"]')).first()).toBeVisible({ timeout: 45_000 });
      // 800 个分区文件 + 平铺目录分页上限 20,000，不能显示成完整的 25,000 条。
      await expect(counts).toHaveText(/^20,?800 个文件 ·.*已加载，未完整统计$/, { timeout: 45_000 });
    } finally {
      await app.close();
    }
  } finally {
    rmTree(vault);
  }
});
