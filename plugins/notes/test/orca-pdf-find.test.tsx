// @vitest-environment jsdom
// 适配自固定 ORCA 的 PdfFind.test.tsx（MIT，7041ea02）。

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "pdfjs-dist/legacy/build/pdf.mjs";
import { EventBus, FindState, PDFFindController, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import { createRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { PdfFind } from "../src/ui/viewers/PdfFind.js";

afterEach(cleanup);

function setup() {
  const bus = new EventBus();
  const inputRef = createRef<HTMLInputElement>();
  const onClose = vi.fn();
  const markup = (open: boolean) => <PdfFind open={open} eventBus={bus} inputRef={inputRef} onClose={onClose} />;
  const view = render(markup(true));
  const open = (shown: boolean) => view.rerender(markup(shown));
  const query = (value: string) => fireEvent.change(view.getByTestId("pdf-find-input"), { target: { value } });
  const count = (current: number, total: number) => bus.dispatch("updatefindmatchescount", { source: bus, matchesCount: { current, total } });
  const control = (current: number, total: number, state: number = FindState.FOUND, rawQuery = "needle") => bus.dispatch("updatefindcontrolstate", { source: bus, state, rawQuery, matchesCount: { current, total } });
  const reset = (highlightMatches: boolean) => bus.dispatch("updatetextlayermatches", { source: { highlightMatches }, pageIndex: -1 });
  return { bus, view, open, query, count, control, reset };
}

test("subscribes before a synchronous cached result on reopening", () => {
  const { bus, view, query, count, control, open } = setup();
  query("needle");
  act(() => count(2, 6));
  expect(view.getByTestId("pdf-find-count").textContent).toBe("2 / 6");
  open(false);
  bus.on("find", () => control(3, 6, FindState.PENDING));
  open(true);
  expect(view.getByTestId("pdf-find-count").textContent).toBe("3 / 6");
});

test("keeps empty queries clear even if a pending scan reports late", () => {
  const { view, query, count, control, reset } = setup();
  query("needle");
  act(() => count(2, 6));
  expect(view.getByTestId("pdf-find-count").textContent).toBe("2 / 6");
  query("");
  act(() => {
    count(3, 6);
    control(3, 6);
  });
  expect(view.queryByTestId("pdf-find-count")).toBeNull();
  query("another");
  expect(view.getByTestId("pdf-find-count").textContent).toBe("无匹配");
  act(() => control(3, 6));
  expect(view.getByTestId("pdf-find-count").textContent).toBe("无匹配");
  act(() => {
    reset(false);
    count(3, 6);
  });
  expect(view.getByTestId("pdf-find-count").textContent).toBe("无匹配");
  act(() => control(3, 6, FindState.FOUND, "another"));
  expect(view.getByTestId("pdf-find-count").textContent).toBe("无匹配");
  act(() => {
    reset(true);
    count(1, 4);
  });
  expect(view.getByTestId("pdf-find-count").textContent).toBe("1 / 4");
});

test("admits the changed query when the real PDF.js controller resets its match arrays", async () => {
  const { bus, view, query } = setup();
  const linkService = new PDFLinkService({ eventBus: bus });
  vi.spyOn(linkService, "pagesCount", "get").mockReturnValue(1);
  const controller = new PDFFindController({ linkService, eventBus: bus, delay: 0 });
  const page = { getTextContent: async () => ({ items: [{ str: "needle needle another" }] }) };
  // oxlint-disable-next-line typescript/consistent-type-assertions -- PDF.js find reads only getPage().getTextContent() from the document fixture.
  controller.setDocument({ getPage: async () => page } as unknown as PDFDocumentProxy);

  query("needle");
  await waitFor(() => expect(view.getByTestId("pdf-find-count").textContent).toBe("1 / 2"));
  query("");
  query("another");
  await waitFor(() => expect(view.getByTestId("pdf-find-count").textContent).toBe("1 / 1"));
});
