import { expect, test, type Frame, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { buildPdf } from "../helpers/pdf.js";
import { treeItem } from "../helpers/tree.js";

/**
 * S7 查看器验收（F01–F06、F10）：每条都用真实桌面应用（Electron）。
 * PDF / HTML 的样本在用例里程序化生成；恶意页面的 F05 安全用例集在隔离 iframe 里真实运行并读回结果。
 */

/**
 * F05 要求 dev 与 prod 各跑一遍。本基线上 dev（electron-vite 渲染进程开发服务器，http://localhost:*）无法端到端运行：
 * ① `packages/contracts/src/ids.ts` 的 `node:crypto` 被 Vite 外部化，工作台白屏；② Engine 的 CORS 只放行 `huhu-app://workbench`（packages/kernel/src/server/ingress.ts 的 RENDERER_ORIGIN）。
 * 两者与 S7 无关（见 evidence/s7/report.md）。这里只跑 prod；dev 来源只影响预览响应头里的 `frame-ancestors`，由 apps/desktop/test/preview-protocol.test.ts 单测覆盖。
 */
const MODES = ["prod"] as const;

/** 每个用例用独立的用户数据目录：Electron 的单实例锁按 userData 区分，别的会话 / 并行任务正在运行的应用不会让这里的启动立刻退出。 */
const launch = (extra: Record<string, string> = {}, prepareVault?: (vault: string) => void) => openApp({ XDG_CONFIG_HOME: mkdtempSync(path.join(tmpdir(), "huhu-xdg-")), ...extra }, prepareVault);

// VaultWatcher 原生监听不可用时每 30 秒对账，断言同时覆盖真实外改的两条交付路径。
const PDF_EXTERNAL_CHANGE_TIMEOUT = 40_000;

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

    for (const [name, ext] of [
      ["说明", "txt"],
      ["数据", "json"],
    ]) {
      await page.getByRole("button", { name: `关闭 ${name}.${ext}`, exact: true }).click();
      await openFile(page, name!);
      const lines = () => page.locator(".cm-content .cm-line").allTextContents();
      await expect.poll(async () => (await lines()).join("\n")).toBe(readFileSync(`${vault}/${name}.${ext}`, "utf8"));
      if (ext === "json") {
        await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法正确");
        await expect(page.locator(".cm-content .cm-line span").filter({ hasText: '"a"' }).first()).toBeVisible();
      }
    }

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
    const file = `${vault}/冲突.txt`;
    writeFileSync(file, "原始\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    await autosave.click();
    await expect(autosave).not.toBeChecked();
    await openKnowledge(page);
    await openFile(page, "冲突");
    const save = page.getByTestId("note-save");
    const source = page.locator(".cm-content");
    const state = page.getByTestId("save-state");
    await typeAtEnd(page, "我的");
    writeFileSync(file, "外部\n");
    await expect(state).toHaveText("有冲突", { timeout: 15_000 });
    await expect(source).toContainText("我的");
    expect(readFileSync(file, "utf8")).toBe("外部\n");

    await page.getByTestId("note-keep-mine").click();
    await expect(state).toHaveText("未保存");
    expect(readFileSync(file, "utf8")).toBe("外部\n");
    await save.click();
    await expect(state).toHaveText("已保存");
    expect(readFileSync(file, "utf8")).toBe("原始\n我的");

    await typeAtEnd(page, "待放弃");
    writeFileSync(file, "磁盘更新\n");
    await expect(state).toHaveText("有冲突", { timeout: 15_000 });
    const reload = page.getByRole("button", { name: "载入最新版本", exact: true });
    await reload.click();
    await expect(source).toContainText("待放弃");
    expect(readFileSync(file, "utf8")).toBe("磁盘更新\n");
    await reload.click();
    await expect(state).toHaveText("已保存");
    await expect(source).toContainText("磁盘更新");
    await expect(source).not.toContainText("待放弃");
    expect(readFileSync(file, "utf8")).toBe("磁盘更新\n");
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
    // 查找快捷键归属当前聚焦的 PDF。
    await page.getByTestId("pdf-view").focus();
    await page.keyboard.press("ControlOrMeta+f");
    await expect(page.getByTestId("pdf-find-input")).toBeFocused();
    await page.getByTestId("pdf-find-input").fill("Bravo");
    await expect(page.getByTestId("pdf-find-count")).toContainText("1 / 1", { timeout: 15_000 });
    await page.getByTestId("pdf-find-input").press("Escape");
    // 在第二页用实际指针拖选文字，再记录缩放与滚动状态。
    const secondPage = page.locator('.pdfViewer .page[data-page-number="2"]');
    const bravo = secondPage
      .locator(".textLayer span")
      .filter({ hasText: /^Bravo Page$/ })
      .first();
    await bravo.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "放大" }).click();
    await secondPage.evaluate((el) => {
      const container = el.closest<HTMLElement>(".notes-pdf-container")!;
      container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top + 24;
    });
    await expect(bravo).toBeInViewport();
    const box = (await bravo.boundingBox())!;
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Bravo Page");
    const container = page.locator(".notes-pdf-container");
    const position = () =>
      container.evaluate((el) => ({
        top: el.scrollTop,
        page: [...el.querySelectorAll<HTMLElement>(".pdfViewer .page")].find((item) => item.getBoundingClientRect().bottom > el.getBoundingClientRect().top)?.dataset.pageNumber,
      }));
    const before = await position();
    expect(before.page).toBe("2");
    expect(before.top).toBeGreaterThan(0);
    const zoom = await page.getByTestId("pdf-zoom").textContent();

    // > 10 MiB：分段读取（不经 readBinary / readFile）
    calls.length = 0;
    await openFile(page, "大");
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Huge Sample", { timeout: 60_000 });
    expect(calls.filter((c) => c.startsWith("vault.readRange:")).length).toBeGreaterThan(1);
    expect(lengths.length).toBeGreaterThan(1);
    expect(lengths.every((length) => length > 0 && length <= 4 * 1024 * 1024)).toBe(true);
    expect(calls.some((c) => c.startsWith("vault.readBinary:") || c.startsWith("notes.read:"))).toBe(false);

    await openFile(page, "手册");
    await expect(bravo).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pdf-zoom")).toHaveText(zoom!);
    await expect.poll(async () => (await position()).page).toBe(before.page);
    await expect.poll(async () => Math.abs((await position()).top - before.top)).toBeLessThanOrEqual(3);

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

test("F03：PDF 被外部修改——出现“已被外部修改”提示或直接显示新内容，不继续展示旧页面", async () => {
  test.setTimeout(90_000);
  const { page, vault, close } = await launch({}, (vault) => writeFileSync(`${vault}/手册.pdf`, buildPdf(["Alpha Page", "Bravo Page", "Charlie Page"])));
  try {
    await openKnowledge(page);
    await openFile(page, "手册");
    await expect(page.locator(".pdfViewer .page")).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Alpha Page");
    const banner = page.getByTestId("pdf-external-change");
    await expect(banner).toHaveCount(0);
    writeFileSync(`${vault}/手册.pdf`, buildPdf(["Delta Page"]));
    // 文件元信息更新可能直接触发新文档渲染，也可能出现横幅供用户重新载入。
    const fresh = page.locator(".pdfViewer .textLayer").first().filter({ hasText: "Delta Page" });
    await expect(banner.or(fresh).first()).toBeVisible({ timeout: PDF_EXTERNAL_CHANGE_TIMEOUT });
    if (await banner.isVisible()) await page.getByTestId("pdf-reload").click();
    await expect(page.locator(".pdfViewer .page")).toHaveCount(1);
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
      const file = `${vault}/页面.html`;
      const original = readFileSync(file, "utf8");
      const updated = original.replace("你好页面", "已更新页面");
      const source = page.locator(".cm-content");
      let failSave = true;
      await page.route("**/api/v1/call", (route) => {
        const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
        if (!failSave || request.capability !== "notes.save" || request.input?.path !== "页面.html") return route.continue();
        return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "测试：文件写入失败" } } });
      });
      await source.click();
      await source.press("ControlOrMeta+a");
      await page.keyboard.insertText(updated);
      await page.getByTestId("html-mode").getByRole("tab", { name: "预览" }).click();
      await expect(page.getByText("测试：文件写入失败", { exact: false })).toBeVisible();
      await expect(source).toContainText("已更新页面");
      await expect(page.getByTestId("html-preview-frame")).toHaveCount(0);
      expect(readFileSync(file, "utf8")).toBe(original);

      failSave = false;
      await page.getByTestId("html-mode").getByRole("tab", { name: "预览" }).click();
      await expect(page.frameLocator('[data-testid="html-preview-frame"]').locator("#h")).toHaveText("已更新页面", { timeout: 15_000 });
      expect(readFileSync(file, "utf8")).toBe(updated);
    } finally {
      await close();
    }
  });

test("F05：HTML 预览无 Engine 凭据，预览来源的下载由主进程取消", async () => {
  const { app, page, vault, close } = await launch();
  try {
    writeFileSync(path.join(vault, "边界.html"), "<!doctype html><h1>预览边界</h1>");
    await openKnowledge(page);
    await openFile(page, "边界");
    await expect(page.frameLocator('[data-testid="html-preview-frame"]').getByRole("heading")).toHaveText("预览边界");
    const frame = await previewFrame(page);
    const visible = await frame.evaluate(() => {
      const ownBridge = typeof Reflect.get(window, "huhuHost") !== "undefined";
      let canReadParent = false;
      try {
        canReadParent = Reflect.has(parent, "huhuHost");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      }
      return { ownBridge, canReadParent, url: location.href, referrer: document.referrer };
    });
    expect(visible.ownBridge).toBe(false);
    expect(visible.canReadParent).toBe(false);
    // The token remains in the trusted workbench and stays outside both URLs.
    const trusted = await page.evaluate(async ({ url, referrer }) => {
      const host = Reflect.get(window, "huhuHost") as { engine(): Promise<{ baseUrl: string; token: string }> };
      const { token, baseUrl } = await host.engine();
      return { present: Boolean(token && baseUrl), exposed: [url, referrer].some((value) => value.includes(token) || value.includes(baseUrl)) };
    }, visible);
    expect(trusted).toEqual({ present: true, exposed: false });

    const canceled = await app.evaluate(({ BrowserWindow }, url) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      return new Promise<boolean>((resolve) => {
        // Observe the actual Session event after the production handler runs.
        contents.session.once("will-download", (event, item) => resolve(item.getURL() === url && event.defaultPrevented));
        contents.downloadURL(url);
      });
    }, visible.url);
    expect(canceled).toBe(true);
    expect(readFileSync(path.join(vault, "边界.html"), "utf8")).toBe("<!doctype html><h1>预览边界</h1>");
  } finally {
    await close();
  }
});

type GrantGate = {
  release(): void;
  heldNonce?: string;
  revoked?: boolean;
};
type TestPreviewIpc = {
  _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
  grantGate?: GrantGate;
};

test("F04 / F10：关闭旧 HTML 后迟到签发被撤销，新页的 iframe 与内容保持", async () => {
  const { app, page, vault, close } = await launch();
  try {
    writeFileSync(`${vault}/慢页面.html`, "<h1>旧预览</h1>");
    writeFileSync(`${vault}/快页面.html`, "<h1>当前预览</h1>");
    await openKnowledge(page);
    await app.evaluate(({ ipcMain }) => {
      const ipc = ipcMain as unknown as TestPreviewIpc;
      const grant = ipc._invokeHandlers.get("huhu:previewGrant")!;
      const revoke = ipc._invokeHandlers.get("huhu:previewRevoke")!;
      const paused = Promise.withResolvers<void>();
      const gate: GrantGate = { release: paused.resolve };
      ipc.grantGate = gate;
      ipc._invokeHandlers.set("huhu:previewGrant", async (...args) => {
        const result = grant(...args) as { ok: boolean; nonce?: string };
        if (args[1] === "慢页面.html" && result.ok && result.nonce) {
          gate.heldNonce = result.nonce;
          await paused.promise;
        }
        return result;
      });
      ipc._invokeHandlers.set("huhu:previewRevoke", (...args) => {
        const result = revoke(...args);
        if (gate.heldNonce && args[1] === gate.heldNonce) gate.revoked = true;
        return result;
      });
    });
    await openFile(page, "慢页面.html");
    await expect.poll(() => app.evaluate(({ ipcMain }) => (ipcMain as unknown as TestPreviewIpc).grantGate?.heldNonce)).toBeTruthy();
    await page.getByRole("button", { name: /关闭 慢页面/ }).click();
    await openFile(page, "快页面.html");
    const iframe = page.getByTestId("html-preview-frame");
    await expect(iframe.contentFrame().locator("h1")).toHaveText("当前预览");
    const src = await iframe.getAttribute("src");
    await app.evaluate(({ ipcMain }) => (ipcMain as unknown as TestPreviewIpc).grantGate?.release());
    await expect.poll(() => app.evaluate(({ ipcMain }) => (ipcMain as unknown as TestPreviewIpc).grantGate?.revoked)).toBe(true);
    await expect(iframe).toHaveAttribute("src", src!);
    await expect(iframe.contentFrame().locator("h1")).toHaveText("当前预览");
    await expect(page.getByRole("button", { name: /关闭 慢页面/ })).toHaveCount(0);
  } finally {
    await app.evaluate(({ ipcMain }) => (ipcMain as unknown as TestPreviewIpc).grantGate?.release()).catch(() => undefined);
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

test("F06：树、标签、引用、搜索与详情使用同一组本地图形", async () => {
  const { page, vault, close } = await launch();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(request.url())) requests.push(request.url());
  });
  try {
    const fixtures = [
      { name: "图标手册.pdf", kind: "pdf", data: buildPdf(["icon fixture"]) },
      { name: "图标记录.md", kind: "markdown", data: "# 图标记录" },
      { name: "图标压缩.zip", kind: "archive", data: Buffer.from([0x50, 0x4b, 3, 4]) },
      { name: "图标未知.other", kind: "file", data: "unknown" },
    ];
    for (const { name, data } of fixtures) writeFileSync(path.join(vault, name), data);
    mkdirSync(path.join(vault, "图标目录"));
    writeFileSync(path.join(vault, "图标目录", "成员.txt"), "让目录进入引用索引");
    await openKnowledge(page);
    const tree = page.getByTestId("notes-resource-tree");
    for (const { name, kind } of fixtures) {
      const row = tree.locator(`[data-item-path="${name}"]`);
      await expect(row.locator('[data-item-section="icon"] use')).toHaveAttribute("href", `#huhu-tree-${kind}`);
      await row.click();
      await expect(page.locator('[aria-current="true"][data-testid="document-tab"] [data-file-icon]')).toHaveAttribute("data-file-icon", kind);
      if (kind === "markdown") {
        await page.getByRole("button", { name: "文档详情", exact: true }).click();
        const inspector = page.getByTestId("note-inspector");
        await expect(inspector.locator('[data-file-icon="markdown"]').first()).toBeVisible();
        await inspector.getByRole("button", { name: "关闭文档详情" }).click();
      } else {
        await expect(page.getByTestId("file-card").locator(`[data-file-icon="${kind}"]`).first()).toBeVisible();
      }
      const activeTab = page.locator('[aria-current="true"][data-testid="document-tab"]');
      await activeTab.focus();
      await page.keyboard.press("ControlOrMeta+k");
      const palette = page.getByTestId("command-palette");
      await palette.getByRole("combobox").fill(name.split(".")[0]!);
      const result = palette.getByTestId("palette-item").filter({ hasText: name });
      await expect(result.locator("[data-file-icon]")).toHaveAttribute("data-file-icon", kind);
      await page.keyboard.press("Escape");
    }
    const folder = tree.locator('[data-item-path="图标目录/"]');
    await expect(folder.locator("[data-huhu-folder-icon] use")).toHaveAttribute("href", "#huhu-tree-folder");
    await treeItem(page, "图标记录.md").click();
    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("@图标");
    const options = page.getByTestId("editor-ref-menu").getByRole("option");
    for (const { name, kind } of fixtures) {
      await expect(options.filter({ hasText: name }).locator("[data-file-icon]")).toHaveAttribute("data-file-icon", kind);
    }
    const folderOption = page.getByTestId("editor-ref-menu").getByRole("option", { name: "图标目录/ 文件夹", exact: true });
    await expect(folderOption.locator("[data-file-icon]")).toHaveAttribute("data-file-icon", "folder");
    expect(requests).toEqual([]);
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

test("OP-D09 PDF 查找快捷键归属当前知识库分栏，焦点和文件重开可用", async () => {
  test.setTimeout(90_000);
  const { page, vault, close } = await launch({}, (vault) => {
    writeFileSync(path.join(vault, "查找说明.pdf"), buildPdf(["Original PDF Match"]));
    writeFileSync(path.join(vault, "另一页.md"), "外部编辑位置\n");
  });
  try {
    const file = path.join(vault, "查找说明.pdf");
    await openKnowledge(page);
    await openFile(page, "查找说明");
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Original PDF Match", { timeout: 30_000 });
    const tab = page.getByTestId("document-tab").filter({ hasText: "查找说明" });
    await tab.focus();
    await page.keyboard.press("ControlOrMeta+f");
    const input = page.getByTestId("pdf-find-input");
    await expect(input).toBeFocused();
    await input.fill("Original");
    await expect(page.getByTestId("pdf-find-count")).toHaveText("1 / 1");
    await input.press("Escape");
    await expect(page.getByTestId("pdf-view")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+f");
    await expect(input).toBeFocused();
    await input.press("Escape");
    await page.getByRole("button", { name: "在 PDF 中查找", exact: true }).click();
    await expect(input).toBeFocused();

    await openFile(page, "另一页");
    const rich = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await rich.getByText("外部编辑位置").click();
    await page.keyboard.press("ControlOrMeta+f");
    await expect(input).toHaveCount(0);
    await page.keyboard.press("Escape");

    writeFileSync(file, buildPdf(["Replacement PDF Match"]));
    await openFile(page, "查找说明");
    const banner = page.getByTestId("pdf-external-change");
    const text = page.locator(".pdfViewer .textLayer").first().filter({ hasText: "Replacement PDF Match" });
    await expect(banner.or(text).first()).toBeVisible({ timeout: PDF_EXTERNAL_CHANGE_TIMEOUT });
    if (await banner.isVisible()) await page.getByTestId("pdf-reload").click();
    await expect(text).toBeVisible({ timeout: 30_000 });
    await tab.focus();
    await page.keyboard.press("ControlOrMeta+f");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await input.fill("Replacement");
    await expect(page.getByTestId("pdf-find-count")).toHaveText("1 / 1");
  } finally {
    await close();
  }
});

test("OP-D08 原生预览链接动作只在确认后转交 HTTP(S) 给宿主", async () => {
  const { app, page, vault, close } = await launch();
  const url = "https://example.com/preview-link";
  try {
    writeFileSync(path.join(vault, "链接预览.html"), `<a href="${url}">网站</a>`);
    const state = () => app.evaluate(() => (globalThis as typeof globalThis & { linkActions: { menus: number; confirms: string[]; opens: string[] } }).linkActions);
    await app.evaluate(({ Menu, dialog, shell }) => {
      const actions = { menus: 0, confirms: [] as string[], opens: [] as string[] };
      (globalThis as typeof globalThis & { linkActions: typeof actions }).linkActions = actions;
      Menu.prototype.popup = function () {
        actions.menus++;
        this.items[0]?.click(undefined as never, undefined as never, undefined as never);
      };
      Object.assign(dialog, {
        showMessageBox: async (_window: unknown, options: { detail: string }) => {
          actions.confirms.push(options.detail);
          return { response: actions.confirms.length > 1 ? 1 : 0, checkboxChecked: false };
        },
      });
      Object.assign(shell, { openExternal: async (link: string) => void actions.opens.push(link) });
    });
    await openKnowledge(page);
    await openFile(page, "链接预览");
    const frame = await previewFrame(page);
    const link = frame.getByRole("link", { name: "网站" });
    await link.click({ button: "right" });
    await expect.poll(state).toEqual({ menus: 1, confirms: [url], opens: [] });
    await link.click({ button: "right" });
    await expect.poll(state).toEqual({ menus: 2, confirms: [url, url], opens: [url] });
    expect(frame.url()).toMatch(/^huhu-preview:/);
  } finally {
    await close();
  }
});

test("G04 ORCA：PDF 查找计数和活动高亮随导航及查询更新，关闭时清除高亮", async () => {
  const { page, close } = await launch({}, (vault) => writeFileSync(path.join(vault, "查找计数.pdf"), buildPdf(["Alpha needle\nBravo needle\nCharlie needle", "Delta Page", "Echo Page"])));
  try {
    await openKnowledge(page);
    await openFile(page, "查找计数");
    await expect(page.locator(".pdfViewer .page")).toHaveCount(3);
    const find = page.getByRole("button", { name: "在 PDF 中查找", exact: true });
    await find.click();
    const input = page.getByTestId("pdf-find-input");
    const count = page.getByTestId("pdf-find-count");
    const selected = page.locator(".pdfViewer .highlight.selected");
    const previous = page.getByRole("search").getByRole("button", { name: "上一个", exact: true });
    const next = page.getByRole("search").getByRole("button", { name: "下一个", exact: true });
    const match = async (label: string, activeText: string) => {
      await expect(count).toHaveText(label);
      await expect(selected).toHaveCount(1);
      await expect(selected.locator("..")).toHaveText(activeText);
    };
    await input.fill("needle");
    await match("1 / 3", "Alpha needle");
    await next.click();
    await match("2 / 3", "Bravo needle");
    await input.press("Enter");
    await match("3 / 3", "Charlie needle");
    await input.press("Shift+Enter");
    await match("2 / 3", "Bravo needle");
    await previous.click();
    await match("1 / 3", "Alpha needle");
    await previous.click();
    await match("3 / 3", "Charlie needle");
    await input.press("Enter");
    await match("1 / 3", "Alpha needle");
    await input.fill("Bravo");
    await match("1 / 1", "Bravo needle");
    await input.fill("absentword");
    await expect(selected).toHaveCount(0);
    await expect(count).toHaveText("无匹配");
    await input.fill("needle");
    await match("1 / 3", "Alpha needle");
    await input.fill("Bravo");
    await input.fill("absentword");
    await input.fill("needle");
    await match("1 / 3", "Alpha needle");
    await next.click();
    await match("2 / 3", "Bravo needle");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(page.locator(".pdfViewer .highlight")).toHaveCount(0);
    await find.click();
    await expect(input).toHaveValue("needle");
    await match("1 / 3", "Alpha needle");
    await input.press("Enter");
    await match("2 / 3", "Bravo needle");
  } finally {
    await close();
  }
});

test("G04 ORCA：重新打开 PDF 查找保留查询并读取缓存，清空后隐藏计数", async () => {
  const { page, close } = await launch({}, (vault) => writeFileSync(path.join(vault, "查找缓存.pdf"), buildPdf(["Cached match", "Cached match again"])));
  try {
    await openKnowledge(page);
    await openFile(page, "查找缓存");
    await expect(page.locator(".pdfViewer .page")).toHaveCount(2);
    const find = page.getByRole("button", { name: "在 PDF 中查找", exact: true });
    const input = page.getByTestId("pdf-find-input");
    const count = page.getByTestId("pdf-find-count");
    await find.click();
    await input.fill("Cached");
    await expect(count).toHaveText("1 / 2");
    await input.press("Escape");
    await find.click();
    await expect(input).toHaveValue("Cached");
    await expect(count).toHaveText("1 / 2");
    await input.fill("pending");
    await input.clear();
    await expect(count).toHaveCount(0);
    await expect(page.locator(".pdfViewer .highlight")).toHaveCount(0);
    await input.fill("again");
    await expect(count).toHaveText("1 / 1");
  } finally {
    await close();
  }
});

test("G04 ORCA：重复加载坏 PDF 后恢复，错误时不会保留旧页", async () => {
  test.setTimeout(150_000);
  const { page, vault, close } = await launch({}, (vault) => writeFileSync(path.join(vault, "恢复预览.pdf"), buildPdf(["Original PDF content"])));
  try {
    const file = path.join(vault, "恢复预览.pdf");
    await openKnowledge(page);
    await openFile(page, "恢复预览");
    const view = page.getByTestId("pdf-view");
    const pages = view.locator(".pdfViewer .page");
    const text = view.locator(".pdfViewer .textLayer").first();
    await expect(text).toContainText("Original PDF content");
    const reload = page.getByTestId("pdf-reload");
    for (const corrupt of ["bad PDF first attempt", "bad PDF second attempt"]) {
      writeFileSync(file, corrupt);
      await reload.click({ timeout: PDF_EXTERNAL_CHANGE_TIMEOUT });
      await expect(view.getByRole("alert")).toBeVisible();
      await expect(pages).toHaveCount(0);
    }
    writeFileSync(file, buildPdf(["Recovered PDF content"]));
    await reload.click({ timeout: PDF_EXTERNAL_CHANGE_TIMEOUT });
    await expect(text).toContainText("Recovered PDF content");
    await expect(text).not.toContainText("Original PDF content");
    await expect(view.getByRole("alert")).toHaveCount(0);
  } finally {
    await close();
  }
});
