import { errors } from "@huhu/contracts";
import { z } from "zod";

export const InboxDocumentReceipt = z.object({ id: z.string(), path: z.string() });

export function inboxDocumentReceiptPath(id: string): string {
  if (!z.uuid().safeParse(id).success) throw errors.invalidInput("无效的收件转换标识");
  return `.huhu/inbox-conversions/${id}.json`;
}
