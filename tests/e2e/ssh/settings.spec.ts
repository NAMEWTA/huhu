import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";
import type { CapabilityCatalogEntry } from "../../../packages/contracts/src/capability.js";

test("SSH preferences apply to workspace, terminal, file views and transfer queue", async () => {
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  server.fs.files.set("/home/test/.hidden", Buffer.from("hidden"));
  server.fs.files.set("/home/test/a-small", Buffer.from("small"));
  server.fs.files.set("/home/test/z-large", Buffer.alloc(450));
  const fixture = await openApp();
  try {
    const { page } = fixture;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "布局回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    const ssh = page.getByRole("button", { name: "远程连接", exact: true }).first();
    await ssh.click();
    const link = page.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true });
    await link.click();
    const settings = page.getByTestId("ssh-settings");
    await expect(settings).toBeVisible();
    const save = settings.getByRole("button", { name: "保存设置" });
    const search = settings.getByPlaceholder("搜索 SSH 设置");
    await search.fill("无匹配示例");
    await expect(settings.getByText("没有匹配的 SSH 设置")).toBeVisible();
    await search.clear();
    await settings.getByLabel("工作区标签方向").selectOption("left");
    await settings.getByLabel("分栏工具栏位置").selectOption("bottom");
    await settings.getByLabel("打开工作区时恢复上次视图").check();
    await save.click();
    await expect(settings.getByRole("status")).toHaveText("已保存到本机。");
    await settings.getByRole("button", { name: "文件与传输" }).click();
    await settings.getByLabel("显示以点开头的文件").uncheck();
    await settings.getByLabel("文件排序方式").selectOption("size");
    await settings.getByLabel("双栏默认将远端放在左侧").check();
    await settings.getByLabel("进入工作区时展开分栏文件").check();
    await settings.getByRole("button", { name: "保存本机文件设置" }).click();
    await expect(settings.getByText("已保存到本机。")).toBeVisible();
    await settings.getByLabel("并发传输数").fill("3");
    await settings.getByRole("button", { name: "保存库内设置" }).click();
    await expect(settings.getByText("已保存到当前库。")).toBeVisible();
    expect(await desktopCall(page, "ssh.transfers.list")).toMatchObject({ parallel: 3 });
    await search.fill("保活间隔");
    await settings.getByLabel("连接超时（秒）").fill("4");
    await settings.getByLabel("协议保活间隔（秒）").fill("0");
    await settings.getByRole("button", { name: "保存库内设置" }).click();
    await expect(settings.getByText("已保存到当前库。")).toBeVisible();
    expect(await desktopCall(page, "ssh.settings.get")).toMatchObject({ values: { connection: { connectTimeoutSec: 4, keepaliveIntervalSec: 0 }, transfer: { parallel: 3 } } });
    await search.clear();
    await settings.getByRole("button", { name: "终端" }).click();
    const font = settings.getByLabel("终端字号");
    await font.fill("19");
    await settings.getByRole("button", { name: "取消修改" }).click();
    await expect(font).toHaveValue("13");
    await font.fill("18");
    await settings.getByLabel("终端字体").selectOption("system");
    await save.click();
    await expect(settings.getByRole("status")).toHaveText("已保存到本机。");
    await settings.getByRole("button", { name: "恢复本类默认" }).click();
    await expect(font).toHaveValue("13");
    await settings.getByRole("button", { name: "取消修改" }).click();
    await expect(font).toHaveValue("18");
    await desktopCall(page, "ssh.workspace.runs.start", { name: "设备布局验收", layout: { kind: "tabs" }, panes: [{ hostId }] });
    await ssh.click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /设备布局验收.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(run.locator("[data-tab-side]")).toHaveAttribute("data-tab-side", "left");
    const tools = run.getByTestId("ssh-pane-tools");
    await expect(tools).toHaveAttribute("data-position", "bottom");
    const terminal = run.getByTestId("terminal-view");
    await expect(terminal).toHaveAttribute("data-state", "open");
    const scale = run.getByTestId("ssh-terminal-preferences").locator("[data-font]");
    expect(await scale.evaluate((el) => Number.parseFloat(getComputedStyle(el).zoom))).toBeCloseTo(18 / 13);
    await expect(scale).toHaveAttribute("data-font", "system");
    expect(await terminal.evaluate((el) => getComputedStyle(el).getPropertyValue("--font-mono"))).toContain("Consolas");
    const remoteTable = run.getByRole("table", { name: "远端目录项目" });
    await expect(remoteTable.getByRole("button", { name: "z-large", exact: true })).toBeVisible();
    await expect(remoteTable.getByRole("button", { name: ".hidden", exact: true })).toHaveCount(0);
    const visibleFiles = await remoteTable.getByRole("button", { name: /^(z-large|a-small)$/ }).allTextContents();
    expect(visibleFiles).toEqual(["z-large", "a-small"]);

    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    if (!(await run.isVisible())) {
      await ssh.click();
      await page.getByRole("button", { name: "工作区", exact: true }).click();
    }
    await expect(run).toHaveAttribute("data-generation", "1");
    await expect(terminal).toHaveAttribute("data-state", "open");
    await expect(scale).toHaveAttribute("data-font", "system");
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const independent = page.getByTestId("ssh-independent-files");
    await expect(independent.locator(".ssh-file-columns > section").first().getByRole("table", { name: "远端目录项目" })).toBeVisible();
    await independent.getByRole("button", { name: "交换左右位置" }).click();
    await expect(independent.locator(".ssh-file-columns > section").last().getByRole("table", { name: "远端目录项目" })).toBeVisible();
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("SSH settings reflect the shared gateway policy and provide redacted client samples", async () => {
  const fixture = await openApp();
  const { app, page, vault } = fixture;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const openSharedTools = async () => {
      await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
      await page.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true }).click();
      await page.getByTestId("ssh-settings").getByRole("button", { name: "MCP 与共享工具权限" }).click();
      return page.getByTestId("ssh-shared-tools");
    };
    const shared = await openSharedTools();
    await expect(shared.getByText("当前没有可开放的 SSH 工具。")).toBeVisible();
    await expect(shared.getByText("已关闭", { exact: true })).toBeVisible();
    await expect(shared.getByText("端点已关闭", { exact: true })).toBeVisible();
    const revision = shared.getByTestId("ssh-tool-policy-revision");
    const initial = await desktopCall<{ toolAccess: { revision: number } }>(page, "gateway.get");
    await expect(revision).toHaveText(String(initial.toolAccess.revision));
    await expect(desktopCall(page, "gateway.policy.preview", { changes: [{ capability: "ssh.hosts.list", exposed: true }] })).rejects.toThrow("INVALID_INPUT");

    const { id, token } = await desktopCall<{ id: string; token: string }>(page, "gateway.tokens.create", { name: "temporary MCP loopback fixture" });
    const url = await page.evaluate(async () => (await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string }> } }).huhuHost.engine()).baseUrl + "/mcp");
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const rpc = (method: string, params = {}) =>
      fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    expect((await rpc("tools/list")).status).toBe(404);
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    const gateway = page.getByTestId("gateway-module");
    const mcp = gateway.getByRole("switch", { name: "启用 MCP 服务" });
    await mcp.click();
    await expect(mcp).toBeChecked();
    await gateway.getByTestId("gateway-mcp-config").click();
    await page.getByTestId("gateway-mcp-dialog").getByLabel("传输方式").selectOption("http");
    await expect(page.getByTestId("gateway-mcp-dialog").getByLabel("传输方式")).toHaveValue("http");
    await page.getByTestId("gateway-mcp-dialog").getByRole("button", { name: "完成" }).click();
    const changes = [{ capability: "notes.list", exposed: true }];
    const preview = await desktopCall<{ revision: number; catalogRevision: string }>(page, "gateway.policy.preview", { changes });
    const saved = await desktopCall<{ revision: number }>(page, "gateway.policy.update", { changes, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision });
    expect(saved.revision).toBeGreaterThan(initial.toolAccess.revision);
    await openSharedTools();
    await expect(revision).toHaveText(String(saved.revision));
    await expect(shared.getByText("端点已启用，需要服务端令牌", { exact: true })).toBeVisible();
    await shared.getByText("客户端配置示例", { exact: true }).click();
    await shared.getByRole("button", { name: "复制 HTTP 示例" }).click();
    await expect(shared.getByText("已复制配置示例。")).toBeVisible();
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(JSON.parse(copied)).toEqual({ mcpServers: { huhu: { url, headers: { Authorization: "Bearer <在能力网关创建的令牌>" } } } });
    expect(copied.includes(token)).toBe(false);
    await shared.getByRole("button", { name: "复制 stdio 示例" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain("<当前库路径>");
    expect((await app.evaluate(({ clipboard }) => clipboard.readText())).includes(vault)).toBe(false);

    const listed = await rpc("tools/list");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ result: { tools: [{ name: "notes_list" }] } });
    const cli = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
    const { stdout } = await promisify(execFile)(process.execPath, [cli, "capabilities", "list", "--vault", vault, "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, data: [{ name: "notes.list" }] });
    const resolveSdk = createRequire(cli).resolve;
    const { Client } = await import(pathToFileURL(resolveSdk("@modelcontextprotocol/sdk/client/index.js")).href);
    const { StdioClientTransport } = await import(pathToFileURL(resolveSdk("@modelcontextprotocol/sdk/client/stdio.js")).href);
    const client = new Client({ name: "ssh-settings-fixture", version: "1" });
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", "--vault", vault] }));
      expect(await client.listTools()).toMatchObject({ tools: [{ name: "notes_list" }] });
    } finally {
      await client.close();
    }

    const denied = await rpc("tools/call", { name: "ssh_hosts_list", arguments: {} });
    expect(await denied.json()).toMatchObject({ result: { isError: true } });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    if (!(await shared.isVisible())) await openSharedTools();
    const audit = shared.locator("details").filter({ has: page.getByText("SSH 网关最近活动", { exact: true }) });
    await audit.locator("summary").click();
    await expect(audit.getByText("ssh.hosts.list", { exact: true })).toBeVisible();
    await desktopCall(page, "gateway.tokens.revoke", { id });
    await desktopCall(page, "plugins.setEnabled", { id: "ssh", enabled: false });
    const catalog = await desktopCall<CapabilityCatalogEntry[]>(page, "capabilities.list", { includeInactive: true });
    expect(catalog.find(({ name }) => name === "ssh.hosts.list")).toMatchObject({ availability: "plugin-disabled", exposable: false, exposed: false });
    await expect(page.getByRole("button", { name: "远程连接", exact: true })).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});
