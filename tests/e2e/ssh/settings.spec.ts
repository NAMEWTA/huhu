import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

test("SSH preferences apply to workspace, terminal, file views and transfer queue", async () => {
  const password = randomUUID();
  const server = await startFakeSsh({ password });
  server.fs.files.set("/home/test/.hidden", Buffer.from("hidden"));
  server.fs.files.set("/home/test/a-small", Buffer.from("small"));
  server.fs.files.set("/home/test/z-large", Buffer.alloc(450));
  const fixture = await openApp();
  try {
    const { page } = fixture;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const { hostId } = await desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "布局回环",
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: password }],
    });
    const ssh = page.getByRole("button", { name: "远程连接", exact: true }).first();
    await ssh.click();
    const link = page.getByTestId("ssh-module").getByRole("button", { name: "SSH 设置", exact: true });
    await link.click();
    const settings = page.getByTestId("ssh-settings");
    await expect(settings).toBeVisible();
    const save = settings.getByRole("button", { name: "保存设置" });
    const search = settings.getByPlaceholder("搜索 SSH 设置");
    await search.fill("无匹配示例");
    await expect(settings.getByText("没有匹配的 SSH 设置")).toBeVisible();
    await search.clear();
    await settings.getByLabel("工作区标签方向").selectOption("left");
    await settings.getByLabel("分栏工具栏位置").selectOption("bottom");
    await settings.getByLabel("打开工作区时恢复上次视图").check();
    await save.click();
    await expect(settings.getByRole("status")).toHaveText("已保存到本机。");
    await settings.getByRole("button", { name: "文件与传输" }).click();
    await settings.getByLabel("显示以点开头的文件").uncheck();
    await settings.getByLabel("文件排序方式").selectOption("size");
    await settings.getByLabel("双栏默认将远端放在左侧").check();
    await settings.getByLabel("进入工作区时展开分栏文件").check();
    await settings.getByRole("button", { name: "保存本机文件设置" }).click();
    await expect(settings.getByText("已保存到本机。")).toBeVisible();
    await settings.getByLabel("并发传输数").fill("3");
    await settings.getByRole("button", { name: "保存库内设置" }).click();
    await expect(settings.getByText("已保存到当前库。")).toBeVisible();
    expect(await desktopCall(page, "ssh.transfers.list")).toMatchObject({ parallel: 3 });
    await settings.getByRole("button", { name: "终端" }).click();
    const font = settings.getByLabel("终端字号");
    await font.fill("19");
    await settings.getByRole("button", { name: "取消修改" }).click();
    await expect(font).toHaveValue("13");
    await font.fill("18");
    await settings.getByLabel("终端字体").selectOption("system");
    await save.click();
    await expect(settings.getByRole("status")).toHaveText("已保存到本机。");
    await desktopCall(page, "ssh.workspace.runs.start", { name: "设备布局验收", layout: { kind: "tabs" }, panes: [{ hostId }] });
    await ssh.click();
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /设备布局验收.*代次 1/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await run.getByRole("button", { name: "信任并连接", exact: true }).click();
    await expect(run.locator("[data-tab-side]")).toHaveAttribute("data-tab-side", "left");
    const tools = run.getByTestId("ssh-pane-tools");
    await expect(tools).toHaveAttribute("data-position", "bottom");
    const terminal = run.getByTestId("terminal-view");
    await expect(terminal).toHaveAttribute("data-state", "open");
    const scale = run.getByTestId("ssh-terminal-preferences").locator("[data-font]");
    expect(await scale.evaluate((el) => Number.parseFloat(getComputedStyle(el).zoom))).toBeCloseTo(18 / 13);
    await expect(scale).toHaveAttribute("data-font", "system");
    expect(await terminal.evaluate((el) => getComputedStyle(el).getPropertyValue("--font-mono"))).toContain("Consolas");
    const remoteTable = run.getByRole("table", { name: "远端目录项目" });
    await expect(remoteTable.getByRole("button", { name: "z-large", exact: true })).toBeVisible();
    await expect(remoteTable.getByRole("button", { name: ".hidden", exact: true })).toHaveCount(0);
    const visibleFiles = await remoteTable.getByRole("button", { name: /^(z-large|a-small)$/ }).allTextContents();
    expect(visibleFiles).toEqual(["z-large", "a-small"]);

    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    if (!(await run.isVisible())) {
      await ssh.click();
      await page.getByRole("button", { name: "工作区", exact: true }).click();
    }
    await expect(run).toHaveAttribute("data-generation", "1");
    await expect(terminal).toHaveAttribute("data-state", "open");
    await expect(scale).toHaveAttribute("data-font", "system");
    await run.getByRole("button", { name: "打开独立双栏" }).click();
    const independent = page.getByTestId("ssh-independent-files");
    await expect(independent.locator(".ssh-file-columns > section").first().getByRole("table", { name: "远端目录项目" })).toBeVisible();
    await independent.getByRole("button", { name: "交换左右位置" }).click();
    await expect(independent.locator(".ssh-file-columns > section").last().getByRole("table", { name: "远端目录项目" })).toBeVisible();
  } finally {
    await fixture.close();
    await server.close();
  }
});
