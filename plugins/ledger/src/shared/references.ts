import { z } from "zod";
import { BookRef, BookVersion } from "./books.js";
import { EntryId } from "./entries.js";
import { ReportQuery } from "./reports.js";

const owner = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("book") }), z.strictObject({ kind: z.literal("budget"), id: EntryId }), z.strictObject({ kind: z.literal("record"), id: EntryId })]);
const resource = z.strictObject({ kind: z.enum(["note", "archive"]), path: z.string().min(1).max(4096) });
const documentRef = resource.extend({ documentId: z.string().min(1).max(256).nullable() });

export const Reference = z.strictObject({ id: EntryId, owner, resource: documentRef });
export const ReferenceView = Reference.extend({ status: z.enum(["available", "missing", "notes-disabled"]) });
export const ReferenceQuery = BookRef.extend({ owner });
export const ReferenceList = z.strictObject({ revision: z.string(), rows: z.array(ReferenceView) });
export const OpenReference = ReferenceQuery.extend({ referenceId: EntryId });
export const SetReference = BookVersion.extend({ owner, resource, replaceId: EntryId.optional() });
export const RemoveReference = BookVersion.extend({ owner, referenceId: EntryId });
export const ReviewDraft = z.strictObject({ revision: z.string(), markdown: z.string() });
export const SaveReview = ReportQuery.safeExtend({ expectedRevision: z.string().min(1), name: z.string().trim().min(1).max(100) });
export const ReviewNote = z.object({ path: z.string().min(1), id: z.string().min(1) });

export type Reference = z.infer<typeof Reference>;
export type ReferenceView = z.infer<typeof ReferenceView>;
export type ReferenceOwner = z.infer<typeof owner>;
export type DocumentRef = z.infer<typeof documentRef>;
