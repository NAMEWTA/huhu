import type { IBuffer, IBufferLine, IBufferRange } from "@xterm/xterm";

type TerminalPosition = IBufferRange["start"];
type Part = { row: number; line: IBufferLine; offset: number; text: string };

function readLine(buffer: IBuffer, cols: number, row: number) {
  const parts: Part[] = [];
  let text = "";
  while (row < buffer.length) {
    const line = buffer.getLine(row);
    if (!line) break;
    const next = buffer.getLine(row + 1);
    const wrapped = next?.isWrapped ?? false;
    const padding = wrapped && next?.getCell(0)?.getWidth() === 2 && line.getCell(cols - 1)?.getChars() === "";
    const value = line.translateToString(!wrapped, 0, padding ? cols - 1 : cols);
    parts.push({ row, line, offset: text.length, text: value });
    text += value;
    row++;
    if (!wrapped) break;
  }
  return { parts, text, nextRow: row };
}

function toCell(part: Part, offset: number, cols: number, end: boolean): number {
  if (offset <= 0) return 0;
  let position = 0;
  for (let column = 0; column < cols; column++) {
    const cell = part.line.getCell(column);
    if (!cell) break;
    const width = cell.getWidth();
    if (width === 0) continue;
    const next = position + (cell.getChars().length || 1);
    if (offset < next) return column + (end ? width : 0);
    if (offset === next) return column + width;
    position = next;
  }
  return cols;
}

function range(parts: readonly Part[], cols: number, offset: number, size: number): IBufferRange {
  const start = parts.findLast(({ offset: begin }) => begin <= offset)!;
  const endOffset = offset + size;
  const final = parts.findLast(({ offset: begin }) => begin < endOffset)!;
  return {
    start: { x: toCell(start, offset - start.offset, cols, false), y: start.row },
    end: { x: toCell(final, endOffset - final.offset, cols, true), y: final.row },
  };
}

export function searchTerminal(buffer: IBuffer, cols: number, query: string, direction: "next" | "previous", origin?: TerminalPosition): IBufferRange | undefined {
  if (!query) return;
  let fallback: IBufferRange | undefined;
  let nearest: IBufferRange | undefined;
  const forward = direction === "next";
  for (let row = 0; row < buffer.length;) {
    const { parts, text, nextRow } = readLine(buffer, cols, row);
    if (nextRow <= row) break;
    const outer = forward ? text.indexOf(query) : text.lastIndexOf(query);
    if (outer >= 0) {
      if (!fallback || !forward) fallback = range(parts, cols, outer, query.length);
      if (!origin) {
        if (forward) return fallback;
      } else if (origin.y >= row && origin.y < nextRow) {
        const part = parts[origin.y - row]!;
        const offset = part.offset + part.line.translateToString(false, 0, origin.x).length;
        if (forward || offset > 0) {
          const found = forward ? text.indexOf(query, offset + 1) : text.lastIndexOf(query, offset - 1);
          if (found >= 0) {
            nearest = range(parts, cols, found, query.length);
            if (forward) return nearest;
          }
        }
      } else if (forward ? row > origin.y : nextRow <= origin.y) {
        nearest = range(parts, cols, outer, query.length);
        if (forward) return nearest;
      }
    }
    row = nextRow;
  }
  return nearest ?? fallback;
}

export function terminalHttpUrl(value: string): string | undefined {
  if (value.length > 4096 || /[\p{Cc}\s]/u.test(value) || !/^https?:\/\//iu.test(value)) return;
  try {
    const url = new URL(value);
    if (url.username || url.password || !url.hostname) return;
    return url.href;
  } catch {
    return;
  }
}

export function terminalLinks(buffer: IBuffer, cols: number, row: number): { range: IBufferRange; text: string }[] {
  let first = row;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first--;
  const { parts, text } = readLine(buffer, cols, first);
  return [...text.matchAll(/https?:\/\/[^\s<>"'`]+/giu)].flatMap((match) => {
    let value = match[0].replace(/[.,;!?]+$/gu, "");
    let extra = value.split(")").length - value.split("(").length;
    while (extra-- > 0 && value.endsWith(")")) value = value.slice(0, -1);
    if (!terminalHttpUrl(value)) return [];
    const position = range(parts, cols, match.index, value.length);
    return position.start.y <= row && position.end.y >= row ? [{ range: position, text: value }] : [];
  });
}
