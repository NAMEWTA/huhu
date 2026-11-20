import { MailAccountError, type MailDiscoveryRequest } from "./discovery.js";
import { withImapConnection } from "./imap-connection.js";

export const MAX_IMAP_SOURCE_BYTES = 2 * 1024 * 1024;
export const IMAP_WINDOW = 200;
const FETCH_PAGE = 25;
const SOURCE_BUDGET = 18 * 1024 * 1024;

export type ImapSyncMessage = { uid: number; subject: string; source?: Buffer; seen: boolean; deleted: boolean };
export type ImapSyncCursor = { uidValidity: string; through?: number; cached: { uid: number; size: number }[] };

export function fetchImapMessages(request: MailDiscoveryRequest, folder: string, previous: ImapSyncCursor | undefined, reset: (validity: string) => Promise<void>) {
  return withImapConnection(
    request,
    "cancelled",
    "message-read",
    async (client) => {
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        if (!client.mailbox || client.mailbox.uidValidity < 1n) throw new MailAccountError("message-read");
        const uidValidity = client.mailbox.uidValidity.toString();
        const canIdle = client.capabilities.has("IDLE");
        const exists = client.mailbox.exists;
        const same = previous?.uidValidity === uidValidity && previous.through !== undefined ? { ...previous, through: previous.through } : undefined;
        if (previous && previous.uidValidity !== uidValidity) await reset(uidValidity);
        let expunged = false;
        client.on("expunge", () => {
          expunged = true;
        });
        const stable = () => {
          request.signal.throwIfAborted();
          if (expunged || !client.mailbox || client.mailbox.uidValidity.toString() !== uidValidity || client.mailbox.exists !== exists) throw new MailAccountError("mailbox-changed");
        };
        const headers = { uid: true, envelope: true, size: true, flags: true };
        const rows = [];
        let more = false;
        if (!exists) return { uidValidity, messages: [], through: same?.through ?? 0, initial: !same, more, canIdle };
        let first = Math.max(1, exists - IMAP_WINDOW + 1);
        if (same) {
          for (let start = 0; start < same.cached.length; start += FETCH_PAGE) {
            rows.push(
              ...(await client.fetchAll(
                same.cached.slice(start, start + FETCH_PAGE).map(({ uid }) => uid),
                headers,
                { uid: true },
              )),
            );
            stable();
          }
          first = exists + 1;
          if (!client.mailbox.uidNext || client.mailbox.uidNext > same.through + 1) {
            // UIDs increase with sequence number. Find the boundary without an unbounded UID SEARCH response.
            let low = 1;
            let high = exists + 1;
            while (low < high) {
              const mid = Math.floor((low + high) / 2);
              const row = await client.fetchOne(String(mid), { uid: true });
              stable();
              if (!row || !Number.isSafeInteger(row.uid) || row.uid < 1) throw new MailAccountError("message-read");
              if (row.uid <= same.through) low = mid + 1;
              else high = mid;
            }
            first = low;
          }
        }
        const last = Math.min(exists, first + IMAP_WINDOW - 1);
        more = last < exists;
        for (let start = first; start <= last; start += FETCH_PAGE) {
          const end = Math.min(last, start + FETCH_PAGE - 1);
          const page = await client.fetchAll(`${start}:${end}`, headers);
          stable();
          if (page.length !== end - start + 1 || new Set(page.map(({ seq }) => seq)).size !== page.length || page.some(({ seq, uid }) => seq < start || seq > end || (same && uid <= same.through))) {
            throw new MailAccountError("mailbox-changed");
          }
          rows.push(...page);
        }
        if (new Set(rows.map(({ uid }) => uid)).size !== rows.length) throw new MailAccountError("message-read");
        const retained = new Map(same?.cached.map(({ uid, size }) => [uid, size]));
        const ordered = rows.sort((a, b) => (same ? a.uid - b.uid : b.uid - a.uid));
        const messages: ImapSyncMessage[] = [];
        let through = same?.through ?? 0;
        let bytes = 0;
        for (const row of ordered) {
          if (!Number.isSafeInteger(row.uid) || row.uid < 1 || row.size === undefined || !Number.isSafeInteger(row.size) || row.size < 0) throw new MailAccountError("message-read");
          const message: ImapSyncMessage = { uid: row.uid, subject: row.envelope?.subject ?? "", seen: row.flags?.has("\\Seen") ?? false, deleted: row.flags?.has("\\Deleted") ?? false };
          if (retained.get(row.uid) !== row.size && !message.deleted) {
            if (row.size > MAX_IMAP_SOURCE_BYTES) {
              through = Math.max(through, row.uid);
              continue;
            }
            if (bytes + row.size > SOURCE_BUDGET) {
              if (same) {
                more = true;
                break;
              }
              continue;
            }
            const body = await client.fetchOne(String(row.uid), { uid: true, source: { start: 0, maxLength: MAX_IMAP_SOURCE_BYTES + 1 } }, { uid: true });
            stable();
            if (!body || body.uid !== row.uid || !body.source || body.source.byteLength !== row.size) throw new MailAccountError("message-read");
            message.source = body.source;
            bytes += row.size;
          }
          through = Math.max(through, row.uid);
          messages.push(message);
        }
        stable();
        return { uidValidity, messages, through, initial: !same, more, canIdle };
      } finally {
        lock.release();
      }
    },
    75_000,
  );
}

export function waitForImapActivity(request: MailDiscoveryRequest, folder: string, cursor: { uidValidity: string; through: number }, wake: () => void) {
  return withImapConnection(
    request,
    "cancelled",
    "message-read",
    async (client) => {
      if (!client.capabilities.has("IDLE")) return;
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        if (!client.mailbox) return;
        if (client.mailbox.uidValidity.toString() !== cursor.uidValidity || (client.mailbox.uidNext && client.mailbox.uidNext > cursor.through + 1)) return wake();
        client.once("exists", wake);
        client.once("expunge", wake);
        await client.idle();
      } finally {
        client.off("exists", wake);
        client.off("expunge", wake);
        lock.release();
      }
    },
    29 * 60_000,
  );
}

export function markImapMessageRead(request: MailDiscoveryRequest, folder: string, validity: string, uid: number) {
  return withImapConnection(request, "cancelled", "message-read", async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const currentMailbox = () => client.mailbox && client.mailbox.uidValidity.toString() === validity;
      if (!currentMailbox()) return "needs-refresh";
      if (client.mailbox && client.mailbox.readOnly) return "local";
      request.signal.throwIfAborted();
      if (!(await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true, silent: true }))) return "local";
      const verified = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
      if (!currentMailbox() || !verified || verified.uid !== uid) return "needs-refresh";
      return verified.flags?.has("\\Seen") ? "synced" : "local";
    } finally {
      lock.release();
    }
  });
}
