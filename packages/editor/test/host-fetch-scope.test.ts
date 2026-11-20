import { expect, test, vi } from "vitest";
import { installHostFetch, registerHostRoutes } from "../src/host/host-fetch";

import { okFetch } from "../src/vendor/open-knowledge/app/src/lib/ok-fetch";

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
