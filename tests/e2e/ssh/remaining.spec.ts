import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ManagedHost } from "../../../plugins/ssh/src/ui/host-record.js";
import type { RecordingContent, RecordingSummary } from "../../../plugins/ssh/src/shared/recordings.js";
import type { ConnectionStatus } from "../../../plugins/ssh/src/shared/trust.js";
import type { WorkspaceRun } from "../../../plugins/ssh/src/shared/workspace.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

async function openSsh(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
  await expect(page.getByTestId("ssh-module")).toBeVisible();
}

async function approve(page: Page, hostId: string) {
  let prompt: Extract<ConnectionStatus, { prompt: unknown }>["prompt"] | undefined;
  await expect
    .poll(async () => {
      const statuses = await desktopCall<ConnectionStatus[]>(page, "ssh.connections.status");
      const status = statuses.find((entry) => entry.hostId === hostId);
      prompt = status?.state === "waiting" ? status.prompt : undefined;
      return Boolean(prompt);
    })
    .toBe(true);
  if (!prompt) throw new Error("回环夹具没有待答指纹");
  await desktopCall(page, "ssh.hostKey.decide", { attemptId: prompt.attemptId, promptId: prompt.promptId, hop: prompt.hop, accept: true, remember: true });
}

function saveHost(page: Page, name: string, port: number, password: string) {
  return desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
    name,
    host: "127.0.0.1",
    port,
    user: "fixture",
    authKind: "password",
    expectedRevision: null,
    credentials: [{ action: "replace", purpose: "password", value: password }],
  });
}

test("SSH 密钥库生成公开摘要，草稿测试可达后由字段修改清除", async () => {
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  const app = await openApp();
  const { page } = app;
  try {
    await openSsh(page);
    await page.getByRole("button", { name: "密钥", exact: true }).click();
    await page.getByRole("button", { name: "生成 Ed25519" }).click();
    const generation = page.getByRole("dialog", { name: "生成 Ed25519 密钥" });
    await generation.getByLabel("名称").fill("合成密钥");
    await generation.getByRole("button", { name: "保存密钥" }).click();
    await expect(generation).toBeHidden();
    await expect(page.getByText(/ssh-ed25519 SHA256:/)).toBeVisible();
    await page.getByRole("button", { name: "返回主机" }).click();

    await page.getByRole("button", { name: "新增 SSH 主机", exact: true }).click();
    const dialog = page.getByTestId("ssh-host-dialog");
    await dialog.getByLabel("主机名或 IP").fill("127.0.0.1");
    await dialog.getByLabel("端口", { exact: true }).fill(String(server.port));
    await dialog.getByLabel("用户名").fill("fixture");
    await dialog.getByLabel("密码", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("第 1 跳可达");
    await dialog.getByLabel("用户名").fill("edited");
    await expect(dialog.getByRole("status")).toBeEmpty();
    expect(await desktopCall(page, "ssh.hosts.list")).toEqual([]);
    expect(await desktopCall(page, "ssh.shells.list")).toEqual([]);
    expect(await desktopCall(page, "ssh.connections.status")).toEqual([]);
  } finally {
    await app.close();
    await server.close();
  }
});

test("交换、最大化和关闭 SSH 分栏时，其他分栏保留原会话", async () => {
  const password = randomUUID();
  const leftInput: string[] = [];
  const rightInput: string[] = [];
  const left = await startFakeSsh({ password, onShellInput: (chunk) => leftInput.push(chunk) });
  const right = await startFakeSsh({ password, onShellInput: (chunk) => rightInput.push(chunk) });
  const app = await openApp();
  const { page } = app;
  try {
    await openSsh(page);
    const a = await saveHost(page, "左侧夹具", left.port, password);
    const b = await saveHost(page, "右侧夹具", right.port, password);
    const started = await desktopCall<WorkspaceRun>(page, "ssh.workspace.runs.start", { name: "分栏验收", layout: { kind: "two" }, panes: [{ hostId: a.hostId }, { hostId: b.hostId }] });
    await approve(page, a.hostId);
    await approve(page, b.hostId);
    await expect.poll(async () => (await desktopCall<WorkspaceRun[]>(page, "ssh.workspace.runs.list"))[0]?.panes.map((pane) => pane.phase)).toEqual(["ready", "ready"]);
    const original = (await desktopCall<WorkspaceRun[]>(page, "ssh.workspace.runs.list"))[0]!;
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /分栏验收/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await expect(run).toHaveAttribute("data-run-id", started.id);
    const panes = run.getByTestId("ssh-workspace-run-pane");
    await expect(panes.first()).toHaveAttribute("data-session-id", original.panes[0]!.sessionId!);
    await test.step("快捷文本只送到有输入控制的选中分栏，回车由用户单独确认", async () => {
      const leftTarget = run.getByRole("checkbox", { name: /左侧夹具/ });
      await run.getByText("快捷文本与广播", { exact: true }).click();
      await leftTarget.check();
      const shortcut = run.getByRole("textbox", { name: "快捷文本" });
      const preview = run.getByRole("button", { name: "预览", exact: true });
      await shortcut.fill("fixture-insert-only");
      await preview.click();
      expect(leftInput.join("")).not.toContain("fixture-insert-only");
      await run.getByRole("button", { name: "插入", exact: true }).click();
      await expect.poll(() => leftInput.join("")).toContain("fixture-insert-only");
      expect(leftInput.join("")).not.toContain("fixture-insert-only\r");
      expect(rightInput.join("")).not.toContain("fixture-insert-only");

      await shortcut.fill("fixture-send-enter");
      await preview.click();
      await run.getByRole("button", { name: "发送并回车", exact: true }).click();
      await expect.poll(() => leftInput.join("")).toContain("fixture-send-enter\r");
      expect(rightInput.join("")).not.toContain("fixture-send-enter");

      await panes.first().getByRole("button", { name: "锁定输入", exact: true }).click();
      await expect(leftTarget).toBeDisabled();
      await panes.first().getByRole("button", { name: "解除输入锁定", exact: true }).click();
      await expect(leftTarget).toBeEnabled();
    });
    await run.getByRole("button", { name: "与后一分栏交换" }).click();
    await expect(panes.first()).toHaveAttribute("data-session-id", original.panes[1]!.sessionId!);
    await expect(panes.last()).toHaveAttribute("data-session-id", original.panes[0]!.sessionId!);
    await run.getByRole("button", { name: "最大化活动分栏" }).click();
    await expect(panes.first()).toBeHidden();
    await expect(panes.last()).toBeVisible();
    await run.getByRole("button", { name: "还原分栏" }).click();
    await run.getByRole("button", { name: "关闭活动分栏" }).click();
    await expect(run.getByTestId("ssh-workspace-run-pane")).toHaveCount(1);
    await expect(run.getByTestId("ssh-workspace-run-pane")).toHaveAttribute("data-session-id", original.panes[1]!.sessionId!);
    expect([left.conns.length, right.conns.length]).toEqual([1, 1]);
  } finally {
    await app.close();
    await left.close();
    await right.close();
  }
});

test("H5.3 回放已停止的录制，可暂停并按时间定位，切换 Shell 保持隔离", async () => {
  const password = randomUUID();
  const leftInput: string[] = [];
  const rightInput: string[] = [];
  const left = await startFakeSsh({ password, onShellInput: (text) => leftInput.push(text) });
  const right = await startFakeSsh({ password, onShellInput: (text) => rightInput.push(text) });
  const app = await openApp();
  const { page } = app;
  let clockInstalled = false;
  try {
    await openSsh(page);
    const a = await saveHost(page, "录制甲", left.port, password);
    const b = await saveHost(page, "录制乙", right.port, password);
    await desktopCall<WorkspaceRun>(page, "ssh.workspace.runs.start", { name: "会话录制夹具", layout: { kind: "two" }, panes: [{ hostId: a.hostId }, { hostId: b.hostId }] });
    await approve(page, a.hostId);
    await approve(page, b.hostId);
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /会话录制夹具/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const panes = run.getByTestId("ssh-workspace-run-pane");
    await expect(panes.first()).toHaveAttribute("data-phase", "ready");
    await expect(panes.last()).toHaveAttribute("data-phase", "ready");
    const leftShell = (await panes.first().getAttribute("data-session-id"))!;
    const rightShell = (await panes.last().getAttribute("data-session-id"))!;
    const recordings = (shellId: string) => desktopCall<RecordingSummary[]>(page, "ssh.recordings.list", { shellId });
    const read = (id: string) => desktopCall<RecordingContent>(page, "ssh.recordings.read", { id });
    await run.getByText("快捷文本与广播", { exact: true }).click();
    const send = async (target: string, text: string) => {
      const destinations = run.getByRole("checkbox", { name: /录制[甲乙]/ });
      for (const destination of await destinations.all()) await destination.uncheck();
      await run.getByRole("checkbox", { name: new RegExp(target) }).check();
      await run.getByRole("textbox", { name: "快捷文本" }).fill(text);
      await run.getByRole("button", { name: "预览", exact: true }).click();
      await run.getByRole("button", { name: "发送并回车", exact: true }).click();
    };

    await send("录制甲", "录制前");
    await expect.poll(() => leftInput.join("")).toContain("录制前");
    expect(await recordings(leftShell)).toEqual([]);
    await panes.first().getByRole("button", { name: "开始录制", exact: true }).click();
    await expect(panes.first().getByRole("button", { name: "停止录制", exact: true })).toBeVisible();
    const leftRecording = (await recordings(leftShell))[0]?.id;
    if (!leftRecording) throw new Error("录制甲未启动");
    await send("录制甲", "第一段🙂");
    await expect.poll(async () => (await read(leftRecording)).text).toContain("第一段🙂");
    // Separate the output times by more than one renderer timer tick.
    await delay(200);
    await send("录制甲", "第二段<b>文本</b> https://example.invalid/fixture");
    await expect.poll(async () => (await read(leftRecording)).text).toContain("https://example.invalid/fixture");
    await panes.first().getByRole("button", { name: "停止录制", exact: true }).click();
    await expect.poll(async () => (await read(leftRecording)).summary.reason).toBe("stopped");
    await send("录制甲", "停止之后");
    await expect.poll(() => leftInput.join("")).toContain("停止之后");

    await panes.last().getByRole("button", { name: "开始录制", exact: true }).click();
    await expect(panes.last().getByRole("button", { name: "停止录制", exact: true })).toBeVisible();
    const rightRecording = (await recordings(rightShell))[0]?.id;
    if (!rightRecording) throw new Error("录制乙未启动");
    await send("录制乙", "乙侧独立输出");
    await expect.poll(async () => (await read(rightRecording)).text).toContain("乙侧独立输出");
    await panes.last().getByRole("button", { name: "停止录制", exact: true }).click();
    await expect.poll(async () => (await read(rightRecording)).summary.reason).toBe("stopped");
    const leftContent = await read(leftRecording);
    const firstAt = leftContent.timeline?.checkpoints.find(({ end }) => leftContent.text.slice(0, end).includes("第一段🙂"))?.atMs;
    if (firstAt === undefined || !leftContent.timeline) throw new Error("录制甲缺少完整的时间轴");
    const inputsBeforePlayback = [leftInput.join(""), rightInput.join("")];

    await page.getByTestId("ssh-workspace-library").getByRole("button", { name: "主机", exact: true }).click();
    await page.getByRole("button", { name: "会话日志", exact: true }).click();
    const sessions = page.getByRole("combobox", { name: "Shell 会话" });
    await sessions.selectOption(leftShell);
    await page.getByRole("button", { name: /已停止/ }).click();
    const output = page.locator(".ssh-recording-text");
    await expect(output).toContainText("第二段<b>文本</b>");
    await expect(output.locator("b")).toHaveCount(0);
    await expect(output).not.toContainText(/录制前|停止之后|乙侧独立输出/);
    await expect(page.getByRole("link", { name: "https://example.invalid/fixture" })).toBeVisible();
    await page.getByRole("textbox", { name: "在此录制内查找…" }).fill("第二段");
    await expect(output.locator("mark")).toHaveText("第二段");

    const slider = page.getByRole("slider", { name: "回放进度" });
    const play = page.getByRole("button", { name: "播放录制", exact: true });
    const pause = page.getByRole("button", { name: "暂停回放", exact: true });
    await slider.press("Home");
    await expect(output).toBeEmpty();
    const clockStart = new Date();
    await page.clock.install({ time: clockStart });
    clockInstalled = true;
    await page.clock.pauseAt(new Date(clockStart.getTime() + 10_000));
    await play.click();
    await page.clock.runFor(Math.ceil(firstAt / 50) * 50);
    await expect(output).toContainText("第一段🙂");
    await expect(output).not.toContainText("第二段");
    await pause.click();
    const pausedAt = await slider.inputValue();
    await page.clock.runFor(leftContent.timeline.durationMs);
    await expect(slider).toHaveValue(pausedAt);
    await play.click();
    await page.clock.runFor(leftContent.timeline.durationMs + 50);
    await expect(slider).toHaveValue(String(leftContent.timeline.durationMs));
    await expect(output).toContainText("第二段");
    await slider.press("Home");
    await expect(output).toBeEmpty();
    await slider.press("End");
    await expect(output).toContainText("第二段");

    await play.click();
    await sessions.selectOption(rightShell);
    await page.getByRole("button", { name: /已停止/ }).click();
    await page.clock.runFor(leftContent.timeline.durationMs + 50);
    await expect(output).toContainText("乙侧独立输出");
    await expect(output).not.toContainText("第一段🙂");
    await expect(page.getByRole("link", { name: "https://example.invalid/fixture" })).toHaveCount(0);
    expect([leftInput.join(""), rightInput.join("")]).toEqual(inputsBeforePlayback);
  } finally {
    if (clockInstalled && !page.isClosed()) await page.clock.resume();
    await app.close();
    await left.close();
    await right.close();
  }
});

test("H3.2 路由页批量关联、覆盖与启停，旧 Shell 保留原连接路径", async () => {
  const password = randomUUID();
  const jump = await startFakeSsh({ password });
  const target = await startFakeSsh({ password });
  const app = await openApp();
  const { page } = app;
  try {
    await openSsh(page);
    const a = await saveHost(page, "批量目标甲", target.port, password);
    const b = await saveHost(page, "批量目标乙", target.port, password);
    const beforeJump = await saveHost(page, "跳板一", jump.port, password);
    const selectedJump = await saveHost(page, "跳板二", jump.port, password);
    const list = async () => new Map((await desktopCall<ManagedHost[]>(page, "ssh.hosts.list")).map((entry) => [entry.id, entry]));
    const initial = await list();
    const aHost = initial.get(a.hostId)!;
    await desktopCall(page, "ssh.hosts.configure", {
      hostId: a.hostId,
      expectedRevision: aHost.revision,
      name: aHost.name,
      host: aHost.host,
      user: aHost.user,
      port: aHost.port,
      authKind: aHost.auth.kind,
      jumpHostIds: [beforeJump.hostId],
      credentials: [],
    });
    expect(await desktopCall(page, "safe.status")).toMatchObject({ initialized: false });

    await page.getByRole("button", { name: "主机目录", exact: true }).click();
    for (const name of ["批量目标甲", "批量目标乙"]) {
      await page.getByRole("checkbox", { name: `选择 ${name}`, exact: true }).check();
    }
    await page.getByRole("button", { name: "为所选关联跳板", exact: true }).click();
    const checkbox = (name: string) => page.getByRole("checkbox", { name, exact: true });
    const selectBatch = async () => {
      await checkbox("批量目标甲").check();
      await checkbox("批量目标乙").check();
    };
    await expect(checkbox("批量目标甲")).toBeChecked();
    await expect(checkbox("批量目标乙")).toBeChecked();
    const candidate = page.getByRole("combobox", { name: "批量跳板", exact: true });
    await expect(candidate.getByRole("option", { name: /批量目标乙.*自身/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "批量启用", exact: true })).toBeDisabled();
    const targetSearch = page.getByRole("textbox", { name: "筛选目标主机…" });
    await targetSearch.fill("目标甲");
    await expect(page.getByText("已选 2 台，其中 1 台在当前筛选范围外")).toBeVisible();
    await page.getByRole("textbox", { name: "搜索批量跳板…" }).fill("跳板二");
    await candidate.selectOption(selectedJump.hostId);
    await page.getByRole("button", { name: "批量关联", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已更新 1 台，跳过 1 台" })).toBeVisible();
    await expect(page.getByRole("list", { name: "各目标的批量结果" })).toContainText("批量目标甲 · 已跳过（已有路由）");
    const first = await list();
    expect(first.get(a.hostId)?.jumpHostIds).toEqual([beforeJump.hostId]);
    expect(first.get(b.hostId)?.jumpHostIds).toEqual([selectedJump.hostId]);
    expect(first.get(beforeJump.hostId)).toEqual(initial.get(beforeJump.hostId));

    await targetSearch.clear();
    await selectBatch();
    await page.getByRole("checkbox", { name: "覆盖已有路由（默认跳过）" }).check();
    await page.getByRole("button", { name: "批量关联", exact: true }).click();
    await expect(page.getByRole("list", { name: "各目标的批量结果" })).toContainText("批量目标乙 · 已跳过（直接跳板相同）");
    await checkbox("按直接跳板分组").check();
    await expect(page.getByRole("heading", { name: "跳板二", exact: true })).toBeVisible();
    expect((await list()).get(a.hostId)).toMatchObject({ jumpHostIds: [selectedJump.hostId], port: aHost.port, user: aHost.user, authState: { password: "configured" } });

    const connect = () => desktopCall(page, "ssh.connect", { hostId: a.hostId, background: true });
    const status = async () => (await desktopCall<ConnectionStatus[]>(page, "ssh.connections.status")).find(({ hostId }) => hostId === a.hostId);
    const connectedPath = async () => {
      const connection = await status();
      return connection?.state === "connected" ? connection.route?.map(({ id }) => id) : undefined;
    };
    await connect();
    await approve(page, a.hostId);
    await expect
      .poll(async () => {
        const connection = await status();
        return connection?.state === "waiting" ? connection.prompt.hop : undefined;
      })
      .toBe(1);
    await approve(page, a.hostId);
    await expect.poll(connectedPath).toEqual([selectedJump.hostId, a.hostId]);
    const shell = await desktopCall<{ id: string }>(page, "ssh.shells.open", { hostId: a.hostId });
    const connectionId = (await status())?.connectionId;

    await selectBatch();
    await page.getByRole("button", { name: "批量停用", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "已更新 2 台，跳过 0 台" })).toBeVisible();
    await expect(page.getByRole("list", { name: "各目标的批量结果" })).toContainText("批量目标乙 · 已更新");
    expect((await list()).get(a.hostId)).toMatchObject({ jumpHostIds: [selectedJump.hostId], routeDisabled: true });
    expect((await status())?.connectionId).toBe(connectionId);
    expect(await connectedPath()).toEqual([selectedJump.hostId, a.hostId]);
    expect(await desktopCall(page, "ssh.shells.list", { hostId: a.hostId })).toEqual(expect.arrayContaining([expect.objectContaining({ id: shell.id, state: "running" })]));
    await desktopCall(page, "ssh.disconnect", { hostId: a.hostId });
    await connect();
    await expect.poll(connectedPath).toEqual([a.hostId]);

    await selectBatch();
    await page.getByRole("button", { name: "批量启用", exact: true }).click();
    await expect.poll(async () => (await list()).get(a.hostId)?.routeDisabled).toBeUndefined();
    await expect(page.getByRole("list", { name: "各目标的批量结果" })).toContainText("批量目标甲 · 已更新");
    expect(await connectedPath()).toEqual([a.hostId]);
    await desktopCall(page, "ssh.disconnect", { hostId: a.hostId });
    await connect();
    await expect.poll(connectedPath).toEqual([selectedJump.hostId, a.hostId]);
    await desktopCall(page, "ssh.disconnect", { hostId: a.hostId });
  } finally {
    await app.close();
    await target.close();
    await jump.close();
  }
});

test("H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组", async () => {
  const password = randomUUID();
  const inputs: string[] = [];
  const target = await startFakeSsh({ password, onShellInput: (chunk) => inputs.push(chunk) });
  const other = await startFakeSsh({ password, onShellInput: (chunk) => inputs.push(chunk) });
  const fixture = await openApp();
  const { page } = fixture;
  const attachments: string[] = [];
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname.includes("/ws/terminal/")) attachments.push(socket.url());
  });
  try {
    await fixture.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000));
    await openSsh(page);
    const first = await saveHost(page, "目标甲", target.port, password);
    const different = await saveHost(page, "另一目标", other.port, password);
    const alias = await saveHost(page, "目标甲别名", target.port, password);
    const start = await desktopCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
      name: "本机布局夹具",
      layout: { kind: "tabs" },
      panes: [first, different, alias].map(({ hostId }) => ({ hostId })),
    });
    await approve(page, first.hostId);
    await approve(page, different.hostId);
    const aliasState = async () => (await desktopCall<ConnectionStatus[]>(page, "ssh.connections.status")).find(({ hostId }) => hostId === alias.hostId)?.state;
    await expect.poll(aliasState).toMatch(/^(waiting|connected)$/);
    if ((await aliasState()) === "waiting") await approve(page, alias.hostId);

    async function showRun() {
      await page.getByRole("button", { name: "工作区", exact: true }).click();
      await page.getByRole("button", { name: /本机布局夹具/ }).click();
    }
    await showRun();
    const run = page.getByTestId("ssh-workspace-run");
    const panes = run.getByTestId("ssh-workspace-run-pane");
    for (const pane of await panes.all()) await expect(pane).toHaveAttribute("data-phase", "ready");
    const original = (await desktopCall<WorkspaceRun[]>(page, "ssh.workspace.runs.list")).find(({ id }) => id === start.id)!;
    const originalPanes = original.panes.map(({ paneId, sessionId }) => ({ paneId, sessionId }));
    const firstPane = panes.first();
    const firstToolbar = firstPane.getByTestId("ssh-pane-tools");
    const activeSpot = run.locator('[data-workspace-spot][data-active="true"]');
    await expect.poll(() => attachments.length).toBeGreaterThanOrEqual(3);
    const attachmentCount = attachments.length;

    await firstToolbar.getByRole("button", { name: "移至分栏下方" }).press("Enter");
    await expect(firstToolbar).toHaveAttribute("data-position", "bottom");
    await expect(firstToolbar.getByRole("button", { name: "移至分栏上方" })).toBeFocused();
    await expect(activeSpot).toHaveAttribute("data-workspace-spot", originalPanes[0]!.paneId);

    async function beginDrag() {
      const handle = firstToolbar.getByRole("button", { name: "移至分栏上方" });
      await handle.scrollIntoViewIfNeeded();
      const box = (await handle.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 18, y, { steps: 5 });
      await expect(firstPane.locator('[data-toolbar-drop="top"]')).toBeVisible();
    }

    await beginDrag();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(firstPane.locator("[data-toolbar-drop]")).toHaveCount(0);
    await expect(firstToolbar).toHaveAttribute("data-position", "bottom");

    await beginDrag();
    const invalid = (await firstPane.getByRole("application").boundingBox())!;
    await page.mouse.move(invalid.x + invalid.width / 2, invalid.y + invalid.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(firstPane.locator("[data-toolbar-drop]")).toHaveCount(0);
    await expect(firstToolbar).toHaveAttribute("data-position", "bottom");

    await beginDrag();
    const zone = firstPane.locator('[data-toolbar-drop="top"]');
    await zone.scrollIntoViewIfNeeded();
    const drop = (await zone.boundingBox())!;
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 8 });
    await page.mouse.move(drop.x + drop.width / 2 + 1, drop.y + drop.height / 2);
    await page.mouse.up();
    await expect(firstToolbar).toHaveAttribute("data-position", "top");

    const tabs = run.getByRole("group", { name: "内部标签" });
    await tabs.getByRole("button", { name: "目标甲别名", exact: true }).click();
    await run.getByText("本机布局偏好", { exact: true }).click();
    await run.getByLabel("工作区标签方向").selectOption("left");
    await run.getByRole("checkbox", { name: "纵向标签按同目标分组" }).check();
    await expect(tabs.getByTestId("ssh-workspace-tab-group")).toHaveText(`fixture@127.0.0.1:${target.port}`);
    await expect(tabs.getByRole("button")).toHaveText(["目标甲", "目标甲别名", "另一目标"]);
    await expect(activeSpot).toHaveAttribute("data-workspace-spot", originalPanes[2]!.paneId);
    const aliasToolbar = panes.last().getByTestId("ssh-pane-tools");
    await run.getByLabel("工具栏顺序").selectOption("monitor-first");
    await run.getByLabel("工具栏尺寸").selectOption("large");
    await expect(aliasToolbar.getByRole("group").getByRole("button")).toHaveText(["分栏监控", "分栏文件"]);
    await expect(aliasToolbar).toHaveAttribute("data-size", "large");
    await run.getByLabel("分栏工具栏位置").selectOption("hidden");
    await expect(run.getByTestId("ssh-pane-tools")).toHaveCount(0);
    expect(attachments).toHaveLength(attachmentCount);
    expect([target.conns.length, other.conns.length]).toEqual([2, 1]);
    const current = (await desktopCall<WorkspaceRun[]>(page, "ssh.workspace.runs.list")).find(({ id }) => id === start.id)!;
    expect(current.layoutRevision).toBe(original.layoutRevision);
    expect(current.panes.map(({ paneId, sessionId }) => ({ paneId, sessionId }))).toEqual(originalPanes);

    await page.reload();
    await openSsh(page);
    await showRun();
    await run.getByText("本机布局偏好", { exact: true }).click();
    await expect(run.getByLabel("分栏工具栏位置")).toHaveValue("hidden");
    await expect(run.getByLabel("工具栏顺序")).toHaveValue("monitor-first");
    await expect(run.getByLabel("工具栏尺寸")).toHaveValue("large");
    await expect(run.getByLabel("工作区标签方向")).toHaveValue("left");
    await expect(run.getByRole("checkbox", { name: "纵向标签按同目标分组" })).toBeChecked();
    await run.getByRole("button", { name: "恢复工具栏默认布局" }).click();
    await expect(firstToolbar).toHaveAttribute("data-position", "top");
    await expect(firstToolbar).toHaveAttribute("data-size", "small");
    await expect(firstToolbar.getByRole("group").getByRole("button")).toHaveText(["分栏文件", "分栏监控"]);

    await run.getByText("快捷文本与广播", { exact: true }).click();
    await firstPane.getByRole("button", { name: "锁定输入" }).click();
    await expect(run.getByRole("checkbox", { name: /目标甲.*无输入控制/ })).toBeDisabled();
    await firstPane.getByRole("button", { name: "解除输入锁定" }).click();
    await firstPane.getByRole("button", { name: "分栏文件" }).click();
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    await expect(run).toBeHidden();
    await expect(run).toHaveAttribute("inert", "");
    const priorInput = inputs.join("");
    await page.keyboard.type("hidden-workspace-fixture");
    expect(inputs.join("")).toBe(priorInput);
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await expect(run).toBeVisible();
    await expect(firstPane).toHaveAttribute("data-session-id", originalPanes[0]!.sessionId!);
  } finally {
    await fixture.close();
    await other.close();
    await target.close();
  }
});
