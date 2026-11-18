// 附件上传的纯规则（notes.attach 与单测共用）：类型 / 大小限制、文件名清理、去重命名。
// 类型集合来自上游 OK 的 `core/src/constants/upload.ts`（图片 / 视频 / 音频 / PDF / 常见文档与压缩包）。

export const MAX_ATTACH_BYTES = 25 * 1024 * 1024;
/** 笔记旁的附件目录名（相对笔记所在目录）。 */
export const ATTACH_DIR = "attachments";

const EXTENSIONS: ReadonlySet<string> = new Set([
  // 图片
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  // 视频 / 音频
  "mp4",
  "webm",
  "mov",
  "m4v",
  "mkv",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
  "aac",
  "opus",
  // 文档 / 压缩包 / 数据
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "doc",
  "xls",
  "ppt",
  "zip",
  "7z",
  "tar",
  "gz",
  "rar",
  "csv",
  "tsv",
  "rtf",
  "json",
  "yaml",
  "yml",
  "xml",
  "txt",
  "pages",
  "numbers",
  "key",
]);

export const extensionOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
};

export const isAllowedAttachment = (name: string): boolean => EXTENSIONS.has(extensionOf(name));

/** 取文件名主体：去掉目录部分、控制字符与 Windows 不允许的字符；结果为空时给出兜底名。 */
export function sanitizeAttachmentName(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = [...base]
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"|?*'.includes(ch))
    .join("")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "attachment";
}

/** `a.png` 已被占用 → `a-1.png`、`a-2.png`…（`taken` 返回该名字在目标目录里是否已存在）。 */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; n < 10_000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error("无法为附件生成不重复的文件名");
}

/** 受保护目录：附件不能写进这些位置。 */
export const PROTECTED_SEGMENTS: ReadonlySet<string> = new Set([".huhu", ".git", ".agents", "node_modules"]);
export const hasProtectedSegment = (rel: string): boolean => rel.split("/").some((s) => PROTECTED_SEGMENTS.has(s.toLowerCase()));
