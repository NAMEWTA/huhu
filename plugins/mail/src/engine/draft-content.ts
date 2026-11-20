import { z } from "zod";
import { attachmentRefs } from "./draft-attachments.js";
import { replyContext } from "./reply-context.js";

export const uuid = z.uuidv4().toLowerCase();
export const draftRecipient = z.string().trim().toLowerCase().max(254).pipe(z.email());
const recipients = z.array(draftRecipient).max(1_000);
const maxBodyBytes = 1024 * 1024;

// Tiptap/ProseMirror document JSON. Preserve editor node and mark attributes as supplied.
const editorAttributes = z.record(z.string(), z.json());
const editorMark = z.strictObject({ type: z.string().min(1), attrs: editorAttributes.optional() });
type EditorNode = {
  type: string;
  attrs?: z.infer<typeof editorAttributes> | undefined;
  marks?: z.infer<typeof editorMark>[] | undefined;
  text?: string | undefined;
  content?: EditorNode[] | undefined;
};
const editorNode: z.ZodType<EditorNode> = z.lazy(() =>
  z.strictObject({
    type: z.string().min(1),
    attrs: editorAttributes.optional(),
    marks: z.array(editorMark).optional(),
    text: z.string().optional(),
    content: z.array(editorNode).optional(),
  }),
);
const editorDocument = z
  .strictObject({ type: z.literal("doc"), attrs: editorAttributes.optional(), content: z.array(editorNode).optional() })
  .refine((doc) => Buffer.byteLength(JSON.stringify(doc)) <= maxBodyBytes, "富文本草稿不能超过 1 MiB");

export const draftContent = z.strictObject({
  accountId: uuid.nullable(),
  to: recipients,
  cc: recipients,
  bcc: recipients,
  subject: z.string().max(8192),
  body: editorDocument,
  reply: replyContext.optional(),
});
export const storedDraftContent = draftContent.extend({ attachments: attachmentRefs.optional() });
export type DraftContent = z.infer<typeof draftContent>;
export type StoredDraftContent = z.infer<typeof storedDraftContent>;

const textBlocks = new Set(["paragraph", "heading", "codeBlock"]);

export function draftPlainText(body: DraftContent["body"]): string {
  const lines: string[] = [];
  function append(node: EditorNode): void {
    if (node.text !== undefined) lines.push(node.text);
    if (node.type === "hardBreak") lines.push("\n");
    for (const child of node.content ?? []) append(child);
    if (textBlocks.has(node.type)) lines.push("\n");
  }
  append(body);
  return lines.join("");
}
