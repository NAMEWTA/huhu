import { once } from "node:events";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "../helpers/launch.js";
import { FORWARD_BIND, forwardLabels, ForwardMode } from "../../../plugins/ssh/src/shared/forwarding.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";

async function createHost(page: Page, port: number, password: string) {
  const result = await page.evaluate(
    async ({ name, port, password }) => {
      const { baseUrl, token } = await window.huhuHost.engine();
      const response = await fetch(`${baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          capability: "ssh.hosts.configure",
          input: { name, host: "127.0.0.1", port, user: "forwarding-fixture", authKind: "password", expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: password }] },
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      return await response.json();
    },
    { name: "回环转发夹具", port, password },
  );
  expect(result.ok, result.error?.message).toBe(true);
}

async function bind(server: net.Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, FORWARD_BIND, resolve);
  });
  return (server.address() as net.AddressInfo).port;
}

const close = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()));
async function port() {
  const probe = net.createServer();
  const result = await bind(probe);
  await close(probe);
  return result;
}

async function dial(port: number) {
  const socket = net.createConnection({ host: FORWARD_BIND, port });
  socket.on("error", () => socket.destroy());
  await once(socket, "connect", { signal: AbortSignal.timeout(5000) });
  return socket;
}

test("Workbench saves four modes and opens and releases a real listener only on explicit actions", async () => {
  const password = randomUUID();
  const ssh = await startFakeSsh({ password, remoteForwarding: true });
  const upstream = net.createServer((socket) => socket.pipe(socket));
  const targetPort = await bind(upstream);
  const fixture = await openApp();
  let active: net.Socket | undefined;
  try {
    const { page } = fixture;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await createHost(page, ssh.port, password);
    await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
    await page.getByRole("button", { name: "端口转发", exact: true }).click();
    const rules = page.getByTestId("ssh-forward-rule");
    const ports = new Map<ForwardMode, number>();
    for (const mode of ForwardMode.options) {
      const listenPort = await port();
      ports.set(mode, listenPort);
      await page.getByRole("button", { name: "新建规则" }).click();
      const dialog = page.getByRole("dialog", { name: "新建转发规则" });
      await dialog.getByLabel("规则名称").fill(`测试 ${forwardLabels[mode]}`);
      await dialog.getByLabel("转发模式").selectOption(mode);
      await dialog.getByLabel(/监听端口/).fill(String(listenPort));
      if (mode === "local" || mode === "remote") {
        await expect(dialog.getByRole("group", { name: mode === "local" ? "远端目的地" : "本机目的地" })).toBeVisible();
        await dialog.getByLabel("目标端口").fill(String(targetPort));
      } else {
        await expect(dialog.getByLabel("目标主机")).toHaveCount(0);
        await expect(dialog.getByLabel("目标端口")).toHaveCount(0);
      }
      await dialog.getByRole("button", { name: "保存规则" }).click();
      const row = rules.filter({ has: page.getByText(`测试 ${forwardLabels[mode]}`, { exact: true }) });
      await expect(row.getByRole("status")).toHaveText("已配置");
      await expect(dial(listenPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
      await row.getByRole("button", { name: "编辑" }).click();
      const editor = page.getByRole("dialog", { name: "编辑转发规则" });
      await expect(editor.getByLabel("转发模式")).toHaveValue(mode);
      await expect(editor.getByLabel(/监听端口/)).toHaveValue(String(listenPort));
      await editor.getByRole("button", { name: "取消" }).click();
    }

    const local = rules.filter({ has: page.getByText("测试 Local", { exact: true }) });
    const localPort = ports.get("local")!;
    await local.getByRole("button", { name: "启动" }).click();
    await expect(local.getByRole("status")).toHaveText("等待核对主机指纹");
    await expect(dial(localPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await local.getByRole("button", { name: "核对主机指纹" }).click();
    await page.getByRole("button", { name: "信任并连接" }).click();
    await expect(local.getByRole("status")).toHaveText("监听中");
    await expect(local).toContainText(`实际绑定 ${FORWARD_BIND}:${localPort}`);
    await expect(local).toContainText("专用隧道连接");
    const remote = rules.filter({ has: page.getByText("测试 Remote", { exact: true }) });
    const remotePort = ports.get("remote")!;
    await remote.getByRole("button", { name: "启动" }).click();
    await expect(remote.getByRole("status")).toHaveText("服务端已确认");
    await expect(remote).toContainText(`已确认的远端请求 ${FORWARD_BIND}:${remotePort}`);
    await expect(remote).toContainText("实际绑定地址由服务端策略");
    await expect(remote).not.toContainText("实际绑定 127.0.0.1");
    (await dial(remotePort)).destroy();
    await remote.getByRole("button", { name: "停止", exact: true }).click();
    await expect(remote.getByRole("status")).toHaveText("已停止");
    await expect(dial(remotePort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    active = await dial(localPort);
    const bytes = Buffer.from("Workbench forward");
    const received = once(active, "data", { signal: AbortSignal.timeout(5000) });
    active.write(bytes);
    expect((await received)[0]).toEqual(bytes);
    await expect(local).toContainText(`活动 1 · 累计 1 · 上传 ${bytes.length} B · 下载 ${bytes.length} B`);
    await local.getByRole("button", { name: "停止", exact: true }).click();
    await expect(local.getByRole("status")).toHaveText("已停止");
    await expect(dial(localPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await local.getByRole("button", { name: "启动", exact: true }).click();
    await expect(local.getByRole("status")).toHaveText("监听中");
    (await dial(localPort)).destroy();
    await local.getByRole("button", { name: "停止", exact: true }).click();
    await expect(local.getByRole("status")).toHaveText("已停止");
    await expect(dial(localPort)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  } finally {
    active?.destroy();
    await fixture.close();
    await Promise.all([ssh.close(), close(upstream)]);
  }
});
