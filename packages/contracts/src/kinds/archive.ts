import { z } from "zod";
import { HuhuHeaderSchema, IsoTime, dateLike } from "./common.js";

export const ArchiveFieldDefSchema = z.object({ id: z.string().min(1), label: z.string().min(1), type: z.enum(["text", "date", "url", "number"]) });

export const ArchiveTypeFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("archive-type"),
  name: z.string().min(1),
  icon: z.string().default("folder"),
  fields: z.array(ArchiveFieldDefSchema).default([]),
});
export type ArchiveTypeFrontmatter = z.infer<typeof ArchiveTypeFrontmatterSchema>;

export const ArchiveFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("archive"),
  name: z.string().min(1),
  type: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
  relatedIds: z.array(z.string()).default([]),
  noteIds: z.array(z.string()).default([]),
  updatedAt: dateLike(IsoTime),
});
export type ArchiveFrontmatter = z.infer<typeof ArchiveFrontmatterSchema>;
