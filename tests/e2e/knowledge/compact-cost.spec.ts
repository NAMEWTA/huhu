import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { call } from "./session-slow-bridge.js";
import { journeyMachine } from "../perf-note-journey.js";

// S2c / Q4 / H05：紧凑变体的每实例成本。评论提交行为在 compact-submit.spec.ts 验证。
// 数据写到 test-results/compact-cost.json，由 evidence/s2/compact-cost.md 引用（机器环境不同数值会变，记录的是量级与方法）。

async function heapUsage(cdp: CDPSession) {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize;
}

test("S2c：任务评论 30 条的紧凑阅读实例成本", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    const { id } = await call<{ id: string }>(page, "tasks.create", { title: "成本测量", type: "human", body: "正文 **粗体**", due: null, project: null, tags: [], reminders: [] });
    const N = 30;
    for (let i = 0; i < N; i++) await call(page, "tasks.comments.add", { taskId: id, body: `第 ${i + 1} 条评论，含 **粗体**、\`代码\` 与列表：\n\n- 甲\n- 乙` });

    const cdp = await page.context().newCDPSession(page);
    const comments = page.getByTestId("task-comment");
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(comments).toHaveCount(0);
    const before = await heapUsage(cdp);
    const t0 = performance.now();
    await page.getByTestId("task-row").filter({ hasText: "成本测量" }).first().click();
    await expect(page.getByTestId("task-comment")).toHaveCount(N, { timeout: 30_000 });
    await expect(
      page
        .getByTestId("task-comment")
        .nth(N - 1)
        .locator(".ProseMirror"),
    ).toContainText(`第 ${N} 条评论`, { timeout: 60_000 });
    const instancesOnScreen = page.locator('[data-testid="task-comment"] .ProseMirror');
    await expect(instancesOnScreen).toHaveCount(N, { timeout: 30_000 });
    const renderMs = performance.now() - t0;
    const after = await heapUsage(cdp);
    const instances = await instancesOnScreen.count();
    const perInstanceKB = Math.round((after - before) / N / 1024); // 30 个紧凑阅读实例
    const result = { comments: N, proseMirrorInstances: instances, renderAllMs: renderMs, heapDeltaMB: Math.round((after - before) / 1024 / 1024), perInstanceKB };
    mkdirSync("test-results", { recursive: true });
    writeFileSync(path.join("test-results", "compact-cost.json"), JSON.stringify(result, null, 2));
    console.log("COMPACT-COST " + JSON.stringify(result));
    expect(instances).toBe(N); // 紧凑实例不进 editor-cache LRU（P-S2c-01），30 条评论全部在挂载
  } finally {
    await close();
  }
});

const editableScenarios: { name: string; navigate(page: Page): Promise<Locator>; editor: string }[] = [
  {
    name: "任务描述",
    async navigate(page) {
      await page.getByRole("button", { name: "任务", exact: true }).first().click();
      return page.getByTestId("task-new");
    },
    editor: '[data-testid="task-body"] .ProseMirror[contenteditable="true"]',
  },
  {
    name: "收件箱想法",
    async navigate(page) {
      await page.getByRole("button", { name: "收件箱", exact: true }).first().click();
      return page.getByRole("button", { name: "快速捕获", exact: true });
    },
    editor: 'dialog[open] .ProseMirror[contenteditable="true"]',
  },
];

for (const { name, navigate, editor } of editableScenarios) {
  test(`H05：${name}的单个可编辑实例成本`, async () => {
    const { app, page, close } = await openApp();
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
      const opener = await navigate(page);
      await expect(opener).toBeVisible();
      await expect(page.locator(editor)).toHaveCount(0);
      const cdp = await page.context().newCDPSession(page);
      const beforeBytes = await heapUsage(cdp);
      await opener.evaluate((button) => {
        Object.assign(window, { compactMountStarted: 0 });
        button.addEventListener("click", () => Object.assign(window, { compactMountStarted: performance.now() }), { once: true, capture: true });
      });
      await opener.click();
      const ready = await page.waitForFunction(
        (selector) => {
          const started = (window as Window & { compactMountStarted?: number }).compactMountStarted;
          const element = document.querySelector(selector);
          return started && element?.getClientRects().length ? { milliseconds: performance.now() - started } : false;
        },
        editor,
        { polling: "raf", timeout: 20_000 },
      );
      const initializationMs = (await ready.jsonValue()).milliseconds;
      await ready.dispose();
      const afterBytes = await heapUsage(cdp);
      const result = { name, instances: await page.locator(editor).count(), initializationMs, beforeBytes, afterBytes, rendererHeapDeltaBytes: afterBytes - beforeBytes, machine: await journeyMachine(app) };
      const report = test.info().outputPath("compact-editable-cost.json");
      writeFileSync(report, JSON.stringify(result, null, 2));
      await test.info().attach("compact-editable-cost.json", { path: report, contentType: "application/json" });
      console.log("COMPACT-EDITABLE-COST " + JSON.stringify(result));
      expect(result.instances).toBe(1);
      await page.locator(editor).click();
      await page.keyboard.insertText("测量后确认可编辑");
      await expect(page.locator(editor)).toContainText("测量后确认可编辑");
    } finally {
      await close();
    }
  });
}
