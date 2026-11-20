import { isMap, isScalar } from "yaml";
import { decodeFrontmatterYaml, encodeFrontmatterYaml, encodePatchedFrontmatterYaml, FRONTMATTER_RE, replaceFencedYaml, setFrontmatterValue } from "./frontmatter-codec.js";

export interface SplitDoc {
  bom: string;
  eol: "\n" | "\r\n";
  /** frontmatter 文本（不含分隔线）；无 frontmatter 时为 null。 */
  yaml: string | null;
  /** 正文（含开头换行之后的全部内容）。 */
  body: string;
}

/** 拆分文档。无 frontmatter 或未闭合时 yaml 为 null，body 为全文（去 BOM）。 */
export function splitDocument(text: string): SplitDoc {
  const bom = text.startsWith("﻿") ? "﻿" : "";
  const src = bom ? text.slice(1) : text;
  const eol: "\n" | "\r\n" = src.includes("\r\n") ? "\r\n" : "\n";
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { bom, eol, yaml: null, body: src };
  return { bom, eol, yaml: match[2] ?? "", body: text.slice(match[0].length) };
}

export function joinDocument(d: SplitDoc): string {
  if (d.yaml === null) return d.bom + d.body;
  return d.bom + replaceFencedYaml(d.yaml, "", d.eol) + d.body;
}

export interface ParsedFrontmatter {
  doc: SplitDoc;
  data: Record<string, unknown>;
  /** YAML 语法错误；有错误时不可写。 */
  errors: string[];
}

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const doc = splitDocument(text);
  if (doc.yaml === null) return { doc, data: {}, errors: [] };
  const ydoc = decodeFrontmatterYaml(doc.yaml);
  const errors = ydoc.errors.map((e) => e.message);
  const js = errors.length ? {} : (ydoc.toJS() as unknown);
  const data = js && typeof js === "object" && !Array.isArray(js) ? (js as Record<string, unknown>) : {};
  return { doc, data, errors };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 局部改写：只修改 `changes` 中值确实变化的顶层键（值为 undefined 表示删除）。
 * 未知键、注释、键顺序、正文、换行符与 BOM 原样保留；没有实际变化时原样返回输入。
 */
export function patchFrontmatter(text: string, changes: Record<string, unknown>, opts: { quoted?: readonly string[] } = {}): string {
  const split = splitDocument(text);
  const ydoc = decodeFrontmatterYaml(split.yaml ?? "");
  if (ydoc.errors.length) throw new Error(`frontmatter 无法解析：${ydoc.errors[0]?.message}`);
  const current = (ydoc.toJS() ?? {}) as Record<string, unknown>;
  const changed: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined ? !Object.hasOwn(current, k) : sameJson(current[k], v)) continue;
    if (!isMap(ydoc.contents) && split.yaml !== null && split.yaml.trim() !== "") throw new Error("frontmatter 顶层不是映射");
    if (v === undefined) ydoc.delete(k);
    else setFrontmatterValue(ydoc, [k], v, typeof v === "string" && opts.quoted?.includes(k));
    changed.push(k);
  }
  if (changed.length === 0) return text;
  const yaml = encodePatchedFrontmatterYaml(ydoc, split.yaml ?? "", changed, split.eol);
  return rewriteYaml(text, split, yaml);
}

/** 替换正文，保留 frontmatter 字节。 */
export function replaceBody(text: string, body: string): string {
  const split = splitDocument(text);
  if (split.yaml === null) return split.bom + body;
  const idx = text.length - split.body.length;
  return text.slice(0, idx) + body;
}

/** 顶层标量的 YAML 原文（`电话: 0123` 读出 "0123" 而不是数字 123）；非标量与语法错误的文档不返回。 */
export function frontmatterScalarSources(text: string): Record<string, string> {
  const split = splitDocument(text);
  if (split.yaml === null) return {};
  const ydoc = decodeFrontmatterYaml(split.yaml);
  const out: Record<string, string> = {};
  if (ydoc.errors.length || !isMap(ydoc.contents)) return out;
  for (const pair of ydoc.contents.items) if (isScalar(pair.key) && isScalar(pair.value) && pair.value.source !== undefined) out[String(pair.key.value)] = pair.value.source;
  return out;
}

/** 顶层键改名并保持位置：键值对在原处改名，其余键、注释与顺序不变。目标键已存在或文档无法解析时抛错。 */
export function renameFrontmatterKeys(text: string, renames: readonly { from: string; to: string }[]): string {
  const split = splitDocument(text);
  if (split.yaml === null) return text;
  const ydoc = decodeFrontmatterYaml(split.yaml);
  if (ydoc.errors.length) throw new Error(`frontmatter 无法解析：${ydoc.errors[0]?.message}`);
  if (!isMap(ydoc.contents)) return text;
  const pairs = ydoc.contents.items;
  let changed = false;
  for (const { from, to } of renames) {
    if (from === to) continue;
    const pair = pairs.find((x) => isScalar(x.key) && x.key.value === from);
    if (!pair) continue;
    if (pairs.some((x) => isScalar(x.key) && x.key.value === to)) throw new Error(`目标键「${to}」已存在`);
    (pair.key as { value: unknown }).value = to;
    changed = true;
  }
  if (!changed) return text;
  const yaml = encodeFrontmatterYaml(ydoc);
  return rewriteYaml(text, split, split.eol === "\r\n" ? yaml.replace(/\n/g, "\r\n") : yaml);
}

function rewriteYaml(text: string, split: SplitDoc, yaml: string): string {
  if (split.yaml === null) return joinDocument({ ...split, yaml });
  return replaceFencedYaml(yaml, text, split.eol) + split.body;
}
