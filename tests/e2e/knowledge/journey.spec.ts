/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp, rmTree, root, USER_DATA_ARG } from "../helpers/launch.js";
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
    for (const dir of ["Tasks", "Comments", "常规/Tasks", ".obsidian", "空目录"]) mkdirSync(path.join(vault, dir), { recursive: true });
    writeFileSync(path.join(vault, "常规/Tasks/嵌套.md"), "嵌套任务");
    writeFileSync(path.join(vault, "未知.weird"), "未知扩展名");
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

    for (const dir of ["Tasks", "Comments", ".obsidian", "空目录"]) await expect(treeFolder(page, dir)).toBeVisible();
    await expect(treeItem(page, "未知")).toBeVisible();
    await treeFolder(page, "常规").click();
    await page.locator('[data-testid="notes-resource-tree"] [data-item-path="常规/Tasks/"]').click();
    await expect(treeItem(page, "嵌套")).toBeVisible();
    await treeFolder(page, "常规").click();

    // ── 2 隐藏目录 → 树里消失、写入偏好文件；但 `@` 仍能引用其中的文件 ──
    await treeMenu(page, treeFolder(page, "资料"), /隐藏/);
    await expect(treeFolder(page, "资料")).toHaveCount(0);
    await expect.poll(() => (existsSync(path.join(vault, ".huhu/notes/ui-preferences.json")) ? readFileSync(path.join(vault, ".huhu/notes/ui-preferences.json"), "utf8") : "")).toContain("资料");
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
    // 批注落盘会刷新文件树。两个笔记已经打开，直接切换标签。
    const coldTab = page.getByTestId("document-tab").and(page.locator('[title="冷笔记.md"]'));
    const journalTab = page.getByTestId("document-tab").and(page.locator('[title="日志.md"]'));
    await coldTab.click();
    await expect(prose(page)).toContainText("不会被编辑", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    expect(readFileSync(path.join(vault, "冷笔记.md"), "utf8")).toBe(coldBytes);
    expect(statSync(path.join(vault, "冷笔记.md")).mtimeMs).toBe(coldMtime); // 打开—停留—离开，一次都没写
    await journalTab.click();
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
    await journalTab.click();
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(prose(page)).toContainText("条目甲", { timeout: 30_000 });
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    const tail = "切回后继续写";
    await page.keyboard.type(tail);
    // 富文本桥接尚未提交这次输入时，状态仍可能显示上一次的「已保存」。
    const expected = saved.replace("条目甲", `条目甲${tail}`);
    await expect.poll(() => readFileSync(path.join(vault, "日志.md"), "utf8"), { timeout: 15_000 }).toBe(expected);
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 15_000 });
    expect(treeRows(page)).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("A02/A03/OP-D11：隐藏后原标签、双链和搜索仍可访问，重启后从管理恢复", async () => {
  const { app, page, vault } = await openApp();
  const dir = path.join(vault, "隐藏目录");
  const target = "隐藏目录/隐蔽目标.md";
  const preference = path.join(vault, ".huhu/notes/ui-preferences.json");
  mkdirSync(dir);
  writeFileSync(path.join(vault, target), "# 隐蔽目标\n\n可编辑正文\n");
  writeFileSync(path.join(vault, "入口.md"), `# 入口\n\n[[${target}]]\n`);
  const navigate = async (p: Page) => {
    await expect(p.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await p.getByRole("button", { name: "知识库", exact: true }).first().click();
  };
  try {
    await navigate(page);
    await treeFolder(page, "隐藏目录").click();
    await treeItem(page, "隐蔽目标.md").click();
    await expect(prose(page)).toContainText("可编辑正文");
    const tab = page.getByTestId("document-tab").filter({ hasText: "隐蔽目标" });
    await treeMenu(page, treeFolder(page, "隐藏目录"), /隐藏/);
    await expect(treeFolder(page, "隐藏目录")).toHaveCount(0);
    await tab.click();
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("原标签可保存");
    await expect.poll(() => readFileSync(path.join(vault, target), "utf8")).toContain("原标签可保存");
    await treeItem(page, "入口.md").click();
    await prose(page).locator(`[data-wiki-link][data-target="${target}"]`).press("Enter");
    await expect(prose(page)).toContainText("原标签可保存");
    await expect(tab).toHaveAttribute("aria-current", "true");
    await tab.focus();
    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByTestId("command-palette");
    await search.getByRole("combobox").fill("隐蔽目标");
    await search.getByTestId("palette-item").filter({ hasText: target }).click();
    await expect(prose(page)).toContainText("原标签可保存");
    expect(JSON.parse(readFileSync(preference, "utf8"))).toEqual({ hiddenPaths: ["隐藏目录"] });

    await app.close();
    const reopened = await electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
    try {
      const p = await reopened.firstWindow();
      await navigate(p);
      await expect(p.getByTestId("notes-hidden-manage")).toBeVisible();
      await expect(treeFolder(p, "隐藏目录")).toHaveCount(0);
      // 外部改名保留旧规则，新路径仍可见；改回时旧规则继续匹配。
      const external = path.join(vault, "外部改名");
      renameSync(dir, external);
      await expect(treeFolder(p, "外部改名")).toBeVisible({ timeout: 15_000 });
      expect(JSON.parse(readFileSync(preference, "utf8"))).toEqual({ hiddenPaths: ["隐藏目录"] });
      renameSync(external, dir);
      await p.getByTestId("notes-hidden-manage").click();
      await expect(p.getByTestId("notes-hidden-list")).toContainText("隐藏目录");
      await p.getByTestId("notes-hidden-restore").click();
      await treeFolder(p, "隐藏目录").click();
      await expect(treeItem(p, "隐蔽目标.md")).toBeVisible();
      expect(JSON.parse(readFileSync(preference, "utf8"))).toEqual({ hiddenPaths: [] });
    } finally {
      await reopened.close();
    }
  } finally {
    if (app.process().exitCode === null) await app.close();
    rmTree(vault);
  }
});
