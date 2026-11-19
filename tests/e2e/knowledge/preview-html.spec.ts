import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

const expect = baseExpect.configure({ timeout: 12_000 });

const starters = [
  ["html", "编辑这段 HTML"],
  ["chart", "各地区收入"],
  ["stat-cards", "活跃用户"],
  ["custom-svg", "入门进度"],
  ["interactive-control", "每月预算"],
] as const;

async function editPreview(page: Page, block: Locator) {
  const edit = block.getByTestId("ok-codeblock-edit-btn");
  await edit.focus();
  await expect(edit).toBeFocused();
  await edit.press("Enter");
  const dialog = page.getByRole("dialog");
  const source = dialog.getByTestId("ok-code-preview-edit-modal-source").locator(".cm-content");
  await expect(source).toBeFocused();
  return { dialog, source };
}

test("HTML 代码块和全部起始模板在沙箱渲染，编辑和重开仍生效", async () => {
  test.setTimeout(300_000);
  const { app, page, vault, close } = await openApp();
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end("unexpected preview request");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/preview-test`;
  try {
    const names = ["手写", ...starters.map((_, index) => `模板${index + 1}`)];
    for (const name of names) writeFileSync(path.join(vault, `${name}.md`), "# 样本\n\n输入位置\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    expect(page.url()).toMatch(/^huhu-app:/);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);
    const open = async (name: string) => {
      await treeItem(page, `${name}.md`).click();
      await expect(page.getByTestId("markdown-editor").locator(".ProseMirror")).toContainText("输入位置");
    };
    const block = page.getByTestId("markdown-editor").locator(".ok-codeblock");
    const preview = block.locator("iframe").contentFrame();
    await open("手写");
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    const markdown = page.getByTestId("markdown-editor").locator(".cm-content");
    await markdown.click();
    await markdown.press("ControlOrMeta+End");
    await page.keyboard.insertText(
      "\n\n```html preview\n" + `<h1 id="hello">手写预览</h1><img src="${url}"><output id="network"></output><script>fetch("${url}").then(() => network.textContent = "allowed", () => network.textContent = "blocked")</script>\n` + "```\n",
    );
    await page.getByRole("tab", { name: "实时预览", exact: true }).click();
    await expect(block.locator("iframe")).toHaveAttribute("src", "huhu-preview://editor/preview-frame.html");
    await expect(preview.locator("#hello")).toHaveText("手写预览");
    await expect(preview.locator("#network")).toHaveText("blocked");
    await expect(block.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
    expect(
      await preview.locator("body").evaluate(() => {
        let parentReadable = false;
        try {
          parentReadable = Boolean(parent.document);
        } catch {
          // The browsing context has an opaque origin.
        }
        return { origin: window.origin, parentReadable, node: "require" in window || "process" in window, host: "huhuHost" in window };
      }),
    ).toEqual({ origin: "null", parentReadable: false, node: false, host: false });
    const { dialog, source } = await editPreview(page, block);
    await source.press("ControlOrMeta+End");
    await page.keyboard.insertText('<p id="manual-edited">手写更新</p>');
    await expect(dialog.locator("iframe").contentFrame().locator("#manual-edited")).toHaveText("手写更新");
    await source.press("ControlOrMeta+Enter");
    await expect(preview.locator("#manual-edited")).toHaveText("手写更新");

    for (const [index, [id, initial]] of starters.entries()) {
      const note = names[index + 1]!;
      await open(note);
      const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
      await prose.getByText("输入位置").click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText("/");
      await page.getByRole("listbox", { name: "斜杠命令" }).locator(`[data-slash-command="embed-starter-${id}"]`).click();
      await expect(preview.getByText(initial, { exact: id !== "html" })).toBeVisible();
      if (id === "chart") await expect(preview.locator("#bars > div")).toHaveCount(5);
      if (id === "interactive-control") {
        await preview.getByRole("slider").press("ArrowRight");
        await expect(preview.locator("#out")).toHaveText("$2,600");
      }
      const { dialog: editor, source: code } = await editPreview(page, block);
      await code.press("ControlOrMeta+End");
      await page.keyboard.insertText(`<p id="edited">更新${note}</p>`);
      await expect(editor.locator("iframe").contentFrame().locator("#edited")).toHaveText(`更新${note}`);
      await code.press("ControlOrMeta+Enter");
      await expect(preview.locator("#edited")).toHaveText(`更新${note}`);
      await expect.poll(() => readFileSync(path.join(vault, `${note}.md`), "utf8")).toContain(`更新${note}`);
      await page.getByRole("button", { name: `关闭 ${note}`, exact: true }).click();
      await expect(page.getByTestId("document-tab").filter({ hasText: note })).toHaveCount(0);
      await open(note);
      await expect(preview.locator("#edited")).toHaveText(`更新${note}`);
    }
    await expect.poll(() => readFileSync(path.join(vault, "手写.md"), "utf8")).toContain("手写更新");
    await page.getByRole("button", { name: "关闭 手写", exact: true }).click();
    await expect(page.getByTestId("document-tab").filter({ hasText: "手写" })).toHaveCount(0);
    await open("手写");
    await expect(preview.locator("#manual-edited")).toHaveText("手写更新");
    await expect(preview.locator("#network")).toHaveText("blocked");
    expect(requests).toBe(0);
    const versions = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome }));
    console.log(JSON.stringify({ ...versions, starters: starters.length, networkRequests: requests }));
  } finally {
    server.close();
    await close();
  }
});
