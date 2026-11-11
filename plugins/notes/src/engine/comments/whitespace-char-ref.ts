const INLINE_WHITESPACE_BY_CODE: ReadonlyMap<number, string> = new Map([
  [0x20, " "],
  [0x09, "\t"],
  [0xa0, "\u00A0"],
]);

function numericCharRefCodePoint(ref: string): number | null {
  const match = /^&#(x[0-9A-Fa-f]+|X[0-9A-Fa-f]+|[0-9]+);$/.exec(ref);
  if (!match) return null;
  const body = match[1] ?? "";
  const hex = body[0] === "x" || body[0] === "X";
  const code = Number.parseInt(hex ? body.slice(1) : body, hex ? 16 : 10);
  return Number.isNaN(code) ? null : code;
}

export function decodeInlineWhitespaceNumericCharRef(ref: string): string | null {
  const code = numericCharRefCodePoint(ref);
  return code === null ? null : (INLINE_WHITESPACE_BY_CODE.get(code) ?? null);
}
