import { contextEvidenceFloor, contextMatchScore, rewriteCeiling } from "./passage-match.js";

export interface Anchor {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

const DEFAULT_CONTEXT_LEN = 32;

export interface Span {
  start: number;
  end: number;
}

export type RefindResult =
  | {
      status: "anchored";
      start: number;
      end: number;
      rewritten?: boolean;
    }
  | { status: "orphaned" };

export function createAnchor(body: string, start: number, end: number, contextLen: number = DEFAULT_CONTEXT_LEN): Anchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > body.length || start >= end) {
    throw new Error(`invalid selection range [${start}, ${end}) for body length ${body.length}`);
  }
  const exact = body.slice(start, end);
  let prefix = body.slice(Math.max(0, start - contextLen), start);
  let suffix = body.slice(end, Math.min(body.length, end + contextLen));

  if (countOccurrences(body, exact) > 1) {
    let len = contextLen;
    while (!isUniqueTriple(body, prefix, exact, suffix) && len < body.length) {
      len = Math.min(len * 2, body.length);
      prefix = body.slice(Math.max(0, start - len), start);
      suffix = body.slice(end, Math.min(body.length, end + len));
    }
  }
  return { exact, prefix, suffix, start, end };
}

export function bestByContext<T extends Span>(body: string, hits: readonly T[], context: { prefix?: string; suffix?: string }, { contextIsMarkdown = false }: { contextIsMarkdown?: boolean } = {}): T[] {
  const prefix = context.prefix ?? "";
  const suffix = context.suffix ?? "";
  let best: T[] = [];
  let bestScore = -1;
  for (const hit of hits) {
    const score = contextMatchScore(body, hit, { prefix, suffix }, { syntaxIn: "haystack", syntaxInContext: contextIsMarkdown });
    if (score > bestScore) {
      bestScore = score;
      best = [hit];
    } else if (score === bestScore) {
      best.push(hit);
    }
  }
  return best;
}

export function refind(body: string, anchor: Anchor): RefindResult {
  const { exact, prefix, suffix, start } = anchor;
  const end = start + exact.length;

  if (end <= body.length && body.slice(start, end) === exact) {
    return { status: "anchored", start, end };
  }

  if (prefix !== "" && suffix !== "" && !body.includes(prefix + exact + suffix) && body.includes(prefix + suffix)) {
    return { status: "orphaned" };
  }

  const hits = allOccurrences(body, exact);
  if (hits.length === 0) return refindBetweenBrackets(body, anchor);
  const floor = contextEvidenceFloor(anchor, { syntaxInContext: true });
  const evidence = (span: Span): boolean => floor === 0 || contextMatchScore(body, span, { prefix, suffix }, { syntaxIn: "haystack", syntaxInContext: true }) >= floor;
  const only = hits[0];
  if (hits.length === 1 && only !== undefined) {
    const span = { start: only, end: only + exact.length };
    if (!evidence(span)) return refindBetweenBrackets(body, anchor);
    return { status: "anchored", start: span.start, end: span.end };
  }

  const best = bestByContext(
    body,
    hits.map((h) => ({ start: h, end: h + exact.length })),
    { prefix, suffix },
    { contextIsMarkdown: true },
  );
  const top = best[0];
  if (top === undefined || !evidence(top)) return refindBetweenBrackets(body, anchor);
  if (best.length === 1) {
    return { status: "anchored", start: top.start, end: top.end };
  }

  let nearest: Span[] = [];
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const h of best) {
    const d = Math.abs(h.start - start);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = [h];
    } else if (d === nearestDist) {
      nearest.push(h);
    }
  }
  const near = nearest[0];
  if (nearest.length === 1 && near !== undefined) {
    return { status: "anchored", start: near.start, end: near.end };
  }
  return { status: "orphaned" };
}

function refindBetweenBrackets(body: string, anchor: Anchor): RefindResult {
  const { prefix, suffix, exact } = anchor;
  const starts = prefix === "" ? [0] : allOccurrences(body, prefix).map((i) => i + prefix.length);
  const ends = suffix === "" ? [body.length] : allOccurrences(body, suffix);
  if (starts.length !== 1 || ends.length !== 1) return { status: "orphaned" };

  const start = starts[0];
  const end = ends[0];
  if (start === undefined || end === undefined) return { status: "orphaned" };
  if (end < start) return { status: "orphaned" };
  if (end === start) return { status: "orphaned" };
  const ceiling = rewriteCeiling(exact.length);
  if (end - start > ceiling) return { status: "orphaned" };
  return { status: "anchored", start, end, rewritten: true };
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + 1);
  }
  return count;
}

function allOccurrences(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (needle === "") return out;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

function isUniqueTriple(body: string, prefix: string, exact: string, suffix: string): boolean {
  return countOccurrences(body, prefix + exact + suffix) === 1;
}
