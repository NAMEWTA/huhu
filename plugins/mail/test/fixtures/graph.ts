import type { IncomingMessage, ServerResponse } from "node:http";

const prefix = "/graph/v1.0/me";
const inboxMessages = `${prefix}/mailFolders/inbox/messages`;
const delta = `${inboxMessages}/delta`;
const messages = `${inboxMessages}/`;
const inboxId = "Inbox-native+A=";
const nativeInboxMessages = `${prefix}/mailfolders('${encodeURIComponent(inboxId)}')/messages`;
export const graphScopes = "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send";
type InboxMessage = { id: string; receivedDateTime: string; isRead: boolean; isDraft: boolean; parentFolderId: string };

export function graphFixture(access: () => string | readonly string[] | undefined) {
  const pages = new Map<string, { value: unknown[]; next?: string; cursor?: string; nextLink?: string; deltaLink?: string }>();
  const inbox = new Map<string, InboxMessage>();
  const staleListEntries = new Map<string, InboxMessage>();
  const omittedFromList = new Set<string>();
  const sources = new Map<string, string>();
  const requests: { path: string; key: string | null; resource: string }[] = [];
  const sent: string[] = [];
  const state = {
    failKey: "",
    status: 500,
    failingInboxOffset: null as number | null,
    lookupStatus: 200,
    beforeLookup: undefined as ((id: string) => void) | undefined,
    beforeDelta: undefined as ((key: string | null, response: ServerResponse) => Promise<void> | undefined) | undefined,
    probeStatus: 200,
    sendStatus: 202,
    loseSendAck: false,
  };

  function add(id: string, receiver: string, index: number, padding = "") {
    sources.set(
      id,
      [
        "From: Graph Reader <graph-reader@example.invalid>",
        `To: ${receiver}`,
        "Bcc: graph-blind@example.invalid",
        `Message-ID: <graph.${index}@example.invalid>`,
        `Subject: Graph message ${index}`,
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="fixture"',
        "",
        "--fixture",
        "Content-Type: text/plain; charset=utf-8",
        "",
        `Graph body ${index}`,
        padding,
        "--fixture",
        "Content-Type: text/plain",
        'Content-Disposition: attachment; filename="graph-note.txt"',
        "",
        "Fixture attachment",
        "--fixture--",
        "",
      ].join("\r\n"),
    );
    const item = { id, receivedDateTime: new Date(Date.UTC(2026, 0, index)).toISOString(), isRead: false, isDraft: false, parentFolderId: inboxId };
    inbox.set(id, item);
    return item;
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    const host = `http://${req.headers.host}`;
    const url = new URL(req.url ?? "/", host);
    if (!url.pathname.startsWith(`${prefix}/`)) return false;
    const key = url.searchParams.get("$skiptoken") ?? url.searchParams.get("$deltatoken");
    requests.push({ path: url.pathname.slice(prefix.length), key, resource: req.url ?? "" });
    const json = (status: number, data: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    const allowed = access();
    const tokens = typeof allowed === "string" ? [allowed] : allowed;
    if (!tokens?.some((token) => req.headers.authorization === `Bearer ${token}`) || !req.headers.prefer?.includes('IdType="ImmutableId"')) {
      json(401, {});
    } else if (url.pathname === `${prefix}/mailFolders/inbox`) {
      json(state.probeStatus, { id: inboxId });
    } else if (url.pathname === inboxMessages || url.pathname === nativeInboxMessages) {
      const offset = Number(url.searchParams.get("$skip") ?? 0);
      if (offset === state.failingInboxOffset) json(500, {});
      else {
        const ordered = [...new Map([...inbox, ...staleListEntries]).values()].filter(({ id }) => !omittedFromList.has(id)).sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
        const end = offset + 100;
        json(200, {
          value: ordered.slice(offset, end),
          ...(end < ordered.length && { "@odata.nextLink": `${host}${nativeInboxMessages}?$skip=${end}` }),
        });
      }
    } else if (url.pathname === delta || url.pathname === `${nativeInboxMessages}/delta`) {
      const sendPage = () => {
        if (res.destroyed) return;
        const page = pages.get(key ?? "initial");
        if (state.failKey && state.failKey === key) json(state.status, {});
        else if (!page) json(400, {});
        else
          json(200, {
            value: page.value,
            ...(page.next && { "@odata.nextLink": `${host}${nativeInboxMessages}/delta?$skiptoken=${encodeURIComponent(page.next)}` }),
            ...(page.cursor && { "@odata.deltaLink": `${host}${nativeInboxMessages}/delta?$deltatoken=${encodeURIComponent(page.cursor)}` }),
            ...(page.nextLink && { "@odata.nextLink": page.nextLink }),
            ...(page.deltaLink && { "@odata.deltaLink": page.deltaLink }),
          });
      };
      const gate = state.beforeDelta?.(key, res);
      if (gate) void gate.then(sendPage);
      else sendPage();
    } else if (url.pathname.startsWith(messages) && url.pathname.endsWith("/$value")) {
      const id = decodeURIComponent(url.pathname.slice(messages.length, -"/$value".length));
      const source = inbox.has(id) && sources.get(id);
      if (source) res.writeHead(200).end(source);
      else json(404, {});
    } else if (url.pathname.startsWith(`${prefix}/messages/`)) {
      const id = decodeURIComponent(url.pathname.slice(`${prefix}/messages/`.length));
      state.beforeLookup?.(id);
      const item = inbox.get(id);
      if (state.lookupStatus !== 200) json(state.lookupStatus, {});
      else if (item) json(200, item);
      else json(404, {});
    } else if (url.pathname === `${prefix}/sendMail` && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        if (req.headers["content-type"] !== "text/plain") return void json(415, {});
        if (state.sendStatus !== 202) return void json(state.sendStatus, { error: { code: "ErrorAccessDenied" } });
        sent.push(Buffer.from(Buffer.concat(chunks).toString("ascii"), "base64").toString("utf8"));
        if (state.loseSendAck) req.socket.destroy();
        else res.writeHead(202).end();
      });
    } else json(404, {});
    return true;
  }

  return { endpoint: prefix, requests, pages, inbox, staleListEntries, omittedFromList, state, sent, add, handle };
}
