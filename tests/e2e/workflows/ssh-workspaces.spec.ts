import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openApp, root, USER_DATA_ARG } from "../helpers/launch.js";

async function sshCall<T>(page: Page, capability: string, input: unknown = {}): Promise<{ ok: boolean; data: T; error?: { code: string; message: string } }> {
  const engine = await page.evaluate(() => window.huhuHost.engine());
  return page.evaluate(
    async ({ engine, capability, input }) => {
      const response = await fetch(`${engine.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${engine.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return response.json();
    },
    { engine, capability, input },
  );
}

async function openWorkspace(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
}

test("H4.1 工作区模板保存顺序与自定义布局，跨应用重开并删除", async () => {
  test.setTimeout(90_000);
  const fixture = await openApp();
  try {
    const { page, vault } = fixture;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const hosts: { id: string; name: string }[] = [];
    for (let i = 1; i <= 13; i++) {
      const saved = await sshCall<{ id: string; name: string }>(page, "ssh.hosts.save", { name: `测试主机 ${i}`, host: "127.0.0.1", port: 21000 + i, user: "fixture", auth: { kind: "agent" } });
      expect(saved.ok, saved.error?.message).toBe(true);
      hosts.push(saved.data);
    }
    await openWorkspace(page);
    await page.getByRole("button", { name: "新建模板" }).click();
    const dialog = page.getByRole("dialog", { name: "新建工作区模板" });
    await dialog.getByLabel("模板名称").fill("开发工作区");
    await dialog.getByRole("button", { name: "保存模板" }).click();
    await expect(dialog.getByRole("alert")).toContainText("1 至 12");
    for (const host of hosts.slice(0, 3)) {
      await dialog.getByLabel("从主机目录选择").selectOption(host.id);
      await dialog.getByRole("button", { name: "加入主机" }).click();
    }
    await expect(dialog.getByRole("option", { name: /测试主机 1（/ })).toBeDisabled();
    await dialog.getByRole("button", { name: "上移 测试主机 3" }).click();
    await dialog.getByLabel("登录命令（可选）").first().fill("printf fixture");
    const preview = dialog.getByRole("region", { name: "布局预览" });
    for (const kind of ["one", "two", "three", "main-right", "main-bottom", "tabs", "custom"]) {
      await dialog.getByLabel("布局", { exact: true }).selectOption(kind);
      await expect(preview).toContainText(hosts[0]!.name);
    }
    await dialog.getByLabel("从分栏 1 开始的方向").selectOption("column");
    await dialog.getByLabel("首区比例（%）").first().fill("70");
    await dialog.getByRole("button", { name: "保存模板" }).click();
    await expect(page.getByRole("heading", { name: "开发工作区" })).toBeVisible();
    const file = readFileSync(path.join(vault, ".huhu/ssh/workspace-templates.json"), "utf8");
    expect(file).not.toMatch(/auth|credential|secretRef|sessionId|output/i);
    const listed = await sshCall<{ id: string; revision: string; panes: { hostId: string; loginCommand?: string }[]; layout: unknown }[]>(page, "ssh.workspace.templates.list");
    const saved = listed.data[0]!;
    expect(saved.panes.map(({ hostId }) => hostId)).toEqual([hosts[0]!.id, hosts[2]!.id, hosts[1]!.id]);
    expect(saved.panes[0]?.loginCommand).toBe("printf fixture");
    expect(saved.layout).toMatchObject({ kind: "custom", tree: { axis: "column", firstPercent: 70 } });
    for (const invalid of [
      { panes: [{ hostId: hosts[0]!.id }, { hostId: hosts[0]!.id }], layout: { kind: "two" } },
      { panes: hosts.map(({ id }) => ({ hostId: id })), layout: { kind: "three" } },
      { panes: hosts.slice(0, 2).map(({ id }) => ({ hostId: id })), layout: { kind: "custom", tree: { kind: "pane" } } },
      { panes: [{ hostId: hosts[0]!.id, password: "fixture-only" }], layout: { kind: "one" } },
    ]) {
      expect((await sshCall(page, "ssh.workspace.templates.save", { name: "无效模板", ...invalid })).ok).toBe(false);
    }
    const blocked = await sshCall(page, "ssh.hosts.delete", { id: hosts[0]!.id });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.message).toContain("开发工作区");
    await page.getByRole("button", { name: "编辑模板" }).click();
    await page.getByLabel("模板名称").fill("重命名工作区");
    await page.getByRole("button", { name: "保存模板" }).click();
    await expect(page.getByRole("heading", { name: "重命名工作区" })).toBeVisible();
    expect((await sshCall(page, "ssh.workspace.templates.delete", { id: saved.id, expectedRevision: saved.revision })).error?.code).toBe("VERSION_CONFLICT");
    await fixture.app.close();
    const reopened = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
    try {
      const fresh = await reopened.firstWindow();
      await openWorkspace(fresh);
      await fresh.getByRole("button", { name: "重命名工作区" }).click();
      await expect(fresh.getByRole("list", { name: "主机顺序" }).getByRole("listitem")).toHaveText(["测试主机 1", "测试主机 3", "测试主机 2"]);
      await fresh.getByRole("button", { name: "编辑模板" }).click();
      await expect(fresh.getByLabel("首区比例（%）").first()).toHaveValue("70");
      await fresh.getByRole("button", { name: "取消", exact: true }).click();
      await fresh.getByRole("button", { name: "删除模板" }).click();
      await fresh.getByRole("button", { name: "确认删除" }).click();
      await expect(fresh.getByText("暂无工作区模板")).toBeVisible();
      expect((await sshCall(fresh, "ssh.hosts.delete", { id: hosts[0]!.id })).ok).toBe(true);
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
  }
});
