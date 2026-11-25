/* oxlint-disable typescript/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openNoteProperties, treeFolder, treeItem, treeRename } from "../helpers/tree.js";
import { openApp } from "../helpers/launch.js";

/** S6（知识库 OK 对等）：档案首页 / 类型 / 记录是真实标签，侧栏上下文切换，普通目录只浏览，同一 index.md 同一会话（E01–E05）。 */
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

async function seed(page: Page): Promise<Call> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  const call = await caller(page);
  await call("archives.types.save", { name: "通讯录", fields: [{ name: "电话", type: "text" }] });
  await call("archives.create", { type: "通讯录", name: "张三", fields: { 电话: "123" } });
  await call("archives.create", { type: "通讯录", name: "李四", fields: { 电话: "456" } });
  await call("folders.create", { path: "资料" });
  await call("notes.create", { name: "说明", folder: "资料" });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  return call;
}

test("E01 分区顺序为 文件/星标/日记/标签/回收站/档案；点“档案”打开唯一的档案首页标签，再点只聚焦；类型页 / 记录页同样是标签", async () => {
  const { page, close } = await openApp();
  try {
    await seed(page);
    const sections = page.locator(".notes-explorer-filters > button");
    await expect(sections).toHaveText(["文件", "星标", "日记", "标签", "回收站", "档案"]);

    await page.getByTestId("notes-open-archives").click();
    await expect(page.getByTestId("archives-home")).toBeVisible();
    await expect(page.locator('[data-tab-kind="archives-home"]')).toHaveCount(1);
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("notes-open-archives").click();
    await expect(page.locator('[data-tab-kind="archives-home"]')).toHaveCount(1); // 聚焦而不是堆叠

    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await expect(page.locator('[data-tab-kind="archive-type"]')).toHaveCount(1);
    await expect(page.getByTestId("archive-category-view")).toBeVisible();
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    await expect(page.locator('[data-tab-kind="archive-record"]')).toHaveCount(1);
    await expect(page.getByTestId("archive-view")).toContainText("张三");
    // 三个标签可切换、可关闭
    await expect(page.getByTestId("document-tab")).toHaveCount(3);
    await page.getByTestId("document-tab").filter({ hasText: "通讯录" }).click();
    await expect(page.getByTestId("archive-category-view")).toBeVisible();
    await page.getByRole("button", { name: "关闭 通讯录" }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(2);
  } finally {
    await close();
  }
});

test("E02 活动档案标签 → 档案树；文件标签 → 文件树；展开状态各自记忆；手动切换 50 次无抖动", async () => {
  const { page, close } = await openApp();
  try {
    await seed(page);
    // 文件标签：展开“资料”
    await treeFolder(page, "资料").first().click();
    await treeItem(page, "说明").click();
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(page.getByTestId("archives-sidebar")).toHaveCount(0);

    // 档案标签 → 档案树；展开“通讯录”
    await page.getByTestId("notes-open-archives").click();
    await expect(page.getByTestId("archives-sidebar")).toBeVisible();
    await expect(page.getByTestId("notes-explorer-tree")).toHaveCount(0);
    await page.getByTestId("archives-tree-toggle").first().click();
    await expect(page.getByTestId("archives-tree-record")).toHaveCount(2);

    // 回到文件标签：文件树恢复且“资料”仍展开
    await page.getByTestId("document-tab").filter({ hasText: "说明" }).click();
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(treeItem(page, "说明")).toBeVisible();
    // 再回档案标签：通讯录仍展开
    await page.getByTestId("document-tab").filter({ hasText: "档案" }).first().click();
    await expect(page.getByTestId("archives-tree-record")).toHaveCount(2);

    // 手动点“文件”分类只切上下文，不关标签、不被弹回
    await page.getByTestId("notes-section-all").click();
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(page.getByTestId("document-tab")).toHaveCount(2);
    // 连续切换 50 次：没有抖动，页面稳定
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (let i = 0; i < 25; i++) {
      await page.getByTestId("notes-open-archives").click();
      await page.getByTestId("notes-section-all").click();
    }
    await expect(page.getByTestId("notes-explorer-tree")).toBeVisible();
    await expect(page.getByTestId("document-tab")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test("E03 普通目录点击只浏览；Archives/ 在文件视图里是真实目录（含 index.md 与附件）", async () => {
  const { page, vault, close } = await openApp();
  try {
    const call = await seed(page);
    await call("notes.create", { name: "备注", folder: "Archives/通讯录/张三" });
    writeFileSync(path.join(vault, "Archives", "通讯录", "张三", "附件.txt"), "附件");
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeFolder(page, "资料").first().click();
    await expect(treeItem(page, "说明")).toBeVisible();
    await expect(page.getByTestId("archives-home")).toHaveCount(0);
    await expect(page.locator('[data-tab-kind="archives-home"]')).toHaveCount(0);
    // Archives/ 目录：点击只展开真实子资源，不打开档案页面
    await treeFolder(page, "Archives").first().click();
    await expect(page.getByTestId("archives-home")).toHaveCount(0);
    await expect(treeFolder(page, "通讯录")).toBeVisible();
    await treeFolder(page, "通讯录").click();
    const tree = page.getByTestId("notes-resource-tree");
    await expect(tree.locator('[data-item-path="Archives/通讯录/index.md"]')).toBeVisible();
    await treeFolder(page, "张三").click();
    await expect(tree.locator('[data-item-path="Archives/通讯录/张三/附件.txt"]')).toBeVisible();
  } finally {
    await close();
  }
});

test("E04 同一 index.md 同一会话：Markdown 标签里的未保存编辑，不会被档案视图改字段覆盖；“以档案视图打开 / 以 Markdown 打开”互通", async () => {
  const { page, vault, close } = await openApp();
  try {
    await seed(page);
    const file = path.join(vault, "Archives", "通讯录", "张三", "index.md");
    // 文件树点击档案文件夹笔记 → Markdown（不是档案视图）
    await treeFolder(page, "Archives").first().click();
    await treeFolder(page, "通讯录").first().click();
    await treeFolder(page, "张三").first().click();
    await page.locator('[data-testid="notes-resource-tree"] [data-item-path$="张三/index.md"]').click();
    await expect(page.getByTestId("markdown-editor")).toBeVisible();
    await expect(page.getByTestId("archive-view")).toHaveCount(0);
    // 在 Markdown 里追加一行，不等自动保存就切到档案视图改字段
    await page.getByTestId("markdown-editor").locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n来自 Markdown 的修改");
    await page.getByTestId("archive-open-record-view").click();
    await expect(page.getByTestId("archive-view")).toContainText("张三");
    const phone = page.getByTestId("archive-fields").getByLabel("电话");
    await phone.fill("999");
    await phone.blur();
    await expect.poll(() => readFileSync(file, "utf8")).toContain("999");
    // 两边的修改都在同一个文件里，没有第二份记录
    const disk = readFileSync(file, "utf8");
    expect(disk).toContain("来自 Markdown 的修改");
    expect(disk.match(/电话/g)?.length).toBe(1);
    expect(existsSync(path.join(vault, "Archives", "通讯录", "张三", "index.md"))).toBe(true);
    // 切回 Markdown：看到字段与追加行
    await page.getByTestId("archive-open-markdown").click();
    await expect(page.getByTestId("markdown-editor")).toContainText("999");
    await expect(page.getByTestId("markdown-editor")).toContainText("来自 Markdown 的修改");
  } finally {
    await close();
  }
});

test("E04：树改名同步两个标签，外部改写和删除更新同一档案文件", async () => {
  const { page, vault, close } = await openApp();
  try {
    const call = await seed(page);
    await treeFolder(page, "Archives").click();
    await treeFolder(page, "通讯录").click();
    await treeFolder(page, "张三").click();
    const root = page.getByTestId("notes-resource-tree");
    const base = "Archives/通讯录/";
    const oldPath = `${base}张三/index.md`;
    const newPath = `${base}张 三/index.md`;
    await root.locator(`[data-item-path="${oldPath}"]`).click();
    await page.getByTestId("archive-open-record-view").click();
    const recordTab = page.locator('[data-tab-kind="archive-record"]').getByTestId("document-tab");
    const markdownTab = page.locator('[data-tab-kind="file"]').getByTestId("document-tab");
    await expect(recordTab).toHaveAttribute("title", oldPath);
    await page.getByTestId("notes-section-all").click();
    for (const parent of ["Archives/", base]) {
      const folder = root.locator(`[data-item-path="${parent}"]`);
      await expect(folder).toBeVisible();
      if ((await folder.getAttribute("aria-expanded")) !== "true") await folder.click();
    }
    const oldFolder = root.locator(`[data-item-path="${base}张三/"]`);
    await treeRename(page, oldFolder, "张 三");
    await expect(markdownTab).toHaveAttribute("title", newPath);
    await expect(recordTab).toHaveAttribute("title", newPath);
    expect(readdirSync(path.join(vault, base)).sort()).toEqual(["index.md", "张 三", "李四"]);

    const phone = page.getByTestId("archive-fields").getByLabel("电话");
    await expect(phone).toHaveValue("123");
    const disk = path.join(vault, newPath);
    writeFileSync(disk, readFileSync(disk, "utf8").replace("123", "987") + "\n外部写入同一档案。\n");
    await expect.poll(async () => (await call("notes.read", { path: newPath })).data?.text).toContain("外部写入同一档案。");
    await expect(phone).toHaveValue("987", { timeout: 20_000 });
    await expect(page.getByTestId("archive-body")).toContainText("外部写入同一档案。");
    await markdownTab.click();
    await expect(page.getByTestId("markdown-editor").locator(".ProseMirror")).toContainText("外部写入同一档案。");
    await expect(await openNoteProperties(page)).toContainText("987");
    rmSync(path.dirname(disk), { recursive: true });
    await expect.poll(async () => (await call("notes.list", { filter: "all" })).data.some((note: { path: string }) => note.path === newPath), { timeout: 20_000 }).toBe(false);
    await expect(markdownTab).toHaveCount(0, { timeout: 20_000 });
    await expect(recordTab).toHaveCount(0, { timeout: 20_000 });
    expect(readdirSync(path.join(vault, base)).sort()).toEqual(["index.md", "李四"]);
  } finally {
    await close();
  }
});

test("E04 在途 Markdown 保存完成后，档案字段与正文都落盘并可重开", async () => {
  const { page, vault, close } = await openApp();
  const releaseSave = Promise.withResolvers<void>();
  const saveStarted = Promise.withResolvers<void>();
  try {
    await seed(page);
    const indexPath = "Archives/通讯录/张三/index.md";
    const file = path.join(vault, indexPath);
    await treeFolder(page, "Archives").first().click();
    await treeFolder(page, "通讯录").first().click();
    await treeFolder(page, "张三").first().click();
    const index = page.locator(`[data-testid="notes-resource-tree"] [data-item-path="${indexPath}"]`);
    await index.click();
    await page.getByTestId("archive-open-record-view").click();
    await expect(page.getByTestId("archive-fields").getByLabel("电话")).toHaveValue("123");
    await page.getByTestId("archive-open-markdown").click();
    const archiveTab = page.locator('[data-tab-kind="archive-record"]').getByTestId("document-tab");
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await prose.click();
    await page.route("**/api/v1/call", async (route) => {
      const body = route.request().postDataJSON() as { capability?: string };
      if (body?.capability === "notes.save") {
        saveStarted.resolve();
        await releaseSave.promise;
      }
      await route.continue();
    });
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("两种编辑都保留");
    await saveStarted.promise;

    await archiveTab.click();
    await expect(page.getByTestId("archive-body")).toContainText("两种编辑都保留");
    const phone = page.getByTestId("archive-fields").getByLabel("电话");
    await expect(phone).toHaveValue("123");
    await phone.fill("999");
    await phone.blur();
    const disk = () => readFileSync(file, "utf8");
    expect(disk()).not.toContain("两种编辑都保留");
    expect(disk()).not.toContain("999");
    releaseSave.resolve();
    await expect.poll(disk).toContain("999");
    await expect.poll(disk).toContain("两种编辑都保留");

    await page.getByRole("button", { name: "关闭 张三", exact: true }).click();
    await page.getByRole("button", { name: "关闭 index", exact: true }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(0);
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    await page.getByTestId("archive-open-markdown").click();
    await expect(page.locator('[data-tab-kind="file"]').getByTestId("document-tab")).toHaveAttribute("title", indexPath);
    await expect(prose).toContainText("两种编辑都保留");
    await expect(await openNoteProperties(page)).toContainText("999");
    expect(disk()).toContain("999");
    expect(disk()).toContain("两种编辑都保留");
  } finally {
    releaseSave.resolve();
    await close();
  }
});

test("E01/E04 档案标签随 Vault 记录：重载后恢复；档案删除后记录标签消失", async () => {
  const { page, close } = await openApp();
  try {
    const call = await seed(page);
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await page.getByTestId("archive-row").filter({ hasText: "李四" }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await expect(page.getByTestId("document-tab")).toHaveCount(3);
    await expect(page.getByTestId("archive-view")).toContainText("李四");
    // 在档案视图里删除该档案：记录标签关闭，回到类型页
    await page.getByRole("button", { name: "更多" }).click();
    await page.getByRole("menuitem", { name: /删除/ }).click();
    await page
      .getByRole("button", { name: /删除|移到回收站/ })
      .last()
      .click();
    await expect(page.getByTestId("archive-category-view")).toBeVisible();
    await expect(page.locator('[data-tab-kind="archive-record"]')).toHaveCount(0);
    expect((await call("archives.list", { type: "Archives/通讯录/" })).data.length).toBe(1);
  } finally {
    await close();
  }
});

test("E05 档案附件使用统一查看器，笔记 @ 引用与档案反链使用真实相对路径", async () => {
  const { page, vault, close } = await openApp();
  try {
    const call = await seed(page);
    expect((await call("notes.create", { name: "引用来源" })).ok).toBe(true);
    const dir = "Archives/通讯录/张三";
    const attachment = `${dir}/可引用.html`;
    writeFileSync(path.join(vault, dir, "展示.html"), "<!doctype html><h1>档案 HTML 附件</h1>");
    writeFileSync(path.join(vault, dir, "密码.pdf"), readFileSync(new URL("../../fixtures/password-protected.pdf", import.meta.url)));
    writeFileSync(path.join(vault, dir, "图像.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    const record = page.locator('[data-tab-kind="archive-record"]').getByTestId("document-tab");
    const viewer = page.getByTestId("file-card");
    for (const [name, kind] of [
      ["展示.html", "html"],
      ["密码.pdf", "pdf"],
      ["图像.png", "image"],
    ]) {
      await page.getByTestId("archive-file").filter({ hasText: name }).click();
      await expect(viewer).toHaveAttribute("data-viewer", kind!);
      await expect(page.getByTestId("document-tab").filter({ hasText: name })).toHaveAttribute("title", `${dir}/${name}`);
      if (kind === "html") await expect(page.frameLocator('[data-testid="html-preview-frame"]').getByRole("heading")).toHaveText("档案 HTML 附件");
      if (kind === "pdf") await expect(page.getByTestId("pdf-error")).toContainText("受密码保护");
      if (kind === "image") await expect(viewer.locator("img")).toBeVisible();
      await record.click();
    }

    await page.getByTestId("archive-file-input").setInputFiles({ name: "可引用.html", mimeType: "text/html", buffer: Buffer.from("<h1>双链目标</h1>") });
    await expect(page.getByTestId("archive-file").filter({ hasText: "可引用.html" })).toBeVisible();
    await page.getByTestId("notes-section-all").click();
    const source = treeItem(page, "引用来源.md");
    await source.click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await prose.click();
    await page.keyboard.type("@可引用");
    await expect(page.getByTestId("editor-ref-menu")).toContainText(attachment);
    await page.keyboard.press("Enter");
    const readSource = () => readFileSync(path.join(vault, "引用来源.md"), "utf8");
    await expect.poll(readSource).toContain(`[[${attachment}]]`);
    await page.getByRole("button", { name: "关闭 引用来源", exact: true }).click();
    await record.click();
    const backlink = page.getByTestId("archive-backlink").filter({ hasText: "引用来源" });
    await backlink.click();
    const wikiLink = prose.locator(`[data-wiki-link][data-target="${attachment}"]`);
    await expect(wikiLink).toBeVisible();
    expect(readSource()).toContain(`[[${attachment}]]`);
    await wikiLink.press("Enter");
    await expect(viewer).toHaveAttribute("data-viewer", "html");
    await expect(page.frameLocator('[data-testid="html-preview-frame"]').getByRole("heading")).toHaveText("双链目标");
  } finally {
    await close();
  }
});

test("D06 从档案视图重开同一笔记仍读取原评论线程", async () => {
  const { page, vault, close } = await openApp();
  try {
    await seed(page);
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
    await page.getByTestId("archive-row").filter({ hasText: "张三" }).click();
    await page.getByTestId("archive-open-markdown").click();
    await page.getByRole("button", { name: "文档详情", exact: true }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await page.getByTestId("comment-whole-note-input").fill("档案同一线程");
    await page.getByTestId("comment-whole-note-add").click();
    await expect(page.getByTestId("comment-thread")).toContainText("档案同一线程");
    const comments = path.join(vault, "Comments");
    const stored = () => readdirSync(comments);
    const initial = stored();
    expect(initial).toHaveLength(1);
    const thread = path.join(comments, initial[0]!);
    expect(readFileSync(thread, "utf8")).toContain("documentPath: Archives/通讯录/张三/index.md");

    await page.getByRole("button", { name: "关闭 index", exact: true }).click();
    await page.locator('[data-tab-kind="archive-record"]').getByTestId("document-tab").click();
    await page.getByTestId("archive-open-markdown").click();
    const inspector = page.getByTestId("note-inspector");
    if (!(await inspector.isVisible())) await page.getByRole("button", { name: "文档详情", exact: true }).click();
    await inspector.getByRole("tab", { name: "批注" }).click();
    await expect(page.getByTestId("comment-thread")).toContainText("档案同一线程");
    expect(stored()).toEqual(initial);
  } finally {
    await close();
  }
});
