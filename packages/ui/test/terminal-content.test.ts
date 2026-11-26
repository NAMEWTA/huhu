// @vitest-environment jsdom
import { Terminal } from "@xterm/xterm";
import { expect, test } from "vitest";
import { searchTerminal, terminalHighlightViewport, terminalHttpUrl, terminalLinks } from "../src/components/terminal-content.js";
import { matchTerminalHighlights, validTerminalPattern } from "../src/components/terminal-highlight-patterns.js";

const write = (terminal: Terminal, text: string) => new Promise<void>((resolve) => terminal.write(text, resolve));

test("keyword decoration maps only requested rows and preserves the width of CJK cells", async () => {
  const terminal = new Terminal({ cols: 30, rows: 3 });
  try {
    await write(terminal, "世界\r\n前 世界 世界\r\n世界");
    const view = terminalHighlightViewport(terminal.buffer.active, 30, 1, 1);
    expect(view.ranges(matchTerminalHighlights(view.text, [{ pattern: "世界", mode: "literal", enabled: true }]))).toEqual([
      { start: { x: 3, y: 1 }, end: { x: 7, y: 1 }, ruleIndex: 0 },
      { start: { x: 8, y: 1 }, end: { x: 12, y: 1 }, ruleIndex: 0 },
    ]);
  } finally {
    terminal.dispose();
  }
});

test("ordered rules match visible soft and hard line breaks, with earlier rules owning overlaps", async () => {
  const terminal = new Terminal({ cols: 8, rows: 4 });
  try {
    await write(terminal, "1234567世界\r\nEND.42\r\nquiet");
    const viewport = terminalHighlightViewport(terminal.buffer.active, 8, 0, 3);
    expect(viewport.text).toBe("1234567世界\nEND.42");
    const matches = matchTerminalHighlights(viewport.text, [
      { pattern: String.raw`7世界\nEND\.`, mode: "regex", enabled: true },
      { pattern: "世界", mode: "literal", enabled: true },
      { pattern: "42", mode: "literal", enabled: false },
      { pattern: "42", mode: "literal", enabled: true },
    ]);
    expect(viewport.ranges(matches)).toEqual([
      { start: { x: 6, y: 0 }, end: { x: 7, y: 0 }, ruleIndex: 0 },
      { start: { x: 0, y: 1 }, end: { x: 4, y: 1 }, ruleIndex: 0 },
      { start: { x: 0, y: 2 }, end: { x: 4, y: 2 }, ruleIndex: 0 },
      { start: { x: 4, y: 2 }, end: { x: 6, y: 2 }, ruleIndex: 3 },
    ]);
    expect(validTerminalPattern({ pattern: "[", mode: "regex", enabled: true })).toBe(false);
    expect(matchTerminalHighlights(".42", [{ pattern: ".", mode: "literal", enabled: true }])).toEqual([{ offset: 0, length: 1, ruleIndex: 0 }]);
    await write(terminal, "\u001b[?1049h\u001b[Hpart\r\nend");
    expect(terminal.buffer.active.type).toBe("alternate");
    const alternate = terminalHighlightViewport(terminal.buffer.active, 8, 0, 2);
    expect(alternate.ranges(matchTerminalHighlights(alternate.text, [{ pattern: "part\nend", mode: "literal", enabled: true }]))).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, ruleIndex: 0 },
      { start: { x: 0, y: 1 }, end: { x: 3, y: 1 }, ruleIndex: 0 },
    ]);
  } finally {
    terminal.dispose();
  }
});

test("scrollback searches past the viewport, wraps the results and maps wide Unicode cells", async () => {
  const terminal = new Terminal({ cols: 16, rows: 3, scrollback: 30 });
  try {
    await write(terminal, "前缀 match\r\nnext row\r\nlast match\r\nrow 4\r\nrow 5\r\n");
    expect(terminal.buffer.active.viewportY).toBeGreaterThan(0);
    const current = searchTerminal(terminal.buffer.active, terminal.cols, "match", "next");
    expect(current).toEqual({ start: { x: 5, y: 0 }, end: { x: 10, y: 0 } });
    const next = searchTerminal(terminal.buffer.active, terminal.cols, "match", "next", current?.start);
    expect(next?.start).toEqual({ x: 5, y: 2 });
    expect(searchTerminal(terminal.buffer.active, terminal.cols, "match", "next", next?.start)).toEqual(current);
    expect(searchTerminal(terminal.buffer.active, terminal.cols, "match", "previous", current?.start)).toEqual(next);
  } finally {
    terminal.dispose();
  }
});

test("search and URL ranges span wrapped rows in the same live terminal", async () => {
  const terminal = new Terminal({ cols: 15, rows: 6 });
  try {
    await write(terminal, "12345678901234世界\r\n(https://example.invalid/a).\r\n");
    const match = searchTerminal(terminal.buffer.active, terminal.cols, "4世界", "next");
    expect(match).toEqual({ start: { x: 13, y: 0 }, end: { x: 4, y: 1 } });
    const link = terminalLinks(terminal.buffer.active, terminal.cols, 2);
    expect(link).toEqual([{ text: "https://example.invalid/a", range: { start: { x: 1, y: 2 }, end: { x: 11, y: 3 } } }]);
    expect(terminalLinks(terminal.buffer.active, terminal.cols, 3)).toEqual(link);
    expect(terminalHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(terminalHttpUrl("https://editor.invalid@external.invalid/")).toBeUndefined();
    expect(terminalHttpUrl("https://example.invalid/a")).toBe("https://example.invalid/a");
  } finally {
    terminal.dispose();
  }
});
