import { addsBlankLines, normalizeBridge } from "../vendor/open-knowledge/core/src/bridge/normalize";
import { stripFrontmatter } from "../vendor/open-knowledge/core/src/extensions/frontmatter";

/** Same tolerance as OK persistence, with exact frontmatter for Huhu property edits. */
export function markdownSemanticallyUnchanged(baseline: string, current: string): boolean {
  return stripFrontmatter(baseline).frontmatter === stripFrontmatter(current).frontmatter && normalizeBridge(baseline) === normalizeBridge(current) && !addsBlankLines(baseline, current);
}
