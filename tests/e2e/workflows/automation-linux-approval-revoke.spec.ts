import { expect, test } from "@playwright/test";
import type { CapabilityResult } from "../../../packages/contracts/src/capability.js";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

test("Linux 桌面对话框在系统 sh 无法核对时仍可撤销原批准", async () => {
  test.skip(process.platform !== "linux", "使用 Linux 系统 sh 和本机终端批准");
  const { page, close } = await openApp();
  const review = "automations.terminal.approval.review";
  const calls = "**/api/v1/call";
  const unavailableReason = "无法核对 Linux 系统 sh 的可执行文件";
  try {
    await engineReady(page);
    const title = "撤销暂不可核对的 sh 批准";
    const command = "printf fixture";
    const rule = await call<{ id: string }>(page, "automations.create", {
      title,
      trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
      action: { kind: "terminal", shell: "sh", command, spaceId: null },
    });
    const input = { ruleId: rule.id };
    const before = await call<{ target: string; ruleVersion: string }>(page, review, input);
    const { approvalId } = await call<{ approvalId: string }>(page, "automations.terminal.approval.approve", {
      ...input,
      target: before.target,
      expectedRuleVersion: before.ruleVersion,
      expectedApprovalId: null,
      names: ["HUHU_RULE_SECRET_FIXTURE"],
    });
    await expect(call(page, review, input)).resolves.toMatchObject({ approvalId, target: before.target });

    // The service test simulates /bin/sh lookup failure. Only replace the review response here.
    await page.route(calls, async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      const body = request.postDataJSON() as { capability?: string; input?: { ruleId?: string } };
      if (body.capability !== review || body.input?.ruleId !== rule.id) return route.continue();
      const response = await route.fetch();
      const result = (await response.json()) as CapabilityResult<Record<string, unknown>>;
      if (!result.ok) return route.fulfill({ response });
      const { executable: _executable, ...display } = result.data;
      return route.fulfill({ response, json: { ...result, data: { ...display, target: null, unavailableReason } } });
    });

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: title }).click();
    await page.getByRole("button", { name: "管理 CLI / MCP 授权" }).click();
    const dialog = page.getByRole("dialog", { name: "终端规则的外部授权" });
    await expect(dialog.getByRole("status")).toHaveText(unavailableReason);
    await expect(dialog.getByRole("region", { name: "sh 命令" })).toContainText(command);
    await expect(dialog.getByRole("button", { name: "批准这条规则" })).toBeDisabled();
    await dialog.getByRole("button", { name: "撤销批准" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已撤销本机批准" })).toBeVisible();
    await expect(dialog).toBeHidden();
    await page.unroute(calls);
    await expect(call(page, review, input)).resolves.toMatchObject({ approvalId: null, target: before.target });
  } finally {
    await close();
  }
});
