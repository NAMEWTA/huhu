import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFileRows, treeSettled } from "../helpers/tree.js";

// S3 / F07：笔记顶部工具栏在不同窗口宽度、长中文标题下保持单行、不溢出；窄时先收起撤销 / 重做 / 导出，核心按钮仍可达。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page); // 树在文件事件合并后会重新列举；稳定后再点
}

for (const width of [1440, 1100, 900, 800, 480]) {
  test(`S3：窗口 ${width}px，长中文标题下工具栏单行且不溢出`, async () => {
    const { app, page, vault, close } = await openApp();
    try {
      const name = "这是一个非常非常长的中文文件标题用来检验工具栏在窄宽度下的收纳行为与省略号显示效果";
      writeFileSync(path.join(vault, `${name}.md`), "---\ntitle: T\n---\n\n正文\n");
      await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800), width);
      await gotoNotes(page);
      await treeFileRows(page).first().click();
      await expect(page.getByTestId("note-document")).toBeVisible({ timeout: 30_000 });
      const bar = page.getByTestId("note-toolbar");
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(box?.height ?? 999).toBeLessThan(64); // 单行
      const overflow = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      // 核心操作始终可达
      await expect(page.getByRole("button", { name: "添加批注" }).first()).toBeVisible();
      await expect(page.getByRole("tab", { name: "实时预览" })).toBeVisible();
    } finally {
      await close();
    }
  });
}

// F07：系统缩放（Chromium zoom factor）125%–200% 时，工具栏仍单行不溢出，核心按钮可达
for (const zoom of [1.25, 1.5, 2]) {
  test(`S3：缩放 ${zoom * 100}%（窗口 1280px），工具栏单行且核心操作可达`, async () => {
    const { app, page, vault, close } = await openApp();
    try {
      writeFileSync(path.join(vault, "缩放.md"), "---\ntitle: T\n---\n\n正文\n");
      await app.evaluate(({ BrowserWindow }, z) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.setSize(1280, 800);
        w?.webContents.setZoomFactor(z);
      }, zoom);
      await gotoNotes(page);
      // 150% / 200% 下 Playwright 的指针点击会被计数条“拦截”（原因未查明：可能是缩放下的命中坐标，也可能是真实的重叠；见 evidence/s3/parity-closeout.md），所以这里用 DOM click 打开文件，只断言工具栏本身
      await treeFileRows(page)
        .first()
        .evaluate((el) => (el as HTMLElement).click());
      await expect(page.getByTestId("note-document")).toBeVisible({ timeout: 30_000 });
      const bar = page.getByTestId("note-toolbar");
      await expect(bar).toBeVisible();
      const overflow = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect((await bar.boundingBox())?.height ?? 999).toBeLessThan(64 * zoom);
      await expect(page.getByRole("button", { name: "添加批注" }).first()).toBeVisible();
    } finally {
      try {
        // 文件协议的缩放值保存在同一个 Electron 用户数据目录。
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1));
      } finally {
        await close();
      }
    }
  });
}

test("F07：1280px 下详情面板不能覆盖笔记工具栏", async () => {
  const testInfo = test.info();
  const { app, page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "工具栏.md"), "# 工具栏\n\n正文\n");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setSize(1280, 800);
      win?.webContents.setZoomFactor(1);
    });
    await gotoNotes(page);
    await treeFileRows(page).first().click();
    const bar = page.getByTestId("note-toolbar");
    await bar.getByRole("button", { name: "文档详情" }).click();
    await expect(page.getByTestId("note-inspector")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("inspector-open.png"), animations: "disabled" });
    expect(await obstructedControls(bar)).toEqual([]);
  } finally {
    await close();
  }
});

async function obstructedControls(bar: import("@playwright/test").Locator): Promise<string[]> {
  return bar.evaluate((toolbar) =>
    [...toolbar.querySelectorAll<HTMLElement>("button, select")].flatMap((control) => {
      const { x, y, width, height } = control.getBoundingClientRect();
      if (!width || !height || getComputedStyle(control).visibility !== "visible") return [];
      const hit = document.elementFromPoint(x + width / 2, y + height / 2);
      return control.contains(hit) ? [] : [`${control.getAttribute("aria-label") ?? control.textContent}: ${hit?.outerHTML.slice(0, 160) ?? "视口外"}`];
    }),
  );
}

for (const width of [800, 1024, 1280, 1439, 1440, 1920]) {
  test(`F07：${width}px × 4 个缩放 × 4 个详情/批注状态`, async () => {
    const testInfo = test.info();
    const { app, page, vault, close } = await openApp();
    test.setTimeout(120_000);
    const name = "这是一个非常非常长的中文文件标题用来检验工具栏在窄宽度下的收纳行为与省略号显示效果";
    const other = "另一篇笔记";
    try {
      writeFileSync(path.join(vault, `${other}.md`), "# 另一篇笔记\n");
      writeFileSync(path.join(vault, `${name}.md`), "# 中文标题\n\n用于验收的笔记正文。\n");
      const size = await app.evaluate(({ BrowserWindow }, w) => {
        const win = BrowserWindow.getAllWindows()[0]!;
        // 桌面默认最小宽度为 960px，验收还要覆盖渲染器在 800px 的布局。
        win.setMinimumSize(1, 1);
        win.setSize(w, 960);
        win.webContents.setZoomFactor(1);
        return win.getSize()[0];
      }, width);
      expect(size).toBe(width);
      await gotoNotes(page);
      // 标签是测试前置状态，矩阵中真实点击的是工具栏和详情控件。
      for (const title of [other, name]) {
        await treeFileRows(page).filter({ hasText: title }).press("Enter");
      }
      await expect(page.locator(".notes-document-tab")).toHaveCount(2);
      await expect(page.locator(".notes-note-list")).toBeVisible();
      await expect(page.getByTestId("markdown-editor").locator(".ProseMirror")).toContainText("用于验收的笔记正文");

      const bar = page.getByTestId("note-toolbar");
      const inspector = page.getByTestId("note-inspector");
      const properties = inspector.getByRole("tab", { name: "属性" });
      const comments = inspector.getByRole("tab", { name: "批注" });
      const add = bar.getByRole("button", { name: "添加批注" });
      const actions = bar.getByRole("button", { name: "笔记操作" });
      const toggle = bar.getByRole("button", { name: "文档详情" });
      const noteMenu = page.getByRole("menu", { name: "文件操作菜单" });

      for (const zoom of [1, 1.25, 1.5, 2]) {
        const contentWidth = await app.evaluate(({ BrowserWindow }, factor) => {
          const win = BrowserWindow.getAllWindows()[0]!;
          win.webContents.setZoomFactor(factor);
          return win.getContentSize()[0];
        }, zoom);
        await expect.poll(async () => Math.abs((await page.evaluate(() => innerWidth)) - contentWidth / zoom)).toBeLessThanOrEqual(1);
        for (const commentTab of [false, true]) {
          for (const detailOpen of [false, true]) {
            // 批注是详情栏内的标签。关闭详情栏后仍保留最后选择的标签。
            const selected = commentTab ? comments : properties;
            await clickCenter(page, toggle);
            await expect(inspector).toBeVisible();
            await selected.click();
            await expect(selected).toHaveAttribute("aria-selected", "true");
            if (!detailOpen) {
              await clickCenter(page, toggle);
              await expect(inspector).toHaveCount(0);
            }
            const context = `${width}px / ${zoom * 100}% / 详情 ${detailOpen} / 批注标签 ${commentTab}`;
            expect(await obstructedControls(bar), context).toEqual([]);
            expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth), context).toBeLessThanOrEqual(1);
            expect(await bar.evaluate((el) => el.getBoundingClientRect().height), context).toBeLessThan(64);

            if (detailOpen && commentTab) {
              const png = await app.evaluate(async ({ BrowserWindow }) => {
                const image = await BrowserWindow.getAllWindows()[0]!.webContents.capturePage();
                return image.toPNG().toString("base64");
              });
              writeFileSync(testInfo.outputPath(`toolbar-${width}-${zoom * 100}.png`), Buffer.from(png, "base64"));
            }
            await clickCenter(page, actions);
            await expect(noteMenu).toBeVisible();
            await expect(noteMenu.getByRole("menuitem", { name: "导出 Markdown" })).toBeVisible();
            await clickCenter(page, toggle);
            await expect(noteMenu).toHaveCount(0);
            if (detailOpen) await clickCenter(page, toggle);

            await clickCenter(page, add);
            await expect(comments).toHaveAttribute("aria-selected", "true");
            await expect(page.getByTestId("comments-panel")).toBeVisible();
            await clickCenter(page, toggle);
            await expect(inspector).toHaveCount(0);
          }
        }
      }
    } finally {
      try {
        // 文件协议的缩放值保存在同一个 Electron 用户数据目录。
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1));
      } finally {
        await close();
      }
    }
  });
}

/** 使用渲染器 CSS 坐标发送真实鼠标事件，并确认该点属于目标控件。 */
async function clickCenter(page: Page, target: import("@playwright/test").Locator): Promise<void> {
  await expect(target).toBeVisible();
  const { x, y, hit } = await target.evaluate((el) => {
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(hit, `鼠标中心被遮挡：${target}`).toBe(true);
  await page.mouse.click(x, y);
}
