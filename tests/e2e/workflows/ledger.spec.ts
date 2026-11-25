import { randomUUID } from "node:crypto";
import { ledgerBusinessDayRange } from "../../../packages/contracts/src/ledger.js";
import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root, rmTree, USER_DATA_ARG } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

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

test("L4 跨账户平账保持资金余额，撤销后恢复统计并可预览合并重复流水", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-reconcile-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    app = await launch(vault);
    const page = await app.firstWindow();
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "对账账本", "银行", "CNY");
    await page.getByTestId("ledger-nav-accounts").click();
    await ledger.getByRole("button", { name: "新增账户" }).click();
    const account = page.getByRole("dialog", { name: "新增资金账户" });
    await account.getByLabel("账户名称").fill("钱包");
    await account.getByRole("button", { name: "保存账户" }).click();
    await expect(account).toBeHidden();
    const recordsTab = page.getByTestId("ledger-nav-records");
    await recordsTab.click();
    const add = async (title: string, type: "income" | "expense", amount: string, name: string) => {
      await ledger.getByRole("button", { name: "记一笔", exact: true }).click();
      const entry = page.getByRole("dialog", { name: "记一笔" });
      await entry.getByLabel("事项").fill(title);
      await entry.getByLabel("交易类型").selectOption(type);
      await entry.getByLabel("资金账户").selectOption({ label: name + " · CNY" });
      await entry.getByLabel("金额", { exact: true }).fill(amount);
      await entry.getByRole("button", { name: "保存流水" }).click();
      await expect(entry).toBeHidden();
    };
    await add("原支出", "expense", "100", "银行");
    await add("退款 60", "income", "60", "钱包");
    await add("退款 40", "income", "40", "钱包");
    const sums = ledger.getByRole("list", { name: "筛选汇总" });
    await expect(sums).toContainText("收入 CNY 100.00");
    await expect(sums).toContainText("支出 CNY 100.00");
    await ledger.getByRole("button", { name: "平账 原支出", exact: true }).click();
    const offset = page.getByRole("dialog", { name: "流水平账" });
    await offset.getByRole("button", { name: "查找候选" }).click();
    await offset.getByRole("button", { name: "选择平账组" }).click();
    await offset.getByRole("button", { name: "预览确认" }).click();
    await expect(offset).toContainText("平账金额 CNY 100.00");
    await expect(offset.getByRole("button", { name: "取消" })).toBeFocused();
    await offset.getByRole("button", { name: "确认平账" }).click();
    await expect(offset).toBeHidden();
    await expect(sums).toHaveCount(0);
    await page.getByTestId("ledger-nav-accounts").click();
    const balances = ledger.getByRole("table", { name: "资金账户" });
    await expect(balances.getByRole("row").filter({ has: page.getByRole("cell", { name: "银行", exact: true }) })).toContainText("CNY -100.00");
    await expect(balances.getByRole("row").filter({ has: page.getByRole("cell", { name: "钱包", exact: true }) })).toContainText("CNY 100.00");
    await recordsTab.click();
    await ledger.getByRole("button", { name: "撤销平账 原支出" }).click();
    const undo = page.getByRole("dialog", { name: "撤销整组平账" });
    await expect(undo).toContainText("这 3 笔流水");
    await undo.getByRole("button", { name: "确认撤销" }).click();
    await expect(sums).toContainText("收入 CNY 100.00");

    await add("原重复记账", "expense", "7", "银行");
    await add("另一来源记账", "expense", "7", "银行");
    await ledger.getByRole("button", { name: "去重", exact: true }).click();
    const merge = page.getByRole("dialog", { name: "去重与合并" });
    await merge.getByRole("button", { name: "查找候选" }).click();
    await merge.getByRole("button", { name: "选择合并组" }).click();
    const label = await merge.getByRole("option", { name: /^原重复记账/ }).textContent();
    await merge.getByLabel("保留流水", { exact: true }).selectOption({ label: label! });
    await merge.getByRole("button", { name: "预览确认" }).click();
    await expect(merge).toContainText("合并迁移");
    await merge.getByRole("button", { name: "确认合并" }).click();
    await expect(merge).toBeHidden();
    await expect(ledger.getByRole("cell", { name: "原重复记账", exact: true })).toBeVisible();
    await expect(ledger.getByRole("cell", { name: "另一来源记账", exact: true })).toHaveCount(0);
  } finally {
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("L5 同一业务午夜在日历和报表可下钻，离线节假日与卡片可以调整", async () => {
  const { page, close } = await import("../helpers/launch.js").then(({ openApp }) => openApp());
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "报表账本", "银行");
    const { activeBookId } = await call<{ activeBookId: string }>(page, "ledger.books.list", {});
    const accounts = await call<{ book: { id: string; revision: string; timeZone: string }; businessDate: string; accounts: { id: string }[] }>(page, "ledger.accounts.list", { bookId: activeBookId });
    const day = accounts.businessDate;
    await call(page, "ledger.records.create", {
      bookId: activeBookId, expectedRevision: accounts.book.revision, intentKey: randomUUID(), title: "账本午夜流水",
      record: {
        type: "income", currency: "TWD", amountMinor: "123", accountId: accounts.accounts[0]!.id,
        occurredAt: ledgerBusinessDayRange(day, accounts.book.timeZone).from,
        categoryId: null, tagIds: [], payee: null, memo: null, attachmentIds: [],
      },
    });
    await page.getByTestId("ledger-nav-calendar").click();
    await expect(ledger.getByText(/年节假日未配置/)).toBeVisible();
    await ledger.getByLabel("导入离线节假日 JSON").setInputFiles({
      name: "holidays.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ year: day.slice(0, 4), source: "本地夹具", entries: [{ date: day, name: "本地节日", isWorkday: false }] })),
    });
    await expect(ledger.getByText("本地节日", { exact: true })).toBeVisible();
    await ledger.getByRole("button", { name: day, exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("账本午夜流水");
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();
    await page.getByTestId("ledger-nav-reports").click();
    await ledger.getByRole("button", { name: "查看收入明细" }).click();
    await expect(page.getByRole("dialog")).toContainText("账本午夜流水");
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();

    await page.getByTestId("ledger-nav-overview").click();
    await ledger.getByRole("button", { name: "调整总览卡片" }).click();
    const preferences = page.getByRole("dialog", { name: "调整总览卡片" });
    await preferences.getByRole("checkbox", { name: "最近流水" }).uncheck();
    await preferences.getByRole("button", { name: "上移 账户余额" }).click();
    await preferences.getByRole("button", { name: "保存卡片" }).click();
    await expect(ledger.getByRole("heading", { name: "最近流水" })).toHaveCount(0);
  } finally {
    await close();
  }
});
