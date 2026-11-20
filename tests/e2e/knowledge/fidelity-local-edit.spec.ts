import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

const original = [
  "---",
  "title: '保留引号与顺序'",
  "number: 007",
  "---",
  "",
  "# 局部编辑",
  "",
  "单字甲",
  "",
  "第一列|第二列",
  "--|:--:",
  "内容甲|内容乙",
  "",
  "*   原始列表缩进",
  "*   第二项",
  "",
  "<!-- 保留原始注释 -->",
  "",
  "使用[引用][ref]。",
  "",
  '[ref]: <https://example.com/a> "引用标题"',
  "",
  ...Array.from({ length: 100 }, (_, i) => `第 ${i + 1} 段保留其字节。\n`),
].join("\n");

test("H07：首次与后续富文本单字替换只改变目标字节，关闭后重开仍一致", async () => {
  const { app, page, vault, close } = await openApp();
  const name = "局部编辑.md";
  const file = path.join(vault, name);
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd: vault, encoding: "utf8" });
  const commit = () => {
    git("add", "--", name);
    git("-c", "user.name=Huhu E2E", "-c", "user.email=e2e@example.invalid", "-c", "commit.gpgSign=false", "commit", "--quiet", "--no-verify", "-m", "Record note bytes");
  };
  try {
    // 同一 Playwright worker 的 Electron userData 会保留工具栏缩放用例设定。
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1280, 800);
      window?.webContents.setZoomFactor(1);
    });
    writeFileSync(file, original);
    git("init", "--quiet");
    writeFileSync(path.join(vault, ".git", "info", "exclude"), "/.huhu/\n/.agents/skills/huhu/\n");
    commit();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeSettled(page);
    await treeItem(page, name).click();

    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(editor.getByText("单字甲", { exact: true })).toBeVisible();
    for (const [before, after] of [
      ["甲", "乙"],
      ["乙", "丙"],
    ]) {
      await editor.getByText(`单字${before}`, { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.press("Shift+ArrowLeft");
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(before);
      await page.keyboard.insertText(after!);
      await expect(editor.getByText(`单字${after}`, { exact: true })).toBeVisible();
      const expected = original.replace("单字甲", `单字${after}`);
      await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toContain(`单字${after}`);

      await page.getByRole("button", { name: "关闭 局部编辑", exact: true }).click();
      await expect(editor).toHaveCount(0);
      expect(readFileSync(file, "utf8")).toBe(expected);

      await treeItem(page, name).click();
      await expect(editor.getByText(`单字${after}`, { exact: true })).toBeVisible();
      await expect(editor.getByRole("table")).toBeVisible();
      await expect(editor.getByRole("listitem").filter({ hasText: "原始列表缩进" })).toBeVisible();
      expect(readFileSync(file)).toEqual(Buffer.from(expected));
      expect(git("status", "--porcelain=v1", "--untracked-files=all").trimEnd()).toBe(` M ${name}`);
      expect(git("diff", "--name-only", "HEAD").trim()).toBe(name);
      const diff = git("diff", "--no-ext-diff", "--no-textconv", "--unified=0", "HEAD", "--", name);
      const [header, ...lines] = diff.slice(diff.indexOf("@@ ")).trimEnd().split("\n");
      expect(header).toMatch(/^@@ -8 \+8 @@(?: |$)/);
      expect(lines).toEqual([`-单字${before}`, `+单字${after}`]);
      commit();
    }
  } finally {
    await close();
  }
});
