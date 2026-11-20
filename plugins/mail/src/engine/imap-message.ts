import { MailAccountError, type MailDiscoveryRequest } from "./discovery.js";
import { withImapConnection } from "./imap-connection.js";

export const MAX_IMAP_SOURCE_BYTES = 2 * 1024 * 1024;

export function fetchLatestImapMessage(request: MailDiscoveryRequest, folder: string) {
  return withImapConnection(request, "cancelled", "message-read", async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      if (!client.mailbox || client.mailbox.uidValidity < 1n) throw new MailAccountError("message-read");
      const uidValidity = client.mailbox.uidValidity.toString();
      if (client.mailbox.exists === 0) return { uidValidity, message: null };
      const latest = await client.fetchOne("*", { uid: true, envelope: true, size: true });
      if (!latest) return { uidValidity, message: null };
      if (!Number.isSafeInteger(latest.uid) || latest.uid < 1 || latest.size === undefined || !Number.isSafeInteger(latest.size) || latest.size < 0) {
        throw new MailAccountError("message-read");
      }
      if (latest.size > MAX_IMAP_SOURCE_BYTES) throw new MailAccountError("message-too-large");
      const body = await client.fetchOne(String(latest.uid), { uid: true, source: { start: 0, maxLength: MAX_IMAP_SOURCE_BYTES + 1 } }, { uid: true });
      if (!client.mailbox || client.mailbox.uidValidity.toString() !== uidValidity) throw new MailAccountError("mailbox-changed");
      if (!body || body.uid !== latest.uid || !body.source || body.source.byteLength !== latest.size) throw new MailAccountError("message-read");
      return { uidValidity, message: { uid: latest.uid, subject: latest.envelope?.subject ?? "", source: body.source } };
    } finally {
      lock.release();
    }
  });
}
