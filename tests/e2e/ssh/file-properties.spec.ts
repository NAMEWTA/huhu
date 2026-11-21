import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

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
