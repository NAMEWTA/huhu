export const legacyTextEncodings = ["gb18030", "big5", "windows-1252", "shift_jis", "utf-16le", "utf-16be"] as const;
export type LegacyTextEncoding = (typeof legacyTextEncodings)[number];

export const unsupportedEncoding = "这个文件不是有效的 UTF-8 文本，转换为 UTF-8 后才能编辑。";
