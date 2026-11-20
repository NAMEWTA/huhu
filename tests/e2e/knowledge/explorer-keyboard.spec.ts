import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeSettled } from "../helpers/tree.js";

async function openTree(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
}

test("A06 行内、右键与 Shift+F10 的目标一致，方向键和 Enter 可操作边缘菜单", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setSize(1000, 720);
      window.webContents.setZoomFactor(1);
    });
    const name = "项目-35.md";
    for (let i = 0; i < 35; i++) writeFileSync(path.join(vault, `项目-${i.toString().padStart(2, "0")}.md`), "正文\n");
    writeFileSync(path.join(vault, name), "底部正文\n");
    await openTree(page);
    const root = page.getByTestId("notes-resource-tree");
    const first = treeItem(page, "项目-00.md");
    await first.focus();
    await first.press("End");
    const row = treeItem(page, name);
    await expect(row).toBeFocused();
    const menu = page.getByRole("menu").first();
    const relative = page.getByRole("menuitem", { name: "相对路径", exact: true });
    const copyPath = page.getByRole("menuitem", { name: "复制路径", exact: true });
    const checkBounds = async () => {
      await expect
        .poll(() =>
          menu.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1;
          }),
        )
        .toBe(true);
    };
    const copied = () => app.evaluate(({ clipboard }) => clipboard.readText());
    const resetClipboard = () => app.evaluate(({ clipboard }) => clipboard.clear());
    await resetClipboard();
    await row.press("Shift+F10");
    await expect(menu).toBeVisible();
    await checkBounds();
    for (let step = 0; step < 15 && !(await copyPath.evaluate((item) => item.matches(":focus"))); step++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(copyPath).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(relative).toBeVisible();
    await page.keyboard.press("End");
    await expect(relative).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(copied).toBe(name);

    await resetClipboard();
    await row.click({ button: "right", position: { x: (await row.boundingBox())!.width - 38, y: 10 } });
    await expect(menu).toBeVisible();
    await checkBounds();
    await copyPath.hover();
    await relative.click();
    await expect.poll(copied).toBe(name);

    await resetClipboard();
    await row.hover();
    await root.getByRole("button", { name: "文件操作选项" }).click();
    await expect(menu).toBeVisible();
    await copyPath.hover();
    await relative.click();
    await expect.poll(copied).toBe(name);
    await row.press("Shift+F10");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(row).toBeFocused();
  } finally {
    await close();
  }
});

test("A06/A10：三种入口显示同一限制，右键保留多选，空白菜单在根创建", async () => {
  const { page, vault, close } = await openApp();
  try {
    const protectedDir = path.join(vault, ".agents");
    mkdirSync(protectedDir, { recursive: true });
    writeFileSync(path.join(protectedDir, "仅元信息.md"), "Markdown 内容不能进入编辑器");
    writeFileSync(path.join(protectedDir, "仅元信息.txt"), "文本内容不能进入编辑器");
    for (const name of ["甲.md", "乙.md"]) writeFileSync(path.join(vault, name), "保留原字节");
    await openTree(page);
    await treeSettled(page);
    const folder = page.getByTestId("notes-resource-tree").locator('[data-item-path=".agents/"]');
    const reason = "受保护的资源，仅可查看元信息";
    await expect(folder).toHaveAttribute("data-file-restriction", reason);
    await folder.click();
    const protectedMarkdown = treeItem(page, "仅元信息.md");
    const protectedText = treeItem(page, "仅元信息.txt");
    for (const row of [protectedMarkdown, protectedText]) {
      await expect(row).toHaveAttribute("data-file-restriction", reason);
      await row.click();
      await expect(page.getByTestId("file-card")).toHaveAttribute("data-viewer", "protected");
      await expect(page.getByTestId("file-card")).toContainText("受保护的文件仅显示元信息");
      await expect(page.locator(".ProseMirror,.cm-content")).toHaveCount(0);
    }
    for (const open of [
      () => protectedMarkdown.click({ button: "right" }),
      async () => {
        await protectedMarkdown.hover();
        await page.getByTestId("notes-resource-tree").getByRole("button", { name: "文件操作选项" }).click();
      },
      () => protectedMarkdown.press("Shift+F10"),
    ]) {
      await open();
      await expect(page.getByTestId("file-tree-restriction-reason")).toHaveText(reason);
      await expect(page.getByRole("menuitem", { name: `重命名：${reason}` })).toBeDisabled();
      await page.keyboard.press("Escape");
    }

    const a = treeItem(page, "甲.md");
    const b = treeItem(page, "乙.md");
    await a.click();
    await b.click({ modifiers: ["ControlOrMeta"] });
    await expect(a).toHaveAttribute("data-item-selected", "true");
    await expect(b).toHaveAttribute("data-item-selected", "true");
    await b.click({ button: "right" });
    await expect(a).toHaveAttribute("data-item-selected", "true");
    await expect(b).toHaveAttribute("data-item-selected", "true");
    await expect(page.getByRole("menuitem", { name: /2.*(项|个)/ }).last()).toBeVisible();
    await page.keyboard.press("Escape");

    const scroll = page.getByTestId("notes-resource-tree").locator("[data-file-tree-virtualized-scroll]");
    const point = await scroll.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.bottom - 10 };
    });
    await page.mouse.click(point.x, point.y, { button: "right" });
    const menu = page.getByTestId("file-tree-root-menu");
    await expect(menu).toBeVisible();
    const newFolder = menu.getByRole("menuitem", { name: "新建文件夹" });
    await newFolder.focus();
    await newFolder.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
    await expect(menu).toBeVisible();
    await newFolder.click();
    const rename = page.getByTestId("notes-resource-tree").locator("input:visible");
    await expect(rename).toBeFocused({ timeout: 15_000 });
    await rename.fill("根目录新建");
    await rename.press("Enter");
    await expect.poll(() => existsSync(path.join(vault, "根目录新建")), { timeout: 15_000 }).toBe(true);
    for (const name of ["甲.md", "乙.md"]) expect(readFileSync(path.join(vault, name), "utf8")).toBe("保留原字节");
  } finally {
    await close();
  }
});

test("A05：已挂载的树随外部 mkdir/rmdir 更新", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "基准.md"), "挂载时存在");
    await openTree(page);
    await expect(treeItem(page, "基准.md")).toBeVisible({ timeout: 30_000 });
    const externalDir = path.join(vault, "外部 空目录");
    const row = treeFolder(page, "外部 空目录");
    await expect(row).toHaveCount(0);
    mkdirSync(externalDir);
    await expect(row).toBeVisible({ timeout: 15_000 });
    rmdirSync(externalDir);
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await close();
  }
});

test("A07：非 Markdown 在树里复制、回收，并从回收站原样恢复", async () => {
  const { page, vault, close } = await openApp();
  const original = path.join(vault, "原始 数据.json");
  const copy = path.join(vault, "原始 数据 · 副本.json");
  const bytes = Buffer.from('\uFEFF{ "值": 42 }\r\n');
  try {
    writeFileSync(original, bytes);
    await openTree(page);
    await treeMenu(page, treeItem(page, "原始 数据.json"), "创建副本");
    await expect.poll(() => existsSync(copy)).toBe(true);
    expect(readFileSync(copy)).toEqual(bytes);
    const list = page.getByTestId("notes-resource-tree");
    await treeMenu(page, list.locator('[data-item-path="原始 数据 · 副本.json"]'), /删除|移到/);
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /删除|移到/ }).click();
    await expect.poll(() => existsSync(copy)).toBe(false);
    await page.getByTestId("notes-section-trash").click();
    await page.getByRole("button", { name: "恢复笔记", exact: true }).click();
    await expect.poll(() => existsSync(copy)).toBe(true);
    expect(readFileSync(copy)).toEqual(bytes);
    expect(readFileSync(original)).toEqual(bytes);
  } finally {
    await close();
  }
});

test("A07 拖到 Pierre 树空白处回到根目录，重名和移入自身保留原文件", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "目录", "子目录"), { recursive: true });
    writeFileSync(path.join(vault, "目录", "待移.txt"), "原始附件");
    writeFileSync(path.join(vault, "目录", "子目录", "占位.md"), "原有子文件\n");
    writeFileSync(path.join(vault, "重名.md"), "根目录源\n");
    writeFileSync(path.join(vault, "目录", "重名.md"), "子目录原文件\n");
    await openTree(page);
    const folder = treeFolder(page, "目录").and(page.locator('[data-item-path="目录/"]'));
    await folder.click();
    const file = treeItem(page, "待移.txt");
    await expect(file).toBeVisible();
    await treeSettled(page);
    const root = page.locator('[data-testid="notes-resource-tree"] [data-file-tree-virtualized-root]');
    const scroll = root.locator("[data-file-tree-virtualized-scroll]");
    const point = await scroll.evaluate((tree) => {
      const rect = tree.getBoundingClientRect();
      const shadow = tree.getRootNode() as ShadowRoot;
      const x = Math.round(rect.left + rect.width / 2);
      for (let y = Math.min(Math.floor(rect.bottom) - 4, innerHeight - 4); y > rect.top; y -= 4) {
        const hit = shadow.elementFromPoint(x, y);
        if (hit && tree.contains(hit) && !hit.closest("[data-item-path]")) return { x, y };
      }
      return null;
    });
    expect(point, "树视口应有可命中的空白区").not.toBeNull();
    const data = await page.evaluateHandle(() => new DataTransfer());
    try {
      await file.dispatchEvent("dragstart", { dataTransfer: data });
      await scroll.dispatchEvent("dragover", { dataTransfer: data, clientX: point!.x, clientY: point!.y });
      await expect(root).toHaveAttribute("data-file-tree-root-drag-target", "true");
      await scroll.dispatchEvent("drop", { dataTransfer: data, clientX: point!.x, clientY: point!.y });
    } finally {
      await data.dispose();
    }
    await expect.poll(() => existsSync(path.join(vault, "待移.txt"))).toBe(true);
    expect(readFileSync(path.join(vault, "待移.txt"), "utf8")).toBe("原始附件");
    expect(existsSync(path.join(vault, "目录", "待移.txt"))).toBe(false);

    const rootDupe = page.locator('[data-testid="notes-resource-tree"] [data-item-path="重名.md"]');
    await treeMenu(page, rootDupe, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目录");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(readFileSync(path.join(vault, "重名.md"), "utf8")).toBe("根目录源\n");
    expect(readFileSync(path.join(vault, "目录", "重名.md"), "utf8")).toBe("子目录原文件\n");
    await page.getByRole("button", { name: "取消", exact: true }).click();

    await treeMenu(page, folder, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目录/子目录");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    expect(existsSync(path.join(vault, "目录", "子目录"))).toBe(true);
    expect(readFileSync(path.join(vault, "目录", "重名.md"), "utf8")).toBe("子目录原文件\n");
  } finally {
    await close();
  }
});
