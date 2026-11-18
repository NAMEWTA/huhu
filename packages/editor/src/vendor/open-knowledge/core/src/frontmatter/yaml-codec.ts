import {
  Document,
  isMap,
  isSeq,
  type Pair,
  parseDocument,
  type Scalar,
  type ScalarTag,
  type SchemaOptions,
  type ToStringOptions,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import { type StringifyContext, stringifyString } from 'yaml/util';
import { type FrontmatterMap, FrontmatterMapSchema, FrontmatterPatchSchema } from './schema.ts';

/**
 * HUHU P-S3-04（spec C02）：带前导零的数字样文本（`007`、`0123`）按**文本**读写并原样保留。
 * 上游的 `yaml` core schema 把 `007` 读成整数 7，用户只改了别的键，保存时它被悄悄改写成 `7`。
 */
const LEADING_ZERO_TEXT = /^[-+]?0[0-9]+$/;
const leadingZeroText = {
  tag: 'tag:yaml.org,2002:int',
  default: true,
  identify: (value: unknown) => typeof value === 'string' && LEADING_ZERO_TEXT.test(value),
  test: LEADING_ZERO_TEXT,
  resolve: (str: string) => str,
  // 作者显式加了引号（"007" / '007'）的标量保持原引号写法：去掉引号会让别的 YAML 读取器把它读成整数 7
  stringify: (
    item: Scalar,
    ctx: StringifyContext,
    onComment?: () => void,
    onChompKeep?: () => void,
  ) =>
    item.type === 'QUOTE_DOUBLE' || item.type === 'QUOTE_SINGLE'
      ? stringifyString(item, ctx, onComment, onChompKeep)
      : String(item.value),
};
export const CODEC_SCHEMA_OPTIONS: SchemaOptions = {
  // 放在核心 schema 之前：核心的 int 标签会先匹配 `007`
  customTags: (tags) => [leadingZeroText as unknown as ScalarTag, ...tags],
};

export const STRINGIFY_OPTIONS: ToStringOptions = {
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  lineWidth: 0,
};

export type ParsedFrontmatter =
  | { doc: Document; map: FrontmatterMap; parseError?: never }
  | { doc: Document; map: null; parseError: string };

export function parseFrontmatterYaml(yaml: string): ParsedFrontmatter {
  if (yaml.trim() === '') {
    return { doc: new Document({}), map: {} };
  }
  let doc: Document;
  try {
    doc = parseDocument(yaml, CODEC_SCHEMA_OPTIONS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc: new Document({}), map: null, parseError: `parse threw: ${msg}` };
  }
  if (doc.errors.length > 0) {
    return { doc, map: null, parseError: doc.errors[0]?.message ?? 'yaml parse errors' };
  }
  let json: unknown;
  try {
    json = doc.toJS();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc, map: null, parseError: `toJS threw: ${msg}` };
  }
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { doc, map: null, parseError: 'top-level value is not a mapping' };
  }
  const result = FrontmatterMapSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && Array.isArray(issue.path) ? issue.path.join('.') : '';
    const reason = issue?.message ?? 'unknown';
    return {
      doc,
      map: null,
      parseError: path
        ? `value at "${path}" failed schema: ${reason}`
        : `schema validation failed: ${reason}`,
    };
  }
  return { doc, map: result.data };
}

export function serializeFrontmatterMap(map: FrontmatterMap): string {
  if (Object.keys(map).length === 0) return '';
  const doc = new Document(map, CODEC_SCHEMA_OPTIONS);
  return doc.toString(STRINGIFY_OPTIONS);
}

export function applyPatchToDocument(doc: Document, patch: Record<string, unknown>): string {
  const result = FrontmatterPatchSchema.safeParse(patch);
  if (!result.success) {
    throw new Error(`Invalid frontmatter patch: ${result.error.message}`);
  }
  for (const [key, value] of Object.entries(result.data)) {
    if (value === null) {
      doc.delete(key);
      continue;
    }
    doc.set(key, buildValueNode(doc, doc.get(key, true), value));
  }
  return doc.toString(STRINGIFY_OPTIONS);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildValueNode(doc: Document, existing: unknown, data: unknown): unknown {
  if (Array.isArray(data)) {
    const node = doc.createNode(data) as YAMLSeq;
    const flow = isSeq(existing) ? (existing as YAMLSeq).flow : undefined;
    if (flow !== undefined) node.flow = flow;
    return node;
  }
  if (isPlainObject(data)) {
    const node = doc.createNode(data) as YAMLMap;
    const flow = isMap(existing) ? (existing as YAMLMap).flow : undefined;
    if (flow !== undefined) node.flow = flow;
    return node;
  }
  return data;
}

export function withFences(yamlBody: string): string {
  if (yamlBody === '') return '';
  const trimmed = yamlBody.endsWith('\n') ? yamlBody.slice(0, -1) : yamlBody;
  return `---\n${trimmed}\n---\n`;
}

export function getDocumentKeys(doc: Document): string[] {
  const contents = doc.contents;
  if (contents == null || typeof contents !== 'object' || !('items' in contents)) {
    return [];
  }
  const items = (contents as { items: Pair[] }).items;
  return items
    .map((pair) => {
      const key = pair.key as { value?: unknown } | string | undefined;
      if (typeof key === 'string') return key;
      if (key && typeof key === 'object' && 'value' in key && typeof key.value === 'string') {
        return key.value;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
