import { z } from "zod";

export const sourceMessage = z.strictObject({ accountId: z.uuid(), folder: z.string().min(1).max(1024), localMessageId: z.string().regex(/^[a-f0-9]{64}$/) });
export const rfcMessageId = z
  .string()
  .max(512)
  .regex(/^<[^\s<>@\p{Cc}]+@[^\s<>@\p{Cc}]+>$/u);
export const maxReferences = 32;
export const replyContext = sourceMessage.extend({
  subject: z.string().max(8192),
  mode: z.enum(["reply", "reply-all"]),
  inReplyTo: rfcMessageId.optional(),
  references: z.array(rfcMessageId).max(maxReferences),
});
