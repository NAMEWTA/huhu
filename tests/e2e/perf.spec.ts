/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "./helpers/launch.js";

/** quality.md §3 中可以在 E2E 里自动测量的指标：测量值写进用例注解，超过目标即失败。 */
function note(name: string, value: string) {
  test.info().annotations.push({ type: "perf", description: `${name}: ${value}` });
  console.log(`[perf] ${name}: ${value}`);
}

test("冷启动到工作台可交互 ≤ 3 s；插件停用/启用 ≤ 300 ms；Engine 常驻内存 ≤ 600 MiB（2,000 篇笔记）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  for (let i = 0; i < 2000; i++) {
    const dir = path.join(vault, `文件夹${i % 40}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `笔记${i}.md`), `# 笔记${i}\n\n${"这是一段用来撑大索引的正文，包含发布、计划、复盘等词。".repeat(20)}\n`);
  }
  const t0 = Date.now();
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const cold = Date.now() - t0;
    note("冷启动到首页可交互", `${cold} ms（目标 ≤ 3000）`);
    expect(cold).toBeLessThanOrEqual(3000);

    const ep = await page.evaluate(() => window.huhuHost.engine());
    const call = (capability: string, input: unknown = {}) =>
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
    // 等索引建完再量内存
    await expect.poll(async () => ((await call("vault.search", { query: "笔记1999" })) as any).data?.indexing, { timeout: 60_000 }).toBe(false);

    const t1 = Date.now();
    expect(((await call("plugins.setEnabled", { id: "archives", enabled: false })) as any).ok).toBe(true);
    const off = Date.now() - t1;
    const t2 = Date.now();
    expect(((await call("plugins.setEnabled", { id: "archives", enabled: true })) as any).ok).toBe(true);
    const on = Date.now() - t2;
    note("插件停用 / 启用", `${off} ms / ${on} ms（目标 ≤ 300）`);
    expect(off).toBeLessThanOrEqual(300);
    expect(on).toBeLessThanOrEqual(300);

    const runtime = path.join(vault, ".huhu", "runtime");
    const pid = Number(readFileSync(path.join(runtime, readdirSync(runtime).sort().at(-1) as string, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
    if (process.platform !== "win32") {
      const rssKiB = Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim());
      note("Engine 常驻内存", `${(rssKiB / 1024).toFixed(0)} MiB（目标 ≤ 600）`);
      expect(rssKiB / 1024).toBeLessThanOrEqual(600);
    }
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("打开 1 MiB Markdown 到可编辑 ≤ 500 ms", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  // 真实笔记按段落组织：每行一段（空行分隔）。单个 1 MiB 的超长段落会触发 @lezer/markdown 行内解析（LinkEnd）的超线性回扫，
  // 是上游解析器的已知病态输入（4 MiB 约 10 s），不是“打开 1 MiB 笔记”的典型场景，见 progress.md。
  const line = "这是一行用于测试大文档打开速度的正文，包含 **加粗**、`行内代码` 与 [[链接]]。\n\n";
  writeFileSync(path.join(vault, "大文档.md"), `# 大文档\n\n${line.repeat(Math.ceil((1024 * 1024) / Buffer.byteLength(line)))}`);
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    const item = page.getByTestId("note-item").filter({ hasText: "大文档" });
    await expect(item).toBeVisible({ timeout: 20_000 });
    const t0 = Date.now();
    await item.click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content")).toContainText("大文档", { timeout: 10_000 });
    await expect(page.getByText(/\d{4,} 行/)).toBeVisible({ timeout: 10_000 }); // 状态行显示整份文档的行数：全文都已载入
    const ms = Date.now() - t0;
    note("打开 1 MiB 文档到可编辑", `${ms} ms（目标 ≤ 500）`);
    expect(ms).toBeLessThanOrEqual(500);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
