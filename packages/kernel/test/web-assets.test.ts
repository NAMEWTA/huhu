import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { webAssets } from "../src/server/web-assets.js";
import { WebListener } from "../src/server/web-listener.js";

test("构建资源使用正确 MIME，业务深链返回入口，缺失资源保留失败状态", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-web-assets-"));
  const root = path.join(fixture, "renderer");
  mkdirSync(path.join(root, "assets"), { recursive: true });
  const index = '<!doctype html><script type="module" src="/assets/main.js"></script>';
  writeFileSync(path.join(root, "index.html"), index);
  writeFileSync(path.join(root, "assets/main.js"), "export const loaded = true;");
  writeFileSync(path.join(root, "assets/main.css"), "body { margin: 0; }");
  const web = new WebListener(webAssets(root));

  try {
    const active = await web.start({ mode: "local", port: 0 });
    if (active.state !== "running") throw new Error("Web listener did not start");
    const base = `http://127.0.0.1:${active.port}`;
    for (const route of ["/", "/notes/中文.md", "/tasks/task-abc"]) {
      const response = await fetch(base + route);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^text\/html\b/);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe(index);
    }

    const script = await fetch(`${base}/assets/main.js`);
    expect(script.headers.get("content-type")).toMatch(/javascript/);
    expect(script.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await script.text()).toBe("export const loaded = true;");
    const css = await fetch(`${base}/assets/main.css`, { method: "HEAD" });
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/^text\/css\b/);
    expect(await css.text()).toBe("");

    for (const route of ["/assets/missing.js", "/assets/missing.css", "/api/v1/bootstrap", "/mcp", "/ws/events"]) {
      expect((await fetch(base + route)).status).toBe(404);
    }
    rmSync(path.join(root, "index.html"));
    expect((await fetch(`${base}/notes/中文.md`)).status).toBe(503);
  } finally {
    await web.stop();
    rmSync(fixture, { recursive: true, force: true });
  }
});
