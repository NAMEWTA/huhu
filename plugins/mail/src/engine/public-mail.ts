import { z } from "zod";
import { draftRecipient } from "./draft-content.js";
import { addresses, rootHeaders } from "./prepare-reply.js";
import { rfcMessageId } from "./reply-context.js";

export const publicMail = z.strictObject({ participants: z.array(draftRecipient), internetId: rfcMessageId.optional(), date: z.iso.datetime().optional() });

export async function readPublicMail(source: Buffer) {
  const headers = await rootHeaders(source);
  const participants = [...new Set(["From", "To", "Cc"].flatMap((field) => addresses(headers, field)))];
  const [field, ...duplicates] = headers.get("Message-ID");
  const id = field && !duplicates.length ? rfcMessageId.safeParse(field.slice(field.indexOf(":") + 1).trim()) : undefined;
  const date = Date.parse(headers.getFirst("Date"));
  const timestamp = Number.isFinite(date) ? z.iso.datetime().safeParse(new Date(date).toISOString()) : undefined;
  return { participants, ...(id && id.success && { internetId: id.data }), ...(timestamp?.success && { date: timestamp.data }) };
}
