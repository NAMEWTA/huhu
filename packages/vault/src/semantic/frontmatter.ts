import { parseDocument, isMap, isScalar, type Document } from "yaml";

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
  const m = /^---[ \t]*\r?\n/.exec(src);
  if (!m) return { bom, eol, yaml: null, body: src };
  const rest = src.slice(m[0].length);
  const end = /^---[ \t]*(\r?\n|$)/m.exec(rest);
  if (!end) return { bom, eol, yaml: null, body: src };
  return { bom, eol, yaml: rest.slice(0, end.index), body: rest.slice(end.index + end[0].length) };
}

export function joinDocument(d: SplitDoc): string {
  if (d.yaml === null) return d.bom + d.body;
  const y = d.yaml.endsWith("\n") || d.yaml === "" ? d.yaml : d.yaml + d.eol;
  return `${d.bom}---${d.eol}${y}---${d.eol}${d.body}`;
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
  const ydoc = parseDocument(doc.yaml);
  const errors = ydoc.errors.map((e) => e.message);
  const js = errors.length ? {} : (ydoc.toJS() as unknown);
  const data = js && typeof js === "object" && !Array.isArray(js) ? (js as Record<string, unknown>) : {};
  return { doc, data, errors };
}

function setPath(ydoc: Document, keyPath: string[], value: unknown): void {
  if (value === undefined) ydoc.deleteIn(keyPath);
  else {
    const node = ydoc.getIn(keyPath, true);
    // 标量原地改值，保留行尾注释与样式
    if (isScalar(node) && (value === null || typeof value !== "object")) node.value = value;
    else ydoc.setIn(keyPath, ydoc.createNode(value));
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 局部改写：只修改 `changes` 中值确实变化的顶层键（值为 undefined 表示删除）。
 * 未知键、注释、键顺序、正文、换行符与 BOM 原样保留；没有实际变化时原样返回输入。
 */
export function patchFrontmatter(text: string, changes: Record<string, unknown>): string {
  const split = splitDocument(text);
  const ydoc = parseDocument(split.yaml ?? "");
  if (ydoc.errors.length) throw new Error(`frontmatter 无法解析：${ydoc.errors[0]?.message}`);
  const current = (ydoc.toJS() ?? {}) as Record<string, unknown>;
  let changed = false;
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined ? !(k in current) : sameJson(current[k], v)) continue;
    if (!isMap(ydoc.contents) && split.yaml !== null && split.yaml.trim() !== "") throw new Error("frontmatter 顶层不是映射");
    setPath(ydoc, [k], v);
    changed = true;
  }
  if (!changed) return text;
  let out = ydoc.toString({ lineWidth: 0 });
  if (split.eol === "\r\n") out = out.replace(/\r?\n/g, "\r\n");
  return joinDocument({ ...split, yaml: out });
}

/** 替换正文，保留 frontmatter 字节。 */
export function replaceBody(text: string, body: string): string {
  const split = splitDocument(text);
  if (split.yaml === null) return split.bom + body;
  const idx = text.length - split.body.length;
  return text.slice(0, idx) + body;
}
