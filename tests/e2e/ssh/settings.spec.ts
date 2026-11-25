import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { chromium, expect, test, type Browser } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";
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
    await settings.getByLabel("工具栏顺序").selectOption("monitor-first");
    await settings.getByLabel("纵向标签按同目标分组").check();
    await search.fill("工具栏尺寸");
    await settings.getByLabel("工具栏尺寸").selectOption("large");
    await search.clear();
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
    await settings.getByLabel("终端行距").selectOption("roomy");
    const cursor = settings.getByLabel("终端光标样式");
    await cursor.selectOption("underline");
    await settings.getByLabel("终端光标闪烁").uncheck();
    const scrollback = settings.getByLabel("终端回滚行数");
    await scrollback.selectOption("10000");
    const separator = settings.getByLabel("终端选词分隔符");
    const links = settings.getByLabel("允许在终端打开链接");
    await separator.fill(" _");
    await links.uncheck();
    const [localShell] = await desktopCall<{ id: string }[]>(page, "ssh.local.environments");
    expect(localShell).toBeDefined();
    await search.fill("本地 shell");
    await settings.getByLabel("默认本地 Shell").selectOption(localShell!.id);
    await search.clear();
    await save.click();
    await expect(settings.getByRole("status")).toHaveText("已保存到本机。");
    await settings.getByRole("button", { name: "恢复本类默认" }).click();
    await expect(font).toHaveValue("13");
    await expect(cursor).toHaveValue("block");
    await expect(scrollback).toHaveValue("5000");
    await expect(separator).toHaveValue(" ()[]{}',\"`");
    await expect(links).toBeChecked();
    await settings.getByRole("button", { name: "取消修改" }).click();
    await expect(font).toHaveValue("18");
    await expect(cursor).toHaveValue("underline");
    await expect(scrollback).toHaveValue("10000");
    await expect(separator).toHaveValue(" _");
    await expect(links).not.toBeChecked();
    await desktopCall(page, "ssh.workspace.runs.start", { name: "设备布局验收", layout: { kind: "tabs" }, panes: [{ hostId }] });
    await ssh.click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /设备布局验收.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(run.locator("[data-tab-side]")).toHaveAttribute("data-tab-side", "left");
    const tools = run.getByTestId("ssh-pane-tools");
    await expect(tools).toHaveAttribute("data-position", "bottom");
    await expect(tools).toHaveAttribute("data-size", "large");
    await expect(tools.getByRole("group").getByRole("button")).toHaveText(["分栏监控", "分栏文件"]);
    const terminal = run.getByTestId("terminal-view");
    await expect(terminal).toHaveAttribute("data-state", "open");
    const scale = run.getByTestId("ssh-terminal-preferences").locator("[data-font]");
    expect(await scale.evaluate((el) => Number.parseFloat(getComputedStyle(el).zoom))).toBeCloseTo(18 / 13);
    await expect(scale).toHaveAttribute("data-font", "system");
    expect(await terminal.evaluate((el) => getComputedStyle(el).getPropertyValue("--font-mono"))).toContain("Consolas");
    await terminal.locator(".xterm-helper-textarea").focus();
    const activeCursor = terminal.locator(".xterm-cursor");
    await expect(activeCursor).toHaveClass(/xterm-cursor-underline/);
    await expect(activeCursor).not.toHaveClass(/xterm-cursor-blink/);
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
    const fileWorkspace = page.getByTestId("ssh-file-workspace");
    const independent = fileWorkspace.getByTestId("ssh-independent-files");
    await expect(independent.locator(".ssh-file-columns > section").first().getByRole("table", { name: "远端目录项目" })).toBeVisible();
    await independent.getByRole("button", { name: "交换左右位置" }).click();
    await expect(independent.locator(".ssh-file-columns > section").last().getByRole("table", { name: "远端目录项目" })).toBeVisible();
    await fileWorkspace.getByRole("button", { name: "返回 SSH", exact: true }).click();
    await expect(fileWorkspace).toBeHidden();
    await expect(run).toBeVisible();
    await page.getByTestId("ssh-workspace-library").getByRole("button", { name: "主机", exact: true }).click();
    await page.getByRole("button", { name: "本地终端", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "启动环境" })).toHaveValue(localShell!.id);
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("SSH settings reflect the shared gateway policy and provide redacted client samples", async () => {
  const fixture = await openApp();
  const { app, page, vault } = fixture;
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  const resource = "ssh.resources.host.get";
  const statuses = "ssh.connections.status";
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId, revision: hostRevision } = await desktopCall<{ hostId: string; revision: string }>(page, "ssh.hosts.configure", {
      name: "外部只读目录回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture-user",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    const host = await desktopCall(page, resource, { hostId });
    const openSharedTools = async () => {
      await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
      await page.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true }).click();
      await page.getByTestId("ssh-settings").getByRole("button", { name: "MCP 与共享工具权限" }).click();
      return page.getByTestId("ssh-shared-tools");
    };
    const shared = await openSharedTools();
    await expect(shared.getByText("在能力网关的 MCP 工具目录更改可开放工具的选择。")).toBeVisible();
    await expect(shared.getByText("端点已关闭", { exact: true })).toBeVisible();
    const revision = shared.getByTestId("ssh-tool-policy-revision");
    const initial = await desktopCall<{ toolAccess: { revision: number } }>(page, "gateway.get");
    await expect(revision).toHaveText(String(initial.toolAccess.revision));
    await expect(desktopCall(page, "gateway.policy.preview", { changes: [{ capability: "ssh.fileSessions.localList", exposed: true }] })).rejects.toThrow("INVALID_INPUT");

    const { id, token } = await desktopCall<{ id: string; token: string }>(page, "gateway.tokens.create", { name: "temporary MCP loopback fixture" });
    const url = await page.evaluate(async () => (await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string }> } }).huhuHost.engine()).baseUrl + "/mcp");
    expect(new URL(url).hostname).toBe("127.0.0.1");
    let session: string | undefined;
    const rpc = (method: string, params = {}) => mcpRequest(url, token, mcpRpc(method, params), session);
    expect((await rpc("tools/list")).status).toBe(404);
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    const gateway = page.getByTestId("gateway-module");
    const grants = gateway.getByRole("form", { name: "允许外部工具访问的 SSH 主机" });
    const grant = grants.getByRole("checkbox", { name: /^外部只读目录回环/ });
    await expect(grant).not.toBeChecked();
    await grant.check();
    await grants.getByRole("button", { name: "保存主机授权" }).click();
    await expect(grants.getByRole("status")).toContainText("已保存 SSH 主机授权");
    const mcp = gateway.getByRole("switch", { name: "启用 MCP 服务" });
    await mcp.click();
    await expect(mcp).toBeChecked();
    await gateway.getByTestId("gateway-mcp-config").click();
    await expect(page.getByTestId("gateway-mcp-dialog").getByLabel("本机端口")).toHaveValue(new URL(url).port);
    await page.getByTestId("gateway-mcp-dialog").getByRole("button", { name: "保存端口" }).click();
    const changes = [
      { capability: "notes.list", exposed: true },
      { capability: resource, exposed: true },
      { capability: statuses, exposed: true },
    ];
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

    session = await openMcpSession(url, token);
    const listed = await rpc("tools/list");
    expect(listed.status).toBe(200);
    const tool = "ssh_resources_host_get";
    const statusTool = "ssh_connections_status";
    expect(await listed.json()).toMatchObject({ result: { tools: expect.arrayContaining(["notes_list", tool, statusTool].map((name) => expect.objectContaining({ name }))) } });
    expect(await (await rpc("tools/call", { name: tool, arguments: { hostId } })).json()).toMatchObject({ result: { structuredContent: { data: host } } });
    expect(await (await rpc("tools/call", { name: statusTool, arguments: {} })).json()).toMatchObject({ result: { structuredContent: { data: [] } } });
    const cli = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
    const { stdout } = await promisify(execFile)(process.execPath, [cli, "capabilities", "list", "--vault", vault, "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ name: "notes.list" }), expect.objectContaining({ name: resource })]) });
    const cliRead = await promisify(execFile)(process.execPath, [cli, "call", resource, "--vault", vault, "--input-json", JSON.stringify({ hostId }), "--json"]);
    expect(JSON.parse(cliRead.stdout)).toEqual({ ok: true, data: host });
    expect(cliRead.stdout).not.toContain(password);
    const resolveSdk = createRequire(cli).resolve;
    const { Client } = await import(pathToFileURL(resolveSdk("@modelcontextprotocol/sdk/client/index.js")).href);
    const { StreamableHTTPClientTransport } = await import(pathToFileURL(resolveSdk("@modelcontextprotocol/sdk/client/streamableHttp.js")).href);
    const client = new Client({ name: "ssh-settings-fixture", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
      expect(await client.listTools()).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: tool })]) });
      expect(await client.callTool({ name: tool, arguments: { hostId } })).toMatchObject({ structuredContent: { data: host } });
    } finally {
      await client.close();
    }

    expect(server.conns).toHaveLength(0);
    await desktopCall(page, "gateway.update", { capability: statuses, exposed: false });
    expect(await (await rpc("tools/call", { name: statusTool, arguments: {} })).json()).toMatchObject({ result: { isError: true } });
    await desktopCall(page, "gateway.update", { capability: resource, exposed: false });
    expect(await (await rpc("tools/call", { name: tool, arguments: { hostId } })).json()).toMatchObject({ result: { isError: true } });
    const denied = await rpc("tools/call", { name: "ssh_hosts_list", arguments: {} });
    expect(await denied.json()).toMatchObject({ result: { isError: true } });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    if (!(await shared.isVisible())) await openSharedTools();
    const audit = shared.locator("details").filter({ has: page.getByText("SSH 网关最近活动", { exact: true }) });
    await audit.locator("summary").click();
    await expect(audit.getByText("ssh.hosts.list", { exact: true })).toBeVisible();
    await desktopCall(page, "gateway.tokens.revoke", { id });
    await desktopCall(page, "ssh.hosts.remove", { hostId, expectedRevision: hostRevision });
    await desktopCall(page, "plugins.setEnabled", { id: "ssh", enabled: false });
    const catalog = await desktopCall<CapabilityCatalogEntry[]>(page, "capabilities.list", { includeInactive: true });
    expect(catalog.find(({ name }) => name === "ssh.hosts.list")).toMatchObject({ availability: "plugin-disabled", exposable: true, exposed: false });
    expect(catalog.find(({ name }) => name === resource)).toMatchObject({ availability: "plugin-disabled", exposable: true, exposed: false, scope: "read" });
    await expect(page.getByRole("button", { name: "远程连接", exact: true })).toHaveCount(0);
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("SSH host grants are editable from desktop and invited browser workbenches", async () => {
  test.skip(!browserBinary, "需要 Playwright Chromium 或 Microsoft Edge");
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const host = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", { name: "共享授权回环", host: "127.0.0.1", user: "fixture", authKind: "agent", expectedRevision: null });
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary, headless: true });
    const web = await browser.newPage();
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    for (const view of [page, web]) {
      await view.getByRole("button", { name: "能力网关", exact: true }).first().click();
      await view.getByRole("tab", { name: "MCP" }).click();
    }
    const form = (view: typeof page) => view.getByRole("form", { name: "允许外部工具访问的 SSH 主机" });
    const checkbox = (view: typeof page) => form(view).getByRole("checkbox", { name: /^共享授权回环/ });
    const save = async (view: typeof page) => {
      await form(view).getByRole("button", { name: "保存主机授权" }).click();
      await expect(form(view).getByRole("status")).toContainText("已保存 SSH 主机授权");
    };
    await expect(checkbox(page)).not.toBeChecked();
    await expect(checkbox(web)).not.toBeChecked();
    await checkbox(page).check();
    await save(page);
    await expect(checkbox(web)).toBeChecked();
    expect(await desktopCall(page, "gateway.get")).toMatchObject({ toolAccess: { resources: { "ssh.hosts": [host.hostId] } } });
    await checkbox(web).uncheck();
    await save(web);
    await expect(checkbox(page)).not.toBeChecked();
    await checkbox(web).check();
    await save(web);
    await expect(checkbox(page)).toBeChecked();
    await checkbox(page).uncheck();
    await save(page);
    await expect(checkbox(web)).not.toBeChecked();
    expect(await desktopCall(page, "gateway.get")).toMatchObject({ toolAccess: { resources: { "ssh.hosts": [] } } });

    const shared = async (view: typeof page) => {
      await view.getByRole("button", { name: "远程连接", exact: true }).first().click();
      await view.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true }).click();
      await view.getByTestId("ssh-settings").getByRole("button", { name: "MCP 与共享工具权限" }).click();
      const section = view.getByTestId("ssh-shared-tools");
      await section.getByText(/^SSH 能力目录/).click();
      await section.getByRole("textbox", { name: "搜索 SSH 能力" }).fill("ssh.resources.host.get");
      return section;
    };
    expect(await web.evaluate(() => "huhuHost" in window)).toBe(false);
    const desktopTools = await shared(page);
    const webTools = await shared(web);
    const tool = (section: typeof webTools) => section.getByRole("listitem").filter({ hasText: "ssh.resources.host.get" });
    await expect(tool(webTools)).toContainText("工具未开放");
    const changed = await desktopCall<{ revision: number }>(page, "gateway.update", { capability: "ssh.resources.host.get", exposed: true });
    for (const section of [desktopTools, webTools]) {
      await expect(section.getByTestId("ssh-tool-policy-revision")).toHaveText(String(changed.revision));
      await expect(tool(section)).toContainText("已开放，MCP 已关闭");
    }
  } finally {
    await browser?.close();
    await close();
  }
});
