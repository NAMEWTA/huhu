import { randomUUID } from "node:crypto";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { ShortcutLibrary } from "../../../plugins/ssh/src/shared/shortcuts.js";
import type { ConnectionStatus } from "../../../plugins/ssh/src/shared/trust.js";
import type { WorkspaceRun } from "../../../plugins/ssh/src/shared/workspace.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { browserBinary, desktopCall, localWebLink } from "./workbench.js";

async function openSsh(page: Page) {
  await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
  await expect(page.getByTestId("ssh-module")).toBeVisible();
}

async function openShortcuts(page: Page) {
  await openSsh(page);
  await page.getByRole("button", { name: "快捷命令", exact: true }).click();
  return page.getByRole("region", { name: "快捷命令库" });
}

async function addShortcut(panel: ReturnType<Page["getByRole"]>, name: string, text: string) {
  await panel.getByRole("button", { name: "新增快捷文本", exact: true }).click();
  const form = panel.getByRole("form", { name: "新增快捷文本", exact: true });
  await form.getByLabel("名称", { exact: true }).fill(name);
  await form.getByLabel("分组", { exact: true }).fill("样例组");
  await form.getByLabel("正文", { exact: true }).fill(text);
  await form.getByRole("button", { name: "保存快捷文本", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(panel.getByRole("status")).toHaveText("已保存快捷文本库。");
}

function saveHost(page: Page, name: string, port: number, password: string) {
  return desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
    name,
    host: "127.0.0.1",
    port,
    user: "fixture",
    authKind: "password",
    expectedRevision: null,
    credentials: [{ action: "replace", purpose: "password", value: password }],
  });
}

async function trustHost(page: Page, hostId: string) {
  let prompt: Extract<ConnectionStatus, { prompt: unknown }>["prompt"] | undefined;
  await expect
    .poll(async () => {
      const statuses = await desktopCall<ConnectionStatus[]>(page, "ssh.connections.status");
      const state = statuses.find((entry) => entry.hostId === hostId);
      prompt = state?.state === "waiting" ? state.prompt : undefined;
      return Boolean(prompt);
    })
    .toBe(true);
  if (!prompt) throw new Error("回环夹具没有待答主机指纹");
  await desktopCall(page, "ssh.hostKey.decide", { attemptId: prompt.attemptId, promptId: prompt.promptId, hop: prompt.hop, accept: true, remember: true });
}

test("快捷文本排序持久化，预览仅向显式选定的可输入分栏交付", async () => {
  const password = randomUUID();
  const leftInput: string[] = [];
  const rightInput: string[] = [];
  const thirdInput: string[] = [];
  const left = await startFakeSsh({ password, onShellInput: (text) => leftInput.push(text) });
  const right = await startFakeSsh({ password, onShellInput: (text) => rightInput.push(text) });
  const third = await startFakeSsh({ password, onShellInput: (text) => thirdInput.push(text) });
  const app = await openApp();
  const { page } = app;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const line = "fixture-insert-甲🙂";
    const multiline = "fixture-multiline-乙🙂\n第二行";
    const panel = await openShortcuts(page);
    await addShortcut(panel, "单行示例", line);
    await addShortcut(panel, "多行示例", multiline);
    await panel.getByRole("button", { name: "上移 多行示例", exact: true }).click();
    await expect(panel.getByRole("listitem")).toHaveText([/多行示例/, /单行示例/]);
    await panel.getByRole("searchbox", { name: "搜索快捷文本" }).fill("MULTILINE");
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem")).toContainText("多行示例");
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await openShortcuts(page);
    await expect(panel.getByRole("listitem")).toHaveText([/多行示例/, /单行示例/]);
    await page.getByRole("button", { name: "返回主机", exact: true }).click();

    const a = await saveHost(page, "左侧夹具", left.port, password);
    const b = await saveHost(page, "右侧夹具", right.port, password);
    const c = await saveHost(page, "未选夹具", third.port, password);
    const started = await desktopCall<WorkspaceRun>(page, "ssh.workspace.runs.start", { name: "快捷文本验收", layout: { kind: "three" }, panes: [a, b, c].map(({ hostId }) => ({ hostId })) });
    await trustHost(page, a.hostId);
    await trustHost(page, b.hostId);
    await trustHost(page, c.hostId);
    await page.getByRole("button", { name: "工作区", exact: true }).click();
    await page.getByRole("button", { name: /快捷文本验收/ }).click();
    const run = page.getByTestId("ssh-workspace-run");
    await expect(run).toHaveAttribute("data-run-id", started.id);
    await run.getByText("快捷文本与广播", { exact: true }).click();
    const leftTarget = run.getByRole("checkbox", { name: /左侧夹具/ });
    const rightTarget = run.getByRole("checkbox", { name: /右侧夹具/ });
    const thirdTarget = run.getByRole("checkbox", { name: /未选夹具/ });
    await expect(leftTarget).toBeEnabled();
    await expect(rightTarget).toBeEnabled();
    await expect(thirdTarget).toBeEnabled();
    const fields = run.getByRole("textbox", { name: "快捷文本", exact: true });
    const preview = run.getByRole("region", { name: "快捷文本预览" });
    const insert = run.getByRole("button", { name: "插入", exact: true });
    const send = run.getByRole("button", { name: "发送并回车", exact: true });
    const pick = (name: string) => run.getByRole("button", { name: `选择 ${name}`, exact: true }).click();

    await pick("多行示例");
    await expect(fields).toHaveValue(multiline);
    expect(await preview.textContent()).toBe(multiline);
    await expect(send).toBeDisabled();
    expect([leftInput, rightInput]).toEqual([[], []]);

    // WorkspaceRunView supplies the active pane ID. Picking new text replaces the previous preview.
    await run.getByRole("button", { name: "当前分栏", exact: true }).click();
    await expect(leftTarget).toBeChecked();
    await expect(rightTarget).not.toBeChecked();
    await pick("单行示例");
    expect(await preview.textContent()).toBe(line);
    await insert.click();
    await expect.poll(() => leftInput.join("")).toBe(line);
    expect(rightInput).toEqual([]);

    await pick("多行示例");
    await rightTarget.check();
    await expect(rightTarget).toBeChecked();
    await insert.click();
    await expect(run.getByText(/当前终端需要单行文本/)).toBeVisible();
    expect([leftInput.join(""), rightInput.join("")]).toEqual([line, ""]);
    await pick("多行示例");
    await run.getByRole("button", { name: "全部可输入分栏", exact: true }).click();
    await expect(thirdTarget).toBeChecked();
    await thirdTarget.uncheck();
    await send.click();
    const sent = multiline.replaceAll("\n", "\r") + "\r";
    await expect.poll(() => [leftInput.join(""), rightInput.join("")]).toEqual([line + sent, sent]);

    const leftPane = run.getByTestId("ssh-workspace-run-pane").first();
    await pick("单行示例");
    await leftPane.getByRole("button", { name: "锁定输入", exact: true }).click();
    await expect(preview).toBeHidden();
    await leftPane.getByRole("button", { name: "解除输入锁定", exact: true }).click();
    await expect(leftTarget).toBeEnabled();
    await expect(send).toBeHidden();
    await pick("单行示例");
    await run.getByRole("button", { name: "最大化活动分栏", exact: true }).click();
    await expect(rightTarget).toBeHidden();
    await expect(preview).toBeHidden();
    await run.getByRole("button", { name: "还原分栏", exact: true }).click();
    await expect(rightTarget).toBeEnabled();
    await expect(send).toBeHidden();

    await pick("单行示例");
    await fields.fill("未确认的手动正文");
    await expect(preview).toBeHidden();
    await pick("单行示例");
    const leftSession = await leftPane.getAttribute("data-session-id");
    expect(leftSession).toBeTruthy();
    await desktopCall(page, "ssh.shells.close", { id: leftSession });
    await expect(preview).toBeHidden();
    await expect(send).toBeHidden();
    expect([leftInput.join(""), rightInput.join("")]).toEqual([line + sent, sent]);
    expect(thirdInput).toEqual([]);
  } finally {
    await app.close();
    await Promise.all([left.close(), right.close(), third.close()]);
  }
});

test("独立 Web 工作台可管理 Vault 快捷文本，桌面读取同一版本", async () => {
  test.skip(!browserBinary, "需要 Playwright Chromium 或 Microsoft Edge");
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const link = await localWebLink(page);
    browser = await chromium.launch({ executablePath: browserBinary, headless: true });
    const web = await browser.newPage();
    await web.goto(link);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();
    const panel = await openShortcuts(web);
    const read = () => desktopCall<ShortcutLibrary>(page, "ssh.shortcuts.list");
    expect(await read()).toEqual({ revision: null, shortcuts: [] });
    await addShortcut(panel, "浏览器无副作用夹具", "Unicode 🙂\n\t第二行");
    const saved = await read();
    expect(saved.shortcuts).toMatchObject([{ name: "浏览器无副作用夹具", group: "样例组", text: "Unicode 🙂\n\t第二行" }]);

    await panel.getByRole("button", { name: "编辑 浏览器无副作用夹具", exact: true }).click();
    const edit = panel.getByRole("form", { name: "编辑快捷文本", exact: true });
    await edit.getByLabel("分组", { exact: true }).fill("浏览器组");
    await edit.getByRole("button", { name: "保存快捷文本", exact: true }).click();
    await expect(edit).toBeHidden();
    const changed = await read();
    expect(changed.revision).not.toBe(saved.revision);
    expect(changed.shortcuts).toMatchObject([{ id: saved.shortcuts[0]!.id, group: "浏览器组" }]);

    await panel.getByRole("button", { name: "编辑 浏览器无副作用夹具", exact: true }).click();
    await edit.getByRole("button", { name: "删除快捷文本", exact: true }).click();
    await edit.getByRole("button", { name: "确认删除快捷文本", exact: true }).click();
    await expect(edit).toBeHidden();
    expect((await read()).shortcuts).toEqual([]);
  } finally {
    await browser?.close();
    await close();
  }
});
