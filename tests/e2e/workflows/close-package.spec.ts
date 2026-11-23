import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openCandidateDesktop, withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { treeItem } from "../helpers/tree.js";
import { call, holdBridgeTimers } from "../knowledge/session-slow-bridge.js";

test.afterAll(disposeCandidate);

// Same close protocol and failure injection as session-flush, exercised in the extracted candidate.
const name = "退出交付.md";
const original = "# 重新打开\n\n初始正文\n";
const first = "首";
const last = "关闭前的最后输入";
const written = original.replace("初始正文", `初始正文${first}${last}`);
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");
async function openNote(page: Page): Promise<void> {
  if (!(await page.getByTestId("notes-module").isVisible())) await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await page.getByTestId("notes-section-all").click();
  await treeItem(page, name).click();
  await expect(prose(page)).toContainText("初始正文");
}
async function inputWithPendingBridge(page: Page): Promise<void> {
  await prose(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  const source = await holdBridgeTimers(prose(page));
  await page.keyboard.insertText(first);
  await expect.poll(source).toContain(`初始正文${first}`);
  await page.keyboard.insertText(last);
  await expect(prose(page)).toContainText(`初始正文${first}${last}`);
  expect(await source()).not.toContain(last);
}

for (const choice of ["保存", "放弃"] as const) {
  test(`W05-W06 候选安装包：关闭时${choice}看板草稿，失败保留窗口并结算笔记`, async () => {
    test.skip(process.env["HUHU_CLOSE_PACKAGE_ACCEPTANCE"] !== "1", "通过隔离的候选安装包包装器运行");
    test.setTimeout(90_000);
    const { app, page, vault, close } = await openCandidateDesktop({ identityAttachment: `close-${choice}-candidate`, prepareVault: (vault) => writeFileSync(path.join(vault, name), original) });
    const filename = path.join(vault, name);
    const board = path.join(vault, ".huhu/home/widgets.json");
    await withFixtureCleanup(async () => {
      await openNote(page);
      expect((await call<{ running: boolean }>(page, "home.focus.update", { action: "start" })).running).toBe(true);
      await inputWithPendingBridge(page);
      await page.getByRole("button", { name: "huhu workbench 首页" }).click();
      await page.getByTestId("home-customize").click();
      const hidden = page.locator('[data-instance-id="default-focus"]').getByRole("checkbox", { name: "隐藏" });
      await hidden.check();
      const dialog = page.getByRole("dialog", { name: "关闭窗口前处理看板草稿" });
      const requestClose = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      await requestClose();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "继续编辑" }).click();
      await expect(dialog).toHaveCount(0);
      expect(existsSync(board)).toBe(false);
      expect(readFileSync(filename, "utf8")).not.toContain(last);

      if (choice === "保存") {
        const rejectUpdate = async (route: import("@playwright/test").Route) => {
          if (route.request().postDataJSON()?.capability === "home.dashboard.update") {
            await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: { ok: false, error: { code: "INVALID_INPUT", message: "写入测试失败" } } });
          } else await route.continue();
        };
        await page.route("**/api/v1/call", rejectUpdate);
        await requestClose();
        await dialog.getByTestId("home-dashboard-save-leave").click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByTestId("home-dashboard").getByRole("status")).toContainText("草稿仍在");
        await expect(hidden).toBeChecked();
        expect(existsSync(board)).toBe(false);
        expect(readFileSync(filename, "utf8")).not.toContain(last);
        expect((await call<{ running: boolean }>(page, "home.focus.get", {})).running).toBe(true);
        await page.unroute("**/api/v1/call", rejectUpdate);
      }

      await app.evaluate(({ app }) => app.quit());
      await expect(dialog).toBeVisible();
      const closed = page.waitForEvent("close");
      await dialog.getByRole("button", { name: `${choice}并离开` }).click();
      await closed;
      if (choice === "保存") {
        expect(JSON.parse(readFileSync(board, "utf8")).instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));
      } else {
        expect(existsSync(board)).toBe(false);
      }
      expect(readFileSync(filename, "utf8")).toBe(written);
      expect(JSON.parse(readFileSync(path.join(vault, ".huhu/home/focus.json"), "utf8")).running).toBe(false);
    }, [
      [
        "解除关窗测试状态",
        async () => {
          if (!page.isClosed()) {
            await page.unrouteAll({ behavior: "ignoreErrors" });
            const stay = page.getByRole("button", { name: "继续编辑", exact: true });
            if (await stay.isVisible()) await stay.click();
            const cancel = page.getByRole("button", { name: "取消编辑", exact: true });
            if (await cancel.isVisible()) await cancel.click();
          }
        },
      ],
      ["关闭候选桌面", close],
    ]);
  });
}
