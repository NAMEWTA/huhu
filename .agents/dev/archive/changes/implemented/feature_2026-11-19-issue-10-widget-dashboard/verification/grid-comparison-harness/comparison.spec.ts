import { expect, test, type Locator, type Page } from "@playwright/test";
import type {} from "./main";

const candidates = ["huhu", "rgl", "gridstack", "homarr"] as const;
const ids = ["focus", "tasks", "activity"];
const names: Record<string, string> = { focus: "专注", tasks: "我的任务", activity: "最近活动" };
const initial = [
  { instanceId: "focus", x: 0, y: 0, w: 3, h: 2 },
  { instanceId: "tasks", x: 3, y: 2, w: 3, h: 3 },
  { instanceId: "activity", x: 0, y: 7, w: 3, h: 3 },
];

type Inspection = ReturnType<Window["inspectDashboardGrid"]>;
type Placement = Inspection["layout"][number];
type Candidate = (typeof candidates)[number];
type BrowserMetrics = {
  listeners(): Record<string, number>;
  listenerOrigins(): Record<string, string[]>;
  start(): void;
  stop(): void;
  evidence(): { framesMs: number[]; longFramesMs: number[] };
};
const pageErrors = new WeakMap<Page, string[]>();
const playwrightInterceptorStack =
  /^\s*at addHitTargetInterceptorListeners \([^)]+\)\n\s+at InjectedScript\._setupHitTargetInterceptors \([^)]+\)\n\s+at new InjectedScript \([^)]+\)$/m;

function applicationListenerCounts(origins: Record<string, string[]>) {
  const counts: Record<string, number> = {};
  for (const [key, stacks] of Object.entries(origins)) {
    const count = stacks.filter((stack) => !playwrightInterceptorStack.test(stack)).length;
    if (count) counts[key] = count;
  }
  return counts;
}

declare global {
  interface Window {
    gridMetrics: BrowserMetrics;
  }
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const additions = new Map<string, Map<EventListenerOrEventListenerObject, string>>();
    const tracked = /^(pointer|mouse|touch)(move|up|end|cancel)$/u;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const keyOf = (target: EventTarget, type: string, options?: boolean | EventListenerOptions) => {
      const scope = target === window ? "window" : target === document ? "document" : target === document.body ? "body" : "";
      return scope && tracked.test(type) ? `${scope}/${type}/${typeof options === "boolean" ? options : options?.capture === true}` : "";
    };
    EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
      const key = keyOf(this, type, options);
      if (key && listener && !(typeof options === "object" && (options.once || options.signal))) {
        const listeners = additions.get(key) ?? new Map();
        if (!listeners.has(listener)) listeners.set(listener, new Error().stack ?? "");
        additions.set(key, listeners);
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type, listener, options) {
      const key = keyOf(this, type, options);
      if (key && listener) additions.get(key)?.delete(listener);
      remove.call(this, type, listener, options);
    };

    const framesMs: number[] = [];
    const longFrames: Array<{ startTime: number; duration: number }> = [];
    if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      const observer = new PerformanceObserver((list) => {
        for (const { startTime, duration } of list.getEntries()) longFrames.push({ startTime, duration });
      });
      observer.observe({ type: "long-animation-frame" });
    }
    let startTime = 0;
    let endTime = 0;
    let previous = 0;
    let frame = 0;
    function onFrame(time: number) {
      if (previous) framesMs.push(time - previous);
      previous = time;
      frame = requestAnimationFrame(onFrame);
    }
    window.gridMetrics = {
      listeners: () => Object.fromEntries([...additions].filter(([, values]) => values.size > 0).map(([key, values]) => [key, values.size])),
      listenerOrigins: () => Object.fromEntries([...additions].filter(([, values]) => values.size > 0).map(([key, values]) => [key, [...values.values()]])),
      start() {
        cancelAnimationFrame(frame);
        framesMs.length = 0;
        previous = 0;
        startTime = performance.now();
        endTime = 0;
        frame = requestAnimationFrame(onFrame);
      },
      stop() {
        cancelAnimationFrame(frame);
        endTime = performance.now();
      },
      evidence() {
        const longFramesMs = longFrames
          .filter((entry) => startTime > 0 && entry.startTime >= startTime && entry.startTime <= (endTime || performance.now()))
          .map((entry) => entry.duration);
        return { framesMs: [...framesMs], longFramesMs };
      },
    };
  });
});

test.afterEach(async ({ page, browser }, info) => {
  const result = await page
    .evaluate(() => ({
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      inspection: window.inspectDashboardGrid?.(),
      metrics: window.gridMetrics?.evidence(),
      observedListeners: window.gridMetrics?.listeners(),
      listenerOrigins: window.gridMetrics?.listenerOrigins(),
    }))
    .catch((error: unknown) => ({ evaluationError: String(error) }));
  const applicationListeners = "listenerOrigins" in result && result.listenerOrigins ? applicationListenerCounts(result.listenerOrigins) : undefined;
  await info.attach("dashboard-grid-evidence", {
    body: JSON.stringify({ browserVersion: browser.version(), status: info.status, pageErrors: pageErrors.get(page), ...result, applicationListeners }, null, 2),
    contentType: "application/json",
  });
});

const inspect = (page: Page) => page.evaluate(() => window.inspectDashboardGrid());
const listenerSnapshot = (page: Page) =>
  page.evaluate(() => ({
    observedListeners: window.gridMetrics.listeners(),
    listenerOrigins: window.gridMetrics.listenerOrigins(),
  }));
const tile = (page: Page, id: string) => page.locator(`[data-instance-id="${id}"]`);
const moveHandle = (page: Page, id: string) => page.getByRole("button", { name: `移动 ${names[id]}`, exact: true });
function resizeHandle(page: Page, candidate: Candidate, id: string) {
  if (candidate === "rgl") return tile(page, id).locator(".react-resizable-handle-se");
  if (candidate === "gridstack") return tile(page, id).locator(".ui-resizable-se");
  return page.getByRole("button", { name: `拖动调整 ${names[id]} 尺寸`, exact: true });
}
async function open(page: Page, candidate: Candidate) {
  await page.goto(`/?candidate=${candidate}`);
  await expect(page.locator(".fixture-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("[data-instance-id]")).toHaveCount(3);
}
async function startEdit(page: Page) {
  await page.getByRole("button", { name: "编辑布局", exact: true }).click();
  await expect(page.getByTestId("home-dashboard-save")).toBeVisible();
}
async function center(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("缺少可见的操作把手");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function drag(page: Page, handle: Locator, dx: number, dy: number, beforeUp?: () => Promise<void>) {
  const from = await center(handle);
  const { pitchX, pitchY } = await inspect(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + dx * pitchX, from.y + dy * pitchY, { steps: 10 });
    if (beforeUp) await beforeUp();
  } finally {
    await page.mouse.up();
  }
}
function locate(layout: Placement[], id: string) {
  return layout.find((item) => item.instanceId === id);
}
function assertGeometry(data: Inspection) {
  expect(data.layout.map((item) => item.instanceId).sort()).toEqual([...ids].sort());
  for (const item of data.layout) {
    expect([item.x, item.y, item.w, item.h].every(Number.isSafeInteger)).toBe(true);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.x + item.w).toBeLessThanOrEqual(6);
    expect(item.w).toBeGreaterThanOrEqual(2);
    expect(item.h).toBeGreaterThanOrEqual(2);
    expect(item.w).toBeLessThanOrEqual(6);
    expect(item.h).toBeLessThanOrEqual(6);
    const overlaps = data.layout.some(
      (other) => other !== item && item.x < other.x + other.w && other.x < item.x + item.w && item.y < other.y + other.h && other.y < item.y + item.h,
    );
    expect(overlaps, `碰撞 ${item.instanceId}`).toBe(false);
  }
}
function assertRenderedGeometry(data: Inspection) {
  expect(data.documentScrollWidth).toBeLessThanOrEqual(data.documentWidth + 1);
  for (const tileData of data.tiles) {
    const a = tileData.box;
    for (const other of data.tiles) {
      if (other === tileData) continue;
      const b = other.box;
      const intersects = a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
      expect(intersects, `显示时重叠 ${tileData.id} / ${other.id}`).toBe(false);
    }
  }
}
async function expectPlacement(page: Page, id: string, expected: Partial<Placement>) {
  await expect.poll(async () => locate((await inspect(page)).layout, id), { timeout: 2500 }).toMatchObject(expected);
}
async function attachState(page: Page, label: string) {
  const data = await page.evaluate(() => ({
    ...window.inspectDashboardGrid(),
    metrics: window.gridMetrics.evidence(),
    observedListeners: window.gridMetrics.listeners(),
  }));
  await test.info().attach(label, { body: JSON.stringify(data, null, 2), contentType: "application/json" });
}
async function expectViewportFits(page: Page, layout: Placement[]) {
  const data = await inspect(page);
  expect(data.documentScrollWidth).toBeLessThanOrEqual(data.documentWidth + 1);
  expect(data.tiles.map(({ id }) => id)).toEqual(layout.map(({ instanceId }) => instanceId));
  for (const [index, tileData] of data.tiles.entries()) {
    expect(tileData.box.width).toBeGreaterThan(0);
    expect(tileData.scrollWidth).toBeLessThanOrEqual(tileData.clientWidth + 1);
    if (index > 0) {
      const previous = data.tiles[index - 1]!.box;
      expect(tileData.box.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
    }
  }
}

for (const candidate of candidates) {
  test.describe(candidate, () => {
    test("保留空位、跨列跨行、拖中让位、保存重开两次", async ({ page }, info) => {
      await open(page, candidate);
      expect.soft((await inspect(page)).layout).toEqual(initial);
      await startEdit(page);
      const before = await inspect(page);
      expect.soft(before.tiles.find(({ id }) => id === "activity")!.box.y).toBeGreaterThan(before.tiles.find(({ id }) => id === "tasks")!.box.y + 3 * before.pitchY);
      await page.evaluate(() => window.gridMetrics.start());
      try {
        await drag(page, moveHandle(page, "focus"), 3, 2, async () => {
          await expect.poll(async () => (await inspect(page)).activePlaceholders, { timeout: 2200 }).toBeGreaterThan(0);
          const preview = await inspect(page);
          const other = preview.tiles.find(({ id }) => id === "tasks")!;
          const original = before.tiles.find(({ id }) => id === "tasks")!;
          // The neighbor should move during preview, while the saved board remains untouched.
          expect.soft(other.box).not.toEqual(original.box);
          expect(preview.storage).toBe(before.storage);
          await attachState(page, "碰撞预览");
          await info.attach("碰撞预览截图", { body: await page.screenshot(), contentType: "image/png" });
        });
      } finally {
        await page.evaluate(() => window.gridMetrics.stop());
      }
      await expectPlacement(page, "focus", { x: 3, y: 2 });
      const after = await inspect(page);
      assertGeometry(after);
      assertRenderedGeometry(after);
      expect.soft(locate(after.layout, "tasks")).not.toEqual(locate(before.layout, "tasks"));
      expect.soft(after.tiles.map(({ id }) => id)).toEqual(after.layout.map(({ instanceId }) => instanceId));
      expect(after.storage).toBeNull();
      await attachState(page, "碰撞落点与帧样本");
      await page.getByTestId("home-dashboard-save").click();
      for (let i = 0; i < 2; i++) {
        await page.reload();
        await expect(page.locator("[data-instance-id]")).toHaveCount(3);
        const reloaded = await inspect(page);
        expect(reloaded.layout).toEqual(after.layout);
        expect(JSON.parse(reloaded.storage!).revision).toBe("1");
      }
    });

    test("指针尺寸约束与取消无写", async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 1600 });
      await open(page, candidate);
      await startEdit(page);
      await page.evaluate(() => window.gridMetrics.start());
      try {
        await drag(page, resizeHandle(page, candidate, "focus"), -2, -1);
        await expectPlacement(page, "focus", { w: 2, h: 2 });
        await drag(page, resizeHandle(page, candidate, "focus"), 4.1, 5.2);
        await expectPlacement(page, "focus", { w: 6, h: 6 });
      } finally {
        await page.evaluate(() => window.gridMetrics.stop());
      }
      const resized = await inspect(page);
      assertGeometry(resized);
      expect(resized.storage).toBeNull();
      await attachState(page, "尺寸约束与帧样本");
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      expect((await inspect(page)).layout).toEqual(initial);
      expect((await inspect(page)).storage).toBeNull();
    });

    test("非法放置恢复上次有效草稿并给出提示", async ({ page }) => {
      await open(page, candidate);
      await startEdit(page);
      const before = await inspect(page);
      await drag(page, moveHandle(page, "focus"), 4, 1);
      await attachState(page, "超出右边界后的状态");
      expect.soft((await inspect(page)).layout, "非法放置应回到上次有效草稿").toEqual(before.layout);
      expect.soft(await page.getByRole("status").allTextContents(), "非法放置应提示").toEqual(expect.arrayContaining([expect.stringMatching(/边界|超出|重叠/u)]));
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      expect((await inspect(page)).layout).toEqual(initial);
      expect((await inspect(page)).storage).toBeNull();
    });

    test("编辑输入和选中文字、查看态卡内操作零布局写", async ({ page }) => {
      await open(page, candidate);
      await page.getByRole("checkbox", { name: "完成示例任务" }).check();
      expect((await inspect(page)).storage).toBeNull();
      await startEdit(page);
      const input = page.getByRole("textbox", { name: "示例输入 专注" });
      await input.fill("编辑中的文本");
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("编辑中的文本");
      const text = page.locator("[data-selectable=focus]");
      await text.scrollIntoViewIfNeeded();
      await text.dblclick({ position: { x: 14, y: 8 } });
      expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
      const data = await inspect(page);
      expect(data.layout).toEqual(initial);
      expect(data.storage).toBeNull();
      expect(data.activePlaceholders).toBe(0);
    });

    test("桌面键盘与指针落点一致，CSS 125% 缩放仍命中", async ({ page }) => {
      await open(page, candidate);
      await startEdit(page);
      await drag(page, moveHandle(page, "focus"), 1, 0);
      await expectPlacement(page, "focus", { x: 1, y: 0 });
      const pointer = (await inspect(page)).layout;
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      await startEdit(page);
      const right = page.getByRole("button", { name: "向右移动 专注" });
      await right.focus();
      await right.press("Enter");
      await expectPlacement(page, "focus", { x: 1, y: 0 });
      expect.soft((await inspect(page)).layout).toEqual(pointer);
      await expect.soft(right).toBeFocused();
      expect.soft(await page.getByRole("status").allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/第|列/u)]));
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      await startEdit(page);
      await drag(page, resizeHandle(page, candidate, "focus"), 0, 1);
      await expectPlacement(page, "focus", { h: 3 });
      const pointerSize = (await inspect(page)).layout;
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      await startEdit(page);
      const size = page.getByRole("combobox", { name: "专注 高度" });
      await size.focus();
      await size.press("ArrowDown");
      await expectPlacement(page, "focus", { h: 3 });
      expect.soft((await inspect(page)).layout).toEqual(pointerSize);
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      await page.evaluate(() => {
        document.body.style.zoom = "1.25";
      });
      await startEdit(page);
      await drag(page, moveHandle(page, "focus"), 1, 0);
      await expectPlacement(page, "focus", { x: 1, y: 0 });
      expect((await inspect(page)).layout).toEqual(pointer);
    });

    test("宽窄共用坐标，窄屏键盘调整顺序和尺寸，桌面重开", async ({ page }, info) => {
      await open(page, candidate);
      const before = await inspect(page);
      for (const width of [1024, 800, 390, 320]) {
        await page.setViewportSize({ width, height: 850 });
        await expect.poll(async () => (await inspect(page)).stageWidth).toBeLessThanOrEqual(width);
        const data = await inspect(page);
        expect(data.layout).toEqual(before.layout);
        expect(data.storage).toBeNull();
        expect(data.documentScrollWidth).toBeLessThanOrEqual(data.documentWidth + 1);
      }
      await expectViewportFits(page, before.layout);
      await page.setViewportSize({ width: 390, height: 850 });
      await startEdit(page);
      await expect(moveHandle(page, "focus")).toBeHidden();
      const earlier = page.getByRole("button", { name: "前移 我的任务" });
      await earlier.focus();
      await earlier.press("Enter");
      const size = page.getByRole("combobox", { name: "我的任务 高度" });
      await size.focus();
      await size.press("ArrowDown");
      await expectPlacement(page, "tasks", { h: 4 });
      const adjusted = await inspect(page);
      expect(adjusted.layout[0]?.instanceId).toBe("tasks");
      await expectViewportFits(page, adjusted.layout);
      await attachState(page, "窄屏草稿");
      await info.attach("窄屏草稿截图", { body: await page.screenshot(), contentType: "image/png" });
      await page.getByTestId("home-dashboard-save").click();
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.reload();
      await expect(page.locator("[data-instance-id]")).toHaveCount(3);
      const reopened = await inspect(page);
      expect(reopened.layout).toEqual(adjusted.layout);
      assertGeometry(reopened);
      assertRenderedGeometry(reopened);
    });

    test("真实浏览器触摸事件与桌面一步落点相同", async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      try {
        await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
        await open(page, candidate);
        await startEdit(page);
        const { x, y } = await center(moveHandle(page, "focus"));
        const { pitchX } = await inspect(page);
        const send = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: { x: number; y: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
        await send("touchStart", [{ x, y }]);
        // Match GridStack's touch activation delay across candidates.
        await page.waitForTimeout(380);
        try {
          for (let position = 1; position <= 8; position++) await send("touchMove", [{ x: x + (pitchX * position) / 8, y }]);
        } finally {
          await send("touchEnd", []);
        }
        await expectPlacement(page, "focus", { x: 1, y: 0 });
        assertGeometry(await inspect(page));
      } finally {
        await cdp.detach();
      }
    });

    test("按住把手快速移出并卸载，重挂三次无持续活动", async ({ page }) => {
      await open(page, candidate);
      const before = await inspect(page);
      const baseline = await listenerSnapshot(page);
      const originalListeners = applicationListenerCounts(baseline.listenerOrigins);
      await test.info().attach("监听基线来源", {
        body: JSON.stringify({ ...baseline, applicationListeners: originalListeners }, null, 2),
        contentType: "application/json",
      });
      for (let pass = 0; pass < 3; pass++) {
        await startEdit(page);
        const from = await center(moveHandle(page, "focus"));
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        try {
          await page.mouse.move(6, from.y + 170, { steps: 2 });
          // Keyboard activation while the primary button is still held.
          await page.getByRole("button", { name: "卸载画布" }).press("Enter");
          await expect(page.locator("[data-instance-id]")).toHaveCount(0);
        } finally {
          await page.mouse.up();
        }
        await expect.poll(async () => applicationListenerCounts((await listenerSnapshot(page)).listenerOrigins)).toEqual(originalListeners);
        expect.soft(pageErrors.get(page), "卸载途中不应抛出浏览器异常").toEqual([]);
        await page.getByRole("button", { name: "重新打开画布" }).click();
        await expect(page.locator("[data-instance-id]")).toHaveCount(3);
        const reopened = await inspect(page);
        expect(reopened.layout).toEqual(before.layout);
        expect(reopened.storage).toBeNull();
        expect(reopened.grids).toBe(1);
        expect(reopened.activePlaceholders).toBe(0);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect((await inspect(page)).commits.length - reopened.commits.length).toBeLessThanOrEqual(1);
      }
    });
  });
}
