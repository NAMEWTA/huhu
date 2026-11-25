import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConnectionStatus, HostKeyPrompt, KnownHostKey } from "../../../plugins/ssh/src/shared/trust.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";

const moduleView = (page: Page) => page.getByTestId("ssh-module");
const dialog = (page: Page) => page.getByTestId("hostkey-dialog");
const connect = (page: Page) => moduleView(page).getByRole("button", { name: "连接", exact: true }).click();
const selectHost = (page: Page, name: string) =>
  moduleView(page)
    .getByRole("complementary")
    .getByRole("button", { name: new RegExp(`^${name} `) })
    .click();
const disconnect = async (page: Page) => {
  await moduleView(page).getByRole("button", { name: "断开", exact: true }).click();
  await expect(moduleView(page).getByRole("button", { name: "连接", exact: true })).toBeVisible();
};

async function openSsh(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
  await expect(moduleView(page)).toBeVisible();
}

async function fixtureHost(page: Page, name: string, port: number, password: string, jumpHostIds: string[] = []): Promise<string> {
  const saved = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
    expectedRevision: null,
    name,
    host: "127.0.0.1",
    port,
    user: "fixture",
    jumpHostIds,
    authKind: "password",
    connectTimeoutSec: 5,
    credentials: [{ purpose: "password", action: "replace", value: password }],
  });
  return saved.hostId;
}

async function snapshot(page: Page, hostId: string) {
  return (await desktopCall<ConnectionStatus[]>(page, "ssh.connections.status")).find((item) => item.hostId === hostId);
}

async function promptFor(page: Page, hostId: string): Promise<HostKeyPrompt> {
  const item = await snapshot(page, hostId);
  if (item?.state !== "waiting" && item?.state !== "key-changed") throw new Error("预期连接存在指纹提示");
  return item.prompt;
}

const known = (page: Page) => desktopCall<KnownHostKey[]>(page, "ssh.knownHosts.list");
const approveOld = (page: Page, prompt: HostKeyPrompt) => desktopCall(page, "ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, promptId: prompt.promptId, accept: true });

test("A03 desktop approves the first-hop ProxyCommand and revokes its live connection", async () => {
  test.skip(process.platform !== "linux", "ProxyCommand executor requires Linux");
  const password = randomUUID();
  const jump = await startFakeSsh({ password });
  const target = await startFakeSsh({ password });
  const { page, vault, close } = await openApp();
  try {
    const jumpId = await fixtureHost(page, "代理首跳", jump.port, password);
    const targetId = await fixtureHost(page, "代理目标", target.port, password, [jumpId]);
    const script = path.join(vault, "loopback-proxy.cjs");
    writeFileSync(script, `
      const [host, port, user] = process.argv.slice(2);
      if (host !== "127.0.0.1" || port !== "${jump.port}" || user !== "fixture") process.exit(1);
      const socket = require("node:net").connect(Number(port), host);
      socket.on("error", () => process.exit(1));
      process.stdin.pipe(socket).pipe(process.stdout);
      socket.once("close", () => process.exit(0));
    `);
    await openSsh(page);
    const editProxy = async () => {
      await moduleView(page).getByRole("button", { name: "跳板路由", exact: true }).click();
      await page.getByRole("article").filter({ has: page.getByRole("checkbox", { name: "代理目标", exact: true }) }).getByRole("button", { name: "本机 ProxyCommand", exact: true }).click();
      return page.getByRole("dialog", { name: "本机 ProxyCommand" });
    };
    const proxy = await editProxy();
    await expect(proxy).toContainText(`代理首跳 · fixture@127.0.0.1:${jump.port}`);
    await proxy.getByLabel("程序绝对路径").fill(process.execPath);
    await proxy.getByLabel("参数（每行一个）").fill([script, "%h", "%p", "%r"].join("\n"));
    await proxy.getByRole("button", { name: "批准并保存", exact: true }).click();
    await expect(proxy.getByRole("status")).toHaveText("本机已批准");
    expect(jump.conns).toHaveLength(0);
    await proxy.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "返回主机", exact: true }).click();
    await selectHost(page, "代理目标");
    await connect(page);
    for (const port of [jump.port, target.port]) {
      await expect(dialog(page)).toContainText(`127.0.0.1:${port}`);
      await dialog(page).getByRole("button", { name: "信任并连接", exact: true }).click();
    }
    await expect.poll(() => snapshot(page, targetId)).toMatchObject({
      state: "connected",
      route: [{ id: jumpId, outboundProxy: { source: "command" } }, { id: targetId }],
    });
    const revocation = await editProxy();
    await revocation.getByRole("button", { name: "撤销本机批准", exact: true }).click();
    await expect(revocation.getByRole("status")).toHaveText("本机尚未批准");
    await expect.poll(() => snapshot(page, targetId)).toMatchObject({ state: "disconnected" });
    await expect.poll(() => [jump.closed(), target.closed()]).toEqual([1, 1]);
  } finally {
    await close();
    await Promise.all([jump.close(), target.close()]);
  }
});

test("SSH 首次指纹可重新打开，拒绝与仅本次信任均不写记录", async () => {
  const password = randomUUID();
  const authentications: string[] = [];
  const server = await startFakeSsh({ password, onAuth: (_user, method) => authentications.push(method) });
  const { app, page, vault, close } = await openApp();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(960, 600));
    const hostId = await fixtureHost(page, "直连测试主机", server.port, password);
    const knownFile = path.join(vault, ".huhu", "ssh", "known_hosts");
    await openSsh(page);
    await connect(page);
    const modal = dialog(page);
    await expect(modal).toHaveAccessibleName("首次连接：确认主机身份");
    await expect(modal).toContainText(`直连测试主机 · 127.0.0.1:${server.port}`);
    await expect(modal).toContainText("第 1 跳");
    await expect(modal).toContainText(server.fingerprint);
    await expect(modal).toContainText("ssh-ed25519");
    const first = await promptFor(page, hostId);
    expect(first).toMatchObject({ target: { id: hostId }, server: { id: hostId, port: server.port }, hop: 0, fingerprint: server.fingerprint });
    expect(await desktopCall(page, "ssh.hostKey.decide", { attemptId: first.attemptId, hop: first.hop, accept: true })).toEqual({ applied: false });
    expect(authentications).toEqual([]);
    await modal.screenshot({ path: test.info().outputPath("first-fingerprint.png") });
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(moduleView(page).getByRole("button", { name: "核对主机指纹", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(moduleView(page)).toBeHidden();
    await openSsh(page);
    await expect(modal).toBeVisible();
    expect(await promptFor(page, hostId)).toEqual(first);
    await page.reload();
    await openSsh(page);
    await expect(modal).toBeVisible();
    expect(await promptFor(page, hostId)).toEqual(first);
    expect(authentications).toEqual([]);
    await modal.getByRole("button", { name: "拒绝并取消", exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(moduleView(page).getByRole("alert")).toContainText("第 1 跳 · 直连测试主机 · 已拒绝主机指纹");
    expect(await approveOld(page, first)).toEqual({ applied: false });
    expect(authentications).toEqual([]);
    expect(existsSync(knownFile)).toBe(false);

    await connect(page);
    await expect(modal).toBeVisible();
    const once = await promptFor(page, hostId);
    expect(once.attemptId).not.toBe(first.attemptId);
    expect(await approveOld(page, first)).toEqual({ applied: false });
    await modal.getByRole("button", { name: "仅本次信任", exact: true }).click();
    await expect(moduleView(page).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    expect(authentications).toContain("password");
    expect(existsSync(knownFile)).toBe(false);
    await disconnect(page);

    await connect(page);
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(moduleView(page).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    expect(await known(page)).toMatchObject([{ port: server.port, fingerprint: server.fingerprint }]);
    await disconnect(page);
    await connect(page);
    await expect(moduleView(page).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    await expect(modal).toBeHidden();
  } finally {
    try {
      await close();
    } finally {
      await server.close();
    }
  }
});

test("SSH 指纹变化阻断准确跳点，经已知主机核对和移除后重新确认", async () => {
  const password = randomUUID();
  const jump = await startFakeSsh({ password });
  let target = await startFakeSsh({ password });
  const { page, vault, close } = await openApp();
  try {
    const jumpId = await fixtureHost(page, "回环跳板", jump.port, password);
    const targetId = await fixtureHost(page, "回环目标", target.port, password, [jumpId]);
    await openSsh(page);
    await selectHost(page, "回环目标");
    await connect(page);
    const modal = dialog(page);
    await expect(modal).toContainText("第 1 跳");
    const first = await promptFor(page, targetId);
    expect(first).toMatchObject({ target: { id: targetId }, server: { id: jumpId }, fingerprint: jump.fingerprint });
    await expect(modal).toContainText(`回环跳板 · 127.0.0.1:${jump.port}`);
    await modal.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(modal).toContainText("第 2 跳");
    const second = await promptFor(page, targetId);
    expect(second).toMatchObject({ attemptId: first.attemptId, target: { id: targetId }, server: { id: targetId }, fingerprint: target.fingerprint });
    expect(second.promptId).not.toBe(first.promptId);
    expect(await approveOld(page, first)).toEqual({ applied: false });
    await modal.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(moduleView(page).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    const knownFile = path.join(vault, ".huhu", "ssh", "known_hosts");
    const comment = "# test known-hosts annotation\r\n";
    const previous = comment + readFileSync(knownFile, "utf8");
    writeFileSync(knownFile, previous);
    const previousKey = target.fingerprint;
    const targetPort = target.port;
    await disconnect(page);
    await target.close();
    const targetAuth: string[] = [];
    target = await startFakeSsh({ port: targetPort, password, onAuth: (_user, method) => targetAuth.push(method) });
    expect(target.fingerprint).not.toBe(previousKey);

    const jumpClosed = jump.closed();
    await connect(page);
    await expect(modal).toHaveAccessibleName("主机密钥发生变化");
    await expect(modal).toContainText("第 2 跳");
    await expect(modal).toContainText(`回环目标 · 127.0.0.1:${targetPort}`);
    await expect(modal).toContainText(previousKey);
    await expect(modal).toContainText(target.fingerprint);
    await expect(modal.getByRole("button", { name: /信任并连接|仅本次信任/ })).toHaveCount(0);
    expect(targetAuth).toEqual([]);
    expect(readFileSync(knownFile, "utf8")).toBe(previous);
    expect(await approveOld(page, second)).toEqual({ applied: false });
    expect(await approveOld(page, await promptFor(page, targetId))).toEqual({ applied: false });
    await expect.poll(() => jump.closed()).toBeGreaterThan(jumpClosed);
    await modal.screenshot({ path: test.info().outputPath("changed-fingerprint.png") });

    await modal.getByRole("button", { name: "到已知主机复核" }).click();
    const panel = page.getByTestId("ssh-known-hosts");
    await expect(panel).toBeVisible();
    const oldRow = panel.getByRole("row").filter({ hasText: previousKey });
    await expect(oldRow).toContainText(`127.0.0.1:${targetPort}`);
    await expect(panel.getByRole("row").filter({ hasText: jump.fingerprint })).toBeVisible();
    await oldRow.getByRole("button", { name: "移除指纹", exact: true }).click();
    const remove = page.getByRole("dialog", { name: "移除保存的指纹" });
    await remove.getByRole("button", { name: "取消", exact: true }).click();
    expect(readFileSync(knownFile, "utf8")).toBe(previous);
    await oldRow.getByRole("button", { name: "移除指纹", exact: true }).click();
    await remove.getByRole("button", { name: "移除指纹", exact: true }).click();
    await expect(oldRow).toHaveCount(0);
    expect(await known(page)).toMatchObject([{ port: jump.port, fingerprint: jump.fingerprint }]);
    expect(readFileSync(knownFile, "utf8")).toMatch(/^# test known-hosts annotation\r\n/);
    expect((await snapshot(page, targetId))?.state).toBe("key-changed");
    expect(targetAuth).toEqual([]);
    await panel.screenshot({ path: test.info().outputPath("known-hosts-reviewed.png") });

    await selectHost(page, "回环目标");
    await connect(page);
    await expect(modal).toHaveAccessibleName("首次连接：确认主机身份");
    await expect(modal).toContainText("第 2 跳");
    await expect(modal).toContainText(target.fingerprint);
    expect(await approveOld(page, second)).toEqual({ applied: false });
    await modal.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(moduleView(page).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    expect(targetAuth).toContain("password");
    expect(await known(page)).toMatchObject([{ fingerprint: jump.fingerprint }, { fingerprint: target.fingerprint }]);
  } finally {
    try {
      await close();
    } finally {
      await Promise.all([target.close(), jump.close()]);
    }
  }
});

test("SSH 回环 Web 工作台可核对指纹，已知主机管理写入限桌面", async () => {
  test.skip(!browserBinary, "当前环境未安装 Playwright Chromium 或 Microsoft Edge");
  const password = randomUUID();
  const received: string[] = [];
  const server = await startFakeSsh({ password, onAuth: (_user, method) => received.push(method) });
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await openSsh(page);
    const hostId = await fixtureHost(page, "浏览器测试主机", server.port, password);
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary, headless: true });
    const web = await browser.newPage();
    await web.goto(link);
    await web.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await connect(web);
    await expect(dialog(web)).toContainText(server.fingerprint);
    expect((await promptFor(page, hostId)).target.id).toBe(hostId);
    expect(received).toEqual([]);
    await dialog(web).getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(moduleView(web).getByRole("button", { name: "断开", exact: true })).toBeVisible();
    expect(received).toContain("password");
    await moduleView(web).getByRole("button", { name: "已知主机", exact: true }).click();
    const panel = web.getByTestId("ssh-known-hosts");
    await expect(panel).toContainText(server.fingerprint);
    await expect(panel.getByRole("button", { name: "移除指纹" })).toHaveCount(0);
    const [key] = await known(page);
    expect(
      await web.evaluate(async (input) => {
        const response = await fetch("/api/v1/call", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ capability: "ssh.knownHosts.forget", input, requestId: "ssh-web-forget", idempotencyKey: "ssh-web-forget" }),
        });
        const data = await response.json();
        return data?.error?.code;
      }, key),
    ).toBe("PERMISSION_DENIED");
    expect(await known(page)).toEqual([key]);
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await close();
      } finally {
        await server.close();
      }
    }
  }
});
