import { spawnSync } from "node:child_process";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { PlanSummary } from "@huhu/contracts";
import { openApp } from "../helpers/launch.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND } from "../../../plugins/ssh/src/engine/monitor-sample.js";
import { CONTAINER_LIST, IMAGE_LIST, PROCESS_LIST } from "../../../plugins/ssh/src/engine/monitor-tools.js";
import type { MonitorPanel } from "../../../plugins/ssh/src/shared/monitoring.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { localPosixCommand } from "../../../plugins/ssh/test/shell-relay-fixture.js";
import { browserBinary, localWebLink } from "./workbench.js";

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

test("A11 native server tools keep the original shell and query the actual Docker socket", async () => {
  const docker = spawnSync("/bin/sh", ["-c", CONTAINER_LIST], { timeout: 5000, encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  test.skip(process.platform !== "linux" || docker.status !== 0, "需要 Linux 本机 Docker CLI 和可用的默认 Docker socket");
  let queries = 0;
  const first = await startFakeSsh({ onInteractiveExec(command, channel) {
    if (![PLATFORM_COMMAND, LINUX_SAMPLE, PROCESS_LIST, CONTAINER_LIST, IMAGE_LIST].includes(command)) return false;
    if (command === CONTAINER_LIST) queries++;
    localPosixCommand(channel, command);
    return true;
  } });
  const second = await startFakeSsh({ onExec(command) {
    if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
    if (command === CONTAINER_LIST) return { stdout: "abcdef012345|wrong-host-fixture|fixture|running" };
  } });
  const fixture = await openApp();
  try {
    const { app, page } = fixture;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const panes = [];
    for (const [name, port] of [["Docker 原端点", first.port], ["Docker 另一端点", second.port]] as const) {
      panes.push(await call<{ hostId: string }>(page, "ssh.hosts.configure", {
        name, host: "127.0.0.1", port, user: "fixture", authKind: "password", expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      }));
    }
    await call(page, "ssh.workspace.runs.start", {
      name: "Docker 原生工具", layout: { kind: "tabs" }, panes: panes.map(({ hostId }) => ({ hostId })),
    });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /Docker 原生工具.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏监控" }).click();
    const opening = app.waitForEvent("window");
    await run.getByRole("button", { name: "在新窗口打开服务器工具" }).click();
    const window = await opening;
    const tools = window.getByTestId("ssh-tool-window");
    const original = await run.getByRole("article", { name: "Docker 原端点" }).getAttribute("data-session-id");
    await expect(tools).toHaveAttribute("data-shell-id", original!);
    await expect(tools.getByRole("heading", { name: "Docker 原端点" })).toBeVisible();
    await run.getByRole("tab", { name: "Docker 另一端点" }).click();
    await run.getByRole("button", { name: "信任并连接" }).click();
    await tools.getByRole("button", { name: "容器" }).click();
    await expect.poll(() => queries).toBe(1);
    await expect(tools.getByRole("status")).toHaveText(/已读取 \d+ 条|没有可读取的条目/);
    await expect(tools).not.toContainText("wrong-host-fixture");
    const actualId = docker.stdout.trim().split("|")[0];
    if (actualId) await expect(tools.getByText(actualId, { exact: true })).toBeVisible();
    await window.close();
    await run.getByRole("tab", { name: "Docker 原端点" }).click();
    await expect(run.getByRole("article", { name: "Docker 原端点" })).toHaveAttribute("data-session-id", original!);
  } finally {
    await fixture.close();
    await Promise.all([first.close(), second.close()]);
  }
});

test("H9.3 原生服务器工具复用原窗口并只取消自身查询", async () => {
  const readingImages = Promise.withResolvers<void>();
  let imagesClosed = false;
  const a = await startFakeSsh({ onExec(command) {
    if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
    if (command === PROCESS_LIST) return { stdout: "21\t101\tprocess-a" };
    if (command === CONTAINER_LIST) return { stderr: "docker: not found", code: 127 };
  } });
  const b = await startFakeSsh({
    onExec(command) {
      if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
      if (command === PROCESS_LIST) return { stdout: "31\t102\tprocess-b" };
      if (command === CONTAINER_LIST) return { stderr: "permission denied", code: 1 };
    },
    onInteractiveExec(command, _channel, session) {
      if (command !== IMAGE_LIST) return false;
      session.once("close", () => { imagesClosed = true; });
      readingImages.resolve();
      return true;
    },
  });
  const fixture = await openApp();
  const { app, page } = fixture;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const panes = [];
    for (const [name, port] of [["工具甲", a.port], ["工具乙", b.port]] as const) {
      panes.push(await call<{ hostId: string }>(page, "ssh.hosts.configure", {
        name, host: "127.0.0.1", port, user: "fixture", authKind: "password", expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      }));
    }
    await call(page, "ssh.workspace.runs.start", { name: "工具窗口归属", layout: { kind: "tabs" }, panes: panes.map(({ hostId }) => ({ hostId })) });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /工具窗口归属.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const openTools = run.getByRole("button", { name: "在新窗口打开服务器工具", exact: true });
    const openWindow = () => Promise.all([app.waitForEvent("window"), openTools.click()]).then(([window]) => window);
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏监控", exact: true }).click();
    const windowA = await openWindow();
    const toolsA = windowA.getByTestId("ssh-tool-window");
    const sessionA = await run.getByRole("article", { name: "工具甲" }).getAttribute("data-session-id");
    await expect(toolsA).toHaveAttribute("data-shell-id", sessionA!);
    await expect(toolsA.getByRole("listitem")).toContainText("process-a");
    await toolsA.getByRole("button", { name: "容器", exact: true }).click();
    await expect(toolsA.getByRole("alert")).toHaveText("当前主机缺少 Docker 命令");

    await run.getByRole("tab", { name: "工具乙", exact: true }).click();
    await run.getByRole("button", { name: "信任并连接" }).click();
    const windowB = await openWindow();
    const toolsB = windowB.getByTestId("ssh-tool-window");
    const sessionB = await run.getByRole("article", { name: "工具乙" }).getAttribute("data-session-id");
    await expect(toolsB).toHaveAttribute("data-shell-id", sessionB!);
    expect(sessionB).not.toBe(sessionA);
    await expect(toolsB.getByRole("listitem")).toContainText("process-b");
    await toolsB.getByRole("button", { name: "容器", exact: true }).click();
    await expect(toolsB.getByRole("alert")).toHaveText("当前账户没有读取权限");

    await run.getByRole("tab", { name: "工具甲", exact: true }).click();
    await openTools.click();
    await expect.poll(() => windowA.evaluate(() => document.hasFocus())).toBe(true);
    await expect.poll(() => app.windows().filter((window) => window.url().includes("sshTools=1")).length).toBe(2);
    await expect(toolsA.getByRole("alert")).toHaveText("当前主机缺少 Docker 命令");
    await toolsB.getByRole("button", { name: "镜像", exact: true }).click();
    await readingImages.promise;
    await windowB.close();
    await expect.poll(() => imagesClosed, { timeout: 5000 }).toBe(true);
    await toolsA.getByRole("button", { name: "进程", exact: true }).click();
    await expect(toolsA.getByRole("listitem")).toContainText("process-a");
    await run.getByRole("tab", { name: "工具乙", exact: true }).click();
    await expect(run.getByRole("article", { name: "工具乙" })).toHaveAttribute("data-session-id", sessionB!);
    await expect(run.getByRole("article", { name: "工具乙" }).getByTestId("terminal-view")).toHaveAttribute("data-state", "open");
  } finally {
    await fixture.close();
    await Promise.all([a.close(), b.close()]);
  }
});

test("Workbench monitors a saved panel in the background and controls the active Pane separately", async () => {
  let reads = 0;
  let terminated = 0;
  let startTicks = "101";
  const server = await startFakeSsh({
    onExec(command) {
      if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
      if (command === PROCESS_LIST) return { stdout: `42\t${startTicks}\tmonitor-fixture` };
      if (command.endsWith("kill -TERM 42")) {
        if (!command.includes(`[ "$start" = '${startTicks}' ]`)) return { code: 3 };
        terminated++;
        return { code: 0 };
      }
      if (command === CONTAINER_LIST) return { stderr: "permission denied", code: 1 };
      if (command === IMAGE_LIST) return { stdout: "abcdef123456|monitor/fixture:stable|10MB" };
      if (command !== LINUX_SAMPLE) return;
      const sequence = 100 + ++reads;
      return { stdout: `cpu ${sequence * 25} ${sequence * 100}\ncpu0 ${sequence * 20} ${sequence * 40}\niface eth0 ${sequence * 80} ${sequence * 50}\nmemory 8388608 4194304\nuptime 3600\nload 1.25\ndisk 41943040 20971520\nnet ${sequence * 80} ${sequence * 50}\n` };
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
    const sshPlans = () => call<{ plans: PlanSummary[] }>(page, "automations.plans.list", {}).then(({ plans }) =>
      plans.filter(({ source }) => source.plugin === "ssh"));
    expect(await sshPlans()).toEqual([]);
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

    const [plan] = await sshPlans();
    expect(plan).toMatchObject({ title: "回环仪表盘", intent: "enabled", trigger: { kind: "interval", every: 2, unit: "seconds" } });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "计划", exact: true }).click();
    await expect(page.getByTestId("plan-directory").locator(`[data-plan-id="${plan!.planId}"]`)).toContainText("回环仪表盘");
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await call(page, "ssh.workspace.runs.start", { name: "分栏监控验收", layout: { kind: "tabs" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /分栏监控验收.*代次 1/ }).click();
    const workspace = page.getByTestId("ssh-workspace-run");
    await workspace.getByRole("button", { name: "分栏监控", exact: true }).click();
    const sidebar = workspace.getByTestId("ssh-monitor-sidebar");
    await expect(sidebar).toContainText("正在采样 · Linux", { timeout: 10_000 });
    await sidebar.getByText("CPU 核心与网络接口", { exact: true }).click();
    await expect(sidebar.getByText("CPU 0 · 50.0%", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText(/^eth0 · 接收 \d+ B\/s · 发送 \d+ B\/s$/)).toBeVisible();
    await sidebar.getByLabel("停靠位置").selectOption("left");
    await expect(workspace.locator("[data-dock]")).toHaveAttribute("data-dock", "left");
    await sidebar.getByLabel("采样周期").selectOption("1");
    await sidebar.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(sidebar.getByRole("status")).toHaveText(/已暂停/);
    await sidebar.getByText("样本历史", { exact: true }).click();
    await expect(sidebar.getByText("采样空隙")).toBeVisible();
    await sidebar.getByRole("button", { name: "继续", exact: true }).click();
    await expect(sidebar.getByRole("status")).toHaveText(/正在采样/);
    await sidebar.getByRole("button", { name: "服务器工具", exact: true }).click();
    const tools = page.getByRole("dialog", { name: "服务器工具" });
    await expect(tools.getByText("monitor-fixture", { exact: false })).toBeVisible();
    await tools.getByRole("button", { name: "终止进程 monitor-fixture 42" }).click();
    const confirmation = page.getByRole("dialog", { name: "确认终止进程" });
    await expect(confirmation).toContainText("PID 42");
    expect(terminated).toBe(0);
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    expect(terminated).toBe(0);
    await tools.getByRole("button", { name: "终止进程 monitor-fixture 42" }).click();
    startTicks = "102";
    await confirmation.getByRole("button", { name: "确认终止", exact: true }).click();
    await expect(confirmation.getByRole("alert")).toContainText("PID 已被复用");
    expect(terminated).toBe(0);
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    await tools.getByRole("button", { name: "刷新", exact: true }).click();
    await tools.getByRole("button", { name: "终止进程 monitor-fixture 42" }).click();
    await confirmation.getByRole("button", { name: "确认终止", exact: true }).click();
    await expect.poll(() => terminated).toBe(1);
    await tools.getByRole("button", { name: "容器" }).click();
    await expect(tools.getByRole("alert")).toHaveText("当前账户没有读取权限");
    await tools.getByRole("button", { name: "镜像" }).click();
    await expect(tools.getByRole("listitem")).toContainText("monitor/fixture:stable");
    await tools.getByRole("button", { name: "关闭", exact: true }).click();
    await sidebar.getByRole("button", { name: "关闭监控" }).click();
    await expect(sidebar).toHaveCount(0);
    await expect(workspace.getByTestId("ssh-workspace-run-pane")).toHaveAttribute("data-phase", "ready");
    expect(server.conns).toHaveLength(2);
  } finally {
    await app.close();
    await server.close();
  }
});

test("A11 独立 Web 查看两个主机的桌面采样，采样控制由桌面管理", async () => {
  test.skip(!browserBinary, "需要 Playwright Chromium");
  test.setTimeout(60_000);
  function source(percent: number) {
    let reads = 0;
    return startFakeSsh({
      onExec(command) {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
        if (command === LINUX_SAMPLE) {
          const n = 100 + ++reads;
          return { stdout: `cpu ${n * percent} ${n * 100}\ncpu0 ${n * percent} ${n * 100}\nmemory 8192 4096` };
        }
      },
    });
  }
  const a = await source(25);
  const b = await source(65);
  const app = await openApp();
  let browser: Browser | undefined;
  try {
    const { page } = app;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const save = (name: string, port: number) => call<{ hostId: string }>(page, "ssh.hosts.configure", {
      name, port, host: "127.0.0.1", user: "fixture", authKind: "password", expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: "pw" }],
    });
    const [first, second] = [await save("监控甲", a.port), await save("监控乙", b.port)];
    const panel = await call<MonitorPanel>(page, "ssh.monitor.panels.save", {
      name: "浏览器监控面板", hostIds: [first.hostId, second.hostId], note: "", interval: 2, retention: 15,
    });
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary });
    const web = await browser.newPage();
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    await web.getByRole("button", { name: "远程连接", exact: true }).first().click();
    const openMonitoring = web.getByTestId("ssh-module").getByRole("button", { name: "监控", exact: true });
    await expect(openMonitoring).toBeVisible();
    await openMonitoring.click();
    const dashboard = web.getByTestId("ssh-monitor-dashboard");
    await expect(dashboard.getByText("未开始", { exact: true })).toHaveCount(2);
    await expect(dashboard.getByRole("button", { name: "开始监控", exact: true })).toHaveCount(0);
    await expect(dashboard.getByRole("button", { name: "新建面板", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "监控", exact: true }).click();
    const desktopDashboard = page.getByTestId("ssh-monitor-dashboard");
    await desktopDashboard.getByRole("button", { name: "开始监控", exact: true }).click();
    for (const [name, percent] of [["监控甲", "25.0%"], ["监控乙", "65.0%"]] as const) {
      const desktopHost = desktopDashboard.getByTestId("ssh-monitor-host").filter({ has: page.getByRole("heading", { name, exact: true }) });
      await desktopHost.getByRole("button", { name: "核对主机指纹" }).click();
      await page.getByRole("button", { name: "信任并连接" }).click();
      const webHost = dashboard.getByTestId("ssh-monitor-host").filter({ has: web.getByRole("heading", { name, exact: true }) });
      await expect(webHost.getByRole("definition").getByText(percent, { exact: true })).toBeVisible({ timeout: 12_000 });
      await webHost.getByText("样本历史", { exact: true }).click();
      await expect(webHost.getByRole("table")).toContainText(percent);
    }
    await expect(dashboard.getByRole("button", { name: "暂停监控", exact: true })).toHaveCount(0);
    const desktopPanel = await call<{ hosts: { state: string }[] }>(page, "ssh.monitor.panels.run", { id: panel.id });
    expect(desktopPanel.hosts.map(({ state }) => state)).toEqual(["running", "running"]);
    expect([a.conns.length, b.conns.length]).toEqual([1, 1]);
  } finally {
    try {
      await browser?.close();
    } finally {
      await app.close();
      await Promise.all([a.close(), b.close()]);
    }
  }
});
