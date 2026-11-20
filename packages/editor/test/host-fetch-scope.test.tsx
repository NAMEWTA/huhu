// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { OkRoot } from "../src/rich/OkRoot";
import "./vendor-jsdom-setup";
import { expect, test, vi } from "vitest";
import { installHostFetch, registerHostRoutes } from "../src/host/host-fetch";

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
