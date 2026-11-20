import { expect, test } from "vitest";
import { applyMarkdownFileDelta, markdownFileBody, restoreMarkdownFileEnvelope } from "../src/host/markdown-file-envelope";

test.each(["first\r\nSECOND\r\n", "\uFEFFfirst\r\nSECOND\nthird\r"])("source offsets and original separators agree for %j", (file) => {
  const body = markdownFileBody(file);
  expect(body).not.toMatch(/[\r\uFEFF]/);
  expect(restoreMarkdownFileEnvelope(file, body.replace("SECOND", "XECOND"), false)).toBe(file.replace("SECOND", "XECOND"));
});

test("mixed separators follow actual editing offsets when adjacent lines repeat", () => {
  const file = "\uFEFFsame\r\nsame\nsame\r";
  expect(applyMarkdownFileDelta(file, [{ delete: 5 }])).toBe("\uFEFFsame\nsame\r");
  expect(applyMarkdownFileDelta(file, [{ retain: 5 }, { delete: 5 }])).toBe("\uFEFFsame\r\nsame\r");
});
