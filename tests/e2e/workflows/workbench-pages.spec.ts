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
