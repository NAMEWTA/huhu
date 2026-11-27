import type { IDisposable, Terminal } from "@xterm/xterm";
import { terminalHighlightViewport } from "./terminal-content.js";
import { matchTerminalHighlights, type HighlightMatch, type TerminalHighlightPattern } from "./terminal-highlight-patterns.js";

export function observeTerminalHighlights(term: Terminal, element: HTMLElement, rules: () => readonly TerminalHighlightPattern[]) {
  // xterm's decoration API only supports the normal buffer. Its screen box
  // measures the active character grid independently of padding and scrollbars.
  const screen = term.element?.querySelector(".xterm-screen");
  const alternate = document.createElement("div");
  alternate.className = "hu-terminal-highlight-layer";
  alternate.setAttribute("aria-hidden", "true");
  let decorations: IDisposable[] = [];
  let frame: number | undefined;
  let worker: Worker | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let excludedRules: readonly TerminalHighlightPattern[] | undefined;
  let cached: { rules: readonly TerminalHighlightPattern[]; row: number; cols: number; text: string; matches: HighlightMatch[] } | undefined;

  const clearDecorations = () => {
    for (const decoration of decorations) decoration.dispose();
    decorations = [];
    alternate.replaceChildren();
    alternate.remove();
  };
  const stopWorker = () => {
    clearTimeout(deadline);
    deadline = undefined;
    worker?.terminate();
    worker = undefined;
  };
  function schedule() {
    frame ??= window.requestAnimationFrame(refresh);
  }
  function refresh() {
    frame = undefined;
    const buffer = term.buffer.active;
    const patterns = rules();
    if (!patterns.some(({ enabled }) => enabled)) {
      clearDecorations();
      return;
    }
    const row = buffer.viewportY;
    const cols = term.cols;
    const viewport = terminalHighlightViewport(buffer, cols, row, term.rows);
    if (!cached || cached.row !== row || cached.cols !== cols || cached.text !== viewport.text || cached.rules !== patterns) {
      if (excludedRules !== patterns && patterns.some(({ enabled, mode }) => enabled && mode === "regex")) {
        if (deadline !== undefined) return;
        const failed = () => {
          excludedRules = patterns;
          stopWorker();
          schedule();
        };
        try {
          worker ??= new Worker(new URL("./terminal-highlight.worker.ts", import.meta.url), { type: "module" });
          worker.onerror = failed;
          worker.onmessage = ({ data }: MessageEvent<HighlightMatch[]>) => {
            clearTimeout(deadline);
            deadline = undefined;
            cached = { rules: patterns, row, cols, text: viewport.text, matches: data };
            schedule();
          };
          deadline = setTimeout(failed, 500);
          worker.postMessage({ text: viewport.text, rules: patterns });
        } catch {
          failed();
        }
        return;
      }
      const safe = patterns.map((rule) => (rule.mode === "regex" ? { ...rule, enabled: false } : rule));
      cached = { rules: patterns, row, cols, text: viewport.text, matches: matchTerminalHighlights(viewport.text, safe) };
    }
    clearDecorations();
    const theme = getComputedStyle(element);
    const backgroundColor = theme.getPropertyValue("--warning-bg").trim();
    const foregroundColor = theme.getPropertyValue("--warning-text").trim();
    const cursorRow = buffer.baseY + buffer.cursorY;
    for (const { start, end, ruleIndex } of viewport.ranges(cached.matches)) {
      if (buffer.type === "alternate") {
        const cell = document.createElement("span");
        cell.dataset.terminalHighlight = String(ruleIndex);
        cell.style.left = `${(start.x / cols) * 100}%`;
        cell.style.top = `${((start.y - row) / term.rows) * 100}%`;
        cell.style.width = `${((end.x - start.x) / cols) * 100}%`;
        cell.style.height = `${100 / term.rows}%`;
        alternate.append(cell);
        continue;
      }
      const marker = term.registerMarker(start.y - cursorRow);
      if (!marker) continue;
      const decoration = term.registerDecoration({ marker, x: start.x, width: end.x - start.x, ...(backgroundColor && { backgroundColor }), ...(foregroundColor && { foregroundColor }) });
      decoration?.onRender((node) => {
        node.dataset.terminalHighlight = String(ruleIndex);
      });
      decorations.push(marker);
    }
    if (alternate.childElementCount) screen?.append(alternate);
  }

  const events = [term.onWriteParsed(schedule), term.onScroll(schedule), term.onResize(schedule), term.buffer.onBufferChange(schedule)];
  return {
    schedule,
    update() {
      stopWorker();
      clearDecorations();
      cached = undefined;
      schedule();
    },
    dispose() {
      stopWorker();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      clearDecorations();
      for (const event of events) event.dispose();
    },
  };
}
