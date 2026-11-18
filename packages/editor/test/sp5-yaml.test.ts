// SP-5：OK 的 frontmatter YAML 编解码（yaml-codec）与 Huhu 的 patchFrontmatter 对拍。
// 目的：登记两套实现对同一输入的差异，决定“只留一份”的方案（design §10 / OP-D17）。运行：pnpm exec vitest run packages/editor/test/e2e/sp5-yaml.test.ts（需要 packages/vault 可导入）
import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { parseDocument } from "yaml";
import { applyPatchToDocument, parseFrontmatterYaml } from "../src/vendor/open-knowledge/core/src/frontmatter/yaml-codec";
import { parseFrontmatter, patchFrontmatter } from "../../vault/src/semantic/frontmatter";

const CASES: Array<{ id: string; text: string; patch: Record<string, unknown> }> = [
  { id: "false", text: "---\nflag: false\n---\nbody\n", patch: { flag: true } },
  { id: "zero", text: "---\ncount: 0\n---\nbody\n", patch: { count: 1 } },
  { id: "empty-string", text: '---\ntitle: ""\n---\nbody\n', patch: { title: "x" } },
  { id: "null", text: "---\nowner: null\n---\nbody\n", patch: { owner: "me" } },
  { id: "leading-zero", text: "---\ncode: 007\n---\nbody\n", patch: { code: "008" } },
  { id: "partial-date", text: "---\nwhen: 2026-11\n---\nbody\n", patch: { when: "2026-12" } },
  { id: "array", text: "---\ntags:\n  - a\n  - b\n---\nbody\n", patch: { tags: ["a", "b", "c"] } },
  { id: "nested", text: "---\nmeta:\n  a: 1\n  b:\n    c: 2\n---\nbody\n", patch: { meta: { a: 2, b: { c: 3 } } } },
  { id: "comment", text: "---\n# keep me\ntitle: T # trailing\n---\nbody\n", patch: { title: "U" } },
  { id: "unknown-key", text: "---\nzzz: 1\ntitle: T\n---\nbody\n", patch: { title: "U" } },
  { id: "crlf", text: "---\r\ntitle: T\r\n---\r\nbody\r\n", patch: { title: "U" } },
  { id: "bom", text: "\uFEFF---\ntitle: T\n---\nbody\n", patch: { title: "U" } },
];

function okPatch(text: string, patch: Record<string, unknown>): string {
  const m = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return text;
  const doc = parseDocument(m[2] ?? "");
  const yaml = applyPatchToDocument(doc, patch);
  return `${m[1]}---\n${yaml.replace(/\n$/, "")}\n---\n${m[4]}`;
}

test.skipIf(!process.env.SP5_OUT)("SP-5 yaml 对拍（设置 SP5_OUT=<输出路径> 才运行）", () => {
  const rows = CASES.map((c) => {
    let huhu = "";
    let ok = "";
    let huhuErr = "";
    let okErr = "";
    try {
      huhu = patchFrontmatter(c.text, c.patch);
    } catch (e) {
      huhuErr = String(e);
    }
    try {
      ok = okPatch(c.text, c.patch);
    } catch (e) {
      okErr = String(e);
    }
    let parseHuhu: unknown = null;
    let parseOk: unknown = null;
    try {
      parseHuhu = parseFrontmatter(c.text);
    } catch {}
    try {
      parseOk = parseFrontmatterYaml(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(c.text)?.[1] ?? "");
    } catch {}
    return { id: c.id, same: huhu === ok && !huhuErr && !okErr, huhu, ok, huhuErr, okErr, parseHuhu, parseOk };
  });
  writeFileSync(process.env.SP5_OUT!, JSON.stringify(rows, null, 2));
});
