/* oxlint-disable typescript/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "../helpers/launch.js";

/** 验收补充：每条用真实桌面应用走一遍可观察行为（ACC-WB-05 / ACC-KN-09 / ACC-AG-11）。 */
type Call = (capability: string, input?: unknown) => Promise<{ ok: boolean; data?: any; error?: { code: string } }>;

async function caller(page: Page): Promise<Call> {
  const ep = await page.evaluate(() => window.huhuHost.engine());
  return (capability, input = {}) =>
    page.evaluate(
      async ([e, cap, inp]) => {
        const r = await fetch(`${e.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability: cap, input: inp, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        return r.json();
      },
      [ep, capability, input] as const,
    );
}

test("ACC-WB-05 首页“我的任务”勾选：待推进任务数减少，任务进入已完成", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    const t = await call("tasks.create", { title: "首页勾选", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    expect(t.ok).toBe(true);
    const open = page.getByTestId("card-open");
    await expect(open).toContainText("1");
    await page.getByTestId("card-tasks").getByRole("button", { name: "完成任务 首页勾选" }).click();
    await expect(open).toContainText("0");
    await expect(page.getByTestId("card-tasks").getByText("首页勾选")).toHaveCount(0);
    const list = await call("tasks.list", { category: "ended" });
    expect((list.data as { title: string }[]).map((x) => x.title)).toContain("首页勾选");
  } finally {
    await close();
  }
});

test("ACC-KN-09 阅读模式：<script> 与 javascript: 链接不会执行，也不会成为可点击链接", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.writeFileSync(`${vault}/危险.md`, '# 危险\n\n<script>window.__pwned = 1</script>\n\n[点我](javascript:window.__pwned=2)\n\n<img src=x onerror="window.__pwned=3">\n');
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("note-item").filter({ hasText: "危险" }).click();
    await page.getByRole("tab", { name: "阅读" }).click();
    const pane = page.locator(".knowledge-reading-pane");
    await expect(pane).toContainText("危险");
    expect(await pane.locator("script").count()).toBe(0);
    expect(await pane.locator('a[href^="javascript:" i]').count()).toBe(0);
    expect(await pane.locator("[onerror]").count()).toBe(0);
    await pane
      .getByText("点我")
      .click({ trial: false })
      .catch(() => undefined);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  } finally {
    await close();
  }
});

test("ACC-AG-11 本机没有任何受支持 CLI：“+”只提供“新终端”，并提示未检测到", async () => {
  const { page, close } = await openApp({ PATH: "/nonexistent-huhu-bin" });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page.getByRole("button", { name: "新终端" }).first().click();
    const menu = page.getByRole("menu", { name: "新终端" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(1);
    await expect(menu).toContainText("新终端");
    await expect(page.getByText("此主机未检测到支持的 CLI")).toBeVisible();
  } finally {
    await close();
  }
});

test("ACC-SY-03 取消诊断：显示“已取消”，在途结果迟到也不会变成当前结果", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 让 health.run 的响应延迟，才能在它返回前点取消
    await page.evaluate(() => {
      const orig = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        const res = await orig(input, init);
        if (body.includes('"health.run"')) await new Promise((r) => setTimeout(r, 2500));
        return res;
      };
    });
    await page.getByRole("button", { name: "健康中心" }).first().click();
    await page.getByTestId("health-run").click();
    await expect(page.getByTestId("health-overall")).toHaveText("正在检查Vault…");
    await page.getByTestId("health-run").click(); // 取消
    await expect(page.getByTestId("health-overall")).toHaveText("已取消");
    await expect(page.getByTestId("health-check").first()).toHaveAttribute("data-status", "unchecked");
    await page.waitForTimeout(3200); // 在途响应此时已返回
    await expect(page.getByTestId("health-overall")).toHaveText("已取消");
    await expect(page.getByText("检查已取消，之前的结果不再有效。")).toBeVisible();
  } finally {
    await close();
  }
});

test("ACC-TK-11 看板：把卡片拖到“已完成”列等同于勾选完成（并可拖回重开）", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = await caller(page);
    await call("tasks.create", { title: "拖拽任务", body: "", due: null, project: null, execution: { kind: "manual" }, resources: [], reminders: [] });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-views").getByRole("tab", { name: "看板" }).click();
    await expect(page.getByTestId("board-open").getByTestId("board-card")).toHaveCount(1);
    await page.getByTestId("board-open").getByTestId("board-card").dragTo(page.getByTestId("board-done"));
    await expect(page.getByTestId("board-done").getByTestId("board-card")).toHaveCount(1, { timeout: 10_000 });
    const done = await call("tasks.list", { category: "ended" });
    expect((done.data as { title: string }[]).map((x) => x.title)).toContain("拖拽任务");
    // 回执前同一任务不会重复提交，所以等上一次提交结束后再拖回（失败则重试拖拽）
    await expect(async () => {
      await page.getByTestId("board-done").getByTestId("board-card").dragTo(page.getByTestId("board-open"));
      await expect(page.getByTestId("board-open").getByTestId("board-card")).toHaveCount(1, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  } finally {
    await close();
  }
});

test("ACC-TK-06 关联资料选择器：Enter 选中高亮的文件夹；输入的自由文字不会变成资源", async () => {
  const { page, vault, close } = await openApp();
  try {
    const fs = await import("node:fs");
    fs.mkdirSync(`${vault}/Research`);
    fs.writeFileSync(`${vault}/Research/资料.md`, "# 资料\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    const picker = page.getByTestId("resource-picker");
    await picker.getByRole("button", { name: "关联 Vault 文件或文件夹" }).click();
    const search = page.getByRole("combobox", { name: "搜索 Vault 资源" });
    await search.fill("不存在的路径xyz");
    await search.press("Enter");
    await expect(picker.locator(".vrp-chip")).toHaveCount(0);
    await search.fill("Research");
    await expect(page.getByRole("option").first()).toBeVisible();
    await search.press("Enter");
    await expect(picker.locator(".vrp-chip")).toHaveCount(1);
    await expect(picker.locator(".vrp-chip").first()).toContainText("Research");
  } finally {
    await close();
  }
});
