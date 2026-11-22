import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
    const started = await desktopCall<WorkspaceRun>(page, "ssh.workspace.runs.start", { name: "分栏验收", layout: { kind: "two" }, panes: [a, b] });
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
