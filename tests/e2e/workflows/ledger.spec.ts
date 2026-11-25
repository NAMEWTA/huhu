import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
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

async function createBook(page: Page, name: string, account: string, currency = "TWD") {
  const dialog = page.getByRole("dialog", { name: "创建账本" });
  await expect(dialog.getByLabel("账本名称")).toBeFocused();
  await dialog.getByLabel("账本名称").fill(name);
  await dialog.getByLabel("默认币种").selectOption(currency);
  await dialog.getByLabel("业务时区").selectOption("Asia/Taipei");
  await dialog.getByLabel("首个资金账户").fill(account);
  await dialog.getByRole("button", { name: "创建账本", exact: true }).click();
  await expect(dialog).toBeHidden();
}

function launch(vault: string) {
  return electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
}

async function inviteWorkbench(desktop: Page) {
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
  return link;
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
    const link = await inviteWorkbench(desktop);
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

test("L3 独立 Web 导入四种账单、保留真实重复消费并导出筛选结果", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-import-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let browser: Browser | undefined;
  try {
    app = await launch(vault);
    const link = await inviteWorkbench(await app.firstWindow());
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(link);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "导入账本", "银行", "CNY");
    await page.getByTestId("ledger-nav-accounts").click();
    for (const name of ["微信", "花呗"]) {
      await ledger.getByRole("button", { name: "新增账户" }).click();
      const account = page.getByRole("dialog", { name: "新增资金账户" });
      await account.getByLabel("账户名称").fill(name);
      await account.getByRole("button", { name: "保存账户" }).click();
      await expect(account).toBeHidden();
    }
    await page.getByTestId("ledger-nav-records").click();
    const selectBill = async (source: string, fileName: string) => {
      await ledger.getByRole("button", { name: "导入账单", exact: true }).click();
      const wizard = page.getByRole("dialog", { name: "导入账单" });
      await wizard.getByLabel("账单来源", { exact: true }).selectOption(source);
      await wizard.getByLabel("账单文件", { exact: true }).setInputFiles(path.resolve(import.meta.dirname, "../../fixtures/ledger", fileName));
      await wizard.getByRole("button", { name: "预览账单", exact: true }).click();
      await expect(wizard.getByRole("heading", { name: "核对账单" })).toBeFocused();
      return wizard;
    };
    for (const [source, name, encoding, count] of [
      ["alipay", "alipay.csv", "UTF-8", 2], ["jd", "jd-gbk.csv", "GBK", 1], ["wechat", "wechat.xlsx", "XLSX", 2],
    ] as const) {
      const pane = await selectBill(source, name);
      await expect(pane.getByRole("status")).toContainText(encoding);
      await pane.getByRole("button", { name: "确认导入" }).click();
      await expect(pane.getByRole("status")).toHaveText(`已导入 ${count} 笔流水。`);
      await pane.getByRole("button", { name: "完成" }).click();
    }
    let pane = await selectBill("csv", "generic.csv");
    await pane.getByRole("button", { name: "取消导入" }).click();
    await expect(ledger.getByRole("status").filter({ hasText: /^5 笔$/ })).toBeVisible();
    pane = await selectBill("csv", "generic.csv");
    await pane.getByRole("button", { name: "处理第 3 行" }).click();
    await pane.getByLabel("资金账户", { exact: true }).selectOption({ label: "银行" });
    await pane.getByLabel("保存所选账户和分类映射").check();
    await pane.getByRole("button", { name: "应用处理" }).click();
    await expect(pane.getByRole("status")).toContainText("1 疑似重复");
    await pane.getByRole("checkbox", { name: "导入第 4 行" }).check();
    await pane.getByRole("button", { name: "确认导入" }).click();
    await expect(pane.getByRole("status")).toHaveText("已导入 2 笔流水。");
    await pane.getByRole("button", { name: "完成" }).click();
    await ledger.getByLabel("搜索流水").fill("文具");
    await ledger.getByRole("button", { name: "应用筛选" }).click();
    await expect(ledger.getByRole("cell", { name: "文具", exact: true })).toHaveCount(2);
    const downloaded = page.waitForEvent("download");
    await ledger.getByRole("button", { name: "导出筛选 CSV" }).click();
    const csv = readFileSync((await (await downloaded).path())!, "utf8");
    expect(csv.match(/文具/g)).toHaveLength(2);
    expect(csv).not.toContain("测试京东退款");
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("L2 收入、支出与转账得到 95/125，带凭证流水重开后可编辑", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-entries-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    app = await launch(vault);
    let page = await app.firstWindow();
    await engineReady(page);
    let ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "闭环账本", "银行");
    await page.getByTestId("ledger-nav-accounts").click();
    await ledger.getByRole("button", { name: "校准余额 银行" }).click();
    const calibration = page.getByRole("dialog", { name: "校准余额" });
    await calibration.getByLabel("日初校准余额").fill("100");
    await calibration.getByRole("button", { name: "预览校准" }).click();
    await expect(calibration).toContainText("TWD 100.00");
    await calibration.getByRole("button", { name: "确认校准" }).click();
    await expect(calibration).toBeHidden();

    await ledger.getByRole("button", { name: "新增账户" }).click();
    const account = page.getByRole("dialog", { name: "新增资金账户" });
    await account.getByLabel("账户名称").fill("钱包");
    await account.getByLabel("账户类型", { exact: true }).selectOption("wallet");
    await account.getByLabel("期初余额").fill("100");
    await account.getByRole("button", { name: "保存账户" }).click();
    await expect(account).toBeHidden();
    await page.getByTestId("ledger-nav-records").click();

    for (const [type, title, amount] of [["income", "收入", "30"], ["expense", "支出", "10"], ["transfer", "转账", "25"]] as const) {
      await ledger.getByRole("button", { name: "记一笔", exact: true }).click();
      const entry = page.getByRole("dialog", { name: "记一笔" });
      await entry.getByLabel("事项").fill(title);
      await entry.getByLabel("交易类型").selectOption(type);
      await entry.getByLabel(type === "transfer" ? "转出账户" : "资金账户").selectOption({ label: "银行 · TWD" });
      if (type === "transfer") await entry.getByLabel("转入账户").selectOption({ label: "钱包 · TWD" });
      await entry.getByLabel("金额", { exact: true }).fill(amount);
      await entry.getByRole("button", { name: "保存流水" }).click();
      await expect(entry).toBeHidden();
    }
    const summary = ledger.getByRole("list", { name: "筛选汇总" });
    await expect(summary).toContainText("收入 TWD 30.00");
    await expect(summary).toContainText("支出 TWD 10.00");
    await ledger.getByRole("button", { name: "凭证 支出" }).click();
    const receipts = page.getByRole("dialog", { name: "流水凭证" });
    await receipts.getByLabel("选择凭证文件").setInputFiles({
      name: "receipt.txt", mimeType: "text/plain", buffer: Buffer.from("账本验收凭证"),
    });
    await receipts.getByRole("button", { name: "上传凭证" }).click();
    await expect(receipts.getByRole("button", { name: "下载 receipt.txt" })).toBeVisible();
    await receipts.getByRole("button", { name: "完成" }).click();
    await page.getByTestId("ledger-nav-accounts").click();
    const balances = ledger.getByRole("table", { name: "资金账户" });
    await expect(balances.getByRole("row").filter({ has: page.getByRole("cell", { name: "银行", exact: true }) })).toContainText("TWD 95.00");
    await expect(balances.getByRole("row").filter({ has: page.getByRole("cell", { name: "钱包", exact: true }) })).toContainText("TWD 125.00");
    await app.close();

    app = await launch(vault);
    page = await app.firstWindow();
    await engineReady(page);
    ledger = await enterLedger(page);
    await page.getByTestId("ledger-nav-records").click();
    await ledger.getByRole("button", { name: "编辑 支出" }).click();
    const edit = page.getByRole("dialog", { name: "编辑流水" });
    await edit.getByLabel("事项").fill("重开后编辑");
    await edit.getByRole("button", { name: "保存流水" }).click();
    await expect(edit).toBeHidden();
    await ledger.getByRole("button", { name: "凭证 重开后编辑" }).click();
    await expect(page.getByRole("dialog", { name: "流水凭证" }).getByRole("button", { name: "下载 receipt.txt" })).toBeVisible();
  } finally {
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});
