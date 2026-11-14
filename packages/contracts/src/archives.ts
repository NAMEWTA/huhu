import { z } from "zod";

/** 档案字段类型。判定与存储都只看路径与 frontmatter：`Archives/<类型>/index.md` 是字段模板，`Archives/<类型>/<名称>/index.md` 存字段值。 */
export const ARCHIVE_FIELD_TYPES = ["text", "date", "url", "number"] as const;
export type ArchiveFieldType = (typeof ARCHIVE_FIELD_TYPES)[number];

/** 字段名不能使用的键：笔记索引会另作解释（title 覆盖显示名、tags 进入标签索引……）。 */
export const RESERVED_FIELD_NAMES = ["title", "tags", "aliases", "__proto__", "constructor"] as const;

export const ArchiveFieldDefSchema = z.object({ name: z.string(), type: z.enum(ARCHIVE_FIELD_TYPES) });
export type ArchiveFieldDef = z.infer<typeof ArchiveFieldDefSchema>;

/** 规范化字段名：去首尾空白并做 NFC。 */
export const normalizeFieldName = (name: string): string => name.trim().normalize("NFC");

/** 字段名问题（null = 合法）。 */
export function fieldNameProblem(name: string): string | null {
  if (!name) return "字段名不能为空";
  if (/[:#\n\r]/.test(name)) return "字段名不能包含 : # 或换行";
  const lower = name.toLowerCase();
  if ((RESERVED_FIELD_NAMES as readonly string[]).includes(lower) || lower.startsWith("huhu")) return `「${name}」是保留名，不能用作字段名`;
  return null;
}

const httpUrl = (v: unknown) => typeof v === "string" && /^https?:\/\/[^\s]+$/i.test(v);
/** 字段值问题（null = 合法；空值跳过）。沿用旧的校验规则，提示中带字段名。 */
export function fieldValueProblem(def: ArchiveFieldDef, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (def.type === "url" && !httpUrl(value)) return `「${def.name}」需要 http(s) 链接`;
  if (def.type === "number" && typeof value !== "number" && Number.isNaN(Number(value))) return `「${def.name}」需要数字`;
  if (def.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `「${def.name}」日期格式应为 YYYY-MM-DD`;
  return null;
}

export const ArchiveTypeDtoSchema = z.object({
  /** `Archives/<类型>/`（结尾带 /）。 */
  path: z.string(),
  name: z.string(),
  icon: z.string(),
  fields: z.array(ArchiveFieldDefSchema),
  /** 类型下的档案数。 */
  count: z.number().int(),
  /** index.md 在笔记模块中的稳定 id；还没有 index.md 或尚未分配时为 null。 */
  noteId: z.string().nullable(),
});
export type ArchiveTypeDto = z.infer<typeof ArchiveTypeDtoSchema>;

export const ArchiveDtoSchema = z.object({
  /** `Archives/<类型>/<名称>/`（结尾带 /）。 */
  path: z.string(),
  name: z.string(),
  /** 所属类型的路径。 */
  type: z.string(),
  /** 字段值：键为模板中的字段名；文本字段取 YAML 标量原文（`电话: 0123` 读出 "0123"）。 */
  fields: z.record(z.string(), z.unknown()),
  /** 模板里没有、但 index.md 里仍有的键。 */
  undefinedFields: z.array(z.string()),
  /** 值不合法的字段（直接改文件写入的值仍会读出，视图标红）。 */
  invalidFields: z.array(z.object({ name: z.string(), reason: z.string() })),
  noteId: z.string().nullable(),
  updatedAt: z.string(),
});
export type ArchiveDto = z.infer<typeof ArchiveDtoSchema>;

export const ArchiveFileSchema = z.object({ path: z.string(), name: z.string(), kind: z.enum(["note", "file", "folder"]) });
export const ArchiveDetailDtoSchema = ArchiveDtoSchema.extend({
  body: z.string(),
  /** index.md 当前版本；还没有 index.md 时为 null（第一次保存字段时创建）。 */
  version: z.string().nullable(),
  files: z.array(ArchiveFileSchema),
  /** index.md 正文中的出链。 */
  outgoing: z.array(z.object({ target: z.string(), exists: z.boolean() })),
  /** 档案文件夹外部指向该文件夹或其中文件的笔记。 */
  backlinks: z.array(z.object({ path: z.string(), title: z.string() })),
});
export type ArchiveDetailDto = z.infer<typeof ArchiveDetailDtoSchema>;
