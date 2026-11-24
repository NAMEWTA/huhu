import { jsonLanguage } from "@codemirror/lang-json";

/**
 * 纯文本 / JSON 文件的“字节保真”辅助（F02）：编码、BOM、换行、JSON 诊断与显式格式化。
 * 全部是纯函数：会话永远保存原样字符串，编辑器只在显示层剥离 BOM / 选择行分隔符，写回时逐字节还原。
 */

export type Eol = "lf" | "crlf" | "cr" | "mixed" | "none";

export interface PlainTextFormat {
  bom: boolean;
  eol: Eol;
  /** 末尾是否有换行（只用于提示，不改写）。 */
  finalNewline: boolean;
}

export const BOM = "﻿";

export function detectPlainFormat(text: string): PlainTextFormat {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const eol: Eol = kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf > 0 ? "crlf" : lf > 0 ? "lf" : "cr";
  return { bom: text.startsWith(BOM), eol, finalNewline: /[\r\n]$/.test(text) };
}

/** 显示给编辑器的文本：剥掉 BOM（编辑器里不可见且不该被删掉）。 */
export const stripBom = (text: string): string => (text.startsWith(BOM) ? text.slice(1) : text);

/** 编辑器内容 → 写回会话的文本：BOM 原样还原。 */
export const restoreBom = (edited: string, hadBom: boolean): string => (hadBom ? BOM + edited : edited);

/** CodeMirror 的 lineSeparator：只有纯 CRLF / 纯 CR 才需要；混合换行不能无损编辑，editable=false 表示只读。 */
export function lineSeparatorFor(eol: Eol): { separator: string | null; editable: boolean } {
  switch (eol) {
    case "crlf":
      return { separator: "\r\n", editable: true };
    case "cr":
      return { separator: "\r", editable: true };
    case "mixed":
      return { separator: null, editable: false };
    default:
      return { separator: null, editable: true };
  }
}

/** 严格 UTF-8 校验：字节流里有非法序列（例如 GBK 文件）→ false。 */
export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export type JsonDiagnostic = { ok: true } | { ok: false; message: string; position: number | null };

export function diagnoseJson(text: string): JsonDiagnostic {
  try {
    JSON.parse(stripBom(text));
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const m = /position (\d+)/.exec(message);
    return { ok: false, message, position: m ? Number(m[1]) : null };
  }
}

/** 推断缩进（制表符或 1–8 个空格），默认 2 空格；只在显式“格式化”时使用。 */
export function guessJsonIndent(text: string): string | number {
  const m = /^[ \t]+(?=\S)/m.exec(stripBom(text));
  if (!m) return 2;
  return m[0].includes("\t") ? "\t" : Math.min(8, m[0].length) || 2;
}

export type FormatResult = { ok: true; text: string } | { ok: false; message: string };

const MAX_FORMATTED_JSON_LENGTH = 8 * 1024 * 1024;

/**
 * 使用 CodeMirror 的 JSON 语法树定位源 token，只替换 token 之间的结构空白。
 */
export function formatJsonText(text: string): FormatResult {
  const fmt = detectPlainFormat(text);
  const diag = diagnoseJson(text);
  if (!diag.ok) return { ok: false, message: diag.message };
  const { editable, separator } = lineSeparatorFor(fmt.eol);
  if (!editable) return { ok: false, message: "文件使用混合换行，无法在保留换行风格时格式化" };

  const source = stripBom(text);
  const eol = separator ?? "\n";
  const style = guessJsonIndent(text);
  const indent = typeof style === "number" ? " ".repeat(style) : style;
  const cursor = jsonLanguage.parser.parse(source).cursor();
  let formatted = fmt.bom ? BOM : "";
  const finalNewline = fmt.finalNewline ? eol : "";
  let depth = 0;
  let previous = "";
  do {
    if (cursor.type.isError) return { ok: false, message: "JSON 结构无法无损格式化" };
    if (cursor.node.firstChild) continue;

    const kind = cursor.name;
    const closes = kind === "}" || kind === "]";
    if (closes) depth--;
    const afterOpen = previous === "{" || previous === "[";
    const newLine = previous === "," || (afterOpen && !closes) || (closes && !afterOpen);
    const spaceLength = newLine ? eol.length + depth * indent.length : previous === ":" ? 1 : 0;
    // Deeply nested JSON can expand quadratically when indented.
    if (formatted.length + spaceLength + cursor.to - cursor.from + finalNewline.length > MAX_FORMATTED_JSON_LENGTH) {
      return { ok: false, message: "格式化后的 JSON 超过编辑大小上限" };
    }
    if (newLine) formatted += eol + indent.repeat(depth);
    else if (previous === ":") formatted += " ";
    formatted += source.slice(cursor.from, cursor.to);
    if (kind === "{" || kind === "[") depth++;
    previous = kind;
  } while (cursor.next());
  return { ok: true, text: formatted + finalNewline };
}
