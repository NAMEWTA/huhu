import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import { fetchExternalLinkPreview } from "../src/host/link-preview-main";
import { guardedFetch } from "../src/vendor/open-knowledge/server-bridge/link-preview/guarded-fetch";
import { extractHtmlMetadata } from "../src/vendor/open-knowledge/server-bridge/link-preview/html-metadata";

test("Q3 主进程预览拒绝非 HTTP 地址和本地网络，不发出请求", async () => {
  await expect(fetchExternalLinkPreview("file:///tmp/local.html")).resolves.toMatchObject({ ok: false });
  await expect(fetchExternalLinkPreview("http://127.0.0.1/link")).resolves.toMatchObject({ ok: false });
});

test("Q3 真实 HTTP 读取标题，超过字节限制或截止时间即回退", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html;charset=utf-8");
    if (request.url === "/slow") return;
    if (request.url === "/large") {
      response.end("<html><head>" + "x".repeat(2048));
      return;
    }
    response.end('<html><head><title>预览标题</title><meta name="description" content="页面摘要"></head></html>');
  });
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("HTTP 夹具监听失败");
    const request = (pathname: string, timeoutMs = 2000) =>
      guardedFetch(`http://test.invalid:${address.port}${pathname}`, {
        // 仅夹具允许本地地址，生产入口使用守卫默认的 DNS 和地址检查。
        resolve: async () => [{ address: "127.0.0.1", family: 4 }],
        isAddressAllowed: () => true,
        maxBytes: 1024,
        timeoutMs,
      });
    const success = await request("/html");
    expect(success.ok).toBe(true);
    if (success.ok) expect(extractHtmlMetadata(new TextDecoder().decode(success.body))).toMatchObject({ title: "预览标题", description: "页面摘要" });
    await expect(request("/large")).resolves.toEqual({ ok: false, reason: "oversized" });
    await expect(request("/slow", 100)).resolves.toEqual({ ok: false, reason: "timeout" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
