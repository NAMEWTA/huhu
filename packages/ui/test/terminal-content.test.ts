// @vitest-environment jsdom
import { Terminal } from "@xterm/xterm";
import { expect, test } from "vitest";
import { searchTerminal, terminalHttpUrl, terminalKeywordRanges, terminalLinks } from "../src/components/terminal-content.js";

const write = (terminal: Terminal, text: string) => new Promise<void>((resolve) => terminal.write(text, resolve));

test("keyword decoration maps only requested rows and preserves the width of CJK cells", async () => {
  const terminal = new Terminal({ cols: 30, rows: 3 });
  try {
    await write(terminal, "世界\r\n前 世界 世界\r\n世界");
    expect(terminalKeywordRanges(terminal.buffer.active, 30, 1, 1, "世界")).toEqual([
      { start: { x: 3, y: 1 }, end: { x: 7, y: 1 } },
      { start: { x: 8, y: 1 }, end: { x: 12, y: 1 } },
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
