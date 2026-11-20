import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";
import { buildPdf, capturePrototype, countInstances, installLeakProbes } from "./leak-probes.js";

const rounds = Number(process.env["LEAK_ROUNDS"] ?? 200);
const noteCount = 12; // 超过 OK 默认池容量 10
const checkpoints = new Set([1, noteCount, 20, 50, 100, 150, rounds]);
const proseSelector = '[data-testid="markdown-editor"] .ProseMirror';
const sourceSelector = '[data-testid="markdown-editor"] .cm-content';

test(`H06 / F10：逐轮打开、切换并关闭笔记和预览（${rounds} 轮）`, async () => {
  test.setTimeout(1_800_000);
  expect(rounds).toBeGreaterThanOrEqual(noteCount);
  const { app, page, vault, close } = await openApp();
  try {
    const notes = Array.from({ length: noteCount }, (_, i) => `笔记${String(i).padStart(2, "0")}`);
    for (const name of notes) writeFileSync(path.join(vault, `${name}.md`), `# ${name}\n\n正文 ${name}。\n`);
    writeFileSync(path.join(vault, "预览甲.pdf"), buildPdf("One"));
    writeFileSync(path.join(vault, "预览乙.html"), "<!doctype html><body>HTML fixture</body>");
    writeFileSync(path.join(vault, "预览丙.txt"), "TXT fixture");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 45_000 });
    await page.evaluate(installLeakProbes);

    const endpoint = await page.evaluate(() => window.huhuHost.engine());
    const engineOrigin = new URL(endpoint.baseUrl).origin;
    const unexpectedRequests: string[] = [];
    const sockets: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => sockets.push(socket.url()));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== engineOrigin) unexpectedRequests.push(request.url());
    });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const probes = () => page.evaluate(() => (window as Window & { readLeakProbes(): LeakProbes }).readLeakProbes());
    const metrics = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      const value = (name: string) => {
        const entry = metrics.find((metric) => metric.name === name);
        if (!entry) throw new Error(`CDP 缺少指标 ${name}`);
        return entry.value;
      };
      return { nodes: value("Nodes"), listeners: value("JSEventListeners"), heapBytes: value("JSHeapUsedSize") };
    };
    const baseline = await probes();
    const open = (name: string) => treeItem(page, name).click();
    const closeTab = (name: string) => page.getByRole("button", { name: `关闭 ${name}`, exact: true }).click();
    const source = page.locator(sourceSelector);
    const prose = page.locator(proseSelector);

    const first = notes[0]!;
    await open(first);
    await expect(prose).toContainText(`正文 ${first}`);
    const tiptap = `document.querySelector(${JSON.stringify(proseSelector)}).editor`;
    const yDoc = `${tiptap}.extensionManager.extensions.find(extension => extension.name === "collaboration").options.document`;
    const tiptapProto = await capturePrototype(cdp, tiptap);
    const yDocProto = await capturePrototype(cdp, yDoc);
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    await expect(source).toContainText(first);
    const cmProto = await capturePrototype(cdp, `document.querySelector(${JSON.stringify(sourceSelector)}).cmTile.root.view`);
    const resourceCounts = async () => ({
      yDocs: await countInstances(cdp, yDocProto, "function () { return this.filter(doc => !doc.isDestroyed).length; }"),
      tiptap: await countInstances(cdp, tiptapProto, "function () { return this.filter(editor => !editor.isDestroyed).length; }"),
      cm: await countInstances(cdp, cmProto, "function () { return this.filter(view => !view.destroyed).length; }"),
      yObservers: await countInstances(
        cdp,
        yDocProto,
        `function () {
        return this.reduce((count, doc) => count + Array.from(doc.share.values()).reduce(
          (sum, type) => sum + type._eH.l.length + type._dEH.l.length, 0), 0);
      }`,
      ),
    });
    await page.getByRole("tab", { name: "实时预览", exact: true }).click();
    await expect(prose).toContainText(first);
    const editing = await resourceCounts();
    expect(editing).toMatchObject({ yDocs: 1, tiptap: 1, cm: 1 });
    expect(editing.yObservers).toBeGreaterThan(0);
    const beforePark = await probes();
    expect(beforePark.domObservers).toBeGreaterThan(baseline.domObservers);

    const downloads = path.join(vault, ".downloads");
    mkdirSync(downloads);
    await app.evaluate(({ BrowserWindow }, output) => {
      BrowserWindow.getAllWindows()[0]?.webContents.session.once("will-download", (_event, item) => {
        item.setSavePath(`${output}/${item.getFilename()}`);
      });
    }, downloads);
    await page.getByRole("button", { name: "导出 Markdown", exact: true }).click();
    const downloaded = path.join(downloads, `${first}.md`);
    const original = readFileSync(path.join(vault, `${first}.md`));
    await expect.poll(() => existsSync(downloaded) && readFileSync(downloaded).equals(original)).toBe(true);
    const characters = `正文 ${first}已编辑。`;
    await prose.getByText(`正文 ${first}。`, { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.insertText("已编辑");
    await expect(prose).toContainText(characters);
    await expect.poll(() => readFileSync(path.join(vault, `${first}.md`), "utf8")).toContain(characters);

    const beforePdf = await probes();
    await open("预览甲.pdf");
    await expect(page.locator(".pdfViewer .textLayer")).toContainText("One", { timeout: 30_000 });
    await expect.poll(async () => (await probes()).workersCreated).toBeGreaterThan(beforePdf.workersCreated);
    await expect(prose).toHaveCount(0);
    // 真正切后台仍可恢复编辑器；关闭后台标签才应释放资源。
    expect(await resourceCounts()).toMatchObject({ yDocs: 1, tiptap: 1, cm: 1 });
    await closeTab(first);
    const released = { yDocs: 0, tiptap: 0, cm: 0, yObservers: 0 };
    await expect.poll(resourceCounts, { timeout: 10_000 }).toEqual(released);
    await closeTab("预览甲.pdf");
    await expect.poll(async () => (await probes()).workersLive).toBe(baseline.workersLive);

    const samples = [];
    for (let round = 1; round <= rounds; round++) {
      const name = notes[(round - 1) % notes.length]!;
      await open(name);
      await expect(prose).toContainText(`正文 ${name}`);
      await page.getByRole("tab", { name: "源码", exact: true }).click();
      await expect(source).toContainText(name);
      await closeTab(name);

      await open("预览甲.pdf");
      await expect(page.locator(".pdfViewer .textLayer")).toContainText("One", { timeout: 30_000 });
      await open("预览乙.html");
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(1);
      await open("预览丙.txt");
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(0);
      await expect(page.getByTestId("file-card").locator(".cm-content")).toContainText("TXT fixture");
      for (const preview of ["预览甲.pdf", "预览乙.html", "预览丙.txt"]) await closeTab(preview);
      await expect(page.getByTestId("document-tab")).toHaveCount(0);

      if (!checkpoints.has(round)) continue;
      await expect.poll(resourceCounts, { timeout: 10_000 }).toEqual(released);
      await expect.poll(async () => (await probes()).domObservers).toBe(baseline.domObservers);
      await expect.poll(async () => (await probes()).workersLive).toBe(baseline.workersLive);
      await cdp.send("HeapProfiler.collectGarbage");
      samples.push({ round, ...(await resourceCounts()), ...(await probes()), ...(await metrics()) });
    }

    const report = test.info().outputPath("leak-f10.json");
    writeFileSync(report, JSON.stringify({ rounds, notes, baseline, samples, errors, unexpectedRequests, sockets }, null, 2));
    await test.info().attach("leak-f10.json", { path: report, contentType: "application/json" });
    const last = samples.at(-1)!;
    const warm = samples.find((sample) => sample.round === 100) ?? samples.find((sample) => sample.round === noteCount)!;
    expect(last.urlsCreated).toBeGreaterThan(baseline.urlsCreated);
    expect(last.urlsRevoked - baseline.urlsRevoked).toBe(last.urlsCreated - baseline.urlsCreated);
    expect(last.urlsLive).toBe(baseline.urlsLive);
    expect(last.workersCreated).toBeGreaterThan(baseline.workersCreated);
    expect(last.listeners - warm.listeners).toBeLessThanOrEqual(Math.max(50, warm.listeners * 0.05));
    expect(last.nodes - warm.nodes).toBeLessThanOrEqual(Math.max(200, warm.nodes * 0.05));
    expect(last.heapBytes - warm.heapBytes).toBeLessThanOrEqual(Math.max(15 * 1024 ** 2, warm.heapBytes * 0.25));
    expect(last.storageCalls).toEqual([]);
    expect(last.networkChannels).toEqual([]);
    expect(sockets).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

// 仅描述 renderer 返回的数据类型，Playwright 不会将函数序列化到 renderer。
interface LeakProbes {
  urlsCreated: number;
  urlsRevoked: number;
  urlsLive: number;
  workersCreated: number;
  workersLive: number;
  domObservers: number;
  storageCalls: string[];
  networkChannels: string[];
}

test("F10：已关闭的笔记读取迟到时保留当前标签、编辑内容与磁盘字节", async () => {
  const { page, vault, close } = await openApp();
  const oldPath = path.join(vault, "迟到.md");
  const currentPath = path.join(vault, "当前.md");
  const oldContent = "# 只属于旧笔记\n";
  const currentContent = "# 当前正文\n";
  const captured = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  try {
    writeFileSync(oldPath, oldContent);
    writeFileSync(currentPath, currentContent);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 45_000 });
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      const value = request.postDataJSON() as { capability?: string; input?: { path?: string } };
      if (value.capability !== "notes.read" || value.input?.path !== "迟到.md") return route.continue();
      const response = await route.fetch().catch((error: unknown) => {
        captured.reject(error);
        return null;
      });
      if (!response) return;
      captured.resolve();
      await release.promise;
      try {
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({ ok: true, data: { text: oldContent } });
        await route.fulfill({ response });
        delivered.resolve();
      } catch (error) {
        delivered.reject(error);
      }
    });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);
    await treeItem(page, "迟到").click();
    await captured.promise;
    await treeItem(page, "当前").click();
    const prose = page.locator(proseSelector);
    const heading = prose.getByRole("heading", { name: "当前正文", exact: true });
    await expect(heading).toBeVisible();
    await page.getByRole("button", { name: "关闭 迟到", exact: true }).click();

    release.resolve();
    await delivered.promise;
    const tabs = page.getByTestId("document-tab");
    await expect(tabs).toHaveCount(1);
    await expect(tabs).toHaveAttribute("aria-current", "true");
    await expect(tabs).toHaveText("当前");
    await expect(prose).toHaveText("当前正文");
    await heading.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("仍可保存");
    await expect(prose).toHaveText("当前正文仍可保存");
    await expect.poll(() => readFileSync(currentPath, "utf8")).toBe("# 当前正文仍可保存\n");
    expect(readFileSync(oldPath, "utf8")).toBe(oldContent);
    await expect(tabs).toHaveText("当前");
    await expect(prose).toHaveText("当前正文仍可保存");
  } finally {
    release.resolve();
    await close();
  }
});
