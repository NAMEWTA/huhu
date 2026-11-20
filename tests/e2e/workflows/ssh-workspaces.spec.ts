import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import type { WorkspaceRun, WorkspaceTemplate } from "../../../plugins/ssh/src/shared/workspace.js";
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

async function configureLoopback(page: Page, name: string, port: number, password: string) {
  const result = await sshCall<{ hostId: string; revision: string }>(page, "ssh.hosts.configure", {
    name,
    host: "127.0.0.1",
    port,
    user: "workspace-fixture",
    authKind: "password",
    expectedRevision: null,
    connectTimeoutSec: 5,
    credentials: [{ purpose: "password", action: "replace", value: password }],
  });
  expect(result.ok, result.error?.message).toBe(true);
  return result.data;
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

test("H4.2 临时运行独立信任和认证，重挂与重连保留分栏归属", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  const inputs: string[] = [];
  const rejectedAuth: string[] = [];
  const serverA = await startFakeSsh({ password, onShellInput: (text) => inputs.push(text) });
  const serverB = await startFakeSsh({ password });
  const serverC = await startFakeSsh({ password: randomUUID(), onAuth: (_user, method) => rejectedAuth.push(method) });
  const fixture = await openApp();
  try {
    const { page, vault } = fixture;
    const terminalOutput: string[] = [];
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname.startsWith("/ws/terminal/")) {
        socket.on("framereceived", ({ payload }) => terminalOutput.push(payload.toString()));
      }
    });
    await openWorkspace(page);
    const hostA = await configureLoopback(page, "回环甲", serverA.port, password);
    const hostB = await configureLoopback(page, "回环乙", serverB.port, password);
    const hostC = await configureLoopback(page, "拒绝认证", serverC.port, password);
    await page.getByRole("button", { name: "主机", exact: true }).click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: "临时启动", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "临时启动工作区" });
    await draft.getByLabel("工作区名称").fill("回环试运行");
    for (const host of [hostA, hostB, hostC]) {
      await draft.getByLabel("从主机目录选择").selectOption(host.hostId);
      await draft.getByRole("button", { name: "加入主机" }).click();
    }
    await draft.getByLabel("布局", { exact: true }).selectOption("tabs");
    await draft.getByLabel("登录命令（可选）").first().fill("echo huhu-workspace-fixture");
    await draft.getByRole("button", { name: "启动工作区", exact: true }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const pane = page.getByTestId("ssh-workspace-run-pane");
    await expect(run).toHaveAttribute("data-generation", "1");
    const original = (await run.getAttribute("data-run-id"))!;
    await expect(pane).toHaveAttribute("data-phase", "trust");
    const trustKey = await pane.locator("code").innerText();
    expect(trustKey).toContain("SHA256:");
    expect(rejectedAuth).not.toContain("password");
    await page.getByRole("button", { name: "主机", exact: true }).click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /回环试运行.*代次 1/ }).click();
    await expect(pane.locator("code")).toHaveText(trustKey);
    await pane.getByRole("button", { name: "信任并连接" }).click();
    await expect(pane).toHaveAttribute("data-phase", "ready");
    await expect(pane.getByLabel("回环甲 终端")).toBeVisible();
    const sessionA = (await pane.getAttribute("data-session-id"))!;
    const paneA = (await pane.getAttribute("data-pane-id"))!;
    await expect.poll(() => inputs).toEqual(["echo huhu-workspace-fixture\r"]);
    await expect.poll(() => terminalOutput.join("")).toContain("welcome");
    await run.getByRole("button", { name: "回环乙" }).click();
    await expect(pane).toHaveAttribute("data-phase", "trust");
    await pane.getByRole("button", { name: "信任并连接" }).click();
    await expect(pane).toHaveAttribute("data-phase", "ready");
    const sessionB = (await pane.getAttribute("data-session-id"))!;
    expect(sessionB).not.toBe(sessionA);
    await run.getByRole("button", { name: "拒绝认证" }).click();
    await expect(pane).toHaveAttribute("data-phase", "trust");
    await pane.getByRole("button", { name: "信任并连接" }).click();
    await expect(pane.getByRole("alert")).toContainText("认证失败");
    expect(rejectedAuth).toContain("password");
    await run.getByRole("button", { name: "回环甲" }).click();
    await expect(pane).toHaveAttribute("data-session-id", sessionA);
    await run.getByRole("button", { name: "回环乙" }).click();
    await expect(pane).toHaveAttribute("data-session-id", sessionB);
    await page.getByRole("button", { name: "主机", exact: true }).click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /回环试运行.*代次 1/ }).click();
    await expect(pane).toHaveAttribute("data-session-id", sessionA);
    expect(inputs).toEqual(["echo huhu-workspace-fixture\r"]);
    expect(serverA.conns).toHaveLength(1);
    expect(serverB.conns).toHaveLength(1);
    await page.getByRole("button", { name: "存为模板" }).click();
    await page.getByLabel("模板名称").fill("回环固定模板");
    await page.getByRole("button", { name: "保存模板" }).click();
    await expect(page.getByRole("heading", { name: "回环固定模板" })).toBeVisible();
    await page.getByRole("button", { name: "启动模板" }).click();
    await expect(run).not.toHaveAttribute("data-run-id", original);
    await expect(pane).toHaveAttribute("data-phase", "ready");
    await expect(pane).not.toHaveAttribute("data-session-id", sessionA);
    const file = readFileSync(path.join(vault, ".huhu/runtime/ssh/workspace-runs.json"), "utf8");
    expect(file).not.toContain(sessionA);
    expect(file).not.toContain(password);
    expect(file).not.toContain("welcome");
    await fixture.app.close();

    const reopened = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
    try {
      const fresh = await reopened.firstWindow();
      await openWorkspace(fresh);
      await fresh.getByRole("button", { name: /回环试运行.*代次 1/ }).click();
      const restored = fresh.getByTestId("ssh-workspace-run");
      const restoredPane = fresh.getByTestId("ssh-workspace-run-pane");
      await expect(restored).toHaveAttribute("data-run-id", original);
      await expect(restoredPane).toHaveAttribute("data-phase", "reconnect");
      await expect(restoredPane).toHaveAttribute("data-pane-id", paneA);
      await fresh.getByRole("button", { name: "重连工作区" }).click();
      await expect(restored).toHaveAttribute("data-generation", "2");
      await expect(restoredPane).toHaveAttribute("data-phase", "ready");
      const newSession = await restoredPane.getAttribute("data-session-id");
      expect(newSession).toBeTruthy();
      expect(newSession).not.toBe(sessionA);
      await expect(restoredPane).toHaveAttribute("data-pane-id", paneA);
      await fresh.getByRole("button", { name: "关闭运行" }).click();
      await expect(restored).toHaveCount(0);
      await expect.poll(async () => (await sshCall<WorkspaceRun[]>(fresh, "ssh.workspace.runs.list")).data.some(({ id }) => id === original)).toBe(false);
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
    await Promise.all([serverA.close(), serverB.close(), serverC.close()]);
  }
});

test("H4.2 绑定写入失败零拨号，已删除和身份变更有各自分栏", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  const oldTarget = await startFakeSsh({ password });
  const newTarget = await startFakeSsh({ password });
  const unreachable = await startFakeSsh({ password });
  const unreachablePort = unreachable.port;
  await unreachable.close();
  const fixture = await openApp();
  try {
    const { page, vault } = fixture;
    await openWorkspace(page);
    const change = await configureLoopback(page, "身份已变", oldTarget.port, password);
    const unreachableHost = await configureLoopback(page, "本机端口未监听", unreachablePort, password);
    const removed = await sshCall<{ id: string }>(page, "ssh.hosts.save", { name: "稍后移除", host: "127.0.0.1", port: oldTarget.port, user: "fixture", auth: { kind: "agent" } });
    expect(removed.ok).toBe(true);
    const template = await sshCall<WorkspaceTemplate>(page, "ssh.workspace.templates.save", {
      name: "检查旧目标",
      layout: { kind: "three" },
      panes: [{ hostId: change.hostId }, { hostId: removed.data.id }, { hostId: unreachableHost.hostId }],
    });
    expect(template.ok).toBe(true);
    await page.getByRole("button", { name: "临时启动", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "临时启动工作区" });
    await draft.getByLabel("工作区名称").fill("绑定写入故障");
    await draft.getByLabel("从主机目录选择").selectOption(change.hostId);
    await draft.getByRole("button", { name: "加入主机" }).click();
    const runtimeParent = path.join(vault, ".huhu/runtime/ssh");
    writeFileSync(runtimeParent, "fixture: prevent binding write");
    try {
      await draft.getByRole("button", { name: "启动工作区", exact: true }).click();
      await expect(draft.getByRole("alert")).toBeVisible();
      await expect(draft.getByLabel("工作区名称")).toHaveValue("绑定写入故障");
    } finally {
      rmSync(runtimeParent);
    }
    await draft.getByRole("button", { name: "取消", exact: true }).click();
    expect((await sshCall<WorkspaceRun[]>(page, "ssh.workspace.runs.list")).data).toEqual([]);
    expect((await sshCall<unknown[]>(page, "ssh.audit.list")).data).toEqual([]);
    expect(oldTarget.conns).toHaveLength(0);
    expect(newTarget.conns).toHaveLength(0);
    const moved = await sshCall(page, "ssh.hosts.configure", {
      name: "身份已变",
      host: "127.0.0.1",
      port: newTarget.port,
      user: "workspace-fixture",
      hostId: change.hostId,
      authKind: "password",
      expectedRevision: change.revision,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    expect(moved.ok, moved.error?.message).toBe(true);
    // Simulate a missing record left by an older copy of the directory.
    rmSync(path.join(vault, ".huhu/ssh/hosts", `${removed.data.id}.json`));
    await page.reload();
    await openWorkspace(page);
    await page.getByRole("button", { name: "检查旧目标" }).click();
    await page.getByRole("button", { name: "启动模板" }).click();
    await expect(page.getByRole("article", { name: "身份已变" }).getByRole("alert")).toContainText("身份已变更");
    await expect(page.getByRole("article", { name: removed.data.id }).getByRole("alert")).toContainText("已移除");
    await expect(page.getByRole("article", { name: "本机端口未监听" }).getByRole("alert")).toContainText("连接失败");
    expect(oldTarget.conns).toHaveLength(0);
    expect(newTarget.conns).toHaveLength(0);
  } finally {
    await fixture.close();
    await Promise.all([oldTarget.close(), newTarget.close()]);
  }
});
