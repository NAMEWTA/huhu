import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ManagedHostView } from "../../../plugins/ssh/src/engine/auth-profile.js";
import type { AuthKind } from "../../../plugins/ssh/src/shared/host-auth.js";
import type { DirectoryView } from "../../../plugins/ssh/src/engine/directory-schema.js";
import { openApp } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";

type Host = ReturnType<typeof ManagedHostView.parse>;
type Directory = ReturnType<typeof DirectoryView.parse>;

const moduleView = (page: Page) => page.getByTestId("ssh-module");
const dialog = (page: Page) => page.getByTestId("ssh-host-dialog");
const availability = (page: Page) => moduleView(page).getByTestId("ssh-host-auth-state");
const selectHost = (page: Page, name: string) =>
  moduleView(page)
    .getByRole("complementary")
    .getByRole("button", { name: new RegExp(`^${name} `) })
    .click();

async function openSsh(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
  await expect(moduleView(page)).toBeVisible();
}

async function openNew(page: Page, name: string, address: string, authKind: AuthKind) {
  await moduleView(page).getByRole("button", { name: "新增 SSH 主机", exact: true }).click();
  const form = dialog(page);
  await form.getByLabel("显示名称").fill(name);
  await form.getByLabel("主机名或 IP").fill(address);
  await form.getByLabel("用户名").fill("fixture");
  await form.getByLabel("认证方式").selectOption(authKind);
  return form;
}

async function save(page: Page) {
  await dialog(page).getByTestId("ssh-host-save").click();
  await expect(dialog(page)).toBeHidden();
}

const edit = (page: Page) => moduleView(page).getByTestId("ssh-host-edit").click();
const list = (page: Page) => desktopCall<Host[]>(page, "ssh.hosts.list");
const directory = (page: Page) => desktopCall<Directory>(page, "ssh.hosts.directory");

test("A01 SSH 主机目录在桌面和 Web 按账号标签筛选，网格保留选区并移动所选", async () => {
  test.skip(!browserBinary, "需要 Playwright Chromium");
  test.setTimeout(60_000);
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await openSsh(page);
    await desktopCall(page, "ssh.hosts.configure", { name: "构建节点", host: "build.example.test", port: 2222, user: "builder", tags: ["编译"], authKind: "agent", expectedRevision: null });
    await desktopCall(page, "ssh.hosts.configure", { name: "审阅节点", host: "review.example.test", port: 22, user: "reviewer", tags: ["审阅"], authKind: "agent", expectedRevision: null });
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary });
    const web = await browser.newPage({ viewport: { width: 900, height: 820 } });
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    for (const host of [page, web]) {
      await host.getByRole("button", { name: "远程连接", exact: true }).first().click();
      await moduleView(host).getByRole("button", { name: "主机目录", exact: true }).click();
      const view = host.getByRole("region", { name: "SSH 主机目录" });
      const rows = view.getByRole("list", { name: "主机", exact: true });
      const search = view.getByRole("textbox", { name: /搜索主机名称/ });
      await expect(rows.getByRole("listitem")).toHaveCount(2);
      await search.fill("BUILDER 编译");
      await expect(rows.getByRole("listitem")).toHaveCount(1);
      await view.getByRole("checkbox", { name: "选择 构建节点", exact: true }).check();
      await view.getByRole("tab", { name: "网格", exact: true }).click();
      await expect(rows).toHaveAttribute("data-layout", "grid");
      await expect(view.getByRole("checkbox", { name: "选择 构建节点", exact: true })).toBeChecked();
      await search.fill("reviewer");
      await expect(view.getByRole("status")).toContainText("其中 1 台在筛选结果之外");
      await view.getByRole("checkbox", { name: "选择 审阅节点", exact: true }).check();
      await view.getByRole("button", { name: "清空搜索", exact: true }).click();
      await expect(view.getByRole("status")).toHaveText("已选 2 台");
      if (host === page) {
        await view.getByRole("button", { name: "新建分组", exact: true }).click();
        const createGroup = host.getByRole("dialog", { name: "新建主机分组", exact: true });
        await createGroup.getByLabel("分组名称").fill("验收分组");
        await createGroup.getByRole("button", { name: "保存", exact: true }).click();
        await expect(createGroup).toBeHidden();
        await view.getByRole("button", { name: "从选择建立工作区", exact: true }).click();
        const template = host.getByRole("dialog", { name: "新建工作区模板", exact: true });
        await expect(template.getByRole("list", { name: "主机顺序" })).toContainText("构建节点");
        await expect(template.getByRole("list", { name: "主机顺序" })).toContainText("审阅节点");
        await template.getByRole("button", { name: "取消", exact: true }).click();
      } else {
        await view.getByRole("button", { name: "移动所选", exact: true }).click();
        const move = host.getByRole("dialog", { name: "移动所选主机", exact: true });
        await move.getByLabel("目标分组").selectOption({ label: "验收分组" });
        await move.getByRole("button", { name: "保存", exact: true }).click();
        await expect(move).toBeHidden();
        await view.getByRole("combobox", { name: "按主机分组筛选", exact: true }).selectOption({ label: "未分组" });
        await expect(view.getByText("没有符合条件的主机", { exact: true })).toBeVisible();
        await view.getByRole("combobox", { name: "按主机分组筛选", exact: true }).selectOption({ label: "验收分组" });
        await expect(rows.getByRole("listitem")).toHaveCount(2);
      }
    }
    const current = await directory(page);
    const group = current.groups.find(({ name }) => name === "验收分组");
    expect(group).toBeDefined();
    expect(current.hosts.map(({ groupId }) => groupId)).toEqual([group!.groupId, group!.groupId]);
  } finally {
    try {
      await browser?.close();
    } finally {
      await close();
    }
  }
});

test("A01 SSH 目录右键保留选区，手动排序与部分删除可回读", async () => {
  const { page, close } = await openApp();
  try {
    await openSsh(page);
    const saveHost = (name: string, jumpHostIds: string[] = []) => desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name, host: `${name.toLowerCase()}.example.test`, user: "fixture", authKind: "agent", expectedRevision: null, jumpHostIds,
    });
    const alpha = await saveHost("Alpha");
    const beta = await saveHost("Beta");
    const gamma = await saveHost("Gamma", [alpha.hostId]);
    await moduleView(page).getByRole("button", { name: "主机目录", exact: true }).click();
    const view = page.getByRole("region", { name: "SSH 主机目录" });
    const row = (name: string) => view.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: `选择 ${name}`, exact: true }) });
    const menu = (name: string) => page.getByRole("dialog", { name: `${name}的操作` });
    await row("Alpha").getByRole("checkbox").check();
    await row("Beta").getByRole("checkbox").check();

    await row("Gamma").click({ button: "right" });
    await expect(menu("Gamma").getByRole("button", { name: "编辑", exact: true })).toBeEnabled();
    await menu("Gamma").getByRole("button", { name: "置顶", exact: true }).click();
    await expect.poll(async () => (await directory(page)).hosts.filter(({ pinned }) => pinned).map(({ hostId }) => hostId)).toEqual([gamma.hostId]);
    await expect(view.getByRole("status")).toHaveText("已选 2 台");
    const trigger = row("Beta").getByRole("button", { name: "更多操作 Beta", exact: true });
    await trigger.click();
    await expect(menu("Beta").getByRole("button", { name: "编辑", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await view.getByRole("combobox", { name: "主机排序", exact: true }).selectOption("manual");
    await row("Beta").getByRole("button", { name: "拖动 Beta", exact: true }).dragTo(row("Alpha"));
    await expect.poll(async () => (await directory(page)).hosts.map(({ hostId }) => hostId)).toEqual([gamma.hostId, beta.hostId, alpha.hostId]);
    await view.getByRole("button", { name: "删除所选", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "删除所选主机", exact: true });
    await expect(confirmation.getByRole("listitem")).toHaveCount(2);
    await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(view.getByRole("alert")).toContainText(/已删除 1 台.*Alpha/);
    await expect(view.getByRole("status")).toHaveText("已选 1 台");
    expect((await list(page)).map(({ id }) => id).sort()).toEqual([alpha.hostId, gamma.hostId].sort());
  } finally {
    await close();
  }
});

test("SSH 保存版本、保持编辑失败草稿、复制与显式修改认证补丁", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await openSsh(page);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(960, 600));
    expect(await desktopCall(page, "safe.status")).toMatchObject({ initialized: false });
    const password = randomUUID();
    const form = await openNew(page, "版本主机", "primary.invalid", "password");
    await form.getByLabel("密码", { exact: true }).fill(password);
    await form.getByLabel("端口", { exact: true }).fill("2222");
    await form.getByLabel("标签").fill("研发，验收");
    await form.getByText("高级连接设置", { exact: true }).click();
    await form.getByLabel("连接超时（秒）").fill("45");
    await form.getByLabel("协议保活间隔（秒）").fill("0");
    await expect(form.getByTestId("ssh-host-save")).toBeInViewport();
    await save(page);
    await expect(availability(page)).toContainText("密码：已配置");
    const [created] = await list(page);
    expect(created).toMatchObject({ id: expect.stringMatching(/^host-owned-/), port: 2222, user: "fixture", tags: ["研发", "验收"], connectTimeoutSec: 45, keepaliveIntervalSec: 0, configured: true });
    expect(created).not.toHaveProperty("keepaliveCountMax");

    const grouped = await desktopCall<Directory>(page, "ssh.hosts.organize", { expectedVersion: "0", operation: { type: "group.create", parentId: null, name: "研发" } });
    const group = grouped.groups[0]!;
    await desktopCall(page, "ssh.hosts.organize", { expectedVersion: grouped.version, operation: { type: "hosts.move", hostIds: [created!.id], groupId: group.groupId } });
    await page.reload();
    await openSsh(page);
    await expect(moduleView(page).getByText("研发", { exact: true })).toBeVisible();
    await edit(page);
    await expect(form.getByText("当前分组：研发")).toBeVisible();
    await expect(form.getByLabel("密码", { exact: true })).toHaveValue("");
    await form.getByLabel("显示名称").fill("界面草稿");
    const { id, revision, auth, authState: _authState, configured: _configured, ...profile } = created!;
    await desktopCall(page, "ssh.hosts.configure", { ...profile, name: "并发版本", hostId: id, expectedRevision: revision, authKind: auth.kind });
    await form.getByLabel("密码", { exact: true }).scrollIntoViewIfNeeded();
    await form.getByTestId("ssh-host-save").click();
    await expect(form.getByRole("alert")).toContainText("当前草稿已保留");
    await expect(form.getByRole("alert")).toBeFocused();
    await expect(form.getByRole("alert")).toBeInViewport();
    await expect(form.getByLabel("显示名称")).toHaveValue("界面草稿");
    await expect(form.getByLabel("主机名或 IP")).toHaveValue("primary.invalid");
    await form.screenshot({ path: test.info().outputPath("ssh-edit-conflict.png") });
    expect((await list(page))[0]).toMatchObject({ id, name: "并发版本", configured: true });
    await form.getByRole("button", { name: "取消", exact: true }).click();
    await expect(form).toBeHidden();
    await expect(moduleView(page).getByRole("heading", { name: "并发版本" })).toBeVisible();

    const copy = page.getByTestId("ssh-host-copy-dialog");
    await moduleView(page).getByRole("button", { name: "复制主机", exact: true }).click();
    await expect(copy.getByLabel("显示名称")).toHaveValue("并发版本 副本");
    await copy.getByLabel("显示名称").fill("独立副本");
    await copy.getByRole("button", { name: "复制主机", exact: true }).click();
    await expect(copy).toBeHidden();
    await expect(availability(page)).toHaveText("密码：未配置");
    const hosts = await list(page);
    const copied = hosts.find((host) => host.name === "独立副本");
    expect(copied?.id).not.toBe(id);
    expect(copied).toMatchObject({ host: profile.host, tags: profile.tags, keepaliveIntervalSec: 0, configured: false });
    expect(hosts.find((host) => host.id === id)?.configured).toBe(true);

    await selectHost(page, "并发版本");
    await edit(page);
    await form.getByLabel("主机名或 IP").fill("retarget.invalid");
    await save(page);
    await expect(availability(page)).toHaveText("密码：需要重新配置");
    await edit(page);
    await form.getByLabel("密码", { exact: true }).fill(randomUUID());
    await save(page);
    await expect(availability(page)).toHaveText("密码：已配置");
    await edit(page);
    await form.getByRole("button", { name: "清空密码", exact: true }).click();
    await expect(form.getByLabel("密码", { exact: true })).toBeDisabled();
    await form.getByRole("button", { name: "撤销清空密码", exact: true }).click();
    await save(page);
    await expect(availability(page)).toHaveText("密码：已配置");
    await edit(page);
    await form.getByRole("button", { name: "清空密码", exact: true }).click();
    await save(page);
    await expect(availability(page)).toHaveText("密码：未配置");
    const final = (await list(page)).find((host) => host.id === id);
    expect(final).toMatchObject({ id, host: "retarget.invalid", port: 2222, tags: ["研发", "验收"], keepaliveIntervalSec: 0, configured: false });
    expect(final).not.toHaveProperty("keepaliveCountMax");
    expect((await directory(page)).hosts.find((host) => host.hostId === id)?.groupId).toBe(group.groupId);
    const records = path.join(vault, ".huhu", "module-credentials");
    const portable = readdirSync(records)
      .filter((file) => file.endsWith(".json"))
      .map((file) => readFileSync(path.join(records, file), "utf8"))
      .join("");
    expect(portable.includes(password) || portable.includes("safe://")).toBe(false);
    expect(await desktopCall(page, "safe.status")).toMatchObject({ initialized: false });
  } finally {
    await close();
  }
});

test("SSH 粘贴密钥、本机身份文件与 Agent 独立于保险箱状态", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await openSsh(page);
    const passphrase = randomUUID();
    const privateKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem", cipher: "aes-256-cbc", passphrase },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    }).privateKey;
    await desktopCall(page, "safe.setup", { password: randomUUID() });
    await desktopCall(page, "safe.lock");
    expect(await desktopCall(page, "safe.status")).toMatchObject({ initialized: true, locked: true });

    const form = await openNew(page, "粘贴密钥主机", "key.invalid", "key");
    await form.getByLabel("私钥", { exact: true }).fill(privateKey);
    await form.getByLabel("私钥口令", { exact: true }).fill(passphrase);
    await save(page);
    await expect(availability(page)).toHaveText("私钥：已配置 · 私钥口令：已配置");
    await edit(page);
    await expect(form.getByLabel("私钥", { exact: true })).toHaveValue("");
    await expect(form.getByLabel("私钥口令", { exact: true })).toHaveValue("");
    await form.getByRole("button", { name: "清空私钥口令", exact: true }).click();
    await save(page);
    await expect(availability(page)).toHaveText("私钥：已配置 · 私钥口令：未配置");

    await desktopCall(page, "plugins.setEnabled", { id: "safe", enabled: false });
    await expect(page.getByRole("button", { name: "保险箱", exact: true })).toHaveCount(0);
    const identity = path.join(vault, "test-identity.pem");
    writeFileSync(identity, privateKey);
    await app.evaluate(({ dialog: nativeDialog }, filename) => {
      nativeDialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [filename] })) as typeof nativeDialog.showOpenDialog;
    }, identity);
    await openNew(page, "本机身份主机", "identity.invalid", "identity-file");
    await form.getByRole("button", { name: "选择本机文件" }).click();
    await expect(form.getByLabel("身份文件路径")).toHaveValue(identity);
    await form.getByLabel("私钥口令", { exact: true }).fill(passphrase);
    await save(page);
    await expect(availability(page)).toHaveText("身份文件路径：已配置 · 私钥口令：已配置");
    await edit(page);
    await expect(form.getByLabel("身份文件路径")).toHaveValue("");
    await form.getByRole("button", { name: "取消", exact: true }).click();

    await openNew(page, "Agent 主机", "agent.invalid", "agent");
    await expect(form.getByText(/连接时检查本机系统 ssh-agent/)).toBeVisible();
    await save(page);
    await expect(availability(page)).toHaveText("连接时检查本机 SSH Agent");
    const output = JSON.stringify(await list(page));
    expect(output.includes(passphrase) || output.includes(identity) || output.includes("PRIVATE KEY")).toBe(false);
  } finally {
    await close();
  }
});

test("SSH 删除前列出引用并进入编辑，解绑后可取消或确认删除", async () => {
  const { page, close } = await openApp();
  try {
    await openSsh(page);
    await openNew(page, "跳板甲", "jump.invalid", "agent");
    await save(page);
    const [jump] = await list(page);
    const form = await openNew(page, "目标乙", "target.invalid", "agent");
    await form.getByLabel("添加跳板").selectOption(jump!.id);
    await save(page);
    const target = (await list(page)).find((host) => host.name === "目标乙")!;
    expect(target.jumpHostIds).toEqual([jump!.id]);

    await selectHost(page, "跳板甲");
    await edit(page);
    await form.getByLabel("添加跳板").selectOption(target.id);
    await form.getByTestId("ssh-host-save").click();
    await expect(form.getByRole("alert")).toContainText("跳板链不能形成循环");
    await expect(form.getByTestId("ssh-jump-item")).toContainText("目标乙");
    expect((await list(page)).find((host) => host.id === jump!.id)?.jumpHostIds).toEqual([]);
    await form.getByRole("button", { name: "取消", exact: true }).click();
    const removeButton = moduleView(page).getByRole("button", { name: "删除主机", exact: true });
    const remove = page.getByTestId("ssh-host-remove-dialog");
    await removeButton.click();
    await expect(remove).toHaveAccessibleName("此主机仍被引用");
    await expect(remove).toContainText("目标乙 · target.invalid");
    await expect(remove.getByRole("button", { name: "删除主机", exact: true })).toHaveCount(0);
    await remove.screenshot({ path: test.info().outputPath("ssh-references.png") });
    await remove.getByRole("button", { name: "编辑 目标乙" }).click();
    await form.getByRole("button", { name: "移除跳板", exact: true }).click();
    await save(page);
    expect((await list(page)).find((host) => host.id === target.id)?.jumpHostIds).toEqual([]);

    await selectHost(page, "跳板甲");
    await removeButton.click();
    await expect(remove).toHaveAccessibleName("删除主机");
    await remove.getByRole("button", { name: "取消", exact: true }).click();
    expect(await list(page)).toHaveLength(2);
    await removeButton.click();
    await remove.getByRole("button", { name: "删除主机", exact: true }).click();
    await expect(remove).toBeHidden();
    expect(await list(page)).toMatchObject([{ id: target.id, jumpHostIds: [] }]);
    expect((await directory(page)).hosts.map((host) => host.hostId)).toEqual([target.id]);
  } finally {
    await close();
  }
});
