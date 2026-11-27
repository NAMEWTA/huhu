// @vitest-environment jsdom
import { createRequire } from "node:module";
import { URL as FileURL } from "node:url";
import { act, type ComponentProps, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Pane, PaneLeaf } from "../src/shared/workspace-layout.js";
import { WorkspaceCanvas } from "../src/ui/WorkspaceCanvas.js";

const { createRoot } = createRequire(new FileURL("../../../apps/desktop/package.json", import.meta.url))("react-dom/client") as {
  createRoot(element: Element): { render(node: ReactNode): void; unmount(): void };
};

vi.mock("@huhu/ui", async (original) => ({
  ...(await original<typeof import("@huhu/ui")>()),
  TerminalView: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));

const original: PaneLeaf = { kind: "leaf", id: "original", sessionId: "original-session" };
const sibling: PaneLeaf = { kind: "leaf", id: "sibling", sessionId: "sibling-session" };
const split = (axis: "rows" | "columns"): Pane => ({
  kind: "split",
  id: "split",
  axis,
  ratio: 0.5,
  first: sibling,
  second: original,
});
const props = {
  zoom: null,
  retained: null,
  endpoint: { baseUrl: "http://127.0.0.1" },
  editable: true,
  launchable: true,
  showReview: false,
  sessions: [
    { id: "original-session", spaceId: "space", provider: "shell", name: "原终端", state: "running", terminalId: "t1" },
    { id: "sibling-session", spaceId: "space", provider: "shell", name: "另一终端", state: "running", terminalId: "t2" },
  ],
  onFocus: vi.fn(),
  onRequest: vi.fn(),
  onMoveStart: vi.fn(),
  onMoveDrop: vi.fn(),
  onMoveCancel: vi.fn(),
  onClose: vi.fn(),
  onZoom: vi.fn(),
  onResize: vi.fn(),
  onReview: vi.fn(),
  onTerminalControl: vi.fn(),
  onInterrupt: vi.fn(),
  status: () => null,
} satisfies Omit<ComponentProps<typeof WorkspaceCanvas>, "pane" | "active">;

let outer: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let canvasHeight: number;
let notifyResize: () => void;
const canvas = () => outer.querySelector<HTMLDivElement>('[data-testid="agent-workspace-canvas"]')!;
const leaf = () => outer.querySelector<HTMLElement>('[data-pane-id="original"]')!;
const input = () => leaf().querySelector("textarea")!;
const render = (axis: "columns" | "rows", active = "original") => act(() => root.render(<WorkspaceCanvas {...props} pane={split(axis)} active={active} />));

beforeEach(() => {
  canvasHeight = 340;
  props.onFocus.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  outer = document.createElement("div");
  document.body.append(outer);
  root = createRoot(outer);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(620);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => canvasHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === canvas()) return new DOMRect(0, 180, 620, canvasHeight);
    return new DOMRect(0, 180 + Number.parseFloat(this.style.top) - canvas().scrollTop, 620, Number.parseFloat(this.style.height));
  });
});

afterEach(async () => {
  await act(() => root.unmount());
  outer.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("focusing the lower terminal reveals its bottom inside the canvas", async () => {
  await render("rows", sibling.id);
  expect(leaf().getBoundingClientRect().bottom).toBeGreaterThan(canvas().getBoundingClientRect().bottom);
  outer.scrollTop = 23;
  await act(() => input().focus());
  expect(document.activeElement).toBe(input());
  expect(props.onFocus).toHaveBeenCalledWith(original.id, original.sessionId);
  expect(leaf().getBoundingClientRect().bottom).toBe(canvas().getBoundingClientRect().bottom);
  expect(outer.scrollTop).toBe(23);

  const upperInput = outer.querySelector<HTMLTextAreaElement>('[data-pane-id="sibling"] textarea')!;
  await act(() => upperInput.focus());
  expect(canvas().scrollTop).toBe(0);
  expect(document.activeElement).toBe(upperInput);
  expect(outer.scrollTop).toBe(23);
});

test("reordering and shrinking keep the focused terminal visible without remounting it", async () => {
  await render("columns");
  const originalInput = input();
  await act(() => originalInput.focus());
  expect(canvas().scrollTop).toBe(0);
  await render("rows");
  expect(canvas().scrollTop).toBe(14);

  canvasHeight = 332;
  await act(() => notifyResize());
  expect(canvas().scrollTop).toBe(22);
  expect(leaf().getBoundingClientRect().bottom).toBe(canvas().getBoundingClientRect().bottom);
  expect(input()).toBe(originalInput);
  expect(document.activeElement).toBe(originalInput);
});
