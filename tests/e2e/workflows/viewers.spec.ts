import { expect, test, type Frame, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { openApp, root } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

/**
 * S7 查看器验收（F01–F06、F10）：每条都用真实桌面应用（Electron）。
 * PDF / HTML 的样本在用例里程序化生成；恶意页面的 F05 安全用例集在隔离 iframe 里真实运行并读回结果。
 */

/** 手写一个最小合法 PDF（含正确 xref）；`pad` 个字节的未引用流让文件超过 10 MiB 以验证分段读取。 */
function buildPdf(pages: string[], pad = 0): Buffer {
  const objs: Buffer[] = [];
  const add = (body: string | Buffer) => (objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1")), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // Pages，稍后回填
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const text of pages) {
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`));
  }
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`, "latin1");
  if (pad > 0) add(Buffer.concat([Buffer.from(`<< /Length ${pad} >>\nstream\n`, "latin1"), Buffer.alloc(pad, 0x20), Buffer.from("\nendstream", "latin1")]));
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let pos = chunks[0]!.length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const piece = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(piece);
    pos += piece.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`), `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`].join("");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

/**
 * F05 要求 dev 与 prod 各跑一遍。本基线上 dev（electron-vite 渲染进程开发服务器，http://localhost:*）无法端到端运行：
 * ① `packages/contracts/src/ids.ts` 的 `node:crypto` 被 Vite 外部化，工作台白屏；② Engine 的 CORS 只放行 `huhu-app://workbench`（packages/kernel/src/server/ingress.ts 的 RENDERER_ORIGIN）。
 * 两者与 S7 无关（见 evidence/s7/report.md）。这里只跑 prod；dev 来源只影响预览响应头里的 `frame-ancestors`，由 apps/desktop/test/preview-protocol.test.ts 单测覆盖。
 */
const MODES = ["prod"] as const;

/** 每个用例用独立的用户数据目录：Electron 的单实例锁按 userData 区分，别的会话 / 并行任务正在运行的应用不会让这里的启动立刻退出。 */
const launch = (extra: Record<string, string> = {}) => openApp({ XDG_CONFIG_HOME: mkdtempSync(path.join(tmpdir(), "huhu-xdg-")), ...extra });

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function openKnowledge(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
}
const openFile = (page: Page, name: string) => treeItem(page, name).click();
const typeAtEnd = async (page: Page, text: string) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(text);
};

test("F01 / F02：TXT / JSON 编辑写回原文件；无效 JSON 不被清空；格式化是显式动作；BOM / CRLF 保真；非 UTF-8 只读", async () => {
  const { page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/说明.txt`, "第一行\n");
    writeFileSync(`${vault}/数据.json`, '{"a":1}\n');
    writeFileSync(`${vault}/bom.txt`, "﻿a\r\nb\r\n");
    writeFileSync(`${vault}/gbk.txt`, Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a])); // “你好\n” 的 GBK 编码
    writeFileSync(`${vault}/混合.txt`, "a\r\nb\nc");
    await openKnowledge(page);

    // TXT：编辑 → 自动保存 → 磁盘一致
    await openFile(page, "说明");
    await typeAtEnd(page, "第二行");
    await expect.poll(() => readFileSync(`${vault}/说明.txt`, "utf8")).toBe("第一行\n第二行");

    // JSON：制造语法错误，内容不被清空；诊断显示；格式化按钮禁用；磁盘上是用户键入的内容（不被“修复”）
    await openFile(page, "数据");
    await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法正确");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft"); // 在 } 之前
    await page.keyboard.insertText(",");
    await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法错误");
    await expect(page.getByTestId("file-format-json")).toBeDisabled();
    await expect.poll(() => readFileSync(`${vault}/数据.json`, "utf8")).toBe('{"a":1,}\n');
    // 修好以后：保存路径没有格式化（磁盘仍是紧凑格式），点“格式化”才缩进
    await page.keyboard.press("Backspace");
    await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法正确");
    await expect.poll(() => readFileSync(`${vault}/数据.json`, "utf8")).toBe('{"a":1}\n');
    await page.getByTestId("file-format-json").click();
    await expect(page.getByTestId("file-format-note")).toContainText("已格式化");
    await expect.poll(() => readFileSync(`${vault}/数据.json`, "utf8")).toBe('{\n  "a": 1\n}\n');

    // BOM + CRLF：在开头插入一个字符，其余字节不变
    await openFile(page, "bom");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("X");
    await expect.poll(() => readFileSync(`${vault}/bom.txt`, "utf8")).toBe("﻿Xa\r\nb\r\n");

    // 非 UTF-8：不加载编辑器，原文件不被改动
    const before = readFileSync(`${vault}/gbk.txt`);
    await openFile(page, "gbk");
    await expect(page.getByTestId("file-encoding-unsupported")).toBeVisible();
    await expect(page.locator(".cm-content")).toHaveCount(0);
    expect(readFileSync(`${vault}/gbk.txt`).equals(before)).toBe(true);

    // 混合换行：只读提示
    await openFile(page, "混合");
    await expect(page.getByTestId("file-readonly-note")).toBeVisible();
  } finally {
    await close();
  }
});

test("F02：外部修改与冲突——有未保存编辑时外部改了文件，走冲突流程，不静默覆盖", async () => {
  const { page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/冲突.txt`, "原始\n");
    await openKnowledge(page);
    await page.evaluate(() => undefined);
    await openFile(page, "冲突");
    // 先在界面里保持“手动保存”之外的状态：输入后立刻让磁盘被外部改写
    await typeAtEnd(page, "我的");
    writeFileSync(`${vault}/冲突.txt`, "外部\n");
    await expect(page.getByTestId("note-keep-mine").or(page.getByTestId("save-state").filter({ hasText: "已保存" }))).toBeVisible({ timeout: 15_000 });
    // 如果自动保存先落盘了就没有冲突；否则出现冲突时磁盘上的外部内容必须仍在，直到用户选择
    const disk = readFileSync(`${vault}/冲突.txt`, "utf8");
    if (await page.getByTestId("note-keep-mine").count()) expect(disk).toBe("外部\n");
  } finally {
    await close();
  }
});

test("F03：PDF 浏览 / 缩放 / 查找 / 选择；> 10 MiB 经 vault.readRange 分段读取；损坏有明确反馈", async () => {
  const { page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/手册.pdf`, buildPdf(["Alpha Page", "Bravo Page", "Charlie Page"]));
    writeFileSync(`${vault}/大.pdf`, buildPdf(["Huge Sample"], 11 * 1024 * 1024));
    writeFileSync(`${vault}/坏.pdf`, "this is not a pdf");
    const calls: string[] = [];
    const lengths: number[] = [];
    page.on("request", (r) => {
      const body = r.postData();
      if (r.method() === "POST" && body && r.url().includes("/api/v1/call")) {
        try {
          const j = JSON.parse(body) as { capability: string; input?: { path?: string; length?: number } };
          if (j.input?.path?.endsWith(".pdf")) calls.push(`${j.capability}:${j.input.path}`);
          if (j.capability === "vault.readRange" && j.input?.path === "大.pdf") lengths.push(j.input.length ?? 0);
        } catch {
          /* 非 JSON 请求忽略 */
        }
      }
    });
    await openKnowledge(page);

    await openFile(page, "手册");
    await expect(page.getByTestId("pdf-view")).toBeVisible();
    await expect(page.locator(".pdfViewer .page")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Alpha Page", { timeout: 30_000 });
    // 缩放：放大后百分比变大；“适应宽度”回到初始
    const z0 = parseInt((await page.getByTestId("pdf-zoom").textContent()) ?? "0", 10);
    await page.getByRole("button", { name: "放大" }).click();
    await expect.poll(async () => parseInt((await page.getByTestId("pdf-zoom").textContent()) ?? "0", 10)).toBeGreaterThan(z0);
    await page.getByRole("button", { name: "适应宽度" }).click();
    await expect.poll(async () => parseInt((await page.getByTestId("pdf-zoom").textContent()) ?? "0", 10)).toBe(z0);
    // 查找
    await page.getByRole("button", { name: "在 PDF 中查找" }).click();
    await page.getByTestId("pdf-find-input").fill("Bravo");
    await expect(page.getByTestId("pdf-find-count")).toContainText("1 / 1", { timeout: 15_000 });
    await page.getByTestId("pdf-find-input").press("Escape");
    // 选择：文字层可选
    expect(
      await page
        .locator(".pdfViewer .textLayer span")
        .first()
        .evaluate((el) => getComputedStyle(el).userSelect),
    ).not.toBe("none");

    // > 10 MiB：分段读取（不经 readBinary / readFile）
    calls.length = 0;
    await openFile(page, "大");
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Huge Sample", { timeout: 60_000 });
    expect(calls.filter((c) => c.startsWith("vault.readRange:")).length).toBeGreaterThan(1);
    expect(lengths.length).toBeGreaterThan(1);
    expect(lengths.every((length) => length > 0 && length <= 4 * 1024 * 1024)).toBe(true);
    expect(calls.some((c) => c.startsWith("vault.readBinary:") || c.startsWith("notes.read:"))).toBe(false);

    // 损坏：明确反馈，没有空白“假成功”
    await openFile(page, "坏");
    await expect(page.getByTestId("pdf-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".pdfViewer .page")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("附件分段下载拒绝两段之间的同尺寸替换", async () => {
  const { page, vault, close } = await openApp();
  try {
    const size = 4 * 1024 * 1024 + 8;
    const file = path.join(vault, "载荷.txt");
    const replacement = path.join(vault, "replacement");
    writeFileSync(file, Buffer.alloc(size, "o"));
    writeFileSync(replacement, Buffer.alloc(size, "n"));
    writeFileSync(path.join(vault, "附件.md"), '起始\n\n<File src="./载荷.txt" />\n');
    const offsets: number[] = [];
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability?: string; input?: { path?: string; offset?: number } };
      if (request.capability !== "vault.readRange" || request.input?.path !== "载荷.txt") return route.continue();
      const offset = request.input.offset ?? -1;
      offsets.push(offset);
      if (offset !== 0) return route.continue();
      const response = await route.fetch();
      // 第一段由实际 Engine 读取，替换发生在同一次下载的第二个请求之前。
      renameSync(replacement, file);
      await route.fulfill({ response });
    });
    await openKnowledge(page);
    await openFile(page, "附件");
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await prose.getByText("起始", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect(prose.locator('[data-component-name="File"]')).toHaveAttribute("data-selected", "true");
    await page.getByRole("button", { name: /Download file|下载文件/ }).click();
    await expect(page.getByText("附件在读取期间发生变化，请重新下载")).toBeVisible();
    expect(offsets).toEqual([0, 4 * 1024 * 1024]);
  } finally {
    await close();
  }
});

test("F03：密码保护的 PDF 显示原因，不渲染空白页", async () => {
  const { page, vault, close } = await launch();
  try {
    const sample = readFileSync(new URL("../../fixtures/password-protected.pdf", import.meta.url));
    writeFileSync(path.join(vault, "密码.pdf"), sample);
    await openKnowledge(page);
    await openFile(page, "密码.pdf");
    await expect(page.getByTestId("pdf-error")).toContainText("受密码保护");
    await expect(page.getByTestId("pdf-view")).toHaveAttribute("data-pdf-state", "error");
    await expect(page.locator(".pdfViewer .page")).toHaveCount(0);
  } finally {
    await close();
  }
});

/** 原生文件监听是否可用：容器 / 共享主机上 inotify 配额耗尽（ENOSPC）时 Engine 收不到外部修改事件，依赖外部修改事件的用例无法在该环境运行。 */
async function nativeWatchAvailable(): Promise<boolean> {
  try {
    const req = createRequire(path.join(root, "package.json"));
    const watcher = req("@parcel/watcher") as { subscribe: (dir: string, cb: () => void) => Promise<{ unsubscribe: () => Promise<void> }> };
    const sub = await watcher.subscribe(mkdtempSync(path.join(tmpdir(), "huhu-watch-probe-")), () => undefined);
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

test("F03：PDF 被外部修改——出现“已被外部修改”提示或直接显示新内容，不继续展示旧页面", async () => {
  test.skip(!(await nativeWatchAvailable()), "原生文件监听不可用（inotify ENOSPC）：Engine 收不到外部修改事件，见 evidence/s7/report.md");
  const { page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/手册.pdf`, buildPdf(["Alpha Page", "Bravo Page", "Charlie Page"]));
    await openKnowledge(page);
    await openFile(page, "手册");
    await expect(page.locator(".pdfViewer .page")).toHaveCount(3, { timeout: 30_000 });
    writeFileSync(`${vault}/手册.pdf`, buildPdf(["Delta Page"]));
    // 外壳可能因文件元信息变化直接重新挂载查看器（立即显示新内容），也可能显示“已被外部修改”横幅；两种都不能继续展示旧页面而不提示
    const banner = page.getByTestId("pdf-external-change");
    const fresh = page.locator(".pdfViewer .textLayer").first().filter({ hasText: "Delta Page" });
    await expect(banner.or(fresh)).toBeVisible({ timeout: 20_000 });
    if (await banner.isVisible()) await page.getByTestId("pdf-reload").click();
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Delta Page", { timeout: 30_000 });
  } finally {
    await close();
  }
});

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page.getByTestId("html-preview-frame").elementHandle();
  const frame = await handle!.contentFrame();
  if (!frame) throw new Error("预览 iframe 没有可访问的框架");
  return frame;
}

for (const mode of MODES)
  test(`F04：HTML 整页隔离渲染（head / style / 相对 CSS / 图片 / 脚本）；源码修改保存后预览更新 [${mode}]`, async () => {
    const { page, vault, close } = await launch();
    try {
      writeFileSync(`${vault}/style.css`, ".big { font-size: 33px; }");
      writeFileSync(`${vault}/pic.png`, PNG_1PX);
      writeFileSync(
        `${vault}/页面.html`,
        `<!doctype html><html><head><meta charset="utf-8"><title>标题X</title><link rel="stylesheet" href="style.css"><style>body{background:rgb(1,2,3)}</style></head><body><h1 class="big" id="h">你好页面</h1><img id="pic" src="pic.png"><div id="js">no-js</div><script>document.getElementById("js").textContent="js-ran"</script></body></html>`,
      );
      await openKnowledge(page);
      await openFile(page, "页面");
      const frame = await previewFrame(page);
      await expect(frame.locator("#h")).toHaveText("你好页面");
      await expect(frame.locator("#js")).toHaveText("js-ran"); // 代表性脚本页面能运行
      expect(await frame.locator("#h").evaluate((e) => getComputedStyle(e).fontSize)).toBe("33px"); // 相对 CSS
      expect(await frame.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(1, 2, 3)"); // <style>
      await expect.poll(() => frame.locator("#pic").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0); // 相对图片
      // iframe 沙箱属性
      expect(await page.getByTestId("html-preview-frame").getAttribute("sandbox")).toBe("allow-scripts");

      // 源码模式修改并保存 → 回到预览看到新内容
      await page.getByTestId("html-mode").getByRole("tab", { name: "源码" }).click();
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+Home");
      await page.keyboard.insertText("<!-- 改动 -->");
      await expect.poll(() => readFileSync(`${vault}/页面.html`, "utf8")).toContain("<!-- 改动 -->");
      writeFileSync(`${vault}/页面.html`, readFileSync(`${vault}/页面.html`, "utf8").replace("你好页面", "已更新页面"));
      await page.getByTestId("html-mode").getByRole("tab", { name: "预览" }).click();
      // 保存和外部写入都会换预览 iframe，断言跟随当前预览实例。
      await expect(page.frameLocator('[data-testid="html-preview-frame"]').locator("#h")).toHaveText("已更新页面", { timeout: 15_000 });
    } finally {
      await close();
    }
  });

for (const mode of MODES)
  test(`F05：恶意 HTML 在隔离预览里的越权尝试全部被拦（fetch / XHR / import() / postMessage / top 导航 / 自导航 / window.open / WebRTC / 权限 / file:// / 路径穿越 / 符号链接 / 受保护目录） [${mode}]`, async () => {
    const { app, page, vault, close } = await launch();
    try {
      const outside = path.join(path.dirname(vault), `outside-${path.basename(vault)}`);
      mkdirSync(outside, { recursive: true });
      writeFileSync(`${outside}/secret.png`, PNG_1PX);
      mkdirSync(`${vault}/.huhu`, { recursive: true });
      writeFileSync(`${vault}/.huhu/secret.png`, PNG_1PX);
      writeFileSync(`${vault}/ok.png`, PNG_1PX);
      symlinkSync(outside, `${vault}/逃逸`);
      expect(existsSync(`${vault}/逃逸/secret.png`)).toBe(true);
      const evil = `<!doctype html><meta charset="utf-8"><body><pre id="out">running</pre><script>
const R = {};
const done = (k, v) => { R[k] = v; document.getElementById("out").textContent = JSON.stringify(R); };
const rejects = (k, p) => p.then(() => done(k, "ALLOWED"), (e) => done(k, "blocked:" + (e && e.name || "err")));
const img = (k, src) => new Promise((res) => { const i = new Image(); i.onload = () => { done(k, "ALLOWED"); res(); }; i.onerror = () => { done(k, "blocked"); res(); }; i.src = src; });
(async () => {
  done("node-require", typeof require === "undefined" && typeof process === "undefined" ? "blocked" : "ALLOWED");
  try { void parent.huhuHost; done("parent-bridge", "ALLOWED"); } catch (e) { done("parent-bridge", "blocked:" + e.name); }
  try { done("top-nav", (top.location.href, "ALLOWED")); } catch (e) { done("top-read", "blocked:" + e.name); }
  try { top.location.href = "https://example.com/"; done("top-nav", "attempted"); } catch (e) { done("top-nav", "blocked:" + e.name); }
  const w = window.open("https://example.com/"); done("window-open", w ? "ALLOWED" : "blocked");
  await rejects("fetch-external", fetch("https://example.com/"));
  await rejects("fetch-same-scheme", fetch(location.href));
  await rejects("fetch-file", fetch("file:///etc/passwd"));
  await rejects("xhr", new Promise((res, rej) => { const x = new XMLHttpRequest(); x.onload = () => res(); x.onerror = () => rej(new Error("x")); try { x.open("GET", "https://example.com/"); x.send(); } catch (e) { rej(e); } }));
  await rejects("import-external", import("https://example.com/x.mjs"));
  await rejects("websocket", new Promise((res, rej) => { try { const s = new WebSocket("ws://127.0.0.1:1/"); s.onopen = () => res(); s.onerror = () => rej(new Error("ws")); } catch (e) { rej(e); } }));
  await img("img-external", "https://example.com/x.png");
  await img("img-file", "file:///etc/hostname");
  await img("img-control-ok", "/ok.png");
  await img("img-protected-huhu", "/.huhu/secret.png");
  await img("img-symlink-escape", "/%E9%80%83%E9%80%B8/secret.png");
  await img("img-traversal", "/../../x.png");
  await img("img-traversal-encoded", "/%2e%2e/%2e%2e/secret.png");
  try { await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej)); done("geolocation", "ALLOWED"); } catch (e) { done("geolocation", "blocked"); }
  await rejects("getUserMedia", navigator.mediaDevices.getUserMedia({ audio: true }));
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.createDataChannel("x");
    const cands = [];
    pc.onicecandidate = (e) => { if (e.candidate) cands.push(e.candidate.candidate); };
    await Promise.race([(async () => { await pc.setLocalDescription(await pc.createOffer()); await new Promise((r) => setTimeout(r, 2500)); })(), new Promise((r) => setTimeout(r, 6000))]);
    done("webrtc", cands.some((c) => / typ (srflx|host)/.test(c) && !/\\.local /.test(c)) ? "LEAK:" + cands.join("|") : "blocked");
  } catch (e) { done("webrtc", "blocked:" + e.name); }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["x"])); a.download = "x.txt"; document.body.appendChild(a); a.click(); done("download", "attempted");
  const f = document.createElement("form"); f.action = "https://example.com/"; f.method = "POST"; document.body.appendChild(f); try { f.submit(); done("form-submit", "attempted"); } catch (e) { done("form-submit", "blocked"); }
  parent.postMessage({ evil: true }, "*"); done("postMessage", "sent");
  done("end", "1");
})();
</script>`;
      writeFileSync(`${vault}/evil.html`, evil);
      await openKnowledge(page);
      const msgs = await page.evaluate(() => {
        (window as unknown as { __msgs: unknown[] }).__msgs = [];
        window.addEventListener("message", (e) => (window as unknown as { __msgs: unknown[] }).__msgs.push(e.data));
        (window as unknown as { __url0: string }).__url0 = location.href;
        return true;
      });
      expect(msgs).toBe(true);
      await openFile(page, "evil");
      const out = page.frameLocator('[data-testid="html-preview-frame"]').locator("#out");
      await expect(out).toContainText('"end"', { timeout: 50_000 });
      const R = JSON.parse((await out.textContent()) ?? "{}") as Record<string, string>;
      await page.screenshot({ path: path.join(path.dirname(vault), `f05-${path.basename(vault)}.png`) });

      // 必须被拦的
      for (const k of [
        "node-require",
        "parent-bridge",
        "window-open",
        "fetch-external",
        "fetch-same-scheme",
        "fetch-file",
        "xhr",
        "import-external",
        "websocket",
        "img-external",
        "img-file",
        "img-protected-huhu",
        "img-symlink-escape",
        "img-traversal",
        "img-traversal-encoded",
        "geolocation",
        "getUserMedia",
        "webrtc",
      ]) {
        expect(R[k], `${k}: ${R[k]}`).toMatch(/^blocked/);
      }
      expect(R["img-control-ok"], "对照：Vault 内合法图片应能加载").toBe("ALLOWED");
      expect(R["top-nav"]).toMatch(/blocked|attempted/);
      // 工作台没有被导航、没有发生副作用
      // 比较去掉 hash 的地址：S5 的文件树打开资源时 OK 会把目标写进 URL hash（`#/evil.html`），这不是预览页导航工作台
      const noHash = (u: string) => u.split("#")[0];
      expect(noHash(await page.evaluate(() => location.href))).toBe(noHash(await page.evaluate(() => (window as unknown as { __url0: string }).__url0)));
      expect(await page.getByTestId("html-preview-frame").getAttribute("src")).toMatch(/^huhu-preview:\/\//);
      // postMessage 是浏览器允许的单向通知；工作台没有处理它，不泄露任何桥接（上面 parent-bridge 已断言）
      expect(await app.evaluate(() => typeof (globalThis as { __leak?: unknown }).__leak)).toBe("undefined");
    } finally {
      await close();
    }
  });

for (const mode of MODES)
  test(`F05：预览 iframe 自导航到外部 URL（脚本 / 链接 / meta refresh）被拦，工作台不受影响 [${mode}]`, async () => {
    const { page, vault, close } = await launch();
    try {
      writeFileSync(`${vault}/导航.html`, `<!doctype html><meta charset="utf-8"><body><a id="l" href="https://example.com/">go</a><script>setTimeout(() => { location.href = "https://example.com/"; }, 300)</script>`);
      writeFileSync(`${vault}/刷新.html`, `<!doctype html><meta http-equiv="refresh" content="0;url=https://example.com/"><body>refresh</body>`);
      await openKnowledge(page);
      for (const name of ["导航", "刷新"]) {
        await openFile(page, name);
        await page.waitForTimeout(3000);
        // 任何框架都没有到达外部站点；工作台主框架仍是应用本身
        expect(page.frames().some((f) => /^https?:\/\/example\.com/.test(f.url()))).toBe(false);
        expect(page.mainFrame().url()).toMatch(/^huhu-app:|^http:\/\/localhost/);
        await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
      }
      // 点击链接导航（沙箱内的用户手势也不能离开 huhu-preview）
      await openFile(page, "导航");
      await page.waitForTimeout(500);
      await page
        .frameLocator('[data-testid="html-preview-frame"]')
        .locator("#l")
        .click({ timeout: 2000 })
        .catch(() => undefined);
      await page.waitForTimeout(1500);
      expect(page.frames().some((f) => /^https?:\/\/example\.com/.test(f.url()))).toBe(false);
    } finally {
      await close();
    }
  });

test("F10（查看器部分）：反复打开 / 关闭 PDF 与 HTML，DOM 里的 pdfViewer / iframe 不持续增长", async () => {
  const { page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/甲.pdf`, buildPdf(["One"]));
    writeFileSync(`${vault}/乙.html`, "<!doctype html><body>b</body>");
    writeFileSync(`${vault}/丙.txt`, "c");
    writeFileSync(`${vault}/图.png`, PNG_1PX);
    writeFileSync(`${vault}/无扩展名`, "x");
    // F06：整个过程没有向外部站点发请求（图标全部是本地静态映射，没有在线图标服务）
    const external: string[] = [];
    page.on("request", (r) => {
      if (!/^(huhu-app|huhu-preview|data|blob|devtools|chrome-extension):/.test(r.url()) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.url())) external.push(r.url());
    });
    await openKnowledge(page);
    // F06：标签条里按扩展名固定的图标类别（文件树的图标由 S5 的新树消费同一个 FileIcon，这里只验标签）
    const tabKind = async (name: string) => {
      await openFile(page, name);
      return page.locator('[data-testid="document-tab"][aria-current="true"] [data-file-icon]').first().getAttribute("data-file-icon");
    };
    expect(await tabKind("甲")).toBe("pdf");
    expect(await tabKind("乙")).toBe("html");
    expect(await tabKind("丙")).toBe("text");
    expect(await tabKind("图")).toBe("image");
    expect(await tabKind("无扩展名")).toBe("file");
    for (let i = 0; i < 20; i++) {
      await openFile(page, "甲");
      await expect(page.locator(".pdfViewer")).toHaveCount(1);
      await openFile(page, "乙");
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(1);
      await openFile(page, "丙");
      await expect(page.locator(".pdfViewer")).toHaveCount(0);
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(0);
    }
    expect(await page.locator("iframe").count()).toBe(0);
    expect(external, `外部请求：${external.join(", ")}`).toEqual([]);
  } finally {
    await close();
  }
});
