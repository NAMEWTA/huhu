import type { EngineClient } from "@huhu/workbench";
import { expect, test } from "vitest";
import { onOpenCaptureRequest, requestOpenCapture } from "../src/ui/open-capture.js";

test("收件定位在首次挂载和模块已打开时送给原 Engine 客户端", () => {
  const engine = {} as EngineClient;
  const replacement = {} as EngineClient;
  const delivered: string[] = [];
  const other: string[] = [];
  requestOpenCapture(engine, "first");
  const offOther = onOpenCaptureRequest(replacement, (id) => other.push(id));
  try {
    const off = onOpenCaptureRequest(engine, (id) => delivered.push(id));
    requestOpenCapture(engine, "second");
    off();
    expect(delivered).toEqual(["first", "second"]);
    expect(other).toEqual([]);
  } finally {
    offOther();
  }
});
