import { createHash } from "node:crypto";
import { z } from "zod";
import { draftRecipient } from "./draft-content.js";
import { forwardContext } from "../shared/forward-context.js";
import { parseForwardAttachments } from "./message-body.js";
import { addresses, rootHeaders } from "./prepare-reply.js";
import { sourceMessage } from "../shared/reply-context.js";

export const forwardSeed = z.strictObject({ accountId: sourceMessage.shape.accountId.nullable(), subject: z.string().max(8192), forward: forwardContext });
export const newTopicSeed = z.strictObject({ accountId: sourceMessage.shape.accountId.nullable(), to: z.array(draftRecipient).max(1000) });
export type ForwardSeed = z.infer<typeof forwardSeed>;
export type NewTopicSeed = z.infer<typeof newTopicSeed>;

export const sourceDigest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function newTopicRecipients(bytes: Buffer, ownAddresses: string[]) {
  const headers = await rootHeaders(bytes);
  const own = new Set(ownAddresses.map((address) => address.trim().toLowerCase()));
  const people = new Set(["From", "To", "Cc"].flatMap((field) => addresses(headers, field)).filter((address) => !own.has(address)));
  return [...people].slice(0, 1000);
}

export async function forwardSource(bytes: Buffer, origin: z.infer<typeof sourceMessage>, subject: string) {
  const headers = await rootHeaders(bytes);
  const parts = (await parseForwardAttachments(bytes)).map(({ name, bytes: data }) => ({
    name:
      name
        .replace(/\p{Cc}/gu, "")
        .trim()
        .slice(0, 255) || "未命名附件",
    ...(data && { data }),
  }));
  const forward = forwardContext.parse({
    ...origin,
    sourceDigest: sourceDigest(bytes),
    subject: subject
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 8192),
    from: addresses(headers, "From").join(", ").slice(0, 1024),
    sourceAttachments: parts.map(({ name, data }) => ({ name, available: !!data })),
    omitted: [],
  });
  return { forward, parts };
}
