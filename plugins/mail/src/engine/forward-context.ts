import { z } from "zod";
import { sourceMessage } from "./reply-context.js";

const forwardAttachment = z.strictObject({ name: z.string().min(1).max(255), available: z.boolean() });
export const forwardContext = sourceMessage
  .extend({
    sourceDigest: z.hash("sha256", { enc: "hex" }).regex(/^[0-9a-f]+$/),
    subject: z.string().max(8192),
    from: z.string().max(1024),
    sourceAttachments: z.array(forwardAttachment).max(1024),
    omitted: z.array(z.int().nonnegative()).max(1024),
  })
  .refine(({ omitted, sourceAttachments }) => new Set(omitted).size === omitted.length && omitted.every((index) => index < sourceAttachments.length));

export type ForwardContext = z.infer<typeof forwardContext>;

export function sameForwardSource(first: ForwardContext | undefined, second: ForwardContext | undefined) {
  const original = (context: ForwardContext | undefined) => context && { ...context, omitted: [] };
  return JSON.stringify(original(first)) === JSON.stringify(original(second));
}

export function missingForwardAttachments(forward: ForwardContext | undefined, managed: readonly { name: string }[]) {
  if (!forward) return [];
  const omitted = new Set(forward.omitted);
  const names = new Set(managed.map(({ name }) => name));
  const ambiguous = new Set(forward.sourceAttachments.flatMap(({ name, available }, index) => (available && !omitted.has(index) ? [name] : [])));
  return forward.sourceAttachments.filter(({ name, available }, index) => !available && !omitted.has(index) && (!names.has(name) || ambiguous.has(name)));
}
