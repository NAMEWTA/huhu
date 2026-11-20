import { expect, test, vi } from "vitest";
import { logConversionFail, logIfSlow, logSourceDetected } from "../src/vendor/open-knowledge/app/src/editor/clipboard/instrument.ts";

test("剪贴板日志记录检测来源、超阈值用时和转换失败", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const clock = vi.spyOn(performance, "now");
  const paste = { op: "paste", view: "wysiwyg", source: "gdocs", branch: "C" } as const;
  try {
    logSourceDetected(paste);

    clock.mockReturnValueOnce(249).mockReturnValueOnce(250);
    logIfSlow(0, paste);
    logIfSlow(0, { ...paste, htmlBytes: 512 });

    logConversionFail({ ...paste, stage: "htmlToMdast", reason: "payload too large", errorClass: "HtmlPayloadTooLargeError", htmlBytes: 512 });

    expect(warn.mock.calls.map(([message]) => JSON.parse(String(message)))).toEqual([
      { event: "clipboard-source-detected", view: "wysiwyg", source: "gdocs", branch: "C" },
      { event: "clipboard-slow-op", op: "paste", view: "wysiwyg", elapsedMs: 250, source: "gdocs", branch: "C", htmlBytes: 512 },
      { event: "clipboard-html-conversion-failed", view: "wysiwyg", stage: "htmlToMdast", source: "gdocs", branch: "C", reason: "payload too large", errorClass: "HtmlPayloadTooLargeError", htmlBytes: 512 },
    ]);
  } finally {
    clock.mockRestore();
    warn.mockRestore();
  }
});
