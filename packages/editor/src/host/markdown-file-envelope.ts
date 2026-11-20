import DiffMatchPatch from "diff-match-patch";

const BOM = "\uFEFF";
const lineEndings = /\r\n|\r|\n/g;
const finalLineEnding = /(?:\r\n|\r|\n)$/;
const diff = new DiffMatchPatch();

export function markdownFileBody(text: string): string {
  return (text.startsWith(BOM) ? text.slice(1) : text).replace(lineEndings, "\n");
}

/** The editor uses LF offsets. The host restores the separators of surviving line breaks. */
export function restoreMarkdownFileEnvelope(source: string, body: string, preserveFinalNewline = true): string {
  const bom = source.startsWith(BOM) ? BOM : "";
  const endings = source.match(lineEndings) ?? [];
  const ending = endings[0] ?? "\n";
  body = body.replace(lineEndings, "\n");
  if (bom && preserveFinalNewline && body.endsWith("\n") && !finalLineEnding.test(source)) {
    body = body.slice(0, -1);
  }
  if (endings.every((next) => next === ending)) return bom + body.replaceAll("\n", ending);

  // Match the normalized buffers so edits inside a line preserve its separator too.
  let line = 0;
  let previousEnding = ending;
  return (
    bom +
    diff
      .diff_main(markdownFileBody(source), body, false)
      .map(([operation, text]) => {
        if (operation === DiffMatchPatch.DIFF_INSERT) return text.replaceAll("\n", previousEnding);
        const restored = text.replaceAll("\n", () => (previousEnding = endings[line++] ?? ending));
        return operation === DiffMatchPatch.DIFF_DELETE ? "" : restored;
      })
      .join("")
  );
}

export function hasMixedMarkdownLineEndings(source: string): boolean {
  const endings = source.match(lineEndings) ?? [];
  return endings.some((ending) => ending !== endings[0]);
}

type TextDelta = readonly { retain?: number; delete?: number; insert?: unknown }[];

/** Apply editing offsets to the original mixed separators before coalescing edits. */
export function applyMarkdownFileDelta(source: string, changes: TextDelta): string | null {
  const hasBom = source.startsWith(BOM);
  let offset = hasBom ? 1 : 0;
  let ending = source.match(lineEndings)?.[0] ?? "\n";
  let file = hasBom ? BOM : "";
  for (const change of changes) {
    if (change.insert !== undefined) {
      if (typeof change.insert !== "string") return null;
      file += change.insert.replace(lineEndings, ending);
      continue;
    }
    const start = offset;
    const count = change.retain ?? change.delete ?? 0;
    for (let consumed = 0; consumed < count; consumed++) {
      if (offset >= source.length) return null;
      const c = source[offset++];
      if (c === "\r" || c === "\n") {
        const separator = c === "\r" && source[offset] === "\n" ? c + source[offset++] : c;
        if (change.retain !== undefined) ending = separator;
      }
    }
    if (change.retain !== undefined) file += source.slice(start, offset);
  }
  return file + source.slice(offset);
}
