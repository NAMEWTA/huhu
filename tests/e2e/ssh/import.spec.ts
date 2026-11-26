import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";

const imports = [
  ["openssh", "config", "Host openssh\n HostName openssh.invalid\n User fixture\n Port 2222"],
  ["putty", "putty.reg", 'Windows Registry Editor Version 5.00\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\putty]\n"HostName"="fixture@putty.invalid"\n"Protocol"="ssh"\n"PortNumber"=dword:000008ae'],
  ["xshell", "xshell.xsh", "[CONNECTION]\nHost=xshell.invalid\nPort=2222\nProtocol=SSH2\n[CONNECTION:AUTHENTICATION]\nUserName=fixture"],
  ["mobaxterm", "sessions.mxtsessions", "[Bookmarks_1]\nSubRep=Fixtures\\Moba\nmobaxterm=#109#0%mobaxterm.invalid%2222%fixture", "Fixtures / Moba"],
  ["windterm", "user.sessions", '[{"session.label":"windterm","session.group":"Fixtures/Wind","session.target":"fixture@windterm.invalid","session.port":2222,"session.protocol":"SSH"}]', "Fixtures / Wind"],
  [
    "electerm",
    "bookmarks.json",
    JSON.stringify({
      bookmarks: [{ id: "bm", title: "electerm", host: "electerm.invalid", port: "2222", username: "fixture", type: "ssh" }],
      bookmarkGroups: [{ id: "root", title: "Electerm fixtures", bookmarkIds: ["bm"] }],
    }),
    "Electerm fixtures",
  ],
  ["netcatty", "hosts.csv", "Groups,Label,Hostname/IP,Protocol,Port,Username\nFixtures/Cat,netcatty,netcatty.invalid,SSH2,2222,fixture", "Fixtures / Cat"],
  [
    "securecrt",
    "securecrt.ini",
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('S:"Protocol Name"=SSH2\nS:"Hostname"=securecrt.invalid\nS:"Username"=fixture\nD:"[SSH2] Port"=000008ae\nS:"Password V2"=synthetic-ciphertext', "utf16le")]),
  ],
] as const;

const nav = (page: Page) => page.getByRole("button", { name: "远程连接", exact: true }).first();
const moduleView = (page: Page) => page.getByTestId("ssh-module");
const hostList = (page: Page) => moduleView(page).getByRole("complementary", { name: "远程连接" });
const modal = (page: Page) => page.getByTestId("ssh-import-dialog");
const importButton = (page: Page) => moduleView(page).getByRole("button", { name: "导入主机", exact: true });
const submit = (page: Page) => modal(page).getByRole("button", { name: "导入所选主机" });

async function openSsh(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await nav(page).click();
  await expect(moduleView(page)).toBeVisible();
}

async function preview(page: Page, format: string, file: string) {
  await importButton(page).click();
  await modal(page).getByRole("combobox", { name: "来源格式" }).selectOption(format);
  const chooser = page.waitForEvent("filechooser");
  await modal(page).getByLabel("配置文件").click();
  await (await chooser).setFiles(file);
  await modal(page).getByRole("button", { name: "预览文件" }).click();
  await expect(modal(page).getByTestId("ssh-import-row").first()).toBeVisible();
}

type SavedHost = { id: string; name: string; host: string; user: string; port: number };
type Directory = { groups: { groupId: string; parentId: string | null; name: string }[]; hosts: { hostId: string; groupId: string | null }[] };

test("H3.4 OpenSSH 同步预览双向差异并保留命令文本", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await openSsh(page);
    const profile = { name: "Sync fixture", host: "sync.invalid", port: 22, user: "fixture", authKind: "agent" };
    const saved = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", { ...profile, expectedRevision: null });
    const list = () => desktopCall<Array<SavedHost & { revision: string; keepaliveIntervalSec?: number }>>(page, "ssh.hosts.list");
    const file = path.join(vault, "ssh-config-fixture");
    const text = (interval: number) => `Host sync-target\n    ServerAliveInterval ${interval}\nHost unrelated\n    ProxyCommand fixture-do-not-execute %h %p\n`;
    writeFileSync(file, text(30));
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [selected] })) as typeof dialog.showOpenDialog;
    }, file);
    await page.getByRole("button", { name: "跳板路由", exact: true }).click();
    await page.getByRole("button", { name: "OpenSSH 配置同步", exact: true }).click();
    await page.getByRole("button", { name: "选择配置文件", exact: true }).click();
    await expect(page.getByLabel("配置文件", { exact: true })).toHaveValue(file);
    await page.getByLabel("OpenSSH Host 别名", { exact: true }).fill("sync-target");
    await page.getByRole("combobox", { name: /Huhu 主机/ }).selectOption(saved.hostId);
    const inspect = page.getByRole("button", { name: "预览同步", exact: true });
    const interval = page.getByRole("listitem").filter({ hasText: "ServerAliveInterval" });

    await inspect.click();
    await expect(interval).toContainText("待确定基准");
    await interval.getByRole("button", { name: "将文件值应用到主机" }).click();
    await expect(interval).toContainText("一致");
    const applied = (await list()).find(({ id }) => id === saved.hostId)!;
    expect(applied.keepaliveIntervalSec).toBe(30);

    writeFileSync(file, text(40));
    await desktopCall(page, "ssh.hosts.configure", { ...profile, hostId: saved.hostId, expectedRevision: applied.revision, keepaliveIntervalSec: 60 });
    await inspect.click();
    await expect(interval).toContainText("两侧均有修改");
    await expect(interval.getByText("40", { exact: true })).toBeVisible();
    await expect(interval.getByText("60", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "收起预览", exact: true }).click();
    await expect(interval).toHaveCount(0);
    expect(readFileSync(file, "utf8")).toBe(text(40));

    await inspect.click();
    await expect(interval).toContainText("两侧均有修改");
    await interval.getByRole("button", { name: "将主机值写入文件" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ServerAliveInterval 同步结果已更新" })).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(text(60));
    await inspect.click();
    await expect(interval).toContainText("一致");
    expect((await list()).find(({ id }) => id === saved.hostId)?.keepaliveIntervalSec).toBe(60);
  } finally {
    await close();
  }
});

test("SSH 文件选择、八种格式映射、写入和重新打开目录", async () => {
  const fixtures = mkdtempSync(path.join(tmpdir(), "huhu-ssh-import-fixtures-"));
  const { app, page, vault, close } = await openApp();
  try {
    await openSsh(page);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1000));
    for (const [format, filename, contents, group] of imports) {
      const file = path.join(fixtures, filename);
      writeFileSync(file, contents);
      await preview(page, format, file);
      const row = modal(page).getByTestId("ssh-import-row");
      await expect(row).toContainText(`fixture@${format}.invalid:2222`);
      await expect(row).toContainText("可导入");
      if (group) await expect(row).toContainText(group);
      if (format === "securecrt") {
        await expect(row).toContainText("无法恢复加密口令");
        await expect(row).not.toContainText("synthetic-ciphertext");
        await modal(page).screenshot({ path: test.info().outputPath("ssh-preview.png") });
      }
      await submit(page).click();
      await expect(modal(page)).toBeHidden();
      await expect(hostList(page).getByRole("button", { name: new RegExp(`fixture@${format}\\.invalid`) })).toBeVisible();
    }
    const before = await desktopCall<SavedHost[]>(page, "ssh.hosts.list");
    const directory = await desktopCall<Directory>(page, "ssh.hosts.directory");
    expect(before).toHaveLength(imports.length);
    for (const [format] of imports) expect(before).toContainEqual(expect.objectContaining({ id: expect.stringMatching(/^host-owned-/), name: format, host: `${format}.invalid`, user: "fixture", port: 2222 }));
    expect(new Set(directory.hosts.map(({ hostId }) => hostId))).toEqual(new Set(before.map(({ id }) => id)));
    await nav(page).click();
    await page.reload();
    await openSsh(page);
    expect(await desktopCall(page, "ssh.hosts.list")).toEqual(before);
    expect(await desktopCall(page, "ssh.hosts.directory")).toEqual(directory);
    await hostList(page)
      .getByRole("button", { name: /fixture@windterm\.invalid/ })
      .click();
    await expect(moduleView(page).getByText("Fixtures / Wind", { exact: true })).toBeVisible();
    expect(existsSync(path.join(vault, ".huhu", "ssh", "known_hosts"))).toBe(false);
  } finally {
    try {
      await close();
    } finally {
      rmTree(fixtures);
    }
  }
});

test("SSH 取消零写入、过期重新预览、冲突处理和相同主机身份补齐分组", async () => {
  const fixtures = mkdtempSync(path.join(tmpdir(), "huhu-ssh-import-retry-"));
  const { app, page, vault, close } = await openApp();
  try {
    await openSsh(page);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(960, 600));
    const saved = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", { name: "Mirror", host: "mirror.invalid", port: 22, user: "fixture", authKind: "agent", expectedRevision: null });
    const existing = (await desktopCall<SavedHost[]>(page, "ssh.hosts.list")).find((host) => host.id === saved.hostId);
    expect(existing).toBeDefined();
    const initial = await desktopCall(page, "ssh.hosts.directory");
    const file = path.join(fixtures, "conflicts.csv");
    writeFileSync(
      file,
      [
        "Groups,Label,Hostname/IP,Protocol,Port,Username,Password,Startup command,Comment",
        "Fixtures/Lab,Ready,ready.invalid,SSH2,2222,fixture,synthetic-password,synthetic-command,synthetic-comment",
        "Fixtures/Lab,Mirror,renamed.invalid,SSH2,22,fixture,,,",
        "Fixtures,Endpoint,mirror.invalid,SSH2,22,fixture,,,",
        "Fixtures,Duplicate,ready.invalid,SSH2,2222,fixture,,,",
        "Fixtures,Bad,bad.invalid,SSH2,65536,fixture,,,",
        "Fixtures,Unchecked,unchecked.invalid,SSH2,22,fixture,,,",
      ].join("\n"),
    );
    await preview(page, "netcatty", file);
    const rows = modal(page).getByTestId("ssh-import-row");
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(0)).toContainText("命令字段已忽略");
    await expect(rows.nth(0)).toContainText("认证资料需要重新配置");
    await expect(rows.nth(0)).toContainText("字段暂不支持");
    await expect(rows.nth(0)).not.toContainText(/synthetic-(password|command|comment)/);
    await expect(rows.nth(2)).toContainText("端点与已保存主机冲突，须跳过");
    await expect(rows.nth(2).getByRole("checkbox")).toBeDisabled();
    await expect(rows.nth(3)).toContainText("端点与文件内条目 #1 冲突");
    await expect(rows.nth(4)).toContainText("端口无效");
    await expect(rows.nth(4).getByRole("checkbox")).toBeDisabled();
    await expect(submit(page)).toBeInViewport();
    await rows.nth(1).scrollIntoViewIfNeeded();
    await modal(page).screenshot({ path: test.info().outputPath("ssh-conflict.png") });
    await page.keyboard.press("Escape");
    await expect(modal(page)).toBeHidden();
    await expect(importButton(page)).toBeFocused();
    expect(await desktopCall(page, "ssh.hosts.list")).toEqual([existing]);
    expect(await desktopCall(page, "ssh.hosts.directory")).toEqual(initial);

    await preview(page, "netcatty", file);
    await desktopCall(page, "ssh.hosts.configure", { name: "Concurrent", host: "concurrent.invalid", port: 22, user: "fixture", authKind: "agent", expectedRevision: null });
    await submit(page).click();
    await expect(modal(page).getByRole("alert")).toContainText("预览已过期");
    await expect(submit(page)).toHaveCount(0);
    expect(await desktopCall<SavedHost[]>(page, "ssh.hosts.list")).toHaveLength(2);
    await modal(page).getByRole("button", { name: "重新预览" }).click();
    await expect(rows).toHaveCount(6);
    await rows.nth(1).getByRole("checkbox").check();
    await submit(page).click();
    await expect(modal(page).getByRole("alert")).toContainText("主机名称重复");
    await rows.nth(1).getByRole("textbox").fill("Mirror Copy");
    await rows.nth(3).getByRole("checkbox").check();
    await submit(page).click();
    await expect(modal(page).getByRole("alert")).toContainText("端点相同");
    await rows.nth(3).getByRole("checkbox").uncheck();
    await rows.nth(5).getByRole("checkbox").uncheck();

    const directoryFile = path.join(vault, ".huhu", "ssh", "host-directory.json");
    mkdirSync(path.dirname(directoryFile), { recursive: true });
    writeFileSync(directoryFile, "{broken");
    await submit(page).click();
    await expect(modal(page).getByRole("status")).toHaveText("已保存 2 台主机，分组待补齐。");
    await modal(page).screenshot({ path: test.info().outputPath("ssh-groups-pending.png") });
    const pending = await desktopCall<SavedHost[]>(page, "ssh.hosts.list");
    expect(pending.map(({ name }) => name).sort()).toEqual(["Concurrent", "Mirror", "Mirror Copy", "Ready"]);
    expect(readFileSync(directoryFile, "utf8")).toBe("{broken");
    await modal(page).getByRole("button", { name: "关闭", exact: true }).last().click();
    await expect(modal(page)).toBeHidden();
    await expect(hostList(page).getByRole("button", { name: /Mirror Copy/ })).toBeVisible();
    rmSync(directoryFile);
    await moduleView(page).getByRole("button", { name: "补齐导入分组" }).click();
    await modal(page).getByRole("button", { name: "重试保存分组" }).click();
    await expect(modal(page)).toBeHidden();
    await expect(moduleView(page).getByRole("status").filter({ hasText: "已导入 2 台主机。" })).toBeVisible();
    expect(await desktopCall(page, "ssh.hosts.list")).toEqual(pending);
    const directory = await desktopCall<Directory>(page, "ssh.hosts.directory");
    const group = directory.groups.find(({ name }) => name === "Lab");
    expect(group?.parentId).toBe(directory.groups.find(({ name }) => name === "Fixtures")?.groupId);
    for (const name of ["Mirror Copy", "Ready"]) {
      const id = pending.find((host) => host.name === name)?.id;
      expect(directory.hosts).toContainEqual(expect.objectContaining({ hostId: id, groupId: group?.groupId }));
    }
    await hostList(page)
      .getByRole("button", { name: /Mirror Copy/ })
      .click();
    await expect(moduleView(page).getByText("Fixtures / Lab", { exact: true })).toBeVisible();
  } finally {
    try {
      await close();
    } finally {
      rmTree(fixtures);
    }
  }
});

test("SSH Web 入口可查看已保存主机和分组，导入入口仅出现在桌面", async () => {
  test.skip(!browserBinary, "当前环境未安装 Playwright Chromium 或 Microsoft Edge");
  const fixtures = mkdtempSync(path.join(tmpdir(), "huhu-ssh-import-web-"));
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await openSsh(page);
    const [, filename, contents] = imports[6];
    const file = path.join(fixtures, filename);
    writeFileSync(file, contents);
    await preview(page, "netcatty", file);
    await submit(page).click();
    await expect(modal(page)).toBeHidden();
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary, headless: true });
    const tab = await browser.newPage();
    await tab.goto(link);
    await nav(tab).click();
    await expect(hostList(tab).getByRole("button", { name: /fixture@netcatty\.invalid/ })).toBeVisible();
    await expect(moduleView(tab).getByText("Fixtures / Cat", { exact: true })).toBeVisible();
    await expect(importButton(tab)).toHaveCount(0);
    for (const name of ["新增 SSH 主机", "编辑主机", "复制主机", "删除主机"]) {
      await expect(moduleView(tab).getByRole("button", { name, exact: true })).toHaveCount(0);
    }
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await close();
      } finally {
        rmTree(fixtures);
      }
    }
  }
});
