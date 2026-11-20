import type { IncomingMessage, ServerResponse } from "node:http";
import { expect } from "vitest";

type Reference = { id: string; labelIds?: string[] };
export type FixtureHistory = {
  id: string;
  messagesAdded?: { message: Reference }[];
  messagesDeleted?: { message: Reference }[];
  labelsAdded?: { message: Reference; labelIds: string[] }[];
  labelsRemoved?: { message: Reference; labelIds: string[] }[];
};

export function gmailFixture(email: string, access: () => string | undefined) {
  const messages = new Map<string, { id: string; labelIds: string[]; internalDate: string; raw: string }>();
  const requests: { path: string; cursor: string | null; page: string | null; format: string | null }[] = [];
  const pages = new Map<string, { historyId: string; history?: FixtureHistory[]; nextPageToken?: string }>();
  const state = { profileCursor: "90071992547409920", email, denied: false, failPage: "" };
  const basePath = "/gmail/v1/users/me";

  return {
    basePath,
    messages,
    pages,
    requests,
    state,
    add(id: string, order: number, labels = ["INBOX", "UNREAD"]) {
      const mime = `From: Fixture User <reader@example.invalid>\r\nTo: ${email}\r\nBcc: blind@example.invalid\r\nMessage-ID: <${id}@example.invalid>\r\nSubject: Gmail ${id}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nmail-body-${id}!\r\n`;
      const message = { id, labelIds: labels, internalDate: String(Date.UTC(2026, 10, 21) + order * 1000), raw: Buffer.from(mime).toString("base64url") };
      messages.set(id, message);
      return message;
    },
    handle(req: IncomingMessage, res: ServerResponse) {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const route = url.pathname.slice(basePath.length + 1);
      if (!url.pathname.startsWith(`${basePath}/`)) return false;
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(value));
        return true;
      };
      const token = access();
      if (req.method !== "GET" || !token || req.headers.authorization !== `Bearer ${token}`) return json(401, {});
      const query = url.searchParams;
      const cursor = query.get("startHistoryId");
      const page = query.get("pageToken");
      const format = query.get("format");
      requests.push({ path: route, cursor, page, format });
      if (state.denied) return json(403, { error: { errors: [{ reason: "accessNotConfigured" }] } });
      if (route === "profile") return json(200, { emailAddress: state.email, historyId: state.profileCursor });
      if (route === "messages") {
        expect(query.get("labelIds")).toBe("INBOX");
        expect(query.get("includeSpamTrash")).toBe("false");
        const limit = Number(query.get("maxResults"));
        expect(limit).toBe(25);
        const offset = Number(page ?? 0);
        const ids = [...messages.values()].filter(({ labelIds }) => labelIds.includes("INBOX") && !labelIds.includes("TRASH") && !labelIds.includes("SPAM")).sort((a, b) => b.internalDate.localeCompare(a.internalDate));
        return json(200, { messages: ids.slice(offset, offset + limit).map(({ id }) => ({ id })), ...(offset + limit < ids.length && { nextPageToken: String(offset + limit) }) });
      }
      if (route === "history") {
        if (page && state.failPage === page) return json(503, {});
        const history = pages.get(page ? `${cursor}/${page}` : (cursor ?? ""));
        return history ? json(200, history) : json(404, {});
      }
      if (route.startsWith("messages/")) {
        const message = messages.get(route.slice("messages/".length));
        if (!message) return json(404, {});
        if (format === "minimal") return json(200, { id: message.id, labelIds: message.labelIds });
        if (format === "raw") return json(200, message);
      }
      return json(400, {});
    },
  };
}
