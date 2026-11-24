/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HerdrClient, HerdrCore } from "../../packages/herdr-client/src/index.js";
import { machineId } from "../../packages/vault/src/vault.js";
import { fixtureProcessRunning } from "../../plugins/agent-cli/test/fixtures/core-cli.js";
import { createScaleVault } from "../perf/scale-vault.js";
import { withFixtureCleanup, withFixtureDeadline } from "./helpers/candidate-desktop.js";
import { openApp, rmTree, root, USER_DATA_ARG } from "./helpers/launch.js";
import { observeTaskPerformance, observeTaskQuit, observeTerminalFlood, observeTerminalFloodBridge, readTerminalFloodTail } from "./helpers/perf-diagnostics.js";
import { observePluginPerformance } from "./helpers/plugin-perf-diagnostics.js";
import { treeFileRows, treeFolder, treeItem, treeSettled } from "./helpers/tree.js";

import { journeyMachine, journeyPercentiles, launchJourney, measureNoteJourney, noteScenarios, prepareNotes, seedComments } from "./perf-note-journey.js";

const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(root, "resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)] ?? 0;

/**
 * 时间类阈值只在本机 / 专门的性能任务里严格断言：CI 上的共享虚拟机比开发机慢得多、抖动大，
 * 严格断言会让整条流水线随机变红；CI 里仍然测量并写进注解（设置 HUHU_PERF_STRICT=1 可强制严格）。
 */
const STRICT = !process.env["CI"] || process.env["HUHU_PERF_STRICT"] === "1";
function atMost(value: number, max: number): void {
  if (STRICT) expect(value).toBeLessThanOrEqual(max);
}

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
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
  let diagnostics: ReturnType<typeof observePluginPerformance> | undefined;
  try {
    const page = await app.firstWindow();
    if (process.env["HUHU_PERF_DIAGNOSTICS"] === "1") diagnostics = observePluginPerformance(page, test.info());
    await expect(page.getByTestId("home-module")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const cold = Date.now() - t0;
    note("冷启动到首页可交互", `${cold} ms（目标 ≤ 3000）`);
    atMost(cold, 3000);

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

    diagnostics?.mark("index-ready");
    const t1 = Date.now();
    diagnostics?.mark("disable-start", t1);
    expect(((await call("plugins.setEnabled", { id: "inbox", enabled: false })) as any).ok).toBe(true);
    const off = Date.now() - t1;
    diagnostics?.mark("disable-end", t1 + off);
    const t2 = Date.now();
    diagnostics?.mark("enable-start", t2);
    expect(((await call("plugins.setEnabled", { id: "inbox", enabled: true })) as any).ok).toBe(true);
    const on = Date.now() - t2;
    diagnostics?.mark("enable-end", t2 + on);
    note("插件停用 / 启用", `${off} ms / ${on} ms（目标 ≤ 300）`);
    atMost(off, 300);
    atMost(on, 300);

    const runtime = path.join(vault, ".huhu", "runtime");
    const pid = Number(readFileSync(path.join(runtime, readdirSync(runtime).sort().at(-1) as string, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
    if (process.platform !== "win32") {
      const rssKiB = Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim());
      note("Engine 常驻内存", `${(rssKiB / 1024).toFixed(0)} MiB（目标 ≤ 600）`);
      expect(rssKiB / 1024).toBeLessThanOrEqual(600);
    }
  } finally {
    try {
      if (diagnostics) await withFixtureDeadline(2_000, () => diagnostics!.attach()).catch(() => console.error("[perf-diagnostics] plugin attachment incomplete"));
    } finally {
      await app.close();
      rmSync(vault, { recursive: true, force: true });
    }
  }
});

test("打开 1 MiB Markdown 到可编辑 ≤ 500 ms", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  // 真实笔记按段落组织：每行一段（空行分隔）。单个 1 MiB 的超长段落会触发 @lezer/markdown 行内解析（LinkEnd）的超线性回扫，
  // 是上游解析器的已知病态输入（4 MiB 约 10 s），不是“打开 1 MiB 笔记”的典型场景，见 progress.md。
  const line = "这是一行用于测试大文档打开速度的正文，包含 **加粗**、`行内代码` 与 [[链接]]。\n\n";
  writeFileSync(path.join(vault, "大文档.md"), `# 大文档\n\n${line.repeat(Math.ceil((1024 * 1024) / Buffer.byteLength(line)))}`);
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    const item = treeItem(page, "大文档");
    await expect(item).toBeVisible({ timeout: 20_000 });
    await treeSettled(page); // 启动后的首轮索引会让树重新列举一次；Playwright 的 click 会等行停稳，那段时间不属于“打开文档”
    // 页内计时：t0 = 点击的 pointerdown 时刻，终点 = 编辑区含正文且状态行显示整份文档行数（全文都已载入）。
    // 不用两次 expect().toContain*：它们按 100/250/500/1000 ms 退避轮询，会给结果加上最多 1 s 的量化误差（同一实现测得 215 / 470 / 900 ms 三档）。
    await page.evaluate(() => {
      (window as unknown as { __t0: number }).__t0 = 0;
      document.addEventListener("pointerdown", () => ((window as unknown as { __t0: number }).__t0 = performance.now()), { capture: true, once: true });
    });
    await item.click();
    // 超过 LARGE_DOC_CHARS 的文档默认以源码模式（CodeMirror，视口渲染）打开；富文本表示延后到切换时才构建（P-S3-01）
    const handle = await page.waitForFunction(
      () => {
        const cm = document.querySelector('[data-testid="markdown-editor"] .cm-content');
        const ready = !!cm && (cm.textContent ?? "").includes("大文档") && /\d{4,} 行/.test(document.body.innerText);
        return ready ? performance.now() - (window as unknown as { __t0: number }).__t0 : false;
      },
      null,
      { polling: "raf", timeout: 10_000 },
    );
    const ms = Math.round((await handle.jsonValue()) as number);
    note("打开 1 MiB 文档到可编辑", `${ms} ms（目标 ≤ 500）`);
    atMost(ms, 500);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

/** 编辑器探针：keydown → 编辑区 DOM 更新完成的时间（应用自己的处理耗时；不含合成器绘制，Xvfb 没有真实 vsync）。 */
const editProbe = () => {
  const w = window as unknown as { __edit?: number[]; __huhuPerf?: { t0: number; cm: number[]; toString: number[]; onChange: number[] } };
  w.__edit = [];
  w.__huhuPerf = { t0: 0, cm: [], toString: [], onChange: [] };
  let t0 = 0;
  document.addEventListener(
    "keydown",
    () => {
      t0 = performance.now();
      if (w.__huhuPerf) w.__huhuPerf.t0 = t0;
    },
    true,
  );
  new MutationObserver(() => {
    if (t0 > 0) {
      w.__edit?.push(performance.now() - t0);
      t0 = 0;
    }
  }).observe(document.querySelector(".ProseMirror")!, { childList: true, subtree: true, characterData: true });
};

test("编辑输入延迟 p95 ≤ 16 ms（实时预览，5,000 行文档）", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  const body = Array.from({ length: 5000 }, (_, i) => `第 ${i} 行：这是一段正文，包含 **加粗**、\`代码\` 与 [[链接${i % 50}]]。`).join("\n\n");
  writeFileSync(path.join(vault, "长文.md"), `# 长文\n\n${body}\n`);
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeItem(page, "长文").click();
    const content = page.getByTestId("markdown-editor").locator(".ProseMirror");
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
    const stages = await page.evaluate(() => (window as unknown as { __huhuPerf: { cm: number[]; toString: number[]; onChange: number[] } }).__huhuPerf);
    const median = (xs: number[]) => {
      if (xs.length === 0) return "未采到（n=0）";
      const sorted = [...xs].sort((a, b) => a - b);
      return `${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} ms（n=${sorted.length}）`;
    };
    note("输入延迟分阶段（中位数）", `keydown→CM 事务完成 ${median(stages.cm)}；doc.toString() ${median(stages.toString)}；onChange 同步部分 ${median(stages.onChange)}`);
    const v = p95(lat);
    note("编辑输入延迟（keydown→编辑区 DOM 更新）", `p95 ${v.toFixed(1)} ms，最大 ${Math.max(...lat).toFixed(1)} ms，样本 ${lat.length}（目标 p95 ≤ 16 ms）`);
    atMost(v, 16);
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

test("任务列表 1,000 行滚动：没有超过 50 ms 的长任务", async () => {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-perf-"));
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
  const collectDiagnostics = process.env["HUHU_PERF_DIAGNOSTICS"] === "1";
  let diagnostics: Awaited<ReturnType<typeof observeTaskPerformance>> | undefined;
  try {
    const page = await app.firstWindow();
    if (collectDiagnostics) diagnostics = await observeTaskPerformance(page, test.info());
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    // 先用 API 建一个任务作为模板，再把文件复制成 1,000 份（逐个调 API 创建要几分钟，不是本用例要测的东西）
    const ep = await page.evaluate(() => window.huhuHost.engine());
    const created = await page.evaluate(async (e) => {
      const r = await fetch(`${e.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability: "tasks.create", input: { title: "模板任务", type: "human" }, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return (await r.json()) as { data: { id: string; path: string } };
    }, ep);
    const tpl = readFileSync(path.join(vault, created.data.path), "utf8");
    diagnostics?.mark("file-writes-start");
    for (let i = 0; i < 1000; i++) {
      const id = `${created.data.id}${String(i).padStart(4, "0")}`;
      writeFileSync(path.join(vault, "Tasks", `任务 ${i}--${id}.md`), tpl.replaceAll(created.data.id, id).replace("模板任务", `任务 ${i}`));
    }
    diagnostics?.mark("file-writes-done");
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await expect(page.getByTestId("task-row").first()).toBeVisible({ timeout: 30_000 });
    diagnostics?.mark("first-row-visible");
    // 用相邻 rAF 回调的间隔衡量卡顿（本环境不上报 longtask 条目）；正向对照：人为阻塞 120 ms，必须被看到
    const result = await page.evaluate(async (collectDiagnostics) => {
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
      const scrollStart = collectDiagnostics ? performance.timeOrigin + performance.now() : undefined;
      const scroll = await gaps((i) => (target.scrollTop = (total * i) / 90), 91);
      const scrollEnd = collectDiagnostics ? performance.timeOrigin + performance.now() : undefined;
      const rows = document.querySelectorAll<HTMLElement>('[data-testid="task-row"]');
      let diagnostics;
      if (collectDiagnostics) {
        const firstTaskId = rows[0]?.dataset["taskId"];
        const lastTaskId = rows[rows.length - 1]?.dataset["taskId"];
        diagnostics = {
          scrollStart: scrollStart!,
          scrollEnd: scrollEnd!,
          ...(firstTaskId !== undefined ? { firstTaskId } : {}),
          ...(lastTaskId !== undefined ? { lastTaskId } : {}),
          scrollTop: target.scrollTop,
        };
      }
      return {
        controlMax: Math.max(...control),
        longs: scroll.filter((g) => g > 66),
        worst: Math.max(...scroll),
        total,
        rows: rows.length,
        diagnostics,
      };
    }, collectDiagnostics);
    if (result.diagnostics) diagnostics?.recordScroll(result.diagnostics);
    expect(result.controlMax, "帧间隔探针看不到人为的 120 ms 阻塞").toBeGreaterThan(100);
    note("任务列表 1,000 行滚动", `帧间隔最大 ${result.worst.toFixed(0)} ms，超过 66 ms（约 4 帧）的有 ${result.longs.length} 次；可滚动高度 ${result.total}px；DOM 行数 ${result.rows}`);
    expect(result.total).toBeGreaterThan(0);
    // 目标：没有 >50 ms 的卡顿；帧间隔量化为 16.7 ms，>50 ms 即至少 4 帧（>66 ms）才会被算作一次卡顿
    if (STRICT) expect(result.longs).toEqual([]);
  } finally {
    await diagnostics?.finishProfile();
    await diagnostics?.attach("before-close");
    if (collectDiagnostics) await observeTaskQuit(app, vault);
    diagnostics?.mark("app.close-start");
    try {
      await app.close();
    } finally {
      diagnostics?.mark("app.close-settled");
      await diagnostics?.attach("after-close");
    }
    rmSync(vault, { recursive: true, force: true });
  }
});

async function stopTerminalPerfCore(vault: string, runtime: string, coreStarted: boolean): Promise<void> {
  const meta = path.join(vault, ".huhu", "vault.json");
  if (!coreStarted && !existsSync(meta)) return;
  const { id: vaultId } = JSON.parse(readFileSync(meta, "utf8")) as { id: string };
  const machine = machineId();
  const core = new HerdrCore({ bin: HERDR, vaultId, machineId: machine, runtimeDir: path.join(vault, ".huhu", "runtime", machine, "herdr") });
  const filename = path.basename(core.endpoint);
  const endpoint = path.join(runtime, filename);
  const holderPrefix = `${path.basename(filename, ".sock")}.holder`;
  const socket = lstatSync(endpoint, { throwIfNoEntry: false });
  if (coreStarted && !socket) throw new Error("已连接的终端性能夹具缺少 Core socket，无法确认停止");
  const pids: number[] = [];
  if (socket) {
    if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw new Error("终端性能夹具的 Core socket 类型或所有者不符");
    const client = new HerdrClient({ endpoint });
    const deadline = AbortSignal.timeout(8_000);
    try {
      await client.connect(deadline);
      const status = await client.call<{ pid: number; holders: { pid: number }[] }>("server.status", {}, deadline);
      if (!Array.isArray(status.holders)) throw new Error("缺少终端性能夹具的 holder 身份");
      pids.push(status.pid, ...status.holders.map(({ pid }) => pid));
      if (pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)) throw new Error("终端性能夹具返回无效的 Core 或 holder PID");
      if (process.platform === "linux") expect(readlinkSync(`/proc/${status.pid}/exe`), "终端性能夹具的 Core 可执行文件").toBe(realpathSync(HERDR));
      expect(await client.call("server.stop", {}, deadline), "终端性能夹具的 Core 停止回执").toMatchObject({ stopped: true });
    } finally {
      client.close();
    }
  }
  await expect
    .poll(
      () => ({
        pids: pids.filter(fixtureProcessRunning),
        sockets: readdirSync(runtime).filter((name) => name === filename || name === `${holderPrefix}.sock` || (name.startsWith(`${holderPrefix}.`) && name.endsWith(".sock"))),
      }),
      { timeout: 8_000, message: "终端性能夹具的 Core 与 holder 已退出" },
    )
    .toEqual({ pids: [], sockets: [] });
}

type TerminalPerfFixture = {
  vault: string;
  signal: AbortSignal;
  coreStarted: boolean;
  bridge?: ReturnType<typeof observeTerminalFloodBridge>;
  launch(): Promise<ElectronApplication>;
};

const terminalPerfTest = test.extend<{ terminalPerf: TerminalPerfFixture }>({
  terminalPerf: [
    async ({ browserName }, use, info) => {
      void browserName;
      info.skip(!existsSync(HERDR) || process.platform === "win32", "需要 Herdr Core 与 POSIX shell（yes）");
      const directory = mkdtempSync(path.join("/tmp", "huhu-flood-"));
      const vault = path.join(directory, "vault");
      const runtime = path.join(directory, "runtime");
      const teardown = new AbortController();
      let launch: Promise<ElectronApplication> | undefined;
      let desktopClosed = false;
      let coreStopped = false;
      let directoryRemoved = false;
      const fixture: TerminalPerfFixture = {
        vault,
        signal: teardown.signal,
        coreStarted: false,
        async launch() {
          teardown.signal.throwIfAborted();
          launch = electron.launch({
            args: [root, "--no-sandbox", USER_DATA_ARG],
            env: { ...process.env, HUHU_VAULT: vault, HUHU_HERDR_BIN: HERDR, XDG_RUNTIME_DIR: runtime },
            timeout: info.timeout,
          });
          const app = await launch;
          teardown.signal.throwIfAborted();
          if (process.env["HUHU_PERF_DIAGNOSTICS"] === "1") fixture.bridge = observeTerminalFloodBridge(app);
          return app;
        },
      };
      await withFixtureCleanup(async () => {
        mkdirSync(vault, { mode: 0o700 });
        mkdirSync(runtime, { mode: 0o700 });
        await use(fixture);
      }, [
        [
          `关闭终端性能夹具的 Electron（${directory}）`,
          async () => {
            teardown.abort();
            const launched = launch;
            if (launched) {
              await withFixtureDeadline(12_000, async () => {
                const app = await launched;
                await app.close();
              });
            }
            desktopClosed = true;
          },
        ],
        [
          `停止并核对终端性能夹具的 Core（${directory}）`,
          async () => {
            await stopTerminalPerfCore(vault, runtime, fixture.coreStarted);
            coreStopped = true;
          },
        ],
        [
          "删除已确认退出的终端性能夹具目录",
          () => {
            if (!desktopClosed || !coreStopped) return;
            rmTree(directory);
            directoryRemoved = true;
          },
        ],
        [
          "记录终端性能夹具清理结果",
          () =>
            withFixtureDeadline(2_000, () =>
              info.attach("terminal-flood-cleanup.json", {
                body: JSON.stringify({ directory, testStatus: info.status, desktopLaunchAttempted: launch !== undefined, desktopClosed, coreStarted: fixture.coreStarted, coreStopped, directoryRemoved }),
                contentType: "application/json",
              }),
            ),
        ],
        [
          "记录关停前后的终端桥统计",
          async () => {
            const bridge = fixture.bridge?.finish();
            if (!bridge) return;
            await withFixtureDeadline(2_000, () => info.attach("terminal-flood-bridge.json", { body: JSON.stringify(bridge), contentType: "application/json" })).catch(() =>
              console.error("[perf-diagnostics] terminal bridge attachment incomplete"),
            );
          },
        ],
      ]);
    },
    // Allow the 12 s close, 8 s Core RPC, 8 s poll, and cleanup evidence after the test times out.
    { timeout: 45_000 },
  ],
});

terminalPerfTest("终端吞吐：10 MiB 输出期间界面输入响应 p95 ≤ 100 ms", async ({ terminalPerf }) => {
  const { vault, signal } = terminalPerf;
  const app = await terminalPerf.launch();
  // The runner may stop waiting at the test timeout while an already issued Playwright call is still settling.
  signal.throwIfAborted();
  const page = await app.firstWindow();
  const diagnostics = process.env["HUHU_PERF_DIAGNOSTICS"] === "1";
  const tail = "FLOOD-DONE-42-10485760";
  const traffic = diagnostics ? observeTerminalFlood(page, tail) : undefined;
  signal.throwIfAborted();
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  signal.throwIfAborted();
  await page.getByRole("button", { name: "Agent CLI" }).first().click();
  // Core starts on the first real terminal request; merely viewing Agent CLI does not start it.
  signal.throwIfAborted();
  await page.getByRole("button", { name: "新终端", exact: true }).click();
  signal.throwIfAborted();
  await page.getByTestId("launch-shell").click();
  signal.throwIfAborted();
  const terminal = page.getByTestId("terminal-view");
  await expect(terminal).toHaveAttribute("data-state", "open", { timeout: 15_000 });
  terminalPerf.coreStarted = true;
  signal.throwIfAborted();
  await expect(page.getByTestId("core-status")).toContainText("已连接", { timeout: 20_000 });
  const sessionId = diagnostics ? await terminal.evaluate((view) => view.closest("[data-session-id]")?.getAttribute("data-session-id") ?? null).catch(() => null) : null;
  terminalPerf.bridge?.select(sessionId);
  signal.throwIfAborted();
  const search = page.getByRole("searchbox", { name: "搜索会话历史", exact: true });
  await expect(search).toBeVisible();
  const gate = path.join(vault, ".huhu", "perf-flood-start");
  const quotedGate = `'${gate.replaceAll("'", "'\"'\"'")}'`;
  type KeySample = { key: string; at: number; phase: "before" | "during" | "after"; valueBefore: number; inputAt?: number; valueAfter?: number; firstFrameAt?: number; latency?: number };
  type RowObservation = { originalDetachedAt: number | null; replacements: number; firstReplacementAt: number | null; originalRowsAtSnapshot: boolean; visibleTailAtSnapshot: boolean };
  type FloodWindow = Window & {
    __huhuFloodDone: () => Promise<void>;
    __huhuFinishFloodRows?: () => void;
    __flood: { focusedAt: number; firstOutputAt: number | null; tailAt: number | null; pending: number; keys: KeySample[]; rows?: RowObservation };
  };
  let signaledAt: number | undefined;
  signal.throwIfAborted();
  await page.exposeFunction("__huhuFloodDone", () => {
    signaledAt = Date.now();
  });
  signal.throwIfAborted();
  await page.locator(".xterm-helper-textarea").focus();
  // 等待只发生在生产者启动前。放行后仍使用原来的满速 10 MiB 管道。
  signal.throwIfAborted();
  await page.keyboard.type(`while [ ! -f ${quotedGate} ]; do sleep 0.01; done; count=$(yes 0123456789abcdef | head -c 10485760 | tee /dev/tty | wc -c); echo FLOOD-DONE-$((6*7))-$count`);
  signal.throwIfAborted();
  await page.keyboard.press("Enter");
  signal.throwIfAborted();
  await search.focus();
  signal.throwIfAborted();
  await search.evaluate(
    (input, { tail, diagnostics, sessionId }) => {
      if (!(input instanceof HTMLInputElement) || input.type !== "search" || document.activeElement !== input) throw new Error("真实会话搜索框未获得焦点");
      const w = window as unknown as FloodWindow;
      const now = () => performance.timeOrigin + performance.now();
      const probe: FloodWindow["__flood"] = { focusedAt: now(), firstOutputAt: null, tailAt: null, pending: 0, keys: [] };
      w.__flood = probe;
      const rows = document.querySelector('[data-testid="terminal-view"] .xterm-rows');
      if (!rows) throw new Error("终端输出行未挂载");
      const observer = new MutationObserver(() => {
        const text = rows.textContent ?? "";
        if (probe.firstOutputAt === null && (text.match(/0123456789abcdef/gu)?.length ?? 0) >= 3) probe.firstOutputAt = now();
        if (!text.includes(tail)) return;
        probe.tailAt = now();
        observer.disconnect();
        void w.__huhuFloodDone();
      });
      observer.observe(rows, { subtree: true, childList: true, characterData: true });
      if (diagnostics) {
        const state: RowObservation = { originalDetachedAt: null, replacements: 0, firstReplacementAt: null, originalRowsAtSnapshot: false, visibleTailAtSnapshot: false };
        probe.rows = state;
        const scope = sessionId ? `[data-session-id="${CSS.escape(sessionId)}"] ` : "";
        const currentRows = () => document.querySelector(`${scope}[data-testid="terminal-view"] .xterm-rows`);
        let observedRows = rows;
        const watchRows = new MutationObserver(() => {
          if (observedRows.isConnected) return;
          state.originalDetachedAt ??= now();
          const next = currentRows();
          if (!next || next === observedRows) return;
          observedRows = next;
          state.replacements++;
          state.firstReplacementAt ??= now();
        });
        watchRows.observe(document.body, { childList: true, subtree: true });
        w.__huhuFinishFloodRows = () => {
          watchRows.disconnect();
          const current = currentRows();
          state.originalRowsAtSnapshot = current === rows;
          state.visibleTailAtSnapshot = current?.textContent?.includes(tail) ?? false;
        };
      }
      input.addEventListener(
        "keydown",
        (event) => {
          if (!event.isTrusted || event.target !== input || (event.key !== "a" && event.key !== "Backspace")) return;
          const start = performance.now();
          const phase = probe.tailAt !== null ? "after" : probe.firstOutputAt !== null ? "during" : "before";
          const sample: KeySample = { key: event.key, at: performance.timeOrigin + start, phase, valueBefore: input.value.length };
          probe.keys.push(sample);
          if (phase !== "during") return;
          probe.pending++;
          requestAnimationFrame(() => {
            sample.firstFrameAt = now();
            requestAnimationFrame(() => {
              sample.latency = performance.now() - start;
              probe.pending--;
            });
          });
        },
        true,
      );
      input.addEventListener(
        "input",
        (event) => {
          const sample = probe.keys.at(-1);
          if (!sample || !event.isTrusted || event.target !== input) return;
          sample.inputAt = now();
          sample.valueAfter = input.value.length;
        },
        true,
      );
    },
    { tail, diagnostics, sessionId },
  );
  signal.throwIfAborted();
  const releasedAt = Date.now();
  const deadline = releasedAt + 20_000;
  if (sessionId) traffic?.start(sessionId, deadline);
  terminalPerf.bridge?.start(releasedAt, deadline);
  writeFileSync(gate, "");
  let dispatched = 0;
  for (; signaledAt === undefined && Date.now() < deadline; dispatched++) {
    signal.throwIfAborted();
    await page.keyboard.press(dispatched % 2 === 0 ? "a" : "Backspace");
  }
  // 窗口结束后仍等待窗内按键的两帧回调，保留慢样本。
  signal.throwIfAborted();
  await page.waitForFunction(() => (window as unknown as FloodWindow).__flood.pending === 0, null, { timeout: 10_000 });
  signal.throwIfAborted();
  const probe = await page.evaluate(() => {
    const w = window as unknown as FloodWindow;
    w.__huhuFinishFloodRows?.();
    return w.__flood;
  });
  signal.throwIfAborted();
  if (traffic) {
    const webSocketSnapshotAt = Date.now();
    const sockets = traffic.finish(sessionId);
    const coreReadStartedAt = Date.now();
    const core = sessionId === null ? { status: "no-session" } : await withFixtureDeadline(4_000, () => readTerminalFloodTail(page, sessionId, tail)).catch(() => ({ status: "unavailable" }));
    signal.throwIfAborted();
    const coreReadFinishedAt = Date.now();
    await withFixtureDeadline(2_000, () =>
      test.info().attach("terminal-flood-stages.json", {
        body: JSON.stringify({ sessionId, releasedAt, deadline, webSocketSnapshotAt, sockets, dom: probe.rows, coreReadStartedAt, coreReadFinishedAt, core, bridge: terminalPerf.bridge?.snapshot() }),
        contentType: "application/json",
      }),
    ).catch(() => console.error("[perf-diagnostics] terminal stage attachment incomplete"));
    signal.throwIfAborted();
  }
  const during = probe.keys.filter(({ phase }) => phase === "during");
  const thirds = [0, 0, 0];
  if (probe.firstOutputAt !== null && probe.tailAt !== null && probe.tailAt > probe.firstOutputAt) {
    const start = probe.firstOutputAt;
    const span = probe.tailAt - start;
    for (const { at } of during) {
      const index = Math.min(2, Math.floor(((at - start) * 3) / span));
      thirds[index] = thirds[index]! + 1;
    }
  }
  note(
    "终端洪流采样窗口",
    JSON.stringify({
      releasedAt,
      signaledAt,
      focusedAt: probe.focusedAt,
      firstOutputAt: probe.firstOutputAt,
      tailAt: probe.tailAt,
      dispatched,
      before: probe.keys.filter(({ phase }) => phase === "before").length,
      during: during.length,
      after: probe.keys.filter(({ phase }) => phase === "after").length,
      thirds,
    }),
  );
  await test.info().attach("terminal-flood-keys.json", {
    body: JSON.stringify({ releasedAt, signaledAt, dispatched, thirds, ...probe }, null, 2),
    contentType: "application/json",
  });
  signal.throwIfAborted();
  // The browser records the tail before notifying Node. A tail seen during frame drain can be too late.
  expect(probe.tailAt !== null && probe.tailAt <= deadline, "必须在放行后 20 秒内观察到实际洪流尾标").toBe(true);
  expect(probe.firstOutputAt, "必须观察到实际终端输出开始").not.toBeNull();
  await expect(page.getByTestId("terminal-view").locator(".xterm-rows")).toContainText(tail);
  signal.throwIfAborted();
  const lat = during.map(({ latency }) => latency!);
  expect(
    during.every(({ inputAt, valueBefore, valueAfter, key }) => typeof inputAt === "number" && valueAfter === (key === "a" ? valueBefore + 1 : Math.max(0, valueBefore - 1))),
    "窗内按键必须产生真实输入事件并修改搜索框内容",
  ).toBe(true);
  expect(lat.length, "洪流期间的按键样本太少（洪流过快结束或没有输出）").toBeGreaterThanOrEqual(10);
  const v = p95(lat);
  note("终端 10 MiB 输出期间输入响应", `p95 ${v.toFixed(1)} ms，最大 ${Math.max(...lat).toFixed(1)} ms，样本 ${lat.length}（目标 ≤ 100）`);
  atMost(v, 100);
});

test("scale-vault（10,000 篇笔记 / 1,000 任务 / 1,000 档案）：打开到文件树可用 ≤ 6 s；索引在后台完成；Engine 内存 ≤ 600 MiB", async () => {
  test.skip(process.platform === "win32", "在 Windows 上生成 10,000 个文件要十几分钟；规模性能只在 Linux / macOS 与专门的性能任务里测");
  test.setTimeout(600_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-scale-e2e-"));
  const tg = Date.now();
  const made = await createScaleVault(vault);
  note("scale-vault 生成", `${made.notes} 篇 / ${made.tasks} 任务 / ${made.archives} 档案，${Date.now() - tg} ms`);
  const t0 = Date.now();
  const app = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 60_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    // 笔记都在文件夹里：展开第一个文件夹并看到其中的笔记，才算文件树可用
    await treeFolder(page, "文件夹0").first().click({ timeout: 60_000 });
    await expect(treeFileRows(page).first()).toBeVisible({ timeout: 60_000 }); // 展开后出现真实的文件行
    const tree = Date.now() - t0;
    note("打开 scale-vault 到文件树可用", `${tree} ms（目标 ≤ 6000）`);
    atMost(tree, 6000);

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
    await expect.poll(async () => ((await call("vault.search", { query: "笔记9999" })) as any).data?.indexing, { timeout: 120_000 }).toBe(false);
    note("scale-vault 索引完成（自启动起）", `${Date.now() - t0} ms`);
    const tasks = ((await call("tasks.list", { category: "all" })) as any).data as unknown[];
    expect(tasks.length).toBe(1000);

    const runtime = path.join(vault, ".huhu", "runtime");
    const pid = Number(readFileSync(path.join(runtime, readdirSync(runtime).sort().at(-1) as string, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
    if (process.platform !== "win32") {
      const rssKiB = Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim());
      note("scale-vault Engine 常驻内存", `${(rssKiB / 1024).toFixed(0)} MiB（目标 ≤ 600）`);
      expect(rssKiB / 1024).toBeLessThanOrEqual(600);
    }
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
  }
});

// HUHU_NOTE_PERF=1 HUHU_NOTE_PERF_SAMPLES=20 pnpm e2e tests/e2e/perf.spec.ts -g "F09 笔记旅程" --workers=1 --retries=0
// 每样本独立启动 Renderer + Engine，OS 文件缓存不清除。冷开为首次打开目标，热切换为该目标从后台回到前台。
for (const scenario of noteScenarios) {
  test(`F09 笔记旅程 · ${scenario}`, async () => {
    test.skip(process.env["HUHU_NOTE_PERF"] !== "1", "按需运行三种笔记性能夹具");
    const count = Number(process.env["HUHU_NOTE_PERF_SAMPLES"] ?? 20);
    expect(Number.isSafeInteger(count) && count > 0).toBe(true);
    test.setTimeout(120_000 + count * 120_000);
    const workdir = mkdtempSync(path.join(tmpdir(), "huhu-note-journey-"));
    const vault = path.join(workdir, "vault");
    mkdirSync(vault);
    try {
      const fixture = prepareNotes(vault, scenario);
      if (fixture.threads) {
        const { app, page } = await launchJourney(vault, path.join(workdir, "seed-profile"));
        try {
          await seedComments(page, fixture.original);
        } finally {
          await app.close();
        }
      }
      const samples = [];
      for (let i = 0; i < count; i++) {
        const { app, page } = await launchJourney(vault, path.join(workdir, `profile-${i}`));
        try {
          const machine = await journeyMachine(app);
          samples.push({ machine, metrics: await measureNoteJourney(app, page, vault, fixture) });
        } finally {
          await app.close();
        }
        writeFileSync(fixture.file, fixture.original);
      }
      const { files, bytes, threads, repliesPerThread } = fixture;
      const evidence = { scenario, fixture: { files, bytes, threads, repliesPerThread }, sampleCount: count, samples, percentiles: journeyPercentiles(samples.map(({ metrics }) => metrics)) };
      const report = test.info().outputPath("note-journey.json");
      writeFileSync(report, JSON.stringify(evidence, null, 2));
      await test.info().attach("note-journey.json", { path: report, contentType: "application/json" });
      note(scenario, JSON.stringify({ sampleCount: count, ...evidence.percentiles }));
    } finally {
      rmTree(workdir);
    }
  });
}


test("F23 大库正文保存记录路径树 RPC、字节和交互耗时", async () => {
  const testInfo = test.info();
  test.setTimeout(90_000);
  const name = "F23-measure.md";
  const note = "# 测量\n\n原始正文\n";
  const fixture = await openApp({}, (directory) => {
    writeFileSync(path.join(directory, name), note);
    for (let folder = 0; folder < 50; folder++) {
      const dir = path.join(directory, `批量${folder}`);
      mkdirSync(dir);
      for (let n = 0; n < 100; n++) writeFileSync(path.join(dir, `笔记${n}.md`), note);
    }
  });
  const { page, vault, close } = fixture;
  const requestCaps = new Set(["vault.indexEntries", "vault.indexSnapshot"]);
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    if (await autosave.isChecked()) await autosave.click();
    await expect(autosave).not.toBeChecked();
    const initialTree = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/v1/call")) return false;
      const sent = response.request().postDataJSON() as { capability?: string } | undefined;
      return !!sent?.capability && requestCaps.has(sent.capability);
    });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await (await initialTree).finished();
    await page.getByTestId("notes-section-all").click();
    await treeItem(page, name).click();
    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(editor).toContainText("原始正文");
    const mainThread = await page.evaluateHandle(() => {
      const samples: number[] = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes("longtask") ? new PerformanceObserver((entries) => samples.push(...entries.getEntries().map(({ duration }) => duration))) : null;
      observer?.observe({ type: "longtask" });
      return {
        read: () => {
          if (!observer) return null;
          samples.push(...observer.takeRecords().map(({ duration }) => duration));
          observer.disconnect();
          return samples;
        },
      };
    });
    let indexCalls = 0;
    const responses: Promise<number>[] = [];
    page.on("response", (response) => {
      if (!response.url().endsWith("/api/v1/call")) return;
      const sent = response.request().postDataJSON() as { capability?: string } | undefined;
      if (!sent?.capability || !requestCaps.has(sent.capability)) return;
      indexCalls++;
      responses.push(response.body().then((body) => body.byteLength));
    });
    const started = performance.now();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("F23 保存证据");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("save-state")).toHaveText("已保存");
    expect(readFileSync(path.join(vault, name), "utf8")).toContain("F23 保存证据");
    const journeyMs = performance.now() - started;
    // 固定观察窗保留事件补刷，交互耗时在保存确认时已经结算。
    await page.waitForTimeout(500);
    const bytes = (await Promise.all(responses)).reduce((sum, value) => sum + value, 0);
    const longTasksMs = await mainThread.evaluate((measure) => measure.read());
    await mainThread.dispose();
    await testInfo.attach("f23-save-journey", { body: JSON.stringify({ fixtureNotes: 5001, indexCalls, bytes, journeyMs, longTasksMs, observationMs: 500 }), contentType: "application/json" });
    if (process.env["HUHU_F23_BASELINE"] !== "1") expect(indexCalls).toBe(0);
  } finally {
    await close();
  }
});
