export const legacyTextEncodings = ["gb18030", "big5", "windows-1252", "shift_jis", "utf-16le", "utf-16be"] as const;
export type LegacyTextEncoding = (typeof legacyTextEncodings)[number];

export const unsupportedEncoding = "这个文件不是有效的 UTF-8 文本，转换为 UTF-8 后才能编辑。";

/** 可作为纯文本编辑的扩展名（旧 FileCard 文本扩展名表的超集（FileCard 已删除）；json / html 单独分派）。 */
const TEXT_EXT = new Set([
  "txt",
  "log",
  "csv",
  "tsv",
  "mmd",
  "mermaid",
  "md",
  "mdx",
  "markdown",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "xml",
  "css",
  "scss",
  "less",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "env",
  "gitignore",
  "lock",
  "jsonc",
  "json5",
]);
export const MARKDOWN_EXT = new Set(["md", "mdx", "markdown"]);
const DOTFILE_TEXT = new Set([".gitignore", ".gitattributes", ".editorconfig", ".env", ".npmrc", ".prettierrc"]);

export const TEXT_LIMIT = 1024 * 1024; // 文本在应用内编辑的上限 1 MiB（ACC-KN-10：不把大文件当文本加载）
export const HTML_LIMIT = 8 * 1024 * 1024;
/** Markdown 笔记的上限：笔记是产品的主格式，大文档以源码优先方式打开（S3 P-S3-01），不适用 ACC-KN-10 的 1 MiB（那条约束的是非 Markdown 文件）。 */
export const NOTE_LIMIT = 16 * 1024 * 1024;
export const NO_EXT_TEXT_PROBE_LIMIT = 64 * 1024;

export function textViewerLimit(rel: string): number | null {
  const name = rel.split("/").at(-1) ?? rel;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (MARKDOWN_EXT.has(ext)) return NOTE_LIMIT;
  if (ext === "html" || ext === "htm") return HTML_LIMIT;
  if (ext === "json" || TEXT_EXT.has(ext) || DOTFILE_TEXT.has(name.toLowerCase())) return TEXT_LIMIT;
  return ext ? null : NO_EXT_TEXT_PROBE_LIMIT;
}
