/* oxlint-disable typescript/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { treeFolder, treeItem } from "../helpers/tree.js";
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
