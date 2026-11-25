import { expect, test } from "@playwright/test";
import type { PlanSummary } from "../../../packages/contracts/src/automation-plan.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { openApp } from "../helpers/launch.js";

test("AW2：模板只填草稿，目录组合筛选并保留原计划身份", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const center = page.getByTestId("plan-directory");
    const rows = center.getByTestId("rule-row");
    await expect(center).toContainText("尚无计划");
    await center.getByRole("button", { name: "从模板新建" }).click();
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
