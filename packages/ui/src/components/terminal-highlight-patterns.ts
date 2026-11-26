export type TerminalHighlightPattern = { pattern: string; mode: "literal" | "regex"; enabled: boolean };
export type HighlightMatch = { offset: number; length: number; ruleIndex: number };

export function validTerminalPattern(pattern: TerminalHighlightPattern) {
  if (!pattern.pattern.trim()) return false;
  if (pattern.mode === "literal") return true;
  try {
    new RegExp(pattern.pattern, "gu");
    return true;
  } catch {
    return false;
  }
}

export function matchTerminalHighlights(text: string, rules: readonly TerminalHighlightPattern[]): HighlightMatch[] {
  const matches: HighlightMatch[] = [];
  for (const [ruleIndex, rule] of rules.entries()) {
    if (!rule.enabled || !validTerminalPattern(rule)) continue;
    const pattern = rule.mode === "literal" ? rule.pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") : rule.pattern;
    for (const match of text.matchAll(new RegExp(pattern, "gu"))) {
      const offset = match.index;
      const length = match[0].length;
      if (!length || matches.some((prior) => offset < prior.offset + prior.length && offset + length > prior.offset)) continue;
      matches.push({ offset, length, ruleIndex });
      if (matches.length >= 64) return matches;
    }
  }
  return matches;
}
