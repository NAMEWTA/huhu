import { chromium, expect, test, type Browser } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

const edge = process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe") : "";
const browserBinary = [chromium.executablePath(), edge].find((file) => file && existsSync(file));

test("Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开", async () => {
  test.skip(!browserBinary, "当前环境未安装 Playwright Chromium 或 Microsoft Edge");
  const { app, page, vault, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByRole("tab", { name: "服务端" }).click();
    const share = page.getByTestId("web-share-panel");
    await expect(share.getByText("已停止", { exact: true })).toBeVisible();
    const scope = share.getByRole("combobox", { name: "分享范围" });
    await expect(scope).toHaveValue("lan");
    await scope.selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await expect(share.getByText("运行中", { exact: true })).toBeVisible();
    const addresses = share.getByRole("list", { name: "访问地址" });
    const localAddress = addresses.getByRole("link", { name: /^http:\/\/127\.0\.0\.1:/u });
    await expect(localAddress).toBeVisible();
    const url = (await localAddress.getAttribute("href"))!;
    await addresses.getByRole("button", { name: `复制访问地址 ${url}` }).click();
    await expect(share.getByRole("status")).toContainText("已复制访问地址。");
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(url);
    await app.evaluate(({ dialog, shell }) => {
      const opened: string[] = [];
      Object.assign(globalThis, { webShareOpened: opened });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      shell.openExternal = async (link) => {
        opened.push(link);
      };
    });
    await localAddress.click();
    await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "webShareOpened"))).toEqual([new URL(url).href]);

    const links = page.getByRole("dialog", { name: "Web 邀请链接" });
    const readLink = async () => {
      await expect(links).toBeVisible();
      const link = await links.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
      await links.getByRole("button", { name: "完成" }).click();
      return link;
    };
    await share.getByRole("button", { name: "创建邀请" }).click();
    const a = await readLink();
    const rows = share.getByTestId("web-invitation-row");
    const aId = await rows.first().getAttribute("data-invitation-id");
    const aRow = rows.and(share.locator(`[data-invitation-id="${aId}"]`));
    await aRow.getByRole("button", { name: "取回链接" }).click();
    expect(await readLink()).toBe(a);
    await share.getByRole("button", { name: "创建邀请" }).click();
    const b = await readLink();
    expect(b).not.toBe(a);
    await expect(rows).toHaveCount(2);

    browser = await chromium.launch({ executablePath: browserBinary, headless: true });
    const browsers = await Promise.all(
      [a, a, b].map(async (link) => {
        const context = await browser!.newContext();
        const tab = await context.newPage();
        await tab.goto(link);
        await expect(tab.getByTestId("home-dashboard")).toBeVisible();
        expect(new URL(tab.url()).hash).toBe("");
        return tab;
      }),
    );
    const [first, second, other] = browsers;
    await expect(aRow).toContainText("2 个会话");
    await expect(rows.filter({ hasText: "1 个会话" })).toHaveCount(1);

    const otherBoard = other!.getByTestId("home-dashboard");
    const focus = otherBoard.locator('[data-instance-id="default-focus"]');
    await expect(focus).toBeVisible();
    const task = otherBoard.getByTestId("card-tasks");
    await expect(task.getByRole("tab", { name: "全部" })).toBeVisible();
    await task.getByRole("tab", { name: "今天" }).click();
    await expect(task.getByText("今天没有待办任务")).toBeVisible();
    await expect(otherBoard.getByTestId("card-recent").getByRole("button", { name: "全部笔记" })).toBeVisible();
    await other!.getByTestId("home-customize").click();
    await focus.getByRole("checkbox", { name: "隐藏" }).check();
    await otherBoard.getByTestId("home-dashboard-save").click();
    await expect(otherBoard.getByRole("status")).toContainText("布局已保存");
    await expect(first!.getByTestId("home-dashboard").locator('[data-instance-id="default-focus"]')).toHaveCount(0);
    const saved = readFileSync(path.join(vault, ".huhu/home/widgets.json"), "utf8");

    await aRow.getByRole("button", { name: "撤销邀请" }).click();
    const confirmation = page.getByRole("dialog", { name: "撤销这份邀请" });
    await expect(confirmation).toContainText("2 个浏览器会话");
    await confirmation.getByRole("button", { name: "确认撤销" }).click();
    await expect(rows).toHaveCount(1);
    await Promise.all([first!, second!].map((tab) => expect(tab.getByText("浏览器会话不可用", { exact: true })).toBeVisible({ timeout: 12_000 })));
    await first!.goto(a);
    await expect(first!.getByText("浏览器会话不可用", { exact: true })).toBeVisible();
    await other!.reload();
    await expect(otherBoard).toBeVisible();
    await expect(focus).toHaveCount(0);
    expect(readFileSync(path.join(vault, ".huhu/home/widgets.json"), "utf8")).toBe(saved);

    await share.getByRole("button", { name: "停止分享" }).click();
    await page.getByRole("dialog", { name: "停止 Web 分享" }).getByRole("button", { name: "确认停止" }).click();
    await expect(share.getByText("已停止", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(0);
  } finally {
    try {
      await browser?.close();
    } finally {
      await close();
    }
  }
});
