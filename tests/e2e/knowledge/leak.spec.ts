import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// F10 / H06：反复打开 / 关闭 200 轮（笔记编辑器 → PDF → HTML 预览 → TXT），编辑器实例、Y.Doc、事件监听、定时器、
// PDF worker、Object URL、iframe 没有持续增长。数据写到 test-results/leak-f10.json，由整合者抄进 evidence/。
// 方法：页面内埋点（Object URL / Worker / setInterval / setTimeout 的创建与释放计数）+ CDP：强制 GC 后读 Performance.getMetrics
// （Nodes / JSEventListeners / JSHeapUsedSize），并用 Runtime.queryObjects 数存活的 Y.Doc（取原型自 Tiptap 的 collaboration 扩展）。

const ROUNDS = Number(process.env["LEAK_ROUNDS"] ?? 200);
const SAMPLE_AT = [20, 50, 100, 150, 200].filter((n) => n <= ROUNDS);

function buildPdf(text: string): Buffer {
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R] /Count 1 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const INSTRUMENT = () => {
  const w = window as unknown as Record<string, unknown>;
  const c = { urlCreated: 0, urlRevoked: 0, workerCreated: 0, workerTerminated: 0, intervals: new Set<number>(), timeouts: new Set<number>() };
  w["__leak"] = c;
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (o: Blob | MediaSource) => (c.urlCreated++, create(o));
  URL.revokeObjectURL = (u: string) => (c.urlRevoked++, revoke(u));
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(a: string | URL, b?: WorkerOptions) {
      super(a, b);
      c.workerCreated++;
    }
    override terminate(): void {
      c.workerTerminated++;
      super.terminate();
    }
  } as typeof Worker;
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  window.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
    const id = si(fn, ms, ...a);
    c.intervals.add(id as unknown as number);
    return id;
  }) as typeof setInterval;
  window.clearInterval = ((id?: number) => (id !== undefined && c.intervals.delete(id), ci(id))) as typeof clearInterval;
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
    const id = st(
      typeof fn === "function"
        ? (...x: unknown[]) => {
            c.timeouts.delete(id as unknown as number);
            (fn as (...p: unknown[]) => void)(...x);
          }
        : fn,
      ms,
      ...a,
    );
    c.timeouts.add(id as unknown as number);
    return id;
  }) as typeof setTimeout;
  window.clearTimeout = ((id?: number) => (id !== undefined && c.timeouts.delete(id), ct(id))) as typeof clearTimeout;
};

interface Sample {
  round: number;
  prosemirror: number;
  iframes: number;
  yDocs: number | null;
  nodes: number;
  jsEventListeners: number;
  jsHeapUsedMB: number;
  objectUrlsLive: number;
  objectUrlsCreatedTotal: number;
  workersCreatedTotal: number;
  workersLive: number;
  intervalsLive: number;
  timeoutsPending: number;
  panelsOpen: number;
}

async function sample(page: Page, cdp: CDPSession, round: number, yProto: { objectId?: string }): Promise<Sample> {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(300);
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  let yDocs: number | null = null;
  if (yProto.objectId) {
    const r = await cdp.send("Runtime.queryObjects", { prototypeObjectId: yProto.objectId });
    const len = await cdp.send("Runtime.callFunctionOn", { objectId: r.objects.objectId!, functionDeclaration: "function(){return this.length}", returnByValue: true });
    yDocs = len.result.value as number;
  }
  const dom = await page.evaluate(() => {
    const c = (window as unknown as { __leak: { urlCreated: number; urlRevoked: number; workerCreated: number; workerTerminated: number; intervals: Set<number>; timeouts: Set<number> } }).__leak;
    return {
      prosemirror: document.querySelectorAll(".ProseMirror").length,
      iframes: document.querySelectorAll("iframe").length,
      objectUrlsLive: c.urlCreated - c.urlRevoked,
      objectUrlsCreatedTotal: c.urlCreated,
      workersCreatedTotal: c.workerCreated,
      workersLive: c.workerCreated - c.workerTerminated,
      intervalsLive: c.intervals.size,
      timeoutsPending: c.timeouts.size,
    };
  });
  return {
    round,
    ...dom,
    yDocs,
    nodes: metrics["Nodes"] ?? -1,
    jsEventListeners: metrics["JSEventListeners"] ?? -1,
    jsHeapUsedMB: Math.round(((metrics["JSHeapUsedSize"] ?? 0) / 1024 / 1024) * 10) / 10,
    panelsOpen: await page.getByTestId("document-tab").count(),
  };
}

test(`F10 泄漏专项：笔记编辑器 / PDF / HTML 预览 / TXT 反复切换 ${ROUNDS} 轮无持续增长`, async () => {
  test.setTimeout(1_800_000);
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "甲.md"), "# 甲\n\n正文甲。\n");
    writeFileSync(path.join(vault, "乙.pdf"), buildPdf("One"));
    writeFileSync(path.join(vault, "丙.html"), "<!doctype html><body>b</body>");
    writeFileSync(path.join(vault, "丁.txt"), "c");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.evaluate(INSTRUMENT); // 加载完成后再埋点：之后创建的 Object URL / Worker / 定时器都会被计数
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");

    // 取 Y.Doc 的原型（需要一个已挂载的编辑器；Tiptap 把实例挂在 view.dom.editor 上）
    await treeItem(page, "甲").click();
    await expect(page.getByTestId("markdown-editor").locator(".ProseMirror").first()).toContainText("正文甲", { timeout: 30_000 });
    const yProto: { objectId?: string } = {};
    const ev = await cdp.send("Runtime.evaluate", {
      expression: `(() => { const dom = document.querySelector(".ProseMirror"); const ext = dom && dom.editor && dom.editor.extensionManager.extensions.find((e) => e.name === "collaboration"); const doc = ext && ext.options && ext.options.document; return doc ? Object.getPrototypeOf(doc) : undefined })()`,
      returnByValue: false,
    });
    if (ev.result.objectId) yProto.objectId = ev.result.objectId;

    const samples: Sample[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (let i = 1; i <= ROUNDS; i++) {
      await treeItem(page, "甲").click();
      await expect(page.getByTestId("markdown-editor").locator(".ProseMirror").first()).toContainText("正文甲");
      await treeItem(page, "乙").click();
      await expect(page.locator(".pdfViewer")).toHaveCount(1);
      await treeItem(page, "丙").click();
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(1);
      await treeItem(page, "丁").click();
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(0);
      if (SAMPLE_AT.includes(i)) samples.push(await sample(page, cdp, i, yProto));
    }
    // 关闭全部标签后的终态
    for (let n = await page.getByTestId("document-tab").count(); n > 0; n = await page.getByTestId("document-tab").count()) {
      await page.getByRole("button", { name: /^关闭 / }).first().click();
    }
    const final = await sample(page, cdp, ROUNDS + 1, yProto);

    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/leak-f10.json", JSON.stringify({ rounds: ROUNDS, yDocCountable: Boolean(yProto.objectId), samples, finalAllTabsClosed: final, errors }, null, 2));
    console.log(JSON.stringify({ samples, final }, null, 1));

    const last = samples[samples.length - 1]!;
    const base = samples[0]!;
    expect(errors).toEqual([]);
    expect(final.iframes).toBe(0);
    expect(last.iframes).toBe(0);
    // 增长判定：第 100 轮到第 200 轮之间（预热后），计数类指标不增长；Object URL / worker / interval 存量有界
    const mid = samples.find((s) => s.round === 100) ?? base;
    expect(last.prosemirror).toBeLessThanOrEqual(Math.max(base.prosemirror, 1) + 1);
    expect(last.nodes - mid.nodes).toBeLessThanOrEqual(Math.max(200, mid.nodes * 0.05));
    expect(last.jsEventListeners - mid.jsEventListeners).toBeLessThanOrEqual(Math.max(50, mid.jsEventListeners * 0.05));
    expect(last.objectUrlsLive).toBeLessThanOrEqual(base.objectUrlsLive + 5);
    expect(last.workersLive).toBeLessThanOrEqual(Math.max(base.workersLive, 1) + 1);
    expect(last.intervalsLive).toBeLessThanOrEqual(base.intervalsLive + 3);
    expect(last.jsHeapUsedMB - mid.jsHeapUsedMB).toBeLessThanOrEqual(Math.max(15, mid.jsHeapUsedMB * 0.25));
    if (last.yDocs !== null && base.yDocs !== null) expect(last.yDocs).toBeLessThanOrEqual(Math.max(base.yDocs, 11) + 1);
  } finally {
    await close();
  }
});
