import { extensionOf, fileIconKind } from "@huhu/ui";
import { MARKDOWN_EXT, NO_EXT_TEXT_PROBE_LIMIT, textViewerLimit } from "../../shared/text-encoding.js";

/**
 * 查看器分派（design §11.1）。扩展名大小写不敏感，类别判断与 `FileIcon` 同源（`@huhu/ui` 的映射表）；
 * 这里只补“哪些扩展名是可在应用内编辑的文本”。Markdown 不走这里（由 NoteDocument 打开）。
 */
export type ViewerKind = "text" | "json" | "html" | "pdf" | "image" | "unknown";

/** 为什么落到 unknown：用于给出准确提示，而不是笼统的“没有预览”。 */
export type UnknownReason = "too-large" | "unsupported";

export interface ViewerChoice {
  kind: ViewerKind;
  /** 仅文本类：在读取之后才能确定（无扩展名的小文件要先探测是否为文本）。 */
  probe?: boolean;
  reason?: UnknownReason;
  ext: string;
}

export { NOTE_LIMIT, NO_EXT_TEXT_PROBE_LIMIT, TEXT_LIMIT } from "../../shared/text-encoding.js";
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export const HTML_LIMIT = 8 * 1024 * 1024;

export const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon" };

export function chooseViewer(path: string, size: number): ViewerChoice {
  const name = path.split("/").at(-1) ?? path;
  const ext = extensionOf(name);
  const icon = fileIconKind(name);
  if (ext === "pdf") return { kind: "pdf", ext }; // 按范围读取，不受内存上限约束（上限在查看器内判断）
  if (ext === "html" || ext === "htm") return size > HTML_LIMIT ? { kind: "unknown", reason: "too-large", ext } : { kind: "html", ext };
  if (icon === "image" && ext in IMAGE_MIME) return size > IMAGE_LIMIT ? { kind: "unknown", reason: "too-large", ext } : { kind: "image", ext };
  const limit = textViewerLimit(name);
  if (limit && limit !== NO_EXT_TEXT_PROBE_LIMIT) return size > limit ? { kind: "unknown", reason: "too-large", ext } : { kind: ext === "json" ? "json" : "text", ext };
  // 无扩展名：小文件探测内容（含 NUL / 非 UTF-8 则按未知处理）
  if (ext === "" && size <= NO_EXT_TEXT_PROBE_LIMIT) return { kind: "text", probe: true, ext };
  return { kind: "unknown", reason: "unsupported", ext };
}

export const humanSize = (b: number): string => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GiB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB` : `${b} B`);

/** 超限提示里的上限文字（与上面的常量一一对应）。 */
export function limitLabel(ext: string): string {
  return ext === "html" || ext === "htm" ? "8 MiB" : ext in IMAGE_MIME ? "10 MiB" : MARKDOWN_EXT.has(ext) ? "16 MiB" : "1 MiB";
}
