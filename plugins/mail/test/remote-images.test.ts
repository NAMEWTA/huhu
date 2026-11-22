import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import { isPublicImageAddress, loadRemoteImages } from "../src/engine/remote-images.js";

const transport = vi.hoisted(() => ({
  requests: [] as { url: string; headers: Record<string, string> }[],
  connections: [] as { url: string; address: string }[],
}));
vi.mock("node:dns", () => ({
  lookup: (name: string, _options: unknown, callback: (error: null, addresses: { address: string; family: number }[]) => void) => {
    const addresses = [{ address: "93.184.216.34", family: 4 }];
    if (name === "mixed.fixture.invalid") addresses.push({ address: "127.0.0.1", family: 4 });
    callback(null, addresses);
  },
}));
vi.mock("node:https", () => ({
  get(
    url: string,
    options: {
      headers: Record<string, string>;
      lookup(name: string, options: unknown, callback: (error: Error | null, address: string) => void): void;
    },
    ready: (response: unknown) => void,
  ) {
    transport.requests.push({ url, headers: options.headers });
    const request = new EventEmitter();
    queueMicrotask(() =>
      options.lookup(new URL(url).hostname, {}, (error, address) => {
        if (error) return request.emit("error", error);
        transport.connections.push({ url, address });
        const body = url.endsWith("/over") ? Buffer.alloc(512 * 1024 + 1) : Buffer.from("synthetic image");
        const response = Object.assign(Readable.from([body]), {
          statusCode: url.endsWith("/redirect") ? 302 : 200,
          headers: { "content-type": url.endsWith("/svg") ? "image/svg+xml" : "image/png", location: "https://other.fixture.invalid/leak" },
        });
        ready(response);
      }),
    );
    return request;
  },
}));

test("单封批准只接通合规图片的固定 DNS 地址，限制响应类型、大小和跳转", async () => {
  const result = await loadRemoteImages(
    '<img src="https://images.fixture.invalid/ok#fragment" srcset="https://images.fixture.invalid/ignored 1x">' +
      '<picture><source srcset="https://images.fixture.invalid/ignored"></picture>' +
      '<template><img src="https://images.fixture.invalid/hidden"></template>' +
      '<img src="https://127.0.0.1/private"><img src="http://images.fixture.invalid/plain"><img src="https://user:pass@images.fixture.invalid/secret">' +
      '<img src="https://mixed.fixture.invalid/dns"><img src="https://images.fixture.invalid/over"><img src="https://images.fixture.invalid/svg"><img src="https://images.fixture.invalid/redirect">',
    new AbortController().signal,
  );
  expect(result).toEqual({
    images: [{ url: "https://images.fixture.invalid/ok", mediaType: "image/png", base64: Buffer.from("synthetic image").toString("base64") }],
    failed: 5,
  });
  expect(transport.connections.map(({ url }) => new URL(url).pathname)).toEqual(["/ok", "/over", "/svg", "/redirect"]);
  expect(transport.connections.every(({ address }) => address === "93.184.216.34")).toBe(true);
  for (const { headers } of transport.requests) expect(Object.keys(headers)).toEqual(["accept"]);
});

test("拒绝私有地址、映射地址、回环、链路本地及特殊用途地址", () => {
  for (const address of ["127.0.0.1", "10.2.3.4", "169.254.169.254", "100.64.0.1", "192.168.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fe80::1", "fd00::1", "2002::1", "2001:db8::1"]) {
    expect(isPublicImageAddress(address), address).toBe(false);
  }
  expect(isPublicImageAddress("93.184.216.34")).toBe(true);
  expect(isPublicImageAddress("2606:4700:4700::1111")).toBe(true);
});
