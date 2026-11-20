import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";

export const readOverrideId = z.hash("sha256", { enc: "hex" });
export const readOverrideFile = z.strictObject({ format: z.literal(1), messages: z.array(readOverrideId) });
export const readOverridePath = (accountId: string) => `.huhu/mail/read-overrides/${accountId}.json`;
type Files = HuhuApi["vault"]["files"];

export function readOverrides(files: Files, accountId: string) {
  const file = files.read(readOverridePath(accountId));
  return { ids: new Set(file ? readOverrideFile.parse(JSON.parse(file.bytes.toString("utf8"))).messages : []), version: file?.version ?? null };
}

/** Call inside the Mail snapshot writer boundary. */
export async function preserveReadOverrides(files: Files, accountId: string, ids: Iterable<string>) {
  const previous = readOverrides(files, accountId);
  const messages = [...new Set([...previous.ids, ...ids])].sort();
  if (messages.length === previous.ids.size) return;
  const body = readOverrideFile.parse({ format: 1, messages });
  await files.write(readOverridePath(accountId), Buffer.from(JSON.stringify(body) + "\n"), { expectedVersion: previous.version });
}
