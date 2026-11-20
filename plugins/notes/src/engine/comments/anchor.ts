import { contextEvidenceFloor, contextMatchScore, findAllPassages, markdownPassageText, rewriteCeiling } from "./passage-match.js";

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

export function refind(body: string, anchor: Anchor, bodyOffset = 0): RefindResult {
  const { exact, prefix, suffix } = anchor;

  if (prefix !== "" && suffix !== "" && !body.includes(prefix + exact + suffix) && body.includes(prefix + suffix)) {
    return { status: "orphaned" };
  }

  const literal = allOccurrences(body, exact)
    .filter((start) => start >= bodyOffset)
    .map((start) => ({ start, end: start + exact.length }));
  const rendered = markdownPassageText(exact);
  const byStart = new Map(
    findAllPassages(body, rendered)
      .filter((hit) => hit.start >= bodyOffset)
      .map((hit) => [hit.start, hit]),
  );
  for (const hit of literal) byStart.set(hit.start, hit);
  if (byStart.size === 0) return refindBetweenBrackets(body, anchor, bodyOffset);

  const best = bestByContext(body, [...byStart.values()], anchor, { contextIsMarkdown: true });
  const top = best[0];
  if (best.length !== 1 || top === undefined) return { status: "orphaned" };
  const floor = contextEvidenceFloor(anchor, { syntaxInContext: true });
  const score = contextMatchScore(body, top, anchor, { syntaxIn: "haystack", syntaxInContext: true });
  if (score < floor) return { status: "orphaned" };
  return { status: "anchored", start: top.start, end: top.end };
}

function refindBetweenBrackets(body: string, anchor: Anchor, bodyOffset: number): RefindResult {
  const { prefix, suffix, exact } = anchor;
  if (prefix === "" && suffix === "") return { status: "orphaned" };
  const starts =
    prefix === ""
      ? [bodyOffset]
      : allOccurrences(body, prefix)
          .map((i) => i + prefix.length)
          .filter((start) => start >= bodyOffset);
  const ends = suffix === "" ? [body.length] : allOccurrences(body, suffix).filter((end) => end >= bodyOffset);
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
