import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeRename, treeSettled } from "../helpers/tree.js";

// 附件上传（notes.attach）：编辑器粘贴 / 拖入图片、文件树拖入外部文件，以及改名 / 删除之后的引用行为。
// 真实 Electron：事件由页面里构造的 ClipboardEvent / DragEvent（带真实 File）触发，落盘与渲染都读真实结果。

// 1×1 红色 PNG（真实可解码）
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_B64, "base64");

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page);
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

/** 在编辑器上派发带真实 File 的 paste / drop 事件（Tiptap FileHandler 读 clipboardData / dataTransfer.files）。 */
async function sendFile(page: Page, kind: "paste" | "drop", file: { name: string; type: string; b64: string }): Promise<void> {
  await page.evaluate(
    ({ kind: k, file: f }) => {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], f.name, { type: f.type }));
      const el = document.querySelector('[data-testid="markdown-editor"] .ProseMirror') as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (k === "paste") el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      else el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20 }));
    },
    { kind, file },
  );
}

/** 在文件树的某一行上派发“从系统拖入文件”的 drop（上游在 shadow root 上捕获 drop）。 */
async function dropOnTreeRow(page: Page, rowSelector: string, file: { name: string; type: string; b64: string }): Promise<void> {
  await page
    .locator(rowSelector)
    .first()
    .evaluate((row, f) => {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], f.name, { type: f.type }));
      const opts = { dataTransfer: dt, bubbles: true, cancelable: true, composed: true };
      row.dispatchEvent(new DragEvent("dragenter", opts));
      row.dispatchEvent(new DragEvent("dragover", opts));
      row.dispatchEvent(new DragEvent("drop", opts));
    }, file);
}

const attachments = (vault: string, dir: string) => (existsSync(path.join(vault, dir)) ? readdirSync(path.join(vault, dir)).sort() : []);

test("粘贴 / 拖入图片：落在笔记旁 attachments/，引用写进笔记，图片真的渲染；同图再粘贴不重复", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "docs"), { recursive: true });
    const note = path.join(vault, "docs", "说明.md");
    writeFileSync(note, "# 说明\n\n正文一段。\n");
    await gotoNotes(page);
    await treeFolder(page, "docs").first().click();
    await treeItem(page, "说明.md").click();
    await expect(prose(page)).toContainText("正文一段。", { timeout: 30_000 });
    await prose(page).click();

    await sendFile(page, "paste", { name: "粘贴.png", type: "image/png", b64: PNG_B64 });
    await expect.poll(() => attachments(vault, "docs/attachments"), { timeout: 20_000 }).toEqual(["粘贴.png"]);
    expect(readFileSync(path.join(vault, "docs/attachments/粘贴.png")).equals(PNG)).toBe(true);
    // 引用写进笔记（自动保存后）
    await expect.poll(() => readFileSync(note, "utf8"), { timeout: 20_000 }).toContain("attachments/粘贴.png");
    // 渲染：<img> 经 huhu-app 协议按 Vault 相对路径读到真实字节（naturalWidth > 0）
    const img = prose(page).locator("img").first();
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    // 同内容再次粘贴：复用同一个文件（不出现 -1）
    await sendFile(page, "paste", { name: "粘贴.png", type: "image/png", b64: PNG_B64 });
    await expect(prose(page).locator("img")).toHaveCount(2, { timeout: 20_000 });
    expect(attachments(vault, "docs/attachments")).toEqual(["粘贴.png"]);

    // 拖入另一张同名不同内容的图：落成 -1
    const other = Buffer.concat([PNG, Buffer.from([0])]).toString("base64");
    await sendFile(page, "drop", { name: "粘贴.png", type: "image/png", b64: other });
    await expect.poll(() => attachments(vault, "docs/attachments"), { timeout: 20_000 }).toEqual(["粘贴-1.png", "粘贴.png"]);
  } finally {
    await close();
  }
});

const rejectedUploads = [
  { name: "unsupported.exe", type: "application/x-msdownload", b64: PNG_B64, feedback: "不支持的附件类型：unsupported.exe" },
  { name: "empty.png", type: "image/png", b64: "", feedback: "附件是空文件" },
];

for (const { feedback, ...file } of rejectedUploads) {
  test(`H04 上传拒绝显示提示：${file.name}`, async () => {
    const { page, vault, close } = await openApp();
    try {
      const note = path.join(vault, "n.md");
      writeFileSync(note, "# n\n\n正文\n");
      await gotoNotes(page);
      await treeItem(page, "n.md").click();
      await expect(prose(page)).toContainText("正文", { timeout: 30_000 });
      await prose(page).click();
      await sendFile(page, "paste", file);
      await expect(page.getByText(feedback, { exact: true })).toBeVisible();
      await expect(prose(page).locator("img")).toHaveCount(0);
      expect(existsSync(path.join(vault, "attachments"))).toBe(false);
      expect(readFileSync(note, "utf8")).toBe("# n\n\n正文\n");
    } finally {
      await close();
    }
  });
}

test("文件树拖入外部文件：落在被拖到的目录；类型不支持则拒绝", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "资料"), { recursive: true });
    writeFileSync(path.join(vault, "资料", "占位.md"), "# 占位\n");
    await gotoNotes(page);
    const folderRow = '[data-testid="notes-resource-tree"] [data-item-path="资料/"]';
    const protectedRow = '[data-testid="notes-resource-tree"] [data-item-path=".agents/"]';
    await dropOnTreeRow(page, folderRow, { name: "报告.txt", type: "text/plain", b64: Buffer.from("hello attach").toString("base64") });
    await expect.poll(() => attachments(vault, "资料"), { timeout: 20_000 }).toContain("报告.txt");
    expect(readFileSync(path.join(vault, "资料", "报告.txt"), "utf8")).toBe("hello attach");
    // 树里出现新文件（目录事件触发重新列举）
    await treeFolder(page, "资料").first().click();
    await expect(treeItem(page, "报告.txt")).toBeVisible({ timeout: 20_000 });

    await dropOnTreeRow(page, folderRow, { name: "bad.exe", type: "application/x-msdownload", b64: PNG_B64 });
    // 受保护目录（.agents/ 在树里可见但不接受写入）
    await dropOnTreeRow(page, protectedRow, { name: "x.txt", type: "text/plain", b64: Buffer.from("x").toString("base64") });
    await page.waitForTimeout(2500);
    expect(attachments(vault, "资料")).not.toContain("bad.exe");
    expect(attachments(vault, ".agents")).not.toContain("x.txt");
  } finally {
    await close();
  }
});

test("笔记改名后附件引用仍有效；附件被删除后笔记原文不变且不崩溃", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "docs", "attachments"), { recursive: true });
    writeFileSync(path.join(vault, "docs", "attachments", "图.png"), PNG);
    const note = path.join(vault, "docs", "原名.md");
    const text = "# 原名\n\n![图](attachments/图.png)\n";
    writeFileSync(note, text);
    await gotoNotes(page);
    await treeFolder(page, "docs").first().click();
    await treeItem(page, "原名.md").click();
    const img = () => prose(page).locator("img").first();
    await expect(img()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => img().evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    // 改名：同目录，相对引用仍然指向同一个附件
    // 树在文件事件合并后会重绘并吃掉内联输入：最多重试 3 次，直到磁盘上出现新名字
    for (let attempt = 0; attempt < 3 && !existsSync(path.join(vault, "docs", "新名.md")); attempt++) {
      await treeSettled(page);
      await treeRename(page, treeItem(page, "原名.md"), "新名");
      await page.waitForTimeout(1500);
    }
    await expect.poll(() => existsSync(path.join(vault, "docs", "新名.md")), { timeout: 20_000 }).toBe(true);
    expect(readFileSync(path.join(vault, "docs", "新名.md"), "utf8")).toContain("attachments/图.png");
    await treeItem(page, "新名.md").click();
    await expect(img()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => img().evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    // 删除附件（进回收站）：笔记原文不变，编辑器仍可用
    await treeFolder(page, "attachments").first().click();
    await treeMenu(page, treeItem(page, "图.png"), /^删除/);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Move to|Delete|移到|删除/i })
      .first()
      .click();
    await expect.poll(() => existsSync(path.join(vault, "docs", "attachments", "图.png")), { timeout: 20_000 }).toBe(false);
    expect(readFileSync(path.join(vault, "docs", "新名.md"), "utf8")).toBe(text);
    await expect(prose(page)).toBeVisible();
  } finally {
    await close();
  }
});
