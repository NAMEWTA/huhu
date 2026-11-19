import { expect, test, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

const filename = "聚焦选区.md";
const selected = "需要注释";

type EditorView = {
  state: {
    doc: { textBetween(from: number, to: number): string };
    selection: { from: number; to: number; empty: boolean };
  };
  hasFocus(): boolean;
  domSelectionRange(): unknown;
  domObserver: { currentSelection: { eq(selection: unknown): boolean } };
};

async function holdFocusTimer(editor: Locator) {
  return editor.evaluateHandle((dom, expected) => {
    const view = (dom as HTMLElement & { editor: { view: EditorView } }).editor.view;
    const readSelection = () => ({
      dom: window.getSelection()?.toString(),
      model: view.state.doc.textBetween(view.state.selection.from, view.state.selection.to),
      empty: view.state.selection.empty,
      focused: view.hasFocus(),
      cached: view.domObserver.currentSelection.eq(view.domSelectionRange()),
    });
    const probe = {
      held: false,
      before: null as ReturnType<typeof readSelection> | null,
      after: null as ReturnType<typeof readSelection> | null,
      readSelection,
    };
    let runFocusTimer: (() => void) | undefined;
    const browser: Window = window;
    const setTimeout = browser.setTimeout;
    dom.addEventListener(
      "focus",
      () => {
        browser.setTimeout = (callback, delay, ...args) => {
          if (delay === 20 && typeof callback === "function" && !runFocusTimer) {
            runFocusTimer = () => callback(...args);
            probe.held = true;
            return 0;
          }
          return setTimeout(callback, delay, ...args);
        };
      },
      { capture: true, once: true },
    );
    dom.addEventListener(
      "focus",
      () => {
        browser.setTimeout = setTimeout;
      },
      { once: true },
    );

    // 在 PM 的 selectionchange 监听器读取原生选区前，放行暂存的原回调。
    const runBeforeObserver = () => {
      if (!runFocusTimer || window.getSelection()?.toString() !== expected) return;
      document.removeEventListener("selectionchange", runBeforeObserver, true);
      probe.before = readSelection();
      runFocusTimer();
      probe.after = readSelection();
    };
    document.addEventListener("selectionchange", runBeforeObserver, true);
    return probe;
  }, selected);
}

for (const input of ["键盘扩选", "快速拖选"] as const) {
  test(`B06：初次聚焦后${input}保留完整选区并显示气泡`, async () => {
    const { page, vault, close } = await openApp();
    try {
      writeFileSync(path.join(vault, filename), `前置正文\n\n${selected}\n\n后续正文\n`);
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
      await page.getByRole("button", { name: "知识库" }).first().click();
      await treeSettled(page);
      await treeItem(page, filename).click();
      const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
      const paragraph = editor.getByText(selected, { exact: true });
      await expect(paragraph).toBeVisible();
      await editor.evaluate((dom) => (dom as HTMLElement).blur());
      const probe = await holdFocusTimer(editor);

      if (input === "键盘扩选") {
        await paragraph.click();
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
      } else {
        const { left, right, y } = await paragraph.evaluate((dom) => {
          const range = document.createRange();
          range.selectNodeContents(dom);
          const { left, right, top, height } = range.getBoundingClientRect();
          return { left: left + 1, right: right - 1, y: top + height / 2 };
        });
        await page.mouse.move(left, y);
        await page.mouse.down();
        await page.mouse.move(right, y);
        await page.mouse.up();
      }

      expect(await probe.evaluate((value) => value.held), "已捕获编辑器聚焦回调").toBe(true);
      await expect.poll(() => probe.evaluate((value) => value.before), { message: "原生选区已形成，PM 尚未读取" }).toMatchObject({ dom: selected, empty: true, focused: true, cached: false });
      const after = await probe.evaluate((value) => value.after);
      await expect(page.getByTestId("bubble-menu-bar"), `聚焦回调返回后的选区 ${JSON.stringify(after)}`).toBeVisible();
      await expect(page.getByTestId("footnote-bubble-button")).toBeVisible();
      expect(after).toMatchObject({ dom: selected, model: selected });
      expect(await probe.evaluate((value) => value.readSelection())).toMatchObject({ dom: selected, model: selected });
    } finally {
      await close();
    }
  });
}
