// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { OkRoot } from "../src/rich/OkRoot";
import "./vendor-jsdom-setup";
import { expect, test, vi } from "vitest";
import { installHostFetch, registerHostRoutes, type HostRoutes } from "../src/host/host-fetch";

import { LocalReferenceContext, useLiveDocText, type LocalReferenceHost } from "../src/vendor/open-knowledge/app/src/editor/components/live-doc-pool";
import { Pdf } from "../src/vendor/open-knowledge/app/src/editor/components/Pdf";
import { useMirrorSource } from "../src/vendor/open-knowledge/app/src/editor/components/use-mirror-source";
import { okFetch, useOkFetch } from "../src/vendor/open-knowledge/app/src/lib/ok-fetch";

test("OP-D04 安装和卸载编辑器宿主不改动全局 fetch", async () => {
  const original = vi.fn(async () => new Response("network"));
  vi.stubGlobal("fetch", original);
  const unregister = registerHostRoutes({ "GET /api/notes": () => "editor" });
  const restoreFirst = installHostFetch();
  const restoreSecond = installHostFetch();
  try {
    expect(globalThis.fetch).toBe(original);
    expect(await (await globalThis.fetch("/api/notes")).text()).toBe("network");
    expect(await (await okFetch("/api/notes")).json()).toBe("editor");
    expect(await (await okFetch("https://example.com/image.png")).text()).toBe("network");
    restoreFirst();
    expect(await (await okFetch("/api/notes")).json()).toBe("editor");
    restoreSecond();
    expect(globalThis.fetch).toBe(original);
    expect(await (await okFetch("/api/notes")).text()).toBe("network");
  } finally {
    restoreFirst();
    restoreSecond();
    unregister();
    vi.unstubAllGlobals();
  }
});

test("OP-D04 未登记的方法不会调用同路径的处理器", async () => {
  const handler = vi.fn(() => "private");
  const off = registerHostRoutes({ "/api/method-check": handler });
  const uninstall = installHostFetch();
  try {
    expect((await okFetch("/api/method-check", { method: "DELETE" })).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  } finally {
    off();
    uninstall();
  }
});

vi.mock("@/lib/i18n", async () => {
  const { i18n } = await import("@lingui/core");
  i18n.load("en", {});
  i18n.activate("en");
  return { i18n };
});
vi.mock("@/lib/activate-locale", () => ({ dynamicActivate: async () => undefined, getRequestedLocale: () => "en" }));
vi.mock("@lingui/core/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));
vi.mock("@lingui/react/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ ...pdfjs, GlobalWorkerOptions: { workerSrc: "test-worker" } }));

function ScopeProbe({ name }: { name: string }) {
  const request = useOkFetch();
  const [result, setResult] = useState("");
  const requestGeneration = useRef(0);
  return (
    <button
      onClick={async () => {
        const generation = ++requestGeneration.current;
        const data = await (await request("/api/scoped")).json();
        if (generation === requestGeneration.current) setResult(String(data));
      }}
    >
      {name}: {result}
    </button>
  );
}

test("OP-D04 并挂根各自绑定路由，卸载和异步切换不会重定向旧请求", async () => {
  const oldReply = Promise.withResolvers<string>();
  const oldHandler = vi.fn(() => oldReply.promise);
  const firstHandler = vi.fn(() => "first-only");
  const replacement = vi.fn(() => "after-switch");
  const mount = (showFirst: boolean, secondHandler?: () => string | Promise<string>) => (
    <>
      {showFirst ? (
        <OkRoot key="first" routes={{ "GET /api/scoped": firstHandler }}>
          <ScopeProbe name="first" />
        </OkRoot>
      ) : null}
      {secondHandler ? (
        <OkRoot key="second" routes={{ "GET /api/scoped": secondHandler }}>
          <ScopeProbe name="second" />
        </OkRoot>
      ) : null}
    </>
  );
  const app = render(mount(true, oldHandler));
  try {
    fireEvent.click(await screen.findByRole("button", { name: "first:" }));
    await screen.findByRole("button", { name: "first: first-only" });
    fireEvent.click(await screen.findByRole("button", { name: "second:" }));
    expect(oldHandler).toHaveBeenCalledTimes(1);

    app.rerender(mount(true, replacement));
    fireEvent.click(screen.getByRole("button", { name: "second:" }));
    await screen.findByRole("button", { name: "second: after-switch" });
    await act(async () => oldReply.resolve("old"));
    expect(screen.getByRole("button", { name: "second: after-switch" })).toBeDefined();

    app.rerender(mount(true));
    fireEvent.click(screen.getByRole("button", { name: "first: first-only" }));
    expect(firstHandler).toHaveBeenCalledTimes(2);

    app.rerender(mount(false, replacement));
    fireEvent.click(await screen.findByRole("button", { name: "second:" }));
    await screen.findByRole("button", { name: "second: after-switch" });
    expect(replacement).toHaveBeenCalledTimes(2);
  } finally {
    app.unmount();
  }
});

test("H04 配置请求由当前宿主本地响应，不访问 OK 服务", async () => {
  const uninstall = installHostFetch();
  try {
    const response = await okFetch("/api/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ collabUrl: null, previewUrl: null });
  } finally {
    uninstall();
  }
});

test("B01 未打开的镜像与画板从各自宿主读取，失效和切库取消旧请求", async () => {
  function References() {
    const mirror = useMirrorSource("source", "excerpt");
    const board = useLiveDocText("board.excalidraw");
    return (
      <>
        <p data-testid="mirror">{mirror.kind === "ready" ? mirror.html : mirror.kind}</p>
        <p data-testid="board">{board.kind === "ready" ? board.text : board.kind}</p>
      </>
    );
  }

  function vault(text: string) {
    const subscriptions = new Map<string, () => void>();
    const localReferences: LocalReferenceHost = {
      subscribe(docName, refresh) {
        subscriptions.set(docName, refresh);
        return () => {
          subscriptions.delete(docName);
        };
      },
      readPdf: vi.fn(),
    };
    const pending = Promise.withResolvers<{ text: string }>();
    const signals: AbortSignal[] = [];
    let contents = text;
    let hold = false;
    const routes: HostRoutes = {
      "GET /api/reference-text": ({ url, signal }) => {
        if (signal) signals.push(signal);
        return url.searchParams.get("doc") === "source" ? { text: `<MirrorSource name="excerpt">\n\n${contents}\n\n</MirrorSource>` } : hold ? pending.promise : { text: `board: ${contents}` };
      },
    };
    return {
      subscriptions,
      signals,
      pending,
      update(next: string) {
        contents = next;
        for (const refresh of subscriptions.values()) refresh();
      },
      holdBoard() {
        hold = true;
        subscriptions.get("board.excalidraw")?.();
      },
      mount: () => (
        <OkRoot localReferences={localReferences} routes={routes}>
          <References />
        </OkRoot>
      ),
    };
  }

  const first = vault("first vault");
  const second = vault("second vault");
  const view = render(first.mount());
  try {
    await waitFor(() => expect(screen.getByTestId("mirror").textContent).toContain("first vault"));
    expect(screen.getByTestId("board").textContent).toBe("board: first vault");
    act(() => first.update("changed on disk"));
    await waitFor(() => expect(screen.getByTestId("mirror").textContent).toContain("changed on disk"));
    expect(screen.getByTestId("board").textContent).toBe("board: changed on disk");

    act(() => first.holdBoard());
    const oldSignal = first.signals.at(-1);
    expect(oldSignal?.aborted).toBe(false);
    view.rerender(second.mount());
    expect(first.subscriptions.size).toBe(0);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => first.pending.resolve({ text: "late old board" }));
    await waitFor(() => expect(screen.getByTestId("mirror").textContent).toContain("second vault"));
    expect(screen.getByTestId("board").textContent).toBe("board: second vault");
  } finally {
    view.unmount();
  }
  expect(second.subscriptions.size).toBe(0);
  expect(second.signals.every((signal) => signal.aborted)).toBe(true);
});

test("B01 内嵌 PDF 按失效重读 Vault 字节并释放上一任务", async () => {
  let refresh: (() => void) | undefined;
  const unsubscribe = vi.fn(() => {
    refresh = undefined;
  });
  const signals: AbortSignal[] = [];
  let bytes = [37, 80, 68, 70];
  const tasks: Array<ReturnType<typeof vi.fn>> = [];
  pdfjs.getDocument.mockImplementation(() => {
    const destroy = vi.fn(async () => undefined);
    tasks.push(destroy);
    return { destroy, promise: Promise.resolve({ numPages: 0 }) };
  });
  const local: LocalReferenceHost = {
    subscribe: vi.fn((_path, reload) => {
      refresh = reload;
      return unsubscribe;
    }),
    readPdf: vi.fn(async (_path, signal) => {
      signals.push(signal);
      const data = Uint8Array.from(bytes);
      return { arrayBuffer: async () => data.buffer } as Blob;
    }),
  };
  const view = render(
    <OkRoot>
      <LocalReferenceContext value={local}>
        <Pdf src="/docs/%E9%99%84%E5%BD%95.pdf#page=1" />
      </LocalReferenceContext>
    </OkRoot>,
  );
  try {
    await waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalledWith({ data: Uint8Array.from(bytes) }));
    expect(local.subscribe).toHaveBeenCalledWith("docs/附录.pdf", expect.any(Function));
    expect(local.readPdf).toHaveBeenCalledWith("docs/附录.pdf", signals[0]);

    bytes = [...bytes, 45, 49];
    act(() => refresh?.());
    await waitFor(() => expect(pdfjs.getDocument).toHaveBeenLastCalledWith({ data: Uint8Array.from(bytes) }));
    expect(tasks[0]).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(true);
  } finally {
    view.unmount();
  }
  expect(tasks[1]).toHaveBeenCalledTimes(1);
  expect(signals[1]?.aborted).toBe(true);
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});
