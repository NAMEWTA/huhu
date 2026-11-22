import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

type EditorElement = HTMLElement & {
  editor?: { view: { state: { selection: { from: number; to: number; anchor: number; head: number } } } };
};

async function traceTextSelection(paragraph: Locator) {
  await paragraph.scrollIntoViewIfNeeded();
  return paragraph.evaluateHandle((element) => {
    const prose = element.closest<EditorElement>(".ProseMirror");
    const view = prose?.editor?.view;
    const text = element.firstChild;
    if (!view || !(text instanceof Text) || !text.data.startsWith("参考")) {
      throw new Error("找不到任务描述的可编辑文字或 ProseMirror 视图");
    }

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const { left, top, width, height } = range.getBoundingClientRect();
    const point = { x: left + width / 2, y: top + height / 2 };
    if (width <= 0 || height <= 0 || document.elementFromPoint(point.x, point.y) !== element) {
      throw new Error(`「参」字的点击点未命中段落 (${point.x}, ${point.y})`);
    }

    const describeNode = (node: Node | null | undefined) => node && { name: node.nodeName, text: node.textContent };
    const snapshot = (step: string, event: Event) => {
      const selection = window.getSelection();
      const { from, to, anchor, head } = view.state.selection;
      return {
        step,
        target: describeNode(event.target instanceof Node ? event.target : null),
        active: describeNode(document.activeElement),
        editorFocused: document.activeElement === prose,
        dom: {
          text: selection?.toString(),
          anchor: describeNode(selection?.anchorNode),
          anchorOffset: selection?.anchorOffset,
          focus: describeNode(selection?.focusNode),
          focusOffset: selection?.focusOffset,
        },
        model: { from, to, anchor, head },
      };
    };
    const samples: ReturnType<typeof snapshot>[] = [];
    const listeners = new AbortController();
    const options = { capture: true, signal: listeners.signal };
    document.addEventListener(
      "click",
      (event) => {
        if (event.isTrusted) samples.push(snapshot("click", event));
      },
      { ...options, once: true },
    );
    document.addEventListener(
      "keyup",
      (event) => {
        if (!event.isTrusted) return;
        if (event.key === "Home") samples.push(snapshot("Home", event));
        if (event.shiftKey && event.key === "ArrowRight") samples.push(snapshot("Shift+ArrowRight", event));
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "m") {
          samples.push(snapshot("ControlOrMeta+Shift+m", event));
        }
      },
      options,
    );
    return { point, samples, stop: () => listeners.abort() };
  });
}

test("OP-D18 紧凑任务描述保留文本命令和 @，隐藏文档级命令与批注", async ({ browserName }, testInfo) => {
  void browserName;
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "Research"));
    writeFileSync(path.join(vault, "Research", "资料.md"), "# 资料\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 40_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    await page.getByLabel("任务名称").fill("紧凑命令");
    const scope = page.getByTestId("task-body");
    const body = scope.locator(".ProseMirror");
    await body.click();
    await page.keyboard.type("/");
    await expect(page.locator('[data-slash-command="heading2"]')).toBeVisible();
    await expect(page.locator('[data-slash-command="component-File"], [data-slash-command^="embed-starter-"], [data-slash-command="footnote"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("参考 @Resea");
    await expect(page.getByTestId("editor-ref-menu")).toContainText("Research");
    await page.keyboard.press("Enter");
    await expect(body.locator("[data-wiki-link]")).toContainText("Research/");

    const probe = await traceTextSelection(body.locator("p").filter({ hasText: /^参考/ }));
    let actionFailed = false;
    const traceErrors: unknown[] = [];
    try {
      const { x, y } = await probe.evaluate(({ point }) => point);
      await page.mouse.click(x, y);
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("参考");
      await expect(page.getByTestId("comment-bubble-button")).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+Shift+m");
      await expect(page.getByTestId("comment-composer")).toHaveCount(0);
      await expect(body).toBeFocused();
      await expect(scope.getByTestId("editor-properties")).toHaveCount(0);
      await page.getByTestId("task-save").click();
      await expect(page.getByTestId("detail-references")).toContainText("Research");
    } catch (error) {
      actionFailed = true;
      throw error;
    } finally {
      try {
        const selectionTrace = await probe.evaluate(({ point, samples, stop }) => {
          stop();
          return { point, samples };
        });
        await testInfo.attach("compact-task-selection", { body: JSON.stringify(selectionTrace, null, 2), contentType: "application/json" });
      } catch (error) {
        traceErrors.push(error);
        await testInfo.attach("compact-task-selection-unavailable", { body: String(error), contentType: "text/plain" }).catch(() => undefined);
      } finally {
        await probe.dispose().catch((error: unknown) => {
          traceErrors.push(error);
        });
      }
    }
    if (!actionFailed && traceErrors.length) throw new AggregateError(traceErrors, "选择轨迹收集失败");
  } finally {
    await close();
  }
});
