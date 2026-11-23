import { mailFolderRole } from "../mail-folder-visibility.js";
import { isInbox, type MailFolder } from "./account-definition.js";

export type MailCopyOrder = { accountId: string; date: string | null } & ({ source: "imap"; uid: number; localMessageId: string } | { source: "gmail" | "graph"; localMessageId: string } | { source: "sent"; operationId: string });

const localKey = (message: MailCopyOrder) => (message.source === "sent" ? message.operationId : message.localMessageId);

export function mailCopyIdentity({ message, internetId }: { message: MailCopyOrder; internetId?: string }) {
  return JSON.stringify(internetId ? [message.accountId, internetId] : [message.accountId, message.source, localKey(message)]);
}

export function compareMailMessages(a: MailCopyOrder, b: MailCopyOrder) {
  return (b.date ?? "").localeCompare(a.date ?? "") || a.source.localeCompare(b.source) || (a.source === "imap" && b.source === "imap" ? b.uid - a.uid : 0) || localKey(a).localeCompare(localKey(b));
}

type RankedMailCopy = { rank: number; message: MailCopyOrder };
export const compareMailCopies = (a: RankedMailCopy, b: RankedMailCopy) => a.rank - b.rank || compareMailMessages(a.message, b.message);
export const mailFolderRank = (folder: MailFolder) => (isInbox(folder.path) ? 0 : mailFolderRole(folder.specialUse ?? "") === "sent" ? 1 : 2);

export function receivedMailDate({ receivedAt, cachedAt }: { receivedAt?: string | undefined; cachedAt?: string | undefined }, { date }: { date?: string | undefined }) {
  return receivedAt ?? date ?? cachedAt ?? null;
}
