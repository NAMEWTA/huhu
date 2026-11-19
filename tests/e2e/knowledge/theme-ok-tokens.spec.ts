import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

async function auditColors(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, string>();
    const normalize = (value: string) => {
      if (!CSS.supports("color", value)) return "";
      let result = cache.get(value);
      if (result === undefined) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const rgba = context.getImageData(0, 0, 1, 1).data;
        result = rgba[3] === 0 ? "transparent" : rgba.join(",");
        cache.set(value, result);
      }
      return result;
    };
    const appTheme = getComputedStyle(document.documentElement);
    const palette = new Set([...appTheme].filter((name) => name.startsWith("--")).map((name) => normalize(appTheme.getPropertyValue(name).trim())));
    palette.add("transparent");
    const properties = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color", "text-decoration-color", "fill", "stroke", "caret-color"];
    // Tailwind opacity utilities intentionally mix a single semantic token with transparency.
    const derived = new Map([
      [normalize(`color-mix(in oklab, ${appTheme.getPropertyValue("--muted")} 5%, transparent)`), "--muted / 5%"],
      [normalize(`color-mix(in oklab, ${appTheme.getPropertyValue("--muted")} 60%, transparent)`), "--muted / 60%"],
      [normalize(`color-mix(in oklab, ${appTheme.getPropertyValue("--focus")} 50%, transparent)`), "--focus / 50%"],
      [normalize(`color-mix(in srgb, ${appTheme.getPropertyValue("--text")} 80%, transparent)`), "--text / 80% (tree icon)"],
    ]);
    const explained = new Set<string>();
    const residual = new Map<string, { count: number; examples: string[] }>();
    let elements = 0;
    const descendants = new Set<Element>();
    function collect(node: Element) {
      descendants.add(node);
      for (const child of node.children) collect(child);
      for (const child of node.shadowRoot?.children ?? []) collect(child);
    }
    for (const root of document.querySelectorAll(".ok-root, .notes-inspector")) collect(root);

    // The file tree's shadow stylesheet has a short color transition for Options.
    // Wait for the stable color before comparing it with the palette.
    const transitions = [...descendants].flatMap((node) => node.getAnimations().filter((animation) => animation instanceof CSSTransition));
    await Promise.allSettled(transitions.map((animation) => animation.finished));

    for (const node of descendants) {
      if (!node.getClientRects().length) continue;
      elements++;
      const pseudos = ["", "::before", "::after"];
      if (node.matches("input[placeholder], textarea[placeholder]")) pseudos.push("::placeholder");
      for (const pseudo of pseudos) {
        const computed = getComputedStyle(node, pseudo || null);
        if ((pseudo === "::before" || pseudo === "::after") && ["none", "normal"].includes(computed.content)) continue;
        for (const property of properties) {
          if ((property === "fill" || property === "stroke") && !(node instanceof SVGElement)) continue;
          if (property.startsWith("border-") && pseudo !== "::placeholder" && computed.getPropertyValue(property.replace("-color", "-style")) === "none") continue;
          if (property === "outline-color" && computed.outlineStyle === "none") continue;
          const value = computed.getPropertyValue(property);
          const color = normalize(value);
          if (!color || palette.has(color)) continue;
          const key = `${property} ${value}`;
          const source = derived.get(color);
          if (source) {
            explained.add(`${key} ← ${source}`);
            continue;
          }
          const record = residual.get(key) ?? { count: 0, examples: [] };
          const example = `${node.tagName.toLowerCase()}${node.id ? "#" + node.id : ""} ${node.getAttribute("class") || node.getAttribute("aria-label") || ""}${pseudo}`.trim();
          record.count++;
          if (!record.examples.includes(example) && record.examples.length < 4) record.examples.push(example);
          residual.set(key, record);
        }
      }
    }
    return { elements, explained: [...explained].sort(), colors: [...residual].sort(([a], [b]) => a.localeCompare(b)) };
  });
}

test("F08：四主题的明暗色、紧凑与减少动效", async () => {
  const testInfo = test.info();
  test.setTimeout(120_000);
  const { app, page, vault, close } = await openApp();
  const result: Record<string, Record<string, Awaited<ReturnType<typeof auditColors>>>> = {};
  try {
    writeFileSync(path.join(vault, "主题样本.md"), "# 主题样本\n\n这是一段**文字**，带有 `代码` 和 [链接](https://example.com)。\n\n> 引用\n\n- [ ] 待办\n");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1520, 900));
    const versions = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome }));
    console.log(JSON.stringify(versions));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    const settings = page.getByRole("button", { name: "设置", exact: true }).first();
    const notes = page.getByRole("button", { name: "知识库", exact: true }).first();
    const root = page.locator("html");
    for (const theme of ["claude", "apple", "notion", "vercel"]) {
      for (const mode of ["浅色", "深色"]) {
        const id = `${theme}-${mode === "浅色" ? "light" : "dark"}`;
        await settings.click();
        await page.getByTestId("settings-nav-appearance").click();
        await page.getByTestId(`theme-${theme}`).click();
        await page.getByRole("tab", { name: mode }).click();
        const compact = page.getByRole("switch", { name: "紧凑显示" });
        if ((await compact.getAttribute("aria-checked")) === "false") await compact.click();
        await page.getByRole("tab", { name: "减少" }).click();
        await expect(root).toHaveAttribute("data-theme", theme);
        await expect(root).toHaveAttribute("data-mode", id.split("-")[1]!);
        await expect(root).toHaveAttribute("data-density", "compact");
        await expect(root).toHaveAttribute("data-motion", "reduced");
        await notes.click();
        await treeSettled(page);
        const file = treeItem(page, "主题样本");
        await file.click();
        await expect(page.getByTestId("markdown-editor").locator(".ProseMirror")).toContainText("主题样本");
        const detail = page.getByTestId("note-inspector");
        if (!(await detail.isVisible())) await page.getByTestId("note-toolbar").getByRole("button", { name: "文档详情" }).click();
        await detail.getByRole("tab", { name: "属性", exact: true }).click();
        await expect(detail.getByText("基本属性")).toBeVisible();
        await expect(detail).toHaveCSS("animation-name", "none");
        await page.screenshot({ path: testInfo.outputPath(`${id}.png`), animations: "disabled" });
        const properties = await auditColors(page);
        await detail.getByRole("tab", { name: "批注" }).click();
        await expect(page.getByTestId("comments-panel")).toBeVisible();
        const comments = await auditColors(page);
        await file.click({ button: "right" });
        await expect(page.getByRole("menu").last()).toBeVisible();
        const treeMenu = await auditColors(page);
        await page.keyboard.press("Escape");
        result[id] = { properties, comments, treeMenu };
      }
    }
  } finally {
    await testInfo.attach("computed-colors", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    await close();
  }
  expect(Object.keys(result)).toHaveLength(8);
  expect(Object.values(result).flatMap((screens) => Object.values(screens).flatMap(({ colors }) => colors.map(([key]) => key)))).toEqual([]);
});
