import { z } from "zod";
import { HuhuHeaderSchema, IsoTime, dateLike } from "./common.js";

export const CaptureFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("capture"),
  title: z.string().min(1),
  source: z.string().regex(/^(quick|note-excerpt|agent-cli|import|cli|mcp|http|plugin:[a-z][a-z0-9-]*)$/),
  status: z.enum(["pending", "processed", "dismissed"]),
  createdAt: dateLike(IsoTime),
  processedAt: dateLike(IsoTime).nullable().default(null),
  result: z.object({ kind: z.enum(["task", "note", "archive"]), id: z.string() }).nullable().default(null),
});
export type CaptureFrontmatter = z.infer<typeof CaptureFrontmatterSchema>;

export const CommentFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("comment"),
  documentId: z.string(),
  documentPath: z.string(),
  target: z.enum(["body", "file", "property"]),
  property: z.string().nullable().default(null),
  anchor: z
    .object({ exact: z.string(), prefix: z.string(), suffix: z.string(), start: z.number().int(), end: z.number().int(), sourceVersion: z.string() })
    .nullable()
    .default(null),
  state: z.enum(["anchored", "orphaned"]),
  resolved: z.boolean().default(false),
  createdAt: dateLike(IsoTime),
  updatedAt: dateLike(IsoTime),
});
export type CommentFrontmatter = z.infer<typeof CommentFrontmatterSchema>;
