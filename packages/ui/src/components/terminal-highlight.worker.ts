import { matchTerminalHighlights, type TerminalHighlightPattern } from "./terminal-highlight-patterns.js";

globalThis.addEventListener("message", ({ data }: MessageEvent<{ text: string; rules: TerminalHighlightPattern[] }>) => {
  globalThis.postMessage(matchTerminalHighlights(data.text, data.rules));
});
