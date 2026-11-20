// S3 / spec C02：frontmatter 编解码对“看起来像数字的文本”与类型化值的保真（P-S3-04）。
import { describe, expect, test } from "vitest";
import { Doc } from "yjs";
import { parseFrontmatter } from "../../vault/src/semantic/frontmatter";
import { bindFrontmatterDoc } from "../src/vendor/open-knowledge/core/src/bridge/bind-frontmatter-doc";
import { readFmMap } from "../src/vendor/open-knowledge/core/src/bridge/frontmatter-region";
import { applyPatchToDocument, parseFrontmatterYaml } from "../src/vendor/open-knowledge/core/src/frontmatter/yaml-codec";

function patch(yaml: string, p: Record<string, unknown>): string {
  const parsed = parseFrontmatterYaml(yaml);
  return applyPatchToDocument(parsed.doc, p);
}

describe("frontmatter 保真", () => {
  test("前导零文本不被改写成数字", () => {
    expect(patch("title: a\nzip: 007\n", { title: "b" })).toBe("title: b\nzip: 007\n");
  });

  test("读出的值是文本", () => {
    const parsed = parseFrontmatterYaml("zip: 007\ncode: 0123\n");
    expect(parsed.map).toEqual({ zip: "007", code: "0123" });
  });

  test('显式加引号的 "007" 保持引号', () => {
    expect(patch('title: a\nq: "007"\n', { title: "b" })).toBe('title: b\nq: "007"\n');
  });

  test("false / 0 / 空字符串 / null 与普通整数不受影响", () => {
    const out = patch('a: false\nb: 0\nc: ""\nd: null\ne: 12\n', { z: "x" });
    expect(out).toContain("a: false");
    expect(out).toContain("b: 0");
    expect(out).toContain('c: ""');
    expect(out).toContain("d: null");
    expect(out).toContain("e: 12");
  });

  test("注释与未知键原样保留", () => {
    const out = patch("# keep me\ntitle: T # trailing\nzzz: 1\n", { title: "U" });
    expect(out).toContain("# keep me");
    expect(out).toContain("zzz: 1");
    expect(out).toContain("title: U");
  });
});

test("Vault 与属性绑定将 zip: 007 读为文本", () => {
  const source = "---\nzip: 007\n---\n";
  expect(parseFrontmatter(source).data).toEqual({ zip: "007" });
  expect(readFmMap(source)).toEqual({ zip: "007" });
});

test.each([
  ["BOM", "\uFEFF", "\n"],
  ["CRLF", "", "\r\n"],
  ["BOM + CRLF", "\uFEFF", "\r\n"],
])("属性绑定改值保留 %s 和其余文本", (_name, bom, eol) => {
  const original = bom + ["---", "title: Old", "when: 2026-11", "---", "", "Body", ""].join(eol);
  const doc = new Doc();
  try {
    const source = doc.getText("source");
    source.insert(0, original);
    const binding = bindFrontmatterDoc({ document: doc, on() {}, off() {} });
    try {
      expect(binding.current().map).toEqual({ title: "Old", when: "2026-11" });
      expect(binding.patch({ title: "New" }).ok).toBe(true);
      expect(source.toString()).toBe(original.replace("title: Old", "title: New"));
      expect(binding.current().map.when).toBe("2026-11");
    } finally {
      binding.dispose();
    }
  } finally {
    doc.destroy();
  }
});

test("Vault 与属性绑定保留 YAML 多行文本的结尾换行", () => {
  const source = "---\ntitle: Old\nmemo: |+\n  line\n\n---\n";
  const expected = { title: "Old", memo: "line\n\n" };
  expect(parseFrontmatter(source).data).toEqual(expected);
  expect(readFmMap(source)).toEqual(expected);
});
