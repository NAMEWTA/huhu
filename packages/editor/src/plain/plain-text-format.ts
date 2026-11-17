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

/**
 * 显式格式化：解析失败返回错误且不产生任何文本（无效 JSON 永远不会被清空或改写）。
 * 保持原有换行风格、BOM 与末尾换行；保存路径**永不**调用本函数。
 */
export function formatJsonText(text: string): FormatResult {
  const fmt = detectPlainFormat(text);
  const diag = diagnoseJson(text);
  if (!diag.ok) return { ok: false, message: diag.message };
  const parsed: unknown = JSON.parse(stripBom(text));
  let out = JSON.stringify(parsed, null, guessJsonIndent(text));
  if (fmt.finalNewline) out += "\n";
  if (fmt.eol === "crlf") out = out.replace(/\n/g, "\r\n");
  if (fmt.eol === "cr") out = out.replace(/\n/g, "\r");
  return { ok: true, text: restoreBom(out, fmt.bom) };
}
