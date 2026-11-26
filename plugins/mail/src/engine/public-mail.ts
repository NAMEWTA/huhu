import { z } from "zod";
import { draftRecipient } from "./draft-content.js";
import { addresses, mailboxes, rootHeaders } from "./prepare-reply.js";
import { rfcMessageId } from "../shared/reply-context.js";

export const publicMail = z.strictObject({ participants: z.array(draftRecipient), senderNames: z.array(z.string().min(1).max(200)).max(10).optional(), internetId: rfcMessageId.optional(), date: z.iso.datetime().optional() });

export async function readPublicMail(source: Buffer) {
  return publicMailHeaders(await rootHeaders(source));
}

export async function cachedPublicMail(entry: { publicMail?: z.infer<typeof publicMail> | undefined; source: string }, includeSenderNames = false) {
  const cached = entry.publicMail;
  if (cached && (!includeSenderNames || cached.senderNames)) return cached;
  return (await readPublicMail(Buffer.from(entry.source, "base64")).catch(() => undefined)) ?? cached;
}

export function publicMailHeaders(headers: Awaited<ReturnType<typeof rootHeaders>>) {
  const from = mailboxes(headers, "From");
  const participants = [...new Set([...from.map(({ address }) => address), ...addresses(headers, "To"), ...addresses(headers, "Cc")])];
  const senderNames = [...new Set(from.flatMap(({ name }) => (name ? [name.slice(0, 200)] : [])))].slice(0, 10);
  const [field, ...duplicates] = headers.get("Message-ID");
  const id = field && !duplicates.length ? rfcMessageId.safeParse(field.slice(field.indexOf(":") + 1).trim()) : undefined;
  const date = Date.parse(headers.getFirst("Date"));
  const timestamp = Number.isFinite(date) ? z.iso.datetime().safeParse(new Date(date).toISOString()) : undefined;
  return { participants, senderNames, ...(id && id.success && { internetId: id.data }), ...(timestamp?.success && { date: timestamp.data }) };
}
