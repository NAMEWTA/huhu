import { expect, test } from "vitest";
import { parseFrontmatter, patchFrontmatter } from "../../vault/src/semantic/frontmatter";
import { readFmMap } from "../src/vendor/open-knowledge/core/src/bridge/frontmatter-region";

const samples = [
  { name: "false", yaml: "flag: false", vault: { flag: false } },
  { name: "zero", yaml: "count: 0", vault: { count: 0 } },
  { name: "empty-string", yaml: 'title: ""', vault: { title: "" } },
  { name: "null", yaml: "owner: null", vault: { owner: null }, panel: { owner: "" } },
  { name: "leading-zero", yaml: "code: 007", vault: { code: "007" } },
  { name: "partial-date", yaml: "when: 2026-11", vault: { when: "2026-11" } },
  { name: "array", yaml: "tags:\n  - a\n  - b", vault: { tags: ["a", "b"] } },
  { name: "nested", yaml: "meta:\n  a: 1\n  b:\n    c: 2", vault: { meta: { a: 1, b: { c: 2 } } } },
  { name: "comment", yaml: "# keep me\ntitle: T # trailing", vault: { title: "T" } },
  { name: "unknown-key", yaml: "zzz: 1\ntitle: T", vault: { zzz: 1, title: "T" } },
  { name: "crlf", yaml: "title: T", vault: { title: "T" }, eol: "\r\n" },
  { name: "bom", yaml: "title: T", vault: { title: "T" }, bom: "\uFEFF" },
  { name: "bom-crlf", yaml: "title: T", vault: { title: "T" }, bom: "\uFEFF", eol: "\r\n" },
];

test.each(samples)("SP5 / $name 读取与相邻编辑固定样本", ({ yaml, vault, panel = vault, bom = "", eol = "\n" }) => {
  const original = bom + ["---", yaml, "edited: before", "---", "", "body", ""].join("\n").replace(/\n/g, eol);
  expect(parseFrontmatter(original).data).toEqual({ ...vault, edited: "before" });
  expect(readFmMap(original)).toEqual({ ...panel, edited: "before" });
  const patched = patchFrontmatter(original, { edited: "after" });
  expect(patched).toBe(original.replace("edited: before", "edited: after"));
  expect(readFmMap(patched)).toEqual({ ...panel, edited: "after" });
});
