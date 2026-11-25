import { expect, test, type Page } from "@playwright/test";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const navigate = (page: Page, name: string) => page.locator('[data-region="rail"]').getByRole("button", { name, exact: true }).click();

test("F07：丢失转换响应后重开工作台，三类转换只返回原目标", async () => {
  const { page, close } = await openApp();
  type Conversion = { result: { kind: "task" | "note" | "archive"; id: string }; status: string };
  let lostFor: string | undefined;
  let first: Conversion | undefined;
  try {
    await engineReady(page);
    await call(page, "archives.types.save", { name: "转换资料", fields: [] });
    await page.route("**/api/v1/call", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.capability !== "inbox.convert" || body.input?.id !== lostFor) return route.continue();
      lostFor = undefined;
      const response = await route.fetch();
      const payload = await response.json();
      expect(payload).toMatchObject({ ok: true });
      first = payload.data;
      await route.abort();
    });
    for (const target of ["task", "note", "archive"] as const) {
      const title = `转换原件-${target}`;
      const body = "第一段中文。\n\n- 第二段";
      const capture = await call<{ id: string; version: string }>(page, "inbox.capture", { title, body });
      const fields = target === "task" ? { title, body } : { name: title, body, ...(target === "archive" ? { type: "转换资料" } : {}) };
      const input = { id: capture.id, expectedVersion: capture.version, target, fields };
      lostFor = capture.id;
      first = undefined;
      await expect(call(page, "inbox.convert", input)).rejects.toThrow();
      expect(first).toMatchObject({ status: "processed", result: { kind: target, id: expect.any(String) } });
      await page.reload();
      await engineReady(page);
      const replay = await call<Conversion>(page, "inbox.convert", input);
      expect(replay.result).toEqual(first!.result);
      const list = target === "task" ? "tasks.list" : target === "note" ? "notes.list" : "archives.list";
      const rows = await call<{ title?: string; name?: string }[]>(page, list, target === "task" ? { category: "all" } : {});
      expect(rows.filter((row) => (row.title ?? row.name) === title)).toHaveLength(1);
      await call(page, "inbox.dismiss", { id: capture.id });
      const restored = await call<Conversion>(page, "inbox.restore", { id: capture.id });
      expect(restored).toMatchObject({ status: "processed", result: replay.result });
    }
  } finally {
    await close();
  }
});

test("UX05：窄窗口可填写长中文、多个标签与 Agent 日期字段，保存后可重新打开", async () => {
  const { app, page, vault, close } = await openApp();
  const title = "长中文任务标题用于核对窄窗口中名称和正文仍然获得可编辑的空间";
  const text = "第一段需要保留完整中文。第二段用于再次打开时验证。";
  const tags = ["准备阶段", "跨团队复核", "必须保留同一个任务"];
  try {
    await engineReady(page);
    const space = await call<{ id: string }>(page, "agent.spaces.save", { name: "窄栏任务工作区", root: vault });
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "agent.catalog.detect") return route.continue();
      return route.fulfill({ json: { ok: true, data: [{ id: "codex", displayName: "Codex", headless: true, installed: true }] } });
    });
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.setMinimumSize(400, 560);
      win.setContentSize(460, 640);
    });
    await navigate(page, "任务");
    await page.getByTestId("task-new").click();
    const dialog = page.getByTestId("task-editor");
    const type = dialog.getByTestId("task-type");
    await expect(type.locator("option:checked")).toHaveText("个人待办");
    await dialog.getByLabel("任务名称").fill(title);
    const body = dialog.getByTestId("task-body").locator(".ProseMirror");
    await body.fill(text);
    const label = dialog.getByRole("textbox", { name: "标签" });
    for (const tag of tags) {
      await label.fill(tag);
      await label.press("Enter");
    }
    await dialog.getByTestId("task-due").fill("2026-12-18");
    await type.selectOption("agent");
    await dialog.getByRole("combobox", { name: "工作目录（Space）" }).selectOption(space.id);
    await dialog.getByRole("combobox", { name: "任务Agent CLI" }).selectOption("codex");
    await expect.poll(() => dialog.locator(".hu-form-grid").evaluate((grid) => {
      const primary = grid.querySelector(".hu-form-primary")!.getBoundingClientRect();
      const aside = grid.querySelector(".hu-form-aside")!.getBoundingClientRect();
      return { stacked: aside.top >= primary.bottom, noHorizontalScroll: grid.scrollWidth <= grid.clientWidth + 1 };
    })).toEqual({ stacked: true, noHorizontalScroll: true });
    const save = dialog.getByTestId("task-save");
    await expect(save).toBeInViewport();
    await save.click();
    await expect(dialog).toBeHidden();
    const tasks = await call<{ id: string; title: string }[]>(page, "tasks.list", { category: "all" });
    const task = tasks.find((row) => row.title === title)!;
    await expect.poll(() => call(page, "tasks.read", { id: task.id })).toMatchObject({
      title, body: text, tags, due: "2026-12-18", type: "agent", execution: { provider: "codex", spaceId: space.id },
    });
    await page.getByRole("button", { name: `打开任务 ${title}` }).click();
    await page.getByTestId("detail-edit").click();
    await expect(dialog.getByLabel("任务名称")).toHaveValue(title);
    await expect(body).toHaveText(text);
  } finally {
    await close();
  }
});
