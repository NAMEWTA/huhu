import { Splitter, type Headers, type SplitterChunk } from "@zone-eu/mailsplit";
import addressParser from "nodemailer/lib/addressparser";
import { z } from "zod";
import { draftRecipient } from "./draft-content.js";
import { maxReferences, replyContext, rfcMessageId, sourceMessage } from "./reply-context.js";

type Origin = z.infer<typeof sourceMessage>;
export const replyMode = replyContext.shape.mode;
export const replySeed = z.strictObject({
  accountId: sourceMessage.shape.accountId,
  to: z.array(draftRecipient).max(1000),
  cc: z.array(draftRecipient).max(1000),
  subject: z.string().max(8192),
  reply: replyContext,
});
export type ReplySeed = z.infer<typeof replySeed>;

export async function rootHeaders(source: Buffer) {
  const stream = new Splitter({ ignoreEmbedded: true, maxHeadSize: 128 * 1024 });
  stream.end(source);
  for await (const part of stream as AsyncIterable<SplitterChunk>) {
    if (part.type === "node" && part.headers) return part.headers;
  }
  throw new Error("Missing mail headers");
}

export function mailboxes(headers: Headers, field: string) {
  return headers.getDecoded(field).flatMap(({ value }) =>
    addressParser(value, { flatten: true }).flatMap(({ address, name }) => {
      const checked = draftRecipient.safeParse(address);
      return checked.success ? [{ address: checked.data, name: name?.trim() ?? "" }] : [];
    }),
  );
}

export function addresses(headers: Headers, field: string) {
  return mailboxes(headers, field).map(({ address }) => address);
}

function messageIds(header: string): string[] {
  return (header.match(/<[^<>]*>/g) ?? []).filter((value) => rfcMessageId.safeParse(value).success);
}

export async function prepareReply(source: Buffer, origin: Origin, subject: string, mode: z.infer<typeof replyMode>, ownAddresses: string[]): Promise<ReplySeed> {
  const headers = await rootHeaders(source);
  const seen = new Set(ownAddresses.map((address) => address.trim().toLowerCase()));
  function take(values: string[]) {
    const result: string[] = [];
    for (const address of values) {
      if (seen.has(address)) continue;
      if (result.length === 1000) break;
      seen.add(address);
      result.push(address);
    }
    return result;
  }

  const preferred = take(addresses(headers, "Reply-To"));
  const sender = preferred.length ? preferred : take(addresses(headers, "From"));
  const publicTo = mode === "reply-all" ? take(addresses(headers, "To")) : [];
  const publicCc = mode === "reply-all" ? take(addresses(headers, "Cc")) : [];
  const to = sender.length ? sender : publicTo;
  const cc = (sender.length ? [...publicTo, ...publicCc] : publicCc).slice(0, 1000);

  const inReplyTo = messageIds(headers.getFirst("Message-ID"))[0];
  const earlier = messageIds(headers.getFirst("References"));
  const parent = messageIds(headers.getFirst("In-Reply-To"));
  const ancestors = earlier.length ? earlier : parent.length === 1 ? parent : [];
  const references = [...new Set(ancestors.filter((id) => id !== inReplyTo))];
  if (inReplyTo) references.push(inReplyTo);
  const bounded = references.length > maxReferences ? [references[0]!, ...references.slice(1 - maxReferences)] : references;
  const originalSubject = subject
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 8192);
  const replySubject = /^(?:re\s*:|回复\s*[：:])/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;

  return {
    accountId: origin.accountId,
    to,
    cc,
    subject: replySubject.slice(0, 8192),
    reply: { ...origin, subject: originalSubject, mode, ...(inReplyTo && { inReplyTo }), references: bounded },
  };
}
