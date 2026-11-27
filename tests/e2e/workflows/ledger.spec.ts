import { randomUUID } from "node:crypto";
import { ledgerBusinessDayRange, type LedgerRecord } from "../../../packages/contracts/src/ledger.js";
import type { BookList } from "../../../plugins/ledger/src/shared/books.js";
import type { RecordsPage } from "../../../plugins/ledger/src/shared/entries.js";
import type { Loan, LoanHistory } from "../../../plugins/ledger/src/shared/loans.js";
import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, root, rmTree, USER_DATA_ARG } from "../helpers/launch.js";
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
      ["alipay", "alipay.csv", "UTF-8", 2],
      ["jd", "jd-gbk.csv", "GBK", 1],
      ["wechat", "wechat.xlsx", "XLSX", 2],
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

    for (const [type, title, amount] of [
      ["income", "收入", "30"],
      ["expense", "支出", "10"],
      ["transfer", "转账", "25"],
    ] as const) {
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
      name: "receipt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("账本验收凭证"),
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
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "报表账本", "银行");
    const { activeBookId } = await call<{ activeBookId: string }>(page, "ledger.books.list", {});
    const accounts = await call<{ book: { id: string; revision: string; timeZone: string }; businessDate: string; accounts: { id: string }[] }>(page, "ledger.accounts.list", { bookId: activeBookId });
    const day = accounts.businessDate;
    await call(page, "ledger.records.create", {
      bookId: activeBookId,
      expectedRevision: accounts.book.revision,
      intentKey: randomUUID(),
      title: "账本午夜流水",
      record: {
        type: "income",
        currency: "TWD",
        amountMinor: "123",
        accountId: accounts.accounts[0]!.id,
        occurredAt: ledgerBusinessDayRange(day, accounts.book.timeZone).from,
        categoryId: null,
        tagIds: [],
        payee: null,
        memo: null,
        attachmentIds: [],
      },
    });
    await page.getByTestId("ledger-nav-calendar").click();
    await expect(ledger.getByText(/年节假日未配置/)).toBeVisible();
    await ledger.getByLabel("导入离线节假日 JSON").setInputFiles({
      name: "holidays.json",
      mimeType: "application/json",
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

test("L7 账本启用和中心暂停操作同一个固定收支计划，预览未来期次无记账副作用", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "固定收支账本", "银行");
    const { activeBookId } = await call<{ activeBookId: string }>(page, "ledger.books.list", {});
    const { businessDate } = await call<{ businessDate: string }>(page, "ledger.accounts.list", { bookId: activeBookId });
    const next = new Date(Date.parse(businessDate) + 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId("ledger-nav-recurring").click();
    await ledger.getByRole("button", { name: "新建固定收支" }).click();
    const dialog = page.getByRole("dialog", { name: "新建固定收支" });
    await dialog.getByLabel("固定收支名称").fill("工作室订阅");
    await dialog.getByLabel("金额", { exact: true }).fill("75");
    await dialog.getByLabel("起始业务日").fill(next);
    await dialog.getByRole("button", { name: "创建暂停计划" }).click();
    const row = ledger.getByTestId("ledger-recurring-row");
    await expect(row).toContainText("已暂停");
    const read = () => call<{ rows: { plan: { planId: string; revision: string; nextAt: string | null; intent: string } }[] }>(page, "ledger.recurring.list", { bookId: activeBookId });
    const [{ plan: paused }] = (await read()).rows as [{ plan: { planId: string; revision: string } }];
    await row.getByRole("button", { name: "启用计划" }).click();
    await expect(row).toContainText(next);
    const enabled = (await read()).rows[0]!.plan;
    expect(enabled).toMatchObject({ planId: paused.planId, intent: "enabled", nextAt: ledgerBusinessDayRange(next, "Asia/Taipei").from });
    expect(enabled.revision).not.toBe(paused.revision);
    await row.getByRole("button", { name: "预览固定收支补期" }).click();
    const preview = page.getByRole("dialog", { name: "预览固定收支补期" });
    await expect(preview).toContainText("下一业务日 " + next);
    await preview.getByRole("button", { name: "关闭" }).click();
    await row.getByRole("button", { name: "在自动化中心管理计划" }).click();
    const planDetail = page.getByTestId("rule-detail");
    await expect(planDetail).toContainText("工作室订阅");
    await planDetail.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(async () => (await read()).rows[0]?.plan).toMatchObject({ planId: paused.planId, intent: "paused", nextAt: null });
    expect(await call(page, "ledger.records.list", { bookId: activeBookId })).toMatchObject({ total: 0 });
  } finally {
    await close();
  }
});

test("L6 预算进度和明细同源，复制冲突在独立 Web 中可核对", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-budget-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let browser: Browser | undefined;
  try {
    app = await launch(vault);
    const desktop = await app.firstWindow();
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "预算账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const ref = { bookId };
    const accounts = () => call<{ book: { revision: string }; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", ref);
    const version = async () => ({ ...ref, expectedRevision: (await accounts()).book.revision });
    const tags: string[] = [];
    for (const name of ["旅行", "度假"]) {
      const tag = await call<{ id: string }>(desktop, "ledger.dictionaries.save", { ...(await version()), kind: "tag", name });
      tags.push(tag.id);
    }
    const [free] = await call<{ id: string }[]>(desktop, "ledger.budgets.saveBatch", {
      ...(await version()),
      budgets: [
        { definition: { name: "旅行", type: "free", tagIds: tags, currency: "TWD", limitMinor: "60000" } },
        { definition: { name: "日用", type: "fixed", month: "2026-01", direction: "expense", categoryIds: [], currency: "TWD", limitMinor: "80000" } },
      ],
    });
    const {
      accounts: [account],
    } = await accounts();
    await call(desktop, "ledger.records.create", {
      ...(await version()),
      intentKey: randomUUID(),
      title: "旅行车票",
      record: { type: "expense", accountId: account!.id, occurredAt: "2026-01-31T16:00:00.000Z", amountMinor: "4250", currency: "TWD", tagIds: tags, categoryId: null, payee: null, memo: null, attachmentIds: [] },
    });
    const copy = { source: "2026-01", targets: ["2026-02"] };
    expect(await call(desktop, "ledger.budgets.copy", { ...(await version()), ...copy })).toMatchObject({ created: 1 });
    expect(await call(desktop, "ledger.budgets.copy", { ...(await version()), ...copy })).toMatchObject({ created: 0, skipped: [{ name: "日用" }] });

    const link = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(link);
    await enterLedger(page);
    const query = { ...ref, year: "2026", month: "02" };
    const overview = await call<{ budgets: { id: string; actualMinor: string; count: number }[] }>(page, "ledger.budgets.list", query);
    expect(overview.budgets.find(({ id }) => id === free!.id)).toMatchObject({ actualMinor: "4250", count: 1 });
    expect(overview.budgets).toHaveLength(2);
    expect(await call(page, "ledger.budgets.detail", { ...query, budgetId: free!.id })).toMatchObject({
      actualMinor: "4250",
      count: 1,
      rows: [{ title: "旅行车票", businessDate: "2026-02-01" }],
    });
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("L8 独立 Web 预览和确认所选贷款期次并打开原流水", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-loan-e2e-"));
  const vault = path.join(sandbox, "vault");
  mkdirSync(vault);
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let browser: Browser | undefined;
  try {
    app = await launch(vault);
    const desktop = await app.firstWindow();
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "贷款账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const { book, accounts } = await call<{ book: { revision: string }; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", { bookId });
    const loan = await call<Loan>(desktop, "ledger.loans.create", {
      bookId,
      expectedRevision: book.revision,
      definition: { name: "设备贷款", method: "equal-principal", principalMinor: "20000", currency: "TWD", annualRatePercent: "12", months: 2, startOn: "2024-01-31", accountId: accounts[0]!.id },
    });
    const url = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const webLedger = await enterLedger(page);
    await page.getByTestId("ledger-nav-recurring").click();
    const loanCard = webLedger.getByRole("article").filter({
      has: page.getByRole("heading", { name: loan.definition.name, exact: true }),
    });
    await loanCard.getByRole("button", { name: "预览贷款历史补记" }).click();
    const preview = page.getByRole("dialog", { name: "预览贷款历史补记" });
    await expect(preview.getByRole("table", { name: "还款计划" })).toContainText("2024-02-29");
    await expect(preview.getByRole("button", { name: "确认所选期次" })).toBeDisabled();
    expect(await call(page, "ledger.records.list", { bookId })).toMatchObject({ total: 0 });
    await preview.getByRole("checkbox", { name: "补记第 1 期 2024-02-29" }).check();
    await preview.getByRole("button", { name: "确认所选期次" }).click();
    await expect(preview.getByRole("status").filter({ hasText: "已确认 1 个所选期次" })).toBeVisible();
    await expect(preview.getByRole("checkbox", { name: "补记第 2 期 2024-03-31" })).not.toBeChecked();
    const history = await call<LoanHistory>(page, "ledger.loans.previewHistory", { bookId, loanId: loan.id });
    expect(history.installments).toMatchObject([
      { number: 1, status: "generated", recordId: expect.any(String) },
      { number: 2, status: "due", recordId: null },
    ]);
    await preview.getByRole("button", { name: "查看第 1 期流水" }).click();
    const record = page.getByRole("dialog", { name: "查看流水" });
    await expect(record).toContainText("2024-02-29");
    await expect(record.getByRole("heading", { name: loan.definition.name, exact: true })).toBeVisible();
    expect(await call(desktop, "ledger.records.list", { bookId })).toMatchObject({
      total: 1,
      rows: [{ businessDate: "2024-02-29", record: { id: history.installments[0]!.recordId } }],
    });
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("AW4 AU16 账本与中心双向改期同一计划且删除后插件重开不复活", async ({ browserName: _browserName }) => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "计划来源账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(page, "ledger.books.list", {});
    const { book, accounts, businessDate } = await call<{ book: { revision: string }; accounts: { id: string }[]; businessDate: string }>(page, "ledger.accounts.list", { bookId });
    const startOn = new Date(Date.parse(businessDate) + 86_400_000).toISOString().slice(0, 10);
    const { plan } = await call<{ plan: { planId: string; revision: string } }>(page, "ledger.recurring.create", {
      bookId,
      expectedRevision: book.revision,
      rule: { id: randomUUID(), title: "原账本计划", type: "expense", accountId: accounts[0]!.id, currency: "TWD", amountMinor: "7500", startOn, frequency: "monthly", memo: null },
    });
    await ledger.getByRole("button", { name: "新建账本" }).click();
    await createBook(page, "另一个账本", "现金");
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const center = page.getByTestId("plan-directory");
    await center.getByTestId("rule-row").filter({ hasText: "原账本计划" }).click();
    const inspector = center.getByTestId("rule-detail");
    await inspector.getByRole("button", { name: "打开账本" }).click();
    const row = ledger.getByTestId("ledger-recurring-row");
    await expect(row.getByRole("heading", { name: "原账本计划" })).toBeFocused();
    await expect(ledger.getByLabel("当前账本")).toHaveValue(bookId);
    await expect(row).toHaveAttribute("data-plan-id", plan.planId);
    await row.getByRole("button", { name: "启用计划" }).click();
    const read = () => call<{ planId: string; revision: string; intent: string; nextAt: string | null }>(page, "automations.plans.read", { planId: plan.planId });
    await expect.poll(read).toMatchObject({ planId: plan.planId, intent: "enabled", nextAt: ledgerBusinessDayRange(startOn, "Asia/Taipei").from });
    expect((await read()).revision).not.toBe(plan.revision);
    await row.getByRole("button", { name: "在自动化中心管理计划" }).click();
    await expect(inspector.getByRole("heading", { name: "原账本计划" })).toBeFocused();
    const changedStart = new Date(Date.parse(startOn) + 86_400_000).toISOString().slice(0, 10);
    await inspector.getByRole("button", { name: "改期" }).click();
    const calendar = page.getByRole("dialog", { name: "更改计划时间" });
    await calendar.getByRole("combobox", { name: /^周期/ }).selectOption("weekly");
    await calendar.getByLabel("起始日期").fill(changedStart);
    await calendar.getByRole("button", { name: "保存" }).click();
    await expect(calendar).toBeHidden();
    await expect.poll(read).toMatchObject({
      planId: plan.planId,
      trigger: { kind: "calendar", startOn: changedStart, frequency: "weekly" },
      nextAt: ledgerBusinessDayRange(changedStart, "Asia/Taipei").from,
    });
    await inspector.getByRole("button", { name: "打开账本" }).click();
    await expect(row).toContainText(`每周 · ${changedStart} 起`);
    await row.getByRole("button", { name: "改期" }).click();
    await calendar.getByRole("combobox", { name: /^周期/ }).selectOption("daily");
    await calendar.getByRole("button", { name: "保存" }).click();
    await expect(calendar).toBeHidden();
    await row.getByRole("button", { name: "在自动化中心管理计划" }).click();
    await expect(inspector).toContainText(`每日 · ${changedStart} 起`);
    await inspector.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId: plan.planId, intent: "paused", nextAt: null });
    await inspector.getByRole("button", { name: "打开账本" }).click();
    await row.getByRole("button", { name: "删除计划" }).click();
    const remove = page.getByRole("dialog", { name: "删除固定收支计划" });
    await expect(remove.getByRole("button", { name: "取消" })).toBeFocused();
    await remove.getByRole("button", { name: "删除计划" }).click();
    await expect.poll(read).toMatchObject({ planId: plan.planId, intent: "deleted" });
    await call(page, "plugins.setEnabled", { id: "ledger", enabled: false });
    await call(page, "plugins.setEnabled", { id: "ledger", enabled: true });
    await expect.poll(read).toMatchObject({ planId: plan.planId, intent: "deleted", nextAt: null });
    expect(await call(page, "ledger.records.list", { bookId })).toMatchObject({ total: 0 });
  } finally {
    await close();
  }
});

test("L9 独立 Web 导出账本包并预览恢复到新账本", async () => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const original = await enterLedger(desktop);
    await original.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "原账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const { book, businessDate, accounts } = await call<{ book: { revision: string }; businessDate: string; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", { bookId });
    const originalRecord = await call<LedgerRecord>(desktop, "ledger.records.create", {
      bookId,
      expectedRevision: book.revision,
      intentKey: randomUUID(),
      title: "备份车票",
      record: {
        type: "expense",
        accountId: accounts[0]!.id,
        amountMinor: "2300",
        currency: "TWD",
        occurredAt: ledgerBusinessDayRange(businessDate, "Asia/Taipei").from,
        categoryId: null,
        tagIds: [],
        attachmentIds: [],
        payee: null,
        memo: null,
      },
    });
    const url = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const ledger = await enterLedger(page);
    await page.getByTestId("ledger-nav-backups").click();
    await ledger.getByRole("button", { name: "准备当前快照" }).click();
    const exporting = page.getByRole("dialog", { name: "导出账本包" });
    await exporting.getByRole("checkbox", { name: "账户、期初余额与字典" }).uncheck();
    await expect(exporting.getByRole("button", { name: "下载账本包" })).toBeDisabled();
    await expect(exporting.getByRole("status")).toContainText(/请补选\s*账户/);
    await exporting.getByRole("checkbox", { name: "账户、期初余额与字典" }).check();
    const downloadPromise = page.waitForEvent("download");
    await exporting.getByRole("button", { name: "下载账本包" }).click();
    const archive = await downloadPromise;
    await ledger.getByRole("button", { name: "预览恢复" }).click();
    const restore = page.getByRole("dialog", { name: "恢复账本包" });
    await restore.getByLabel("本地账本包").setInputFiles(await archive.path());
    await restore.getByRole("button", { name: "检查备份" }).click();
    await expect(restore.getByRole("heading", { name: "核对恢复范围" })).toBeFocused();
    expect(await call(page, "ledger.books.list", {})).toMatchObject({ books: [{ id: bookId }] });
    const restoredName = "恢复账本";
    await restore.getByLabel("恢复到新账本").fill(restoredName);
    await restore.getByRole("button", { name: "确认恢复" }).click();
    await expect(ledger.getByRole("heading", { name: restoredName, exact: true })).toBeVisible();
    const published = await call<BookList>(page, "ledger.books.list", {});
    expect(published.books).toHaveLength(2);
    const restoredBook = published.books.find(({ name }) => name === restoredName);
    expect(restoredBook).toBeDefined();
    const restoredId = restoredBook!.id;
    expect(restoredId).not.toBe(bookId);
    expect(published.activeBookId).toBe(restoredId);
    await expect(ledger.getByLabel("当前账本")).toHaveValue(restoredId);
    const restoredRecords = await call<RecordsPage>(page, "ledger.records.list", { bookId: restoredId });
    expect(restoredRecords).toMatchObject({ total: 1, rows: [{ title: "备份车票", record: { amountMinor: "2300" } }] });
    expect(restoredRecords.rows[0]!.record.id).not.toBe(originalRecord.id);
    expect(await call(desktop, "ledger.records.list", { bookId })).toMatchObject({
      total: 1,
      rows: [{ title: "备份车票", record: { id: originalRecord.id, amountMinor: "2300" } }],
    });
  } finally {
    await browser?.close().catch(() => undefined);
    await close();
  }
});

test("L10 独立 Web 关联财务笔记并保存期间复盘，桌面可读取所写 Markdown", async () => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "旅行账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const note = await call<{ path: string; id: string }>(desktop, "notes.create", { name: "旅行凭据说明", body: "# 旅行凭据说明" });
    const url = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await enterLedger(page);
    const owner = { kind: "book" };
    const { book } = await call<{ book: { revision: string } }>(page, "ledger.accounts.list", { bookId });
    expect(await call(page, "notes.list", {})).toContainEqual(expect.objectContaining(note));
    const link = await call<{ id: string }>(page, "ledger.references.link", {
      bookId,
      expectedRevision: book.revision,
      owner,
      resource: { kind: "note", path: note.path },
    });
    expect(await call(page, "ledger.references.open", { bookId, owner, referenceId: link.id })).toMatchObject({
      status: "available",
      resource: { path: note.path, documentId: note.id },
    });
    const query = { bookId, from: "2026-02-01", to: "2026-02-28", currency: "TWD" };
    const draft = await call<{ revision: string; markdown: string }>(page, "ledger.references.previewReview", query);
    const review = await call<{ path: string }>(page, "ledger.references.saveReview", { ...query, expectedRevision: draft.revision, name: "旅行二月复盘" });
    expect(await call(desktop, "notes.read", { path: review.path })).toMatchObject({ text: draft.markdown });
    expect(draft.markdown).toContain("账本：旅行账本");
    expect(draft.markdown).toContain("2026-02-01 至 2026-02-28");
    expect(draft.markdown).toContain("排除平账组与历史排除流水");
  } finally {
    await browser?.close().catch(() => undefined);
    await close();
  }
});

test("L11 桌面切换 Vault 后使用各自的账本身份，回到原库仍可读取", async () => {
  const { page, vault, close } = await openApp();
  const second = mkdtempSync(path.join(tmpdir(), "huhu-ledger-second-vault-"));
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "日常账本", "甲库银行");
    const original = await call<BookList>(page, "ledger.books.list", {});

    expect(await page.evaluate((target) => window.huhuHost.vault.open(target, { kind: "new" }), second)).toMatchObject({ ok: true });
    await page.reload();
    await engineReady(page);
    await enterLedger(page);
    expect(await call<BookList>(page, "ledger.books.list", {})).toMatchObject({ books: [], activeBookId: null });
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "日常账本", "乙库银行");
    const other = await call<BookList>(page, "ledger.books.list", {});
    expect(other.activeBookId).not.toBe(original.activeBookId);
    await expect(ledger.getByLabel("当前账本")).toHaveValue(other.activeBookId!);

    expect(await page.evaluate((target) => window.huhuHost.vault.open(target), vault)).toMatchObject({ ok: true });
    await page.reload();
    await engineReady(page);
    await enterLedger(page);
    expect(await call<BookList>(page, "ledger.books.list", {})).toEqual(original);
    await expect(ledger.getByLabel("当前账本")).toHaveValue(original.activeBookId!);
  } finally {
    try {
      await close();
    } finally {
      rmTree(second);
    }
  }
});

test("L9 桌面全 Vault 包恢复账本并按附件选项清理引用", async () => {
  const { page, close } = await openApp();
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-ledger-vault-package-e2e-"));
  let restoredApp: Awaited<ReturnType<typeof launch>> | undefined;
  let originalClosed = false;
  try {
    await engineReady(page);
    const ledger = await enterLedger(page);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(page, "完整备份账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(page, "ledger.books.list", {});
    const accounts = () => call<{ book: { revision: string }; businessDate: string; accounts: { id: string }[] }>(page, "ledger.accounts.list", { bookId });
    const initial = await accounts();
    const record = await call<{ id: string; revision: string }>(page, "ledger.records.create", {
      bookId,
      expectedRevision: initial.book.revision,
      intentKey: randomUUID(),
      title: "含凭证流水",
      record: {
        type: "expense",
        accountId: initial.accounts[0]!.id,
        amountMinor: "1000",
        currency: "TWD",
        occurredAt: ledgerBusinessDayRange(initial.businessDate, "Asia/Taipei").from,
        categoryId: null,
        tagIds: [],
        attachmentIds: [],
        payee: null,
        memo: null,
      },
    });
    await call(page, "ledger.attachments.upload", {
      bookId,
      expectedRevision: (await accounts()).book.revision,
      recordId: record.id,
      recordRevision: record.revision,
      fileName: "票据.txt",
      mediaType: "text/plain",
      base64: Buffer.from("original receipt").toString("base64"),
    });
    const dest = path.join(sandbox, "vault.zip");
    const targetDir = path.join(sandbox, "received");
    await call(page, "vault.exportPackage", { dest, includeAttachments: false });
    await call(page, "vault.importPackage", { zipPath: dest, targetDir });
    expect(await call(page, "ledger.records.list", { bookId })).toMatchObject({ total: 1, rows: [{ attachments: [{ fileName: "票据.txt" }] }] });
    await close();
    originalClosed = true;
    restoredApp = await launch(targetDir);
    const restored = await restoredApp.firstWindow();
    await engineReady(restored);
    await expect((await enterLedger(restored)).getByRole("heading", { name: "完整备份账本" })).toBeVisible();
    expect(await call(restored, "ledger.records.list", { bookId })).toMatchObject({
      total: 1,
      rows: [{ title: "含凭证流水", attachments: [], record: { id: record.id, attachmentIds: [] } }],
    });
  } finally {
    await restoredApp?.close().catch(() => undefined);
    if (!originalClosed) await close();
    rmTree(sandbox);
  }
});

test("L6 预算页依同一筛选分页、批量编辑并显示逐月复制冲突", async ({ browserName: _browserName }) => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "预算界面账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const accounts = () => call<{ book: { revision: string }; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", { bookId });
    const version = async () => ({ bookId, expectedRevision: (await accounts()).book.revision });
    const tags: string[] = [];
    for (const name of ["物料", "工作室"]) {
      const tag = await call<{ id: string }>(desktop, "ledger.dictionaries.save", { ...(await version()), kind: "tag", name });
      tags.push(tag.id);
    }
    const [free, fixed, conflicting] = await call<{ id: string }[]>(desktop, "ledger.budgets.saveBatch", {
      ...(await version()),
      budgets: [
        { definition: { type: "free", name: "工作室物料", currency: "TWD", limitMinor: "15000", tagIds: tags, from: "2026-02-01", to: "2026-02-28" } },
        { definition: { type: "fixed", name: "日常支出", currency: "TWD", limitMinor: "20000", direction: "expense", month: "2026-02", categoryIds: [] } },
        { definition: { type: "fixed", name: "日常支出", currency: "TWD", limitMinor: "50000", direction: "expense", month: "2026-03", categoryIds: [] } },
        { definition: { type: "fixed", name: "外币目标", currency: "USD", limitMinor: "10000", direction: "income", month: "2026-02", categoryIds: [] } },
      ],
    });
    const accountId = (await accounts()).accounts[0]!.id;
    for (let day = 1; day <= 11; day++) {
      await call(desktop, "ledger.records.create", {
        ...(await version()),
        intentKey: randomUUID(),
        title: day === 1 ? "双标签纸笔" : `物料支出 ${day}`,
        record: {
          type: "expense",
          accountId,
          occurredAt: `2026-02-${String(day).padStart(2, "0")}T04:00:00.000Z`,
          amountMinor: "100",
          currency: "TWD",
          tagIds: day === 1 ? tags : tags.slice(0, 1),
          categoryId: null,
          payee: null,
          memo: null,
          attachmentIds: [],
        },
      });
    }
    await desktop.getByTestId("ledger-nav-budgets").click();
    await expect(ledger.getByRole("heading", { name: "预算列表" })).toBeVisible();

    const link = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    await page.goto(link);
    const webLedger = await enterLedger(page);
    await page.getByTestId("ledger-nav-budgets").click();
    await page.getByRole("button", { name: "收起导航" }).click();
    const year = webLedger.getByLabel("预算年份");
    await year.fill("2026");
    await year.press("Tab");
    const month = webLedger.getByLabel("预算月份");
    await month.selectOption("02");
    await webLedger.getByLabel("预算币种").selectOption("TWD");
    await expect(webLedger.getByRole("heading", { name: "月度汇总" })).toBeVisible();
    const freeRow = webLedger.getByTestId(`ledger-budget-${free!.id}`);
    const fixedRow = webLedger.getByTestId(`ledger-budget-${fixed!.id}`);
    await expect(freeRow).toContainText("TWD 11.00 / TWD 150.00");
    await expect(freeRow).toContainText("11 笔");
    await expect(webLedger.getByText("外币目标", { exact: true })).toHaveCount(0);
    await freeRow.getByRole("button", { name: "查看 工作室物料 明细" }).click();
    const detail = page.getByRole("dialog", { name: "预算明细 · 工作室物料" });
    const table = detail.getByRole("table", { name: "预算匹配流水" });
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(detail).toContainText("TWD 11.00 / TWD 150.00");
    await detail.getByRole("button", { name: "下一页" }).click();
    await expect(table.getByRole("rowheader", { name: "双标签纸笔" })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(detail.getByText("第 2 / 2 页 · 共 11 笔")).toBeVisible();
    await detail.getByRole("button", { name: "完成", exact: true }).click();

    await freeRow.getByRole("checkbox", { name: "工作室物料" }).check();
    await fixedRow.getByRole("checkbox", { name: "日常支出" }).check();
    await webLedger.getByRole("button", { name: "批量编辑（2）" }).click();
    const edit = page.getByRole("dialog", { name: "批量编辑预算" });
    await edit.getByRole("group", { name: "工作室物料", exact: true }).getByLabel("预算额度").fill("175.50");
    await edit.getByRole("group", { name: "日常支出", exact: true }).getByLabel("预算额度").fill("250");
    await edit.getByRole("button", { name: "保存预算" }).click();
    await expect(freeRow).toContainText("TWD 11.00 / TWD 175.50");
    await expect(fixedRow).toContainText("TWD 11.00 / TWD 250.00");

    const copy = page.getByRole("dialog", { name: "跨月复制固定预算" });
    for (const [created, skipped] of [
      [3, 1],
      [0, 4],
    ]) {
      await webLedger.getByRole("button", { name: "跨月复制" }).click();
      await copy.getByLabel("目标月份", { exact: true }).fill("2026-03");
      await copy.getByRole("button", { name: "添加目标月" }).click();
      await copy.getByLabel("目标月份 2").fill("2026-04");
      await copy.getByRole("button", { name: "确认复制" }).click();
      await expect(copy.getByRole("status")).toContainText(`已复制 ${created} 项 · 跳过 ${skipped} 项同名预算`);
      await expect(copy.getByRole("status")).toContainText("2026-03 · 日常支出（保留已有规则）");
      await copy.getByRole("button", { name: "完成", exact: true }).click();
    }
    await month.selectOption("03");
    await expect(webLedger.getByTestId(`ledger-budget-${conflicting!.id}`)).toContainText("TWD 0.00 / TWD 500.00");
    await month.selectOption("");
    await expect(webLedger.getByRole("heading", { name: "年度汇总" })).toBeVisible();
  } finally {
    await browser?.close().catch(() => undefined);
    await close();
  }
});

test("L10 财务笔记可关联、打开和修复，Notes 停用时仍可记账和预览复盘", async ({ browserName: _browserName }) => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "财务笔记账本", "银行");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const accounts = () => call<{ businessDate: string; book: { revision: string }; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", { bookId });
    const version = async () => ({ bookId, expectedRevision: (await accounts()).book.revision });
    const {
      businessDate,
      accounts: [account],
    } = await accounts();
    const note = await call<{ path: string }>(desktop, "notes.create", { name: "财务采购说明", body: "# 财务采购说明" });
    const missing = await call<{ path: string }>(desktop, "notes.create", { name: "旧纸笔凭据", body: "# 旧纸笔凭据" });
    await call(desktop, "archives.types.save", { name: "采购档案", fields: [{ name: "负责人", type: "text" }] });
    const archive = await call<{ path: string }>(desktop, "archives.create", { type: "采购档案", name: "工作室报销档案", fields: { 负责人: "林川" } });
    const [budget] = await call<{ id: string }[]>(desktop, "ledger.budgets.saveBatch", {
      ...(await version()),
      budgets: [{ definition: { name: "纸笔预算", type: "fixed", month: businessDate.slice(0, 7), currency: "TWD", limitMinor: "15000", direction: "expense", categoryIds: [] } }],
    });
    const record = await call<LedgerRecord>(desktop, "ledger.records.create", {
      ...(await version()),
      title: "购置纸笔",
      intentKey: randomUUID(),
      record: { type: "expense", accountId: account!.id, occurredAt: `${businessDate}T03:00:00.000Z`, amountMinor: "2100", currency: "TWD", categoryId: null, tagIds: [], payee: null, memo: null, attachmentIds: [] },
    });
    const owner = { kind: "record", id: record.id };
    const broken = await call<{ id: string }>(desktop, "ledger.references.link", {
      ...(await version()),
      owner,
      resource: { kind: "note", path: missing.path },
    });
    await call(desktop, "notes.trash", { path: missing.path });

    const url = await inviteWorkbench(desktop);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const webLedger = await enterLedger(page);
    const openLedger = () => page.getByRole("button", { name: "账本", exact: true }).first().click();
    const openTab = (title: string) => page.getByTestId("document-tab").and(page.locator(`[title="${title}"]`));
    await webLedger.getByRole("button", { name: "财务笔记", exact: true }).click();
    const bookNote = page.getByRole("dialog", { name: "账本财务笔记" });
    await bookNote.getByRole("button", { name: "关联已有资源" }).click();
    await bookNote.getByLabel("资源类型").selectOption("note");
    await bookNote.getByRole("searchbox", { name: "筛选资源" }).fill("采购说明");
    await bookNote.getByRole("radio", { name: /财务采购说明/ }).check();
    await bookNote.getByRole("button", { name: "确认关联" }).click();
    await expect(bookNote.getByText("资源已关联。")).toBeVisible();
    await bookNote.getByRole("button", { name: `打开 ${note.path}`, exact: true }).click();
    await expect(openTab(note.path)).toHaveAttribute("aria-current", "true");

    await openLedger();
    await page.getByTestId("ledger-nav-budgets").click();
    await webLedger.getByTestId(`ledger-budget-${budget!.id}`).getByRole("button", { name: "纸笔预算的财务笔记" }).click();
    const budgetNote = page.getByRole("dialog", { name: "预算财务笔记" });
    await budgetNote.getByRole("button", { name: "关联已有资源" }).click();
    await budgetNote.getByLabel("资源类型").selectOption("archive");
    await budgetNote.getByRole("radio", { name: /工作室报销档案/ }).check();
    await budgetNote.getByRole("button", { name: "确认关联" }).click();
    await budgetNote.getByRole("button", { name: `打开 ${archive.path}`, exact: true }).click();
    await expect(openTab(archive.path + "index.md")).toHaveAttribute("aria-current", "true");

    await openLedger();
    await page.getByTestId("ledger-nav-records").click();
    const recordTrigger = webLedger.getByRole("button", { name: "购置纸笔的财务笔记" });
    const recordNote = page.getByRole("dialog", { name: "流水财务笔记" });
    await recordTrigger.click();
    const brokenRow = recordNote.getByTestId(`ledger-reference-${broken.id}`);
    await expect(brokenRow.getByText("资源已缺失")).toBeVisible();
    await brokenRow.getByRole("button", { name: `选择替换资源 ${missing.path}` }).click();
    await recordNote.getByRole("searchbox", { name: "筛选资源" }).fill("财务采购说明");
    await recordNote.getByRole("radio", { name: /财务采购说明/ }).check();
    await recordNote.getByRole("button", { name: "保存修复" }).click();
    await expect(brokenRow.getByRole("button", { name: `打开 ${note.path}`, exact: true })).toBeVisible();
    await call(desktop, "plugins.setEnabled", { id: "notes", enabled: false });
    await expect(recordNote.getByText(/Notes 已停用/)).toBeVisible();
    await expect(recordNote.getByRole("button", { name: "关联已有资源" })).toBeDisabled();
    await brokenRow.getByRole("button", { name: `移除关联 ${note.path}`, exact: true }).click();
    await expect(brokenRow).toHaveCount(0);
    await recordNote.getByRole("button", { name: "完成", exact: true }).click();
    await webLedger.getByRole("button", { name: "记一笔", exact: true }).click();
    const entry = page.getByRole("dialog", { name: "记一笔" });
    await entry.getByLabel("事项").fill("补买文件夹");
    await entry.getByLabel("交易类型").selectOption("expense");
    await entry.getByLabel("资金账户").selectOption({ label: "银行 · TWD" });
    await entry.getByLabel("金额", { exact: true }).fill("3");
    await entry.getByRole("button", { name: "保存流水" }).click();
    await expect(entry).toBeHidden();
    await expect(webLedger.getByRole("cell", { name: "补买文件夹", exact: true })).toBeVisible();

    await page.getByTestId("ledger-nav-reports").click();
    await webLedger.getByRole("button", { name: "期间复盘" }).click();
    const review = page.getByRole("dialog", { name: "期间复盘" });
    await review.getByLabel("复盘开始日期").fill(businessDate);
    await review.getByLabel("复盘结束日期").fill(businessDate);
    await review.getByLabel("复盘币种").selectOption("TWD");
    await review.getByLabel("纳入已平账流水").check();
    await review.getByRole("button", { name: "生成 Markdown 预览" }).click();
    const markdown = review.getByLabel("Markdown 预览正文");
    await expect(markdown).toContainText("财务笔记账本");
    await expect(markdown).toContainText("币种：TWD");
    await expect(markdown).toContainText("包含平账组与历史排除流水");
    await expect(review.getByRole("button", { name: "保存为笔记" })).toBeDisabled();

    await call(desktop, "plugins.setEnabled", { id: "notes", enabled: true });
    await review.getByLabel("复盘笔记名称").fill("纸笔期间复盘");
    const source = await markdown.textContent();
    await review.getByRole("button", { name: "保存为笔记" }).click();
    await review.getByRole("button", { name: "打开复盘笔记" }).click();
    await expect(openTab("纸笔期间复盘.md")).toHaveAttribute("aria-current", "true");
    expect(await call(desktop, "notes.read", { path: "纸笔期间复盘.md" })).toMatchObject({ text: source });
    expect(await call(desktop, "notes.read", { path: note.path })).toMatchObject({ text: "# 财务采购说明" });
  } finally {
    await browser?.close().catch(() => undefined);
    await close();
  }
});

test("L11 总览三张卡片定位本月预算、固定收支和贷款补记并反映新流水", async ({ browserName: _browserName }) => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const ledger = await enterLedger(desktop);
    await ledger.getByRole("button", { name: "创建第一个账本" }).click();
    await createBook(desktop, "总览活动账本", "银行");
    const byCard = (title: string) => ledger.getByRole("article").filter({ has: desktop.getByRole("heading", { name: title, exact: true }) });
    await expect(byCard("当月预算")).toContainText("本月暂无预算。");
    await expect(byCard("固定收支下一期")).toContainText("暂无已排定的下一期。");
    await expect(byCard("贷款补记")).toContainText("暂无贷款。");
    const { activeBookId: bookId } = await call<{ activeBookId: string }>(desktop, "ledger.books.list", {});
    const accounts = () => call<{ businessDate: string; book: { revision: string }; accounts: { id: string }[] }>(desktop, "ledger.accounts.list", { bookId });
    const version = async () => ({ bookId, expectedRevision: (await accounts()).book.revision });
    const {
      businessDate,
      accounts: [account],
    } = await accounts();
    const currentMonth = businessDate.slice(0, 7);
    await call(desktop, "ledger.budgets.saveBatch", {
      ...(await version()),
      budgets: [
        { definition: { type: "fixed", month: currentMonth, name: "当月材料", currency: "TWD", limitMinor: "35000", direction: "expense", categoryIds: [] } },
        { definition: { type: "fixed", month: currentMonth, name: "美元收入", currency: "USD", limitMinor: "22000", direction: "income", categoryIds: [] } },
      ],
    });
    await call(desktop, "ledger.loans.create", {
      ...(await version()),
      definition: { name: "工位设备贷款", method: "equal-principal", principalMinor: "20000", currency: "TWD", annualRatePercent: "12", months: 2, startOn: "2024-01-31", accountId: account!.id },
    });
    const nextDay = new Date(Date.parse(businessDate) + 86_400_000).toISOString().slice(0, 10);
    await call(desktop, "ledger.recurring.create", {
      ...(await version()),
      rule: {
        id: randomUUID(),
        title: "工作室固定支出",
        type: "expense",
        accountId: account!.id,
        currency: "TWD",
        amountMinor: "7500",
        startOn: nextDay,
        frequency: "monthly",
        memo: null,
      },
    });
    await desktop.getByTestId("ledger-nav-recurring").click();
    const fixedRow = ledger.getByTestId("ledger-recurring-row").filter({ hasText: "工作室固定支出" });
    await fixedRow.getByRole("button", { name: "启用计划" }).click();
    await expect(fixedRow).toContainText(nextDay);
    await desktop.getByTestId("ledger-nav-overview").click();
    await expect(byCard("固定收支下一期").locator("time")).toHaveAttribute("datetime", ledgerBusinessDayRange(nextDay, "Asia/Taipei").from);

    const url = await inviteWorkbench(desktop);
    await enterLedger(desktop);
    await desktop.getByTestId("ledger-nav-overview").click();
    await expect(byCard("贷款补记")).toContainText("已补记 0 / 2 期");
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const webLedger = await enterLedger(page);
    const card = (title: string) => webLedger.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    const budgetCard = card("当月预算");
    await expect(budgetCard).toContainText("TWD 0.00 / TWD 350.00");
    await expect(budgetCard).toContainText("USD 0.00 / USD 220.00");
    await budgetCard.getByRole("button", { name: "查看本月预算" }).click();
    await expect(webLedger.getByLabel("预算年份")).toHaveValue(currentMonth.slice(0, 4));
    await expect(webLedger.getByLabel("预算月份")).toHaveValue(currentMonth.slice(5));
    await expect(webLedger.getByLabel("预算币种")).toHaveValue("");
    await expect(webLedger.getByText("当月材料", { exact: true })).toBeVisible();

    const overview = page.getByTestId("ledger-nav-overview");
    await overview.click();
    const recurringCard = card("固定收支下一期");
    await expect(recurringCard).toContainText("1 项启用 · 0 期需处理");
    await recurringCard.getByRole("button", { name: "查看固定收支" }).click();
    await expect(webLedger.getByRole("heading", { name: "固定收支", exact: true })).toBeFocused();
    await expect(webLedger.getByTestId("ledger-recurring-row").filter({ hasText: "工作室固定支出" })).toBeVisible();

    await overview.click();
    const loan = card("贷款补记");
    await expect(loan).toContainText("已补记 0 / 2 期");
    await loan.getByRole("button", { name: "查看贷款补记" }).click();
    await expect(webLedger.getByRole("heading", { name: "贷款", exact: true })).toBeFocused();
    const loanRow = webLedger.getByRole("article").filter({ has: page.getByRole("heading", { name: "工位设备贷款", exact: true }) });
    await loanRow.getByRole("button", { name: "预览贷款历史补记" }).click();
    const preview = page.getByRole("dialog", { name: "预览贷款历史补记" });
    await preview.getByRole("checkbox", { name: "补记第 1 期 2024-02-29" }).check();
    await preview.getByRole("button", { name: "确认所选期次" }).click();
    await expect(preview.getByText("已确认 1 个所选期次。")).toBeVisible();
    await preview.getByRole("button", { name: "取消", exact: true }).click();
    await overview.click();
    await expect(loan).toContainText("已补记 1 / 2 期");
    await expect(byCard("贷款补记")).toContainText("已补记 1 / 2 期");
    expect(await call(desktop, "ledger.records.list", { bookId })).toMatchObject({
      total: 1,
      rows: [{ businessDate: "2024-02-29", record: { type: "expense" } }],
    });
  } finally {
    await browser?.close().catch(() => undefined);
    await close();
  }
});
