import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree } from "../helpers/launch.js";
import { buildPdf } from "../helpers/pdf.js";
import { treeItem } from "../helpers/tree.js";

const note = "引用块.md";
const source = (text: string) => `<MirrorSource name="摘录">\n\n${text}\n\n</MirrorSource>\n`;
const board = (width: number) => JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [{ id: "rectangle", type: "rectangle", x: 0, y: 0, width, height: 40, strokeColor: "#000000", backgroundColor: "#b2f2bb", fillStyle: "solid", strokeWidth: 2, opacity: 100, seed: 1, version: 1, versionNonce: 1, groupIds: [], isDeleted: false }],
  appState: {},
  files: {},
});

async function openNote(page: Page, name: string) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await treeItem(page, name).click();
}

test("B01：镜像与画板读取未打开文件，更新及切 Vault 后释放旧快照", async () => {
  const seed = (dir: string, text: string, width: number) => {
    writeFileSync(path.join(dir, note), '<Mirror src="source" name="摘录" />\n\n<Excalidraw src="/board.excalidraw" title="画板" />\n');
    writeFileSync(path.join(dir, "source.md"), source(text));
    writeFileSync(path.join(dir, "board.excalidraw"), board(width));
  };
  const other = mkdtempSync(path.join(tmpdir(), "huhu-reference-other-"));
  const { app, page, vault, close } = await openApp({}, (dir) => seed(dir, "第一库内容", 60));
  try {
    const image = page.getByTestId("excalidraw-embed-snapshot").locator("img");
    const surface = page.getByTestId("markdown-editor");
    await openNote(page, note);
    await expect(surface.getByText("第一库内容", { exact: true })).toBeVisible();
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    const oldUrl = (await image.getAttribute("src"))!;
    writeFileSync(path.join(vault, "source.md"), source("第一库更新"));
    writeFileSync(path.join(vault, "board.excalidraw"), board(150));
    await expect(surface.getByText("第一库更新", { exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(image).not.toHaveAttribute("src", oldUrl, { timeout: 35_000 });
    const currentUrl = (await image.getAttribute("src"))!;
    await expect.poll(() => page.evaluate((url) => fetch(url).then(() => false, () => true), oldUrl)).toBe(true);
    await page.getByRole("button", { name: "关闭 引用块", exact: true }).click();
    await expect(image).toHaveCount(0);
    await expect.poll(() => page.evaluate((url) => fetch(url).then(() => false, () => true), currentUrl)).toBe(true);

    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, other);
    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await page.getByTestId("vault-open-other").click();
    await Promise.all([page.waitForEvent("load"), page.getByTestId("svault-switch-confirm").click()]);
    seed(other, "第二库独立内容", 220);
    await openNote(page, note);
    await expect(surface.getByText("第二库独立内容", { exact: true })).toBeVisible();
    await expect(surface.getByText("第一库更新", { exact: true })).toHaveCount(0);
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  } finally {
    await close();
    rmTree(other);
  }
});

test("B01：已有 PDF 在内嵌块逐页渲染，关闭笔记后重开", async () => {
  const name = "内嵌PDF.md";
  const { page, close } = await openApp({}, (dir) => {
    writeFileSync(path.join(dir, name), '<Pdf src="appendix.pdf" />\n');
    writeFileSync(path.join(dir, "appendix.pdf"), buildPdf(["PAGE ALPHA", "PAGE BETA"]));
  });
  try {
    const pages = page.getByTestId("markdown-editor").locator(".ok-pdf-pages canvas");
    for (let attempt = 0; attempt < 2; attempt++) {
      await openNote(page, name);
      await expect(pages).toHaveCount(2);
      for (const canvas of await pages.all()) {
        await canvas.scrollIntoViewIfNeeded();
        await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => {
          const pixels = node.getContext("2d")?.getImageData(0, 0, node.width, node.height).data;
          return pixels?.some((value, index) => index % 4 === 0 && value < 200 && pixels[index + 3] === 255);
        })).toBe(true);
      }
      await page.getByRole("button", { name: "关闭 内嵌PDF", exact: true }).click();
      await expect(pages).toHaveCount(0);
    }
  } finally {
    await close();
  }
});
