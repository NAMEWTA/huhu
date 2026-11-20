import { expect, test, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

const filename = "聚焦选区.md";
const selected = "需要注释";
const prefix = "前置正文";
const start = prefix.length + 3;
const end = start + selected.length;

type EditorView = {
  state: {
    doc: { textBetween(from: number, to: number): string };
    selection: { from: number; to: number; empty: boolean };
  };
  input: { lastFocus: number; lastTouch: number; lastClick: { time: number } };
  composing: boolean;
  isDestroyed: boolean;
  hasFocus(): boolean;
  domSelectionRange(): unknown;
  domObserver: { flush(): void; currentSelection: { eq(selection: unknown): boolean } };
};

async function openFocusFixture() {
  const app = await openApp();
  const { page, vault, close } = app;
  try {
    writeFileSync(path.join(vault, filename), `${prefix}\n\n${selected}\n\n后续正文\n`);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeSettled(page);
    await treeItem(page, filename).click();
    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror");
    const paragraph = editor.getByText(selected, { exact: true });
    await expect(paragraph).toBeVisible();
    return { page, close, editor, paragraph };
  } catch (error) {
    await close();
    throw error;
  }
}

async function paragraphEnd(paragraph: Locator) {
  return paragraph.evaluate((dom) => {
    const range = document.createRange();
    range.selectNodeContents(dom);
    const { right, top, height } = range.getBoundingClientRect();
    return { x: right - 0.5, y: top + height / 2 };
  });
}

async function holdFocusTimer(editor: Locator, releaseOn: "range" | "home" | "manual" = "range", expected = selected) {
  return editor.evaluateHandle(
    (dom, { expected, releaseOn }) => {
      const view = (dom as HTMLElement & { editor: { view: EditorView } }).editor.view;
      const readSelection = () => {
        const selection = window.getSelection();
        const { from, to, empty } = view.state.selection;
        return {
          dom: selection?.toString(),
          domNode: selection?.anchorNode?.textContent,
          offset: selection?.anchorOffset,
          collapsed: selection?.isCollapsed,
          model: view.state.doc.textBetween(from, to),
          from,
          to,
          empty,
          focused: view.hasFocus(),
          cached: view.domObserver.currentSelection.eq(view.domSelectionRange()),
          composing: view.composing,
          destroyed: view.isDestroyed,
          focusAge: view.input.lastFocus ? Date.now() - view.input.lastFocus : null,
          pointerAge: Date.now() - Math.max(view.input.lastClick.time, view.input.lastTouch),
        };
      };
      const listeners = new AbortController();
      const probe = {
        held: false,
        before: null as ReturnType<typeof readSelection> | null,
        after: null as ReturnType<typeof readSelection> | null,
        flushes: 0,
        readSelection,
        stageDocumentStartReset() {
          const { flush } = view.domObserver;
          // 把本次观察器处理推迟到真实 Home 的默认动作完成之后。
          view.domObserver.flush = () => {};
          const selection = window.getSelection()!;
          selection.collapse(selection.anchorNode, 0);
          const node = selection.anchorNode;
          const staged = readSelection();
          const steps = { staged, beforeKey: null as ReturnType<typeof readSelection> | null, unchanged: false };
          const keys = new AbortController();
          const options = { capture: true, signal: keys.signal };
          document.addEventListener(
            "keydown",
            (event) => {
              if (event.isTrusted && event.key === "Home") steps.beforeKey = readSelection();
            },
            options,
          );
          document.addEventListener(
            "keyup",
            (event) => {
              if (!event.isTrusted || event.key !== "Home") return;
              keys.abort();
              view.domObserver.flush = flush;
              steps.unchanged = selection.isCollapsed && selection.anchorNode === node && selection.anchorOffset === 0;
              if (runFocusTimer) {
                probe.release();
              } else {
                probe.before = readSelection();
                view.domObserver.flush();
                probe.after = readSelection();
              }
            },
            options,
          );
          return steps;
        },
        simulateDocumentStartReset() {
          const selection = window.getSelection()!;
          selection.collapse(selection.anchorNode, 0);
          const before = readSelection();
          view.domObserver.flush();
          return { before, after: readSelection() };
        },
        release() {
          if (!runFocusTimer) throw new Error("聚焦回调尚未捕获");
          listeners.abort();
          probe.before = readSelection();
          const callback = runFocusTimer;
          runFocusTimer = undefined;
          const { flush } = view.domObserver;
          view.domObserver.flush = function () {
            probe.flushes++;
            flush.call(this);
          };
          try {
            callback();
          } finally {
            view.domObserver.flush = flush;
          }
          probe.after = readSelection();
        },
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

      const capture = { capture: true, signal: listeners.signal };
      if (releaseOn === "range") {
        // 先于 PM 的 selectionchange 监听器放行回调。
        document.addEventListener(
          "selectionchange",
          () => {
            if (runFocusTimer && window.getSelection()?.toString() === expected) probe.release();
          },
          capture,
        );
      } else if (releaseOn === "home") {
        let pressedHome = false;
        const releaseAtStart = () => {
          const selection = window.getSelection();
          if (runFocusTimer && pressedHome && selection?.isCollapsed && selection.anchorOffset === 0 && selection.anchorNode?.textContent === expected) probe.release();
        };
        dom.addEventListener(
          "keydown",
          (event) => {
            if (event.isTrusted && (event as KeyboardEvent).key === "Home") pressedHome = true;
          },
          capture,
        );
        dom.addEventListener("keyup", releaseAtStart, capture);
        document.addEventListener("selectionchange", releaseAtStart, capture);
      }
      return probe;
    },
    { expected, releaseOn },
  );
}

test("B06：聚焦后 Home 保留折叠段首，接着 Shift+End 选中整段", async () => {
  const { page, close, editor, paragraph } = await openFocusFixture();
  try {
    await editor.evaluate((dom) => (dom as HTMLElement).blur());
    const probe = await holdFocusTimer(editor, "home");
    const { x, y } = await paragraphEnd(paragraph);
    await page.mouse.click(x, y);
    await expect.poll(() => probe.evaluate((value) => value.readSelection())).toMatchObject({ offset: selected.length, from: end, to: end, focused: true });
    await page.keyboard.press("Home");
    await expect.poll(() => probe.evaluate((value) => value.before)).toMatchObject({ domNode: selected, offset: 0, collapsed: true, from: end, to: end, focused: true, cached: false });
    expect(await probe.evaluate((value) => value.after)).toMatchObject({ domNode: selected, offset: 0, collapsed: true, from: start, to: start, focused: true });
    await page.keyboard.press("Shift+End");
    await expect.poll(() => probe.evaluate((value) => value.readSelection())).toMatchObject({ dom: selected, model: selected, from: start, to: end });
    await expect(page.getByTestId("bubble-menu-bar")).toBeVisible();
  } finally {
    await close();
  }
});

const documentStartCases = [
  { title: "Home 与聚焦回调同时发生时保留文档起点", key: "Home", timerFirst: false },
  { title: "Ctrl+Home 与聚焦回调同时发生时保留文档起点", key: "Control+Home", timerFirst: false },
  { title: "聚焦回调结束后，观察器保留 Ctrl+Home 到达的文档起点", key: "Control+Home", timerFirst: true },
  { title: "无导航时，观察器把浏览器复位的光标恢复到首段末尾", key: null, timerFirst: false },
  { title: "浏览器先复位，Home 仍确认文档起点", key: "Home", timerFirst: false, resetFirst: true },
  { title: "浏览器先复位，Ctrl+Home 仍确认文档起点", key: "Control+Home", timerFirst: false, resetFirst: true },
  { title: "回调已结束且浏览器先复位，Ctrl+Home 仍确认文档起点", key: "Control+Home", timerFirst: true, resetFirst: true },
] as const;

for (const scenario of documentStartCases) {
  const { title, key, timerFirst } = scenario;
  const resetFirst = "resetFirst" in scenario;
  test(`B06：Shift+Tab 重新聚焦后，${title}`, async () => {
    const { page, close, editor } = await openFocusFixture();
    try {
      const first = editor.getByText(prefix, { exact: true });
      const { x, y } = await paragraphEnd(first);
      const firstEnd = prefix.length + 1;
      await page.mouse.click(x, y);
      await expect
        .poll(() =>
          editor.evaluate((dom) => {
            const view = (dom as HTMLElement & { editor: { view: EditorView } }).editor.view;
            return { from: view.state.selection.from, offset: window.getSelection()?.anchorOffset };
          }),
        )
        .toEqual({ from: firstEnd, offset: prefix.length });
      // 编辑器有焦点时会消化 Tab。先设置失焦，再用真实键盘回到编辑器。
      await editor.evaluate((dom) => (dom as HTMLElement).blur());
      await expect(editor).not.toBeFocused();
      // 固定 Date 时间以越过点击豁免期，并保持在重新聚焦后的 200 ms 内。
      // Chromium 仍生成真实键盘事件和 DOM 选区，探针只控制回调何时放行。
      const refocusTime = Date.now() + 310;
      await page.clock.setFixedTime(refocusTime);
      const probe = await holdFocusTimer(editor, key && !timerFirst && !resetFirst ? "home" : "manual", prefix);
      await page.keyboard.press("Shift+Tab");
      const atEnd = { domNode: prefix, offset: prefix.length, collapsed: true, from: firstEnd, to: firstEnd, focused: true };
      const atStart = { ...atEnd, offset: 0, from: 1, to: 1 };
      expect(await probe.evaluate((value) => ({ held: value.held, selection: value.readSelection() }))).toMatchObject({ held: true, selection: atEnd });
      await page.clock.setFixedTime(refocusTime + (timerFirst ? 25 : 12));

      if (key === null) {
        const timing = await probe.evaluate((value) => value.simulateDocumentStartReset());
        expect(timing.before).toMatchObject({ ...atEnd, offset: 0, cached: false });
        expect(timing.before.focusAge).toBeLessThan(200);
        expect(timing.before.pointerAge).toBeGreaterThanOrEqual(300);
        expect(timing.after, JSON.stringify(timing)).toMatchObject({ ...atEnd, focusAge: null });
        await probe.evaluate((value) => value.release());
        expect(await probe.evaluate((value) => value.readSelection())).toMatchObject(atEnd);
        await test.info().attach("观察器恢复光标", { body: JSON.stringify(timing), contentType: "application/json" });
        return;
      }

      if (timerFirst) {
        await probe.evaluate((value) => value.release());
        expect(await probe.evaluate((value) => value.after)).toMatchObject(atEnd);
      }
      const reset = resetFirst ? await probe.evaluateHandle((value) => value.stageDocumentStartReset()) : null;
      await page.keyboard.press(key);
      if (reset) {
        const steps = await reset.jsonValue();
        const timing = await probe.evaluate(({ before, after }) => ({ before, after }));
        const evidence = { steps, ...timing };
        const beforeFlush = { ...atEnd, offset: 0, cached: false };
        expect(steps).toMatchObject({ staged: beforeFlush, beforeKey: beforeFlush, unchanged: true });
        expect(timing.before).toMatchObject(beforeFlush);
        expect(timing.before?.focusAge).toBeLessThan(200);
        expect(timing.before?.pointerAge).toBeGreaterThanOrEqual(300);
        await test.info().attach("浏览器先复位后导航", { body: JSON.stringify(evidence), contentType: "application/json" });
        expect(timing.after, JSON.stringify(evidence)).toMatchObject(atStart);
      } else if (!timerFirst) {
        await expect.poll(() => probe.evaluate((value) => value.before)).toMatchObject({ ...atEnd, offset: 0, cached: false });
        const timing = await probe.evaluate(({ before, after, flushes }) => ({ before, after, flushes }));
        expect(timing.before?.focusAge).toBeLessThan(200);
        expect(timing.before?.pointerAge).toBeGreaterThanOrEqual(300);
        expect(timing.after, JSON.stringify(timing)).toMatchObject(atStart);
        expect(timing.flushes).toBe(1);
        await test.info().attach("聚焦回调与原生导航", { body: JSON.stringify(timing), contentType: "application/json" });
      }
      await expect.poll(() => probe.evaluate((value) => value.readSelection())).toMatchObject(atStart);
      if (timerFirst) {
        const observation = await probe.evaluate((value) => value.readSelection());
        expect(observation.focusAge).toBeLessThan(200);
        expect(observation.pointerAge).toBeGreaterThanOrEqual(300);
        await test.info().attach("聚焦回调结束后的选区", { body: JSON.stringify(observation), contentType: "application/json" });
      }
      await page.keyboard.press("Shift+End");
      await expect.poll(() => probe.evaluate((value) => value.readSelection())).toMatchObject({ dom: prefix, model: prefix, from: 1, to: firstEnd });
    } finally {
      await close();
    }
  });
}

test("B06：重新聚焦时，旧按键记录不影响原光标恢复", async () => {
  const { page, close, editor, paragraph } = await openFocusFixture();
  try {
    const { x, y } = await paragraphEnd(paragraph);
    await page.mouse.click(x, y);
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await expect
      .poll(() =>
        editor.evaluate((dom) => {
          const { from, to } = (dom as HTMLElement & { editor: { view: EditorView } }).editor.view.state.selection;
          return { from, to, offset: window.getSelection()?.anchorOffset };
        }),
      )
      .toEqual({ from: end, to: end, offset: selected.length });
    await editor.evaluate((dom) => (dom as HTMLElement).blur());
    const probe = await holdFocusTimer(editor, "manual");
    await editor.focus();
    const result = await probe.evaluate((value) => {
      // 模拟浏览器在本次恢复焦点时把 DOM 光标复位到段首。
      const selection = window.getSelection()!;
      selection.collapse(selection.anchorNode, 0);
      value.release();
      return { before: value.before, after: value.after, flushes: value.flushes };
    });
    expect(result.before).toMatchObject({ domNode: selected, offset: 0, collapsed: true, from: end, to: end, focused: true, cached: false });
    expect(result.after).toMatchObject({ domNode: selected, offset: selected.length, collapsed: true, from: end, to: end, focused: true });
    expect(result.flushes).toBe(0);
  } finally {
    await close();
  }
});

test("B06：IME 组合期间，聚焦回调不强制读取光标", async () => {
  const { page, close, editor, paragraph } = await openFocusFixture();
  try {
    await editor.evaluate((dom) => (dom as HTMLElement).blur());
    const probe = await holdFocusTimer(editor, "manual");
    const { x, y } = await paragraphEnd(paragraph);
    await page.mouse.click(x, y);
    await expect.poll(() => probe.evaluate((value) => value.readSelection())).toMatchObject({ offset: selected.length, from: end, to: end });
    await page.keyboard.press("Home");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "ni", selectionStart: 2, selectionEnd: 2 });
    await expect(editor).toContainText("ni");
    const result = await probe.evaluate((value) => {
      const selection = window.getSelection()!;
      selection.collapse(selection.anchorNode, 0);
      value.release();
      return { before: value.before, flushes: value.flushes };
    });
    expect(result.before).toMatchObject({ composing: true, focused: true, collapsed: true, cached: false });
    expect(result.flushes).toBe(0);
    await cdp.send("Input.insertText", { text: "你" });
    await expect(editor).toContainText("你");
  } finally {
    await close();
  }
});

test("B06：视图销毁后，暂存的聚焦回调可安全结束", async () => {
  const { close, editor } = await openFocusFixture();
  try {
    await editor.evaluate((dom) => (dom as HTMLElement).blur());
    const probe = await holdFocusTimer(editor, "manual");
    await editor.focus();
    await editor.evaluate((dom) => (dom as HTMLElement & { editor: { destroy(): void } }).editor.destroy());
    const result = await probe.evaluate((value) => {
      value.release();
      return { before: value.before, after: value.after, flushes: value.flushes };
    });
    expect(result.before).toMatchObject({ destroyed: true });
    expect(result.after).toMatchObject({ destroyed: true });
    expect(result.flushes).toBe(0);
  } finally {
    await close();
  }
});

for (const input of ["键盘扩选", "快速拖选"] as const) {
  test(`B06：初次聚焦后${input}保留完整选区并显示气泡`, async () => {
    const { page, close, editor, paragraph } = await openFocusFixture();
    try {
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
