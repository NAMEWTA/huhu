import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

// S2c / Q4 / H05：紧凑变体的每实例成本。评论提交行为在 compact-submit.spec.ts 验证。
// 数据写到 test-results/compact-cost.json，由 evidence/s2/compact-cost.md 引用（机器环境不同数值会变，记录的是量级与方法）。

type Call = (cap: string, input?: unknown) => Promise<{ ok?: boolean; data?: unknown }>;
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

test("S2c：任务评论 30 条的紧凑阅读实例成本", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    const call = await caller(page);
    const created = (await call("tasks.create", { title: "成本测量", type: "human", body: "正文 **粗体**", due: null, project: null, tags: [], reminders: [] })) as { data: { id: string } };
    const N = 30;
    for (let i = 0; i < N; i++) await call("tasks.comments.add", { taskId: created.data.id, body: `第 ${i + 1} 条评论，含 **粗体**、\`代码\` 与列表：\n\n- 甲\n- 乙` });

    const cdp = await page.context().newCDPSession(page);
    const heap = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      return ((await cdp.send("Runtime.getHeapUsage")) as { usedSize: number }).usedSize;
    };
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-row").filter({ hasText: "成本测量" }).first().click();
    const before = await heap();
    const t0 = Date.now();
    await expect(page.getByTestId("task-comment")).toHaveCount(N, { timeout: 30_000 });
    await expect(
      page
        .getByTestId("task-comment")
        .nth(N - 1)
        .locator(".ProseMirror"),
    ).toContainText(`第 ${N} 条评论`, { timeout: 60_000 });
    const instancesOnScreen = page.locator('[data-testid="task-comment"] .ProseMirror');
    await expect(instancesOnScreen).toHaveCount(N, { timeout: 30_000 });
    const renderMs = Date.now() - t0;
    const after = await heap();
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
