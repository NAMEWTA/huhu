// @vitest-environment jsdom
import type { PDFDocumentProxy } from "pdfjs-dist";
import { beforeEach, expect, test, vi } from "vitest";
import { createPdfDocumentLoader } from "../src/vendor/orca/pdf/pdf-document-loader.js";
import { createPdfViewerSession } from "../src/vendor/orca/pdf/pdf-viewer-session.js";
import { pdfViewPositionCache } from "../src/vendor/orca/pdf/scroll-cache.js";

const { pdf, FakeBus } = vi.hoisted(() => {
class FakeBus {
  listeners = new Map<string, Set<(event: never) => void>>();
  on(name: string, listener: (event: never) => void) {
    const group = this.listeners.get(name) ?? new Set();
    group.add(listener);
    this.listeners.set(name, group);
  }
  off(name: string, listener: (event: never) => void) {
    this.listeners.get(name)?.delete(listener);
  }
  dispatch(name: string, event: unknown = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(event as never);
  }
  count() {
    return [...this.listeners.values()].reduce((n, listeners) => n + listeners.size, 0);
  }
}
const pdf = {
  getDocument: vi.fn(),
  viewers: [] as { signal: AbortSignal; disposeLocalization: ReturnType<typeof vi.fn>; bus: FakeBus; detach: ReturnType<typeof vi.fn> }[],
  order: [] as string[],
};
return { pdf, FakeBus };
});

vi.mock("pdfjs-dist", () => ({
  getDocument: pdf.getDocument,
  PDFDataRangeTransport: class {
    transportReady() {}
    abort() {}
  },
}));

vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  EventBus: FakeBus,
  PDFLinkService: class {
    setViewer() {}
    setDocument() {}
  },
  PDFFindController: class {
    setDocument() {}
  },
  PDFViewer: class {
    currentScale = 1;
    currentScaleValue = "auto";
    pagesCount = 8;
    scrollPageIntoView = vi.fn();
    update = vi.fn();
    setDocument = vi.fn((doc: unknown) => {
      pdf.order.push(doc ? "display" : "detach");
    });
    l10n = { destroy: vi.fn(async () => {}) };
    constructor({ abortSignal, eventBus }: { abortSignal: AbortSignal; eventBus: FakeBus }) {
      pdf.viewers.push({ signal: abortSignal, bus: eventBus, disposeLocalization: this.l10n.destroy, detach: this.setDocument });
    }
  },
}));

const fixture = { read: async () => new Uint8Array(64), length: 64 };
const documentFor = (id: string) => ({ fingerprint: id }) as unknown as PDFDocumentProxy;
const cacheKey = "vault:report.pdf";
const makeTask = () => {
  const deferred = Promise.withResolvers<PDFDocumentProxy>();
  return {
    ...deferred,
    destroy: vi.fn(async () => {
      pdf.order.push("destroy");
    }),
  };
};

beforeEach(() => {
  pdf.getDocument.mockReset();
  pdf.viewers.length = 0;
  pdf.order.length = 0;
  pdfViewPositionCache.clear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

function setupSession(options: { scale?: number } = {}) {
  const container = document.createElement("div");
  const viewerDiv = document.createElement("div");
  container.append(viewerDiv);
  Object.defineProperty(container, "clientHeight", { value: 600 });
  return (doc: PDFDocumentProxy) =>
    createPdfViewerSession({
      container,
      viewerDiv,
      doc,
      scrollCacheKey: cacheKey,
      getScalePreference: () => options.scale ?? "page-width",
      scaleBounds: { min: 0.25, max: 5 },
      onScaleChanging: vi.fn(),
      onWheelZoom: vi.fn(),
    });
}

test("late obsolete tasks never mount or replace the current error and all tasks release once", async () => {
  const tasks = [makeTask(), makeTask(), makeTask()];
  for (const task of tasks) pdf.getDocument.mockReturnValueOnce(task);
  const display = vi.fn(() => vi.fn());
  const onError = vi.fn();
  const loader = createPdfDocumentLoader({ display, onError });
  for (const _task of tasks) loader.load(fixture);
  const newest = documentFor("newest");
  tasks[2]!.resolve(newest);
  tasks[1]!.reject(new Error("obsolete failure"));
  tasks[0]!.resolve(documentFor("obsolete"));
  await Promise.resolve();
  expect(display.mock.calls).toEqual([[newest]]);
  expect(onError.mock.calls.every(([message]) => message === null)).toBe(true);
  loader.dispose();
  loader.dispose();
  for (const task of tasks) expect(task.destroy).toHaveBeenCalledTimes(1);
});

test("replacement releases the old viewer and worker before loading and restores position and zoom", async () => {
  const first = makeTask();
  const second = makeTask();
  pdf.getDocument.mockReturnValueOnce(first).mockImplementationOnce(() => {
    pdf.order.push("load replacement");
    return second;
  });

  const mount = setupSession({ scale: 1.6 });
  const sessions: ReturnType<typeof mount>[] = [];
  const loader = createPdfDocumentLoader({
    display: (doc) => {
      const session = mount(doc);
      sessions.push(session);
      return session.dispose;
    },
    onError: vi.fn(),
  });
  loader.load(fixture);
  first.resolve(documentFor("old"));
  await first.promise;
  const old = sessions[0]!;
  old.eventBus.dispatch("pagesinit");
  old.eventBus.dispatch("updateviewarea", { location: { pageNumber: 5, top: 310, left: 24 } });
  loader.load(fixture);
  expect(pdf.order).toEqual(["display", "detach", "destroy", "load replacement"]);
  expect(pdfViewPositionCache.get(cacheKey)).toEqual({ pageNumber: 5, top: 310, left: 24 });
  expect(pdf.viewers[0]!.signal.aborted).toBe(true);
  expect(pdf.viewers[0]!.bus.count()).toBe(0);
  expect(pdf.viewers[0]!.disposeLocalization).toHaveBeenCalledTimes(1);

  second.resolve(documentFor("new"));
  await second.promise;
  const replacement = sessions[1]!;
  replacement.eventBus.dispatch("pagesinit");
  replacement.eventBus.dispatch("pagesloaded");
  expect(replacement.viewer.currentScale).toBe(1.6);
  expect(replacement.viewer.scrollPageIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 5 }));
  expect(replacement.viewer.update).toHaveBeenCalledOnce();
  loader.dispose();
  expect(second.destroy).toHaveBeenCalledOnce();
});

test("25 failed and successful range reloads retain only current worker, events and localization", async () => {
  const mount = setupSession();
  const onError = vi.fn();
  const loader = createPdfDocumentLoader({ display: (doc) => mount(doc).dispose, onError });
  const tasks: ReturnType<typeof makeTask>[] = [];
  for (let index = 0; index < 50; index++) {
    const task = makeTask();
    tasks.push(task);
    pdf.getDocument.mockReturnValueOnce(task);
    loader.load(fixture);
    const failed = index % 2 === 0;
    if (failed) task.reject(new Error("truncated range PDF"));
    else task.resolve(documentFor(String(index)));
    await Promise.resolve();
    const count = failed ? 0 : 1;
    expect(tasks.filter((entry) => entry.destroy.mock.calls.length === 0)).toHaveLength(count);
    expect(pdf.viewers.filter(({ signal }) => !signal.aborted)).toHaveLength(count);
    expect(pdf.viewers.filter(({ bus }) => bus.count() > 0)).toHaveLength(count);
    expect(pdf.viewers.filter(({ disposeLocalization }) => disposeLocalization.mock.calls.length === 0)).toHaveLength(count);
    if (failed) expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("无法加载 PDF"));
    else expect(onError).toHaveBeenLastCalledWith(null);
  }
  loader.dispose();
  for (const task of tasks) expect(task.destroy).toHaveBeenCalledOnce();
  for (const viewer of pdf.viewers) {
    expect(viewer.signal.aborted).toBe(true);
    expect(viewer.bus.count()).toBe(0);
    expect(viewer.disposeLocalization).toHaveBeenCalledOnce();
    expect(viewer.detach.mock.calls.filter(([doc]) => doc === null)).toHaveLength(1);
  }
});
