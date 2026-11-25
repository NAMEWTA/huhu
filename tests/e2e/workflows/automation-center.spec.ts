import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type Browser } from "@playwright/test";
import type { PlanSummary } from "../../../packages/contracts/src/automation-plan.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { openApp } from "../helpers/launch.js";

test("AU15 全局暂停从中心写入并在设置中恢复", async ({ browserName: _browserName }) => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const control = page.getByTestId("automatic-run-control");
    await control.getByRole("button", { name: "暂停自动运行" }).click();
    await page.getByRole("dialog", { name: "暂停自动运行" }).getByRole("button", { name: "暂停自动运行" }).click();
    await expect(control.getByRole("status")).toHaveText("自动运行已全局暂停");
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    const settings = page.getByTestId("settings-module");
    await page.getByTestId("settings-nav-automations").click();
    await expect(settings.getByTestId("automatic-run-control").getByRole("status")).toHaveText("自动运行已全局暂停");
    await settings.getByRole("button", { name: "恢复自动运行" }).click();
    await page.getByRole("dialog", { name: "恢复自动运行" }).getByRole("button", { name: "恢复自动运行" }).click();
    await expect(settings.getByTestId("automatic-run-control").getByRole("status")).toHaveText("自动运行已开启");
  } finally {
    await close();
  }
});

test("AU13 重试原建任务效果，保留通知和任务身份", async ({ browserName: _browserName }) => {
  const { page, vault, close } = await openApp();
  const title = "原效果重试夹具";
  try {
    await engineReady(page);
    const rule = await call<{ id: string; version: string }>(page, "automations.create", {
      title, trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "both", text: title },
    });
    const { activationId, summary } = await call<{ activationId: string; summary: { taskId: string } }>(page, "automations.runNow", {
      id: rule.id, expectedVersion: rule.version, intentId: randomUUID(),
    });
    const filename = path.join(vault, ".huhu", "automations", "reminder-deliveries", `${activationId}.json`);
    const record = JSON.parse(readFileSync(filename, "utf8")) as object;
    writeFileSync(filename, JSON.stringify({ ...record, task: "unavailable" }) + "\n");

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "激活记录", exact: true }).click();
    await page.getByTestId("activation-row").getByRole("button", { name: title }).click();
    const detail = page.getByTestId("occurrence-inspector");
    await expect(detail).toContainText("创建任务 · 失败");
    await detail.getByRole("button", { name: "重试该效果" }).click();
    await expect(detail).toContainText("创建任务 · 已完成");
    const tasks = await call<{ id: string }[]>(page, "tasks.list", {});
    expect(tasks.map(({ id }) => id)).toEqual([summary.taskId]);
    const notices = await call<{ title: string }[]>(page, "notifications.list", {});
    expect(notices.filter((row) => row.title === title)).toHaveLength(1);
  } finally {
    await close();
  }
});

test("AW2：模板只填草稿，目录组合筛选并保留原计划身份", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const automations = page.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true });
    await expect(automations).toBeVisible({ timeout: 10_000 });
    await automations.click({ timeout: 10_000 });
    const center = page.getByTestId("plan-directory");
    const rows = center.getByTestId("rule-row");
    await expect(center).toContainText("尚无计划");
    const templates = center.getByRole("button", { name: "从模板新建" });
    await expect.poll(() => templates.evaluate((control) => {
      const host = control.closest(".automations-center-host")!;
      const surface = host.parentElement!;
      const box = control.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { fillsSurface: host.clientWidth === surface.clientWidth && host.clientWidth > 0, clickable: control.contains(hit) };
    })).toEqual({ fillsSurface: true, clickable: true });
    await templates.click();
    await page.getByRole("button", { name: "使用模板 · 周期提醒" }).click();
    await expect(page.getByLabel("规则名称")).toHaveValue("周期提醒");
    await page.getByTestId("rule-editor").getByRole("button", { name: "取消", exact: true }).click();
    const list = () => call<{ plans: PlanSummary[] }>(page, "automations.plans.list", {});
    expect((await list()).plans).toHaveLength(0);
    await center.getByRole("button", { name: "从模板新建" }).click();
    await page.getByRole("button", { name: "使用模板 · 周期提醒" }).click();
    await page.getByLabel("通知内容").fill("写周报");
    await page.getByTestId("rule-save").click();
    await expect(center.getByTestId("rule-detail").getByRole("heading", { name: "周期提醒", exact: true })).toBeVisible();
    const [plan] = (await list()).plans;
    expect(plan).toMatchObject({ title: "周期提醒", intent: "paused" });
    await center.getByRole("button", { name: "返回计划目录", exact: true }).click();
    await center.getByLabel("来源", { exact: true }).selectOption("automations");
    await center.getByLabel("状态", { exact: true }).selectOption("paused");
    await center.getByLabel("搜索计划").fill("周期");
    await expect(rows).toHaveCount(1);
    await center.getByRole("button", { name: "更多操作 · 周期提醒" }).click();
    await expect(center.getByTestId("rule-detail")).toHaveCount(0);
    await page.getByRole("dialog", { name: "计划操作" }).getByRole("button", { name: "关闭" }).click();
    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`automation-plan=${plan!.planId}`));
    await center.getByRole("button", { name: "返回计划目录", exact: true }).click();
    await expect(rows.first()).toBeFocused();
    await center.getByLabel("搜索计划").fill("没有匹配值");
    await expect(center).toContainText("没有匹配的计划");
    await expect(center).not.toContainText("尚无计划");
  } finally {
    await close();
  }
});

test("AW3：扫描草稿预览无写入，关闭保护草稿并保留并发冲突输入", async () => {
  const { page, close } = await openApp();
  const engineCall = <T,>(capability: string, input: object) =>
    test.step(`Engine ${capability}`, () => call<T>(page, capability, input, undefined, 8_000), { timeout: 10_000 });
  try {
    await test.step("等待桌面 Engine 就绪", () => engineReady(page), { timeout: 23_000 });
    await engineCall("tasks.create", { title: "人工任务 · 仅供预览" });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const center = page.getByTestId("plan-directory");
    await center.getByRole("button", { name: "从模板新建" }).click();
    await page.getByRole("button", { name: "使用模板 · 扫描 Agent 任务" }).click();
    const dialog = page.getByTestId("rule-dialog");
    const editor = dialog.getByTestId("rule-editor");
    await editor.getByLabel("派遣窗口").selectOption("week");
    await editor.getByLabel("包括逾期").check();
    await editor.getByLabel("每次并发上限").fill("3");
    await editor.getByTestId("rule-instruction").fill("初版草稿");
    await editor.getByRole("button", { name: "预览候选" }).click();
    await expect(editor.getByRole("region", { name: "候选预览" })).toContainText("人工任务 · 仅供预览");
    expect(await engineCall("automations.activations", {})).toEqual([]);
    expect(await engineCall("automations.list", {})).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "放弃未保存的更改？" }).getByRole("button", { name: "继续编辑" }).click();
    await expect(editor.getByTestId("rule-instruction")).toHaveValue("初版草稿");
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();

    await center.getByTestId("rule-edit").click();
    await expect(editor.getByLabel("派遣窗口")).toHaveValue("week");
    await expect(editor.getByLabel("每次并发上限")).toHaveValue("3");
    await expect(editor.getByLabel("包括逾期")).toBeChecked();
    const [rule] = await engineCall<{ id: string; version: string }[]>("automations.list", {});
    await editor.getByTestId("rule-instruction").fill("并发时保留这份输入");
    await engineCall("automations.update", { id: rule!.id, expectedVersion: rule!.version, patch: { title: "另一个客户端已更新" } });
    await editor.getByTestId("rule-save").click();
    await expect(page.getByRole("region", { name: "当前计划版本" })).toContainText("另一个客户端已更新");
    await expect(editor.getByTestId("rule-instruction")).toHaveValue("并发时保留这份输入");
    await page.getByRole("button", { name: "保留草稿并采用当前修订" }).click();
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();
    await expect(center.getByTestId("rule-detail").getByRole("heading", { name: "另一个客户端已更新" })).toBeVisible();
    expect(await engineCall("automations.read", { id: rule!.id })).toMatchObject({
      id: rule!.id, body: "并发时保留这份输入", data: { title: "另一个客户端已更新" },
    });
  } finally {
    await test.step("关闭桌面夹具", close, { timeout: 15_000 });
  }
});

test("AW3：暂停规则的手动请求断线后从原意图核实", async () => {
  const { page, close } = await openApp();
  const title = "手动核实的提醒";
  type Rule = { id: string; version: string; data: { enabled: boolean } };
  try {
    await engineReady(page);
    const rule = await call<Rule>(page, "automations.create", {
      title,
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: title },
    });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: title }).click();
    const requests: { intentId: string; idempotencyKey: string }[] = [];
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input: { intentId: string }; idempotencyKey: string };
      if (request.capability !== "automations.runNow") return route.continue();
      requests.push({ intentId: request.input.intentId, idempotencyKey: request.idempotencyKey });
      if (requests.length > 1) return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort();
    });
    const detail = page.getByTestId("rule-detail");
    await detail.getByRole("button", { name: "立即运行", exact: true }).click();
    await expect(detail.getByRole("button", { name: "核对原运行", exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "核对原运行", exact: true }).click();
    await detail.getByRole("button", { name: "查看本次运行" }).click();
    await expect(page.getByRole("dialog", { name: "运行详情" })).toContainText("立即运行");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const records = await call<{ ruleId: string; trigger: string }[]>(page, "automations.activations", {});
    expect(records.filter(({ ruleId }) => ruleId === rule.id)).toMatchObject([{ trigger: "manual" }]);
    const saved = await call<Rule>(page, "automations.read", { id: rule.id });
    expect(saved).toMatchObject({ id: rule.id, version: rule.version, data: { enabled: false } });
  } finally {
    await close();
  }
});

test("AW3：独立 Web 窄容器保留编辑内容和返回焦点", async () => {
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(page);
    await call(page, "automations.create", {
      title: "需要在窄容器里完整显示的中文周期提醒名称",
      trigger: { preset: "custom", cron: "0 9 1 * *", zone: "Asia/Taipei" },
      action: { kind: "reminder", mode: "notification", text: "原通知" },
    });
    await call(page, "web.share.start", { mode: "local", port: 0 });
    const invitation = await call<{ links: string[] }>(page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await web.goto(invitation.links[0]!);
    await web.getByRole("button", { name: "自动化", exact: true }).first().click();
    const row = web.getByTestId("rule-row").first();
    await row.click();
    await web.getByTestId("rule-edit").click();
    const editor = web.getByTestId("rule-editor");
    await expect(editor.getByLabel("cron 表达式")).toHaveValue("0 9 1 * *");
    await editor.getByLabel("通知内容").fill("窄工作台输入");
    const dialog = web.getByTestId("rule-dialog");
    await expect(dialog).toContainText("做什么");
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();
    await expect(web.getByTestId("rule-detail")).toContainText("窄工作台输入");
    await web.getByRole("button", { name: "返回计划目录" }).click();
    await expect(row).toBeFocused();
  } finally {
    await browser?.close();
    await close();
  }
});

test("AW5：筛选原发生和逐项效果，重新读取不会再次发送通知", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const rule = await call<{ id: string; version: string }>(page, "automations.create", {
      title: "检查原通知效果",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "只发送一次的通知" },
    });
    const occurrence = await call<{ activationId: string }>(page, "automations.runNow", {
      id: rule.id, expectedVersion: rule.version, intentId: randomUUID(),
    });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "激活记录", exact: true }).click();
    await page.getByRole("searchbox", { name: "搜索发生" }).fill("检查原通知");
    const row = page.getByTestId("activation-row");
    await expect(row).toHaveCount(1);
    const open = row.getByRole("button", { name: "检查原通知效果" });
    await open.click();
    const detail = page.getByTestId("occurrence-inspector");
    await expect(detail.getByRole("listitem").filter({ hasText: "通知" })).toContainText("已完成");
    await detail.getByText("计划与冻结输入", { exact: true }).click();
    await expect(detail.getByText(occurrence.activationId, { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "重新读取原发生" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "通知" })).toHaveCount(1);
    await detail.getByRole("button", { name: "关闭" }).click();
    await expect(open).toBeFocused();
    const all = await call<{ activationId: string; ruleId: string }[]>(page, "automations.activations", {});
    expect(all.filter(({ ruleId }) => ruleId === rule.id).map(({ activationId }) => activationId)).toEqual([occurrence.activationId]);
  } finally {
    await close();
  }
});

test("AW4 AU16 专注来源与中心共享计划修订和下次时间", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const focus = page.getByTestId("card-focus");
    await focus.getByTestId("focus-start").click();
    const readFocus = () => call<{ running: boolean; endsAt: string | null; plan: { planId: string; revision: string } }>(page, "home.focus.get", {});
    await expect.poll(readFocus).toMatchObject({ running: true, plan: { planId: expect.any(String) } });
    const source = await readFocus();
    const read = () => call<PlanSummary>(page, "automations.plans.read", { planId: source.plan.planId });
    expect(await read()).toMatchObject({ ...source.plan, intent: "enabled", nextAt: source.endsAt });
    const eligible = await call<{ plans: PlanSummary[] }>(page, "automations.plans.list", { state: "enabled", order: "next", limit: 1 });
    const summary = await call<{ next: PlanSummary | null }>(page, "automations.plans.summary", {});
    expect(summary.next).toMatchObject({ planId: eligible.plans[0]?.planId, revision: eligible.plans[0]?.revision, nextAt: eligible.plans[0]?.nextAt });
    await focus.getByRole("button", { name: "在自动化中心管理计划" }).click();
    const inspector = page.getByTestId("rule-detail");
    await expect(inspector.getByRole("heading", { name: "专注计时" })).toBeVisible();
    await inspector.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId: source.plan.planId, intent: "paused", nextAt: null });
    expect(await readFocus()).toMatchObject({ running: false, plan: { planId: source.plan.planId, revision: (await read()).revision } });
    await inspector.getByRole("button", { name: "打开专注" }).click();
    await expect(focus.getByTestId("focus-start")).toBeVisible();
    await focus.getByTestId("focus-start").click();
    await expect.poll(read).toMatchObject({ planId: source.plan.planId, intent: "enabled" });
  } finally {
    await close();
  }
});

test("AW6 AU16 AU17 获邀 Web 在任务来源管理原提醒，停用来源时中心显示准确状态", async ({ browserName: _browserName }) => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const task = await call<{ id: string }>(desktop, "tasks.create", { title: "核对采购付款", type: "human" });
    const intentId = randomUUID();
    const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();
    const reminder = await call<PlanSummary>(desktop, "automations.plans.createTaskReminder", {
      taskId: task.id, scheduledFor, intentId, startPaused: true,
    }, intentId);
    const { planId } = reminder;
    const read = () => call<PlanSummary>(desktop, "automations.plans.read", { planId });

    await call(desktop, "web.share.start", { mode: "local", port: 0 });
    const invitation = await call<{ links: string[] }>(desktop, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage();
    await web.goto(invitation.links[0]!);
    await engineReady(web);
    for (const client of [desktop, web]) {
      await client.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true }).click();
      const row = client.getByTestId("plan-directory").locator(`[data-plan-id="${planId}"]`);
      await row.getByTestId("rule-row").click();
      await expect(client.getByTestId("rule-detail")).toContainText("任务提醒：核对采购付款");
    }
    const detail = web.getByTestId("rule-detail");
    await detail.getByRole("button", { name: "打开来源任务" }).click();
    const reminders = web.getByTestId("detail-reminders");
    const sourceRow = reminders.locator(`[data-plan-id="${planId}"]`);
    await expect(sourceRow.locator("time")).toHaveAttribute("datetime", scheduledFor);
    await sourceRow.getByRole("button", { name: "启用", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId, intent: "enabled", nextAt: scheduledFor });
    const enabled = await read();
    expect(enabled.revision).not.toBe(reminder.revision);
    await expect(desktop.getByTestId("rule-detail").locator("time")).toHaveAttribute("datetime", scheduledFor);
    await sourceRow.getByRole("button", { name: "在中心管理 · 任务提醒：核对采购付款" }).click();
    await expect(detail.locator("time")).toHaveAttribute("datetime", scheduledFor);

    await call(desktop, "plugins.setEnabled", { id: "tasks", enabled: false });
    await expect(detail).toContainText("来源插件未启用");
    await expect(detail.getByRole("button", { name: "打开来源任务" })).toHaveCount(0);
    expect(await read()).toMatchObject({ planId, revision: enabled.revision, nextAt: null, availability: { state: "blocked", reason: "plugin-disabled" } });
    await detail.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId, intent: "paused", nextAt: null });

    await call(desktop, "plugins.setEnabled", { id: "tasks", enabled: true });
    await expect(detail.getByRole("button", { name: "打开来源任务" })).toBeVisible();
    await detail.getByRole("button", { name: "打开来源任务" }).click();
    await expect(sourceRow).toContainText("已暂停");
    await expect(sourceRow.locator("time")).toHaveAttribute("datetime", scheduledFor);
  } finally {
    await browser?.close();
    await close();
  }
});
