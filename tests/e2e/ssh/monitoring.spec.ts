import { expect, test, type Page } from "@playwright/test";
import { openApp } from "../../../tests/e2e/helpers/launch.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND } from "../src/engine/monitor-sample.js";
import { startFakeSsh } from "../test/fake-server.js";

async function call<T>(page: Page, capability: string, input: unknown) {
  const result = await page.evaluate(
    async ({ capability, input }) => {
      const { baseUrl, token } = await window.huhuHost.engine();
      const response = await fetch(`${baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return response.json();
    },
    { capability, input },
  );
  expect(result.ok, result.error?.message).toBe(true);
  return result.data as T;
}

test("Workbench monitors a saved panel in the background and controls the active Pane separately", async () => {
  let reads = 0;
  const server = await startFakeSsh({
    onExec(command) {
      if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
      if (command !== LINUX_SAMPLE) return;
      const sequence = 100 + ++reads;
      return { stdout: `cpu ${sequence * 25} ${sequence * 100}\nmemory 8388608 4194304\nuptime 3600\nload 1.25\ndisk 41943040 20971520\nnet ${sequence * 80} ${sequence * 50}\n` };
    },
  });
  const app = await openApp();
  try {
    const { page } = app;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await call<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "回环 Linux 监控",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: "pw" }],
    });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "监控", exact: true }).click();
    const dashboard = page.getByTestId("ssh-monitor-dashboard");
    await dashboard.getByRole("button", { name: "新建面板" }).click();
    const editor = page.getByRole("dialog", { name: "新建监控面板" });
    await editor.getByLabel("面板名称").fill("回环仪表盘");
    await editor.getByLabel("采样周期").selectOption("2");
    await editor.getByLabel("保留历史").selectOption("60");
    await editor.getByRole("checkbox", { name: /回环 Linux 监控/ }).check();
    await editor.getByRole("button", { name: "保存面板" }).click();
    await expect(dashboard.getByText("历史 1 小时", { exact: false })).toBeVisible();
    expect(reads).toBe(0);
    expect(server.conns).toHaveLength(0);
    await dashboard.getByRole("button", { name: "开始监控" }).click();
    await dashboard.getByRole("button", { name: "核对主机指纹" }).click();
    await page.getByRole("button", { name: "信任并连接" }).click();
    await expect(dashboard.locator("dd").filter({ hasText: /^25\.0%$/ })).toBeVisible({ timeout: 10_000 });
    await dashboard.getByRole("button", { name: "返回 SSH" }).click();
    await expect(dashboard).toHaveCount(0);
    const before = reads;
    await expect.poll(() => reads).toBeGreaterThan(before);

    await call(page, "ssh.workspace.runs.start", { name: "分栏监控验收", layout: { kind: "tabs" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /分栏监控验收.*代次 1/ }).click();
    const workspace = page.getByTestId("ssh-workspace-run");
    await workspace.getByRole("button", { name: "分栏监控", exact: true }).click();
    const sidebar = workspace.getByTestId("ssh-monitor-sidebar");
    await expect(sidebar).toContainText("正在采样 · Linux", { timeout: 10_000 });
    await sidebar.getByLabel("停靠位置").selectOption("left");
    await expect(workspace.locator("[data-dock]")).toHaveAttribute("data-dock", "left");
    await sidebar.getByLabel("采样周期").selectOption("1");
    await sidebar.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(sidebar.getByRole("status")).toHaveText(/已暂停/);
    await sidebar.getByText("样本历史", { exact: true }).click();
    await expect(sidebar.getByText("采样空隙")).toBeVisible();
    await sidebar.getByRole("button", { name: "继续", exact: true }).click();
    await expect(sidebar.getByRole("status")).toHaveText(/正在采样/);
    await sidebar.getByRole("button", { name: "关闭监控" }).click();
    await expect(sidebar).toHaveCount(0);
    await expect(workspace.getByTestId("ssh-workspace-run-pane")).toHaveAttribute("data-phase", "ready");
    expect(server.conns).toHaveLength(2);
  } finally {
    await app.close();
    await server.close();
  }
});
