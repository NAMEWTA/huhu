import { expect, type Locator, type Page } from "@playwright/test";

interface BridgeDoc {
  emit(event: string, args: unknown[]): void;
  getText(name: string): { toString(): string };
}
type EditorElement = HTMLElement & { editor?: { extensionManager: { extensions: { name: string; options: { document?: BridgeDoc } }[] } } };

export async function holdBridgeTimers(prose: Locator) {
  await prose.evaluate((element: EditorElement) => {
    const doc = element.editor?.extensionManager.extensions.find((entry) => entry.name === "collaboration")?.options.document;
    if (!doc) throw new Error("未挂载协作编辑器");
    const emit = doc.emit.bind(doc);
    let inside = false;
    doc.emit = (event, args) => {
      if (inside || event !== "afterAllTransactions") return emit(event, args);
      const now = performance.now;
      const browser: Window = window;
      const timeout = browser.setTimeout;
      let elapsed = now.call(performance);
      inside = true;
      // 只影响当前 Y.Doc 内的实际桥调度。首笔测成慢结算，后续计时器等显式 flush。
      performance.now = () => (elapsed += 50);
      browser.setTimeout = (callback, ms, ...inputs) => timeout(callback, ms !== undefined && ms >= 100 && ms <= 1500 ? 60_000 : ms, ...inputs);
      try {
        emit(event, args);
      } finally {
        performance.now = now;
        browser.setTimeout = timeout;
        inside = false;
      }
    };
  });
  return () =>
    prose.evaluate((element: EditorElement) => {
      const doc = element.editor?.extensionManager.extensions.find((entry) => entry.name === "collaboration")?.options.document;
      if (!doc) throw new Error("未挂载协作编辑器");
      return doc.getText("source").toString();
    });
}

export async function engineReady(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
}

export async function call<T>(page: Page, capability: string, input: object): Promise<T> {
  return page.evaluate(
    async ({ capability, input }) => {
      const endpoint = await window.huhuHost.engine();
      const res = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.data;
    },
    { capability, input },
  );
}
