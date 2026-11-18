import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// 宿主路由完整性：编辑器 / 批注页 / 源码模式不得向宿主兜底 404 发请求，也不得出现 PageListContext 的加载失败报错。
// （/api/pages 在批注页 OkRoot 比编辑面先挂载时曾 404；lint / audit 按 Q2 不可用，vendor 不再发 /api/audit、/api/lint/* 请求。）

test("宿主路由：打开笔记、切源码、打开批注页，没有 /api 404 与“加载页面失败”", async () => {
  const { page, vault, close } = await openApp();
  const notFound: string[] = [];
  const errors: string[] = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() === 404 && u.pathname.startsWith("/api/")) notFound.push(u.pathname);
  });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && /PageListContext|Failed to load pages/.test(t)) errors.push(t.slice(0, 160));
    if (/\[audit\]|\[lint\]/.test(t)) errors.push(t.slice(0, 160));
  });
  try {
    writeFileSync(path.join(vault, "路由.md"), "# 路由\n\n正文\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeSettled(page);
    await treeItem(page, "路由.md").click();
    await expect(page.getByTestId("markdown-editor").locator(".ProseMirror").first()).toContainText("正文", { timeout: 30_000 });
    // 源码模式：lint / audit 诊断订阅
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("正文", { timeout: 20_000 });
    await page.getByRole("tab", { name: "实时预览" }).click();
    // 批注页（详情栏的 OkRoot 只带评论路由）
    if ((await page.getByTestId("note-inspector").count()) === 0) await page.getByRole("button", { name: "文档详情" }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await expect(page.getByTestId("comments-panel")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
    expect(notFound).toEqual([]);
  } finally {
    await close();
  }
});
