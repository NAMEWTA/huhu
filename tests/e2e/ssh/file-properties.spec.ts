import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, test, type Browser } from "@playwright/test";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { localPosixCommand } from "../../../plugins/ssh/test/shell-relay-fixture.js";
import { privilegedSftpCommand } from "../../../plugins/ssh/src/engine/privileged-sftp.js";
import { openApp } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";

test("A09 desktop transfers a single file in both directions when SFTP is unavailable", async () => {
  test.skip(process.platform !== "linux" || !existsSync("/usr/bin/scp"), "Linux OpenSSH scp is required");
  const password = randomUUID();
  const server = await startFakeSsh({
    password,
    noSftp: true,
    onInteractiveExec: (command, channel) => {
      if (!command.startsWith("command -v scp >/dev/null 2>&1") && !command.includes("exec scp -f -- ") && !(command.startsWith("cd -P -- ") && command.includes(".huhu-scp-"))) return false;
      localPosixCommand(channel, command);
      return true;
    },
  });
  const fixture = await openApp();
  try {
    const { app, page, vault } = fixture;
    const name = "only-scp.bin";
    const remote = path.join(vault, name);
    const destination = path.join(vault, "downloads");
    const data = Buffer.from([0xff, 0x00, 0x11]);
    await mkdir(destination);
    await writeFile(remote, data);
    await app.evaluate(
      ({ dialog }, targets) => {
        dialog.showOpenDialog = (async (_parent, options) => ({
          canceled: false,
          filePaths: [options?.properties?.includes("openFile") ? targets.file : targets.directory],
        })) as typeof dialog.showOpenDialog;
      },
      { directory: destination, file: path.join(destination, name) },
    );
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "SCP 回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "SCP 工作区", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /SCP 工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    const panel = run.getByRole("region", { name: "SCP 单文件下载" });
    await expect(panel.getByRole("status")).toHaveText("原连接支持 SCP 下载");
    await panel.getByLabel("远端文件绝对路径").fill(remote);
    await panel.getByRole("button", { name: "选择本机目录" }).click();
    await panel.getByRole("button", { name: "下载文件" }).click();
    await expect(panel.getByText("已下载 3 字节", { exact: false })).toBeVisible();
    expect(await readFile(path.join(destination, name))).toEqual(data);
    const upload = run.getByRole("region", { name: "SCP 单文件上传" });
    await expect(upload.getByRole("status")).toHaveText("原连接支持 SCP 上传");
    const uploaded = path.join(vault, "received 'fixture'.bin");
    await upload.getByRole("button", { name: "选择本机文件" }).click();
    await upload.getByLabel("新建远端文件绝对路径").fill(uploaded);
    await upload.getByRole("button", { name: "上传文件" }).click();
    await expect(upload.getByText("已上传 3 字节", { exact: false })).toBeVisible();
    expect(await readFile(uploaded)).toEqual(data);
    await upload.getByRole("button", { name: "上传文件" }).click();
    await expect(upload.getByRole("alert")).toContainText("目标已存在");
    expect(await readFile(uploaded)).toEqual(data);
    expect(server.conns).toHaveLength(1);
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("A09 desktop sudo SFTP edits an actual root-owned file and leaves the shell connected", async () => {
  test.skip(process.platform !== "linux" || !existsSync("/usr/lib/openssh/sftp-server") || spawnSync("sudo", ["-n", "true"]).status !== 0, "需要 Linux OpenSSH sftp-server 和免交互 sudo");
  const password = randomUUID();
  const server = await startFakeSsh({
    password,
    onInteractiveExec(command, channel) {
      if (command !== privilegedSftpCommand) return false;
      localPosixCommand(channel, command);
      return true;
    },
  });
  const fixture = await openApp();
  try {
    const { page, vault } = fixture;
    const seed = path.join(vault, "sudo-seed.txt");
    const target = path.join(vault, "sudo-test.txt");
    await writeFile(seed, "原内容");
    execFileSync("sudo", ["-n", "install", "-m", "600", seed, target]);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "sudo 文件测试",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "sudo 文件工作区", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /sudo 文件工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    await run.getByText("文件后端", { exact: true }).click();
    const sudo = run.getByRole("region", { name: "sudo 文件操作" });
    await sudo.getByRole("button", { name: "检查 sudo 文件权限" }).click();
    await expect(sudo.getByRole("status")).toContainText("已启用 sudo");
    await sudo.getByLabel("sudo 文件路径").fill(target);
    await sudo.getByRole("button", { name: "打开文本" }).click();
    const editor = page.getByRole("dialog", { name: "以 sudo 编辑远端文本" });
    await editor.getByRole("textbox", { name: "正文" }).fill("新内容");
    await editor.getByRole("button", { name: "保存远端文件" }).click();
    await expect(editor.getByText("已保存远端文件")).toBeVisible();
    expect(execFileSync("sudo", ["-n", "cat", "--", target], { encoding: "utf8" })).toBe("新内容");
    expect(execFileSync("sudo", ["-n", "stat", "-c", "%u:%a", "--", target], { encoding: "utf8" }).trim()).toBe("0:600");
    await editor.getByRole("button", { name: "关闭编辑" }).click();
    await sudo.getByRole("button", { name: "sudo 属性与移动" }).click();
    const props = page.getByRole("dialog", { name: "sudo 文件属性" });
    const moved = path.join(vault, "sudo-renamed.txt");
    await props.getByLabel("移动到（远端绝对路径）").fill(moved);
    await props.getByRole("button", { name: "移动项目" }).click();
    await expect(props).toHaveCount(0);
    expect(execFileSync("sudo", ["-n", "cat", "--", moved], { encoding: "utf8" })).toBe("新内容");
    await sudo.getByLabel("sudo 文件路径").fill(moved);
    await sudo.getByRole("button", { name: "sudo 删除项目" }).click();
    await page.getByRole("dialog", { name: "确认 sudo 删除" }).getByRole("button", { name: "确认删除" }).click();
    await expect.poll(() => existsSync(moved)).toBe(false);
    await sudo.getByRole("button", { name: "退出 sudo 文件操作" }).click();
    await expect(sudo.getByRole("button", { name: "检查 sudo 文件权限" })).toBeVisible();
    await expect(run.getByTestId("terminal-view")).toHaveAttribute("data-state", "open");
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("A09 external editor copies text locally and writes back through the original SFTP revision", async () => {
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  const fixture = await openApp();
  try {
    const { app, page, vault } = fixture;
    const local = path.join(vault, "test-external-copy.txt");
    const source = "/home/test/draft.txt";
    server.fs.files.set(source, Buffer.from("original text"));
    server.fs.permissions.set(source, 0o640);
    await app.evaluate(({ dialog, shell }, output) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: output })) as typeof dialog.showSaveDialog;
      shell.openPath = async (file) => (file === output ? "" : "unexpected editor target");
    }, local);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "外部编辑回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "外部编辑工作区", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /外部编辑工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    await run.getByTestId("files-panel").getByRole("button", { name: "编辑 draft.txt" }).click();
    const editor = page.getByRole("dialog", { name: "编辑远端文本" });
    await editor.getByRole("button", { name: "保存并用外部编辑器打开" }).click();
    await expect(editor.getByRole("status")).toContainText("已打开本机副本");
    expect(await readFile(local, "utf8")).toBe("original text");
    await writeFile(local, "saved by the external editor");
    await editor.getByRole("button", { name: "读取本机副本" }).click();
    await expect(editor.getByLabel("正文")).toHaveValue("saved by the external editor");
    expect(server.fs.files.get(source)?.toString()).toBe("original text");
    await editor.getByRole("button", { name: "保存远端文件" }).click();
    await expect.poll(() => server.fs.files.get(source)?.toString()).toBe("saved by the external editor");
    expect(server.fs.permissions.get(source)).toBe(0o640);

    await writeFile(local, "another external edit");
    server.fs.files.set(source, Buffer.from("concurrent remote edit"));
    await editor.getByRole("button", { name: "读取本机副本" }).click();
    await editor.getByRole("button", { name: "保存远端文件" }).click();
    await expect(editor.getByRole("button", { name: "读取远端新版本" })).toBeVisible();
    expect(server.fs.files.get(source)?.toString()).toBe("concurrent remote edit");
    expect(await readFile(local, "utf8")).toBe("another external edit");
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("A08 Linux desktop creates, lists and extracts a ZIP over the bound SFTP connection", async () => {
  test.skip(process.platform !== "linux" || !existsSync("/usr/bin/python3"), "Linux system Python 3 is required");
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  const app = await openApp();
  try {
    const { page } = app;
    const source = "/home/test/project";
    const content = Buffer.from("ZIP fixture from Linux");
    server.fs.dirs.add(source);
    server.fs.files.set(`${source}/report.txt`, content);
    server.fs.timestamps.set(`${source}/report.txt`, 1_700_000_001);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "ZIP 回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "ZIP 工作区", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /ZIP 工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    const files = run.getByTestId("files-panel");
    await files.getByText("远端 ZIP 归档", { exact: true }).click();
    const archive = files.getByRole("region", { name: "远端归档能力" });
    const pick = archive.getByLabel("归档项目");
    await expect(archive.getByRole("status")).toContainText("ZIP 可用");
    await pick.selectOption("project");
    await archive.getByRole("button", { name: "生成 ZIP", exact: true }).click();
    await page.getByRole("dialog", { name: "生成 ZIP 归档" }).getByRole("button", { name: "确认", exact: true }).click();
    await expect.poll(() => server.fs.files.has("/home/test/project.zip")).toBe(true);
    await pick.selectOption("project.zip");
    await archive.getByRole("button", { name: "查看 ZIP 清单", exact: true }).click();
    await expect(archive.getByTestId("ssh-archive-result")).toContainText("project/report.txt");
    await archive.getByRole("button", { name: "解压至新目录", exact: true }).click();
    const extract = page.getByRole("dialog", { name: "解压 ZIP 到新目录" });
    await extract.getByLabel("新目录名称").fill("unpacked");
    await extract.getByRole("button", { name: "确认", exact: true }).click();
    const unpacked = "/home/test/unpacked/project/report.txt";
    await expect.poll(() => server.fs.files.get(unpacked)).toEqual(content);
    expect(server.fs.timestamps.get(unpacked)).toBe(1_700_000_001);
  } finally {
    await app.close();
    await server.close();
  }
});

test("H6.2 工作台展示实际属性并在原 SFTP 会话中修改、移动和创建链接", async () => {
  const password = randomUUID();
  const fixture = await openApp();
  const server = await startFakeSsh({ password, denySetAttributes: (file) => file.endsWith("/locked.txt") });
  const original = "/home/test/original.txt";
  const locked = "/home/test/locked.txt";
  const moved = "/home/test/sub/result.txt";
  try {
    const { page, app } = fixture;
    server.fs.files.set(original, Buffer.from("original bytes"));
    server.fs.files.set(locked, Buffer.from("retained bytes"));
    server.fs.dirs.add("/home/test/sub");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "属性回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "属性验收", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /属性验收.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    const files = run.getByTestId("files-panel");
    const properties = page.getByRole("dialog", { name: "远端文件属性" });
    const mode = properties.getByLabel("权限（八进制）");
    await files.getByRole("button", { name: "属性 original.txt" }).click();
    await expect(mode).toHaveValue("644");
    await expect(properties.getByLabel("所有者 UID")).toHaveValue("1000");
    await mode.fill("640");
    await properties.getByRole("button", { name: "保存权限" }).click();
    await expect.poll(() => server.fs.permissions.get(original)).toBe(0o640);
    await expect(properties.getByRole("button", { name: "保存权限" })).toBeDisabled();
    await properties.getByLabel("移动到（远端绝对路径）").fill(moved);
    await properties.getByRole("button", { name: "移动项目" }).click();
    await expect(properties).toBeHidden();
    expect(server.fs.files.has(original)).toBe(false);
    expect(server.fs.files.get(moved)?.toString()).toBe("original bytes");

    await files.getByRole("button", { name: "属性 locked.txt" }).click();
    await mode.fill("600");
    await properties.getByRole("button", { name: "保存权限" }).click();
    await expect(properties.getByRole("alert")).toContainText("远端没有权限");
    expect(server.fs.permissions.has(locked)).toBe(false);
    expect(server.fs.files.get(locked)?.toString()).toBe("retained bytes");
    await properties.getByRole("button", { name: "关闭", exact: true }).click();
    await files.getByRole("button", { name: "新建符号链接" }).click();
    const createLink = page.getByRole("dialog", { name: "新建符号链接" });
    await createLink.getByLabel("名称").fill("linked.txt");
    await createLink.getByLabel("链接目标").fill("sub/result.txt");
    await createLink.getByRole("button", { name: "创建", exact: true }).click();
    await files.getByRole("button", { name: "属性 linked.txt" }).click();
    await expect(properties.getByText("sub/result.txt", { exact: true })).toBeVisible();
    await expect(properties.getByRole("button", { name: "保存权限" })).toHaveCount(0);
    await test.info().attach("bound-file-link-properties", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("A07 独立 Web 文件会话按路径前进和返回，保留桌面来源与原连接", async () => {
  test.skip(!browserBinary, "需要 Playwright Chromium");
  test.setTimeout(60_000);
  const password = randomUUID();
  const fixture = await openApp();
  const server = await startFakeSsh({ password });
  let browser: Browser | undefined;
  try {
    const { page } = fixture;
    for (const name of ["docs", "pictures"]) server.fs.dirs.add(`/home/test/${name}`);
    server.fs.files.set("/home/test/docs/marker.txt", Buffer.from("directory fixture"));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "浏览器文件源",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await desktopCall(page, "ssh.workspace.runs.start", { name: "浏览器文件工作区", layout: { kind: "one" }, panes: [{ hostId }] });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /浏览器文件工作区.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const opened = page.getByTestId("ssh-independent-files").filter({ visible: true });
    const sessionId = await opened.getAttribute("data-file-session-id");
    const connectionId = await opened.getAttribute("data-connection-id");
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary });
    const web = await browser.newPage({ viewport: { width: 950, height: 820 } });
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    await web.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await web.getByTestId("ssh-module").getByRole("button", { name: "独立文件会话", exact: true }).click();
    await web
      .getByRole("complementary", { name: "独立文件会话" })
      .getByRole("button", { name: /浏览器文件源/ })
      .click();
    const independent = web.getByTestId("ssh-independent-files").filter({ visible: true });
    await expect(independent).toHaveAttribute("data-file-session-id", sessionId!);
    await expect(independent).toHaveAttribute("data-connection-id", connectionId!);
    const files = independent.getByTestId("files-panel");
    const current = files.getByTestId("files-path");
    const address = files.getByLabel("远端路径", { exact: true });
    const next = files.getByRole("button", { name: "前进目录", exact: true });
    await expect(current).toHaveText("/home/test");
    await address.fill("/home/test/docs");
    await address.press("Enter");
    await expect(files.getByRole("button", { name: "marker.txt", exact: true })).toBeVisible();
    await files.getByRole("button", { name: "返回目录", exact: true }).click();
    await expect(current).toHaveText("/home/test");
    await address.fill("/home/test/unavailable");
    await files.getByRole("button", { name: "转到路径", exact: true }).click();
    await expect(files.getByRole("alert")).toContainText("远端不存在");
    await expect(current).toHaveText("/home/test");
    await next.click();
    await expect(current).toHaveText("/home/test/docs");
    await files.getByRole("button", { name: "返回目录", exact: true }).click();
    await address.fill("/home/test/pictures");
    await address.press("Enter");
    await expect(current).toHaveText("/home/test/pictures");
    await expect(next).toBeDisabled();
    await expect(independent).toHaveAttribute("data-connection-id", connectionId!);
    const tabOpening = web.context().waitForEvent("page");
    await independent.getByRole("link", { name: "在浏览器新标签页打开" }).click();
    const filesTab = await tabOpening;
    const tabPane = filesTab.getByTestId("ssh-independent-files");
    await expect(tabPane).toHaveAttribute("data-file-session-id", sessionId!);
    await expect(tabPane).toHaveAttribute("data-connection-id", connectionId!);
    await expect(tabPane.getByTestId("files-path")).toHaveText("/home/test");
    await filesTab.close();
    expect(server.conns).toHaveLength(1);
  } finally {
    try {
      await browser?.close();
    } finally {
      await fixture.close();
      await server.close();
    }
  }
});

test("A07 从未连接主机打开独立文件管理并单独释放原连接", async () => {
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  const fixture = await openApp();
  try {
    const { page } = fixture;
    server.fs.files.set("/home/test/independent.txt", Buffer.from("independent file"));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await desktopCall(page, "ssh.hosts.configure", {
      name: "文件直开回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "打开独立文件管理", exact: true }).click();
    await page.getByTestId("hostkey-dialog").getByRole("button", { name: "信任并连接" }).click();
    await expect(page.getByText("independent.txt", { exact: true })).toBeVisible();
    expect(server.conns).toHaveLength(1);
    expect(await desktopCall(page, "ssh.shells.list")).toEqual([]);
    await page.getByRole("button", { name: "关闭独立文件视图" }).click();
    await expect.poll(() => server.closed()).toBe(1);
  } finally {
    await fixture.close();
    await server.close();
  }
});

test("A07 外置原生文件窗口保留打开时的分栏并在关闭后保留 SSH", async () => {
  const password = randomUUID();
  const first = await startFakeSsh({ password });
  const second = await startFakeSsh({ password });
  const fixture = await openApp();
  const preferenceKey = "huhu.ssh.device-preferences.v1";
  let previousPreferences: string | null | undefined;
  try {
    const { app, page } = fixture;
    first.fs.files.set("/home/test/from-first.txt", Buffer.from("first"));
    second.fs.files.set("/home/test/from-second.txt", Buffer.from("second"));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    previousPreferences = await page.evaluate((key) => localStorage.getItem(key), preferenceKey);
    const ssh = page.getByRole("button", { name: "远程连接", exact: true }).first();
    await ssh.click();
    await page.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true }).click();
    const settings = page.getByTestId("ssh-settings");
    await settings.getByPlaceholder("搜索 SSH 设置").fill("独立文件窗口");
    const mode = settings.getByLabel("独立文件窗口打开方式");
    await expect(mode).toHaveValue("tab");
    await mode.selectOption("window");
    await settings.getByRole("button", { name: "保存本机文件设置" }).click();
    await expect(settings.getByText("已保存到本机。")).toBeVisible();
    const panes = [];
    for (const [name, port] of [
      ["文件甲", first.port],
      ["文件乙", second.port],
    ] as const) {
      panes.push(
        await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
          name,
          host: "127.0.0.1",
          port,
          user: "fixture",
          authKind: "password",
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: password }],
        }),
      );
    }
    await desktopCall(page, "ssh.workspace.runs.start", {
      name: "文件窗口绑定",
      layout: { kind: "tabs" },
      panes: panes.map(({ hostId }) => ({ hostId })),
    });
    await ssh.click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /文件窗口绑定.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接" }).click();
    await run.getByRole("button", { name: "分栏文件" }).click();
    const opening = app.waitForEvent("window");
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const fileWindow = await opening;
    const filePane = fileWindow.getByTestId("ssh-independent-files");
    await expect(filePane.getByRole("heading", { name: /文件甲/ })).toBeVisible();
    await expect(filePane.getByRole("button", { name: "from-first.txt", exact: true })).toBeVisible();
    const bound = await filePane.getAttribute("data-connection-id");
    await run.getByRole("tab", { name: "文件乙", exact: true }).click();
    await run.getByRole("button", { name: "信任并连接" }).click();
    await expect(run.getByTestId("terminal-view").filter({ visible: true })).toHaveAttribute("data-state", "open");
    await expect(filePane).toHaveAttribute("data-connection-id", bound!);
    await expect(filePane.getByRole("button", { name: "from-second.txt" })).toHaveCount(0);
    await fileWindow.close();
    await run.getByRole("tab", { name: "文件甲", exact: true }).click();
    await expect(run.getByTestId("terminal-view").filter({ visible: true })).toHaveAttribute("data-state", "open");
    expect([first.conns.length, second.conns.length]).toEqual([1, 1]);
  } finally {
    try {
      if (previousPreferences !== undefined) {
        await fixture.page.evaluate(
          ({ key, saved }) => {
            if (saved === null) localStorage.removeItem(key);
            else localStorage.setItem(key, saved);
          },
          { key: preferenceKey, saved: previousPreferences },
        );
      }
    } finally {
      await fixture.close();
      await Promise.all([first.close(), second.close()]);
    }
  }
});
