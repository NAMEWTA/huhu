/* oxlint-disable typescript/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeRows, treeSettled } from "../helpers/tree.js";

// 知识库 OK 对等：用户完整路径（spec §1 / plan §5）。真实 Electron，一条连续路径，每一步断言磁盘或界面的真实结果：
// 打开全部真实文件 → 隐藏目录后仍能 `@` → OK 编辑器里输入 / `/` 插块 / 编辑属性 / 评论 → 保存重开一致、无编辑不写盘
// → 编辑 JSON / TXT、查看 PDF、HTML 隔离预览 → 档案真实标签与侧栏切换 → 切回文件继续编辑。

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

/** 手写一个最小合法 PDF（含正确 xref）。 */
function buildPdf(pages: string[]): Buffer {
  const objs: Buffer[] = [];
  const add = (body: string) => (objs.push(Buffer.from(body, "latin1")), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const text of pages) {
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`));
  }
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`, "latin1");
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

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();
const commentsDir = (vault: string) => path.join(vault, "Comments");
const commentFiles = (vault: string) => (existsSync(commentsDir(vault)) ? readdirSync(commentsDir(vault)) : []);

async function selectText(page: Page, text: string): Promise<void> {
  await prose(page).evaluate((root, needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = (n.textContent ?? "").indexOf(needle as string);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + (needle as string).length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error(`没找到文字：${needle}`);
  }, text);
}

test("用户完整路径：全部真实文件 → 隐藏后仍可 @ → 编辑 / 插块 / 属性 / 评论 → 保存重开 → JSON·TXT·PDF·HTML → 档案标签 → 切回继续编辑", async () => {
  test.setTimeout(240_000);
  const { page, vault, close } = await openApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    // ── 样本：真实文件系统里的各种文件 ──
    mkdirSync(path.join(vault, "资料"));
    writeFileSync(path.join(vault, "资料", "机密笔记.md"), "# 机密笔记\n\n仅供引用。\n");
    writeFileSync(path.join(vault, "日志.md"), "---\ntitle: 旅程\nzip: 007\n---\n\n# 日志\n\n第一段正文，用于批注与选择。\n");
    writeFileSync(path.join(vault, "冷笔记.md"), "# 冷笔记\n\n不会被编辑。\n");
    writeFileSync(path.join(vault, "说明.txt"), "第一行\n");
    writeFileSync(path.join(vault, "数据.json"), '{"a":1}\n');
    writeFileSync(path.join(vault, "手册.pdf"), buildPdf(["Alpha Page", "Bravo Page"]));
    writeFileSync(
      path.join(vault, "页面.html"),
      `<!doctype html><html><head><meta charset="utf-8"></head><body><h1 id="h">你好页面</h1><div id="js">no-js</div><script>document.getElementById("js").textContent="js-ran"</script></body></html>`,
    );

    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    const call = await caller(page);
    await call("archives.types.save", { name: "通讯录", fields: [{ name: "电话", type: "text" }] });
    await call("archives.create", { type: "通讯录", name: "张三", fields: { 电话: "123" } });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await expect(page.getByTestId("notes-module")).toBeVisible();
    await treeSettled(page);

    // ── 1 全部真实文件可见（含 json / txt / pdf / html / 目录），不止 Markdown ──
    for (const name of ["日志", "冷笔记", "说明", "数据", "手册", "页面"]) await expect(treeItem(page, name)).toHaveCount(1);
    await expect(treeFolder(page, "资料")).toHaveCount(1);

    // ── 2 隐藏目录 → 树里消失、写入偏好文件；但 `@` 仍能引用其中的文件 ──
    await treeMenu(page, treeFolder(page, "资料"), /隐藏/);
    await expect(treeFolder(page, "资料")).toHaveCount(0);
    await expect.poll(() => (existsSync(path.join(vault, ".huhu/notes/hidden-paths.json")) ? readFileSync(path.join(vault, ".huhu/notes/hidden-paths.json"), "utf8") : "")).toContain("资料");
    expect(existsSync(path.join(vault, "资料", "机密笔记.md"))).toBe(true); // 隐藏只是视图：磁盘不动
    await treeItem(page, "冷笔记").click(); // 先看冷笔记，记 mtime 以验证“只读不写盘”
    await expect(prose(page)).toContainText("不会被编辑", { timeout: 30_000 });
    const coldMtime = statSync(path.join(vault, "冷笔记.md")).mtimeMs;
    const coldBytes = readFileSync(path.join(vault, "冷笔记.md"), "utf8");

    await treeItem(page, "日志").click();
    await expect(prose(page)).toContainText("第一段正文", { timeout: 30_000 });

    // ── 3 OK 编辑器：`@` 引用被隐藏目录里的文件（磁盘上落成 wiki 链接） ──
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("参见 @机密");
    const refMenu = page.getByTestId("editor-ref-menu");
    await expect(refMenu).toContainText("资料/机密笔记.md", { timeout: 15_000 });
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 15_000 });
    await expect.poll(() => readFileSync(path.join(vault, "日志.md"), "utf8")).toContain("[[资料/机密笔记.md]]");

    // ── 4 `/` 插块 ──
    await page.keyboard.press("Enter");
    await page.keyboard.type("/无序");
    await expect(page.locator('[role="listbox"]').first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("条目甲");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 15_000 });
    await expect.poll(() => readFileSync(path.join(vault, "日志.md"), "utf8")).toMatch(/[-*] 条目甲/);

    // ── 5 属性：改 title，其它键（含前导零 zip: 007）与正文原样保留 ──
    const panel = page.getByTestId("editor-properties");
    await expect(panel).toContainText("title");
    const title = panel.locator("textarea, input[type=text], input:not([type])").first();
    await title.click();
    await title.fill("旅程乙");
    await title.blur();
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 15_000 });
    await expect.poll(() => readFileSync(path.join(vault, "日志.md"), "utf8")).toEqual(expect.stringContaining("title: 旅程乙"));
    const afterProp = readFileSync(path.join(vault, "日志.md"), "utf8");
    expect(afterProp).toContain("zip: 007");
    expect(afterProp).toContain("[[资料/机密笔记.md]]");
    expect(afterProp).toContain("第一段正文");

    // ── 6 评论：选区批注落到真实存储 ──
    await selectText(page, "第一段正文");
    await page.getByRole("button", { name: "添加批注" }).first().click();
    const composer = page.getByTestId("comment-composer");
    await expect(composer).toBeVisible();
    await composer.getByRole("textbox").click();
    await page.keyboard.type("旅程批注");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => commentFiles(vault).length).toBe(1);
    expect(readFileSync(path.join(commentsDir(vault), commentFiles(vault)[0]!), "utf8")).toContain("第一段正文");

    // ── 7 保存重开一致；无编辑不写盘 ──
    const saved = readFileSync(path.join(vault, "日志.md"), "utf8");
    await treeItem(page, "冷笔记").click();
    await expect(prose(page)).toContainText("不会被编辑", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    expect(readFileSync(path.join(vault, "冷笔记.md"), "utf8")).toBe(coldBytes);
    expect(statSync(path.join(vault, "冷笔记.md")).mtimeMs).toBe(coldMtime); // 打开—停留—离开，一次都没写
    await treeItem(page, "日志").click();
    await expect(prose(page)).toContainText("条目甲", { timeout: 30_000 });
    await expect(prose(page)).toContainText("资料/机密笔记.md");
    expect(readFileSync(path.join(vault, "日志.md"), "utf8")).toBe(saved); // 重开不改写

    // ── 8 JSON / TXT 可编辑 ──
    await treeItem(page, "说明").click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("第二行");
    await expect.poll(() => readFileSync(path.join(vault, "说明.txt"), "utf8")).toBe("第一行\n第二行");
    await treeItem(page, "数据").click();
    await expect(page.getByTestId("file-diagnostic")).toContainText("JSON 语法正确");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.insertText(',"b":2');
    await expect.poll(() => readFileSync(path.join(vault, "数据.json"), "utf8")).toBe('{"a":1,"b":2}\n'); // 保存不格式化

    // ── 9 PDF 查看；HTML 隔离预览 ──
    await treeItem(page, "手册").click();
    await expect(page.getByTestId("pdf-view")).toBeVisible();
    await expect(page.locator(".pdfViewer .page")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator(".pdfViewer .textLayer").first()).toContainText("Alpha Page", { timeout: 30_000 });
    await treeItem(page, "页面").click();
    const handle = await page.getByTestId("html-preview-frame").elementHandle();
    const frame = await handle!.contentFrame();
    expect(frame).not.toBeNull();
    await expect(frame!.locator("#h")).toHaveText("你好页面");
    await expect(frame!.locator("#js")).toHaveText("js-ran"); // 脚本在沙箱里运行
    expect(await page.getByTestId("html-preview-frame").getAttribute("sandbox")).toBe("allow-scripts"); // 不含 allow-same-origin

    // ── 10 档案：真实标签 + 侧栏切换 ──
    await page.getByTestId("notes-open-archives").click();
    await expect(page.getByTestId("archives-home")).toBeVisible();
    await expect(page.locator('[data-tab-kind="archives-home"]')).toHaveCount(1);
    await expect(page.getByTestId("archives-sidebar")).toBeVisible();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    await expect(page.locator('[data-tab-kind="archive-record"]')).toHaveCount(1);
    await expect(page.getByTestId("archive-view")).toContainText("张三");
    const phone = page.getByTestId("archive-fields").getByLabel("电话");
    await phone.fill("456");
    await phone.blur();
    await expect.poll(() => readFileSync(path.join(vault, "Archives", "通讯录", "张三", "index.md"), "utf8")).toContain("456");

    // ── 11 切回文件继续编辑：侧栏回到文件树，内容仍在，新输入落盘 ──
    await page.getByTestId("document-tab").filter({ hasText: "日志" }).click();
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(prose(page)).toContainText("条目甲", { timeout: 30_000 });
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("切回后继续写");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 15_000 });
    const finalDisk = readFileSync(path.join(vault, "日志.md"), "utf8");
    expect(finalDisk).toContain("切回后继续写");
    expect(finalDisk).toContain("title: 旅程乙");
    expect(finalDisk).toContain("zip: 007");
    expect(treeRows(page)).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
