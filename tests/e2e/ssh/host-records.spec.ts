import { expect, test, type Page } from "@playwright/test";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AuthKind, ManagedHostView } from "../../../plugins/ssh/src/engine/auth-profile.js";
import type { DirectoryView } from "../../../plugins/ssh/src/engine/directory-schema.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

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
