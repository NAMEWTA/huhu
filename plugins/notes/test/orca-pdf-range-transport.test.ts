// 迁入自 ORCA（MIT，7041ea02）：pdf-orca-media-range-transport.test.ts；仅改导入路径与传输层注入方式（见 vendor/orca/pdf/PATCHES.md）。
import { describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  PDFDataRangeTransport: class {
    constructor(
      readonly length: number,
      readonly initialData: unknown,
    ) {}
    onDataRange(_begin: number, _chunk: Uint8Array): void {}
  },
}));

import { createRangeTransport, readRange } from "../src/vendor/orca/pdf/pdf-range-transport";

describe("vault range transport for pdf.js", () => {
  it("stops reading the rest of a merged range once the viewer aborts", async () => {
    let release: (bytes: Uint8Array) => void = () => {};
    const read = vi.fn(() => new Promise<Uint8Array>((resolve) => (release = resolve)));
    const transport = createRangeTransport(12 << 20, read, vi.fn());

    transport.requestDataRange(0, 12 << 20);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    transport.abort();
    release(new Uint8Array(4 << 20));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(read).toHaveBeenCalledOnce();
  });

  it("assembles a range from short reads and bounds each call to 4 MiB", async () => {
    const calls: [number, number][] = [];
    const data = new Uint8Array(10 << 20).map((_, i) => i % 251);
    const read = async (offset: number, length: number) => {
      calls.push([offset, length]);
      return data.slice(offset, offset + Math.min(length, 3 << 20)); // 每次最多给 3 MiB：模拟短读
    };
    const out = await readRange(read, 5, 9 << 20, () => false);
    expect(out.byteLength).toBe((9 << 20) - 5);
    expect(out[0]).toBe(data[5]);
    expect(out[out.byteLength - 1]).toBe(data[(9 << 20) - 1]);
    expect(Math.max(...calls.map(([, l]) => l))).toBeLessThanOrEqual(4 << 20);
  });

  it("fails when the file ends before the requested range, instead of waiting forever", async () => {
    await expect(
      readRange(
        async () => new Uint8Array(0),
        0,
        100,
        () => false,
      ),
    ).rejects.toThrow("ended before");
  });

  it("reports a range failure through onFailure (pdf.js has no failure callback)", async () => {
    const onFailure = vi.fn();
    const transport = createRangeTransport(100, async () => Promise.reject(new Error("boom")), onFailure);
    transport.requestDataRange(0, 100);
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());
  });
});
