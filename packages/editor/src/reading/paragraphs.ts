// Restrict the projection to prose whose OK parse is a sequence of unmarked
// paragraphs. Keep Markdown punctuation, whitespace at paragraph boundaries,
// and unknown structures on the full parser path.
const prose = /^[\p{L}\p{M}\p{N} ，。！？、；：「」『』（）]+$/u;

export function readParagraphs(value: string): string[] | null {
  const paragraphs = value.split(/\r?\n\r?\n/);
  return paragraphs.every((text) => text.trim() === text && prose.test(text)) ? paragraphs : null;
}

/** The OK Markdown serializer's output for a slice of unmarked paragraphs. */
export function serializeParagraphSlice(lines: readonly string[]): string {
  let result = "";
  for (const line of lines) {
    if (!line) {
      result += "\n";
      continue;
    }
    const text = line.replace(/^ /, "&#x20;").trimEnd();
    if (result && !result.endsWith("\n\n") && result.trim()) result += "\n";
    result += text + "\n";
  }
  return result.trim() ? result : "\n";
}
