import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import type { WorkspaceRun, WorkspaceTemplate } from "../../../plugins/ssh/src/shared/workspace.js";
import type { FileDocument, FileSession } from "../../../plugins/ssh/src/shared/files.js";
import type { TransferBatch, TransferJob, TransferQueue } from "../../../plugins/ssh/src/shared/transfers.js";
import type { ArchiveResult, ArchiveSupport } from "../../../plugins/ssh/src/shared/archives.js";
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
    const hosts: { id: string; name: string; revision: string }[] = [];
    for (let i = 1; i <= 13; i++) {
      const name = `测试主机 ${i}`;
      const saved = await sshCall<{ hostId: string; revision: string }>(page, "ssh.hosts.configure", { name, host: "127.0.0.1", port: 21000 + i, user: "fixture", authKind: "agent", expectedRevision: null });
      expect(saved.ok, saved.error?.message).toBe(true);
      hosts.push({ id: saved.data.hostId, name, revision: saved.data.revision });
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
    const remove = { hostId: hosts[0]!.id, expectedRevision: hosts[0]!.revision };
    const blocked = await sshCall(page, "ssh.hosts.remove", remove);
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
      expect((await sshCall(fresh, "ssh.hosts.remove", remove)).ok).toBe(true);
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
    const removed = await sshCall<{ hostId: string }>(page, "ssh.hosts.configure", { name: "稍后移除", host: "127.0.0.1", port: oldTarget.port, user: "fixture", authKind: "agent", expectedRevision: null });
    expect(removed.ok).toBe(true);
    const template = await sshCall<WorkspaceTemplate>(page, "ssh.workspace.templates.save", {
      name: "检查旧目标",
      layout: { kind: "three" },
      panes: [{ hostId: change.hostId }, { hostId: removed.data.hostId }, { hostId: unreachableHost.hostId }],
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
    rmSync(path.join(vault, ".huhu/ssh/hosts", `${removed.data.hostId}.json`));
    await page.reload();
    await openWorkspace(page);
    await page.getByRole("button", { name: "检查旧目标" }).click();
    await page.getByRole("button", { name: "启动模板" }).click();
    await expect(page.getByRole("article", { name: "身份已变" }).getByRole("alert")).toContainText("身份已变更");
    await expect(page.getByRole("article", { name: removed.data.hostId }).getByRole("alert")).toContainText("已移除");
    await expect(page.getByRole("article", { name: "本机端口未监听" }).getByRole("alert")).toContainText("连接失败");
    expect(oldTarget.conns).toHaveLength(0);
    expect(newTarget.conns).toHaveLength(0);
  } finally {
    await fixture.close();
    await Promise.all([oldTarget.close(), newTarget.close()]);
  }
});

test("H6.1 附属文件跟随活动分栏，独立双栏保持原连接和单独目录", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  let hold = false;
  let held = 0;
  let linkVisits = 0;
  const remoteA = await startFakeSsh({
    password,
    holdReadDirectory: (dir) => {
      if (dir.includes("loop-link")) linkVisits++;
      if (!hold) return false;
      held++;
      return true;
    },
  });
  const remoteB = await startFakeSsh({ password });
  const fixture = await openApp();
  try {
    const { page, vault, app } = fixture;
    remoteA.fs.dirs.add("/home/test/subdir-a");
    remoteA.fs.files.set("/home/test/remote-a.txt", Buffer.from("remote a"));
    remoteA.fs.files.set("/home/test/subdir-a/nested-marker.txt", Buffer.from("nested"));
    remoteA.fs.links.set("/home/test/loop-link", "/home/test");
    remoteB.fs.files.set("/home/test/remote-b.txt", Buffer.from("remote b"));
    const localRoot = path.join(vault, "ssh-local-fixture");
    mkdirSync(path.join(localRoot, "local-child"), { recursive: true });
    writeFileSync(path.join(localRoot, "local-marker.txt"), "local");
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const options = args.at(-1) as { properties?: string[] };
        if (!options.properties?.includes("openDirectory")) throw new Error("Expected native directory picker");
        return { canceled: false, filePaths: [chosen] };
      }) as typeof dialog.showOpenDialog;
    }, localRoot);
    await openWorkspace(page);
    const hostA = await configureLoopback(page, "文件源甲", remoteA.port, password);
    const hostB = await configureLoopback(page, "文件源乙", remoteB.port, password);
    const started = await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
      name: "双主机文件绑定",
      layout: { kind: "tabs" },
      panes: [{ hostId: hostA.hostId }, { hostId: hostB.hostId }],
    });
    expect(started.ok).toBe(true);
    await page.getByRole("button", { name: /双主机文件绑定.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const sourcePane = run.getByTestId("ssh-workspace-run-pane");
    await sourcePane.getByRole("button", { name: "信任并连接" }).click();
    await sourcePane.getByRole("button", { name: "分栏文件" }).click();
    const shellA = (await sourcePane.getAttribute("data-session-id"))!;
    const attached = run.getByTestId("files-panel");
    await expect(attached.getByRole("button", { name: "remote-a.txt", exact: true })).toBeVisible();
    await attached.getByLabel("递归搜索文件名").fill("nested-marker");
    await attached.getByRole("button", { name: "搜索", exact: true }).click();
    await attached.getByRole("button", { name: "/home/test/subdir-a/nested-marker.txt", exact: true }).click();
    await expect(attached.getByRole("button", { name: "nested-marker.txt", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(attached.getByTestId("files-preview")).toHaveCount(0);
    await attached.getByRole("button", { name: "返回目录" }).click();
    await expect(attached.getByRole("button", { name: "remote-a.txt", exact: true })).toBeVisible();
    expect(linkVisits).toBe(0);
    hold = true;
    await attached.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => held).toBeGreaterThan(0);
    await attached.getByRole("button", { name: "取消搜索" }).click();
    await expect(attached.getByRole("button", { name: "搜索", exact: true })).toBeEnabled();
    hold = false;
    await attached.getByRole("button", { name: "打开独立双栏" }).click();
    const independent = page.getByTestId("ssh-independent-files").filter({ visible: true });
    const firstSession = (await independent.getAttribute("data-file-session-id"))!;
    const oldConnection = (await independent.getAttribute("data-connection-id"))!;
    const local = independent.getByRole("region", { name: "本机文件", exact: true });
    const pinned = independent.getByTestId("files-panel");
    await expect(independent.getByText(shellA, { exact: true })).toBeVisible();
    await local.getByRole("button", { name: "选择本机目录" }).click();
    await expect(local.getByText("local-marker.txt", { exact: true })).toBeVisible();
    await pinned.getByTestId("files-open").filter({ hasText: "subdir-a" }).click();
    await expect(pinned.getByTestId("files-path")).toHaveText("/home/test/subdir-a");
    await pinned.getByRole("button", { name: "收藏远端目录" }).click();
    await local.getByRole("button", { name: /local-child/ }).click();
    await expect(local.locator("code").first()).toContainText("local-child");
    await expect(pinned.getByTestId("files-path")).toHaveText("/home/test/subdir-a");
    await independent.getByRole("button", { name: "交换左右位置" }).click();
    await expect(independent.locator(".ssh-file-columns > section").first()).toHaveAttribute("data-testid", "files-panel");
    await pinned.getByRole("button", { name: "大小", exact: true }).click();
    await expect(pinned.getByRole("columnheader", { name: "大小" })).toHaveAttribute("aria-sort", "ascending");
    await pinned.getByLabel("筛选远端目录").fill("no-match");
    await expect(pinned.getByRole("button", { name: "nested-marker.txt", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await run.getByRole("button", { name: "文件源乙", exact: true }).click();
    await sourcePane.getByRole("button", { name: "信任并连接" }).click();
    await expect(attached.getByRole("button", { name: "remote-b.txt", exact: true })).toBeVisible();
    const shellB = (await sourcePane.getAttribute("data-session-id"))!;
    await page.getByRole("button", { name: "独立文件会话", exact: true }).click();
    await expect(independent).toHaveAttribute("data-file-session-id", firstSession);
    await expect(pinned.getByTestId("files-path")).toHaveText("/home/test/subdir-a");
    await expect(independent.getByText(shellA, { exact: true })).toBeVisible();
    await sshCall(page, "ssh.disconnect", { hostId: hostA.hostId });
    await expect(independent.getByText("原连接已断开，远端操作已停用")).toBeVisible();
    expect((await sshCall(page, "ssh.connect", { hostId: hostA.hostId })).ok).toBe(true);
    const fresh = await sshCall<FileSession>(page, "ssh.fileSessions.open", { hostId: hostA.hostId, attached: true });
    expect(fresh.ok).toBe(true);
    expect(fresh.data.connectionId).not.toBe(oldConnection);
    expect((await sshCall(page, "ssh.sftp.list", { fileSessionId: firstSession, path: "" })).error?.code).toBe("SSH_DISCONNECTED");
    await expect(pinned.getByRole("button", { name: "刷新", exact: true })).toBeDisabled();
    await independent.getByRole("button", { name: "关闭独立文件视图" }).click();
    await expect(independent).toHaveCount(0);
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await expect(sourcePane).toHaveAttribute("data-session-id", shellB);
    await expect(attached.getByRole("button", { name: "remote-b.txt", exact: true })).toBeVisible();
    await attached.getByRole("button", { name: "打开独立双栏" }).click();
    await expect(independent.getByText(shellB, { exact: true })).toBeVisible();
    await independent.getByRole("button", { name: "关闭独立文件视图" }).click();
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await expect(sourcePane).toHaveAttribute("data-session-id", shellB);
    expect((await sshCall<{ id: string; state: string }[]>(page, "ssh.shells.list", { hostId: hostB.hostId })).data).toContainEqual(expect.objectContaining({ id: shellB, state: "running" }));
  } finally {
    await fixture.close();
    await Promise.all([remoteA.close(), remoteB.close()]);
  }
});

test("H6.3 远端编辑保持权限和文本格式，版本冲突保留两份内容", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  let duringStage: (() => void) | undefined;
  const remote = await startFakeSsh({
    password,
    onWriteFile: (file) => {
      if (file.includes(".huhu-upload-")) duringStage?.();
    },
  });
  const fixture = await openApp();
  const editPath = "/home/test/edit.txt";
  try {
    const { page } = fixture;
    remote.fs.files.set(editPath, Buffer.from("\uFEFFalpha\r\nsecond\r\n"));
    remote.fs.permissions.set(editPath, 0o640);
    remote.fs.files.set("/home/test/too-big.txt", Buffer.alloc(1024 * 1024 + 1, 97));
    remote.fs.files.set("/home/test/not-utf8.txt", Buffer.from([0xc3, 0x28]));
    await openWorkspace(page);
    const host = await configureLoopback(page, "编辑夹具", remote.port, password);
    expect(
      (
        await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
          name: "测试远端文本",
          layout: { kind: "one" },
          panes: [{ hostId: host.hostId }],
        })
      ).ok,
    ).toBe(true);
    await page.getByRole("button", { name: /测试远端文本.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const pinned = page.getByTestId("ssh-independent-files").filter({ visible: true }).getByTestId("files-panel");
    await pinned.getByRole("button", { name: "编辑 too-big.txt", exact: true }).click();
    await expect(pinned.getByRole("alert")).toContainText("超过 1 MiB");
    await pinned.getByRole("button", { name: "编辑 not-utf8.txt", exact: true }).click();
    await expect(pinned.getByRole("alert")).toContainText("不是 UTF-8");
    await pinned.getByRole("button", { name: "编辑 edit.txt", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑远端文本" });
    const draft = editor.getByLabel("正文");
    await expect(draft).toHaveValue("alpha\nsecond\n");
    await editor.getByLabel("查找", { exact: true }).fill("alpha");
    await editor.getByRole("button", { name: "下一个匹配" }).click();
    await editor.getByLabel("替换为").fill("beta");
    await editor.getByRole("button", { name: "替换当前匹配" }).click();
    await editor.getByLabel("行号", { exact: true }).fill("2");
    await editor.getByRole("button", { name: "跳到行" }).click();
    await expect(editor.getByText("第 2 行，共 3 行")).toBeVisible();
    await editor.getByRole("button", { name: "缩进选中行" }).click();
    await expect(draft).toHaveValue("beta\n  second\n");
    await editor.getByRole("button", { name: "保存远端文件" }).click();
    await expect(editor.getByRole("status")).toContainText("已保存远端文件");
    expect(remote.fs.files.get(editPath)?.toString()).toBe("\uFEFFbeta\r\n  second\r\n");
    expect(remote.fs.permissions.get(editPath)).toBe(0o640);

    const other = await sshCall<FileSession>(page, "ssh.fileSessions.open", { hostId: host.hostId });
    expect(other.ok).toBe(true);
    const read = await sshCall<FileDocument>(page, "ssh.fileSessions.document.open", { fileSessionId: other.data.fileSessionId, path: editPath });
    expect(read.ok).toBe(true);
    const secondWrite = await sshCall(page, "ssh.fileSessions.document.save", {
      fileSessionId: other.data.fileSessionId,
      path: editPath,
      expectedVersion: read.data.version,
      text: "另一会话的新内容\n",
    });
    expect(secondWrite.ok, secondWrite.error?.message).toBe(true);
    await draft.fill("待保留的本地草稿\n");
    await editor.getByRole("button", { name: "保存远端文件" }).click();
    await expect(editor.getByRole("alert")).toContainText("远端文件已更改");
    await expect(draft).toHaveValue("待保留的本地草稿\n");
    await editor.getByRole("button", { name: "读取远端新版本" }).click();
    await expect(editor.getByLabel("远端新版本")).toHaveValue("另一会话的新内容\n");
    expect(remote.fs.files.get(editPath)?.toString()).toBe("\uFEFF另一会话的新内容\r\n");
    expect(remote.fs.permissions.get(editPath)).toBe(0o640);
    await expect(draft).toHaveValue("待保留的本地草稿\n");
    await editor.getByRole("button", { name: "关闭编辑" }).click();

    const latest = await sshCall<FileDocument>(page, "ssh.fileSessions.document.open", { fileSessionId: other.data.fileSessionId, path: editPath });
    duringStage = () => {
      duringStage = undefined;
      remote.fs.files.set(editPath, Buffer.from("暂存期间外部改动"));
    };
    const raced = await sshCall(page, "ssh.fileSessions.document.save", {
      fileSessionId: other.data.fileSessionId,
      path: editPath,
      expectedVersion: latest.data.version,
      text: "这次保存必须停止",
    });
    expect(raced.error?.code).toBe("VERSION_CONFLICT");
    expect(remote.fs.files.get(editPath)?.toString()).toBe("暂存期间外部改动");
    expect([...remote.fs.files.keys()].filter((file) => file.includes(".huhu-"))).toEqual([]);
  } finally {
    await fixture.close();
    await remote.close();
  }
});

test("H7.1/H7.2 传输中心保留任务和来源，拒绝或确认覆盖后核对实际文件", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  const remote = await startFakeSsh({ password });
  const fixture = await openApp();
  try {
    const { page, vault } = fixture;
    const bytes = Buffer.from("来自 Windows 的文件\r\n");
    const local = path.join(vault, "transfer.txt");
    const destination = "/home/test/transfer.txt";
    writeFileSync(local, bytes);
    remote.fs.files.set(destination, Buffer.from("原远端文件"));
    await openWorkspace(page);
    const host = await configureLoopback(page, "传输夹具", remote.port, password);
    expect(
      (
        await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
          name: "验证传输工作区",
          layout: { kind: "one" },
          panes: [{ hostId: host.hostId }],
        })
      ).ok,
    ).toBe(true);
    await page.getByRole("button", { name: /验证传输工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const panel = page.getByTestId("ssh-independent-files").filter({ visible: true });
    const originalFileSession = (await panel.getAttribute("data-file-session-id"))!;
    const openCenter = () => page.getByRole("button", { name: "传输中心", exact: true }).click();
    const rows = page.getByTestId("ssh-transfer-row");
    const modal = page.getByRole("dialog", { name: "已存在同名文件" });
    async function upload() {
      await panel.getByTestId("files-upload-from").fill(local);
      await panel.getByTestId("files-upload-go").click();
      await expect(panel.getByTestId("files-note")).toHaveText("已加入传输中心");
      await openCenter();
      const row = rows.first();
      await expect(row).toHaveAttribute("data-state", "waiting");
      return (await row.getAttribute("data-transfer-id"))!;
    }
    const rejected = await upload();
    const job = (id: string) => rows.and(page.locator(`[data-transfer-id="${id}"]`));
    await job(rejected).getByRole("button", { name: "处理冲突" }).click();
    await modal.getByRole("button", { name: "保留原文件" }).click();
    await expect(job(rejected)).toHaveAttribute("data-state", "cancelled");
    expect(remote.fs.files.get(destination)?.toString()).toBe("原远端文件");
    await job(rejected).getByRole("button", { name: "返回原文件会话" }).click();
    await expect(panel).toHaveAttribute("data-file-session-id", originalFileSession);

    const confirmed = await upload();
    expect(confirmed).not.toBe(rejected);
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await page.getByRole("button", { name: "独立文件会话", exact: true }).click();
    await expect(job(confirmed)).toHaveAttribute("data-state", "waiting");
    await job(confirmed).getByRole("button", { name: "处理冲突" }).click();
    await modal.getByRole("button", { name: "确认覆盖" }).click();
    await expect(job(confirmed)).toHaveAttribute("data-state", "completed");
    expect(remote.fs.files.get(destination)).toEqual(bytes);
    expect(readFileSync(local)).toEqual(bytes);
    expect([...remote.fs.files.keys()]).toEqual([destination]);
    await job(confirmed).getByRole("button", { name: "返回原文件会话" }).click();

    const changed = await upload();
    remote.fs.files.set(destination, Buffer.from("等待确认时改写的目标"));
    await job(changed).getByRole("button", { name: "处理冲突" }).click();
    await modal.getByRole("button", { name: "确认覆盖" }).click();
    await expect(job(changed)).toHaveAttribute("data-state", "failed");
    await expect(job(changed)).toContainText("目标文件已变更");
    expect(remote.fs.files.get(destination)?.toString()).toBe("等待确认时改写的目标");
    await job(changed).getByRole("button", { name: "返回原文件会话" }).click();
    await panel.getByRole("button", { name: "下载 transfer.txt" }).click();
    const download = path.join(vault, "download.txt");
    await panel.getByTestId("files-save-to").fill(download);
    await panel.getByTestId("files-download-go").click();
    await expect(panel.getByTestId("files-note")).toHaveText("已加入传输中心");
    await openCenter();
    await expect(rows.first()).toHaveAttribute("data-state", "completed");
    expect(readFileSync(download).toString()).toBe("等待确认时改写的目标");
    await rows.first().getByRole("button", { name: "返回原文件会话" }).click();
    await expect(panel.getByRole("button", { name: "transfer.txt", exact: true })).toHaveAttribute("aria-current", "location");
    writeFileSync(download, "本机旧目标");
    await panel.getByRole("button", { name: "下载 transfer.txt" }).click();
    await panel.getByTestId("files-save-to").fill(download);
    await panel.getByTestId("files-download-go").click();
    await expect(panel.getByTestId("files-note")).toHaveText("已加入传输中心");
    await openCenter();
    await expect(rows.first()).toHaveAttribute("data-state", "waiting");
    await rows.first().getByRole("button", { name: "处理冲突" }).click();
    await modal.getByRole("button", { name: "确认覆盖" }).click();
    await expect(rows.first()).toHaveAttribute("data-state", "completed");
    expect(readFileSync(download).toString()).toBe("等待确认时改写的目标");
    const listed = await sshCall<TransferQueue>(page, "ssh.transfers.list");
    expect(listed.data.jobs.find(({ transferId }) => transferId === confirmed)?.target).toMatchObject({ fileSessionId: originalFileSession });
    await page.getByRole("button", { name: "清理已结束记录" }).click();
    await expect(rows).toHaveCount(0);
    expect(remote.fs.files.get(destination)?.toString()).toBe("等待确认时改写的目标");
    expect(readFileSync(download).toString()).toBe("等待确认时改写的目标");
  } finally {
    await fixture.close();
    await remote.close();
  }
});

test("H7.2 两个回环端点按前缀续传、暂停和继续，前缀失配保留原目标", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  let ended = Promise.withResolvers<void>();
  let held = false;
  let delay = true;
  let failInstall = false;
  let hideReadback = true;
  let installsWithLostReply = 0;
  const retryPath = "/home/test/retry.bin";
  const cancelPath = "/home/test/cancel.bin";
  const uncertainPath = "/home/test/uncertain.bin";
  const source = await startFakeSsh({ password });
  const destination = await startFakeSsh({
    password,
    waitWriteFile: (file) => {
      if (!delay || !file.endsWith(".part")) return undefined;
      held = true;
      return ended.promise;
    },
    failRename: (from, to) => {
      if (!failInstall || to !== retryPath || !from.endsWith(".part")) return false;
      failInstall = false;
      return true;
    },
    dropRenameReply(from, to) {
      if (to !== uncertainPath || !from.endsWith(".part")) return false;
      return ++installsWithLostReply === 1;
    },
    waitReadFile(file) {
      if (hideReadback && installsWithLostReply && file === uncertainPath) return Promise.reject(new Error("fixture blocks readback"));
    },
  });
  const fixture = await openApp();
  try {
    const { page } = fixture;
    const prefix = Buffer.from("一段可校验前缀\r\n");
    const bytes = Buffer.concat([prefix, Buffer.alloc(192 * 1024, 0x61)]);
    const name = "/home/test/cross.bin";
    const bad = "/home/test/bad.bin";
    source.fs.files.set(name, bytes);
    source.fs.permissions.set(name, 0o640);
    source.fs.timestamps.set(name, 1_650_000_123);
    destination.fs.files.set(name, prefix);
    destination.fs.files.set(bad, Buffer.from("错误前缀"));
    await openWorkspace(page);
    const a = await configureLoopback(page, "跨端源", source.port, password);
    const b = await configureLoopback(page, "跨端目标", destination.port, password);
    const started = await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
      name: "跨端验证",
      layout: { kind: "tabs" },
      panes: [{ hostId: a.hostId }, { hostId: b.hostId }],
    });
    expect(started.ok).toBe(true);
    await page.getByRole("button", { name: /跨端验证.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const attached = run.getByTestId("files-panel");
    const selected = page.getByTestId("ssh-independent-files").filter({ visible: true });
    const center = page.getByRole("button", { name: "传输中心", exact: true });
    async function createFileView() {
      await run.getByRole("button", { name: "信任并连接" }).click();
      await run.getByRole("button", { name: "分栏文件" }).click();
      await attached.getByRole("button", { name: "打开独立双栏" }).click();
      return (await selected.getAttribute("data-file-session-id"))!;
    }
    const origin = await createFileView();
    await page.getByRole("button", { name: "返回 SSH" }).click();
    await run.getByRole("button", { name: "跨端目标", exact: true }).click();
    const target = await createFileView();
    await page
      .getByRole("complementary", { name: "独立文件会话" })
      .getByRole("button", { name: /跨端源.*原连接在线/ })
      .click();
    const rows = page.getByTestId("ssh-transfer-row");
    const rowById = (id: string) => rows.and(page.locator(`[data-transfer-id="${id}"]`));
    async function copy(to: string) {
      await selected.getByRole("button", { name: "跨 SSH 复制 cross.bin" }).click();
      const dialog = page.getByRole("dialog", { name: "复制到另一 SSH 会话" });
      await dialog.getByLabel("目标文件会话", { exact: true }).selectOption(target);
      await dialog.getByLabel("远端目标绝对文件路径").fill(to);
      await dialog.getByRole("button", { name: "加入传输中心" }).click();
      await expect(dialog).toHaveCount(0);
      await center.click();
      const first = rows.first();
      await expect(first).toHaveAttribute("data-state", "waiting");
      return (await first.getAttribute("data-transfer-id"))!;
    }
    const id = await copy(name);
    const job = rowById(id);
    await job.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("button", { name: "校验后续传" }).click();
    await expect.poll(() => held).toBe(true);
    await job.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(job).toHaveAttribute("data-state", "paused");
    delay = false;
    ended.resolve();
    expect(destination.fs.files.get(name)).toEqual(prefix);
    await job.getByRole("button", { name: "继续", exact: true }).click();
    await expect(job).toHaveAttribute("data-state", "completed");
    expect(destination.fs.files.get(name)).toEqual(bytes);
    expect(source.fs.files.get(name)).toEqual(bytes);
    expect(destination.fs.timestamps.get(name)).toBe(1_650_000_123);
    expect(destination.fs.permissions.get(name)).toBe(0o640);
    await job.getByRole("button", { name: "返回原文件会话" }).click();
    await expect(selected).toHaveAttribute("data-file-session-id", origin);
    const mismatch = rowById(await copy(bad));
    await mismatch.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("button", { name: "校验后续传" }).click();
    await expect(mismatch).toHaveAttribute("data-state", "failed");
    await expect(mismatch).toContainText("续传前缀不匹配");
    expect(destination.fs.files.get(bad)?.toString()).toBe("错误前缀");
    expect([...destination.fs.files.keys()].sort()).toEqual([bad, name].sort());
    await mismatch.getByRole("button", { name: "返回原文件会话" }).click();
    destination.fs.files.set(retryPath, Buffer.from("原可恢复目标"));
    const retryId = await copy(retryPath);
    const retry = rowById(retryId);
    failInstall = true;
    await retry.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("button", { name: "确认覆盖" }).click();
    await expect(retry).toHaveAttribute("data-state", "failed");
    expect(destination.fs.files.get(retryPath)?.toString()).toBe("原可恢复目标");
    expect([...destination.fs.files.keys()].filter((file) => file.includes(".huhu-transfer-"))).toEqual([]);
    await retry.getByRole("button", { name: "重试原任务" }).click();
    await expect(retry).toHaveAttribute("data-state", "completed");
    expect(destination.fs.files.get(retryPath)).toEqual(bytes);

    await retry.getByRole("button", { name: "返回原文件会话" }).click();
    destination.fs.files.set(cancelPath, Buffer.from("取消时的原目标"));
    ended = Promise.withResolvers<void>();
    delay = true;
    held = false;
    const cancelling = rowById(await copy(cancelPath));
    await cancelling.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("button", { name: "确认覆盖" }).click();
    await expect.poll(() => held).toBe(true);
    await cancelling.getByRole("button", { name: "取消传输" }).click();
    delay = false;
    ended.resolve();
    await expect(cancelling).toHaveAttribute("data-state", "cancelled");
    expect(destination.fs.files.get(cancelPath)?.toString()).toBe("取消时的原目标");
    expect([...destination.fs.files.keys()].filter((file) => file.includes(".huhu-transfer-"))).toEqual([]);

    await cancelling.getByRole("button", { name: "返回原文件会话" }).click();
    const backupBytes = Buffer.from("需保留的旧目标");
    destination.fs.files.set(uncertainPath, backupBytes);
    const uncertain = rowById(await copy(uncertainPath));
    await uncertain.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("button", { name: "确认覆盖" }).click();
    await expect(uncertain).toHaveAttribute("data-state", "uncertain");
    const [backup] = [...destination.fs.files.keys()].filter((file) => file.endsWith(".old"));
    expect(destination.fs.files.get(backup!)).toEqual(backupBytes);
    await expect(uncertain).toContainText(backup!);
    await expect(uncertain.getByRole("button", { name: "重试原任务" })).toHaveCount(0);
    const recheck = uncertain.getByRole("button", { name: "重查提交结果" });
    await recheck.click();
    await expect(recheck).toBeEnabled();
    await expect(uncertain).toContainText(backup!);
    hideReadback = false;
    await recheck.click();
    await expect(uncertain).toHaveAttribute("data-state", "completed");
    await expect(uncertain).toContainText("已从原端点回读确认提交");
    expect(destination.fs.files.get(uncertainPath)).toEqual(bytes);
    expect(destination.fs.files.has(backup!)).toBe(false);
    expect(installsWithLostReply).toBe(1);

    const input = { source: { kind: "remote", fileSessionId: origin, path: name }, target: { kind: "remote", fileSessionId: target, path: bad } };
    const linkPath = "/home/test/linked-target";
    destination.fs.links.set(linkPath, retryPath);
    const linked = await sshCall<TransferJob>(page, "ssh.transfers.start", { ...input, target: { ...input.target, path: linkPath } });
    expect(linked.ok).toBe(true);
    await expect(rowById(linked.data.transferId)).toHaveAttribute("data-state", "failed");
    await expect(rowById(linked.data.transferId)).toContainText("链接和目录不得覆盖");
    expect(destination.fs.links.get(linkPath)).toBe(retryPath);
    expect(destination.fs.files.get(retryPath)).toEqual(bytes);
    const capacity = (await sshCall<TransferQueue>(page, "ssh.transfers.list")).data.liveLimit;
    const jobs: string[] = [];
    for (let index = 0; index < capacity; index++) {
      const queued = await sshCall<TransferJob>(page, "ssh.transfers.start", input);
      expect(queued.ok).toBe(true);
      jobs.push(queued.data.transferId);
    }
    const full = await sshCall<TransferJob>(page, "ssh.transfers.start", input);
    expect(full.error?.message).toContain("队列已满");
    expect((await sshCall<TransferQueue>(page, "ssh.transfers.list")).data.canQueue).toBe(false);
    const cancelled = await sshCall<TransferJob>(page, "ssh.transfers.cancel", { transferId: jobs.at(-1) });
    expect(cancelled.data.state).toBe("cancelled");
    expect((await sshCall<TransferQueue>(page, "ssh.transfers.list")).data.canQueue).toBe(true);
    expect((await sshCall(page, "ssh.disconnect", { hostId: a.hostId })).ok).toBe(true);
    await expect
      .poll(async () => {
        const list = await sshCall<TransferQueue>(page, "ssh.transfers.list");
        const original = list.data.jobs.filter(({ transferId }) => jobs.includes(transferId));
        return original.length === jobs.length && original.every(({ state }) => state === "failed" || state === "cancelled");
      })
      .toBe(true);
    expect(destination.fs.files.get(bad)?.toString()).toBe("错误前缀");
  } finally {
    ended.resolve();
    await fixture.close();
    await Promise.all([source.close(), destination.close()]);
  }
});

test("H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  const first = await startFakeSsh({ password });
  const second = await startFakeSsh({ password });
  const fixture = await openApp();
  try {
    const { page, app, vault } = fixture;
    const localRoot = path.join(vault, "selected-root");
    const outside = path.join(vault, "outside-batch");
    mkdirSync(path.join(localRoot, "tree", "nested"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(localRoot, "tree", "ok.txt"), "目录中的新内容");
    writeFileSync(path.join(localRoot, "tree", "same.txt"), "不能覆盖的源内容");
    writeFileSync(path.join(localRoot, "tree", "nested", "excluded.txt"), "随父目录跳过");
    writeFileSync(path.join(localRoot, "extra.txt"), "同批独立文件");
    writeFileSync(path.join(outside, "outside.txt"), "不得遍历");
    symlinkSync(outside, path.join(localRoot, "tree", "escape"), "junction");
    first.fs.dirs.add("/home/test/tree");
    first.fs.dirs.add("/home/test/tree/nested");
    first.fs.dirs.add("/home/test/pull");
    first.fs.dirs.add("/home/test/pull/sub");
    first.fs.files.set("/home/test/tree/same.txt", Buffer.from("远端原文件"));
    first.fs.files.set("/home/test/tree/nested/keep.txt", Buffer.from("远端子目录原件"));
    first.fs.files.set("/home/test/pull/sub/pulled.txt", Buffer.from("从回环 SFTP 下载"));
    first.fs.links.set("/home/test/pull/remote-link", "/home/test/tree");
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = (async (ownerOrOptions, options) => {
        const props = options ?? ownerOrOptions;
        if (!("properties" in props) || !props.properties?.includes("openDirectory")) return { canceled: true, filePaths: [] };
        return { canceled: false, filePaths: [directory] };
      }) as typeof dialog.showOpenDialog;
    }, localRoot);
    await openWorkspace(page);
    const a = await configureLoopback(page, "批量甲", first.port, password);
    const b = await configureLoopback(page, "批量乙", second.port, password);
    expect(
      (
        await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
          name: "批量目录组",
          layout: { kind: "tabs" },
          panes: [{ hostId: a.hostId }, { hostId: b.hostId }],
        })
      ).ok,
    ).toBe(true);
    await page.getByRole("button", { name: /批量目录组.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    async function openSource() {
      await run.getByRole("button", { name: "信任并连接" }).click();
      await run.getByRole("button", { name: "分栏文件" }).click();
      await run.getByRole("button", { name: "打开独立双栏" }).click();
      return (await page.getByTestId("ssh-independent-files").filter({ visible: true }).getAttribute("data-file-session-id"))!;
    }
    const sourceId = await openSource();
    const local = page.getByRole("region", { name: "本机文件", exact: true });
    await local.getByRole("button", { name: "选择本机目录" }).click();
    await local.getByRole("checkbox", { name: "选择 tree", exact: true }).check();
    await local.getByRole("checkbox", { name: "选择 extra.txt", exact: true }).check();
    await local.getByRole("button", { name: "上传所选项目" }).click();
    await expect(page.getByText("已加入传输中心，目录和文件分别核对")).toBeVisible();
    const center = page.getByRole("button", { name: "传输中心", exact: true });
    await center.click();
    const all = page.getByTestId("ssh-transfer-row");
    const rootRow = all.filter({ hasText: /目录 · tree → tree/ });
    const nestedRow = all.filter({ hasText: /目录 · nested → nested/ });
    const fileRow = all.filter({ hasText: /same\.txt → same\.txt/ });
    await rootRow.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("dialog", { name: "已存在同名目录" }).getByRole("button", { name: "合并此目录" }).click();
    await nestedRow.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("dialog", { name: "已存在同名目录" }).getByRole("button", { name: "保留原目录" }).click();
    await fileRow.getByRole("button", { name: "处理冲突" }).click();
    await page.getByRole("dialog", { name: "已存在同名文件" }).getByRole("button", { name: "保留原文件" }).click();
    await expect(page.getByTestId("ssh-transfer-batch").first()).toHaveAttribute("data-state", "partial");
    await expect(all.filter({ hasText: "escape" })).toContainText("未遍历链接");
    expect(first.fs.files.get("/home/test/tree/ok.txt")?.toString()).toBe("目录中的新内容");
    expect(first.fs.files.get("/home/test/extra.txt")?.toString()).toBe("同批独立文件");
    expect(first.fs.files.get("/home/test/tree/same.txt")?.toString()).toBe("远端原文件");
    expect(first.fs.files.get("/home/test/tree/nested/keep.txt")?.toString()).toBe("远端子目录原件");
    expect(first.fs.files.has("/home/test/tree/nested/excluded.txt")).toBe(false);
    expect(first.fs.files.has("/home/test/tree/escape/outside.txt")).toBe(false);

    await page
      .getByRole("complementary", { name: "独立文件会话" })
      .getByRole("button", { name: /批量甲.*原连接在线/ })
      .click();
    const pull = page
      .getByTestId("ssh-independent-files")
      .filter({ visible: true })
      .getByTestId("files-panel")
      .getByTestId("files-row")
      .filter({ has: page.getByRole("checkbox", { name: "选择 pull", exact: true }) });
    await pull.dragTo(local);
    await expect(page.getByText("已加入传输中心，目录和文件分别核对")).toBeVisible();
    await center.click();
    await expect(page.getByTestId("ssh-transfer-batch").first()).toHaveAttribute("data-state", "partial");
    expect(readFileSync(path.join(localRoot, "pull", "sub", "pulled.txt")).toString()).toBe("从回环 SFTP 下载");

    await page.getByRole("button", { name: "返回 SSH" }).click();
    await run.getByRole("button", { name: "批量乙", exact: true }).click();
    const targetId = await openSource();
    const cross = await sshCall<TransferBatch>(page, "ssh.transfers.startBatch", {
      source: { kind: "remote", fileSessionId: sourceId, path: "/home/test/pull" },
      target: { kind: "remote", fileSessionId: targetId, path: "/home/test" },
      names: ["sub"],
    });
    expect(cross.ok, cross.error?.message).toBe(true);
    await center.click();
    await expect(page.getByTestId("ssh-transfer-batch").first()).toHaveAttribute("data-state", "completed");
    expect(second.fs.files.get("/home/test/sub/pulled.txt")?.toString()).toBe("从回环 SFTP 下载");
  } finally {
    await fixture.close();
    await Promise.all([first.close(), second.close()]);
  }
});

test("H7.3 原生 ZIP 列表、摘要及解压绑定实际设备，失败保留原件", async () => {
  test.setTimeout(90_000);
  const password = randomUUID();
  const archiveHost = await startFakeSsh({ password });
  const noSftp = await startFakeSsh({ password, noSftp: true });
  const fixture = await openApp();
  try {
    const { page, app, vault } = fixture;
    const localRoot = path.join(vault, "native-archive");
    mkdirSync(path.join(localRoot, "local-docs"), { recursive: true });
    writeFileSync(path.join(localRoot, "local-docs", "local.txt"), "本机 ZIP 成员");
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [directory] })) as typeof dialog.showOpenDialog;
    }, localRoot);
    const body = Buffer.from("绑定回环 SFTP 的归档内容");
    const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const file = "/home/test/docs/子目录/正文.txt";
    const stamp = 1_700_000_124;
    archiveHost.fs.dirs.add("/home/test/docs");
    archiveHost.fs.dirs.add("/home/test/docs/子目录");
    archiveHost.fs.files.set(file, body);
    archiveHost.fs.timestamps.set(file, stamp);
    archiveHost.fs.files.set("/home/test/broken.zip", Buffer.from("invalid zip"));
    await openWorkspace(page);
    const a = await configureLoopback(page, "归档甲", archiveHost.port, password);
    const b = await configureLoopback(page, "无 SFTP 乙", noSftp.port, password);
    expect(
      (
        await sshCall<WorkspaceRun>(page, "ssh.workspace.runs.start", {
          name: "归档能力双端",
          layout: { kind: "tabs" },
          panes: [{ hostId: a.hostId }, { hostId: b.hostId }],
        })
      ).ok,
    ).toBe(true);
    await page.getByRole("button", { name: /归档能力双端.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    const panel = page.getByTestId("ssh-independent-files").filter({ visible: true });
    async function openBoundFiles() {
      await run.getByRole("button", { name: "信任并连接" }).click();
      await run.getByRole("button", { name: "分栏文件" }).click();
      await run.getByRole("button", { name: "打开独立双栏" }).click();
      return (await panel.getAttribute("data-file-session-id"))!;
    }
    const id = await openBoundFiles();
    await panel.getByText("远端 ZIP 归档", { exact: true }).click();
    const remote = panel.getByRole("region", { name: "远端归档能力" });
    await expect(remote).toContainText("ZIP 可用");
    await expect(remote).toContainText("TAR、TGZ 和 7z");
    await remote.getByLabel("归档项目", { exact: true }).selectOption("docs");
    await remote.getByRole("button", { name: "生成 ZIP" }).click();
    await page.getByRole("dialog", { name: "生成 ZIP 归档" }).getByRole("button", { name: "确认", exact: true }).click();
    const result = remote.getByTestId("ssh-archive-result");
    await expect(result).toContainText("docs/子目录/正文.txt", { timeout: 20_000 });
    await expect(result).toContainText(digest(body));
    const zip = archiveHost.fs.files.get("/home/test/docs.zip");
    expect(zip?.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await expect(result).toContainText(digest(zip!));

    await remote.getByLabel("归档项目", { exact: true }).selectOption("docs.zip");
    await remote.getByRole("button", { name: "查看 ZIP 清单" }).click();
    await expect(result).toContainText(digest(body));
    await expect(result).toContainText(digest(zip!));
    await remote.getByRole("button", { name: "解压至新目录" }).click();
    const unpack = page.getByRole("dialog", { name: "解压 ZIP 到新目录" });
    await unpack.getByLabel("新目录名称").fill("unpacked");
    await unpack.getByRole("button", { name: "确认", exact: true }).click();
    await expect(result).toContainText("已解压至 /home/test/unpacked");
    const restored = "/home/test/unpacked/docs/子目录/正文.txt";
    expect(archiveHost.fs.files.get(restored)).toEqual(body);
    expect(archiveHost.fs.timestamps.get(restored)).toBe(stamp);
    const req = { directory: { kind: "remote", fileSessionId: id, path: "/home/test" }, name: "docs.zip", operation: "extract", output: "unpacked" };
    expect((await sshCall(page, "ssh.archives.run", req)).ok).toBe(false);
    expect(archiveHost.fs.files.get(restored)).toEqual(body);
    await remote.getByLabel("归档项目", { exact: true }).selectOption("broken.zip");
    await remote.getByRole("button", { name: "查看 ZIP 清单" }).click();
    await expect(remote.getByRole("alert")).toContainText("ZIP 损坏");
    expect([...archiveHost.fs.dirs, ...archiveHost.fs.files.keys()].some((name) => name.includes(".huhu-zip-"))).toBe(false);

    const local = panel.getByRole("region", { name: "本机文件", exact: true });
    await local.getByRole("button", { name: "选择本机目录" }).click();
    await local.getByText("本机 ZIP 归档", { exact: true }).click();
    const localTools = local.getByRole("region", { name: "本机归档能力" });
    await expect(localTools).toContainText("系统选择器支持单文件或目录");
    const localEndpoint = { kind: "local", path: localRoot };
    const made = await sshCall<ArchiveResult>(page, "ssh.archives.run", {
      directory: localEndpoint,
      localFileSessionId: id,
      name: "local-docs",
      operation: "compress",
      output: "local.zip",
    });
    expect(made.ok, made.error?.message).toBe(true);
    expect(digest(readFileSync(path.join(localRoot, "local.zip")))).toBe(made.data.archiveSha256);
    const extracted = await sshCall<ArchiveResult>(page, "ssh.archives.run", {
      directory: localEndpoint,
      localFileSessionId: id,
      name: "local.zip",
      operation: "extract",
      output: "restored",
    });
    expect(extracted.ok, extracted.error?.message).toBe(true);
    expect(extracted.data.entries.find(({ name }) => name === "local-docs/local.txt")?.sha256).toBe(digest(Buffer.from("本机 ZIP 成员")));
    expect(readFileSync(path.join(localRoot, "restored", "local-docs", "local.txt"), "utf8")).toBe("本机 ZIP 成员");

    await page.getByRole("button", { name: "返回 SSH" }).click();
    await run.getByRole("button", { name: "无 SFTP 乙", exact: true }).click();
    const idB = await openBoundFiles();
    const support = await sshCall<ArchiveSupport>(page, "ssh.archives.support", { fileSessionId: idB });
    expect(support.data.local.zip).toBe(true);
    expect(support.data.remote).toMatchObject({ zip: false, reason: expect.stringContaining("没有开启 SFTP") });
    await panel.getByText("远端 ZIP 归档", { exact: true }).click();
    const unsupported = panel.getByRole("region", { name: "远端归档能力" });
    await expect(unsupported).toContainText("ZIP 不可用");
    await expect(unsupported.getByRole("button", { name: "生成 ZIP" })).toBeDisabled();
  } finally {
    await fixture.close();
    await Promise.all([archiveHost.close(), noSftp.close()]);
  }
});
