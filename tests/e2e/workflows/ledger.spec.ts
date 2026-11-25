import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root, rmTree, USER_DATA_ARG } from "../helpers/launch.js";
import { engineReady } from "../knowledge/session-slow-bridge.js";

async function enterLedger(page: Page) {
  await page.getByRole("button", { name: "账本", exact: true }).first().click();
  const ledger = page.getByTestId("ledger-module");
  await expect(ledger).toBeVisible();
  return ledger;
}

async function createBook(page: Page, name: string, account: string) {
  const dialog = page.getByRole("dialog", { name: "创建账本" });
  await expect(dialog.getByLabel("账本名称")).toBeFocused();
  await dialog.getByLabel("账本名称").fill(name);
  await dialog.getByLabel("默认币种").selectOption("TWD");
  await dialog.getByLabel("业务时区").selectOption("Asia/Taipei");
  await dialog.getByLabel("首个资金账户").fill(account);
  await dialog.getByRole("button", { name: "创建账本", exact: true }).click();
  await expect(dialog).toBeHidden();
}

function launch(vault: string) {
  return electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
}

test("L1 桌面创建两本账，重开 Vault 后保留选择和删除预览", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    app = await launch(vault);
    let page = await app.firstWindow();
    await engineReady(page);
    let ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "日常记账", "银行");
    await ledger.getByRole("button", { name: "新建账本" }).click();
    await createBook(page, "差旅", "钱包");
    await ledger.getByLabel("当前账本").selectOption({ label: "日常记账" });
    await expect(ledger.getByRole("heading", { name: "日常记账" })).toBeVisible();
    await app.close();

    app = await launch(vault);
    page = await app.firstWindow();
    await engineReady(page);
    ledger = await enterLedger(page);
    await expect(ledger.getByRole("heading", { name: "日常记账" })).toBeVisible();
    await expect(ledger.getByLabel("当前账本").locator("option")).toHaveText(["选择账本", "日常记账", "差旅"]);
    await page.getByRole("button", { name: "账本设置", exact: true }).click();
    await ledger.getByRole("article").filter({ hasText: "差旅" }).getByRole("button", { name: "预览删除" }).click();
    const remove = page.getByRole("dialog", { name: "删除账本" });
    await expect(remove).toContainText("1 个账户、0 笔流水");
    await expect(remove.getByRole("button", { name: "取消" })).toBeFocused();
    await expect(remove.getByRole("button", { name: "确认删除" })).toBeDisabled();
  } finally {
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("L1 独立 Web 工作台建账，桌面打开同一 Vault 的账本", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-web-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let browser: Browser | undefined;
  try {
    app = await launch(vault);
    const desktop = await app.firstWindow();
    await engineReady(desktop);
    await desktop.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await desktop.getByRole("tab", { name: "服务端" }).click();
    const share = desktop.getByTestId("web-share-panel");
    await share.getByRole("combobox", { name: "分享范围" }).selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await share.getByRole("button", { name: "创建邀请" }).click();
    const invitation = desktop.getByRole("dialog", { name: "Web 邀请链接" });
    const link = await invitation.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
    await invitation.getByRole("button", { name: "完成" }).click();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(link);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "Web 账本", "资金账户");
    await expect(ledger.getByRole("heading", { name: "Web 账本" })).toBeVisible();
    await expect((await enterLedger(desktop)).getByRole("heading", { name: "Web 账本" })).toBeVisible();
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});
