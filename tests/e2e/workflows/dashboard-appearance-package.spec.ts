import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openCandidateDesktop, withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";

// Exercise the shipped controls. Tab traversal is observed, not replaced by DOM focus().
async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let count = 0; count < 120; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return count;
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  throw new Error("键盘未能到达看板控件");
}

test.afterAll(disposeCandidate);
test("候选看板：四主题明暗、减少动效、放大与键盘移动保存", async () => {
  test.skip(process.env["HUHU_DASHBOARD_APPEARANCE_ACCEPTANCE"] !== "1", "需要固定候选包与隔离环境");
  test.setTimeout(180_000);
  const { app, page, vault, close } = await openCandidateDesktop({ identityAttachment: "dashboard-appearance-candidate", disableProviderDetection: true });
  const evidence: object[] = [];
  await withFixtureCleanup(async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1600, 1000));
    for (const theme of ["claude", "apple", "notion", "vercel"]) {
      for (const [mode, label] of [
        ["light", "浅色"],
        ["dark", "深色"],
      ] as const) {
        await page.getByRole("button", { name: "设置", exact: true }).first().click();
        await page.getByTestId("settings-nav-appearance").click();
        await page.getByTestId(`theme-${theme}`).click();
        await page.getByRole("tab", { name: label, exact: true }).click();
        await page.getByRole("tab", { name: "减少", exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
        await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1.25));
        await page.getByRole("button", { name: "huhu workbench 首页", exact: true }).click();
        const customize = page.getByTestId("home-customize");
        const enterTabs = await tabTo(page, customize);
        await page.keyboard.press("Enter");
        const card = page.locator('[data-instance-id="default-focus"]');
        const move = card.getByRole("button", { name: /^向下移动 / });
        const moveTabs = await tabTo(page, move);
        await expect(move).toBeFocused();
        const before = await card.getAttribute("style");
        const previousY = await card.evaluate((element) => Number(getComputedStyle(element).gridRowStart) - 1);
        await page.keyboard.press("Enter");
        await expect(card).not.toHaveAttribute("style", before ?? "");
        const save = page.getByTestId("home-dashboard-save");
        const saveTabs = await tabTo(page, save, true);
        await expect(save).toBeEnabled();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("home-dashboard").getByRole("status")).toContainText("布局已保存");
        await expect(page.getByTestId("home-dashboard").getByRole("alert")).toHaveCount(0);
        const board = JSON.parse(readFileSync(path.join(vault, ".huhu/home/widgets.json"), "utf8"));
        expect(board.layout.find((item: { instanceId: string }) => item.instanceId === "default-focus").y).toBe(previousY + 1);
        const appearance = JSON.parse(readFileSync(path.join(vault, ".huhu/settings.json"), "utf8")).appearance;
        expect(appearance).toMatchObject({ theme, mode, motion: "reduced" });
        const metrics = await page
          .getByTestId("home-dashboard")
          .evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, animationDuration: getComputedStyle(element).animationDuration, transitionDuration: getComputedStyle(element).transitionDuration }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
        expect(metrics.animationDuration.split(",").every((value) => parseFloat(value) <= 0.001)).toBe(true);
        expect(metrics.transitionDuration.split(",").every((value) => parseFloat(value) <= 0.001)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`${theme}-${mode}.png`), animations: "disabled" });
        evidence.push({ theme, mode, zoom: 1.25, enterTabs, moveTabs, saveTabs, placement: board.layout.find((item: { instanceId: string }) => item.instanceId === "default-focus"), metrics });
      }
    }
    expect(evidence).toHaveLength(8);
    // A genuine failed read must still be visible and retry must restore the saved board.
    const savedStyle = await page.locator('[data-instance-id="default-focus"]').getAttribute("style");
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "home.dashboard.get") return route.continue();
      await route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "fixture read failed", retryable: false } } });
    });
    await page.reload();
    await expect(page.getByTestId("home-dashboard").getByRole("alert")).toContainText("无法读取首页布局");
    await page.unroute("**/api/v1/call");
    await page.getByTestId("home-dashboard").getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByTestId("home-dashboard").getByRole("alert")).toHaveCount(0);
    await expect(page.locator('[data-instance-id="default-focus"]')).toHaveAttribute("style", savedStyle ?? "");
    await test.info().attach("dashboard-appearance-matrix", { contentType: "application/json", body: JSON.stringify(evidence) });
  }, [
    [
      "取消未提交布局",
      async () => {
        if (page.isClosed()) return;
        const cancel = page.getByRole("button", { name: "取消编辑", exact: true });
        if (await cancel.isVisible()) await cancel.click();
      },
    ],
    ["关闭候选桌面", close],
  ]);
});
