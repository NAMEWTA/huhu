const BOM = "\uFEFF";
const lineEndings = /\r\n|\r|\n/g;
const finalLineEnding = /(?:\r\n|\r|\n)$/;

function uniformLineEnding(text: string): string | undefined {
  const endings = text.match(lineEndings) ?? [];
  const ending = endings[0];
  return endings.every((next) => next === ending) ? ending : undefined;
}

export function markdownFileBody(text: string): string {
  if (!text.startsWith(BOM)) return text;
  const body = text.slice(1);
  return uniformLineEnding(body) ? body.replace(lineEndings, "\n") : body;
}

/** The OK bridge sees Markdown, while the host owns the file marker and its line endings. */
export function restoreMarkdownFileEnvelope(source: string, body: string, preserveFinalNewline = true): string {
  if (!source.startsWith(BOM)) return body;
  const ending = uniformLineEnding(source);
  if (ending) body = body.replace(lineEndings, ending);
  if (preserveFinalNewline && finalLineEnding.test(body) && !finalLineEnding.test(source)) {
    body = body.replace(finalLineEnding, "");
  }
  return BOM + body;
}
