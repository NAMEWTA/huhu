import { Document, isMap, isScalar, isSeq, parseDocument, type Scalar, type ScalarTag, type SchemaOptions, type ToStringOptions } from "yaml";
import { type StringifyContext, stringifyString } from "yaml/util";

/**
 * HUHU P-S3-04（spec C02）：带前导零的数字样文本（`007`、`0123`）按**文本**读写并原样保留。
 * 上游的 `yaml` core schema 把 `007` 读成整数 7，用户只改了别的键，保存时它被悄悄改写成 `7`。
 */
const LEADING_ZERO_TEXT = /^[-+]?0[0-9]+$/;
const leadingZeroText = {
  tag: "tag:yaml.org,2002:int",
  default: true,
  identify: (value: unknown) => typeof value === "string" && LEADING_ZERO_TEXT.test(value),
  test: LEADING_ZERO_TEXT,
  resolve: (str: string) => str,
  // 作者显式加了引号（"007" / '007'）的标量保持原引号写法：去掉引号会让别的 YAML 读取器把它读成整数 7
  stringify: (item: Scalar, ctx: StringifyContext, onComment?: () => void, onChompKeep?: () => void) =>
    item.type === "QUOTE_DOUBLE" || item.type === "QUOTE_SINGLE" ? stringifyString(item, ctx, onComment, onChompKeep) : String(item.value),
};
const CODEC_SCHEMA_OPTIONS: SchemaOptions = {
  // 放在核心 schema 之前：核心的 int 标签会先匹配 `007`
  customTags: (tags) => [leadingZeroText as unknown as ScalarTag, ...tags],
};

const STRINGIFY_OPTIONS: ToStringOptions = {
  defaultKeyType: "PLAIN",
  defaultStringType: "PLAIN",
  lineWidth: 0,
};

export function decodeFrontmatterYaml(source: string, uniqueKeys = true): Document {
  return parseDocument(source, { ...CODEC_SCHEMA_OPTIONS, uniqueKeys });
}

export function encodeFrontmatterYaml(doc: Document): string {
  return doc.toString(STRINGIFY_OPTIONS);
}

export function createFrontmatterDocument(map: Record<string, unknown> = {}): Document {
  return new Document(map, CODEC_SCHEMA_OPTIONS);
}

export function setFrontmatterValue(doc: Document, path: readonly (string | number)[], value: unknown, quote = false): void {
  const existing = doc.getIn(path, true);
  if (isScalar(existing) && (value === null || typeof value !== "object")) {
    existing.value = value;
    if (quote) existing.type = "QUOTE_DOUBLE";
    return;
  }
  const node = doc.createNode(value);
  if (isSeq(existing) && isSeq(node) && existing.flow !== undefined) node.flow = existing.flow;
  if (isMap(existing) && isMap(node) && existing.flow !== undefined) node.flow = existing.flow;
  if (quote && isScalar(node)) node.type = "QUOTE_DOUBLE";
  doc.setIn(path, node);
}

/** Reuse the original lexemes around edited, single-line scalar values. */
export function encodePatchedFrontmatterYaml(doc: Document, source: string, keys: readonly string[], eol = "\n"): string {
  const serialized = encodeFrontmatterYaml(doc);
  const fallback = serialized.replace(/\n/g, eol);
  if (keys.length === 0) return source;
  const rendered = decodeFrontmatterYaml(serialized, false);
  const edits: { start: number; end: number; value: string }[] = [];
  for (const key of keys) {
    const before = doc.get(key, true);
    const after = rendered.get(key, true);
    if (!isScalar(before) || !before.range || !isScalar(after) || !after.range) return fallback;
    const [start, end] = before.range;
    const value = serialized.slice(after.range[0], after.range[1]);
    if (start === end || /[\r\n]/.test(value) || /[\r\n]/.test(source.slice(start, end))) return fallback;
    edits.push({ start, end, value });
  }
  let result = source;
  for (const { start, end, value } of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + value + result.slice(end);
  }
  return result;
}

// Capture the exact delimiters so an update does not respell either fence.
export const FRONTMATTER_RE = /^(\uFEFF?---[ \t]*\r?\n)((?:[\s\S]*?\r?\n)?)(---[ \t]*(?:\r?\n|$))/;

export function replaceFencedYaml(yaml: string, previous: string, eol: string): string {
  const match = FRONTMATTER_RE.exec(previous);
  const opening = match?.[1] ?? `---${eol}`;
  const closing = match?.[3] ?? `---${eol}`;
  const contents = yaml === "" || yaml.endsWith("\n") ? yaml : yaml + eol;
  return opening + contents + closing;
}
