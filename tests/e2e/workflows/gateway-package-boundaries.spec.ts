import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openCandidateDesktop, withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { verifyCandidateMissingWebEntry } from "../helpers/candidate-web-assets.js";
import { call } from "../knowledge/session-slow-bridge.js";

test.afterAll(disposeCandidate);
test.use({ trace: "off", screenshot: "off", video: "off" });

test("G8.2 同包批量授权拒绝陈旧策略，Web 缺资源和缺入口返回明确错误", async () => {
  test.skip(process.env["HUHU_GATEWAY_BOUNDARY_ACCEPTANCE"] !== "1", "通过隔离的候选安装包包装器运行");
  test.setTimeout(120_000);
  const candidate = await openCandidateDesktop({ identityAttachment: "gateway-boundary-candidate", disableProviderDetection: true });
  const { page, vault } = candidate;
  await withFixtureCleanup(async () => {
    const policy = () => JSON.parse(readFileSync(path.join(vault, ".huhu/gateway/tool-access.json"), "utf8")) as { revision: number; choices: Record<string, boolean> };
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    const filter = page.getByRole("textbox", { name: "筛选能力" });
    for (const capability of ["notes.read", "notes.list"]) {
      await filter.fill(capability);
      await page.getByRole("checkbox", { name: `选择 ${capability}`, exact: true }).check();
    }
    await page.getByRole("button", { name: "开启所选" }).click();
    const bulk = page.getByRole("dialog", { name: "开启所选" });
    await expect(bulk.getByRole("listitem")).toHaveCount(2);
    const before = policy().revision;
    await expect(bulk).toContainText(`策略版本 ${before}`);
    await call(page, "gateway.update", { capability: "vault.info", exposed: true });
    await bulk.getByRole("button", { name: "保存选择" }).click();
    await expect(bulk.getByRole("alert")).toContainText("策略或工具目录已变化");
    expect(policy()).toMatchObject({ revision: before + 1, choices: { "vault.info": true, "notes.read": false, "notes.list": false } });
    await bulk.getByRole("button", { name: "刷新预览" }).click();
    await expect(bulk).toContainText(`策略版本 ${before + 1}`);
    await expect(bulk.getByRole("listitem")).toHaveCount(2);
    await bulk.getByRole("button", { name: "保存选择" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已保存 2 项工具选择" })).toBeVisible();
    expect(policy()).toMatchObject({ revision: before + 2, choices: { "vault.info": true, "notes.read": true, "notes.list": true } });

    await page.getByRole("tab", { name: "服务端" }).click();
    const share = page.getByTestId("web-share-panel");
    await share.getByRole("combobox", { name: "分享范围" }).selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await share.getByRole("button", { name: "创建邀请" }).click();
    const invitation = page.getByRole("dialog", { name: "Web 邀请链接" });
    const link = await invitation.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
    await invitation.getByRole("button", { name: "完成" }).click();
    const origin = new URL(link).origin;
    expect((await fetch(`${origin}/notes/fixture.md`)).status).toBe(200);
    for (const suffix of ["js", "css"]) {
      const response = await fetch(`${origin}/assets/absent-candidate-fixture.${suffix}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Web 资源不存在");
    }

    await verifyCandidateMissingWebEntry(candidate);
  }, [["关闭候选桌面", () => candidate.close()]]);
});
