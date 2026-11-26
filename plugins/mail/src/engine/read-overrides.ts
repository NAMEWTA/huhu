import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { gmailNativeId } from "./gmail-history.js";
import { graphNativeId } from "./graph-mail.js";
import { sourceMessage } from "../shared/reply-context.js";

export const readOverrideId = z.hash("sha256", { enc: "hex" });
const { folder } = sourceMessage.shape;
export const imapMessageLocation = z.strictObject({ transport: z.literal("imap"), folder, uidValidity: z.string().regex(/^[1-9][0-9]*$/), uid: z.int().positive() });
export const gmailMessageLocation = z.strictObject({ transport: z.literal("gmail"), folder, nativeId: gmailNativeId });
export const graphMessageLocation = z.strictObject({ transport: z.literal("graph"), folder, nativeId: graphNativeId });
export const portableMessageLocation = z.discriminatedUnion("transport", [imapMessageLocation, gmailMessageLocation, graphMessageLocation]);
export type PortableMessageLocation = z.infer<typeof portableMessageLocation>;
export const readOverrideFile = z.strictObject({ format: z.literal(1), messages: z.array(readOverrideId), messageLocations: z.array(portableMessageLocation).optional() });
export const readOverridePath = (accountId: string) => `.huhu/mail/read-overrides/${accountId}.json`;
type Files = HuhuApi["vault"]["files"];

export function readOverrides(files: Files, accountId: string) {
  const file = files.read(readOverridePath(accountId));
  const record = file && readOverrideFile.parse(JSON.parse(file.bytes.toString("utf8")));
  return { ids: new Set(record?.messages), messageLocations: record?.messageLocations, version: file?.version ?? null };
}

/** Call inside the Mail snapshot writer boundary. */
export async function preserveReadOverrides(files: Files, accountId: string, ids: Iterable<string>) {
  const previous = readOverrides(files, accountId);
  const messages = [...new Set([...previous.ids, ...ids])].sort();
  if (messages.length === previous.ids.size) return;
  const body = readOverrideFile.parse({ format: 1, messages, messageLocations: previous.messageLocations });
  await files.write(readOverridePath(accountId), Buffer.from(JSON.stringify(body) + "\n"), { expectedVersion: previous.version });
}
