/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "./helpers/launch.js";

const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(root, "resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)] ?? 0;

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

/** 编辑器探针：keydown → 编辑区 DOM 更新完成的时间（应用自己的处理耗时；不含合成器绘制，Xvfb 没有真实 vsync）。 */
const editProbe = () => {
  const w = window as unknown as { __edit?: number[] };
  w.__edit = [];
  let t0 = 0;
  document.addEventListener("keydown", () => (t0 = performance.now()), true);
  new MutationObserver(() => {
    if (t0 > 0) {
      w.__edit?.push(performance.now() - t0);
      t0 = 0;
    }
  }).observe(document.querySelector(".cm-content")!, { childList: true, subtree: true, characterData: true });
};

test("编辑输入延迟 p95 ≤ 16 ms（实时预览，5,000 行文档）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  const body = Array.from({ length: 5000 }, (_, i) => `第 ${i} 行：这是一段正文，包含 **加粗**、\`代码\` 与 [[链接${i % 50}]]。`).join("\n\n");
  writeFileSync(path.join(vault, "长文.md"), `# 长文\n\n${body}\n`);
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await page.getByTestId("note-item").filter({ hasText: "长文" }).click();
    const content = page.getByTestId("markdown-editor").locator(".cm-content");
    await expect(content).toContainText("长文", { timeout: 15_000 });
    await content.click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.evaluate(editProbe);
    // 用 ASCII：Playwright 的 type() 对非 US 键盘字符走 insertText，不派发 keydown，探针会一个样本都没有
    for (let i = 0; i < 80; i++) await page.keyboard.type("a", { delay: 25 });
    await page.waitForTimeout(300);
    const lat = await page.evaluate(() => (window as unknown as { __edit: number[] }).__edit);
    expect(lat.length).toBeGreaterThan(60);
    const v = p95(lat);
    note("编辑输入延迟（keydown→编辑区 DOM 更新）", `p95 ${v.toFixed(1)} ms，最大 ${Math.max(...lat).toFixed(1)} ms，样本 ${lat.length}（目标 p95 ≤ 16 ms）`);
    expect(v).toBeLessThanOrEqual(16);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("任务列表 1,000 行滚动：没有超过 50 ms 的长任务", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 先用 API 建一个任务作为模板，再把文件复制成 1,000 份（逐个调 API 创建要几分钟，不是本用例要测的东西）
    const ep = await page.evaluate(() => window.huhuHost.engine());
    const created = await page.evaluate(async (e) => {
      const r = await fetch(`${e.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability: "tasks.create", input: { title: "模板任务", execution: { kind: "manual" } }, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return (await r.json()) as { data: { id: string; path: string } };
    }, ep);
    const tpl = readFileSync(path.join(vault, created.data.path), "utf8");
    for (let i = 0; i < 1000; i++) {
      const id = `${created.data.id}${String(i).padStart(4, "0")}`;
      writeFileSync(path.join(vault, "Tasks", `任务 ${i}--${id}.md`), tpl.replaceAll(created.data.id, id).replace("模板任务", `任务 ${i}`));
    }
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(page.getByTestId("task-row").first()).toBeVisible({ timeout: 30_000 });
    // 用相邻 rAF 回调的间隔衡量卡顿（本环境不上报 longtask 条目）；正向对照：人为阻塞 120 ms，必须被看到
    const result = await page.evaluate(async () => {
      const frame = () => new Promise<number>((r) => requestAnimationFrame((t) => r(t)));
      const gaps = async (work: (i: number) => void, n: number) => {
        const out: number[] = [];
        let last = await frame();
        for (let i = 0; i < n; i++) {
          work(i);
          const t = await frame();
          out.push(t - last);
          last = t;
        }
        return out;
      };
      const control = await gaps((i) => {
        if (i === 2) {
          const end = performance.now() + 120;
          while (performance.now() < end);
        }
      }, 6);
      const row = document.querySelector('[data-testid="task-row"]') as HTMLElement | null;
      let el: HTMLElement | null = row;
      while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement;
      const target = el ?? document.scrollingElement!;
      const total = target.scrollHeight - target.clientHeight;
      const scroll = await gaps((i) => (target.scrollTop = (total * i) / 90), 91);
      return { controlMax: Math.max(...control), longs: scroll.filter((g) => g > 66), worst: Math.max(...scroll), total, rows: document.querySelectorAll('[data-testid="task-row"]').length };
    });
    expect(result.controlMax, "帧间隔探针看不到人为的 120 ms 阻塞").toBeGreaterThan(100);
    note("任务列表 1,000 行滚动", `帧间隔最大 ${result.worst.toFixed(0)} ms，超过 66 ms（约 4 帧）的有 ${result.longs.length} 次；可滚动高度 ${result.total}px；DOM 行数 ${result.rows}`);
    expect(result.total).toBeGreaterThan(0);
    // 目标：没有 >50 ms 的卡顿；帧间隔量化为 16.7 ms，>50 ms 即至少 4 帧（>66 ms）才会被算作一次卡顿
    expect(result.longs).toEqual([]);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("终端吞吐：10 MiB 输出期间界面输入响应 p95 ≤ 100 ms", async () => {
  test.skip(!existsSync(HERDR) || process.platform === "win32", "需要 Herdr Core 与 POSIX shell（yes）");
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault, HUHU_HERDR_BIN: HERDR } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
    await page.getByRole("button", { name: "新终端", exact: true }).click();
    await page.getByRole("menuitem", { name: /新终端（shell）/ }).click();
    await expect(page.getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type("yes 0123456789abcdef | head -c 10485760; echo FLOOD-DONE-$((6*7))");
    // 命令文本已输入完：从这里开始只统计洪流期间的按键，并记下洪流结束时已有多少样本
    await page.evaluate(() => {
      const w = window as unknown as { __lat: number[]; __doneAt?: number };
      w.__lat = [];
      w.__doneAt = undefined;
      document.addEventListener(
        "keydown",
        () => {
          const t0 = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => w.__lat.push(performance.now() - t0)));
        },
        true,
      );
      setInterval(() => {
        if (w.__doneAt === undefined && document.querySelector(".xterm-rows")?.textContent?.includes("FLOOD-DONE-42")) w.__doneAt = w.__lat.length;
      }, 15);
    });
    await page.keyboard.press("Enter");
    const search = page.getByLabel("搜索当前 Space 历史");
    const t0 = Date.now();
    for (let i = 0; i < 400 && Date.now() - t0 < 20_000; i++) {
      const done = await page.evaluate(() => (window as unknown as { __doneAt?: number }).__doneAt !== undefined);
      if (done && i > 20) break;
      await search.pressSequentially("a", { delay: 10 });
    }
    await expect(page.locator(".xterm-rows")).toContainText("FLOOD-DONE-42", { timeout: 60_000 });
    const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat);
    const v = p95(lat);
    note("终端 10 MiB 输出期间输入响应", `p95 ${v.toFixed(1)} ms，最大 ${Math.max(...lat).toFixed(1)} ms，样本 ${lat.length}（目标 ≤ 100）`);
    expect(lat.length, "洪流期间的按键样本太少（洪流过快结束或没有输出）").toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(100);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});
