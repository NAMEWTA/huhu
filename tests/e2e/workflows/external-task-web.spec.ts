import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { CapabilityResult, TaskDto } from "../../../packages/contracts/src/index.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { openCandidateDesktop } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { call } from "../knowledge/session-slow-bridge.js";

test.afterAll(disposeCandidate);

async function allTasks(page: Page) {
  await page.getByRole("button", { name: "任务", exact: true }).first().click();
  await page.getByRole("button", { name: /^全部任务/ }).click();
  await page.getByTestId("task-views").getByRole("tab", { name: "列表" }).click();
}

test("D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web", async ({ browserName }, testInfo) => {
  void browserName;
  test.skip(process.env["HUHU_EXTERNAL_TASK_WEB_ACCEPTANCE"] !== "1", "通过隔离的候选安装包包装器运行");
  test.setTimeout(150_000);
  const candidate = await openCandidateDesktop({ identityAttachment: "external-task-candidate-identity" });
  const { page, vault } = candidate;
  let browser: Browser | undefined;
  let failed = false;
  const cleanupErrors: unknown[] = [];
  try {
    const endpoint = await page.evaluate(() => window.huhuHost.engine());
    const cli = async <T>(capability: string, input: unknown): Promise<CapabilityResult<T>> => {
      const file = testInfo.outputPath(`external-task-${randomUUID()}.json`);
      await writeFile(file, JSON.stringify(input), { mode: 0o600, flag: "wx" });
      const args = ["call", capability, "--vault", vault, "--json", "--input-file", file];
      if (capability === "tasks.create") args.push("--intent-key", randomUUID());
      const result = await promisify(execFile)(path.join(candidate.resources, "bin", "huhu"), args, { env: candidate.env, timeout: 20_000 }).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === 1 && "stdout" in error && typeof error.stdout === "string") return { stdout: error.stdout };
        throw error;
      });
      return JSON.parse(result.stdout) as CapabilityResult<T>;
    };
    const value = <T>(result: CapabilityResult<T>): T => {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.data;
    };
    const initial = { title: "CLI 原始任务", type: "human", body: "CLI 创建的正文" };
    expect(await cli("tasks.create", initial)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    const token = await call<{ id: string; token: string }>(page, "gateway.tokens.create", { name: "D09 合成外部调用" });
    await call(page, "gateway.mcp.update", { enabled: true, transport: "http" });
    const url = `${endpoint.baseUrl}/mcp`;
    const session = await openMcpSession(url, token.token);
    const mcp = async (capability: string, input: unknown) => {
      const response = await mcpRequest(
        url,
        token.token,
        mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input, ...(capability === "tasks.create" ? { _meta: { "huhu.dev/intent-key": randomUUID() } } : {}) }),
        session,
      );
      expect(response.status).toBe(200);
      return (await response.json()).result as { isError?: boolean; structuredContent?: { data: TaskDto }; content: { text: string }[] };
    };
    const closed = await mcp("tasks.create", initial);
    expect(closed.isError).toBe(true);
    expect(JSON.parse(closed.content[0]!.text)).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    for (const capability of ["tasks.create", "tasks.update", "tasks.read"]) await call(page, "gateway.update", { capability, exposed: true });

    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByRole("tab", { name: "服务端" }).click();
    const share = page.getByTestId("web-share-panel");
    await share.getByRole("combobox", { name: "分享范围" }).selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await share.getByRole("button", { name: "创建邀请" }).click();
    const invitation = page.getByRole("dialog", { name: "Web 邀请链接" });
    const link = await invitation.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
    await invitation.getByRole("button", { name: "完成" }).click();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const web = await context.newPage();
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    await allTasks(page);
    await allTasks(web);

    const accepted = value(await cli<{ id: string }>("tasks.create", initial));
    const created = value(await cli<TaskDto>("tasks.read", { id: accepted.id }));
    const row = (surface: Page) => surface.getByTestId("task-row").and(surface.locator(`[data-task-id="${created.id}"]`));
    for (const surface of [page, web]) {
      await expect(row(surface)).toHaveCount(1);
      await expect(row(surface)).toContainText(initial.title);
      await row(surface)
        .getByRole("button", { name: `打开任务 ${initial.title}`, exact: true })
        .click();
      await expect(surface.getByTestId("task-detail")).toContainText(initial.body);
    }
    const editedTitle = "MCP 已修改的同一任务";
    const editedBody = "MCP 更新后桌面与浏览器读取同一版本";
    const updated = await mcp("tasks.update", { id: created.id, expectedVersion: created.version, patch: { title: editedTitle, body: editedBody } });
    expect(updated.isError, JSON.stringify(updated.content)).not.toBe(true);
    expect(updated.structuredContent?.data).toMatchObject({ id: created.id, title: editedTitle, body: editedBody });
    for (const surface of [page, web]) {
      await expect(row(surface)).toHaveCount(1);
      await expect(row(surface)).toContainText(editedTitle);
      await expect(surface.getByTestId("detail-title")).toHaveText(editedTitle);
      await expect(surface.getByTestId("task-detail")).toContainText(editedBody);
    }
    await web.reload();
    await allTasks(web);
    await expect(row(web)).toHaveCount(1);
    await row(web)
      .getByRole("button", { name: `打开任务 ${editedTitle}`, exact: true })
      .click();
    await expect(web.getByTestId("task-detail")).toContainText(editedBody);
    expect(value(await cli<TaskDto>("tasks.read", { id: created.id }))).toMatchObject(updated.structuredContent!.data);
    await call(page, "gateway.update", { capability: "tasks.update", exposed: false });
    const denied = await mcp("tasks.update", { id: created.id, expectedVersion: updated.structuredContent!.data.version, patch: { title: "撤权后不应出现" } });
    expect(denied.isError).toBe(true);
    expect(JSON.parse(denied.content[0]!.text)).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    expect(value(await cli<TaskDto>("tasks.read", { id: created.id }))).toMatchObject({ title: editedTitle, version: updated.structuredContent!.data.version });
    await testInfo.attach("external-task-shared-identity", {
      body: JSON.stringify({ taskId: created.id, version: updated.structuredContent!.data.version, desktopOrigin: endpoint.baseUrl, webOrigin: new URL(web.url()).origin }),
      contentType: "application/json",
    });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    for (const cleanup of [() => browser?.close(), () => candidate.close()]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (failed && cleanupErrors.length) await testInfo.attach("external-task-cleanup-errors", { body: cleanupErrors.map(String).join("\n"), contentType: "text/plain" }).catch(() => {});
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "外部任务联验清理失败");
});
