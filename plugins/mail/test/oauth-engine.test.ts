import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials, NotificationStore, OperationReceipts } from "@huhu/kernel";
import MailComposer from "nodemailer/lib/mail-composer";
import { assert, expect, test, test as engineTest, vi } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts, type MailAccount } from "../src/engine/accounts.js";
import type { MailLocationTarget, MailSearchPage } from "../src/engine/conversations.js";
import { readGraphDelta } from "../src/engine/graph-mail.js";
import type { ReplySeed } from "../src/engine/prepare-reply.js";
import { createMailOAuth, oauthMailEndpoints, type MailOAuthIssuer, type MailOAuthRuntime, type OAuthProvider } from "../src/engine/oauth-provider.js";
import type { MailSyncOptions } from "../src/engine/sync-schedule.js";
import { selectedFileFingerprint } from "../src/desktop-attachments.js";
import { gmailFixture } from "./fixtures/gmail.js";
import { graphFixture, graphScopes } from "./fixtures/graph.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

const injection = vi.hoisted(() => ({ options: undefined as MailSyncOptions | undefined }));
vi.mock("../src/engine/registration.js", async (original) => {
  const module = await original<typeof import("../src/engine/registration.js")>();
  return {
    ...module,
    apply: ((ctx, api, owner, transport, syncOptions, runtime, ...options) => module.apply(ctx, api, owner, transport, injection.options ?? syncOptions, runtime, ...options)) satisfies typeof module.apply,
  };
});

type Status = { sessionId: string; host: string; phase: string; reason?: string; accountId?: string; route?: string; smtp?: boolean };
type Code = { url: URL; email: string; provider: OAuthProvider; scopes: string; override?: "nonce" | "signature" | "audience" | "subject"; hold?: Promise<void> };
const google = "oauth-google@example.invalid";
const outlook = "oauth-outlook@example.invalid";
const microsoftScopes = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";
const googleScopes = "https://mail.google.com/";

type Call = <T = unknown>(capability: string, input?: unknown) => Promise<T>;

function oauthHttp(port: number, token: string, capability: string, input: unknown, key: string = randomUUID(), claimedSubject?: string) {
  return fetch(`http://127.0.0.1:${port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: key, ...(claimedSubject && { subject: claimedSubject }) }),
  });
}

async function dropBeginAcknowledgement(engine: RunningEngine, token: string, input: unknown, key: string) {
  const upstreamResponse = Promise.withResolvers<number | undefined>();
  const proxy = createServer((incoming, downstream) => {
    const target = `http://127.0.0.1:${engine.port}/api/v1/call`;
    const upstream = httpRequest(target, { method: "POST", headers: { ...incoming.headers, host: new URL(target).host } }, (response) => {
      upstreamResponse.resolve(response.statusCode);
      response.resume();
      downstream.destroy();
    });
    upstream.on("error", (error) => {
      upstreamResponse.reject(error);
      downstream.destroy();
    });
    incoming.pipe(upstream);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(0, "127.0.0.1", resolve);
    });
    const address = proxy.address();
    assert(address && typeof address !== "string");
    await expect(oauthHttp(address.port, token, "mail.oauth.begin", input, key)).rejects.toThrow();
    expect(await upstreamResponse.promise).toBe(200);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
}

async function sendFixtureReply(call: Call, source: { accountId: string; folder: string; localMessageId: string }) {
  const seed = await call<ReplySeed>("mail.messages.prepareReply", { ...source, mode: "reply-all" });
  expect(seed.accountId).toBe(source.accountId);
  const draftId = randomUUID();
  const draft = { ...seed, bcc: [], body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fixture reply" }] }] } };
  const { revision } = await call<{ revision: string }>("mail.drafts.save", { draftId, expectedRevision: null, draft });
  const { operationId } = await call<{ operationId: string }>("mail.outbox.submit", { draftId, expectedRevision: revision });
  await expect.poll(() => call("mail.outbox.status", { operationId })).toMatchObject({ state: "accepted" });
  return seed;
}

async function verifyGmailHistory(
  api: ReturnType<typeof gmailFixture>,
  accountId: string,
  call: Call,
  restart: () => Promise<void>,
  notices: NotificationStore,
  loseNoticeAcknowledgement: () => void,
  imap: Awaited<ReturnType<typeof openImapFixture>>,
) {
  const mailbox = { accountId, folder: "INBOX" };
  const refresh = () => call("mail.sync.refresh", mailbox);
  const syncStatus = () => call("mail.sync.status", mailbox);
  const search = (text: string) => call<MailSearchPage>("mail.conversations.search", { text, accountId });
  const messageKey = (target: MailLocationTarget) => {
    assert(target.source === "gmail");
    return { ...mailbox, localMessageId: target.localMessageId };
  };
  const first = "42-native-A";
  const second = "42-native-B";
  const added = "42-new";
  const archived = "42-archive";
  const anchor = api.state.profileCursor;
  const recovered = "90071992547410100";
  const resumed = "90071992547410200";
  const terminal = "90071992547410000";
  const beforeImap = imap.fetchRequests.length;
  for (let i = 0; i < 205; i++) api.add(i === 203 ? first : i === 204 ? second : i === 202 ? archived : `old-${i}`, i);
  const padded = api.messages.get(second)!;
  const bytes = Buffer.from(padded.raw, "base64url");
  padded.raw = (bytes.length % 3 === 0 ? Buffer.concat([bytes, Buffer.from("\r\n")]) : bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  expect(padded.raw.endsWith("=")).toBe(true);
  api.add("42-private", 300, ["SENT", "UNREAD"]);
  api.state.email = "wrong-profile@example.invalid";
  await expect(refresh()).rejects.toThrow("gmail-api-account");
  expect(api.requests.map(({ path }) => path)).toEqual(["profile"]);
  expect(imap.fetchRequests).toHaveLength(beforeImap);
  api.state.email = google;
  api.requests.length = 0;
  expect(await refresh()).toMatchObject({ message: { transport: "gmail", nativeId: second }, mailboxChanged: true, sync: { transport: "gmail", range: "inbox", limit: 200 } });
  expect(await syncStatus()).toEqual({ transport: "gmail", range: "inbox", limit: 200 });
  expect(api.requests[0]?.path).toBe("profile");
  expect(api.requests.filter(({ path }) => path === "messages")).toHaveLength(8);
  expect(api.requests.filter(({ format }) => format === "raw")).toHaveLength(200);
  expect(api.requests.some(({ path }) => path === "messages/old-4" || path === "messages/42-private")).toBe(false);
  expect(await search("mail-body-old-5!")).toMatchObject({ total: 1, cachedMessages: 201 });
  expect((await search("mail-body-old-4!")).total).toBe(0);
  expect(imap.fetchRequests).toHaveLength(beforeImap);
  expect(notices.list()).toHaveLength(0);

  const [a, b, archive] = await Promise.all([first, second, archived].map(async (id) => (await search(`mail-body-${id}!`)).hits[0]!.target));
  assert(a && b && archive);
  expect(a).toMatchObject({ source: "gmail", nativeId: first });
  expect(b).toMatchObject({ source: "gmail", nativeId: second });
  expect(messageKey(a).localMessageId).not.toBe(messageKey(b).localMessageId);
  expect(await call("mail.conversations.loadBody", messageKey(a))).toMatchObject({ state: "ready", body: { text: expect.stringContaining(`mail-body-${first}!`) } });
  expect(await call("mail.conversations.loadBody", messageKey(b))).toMatchObject({ state: "ready", body: { text: expect.stringContaining(`mail-body-${second}!`) } });
  expect((await search("blind@example.invalid")).total).toBe(0);
  expect(await call("mail.messages.markRead", messageKey(a))).toEqual({ state: "local", remoteSynced: false });
  expect(await call("mail.conversations.findMessage", { target: a })).toMatchObject({ message: { readState: "local" } });

  api.add(added, 400);
  api.add("42-junk", 500, ["SPAM", "UNREAD"]);
  api.messages.delete(second);
  api.messages.get(archived)!.labelIds = ["UNREAD"];
  api.pages.set(anchor, {
    historyId: terminal,
    nextPageToken: "second",
    history: [{ id: "90071992547409933", messagesAdded: [{ message: { id: added } }, { message: { id: "42-private" } }, { message: { id: "42-junk", labelIds: ["SPAM"] } }] }],
  });
  api.pages.set(`${anchor}/second`, {
    historyId: terminal,
    history: [{ id: terminal, messagesDeleted: [{ message: { id: second } }], labelsRemoved: [{ message: { id: archived }, labelIds: ["INBOX"] }], labelsAdded: [{ message: { id: first }, labelIds: ["UNREAD"] }] }],
  });
  api.state.failPage = "second";
  const start = api.requests.length;
  await expect(refresh()).rejects.toThrow("gmail-api-unavailable");
  expect(api.requests.slice(start)).toEqual([
    { path: "history", cursor: anchor, page: null, format: null },
    { path: "history", cursor: anchor, page: "second", format: null },
  ]);
  expect(await call("mail.messages.latest", mailbox)).toMatchObject({ message: { nativeId: second } });
  expect(notices.list()).toHaveLength(0);

  await restart();
  api.state.failPage = "";
  loseNoticeAcknowledgement();
  const retry = api.requests.length;
  expect(await refresh()).toMatchObject({ message: { nativeId: added }, sync: { transport: "gmail" } });
  const retryRequests = api.requests.slice(retry);
  expect(retryRequests.filter(({ path }) => path === "history").map(({ cursor, page }) => [cursor, page])).toEqual([
    [anchor, null],
    [anchor, "second"],
  ]);
  expect(retryRequests.filter(({ format }) => format === "raw").map(({ path }) => path)).toEqual([`messages/${added}`]);
  expect(retryRequests.filter(({ format }) => format === "minimal")).toHaveLength(4);
  expect(retryRequests.some(({ path, format }) => path === "messages/42-private" && format === "minimal")).toBe(true);
  expect(retryRequests.some(({ path }) => path === "messages/42-junk")).toBe(false);
  expect(await call("mail.conversations.loadBody", messageKey(b))).toEqual({ state: "needs-refresh" });
  expect(await call("mail.messages.loadSource", messageKey(archive))).toEqual({ state: "needs-refresh" });
  expect(await call("mail.conversations.findMessage", { target: a })).toMatchObject({ message: { readState: "local" } });
  const [notice] = notices.list();
  assert(notice);
  expect(notice).toMatchObject({ module: "mail", title: "收到新邮件" });
  const target = await call<MailLocationTarget>("mail.notifications.target", { id: notice.id });
  expect(target).toMatchObject({ source: "gmail", nativeId: added });
  expect(await call("mail.conversations.findMessage", { target })).toMatchObject({ message: { source: "gmail", nativeId: added } });
  api.pages.set(terminal, { historyId: terminal });
  await restart();
  await refresh();
  expect(api.requests.at(-1)?.cursor).toBe(terminal);
  expect(notices.list().map(({ id }) => id)).toEqual([notice.id]);

  if (target.source !== "gmail") throw new Error("The notice should retain its Gmail source");
  const reply = await sendFixtureReply(call, messageKey(target));
  expect(reply).toMatchObject({ accountId, to: ["reader@example.invalid"], cc: [], reply: { inReplyTo: `<${added}@example.invalid>` } });
  expect(JSON.stringify(reply)).not.toContain("blind@example.invalid");

  api.pages.delete(terminal);
  api.state.profileCursor = recovered;
  for (const id of api.messages.keys()) if (id !== first && id !== added) api.messages.delete(id);
  api.add("42-gap", 600);
  const rescan = api.requests.length;
  expect(await refresh()).toMatchObject({ message: { nativeId: "42-gap" }, mailboxChanged: true, sync: { transport: "gmail", recovery: "history-expired" } });
  expect(api.requests.slice(rescan, rescan + 3).map(({ path }) => path)).toEqual(["history", "profile", "messages"]);
  expect(api.requests.slice(rescan).filter(({ format }) => format === "raw")).toHaveLength(3);
  expect(await call("mail.conversations.findMessage", { target: a })).toMatchObject({ message: { readState: "local" } });
  expect(notices.list()).toHaveLength(1);

  api.state.denied = true;
  expect(await refresh()).toMatchObject({ message: { transport: "imap", uid: 42 }, mailboxChanged: true, sync: { transport: "imap", fallback: "gmail-api-permission", limit: 200 } });
  expect(imap.fetchRequests.length).toBeGreaterThan(beforeImap);
  expect(await syncStatus()).toEqual({ transport: "imap", range: "folder", fallback: "gmail-api-permission", limit: 200 });
  expect(await call("mail.conversations.findMessage", { target })).toBeNull();

  await restart();
  api.state.denied = false;
  api.pages.set(recovered, { historyId: resumed });
  const reconnect = api.requests.length;
  expect(await refresh()).toMatchObject({ message: { nativeId: "42-gap" }, mailboxChanged: true, sync: { transport: "gmail" } });
  expect(api.requests.slice(reconnect)).toEqual([{ path: "history", cursor: recovered, page: null, format: null }]);
  expect(await call("mail.conversations.findMessage", { target: a })).toMatchObject({ message: { readState: "local" } });
  expect(notices.list()).toHaveLength(1);
  const gapStart = api.requests.length;
  for (let i = 0; i < 20; i++) api.pages.set(i === 0 ? resumed : `${resumed}/budget-${i}`, { historyId: resumed, nextPageToken: `budget-${i + 1}` });
  api.state.profileCursor = "90071992547410300";
  expect(await refresh()).toMatchObject({ sync: { transport: "gmail", recovery: "history-window" } });
  expect(api.requests.slice(gapStart).filter(({ path }) => path === "history")).toHaveLength(20);
  expect(api.requests.slice(gapStart).filter(({ format }) => format === "raw")).toHaveLength(3);
  expect(notices.list()).toHaveLength(1);
  console.info(
    JSON.stringify({
      scenario: "gmail-history",
      initialListPages: 8,
      initialRaw: 200,
      failedPageRequests: 2,
      retryMetadata: retryRequests.filter(({ format }) => format === "minimal").length,
      retryRaw: 1,
      recoveryRaw: 3,
      resumedHistoryRequests: 1,
      historyBudgetPages: 20,
      notices: notices.list().length,
    }),
  );
}

test("production OAuth service addresses distinguish personal Outlook and Exchange Online", () => {
  expect(oauthMailEndpoints("outlook", outlook, true)).toEqual({ imap: { host: "outlook.office365.com", port: 993, security: "tls" }, smtp: { host: "smtp-mail.outlook.com", port: 587, security: "starttls" } });
  expect(oauthMailEndpoints("outlook", outlook, false).smtp.host).toBe("smtp.office365.com");
  expect(oauthMailEndpoints("gmail", google, false).smtp.host).toBe("smtp.gmail.com");
});

test("production Outlook authorization uses Exchange by default and accepts only explicit preauthorized Graph scopes", () => {
  const clients = { microsoft: { clientId: "fixture-client" } };
  const host = { hostLabel: "Fixture host", openBrowser: async () => undefined };
  try {
    vi.stubEnv("HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES", undefined);
    expect(createMailOAuth(clients, host).issuers.outlook).toMatchObject({ scopes: expect.arrayContaining(microsoftScopes.split(" ")) });
    vi.stubEnv("HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES", graphScopes);
    const configured = createMailOAuth(clients, host).issuers.outlook;
    expect(configured).toMatchObject({ preauthorizedGraphScopes: graphScopes.split(" "), graphApi: "https://graph.microsoft.com/v1.0/me", scopes: expect.arrayContaining(microsoftScopes.split(" ")) });
    expect(configured?.scopes.join(" ")).not.toContain("graph.microsoft.com");
    vi.stubEnv("HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES", `${graphScopes} https://graph.microsoft.com/User.Read`);
    const invalid = createMailOAuth(clients, host).issuers.outlook;
    expect(invalid?.scopes).toEqual(configured?.scopes);
    expect(invalid?.preauthorizedGraphScopes).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});

test("Graph backfills the 201st historical message when the list still includes a verified deletion", async () => {
  const token = "graph-fixture-token";
  const graph = graphFixture(() => token);
  const historical = Array.from({ length: 201 }, (_, i) => {
    const item = graph.add(`history-${i + 1}`, outlook, i + 1);
    item.isRead = true;
    return item;
  }).reverse();
  const newest = historical[0]!;
  const oldest = historical[200]!;
  graph.pages.set("initial", { value: historical.slice(0, 100), next: "history-1" });
  graph.pages.set("history-1", { value: historical.slice(100, 200), next: "history-2" });
  graph.pages.set("history-2", { value: historical.slice(200), cursor: "history-complete" });

  const server = createServer((req, res) => {
    if (!graph.handle(req, res)) res.writeHead(404).end();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}${graph.endpoint}`;
    const signal = new AbortController().signal;
    const initial = await readGraphDelta(endpoint, token, newest.parentFolderId, undefined, signal);
    assert("rows" in initial);
    const cached = new Map(initial.rows.flatMap((row) => ("seen" in row ? [[row.id, { seen: row.seen }] as const] : [])));
    expect(initial.initial).toBe(true);
    expect(initial.pending).toEqual([]);
    expect(cached.size).toBe(200);
    expect(cached.has(newest.id)).toBe(true);
    expect(cached.has(oldest.id)).toBe(false);

    graph.inbox.delete(newest.id);
    graph.staleListEntries.set(newest.id, newest);
    graph.pages.set("history-complete", { value: [{ id: newest.id, "@removed": {} }], next: "stale-history-update" });
    graph.pages.set("stale-history-update", { value: [{ id: newest.id, isRead: false }], cursor: "history-after-deletion" });
    const beforeReconcile = graph.requests.length;
    const result = await readGraphDelta(endpoint, token, newest.parentFolderId, { cursor: initial.cursor, cached, arrivalWatermark: initial.arrivalWatermark }, signal);
    assert("rows" in result);
    expect(result.rows).toMatchObject([
      { id: newest.id, removed: true },
      { id: oldest.id, seen: true, bytes: expect.any(Buffer) },
    ]);
    const backfill = result.rows[1];
    assert(backfill && "bytes" in backfill);
    expect(backfill.bytes?.toString("utf8")).toContain("Graph body 1\r\n");
    expect(result.cursor).toContain("history-after-deletion");
    expect(result.pending).toEqual([]);
    expect(graph.requests.slice(beforeReconcile).map(({ path }) => path)).toEqual([
      expect.stringMatching(/\/messages\/delta$/),
      expect.stringMatching(/\/messages\/delta$/),
      `/messages/${newest.id}`,
      "/mailFolders/inbox/messages",
      expect.stringMatching(/\/messages$/),
      expect.stringMatching(/\/messages$/),
      `/mailFolders/inbox/messages/${oldest.id}/$value`,
    ]);
    expect(graph.requests[beforeReconcile + 5]?.resource).toContain("?$skip=200");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 30_000);

const exerciseOAuthEngine = async (audit?: "deletions" | "verification" | "route-change" | "send" | "retry-feedback") => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-oauth-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "app");
  const webAssetsDir = path.join(root, "web");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  mkdirSync(webAssetsDir);
  writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>OAuth loopback fixture</title>");
  let engine: RunningEngine | undefined;
  let now = Date.now();
  let exchangeCount = 0;
  const refreshes: string[] = [];
  let rejectRefresh = false;
  let blockEntered: (() => void) | undefined;
  let browserAck: Promise<void> | undefined;
  const credentials = new Map<string, { access: string; refresh: string; provider: OAuthProvider }>();
  const materials: string[] = [];
  const gmail = gmailFixture(google, () => credentials.get(google)?.access);
  let graphAccess: string | undefined;
  let previousGraphAccess: string | undefined;
  const graph = graphFixture(() => (graphAccess && previousGraphAccess ? [graphAccess, previousGraphAccess] : graphAccess));
  const notices = new NotificationStore(path.join(root, "mail-notices.ndjson"));
  let lostNoticeAcknowledgement = false;
  const delivered: string[] = [];
  injection.options = {
    notify({ id, ...notice }) {
      delivered.push(id);
      notices.create(notice, id);
      if (lostNoticeAcknowledgement) {
        lostNoticeAcknowledgement = false;
        throw new Error("fixture notice acknowledgement lost");
      }
    },
  };
  const authMatches = (email: string, value: string) => email !== "protocol-disabled@example.invalid" && credentials.get(email)?.access === value;
  const inbox = { uidValidity: 99, messages: [{ uidValidity: 99, uid: 42, subject: "OAuth fixture", source: "Subject: OAuth fixture\r\n\r\nFixture body\r\n" }] };
  let interruptExchange = false;
  const imap = await openImapFixture({
    acceptOAuth: authMatches,
    windows: { INBOX: inbox },
    async beforeSource(uid) {
      if (uid === 43 && interruptExchange) {
        interruptExchange = false;
        throw new Error("fixture disconnected before delivering Exchange MIME");
      }
    },
  });
  const smtp = await loopbackSmtp("unused", authMatches);
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "fixture", use: "sig" };
  const codes = new Map<string, Code>();
  const issuers = {} as Record<OAuthProvider, MailOAuthIssuer>;
  const clientNames = { gmail: "synthetic-google-client", outlook: "synthetic-microsoft-client" };
  const graphGrants = new Map<string, { email: string; scope: string }>();
  const approvedGraph = new Set<string>();
  const graphExchanges: { email: string; scope: string }[] = [];
  let upgradeReceipt: string | undefined;
  let graphRefreshFailure: "disconnect" | "invalid_scope" | undefined;
  const newToken = (email: string, provider: OAuthProvider, accept = true, graphGrant?: string) => {
    const access = `${graphGrant ? "opaque-graph" : "access"}-${randomUUID()}`;
    const refresh = `refresh-${randomUUID()}`;
    if (graphGrant) {
      graphGrants.set(refresh, { email, scope: graphGrant });
      graphAccess = access;
    } else if (accept) credentials.set(email, { access, refresh, provider });
    materials.push(access, refresh);
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 120 };
  };
  const issuer = createServer(async (req, res) => {
    if (gmail.handle(req, res) || graph.handle(req, res)) return;
    const json = (status: number, data: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    if (req.url === "/keys") return json(200, { keys: [jwk] });
    const provider = req.url === "/token/gmail" ? "gmail" : req.url === "/token/outlook" ? "outlook" : undefined;
    if (!provider || req.method !== "POST") return json(404, {});
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const fields = new URLSearchParams(body);
    if (fields.get("client_id") !== clientNames[provider]) return json(400, { error: "invalid_client" });
    if (fields.get("grant_type") === "refresh_token") {
      const refresh = fields.get("refresh_token") ?? "";
      const existing = [...credentials].find(([, value]) => value.refresh === refresh && value.provider === provider);
      const graphGrant = graphGrants.get(refresh);
      const requested = fields.get("scope") ?? "";
      if (provider === "outlook" && requested.startsWith("https://graph.microsoft.com/")) {
        const email = graphGrant?.email ?? existing?.[0];
        if (!email) return json(400, { error: "invalid_grant" });
        graphExchanges.push({ email, scope: requested });
        if (!approvedGraph.has(email)) return json(400, { error: "consent_required" });
        if (graphGrant) {
          if (requested.split(" ").some((scope) => !graphGrant.scope.split(" ").includes(scope))) return json(400, { error: "invalid_scope" });
          if (graphRefreshFailure === "disconnect") return void req.socket.destroy();
          if (graphRefreshFailure === "invalid_scope" && requested.includes("/Mail.Send")) return json(400, { error: "invalid_scope" });
        }
        const scope = graphGrant ? requested : (upgradeReceipt ?? requested);
        return json(200, { ...newToken(email, provider, true, requested), scope });
      }
      refreshes.push(refresh);
      if (!existing || rejectRefresh || (provider === "outlook" && requested !== microsoftScopes)) return json(400, { error: "invalid_grant" });
      const scope = provider === "gmail" ? googleScopes : microsoftScopes;
      return json(200, { ...newToken(existing[0], provider), scope });
    }
    exchangeCount++;
    const code = fields.get("code") ?? "";
    const ticket = codes.get(code);
    codes.delete(code);
    if (
      !ticket ||
      ticket.provider !== provider ||
      fields.get("redirect_uri") !== ticket.url.searchParams.get("redirect_uri") ||
      createHash("sha256")
        .update(fields.get("code_verifier") ?? "")
        .digest("base64url") !== ticket.url.searchParams.get("code_challenge")
    )
      return json(400, { error: "invalid_grant" });
    if (ticket.hold) {
      blockEntered?.();
      await ticket.hold;
    }
    if (res.destroyed) return;
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString("base64url");
    const encoded = Buffer.from(
      JSON.stringify({
        iss: issuers[provider].issuer,
        sub: ticket.override === "subject" ? "other-subject" : `fixture-${ticket.email}`,
        aud: ticket.override === "audience" ? "wrong-client" : clientNames[provider],
        nonce: ticket.override === "nonce" ? "wrong-nonce" : ticket.url.searchParams.get("nonce"),
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 300,
        email: ticket.email,
        email_verified: true,
        ...(provider === "outlook" && { tid: "9188040d-6c67-4c5b-b112-36a304b66dad" }),
      }),
    ).toString("base64url");
    const signed = `${header}.${encoded}`;
    const signature = sign("RSA-SHA256", Buffer.from(ticket.override === "signature" ? `${signed}x` : signed), keys.privateKey).toString("base64url");
    json(200, { ...newToken(ticket.email, provider, !ticket.override), scope: ticket.scopes, id_token: `${signed}.${signature}` });
  });
  const requests: URL[] = [];
  const fetchLoopback = globalThis.fetch;
  const guard = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    if (url.hostname !== "127.0.0.1") throw new Error("OAuth integration must stay on loopback");
    return fetchLoopback(input, init);
  });
  try {
    await new Promise<void>((resolve) => issuer.listen(0, "127.0.0.1", resolve));
    const port = issuer.address();
    assert(port && typeof port !== "string");
    const base = `http://127.0.0.1:${port.port}`;
    vi.stubEnv("HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES", graphScopes);
    const exposed = createMailOAuth({ google: { clientId: clientNames.gmail }, microsoft: { clientId: clientNames.outlook } }, { hostLabel: "Fixture Engine", openBrowser: async () => undefined });
    vi.unstubAllEnvs();
    for (const provider of ["gmail", "outlook"] as const)
      issuers[provider] = {
        ...exposed.issuers[provider]!,
        callbackHost: "127.0.0.1",
        authorize: `${base}/authorize/${provider}`,
        token: `${base}/token/${provider}`,
        jwks: `${base}/keys`,
        issuer: `${base}/issuer/${provider}`,
        protocol: { imap: { host: "127.0.0.1", port: imap.port, security: "none" }, smtp: { host: "127.0.0.1", port: smtp.port, security: "none" } },
      };
    delete issuers.gmail.gmailApi;
    issuers.outlook.graphApi = `${base}${graph.endpoint}`;
    const opened: URL[] = [];
    const runtime: MailOAuthRuntime = {
      issuers,
      hostLabel: "Fixture Engine",
      now: () => now,
      openBrowser: async (url) => {
        opened.push(new URL(url));
        await browserAck;
      },
    };
    const request = (capability: string, input: unknown = {}, caller: "desktop" | "web:other" | "cli" = "desktop", idempotencyKey: string = randomUUID(), signal?: AbortSignal) => {
      assert(engine);
      return engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey }, signal);
    };
    const call = async <T>(capability: string, input: unknown = {}) => {
      const result = await request(capability, input);
      assert(result.ok, JSON.stringify(result));
      return result.data as T;
    };
    const status = (slot: Status) => call<Status>("mail.oauth.status", { sessionId: slot.sessionId });
    const begin = async (provider: OAuthProvider, email: string, repair?: { accountId: string; expectedRevision: string }, key?: string, smtp = true) => {
      const result = await request("mail.oauth.begin", { provider, email, ...(repair && { repair }), smtp }, "desktop", key);
      assert(result.ok, JSON.stringify(result));
      const slot = result.data as Status;
      expect(slot).toMatchObject({ host: "Fixture Engine", phase: "waiting" });
      const url = opened.at(-1)!;
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("login_hint")).toBe(email);
      expect(url.searchParams.get("state")).toMatch(/^[\w-]{43}$/);
      return { slot, url };
    };
    const callback = (url: URL, value: Record<string, string> = {}) => {
      const target = new URL(url.searchParams.get("redirect_uri")!);
      target.search = new URLSearchParams({ state: url.searchParams.get("state")!, ...value }).toString();
      return fetch(target);
    };
    const ticketFor = (session: Awaited<ReturnType<typeof begin>>, provider: OAuthProvider, email: string, scopes = provider === "gmail" ? googleScopes : microsoftScopes, extra: Partial<Code> = {}) => {
      const code = `fixture-code-${randomUUID()}`;
      codes.set(code, { url: session.url, provider, email, scopes, ...extra });
      return code;
    };
    const list = () => call<{ accounts: MailAccount[] }>("mail.accounts.list");
    if (audit) {
      engine = await boot({ vaultPath, desktopUserData, create: true, mailOAuth: runtime });
      approvedGraph.add(outlook);
      const authorizeOutlook = async (smtp: boolean, repair?: { accountId: string; expectedRevision: string }, route: "graph" | "imap" = "graph") => {
        const session = await begin("outlook", outlook, repair, undefined, smtp);
        const scopes = smtp ? microsoftScopes : microsoftScopes.split(" ")[0]!;
        expect((await callback(session.url, { code: ticketFor(session, "outlook", outlook, scopes) })).status).toBe(200);
        await expect.poll(() => status(session.slot)).toMatchObject({ phase: "configured", route, smtp });
        const configured = await status(session.slot);
        assert(configured.accountId);
        return configured.accountId;
      };
      const accountId = await authorizeOutlook(true);
      const mailbox = { accountId, folder: "INBOX" };
      const cacheKey = createHash("sha256")
        .update(JSON.stringify([accountId, "INBOX"]))
        .digest("hex");
      const snapshot = () =>
        JSON.parse(engine!.vault.files.read(`.huhu/cache/mail/${cacheKey}.json`)!.bytes.toString("utf8")).graph as {
          cursor: string;
          message: { summary: GraphSummary };
          history: { summary: GraphSummary }[];
        };
      type GraphSummary = { nativeId: string; localMessageId: string; readState: string };
      const summaries = (cache = snapshot()) => [cache.message, ...cache.history].map(({ summary }) => summary);
      const removed = (id: string) => ({ id, "@removed": { reason: "deleted" } });
      if (audit === "deletions") {
        const historical = graph.add("historical-backfill", outlook, 1);
        const stale = graph.add("zz-stale-deleted", outlook, 2);
        const retained = Array.from({ length: 200 }, (_, i) => graph.add(`cached-${i}`, outlook, i + 3));
        const evicted = retained.at(-1)!;
        graph.pages.set("initial", { value: retained, cursor: "before-bulk-removal" });
        await call("mail.sync.refresh", mailbox);
        const before = snapshot();
        expect(summaries(before)).toHaveLength(200);
        expect(summaries(before).map(({ nativeId }) => nativeId)).toContain(evicted.id);
        expect(summaries(before).map(({ nativeId }) => nativeId)).not.toContain(historical.id);

        graph.inbox.delete(evicted.id);
        graph.inbox.delete(stale.id);
        graph.staleListEntries.set(stale.id, stale);
        const uncached = Array.from({ length: 200 }, (_, i) => removed(`bulk-removed-${i}`));
        graph.pages.set("before-bulk-removal", {
          value: [removed(evicted.id), ...uncached, removed(stale.id)],
          cursor: "after-bulk-removal",
        });
        const historyPage = /\/mailfolders\('[^']+'\)\/messages\?\$skip=200$/i;
        graph.state.failingInboxOffset = 200;
        const start = graph.requests.length;
        const failed = await request("mail.sync.refresh", mailbox);
        expect.soft(graph.requests.slice(start).map(({ resource }) => resource)).toContainEqual(expect.stringMatching(historyPage));
        expect.soft(failed).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
        expect.soft(snapshot().cursor).toBe(before.cursor);
        expect(summaries()).toEqual(summaries(before));

        graph.state.failingInboxOffset = null;
        const retry = graph.requests.length;
        await call("mail.sync.refresh", mailbox);
        expect(graph.requests.slice(retry).map(({ resource }) => resource)).toContainEqual(expect.stringMatching(historyPage));
        expect(snapshot().cursor).toContain("after-bulk-removal");
        const current = summaries();
        expect(current).toHaveLength(200);
        expect(current.map(({ nativeId }) => nativeId)).not.toContain(evicted.id);
        expect(current.map(({ nativeId }) => nativeId)).not.toContain(stale.id);
        const backfill = current.find(({ nativeId }) => nativeId === historical.id);
        assert(backfill);
        expect(await call("mail.messages.loadBody", { ...mailbox, localMessageId: backfill.localMessageId })).toMatchObject({
          state: "ready",
          body: { text: expect.stringContaining("Graph body 1") },
        });
      } else if (audit === "verification") {
        const candidates = Array.from({ length: 20 }, (_, i) => graph.add(`conflict-${i}`, outlook, i + 1));
        graph.pages.set("initial", { value: candidates, cursor: "before-verification" });
        await call("mail.sync.refresh", mailbox);
        const before = snapshot();
        expect(summaries(before).map(({ readState }) => readState)).toEqual(candidates.map(() => "unread"));
        for (const item of candidates) graph.inbox.set(item.id, { ...item, isRead: true });
        graph.pages.set("before-verification", { value: candidates.map(({ id }) => ({ id, isRead: true })), next: "verification-conflicts" });
        graph.pages.set("verification-conflicts", { value: candidates.map(({ id }) => ({ id, isRead: false })), cursor: "after-verification" });

        // Fast-forward the round budget while leaving the dispatcher and per-request deadlines real.
        const realNow = Date.now;
        const realTimeout = AbortSignal.timeout;
        const budgetMs = 75_000;
        let simulatedTime = 0;
        let roundStart = 0;
        let roundDeadline: AbortController | undefined;
        const verified = new Set<string>();
        const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + simulatedTime);
        const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
          if (ms !== budgetMs) return realTimeout(ms);
          roundStart = simulatedTime;
          roundDeadline = new AbortController();
          return roundDeadline.signal;
        });
        graph.state.beforeLookup = (id) => {
          simulatedTime += 4_000;
          if (simulatedTime - roundStart >= budgetMs) {
            roundDeadline?.abort(new DOMException("Fixture exhausted one Graph round", "TimeoutError"));
            return;
          }
          verified.add(id);
        };
        try {
          await request("mail.sync.refresh", mailbox);
          const firstRound = [...verified];
          expect(firstRound.length).toBeGreaterThan(0);
          expect(firstRound.length).toBeLessThan(candidates.length);
          expect(snapshot().cursor).toBe(before.cursor);
          expect(summaries()).toEqual(summaries(before));

          await engine.shutdown();
          engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
          expect(snapshot().cursor).toBe(before.cursor);
          expect(summaries()).toEqual(summaries(before));
          const resumedAt = graph.requests.length;
          const finished = await request("mail.sync.refresh", mailbox);
          const lookups = graph.requests
            .slice(resumedAt)
            .filter(({ path }) => path.startsWith("/messages/"))
            .map(({ path }) => decodeURIComponent(path.slice("/messages/".length)));
          expect.soft(lookups.filter((id) => firstRound.includes(id))).toEqual([]);
          expect.soft(finished).toMatchObject({ ok: true });
          expect(snapshot().cursor).toContain("after-verification");
          expect([...verified].sort()).toEqual(candidates.map(({ id }) => id).sort());
          expect(summaries().map(({ readState }) => readState)).toEqual(candidates.map(() => "synced"));
        } finally {
          graph.state.beforeLookup = undefined;
          timeout.mockRestore();
          clock.mockRestore();
        }
      } else if (audit === "route-change") {
        graph.pages.set("initial", { value: [], next: "retired-graph-next" });
        graph.pages.set("retired-graph-next", { value: [], cursor: "retired-graph-end" });
        const firstPage = Promise.withResolvers<"page">();
        const release = Promise.withResolvers<void>();
        let graphCancelled = false;
        graph.state.beforeDelta = (key, response) => {
          if (key !== null) return;
          response.once("close", () => {
            graphCancelled = !response.writableEnded;
          });
          firstPage.resolve("page");
          return release.promise;
        };
        const oldRefresh = request("mail.sync.refresh", mailbox);
        try {
          expect(await Promise.race([firstPage.promise, oldRefresh])).toBe("page");
          const original = (await list()).accounts.find((account) => account.accountId === accountId);
          assert(original);
          approvedGraph.delete(outlook);
          expect(await authorizeOutlook(true, { accountId, expectedRevision: original.revision }, "imap")).toBe(accountId);
          const exchange = (await list()).accounts.find((account) => account.accountId === accountId);
          assert(exchange);
          expect(exchange.revision).not.toBe(original.revision);
          const exchangeRefresh = request("mail.sync.refresh", { ...mailbox, expectedRevision: exchange.revision }, "web:other");
          const cancelledBeforeRelease = await vi
            .waitFor(() => expect(graphCancelled).toBe(true), { timeout: 2_000 })
            .then(
              () => true,
              () => false,
            );
          release.resolve();

          const [oldResult, newResult] = await Promise.all([oldRefresh, exchangeRefresh]);
          expect.soft(cancelledBeforeRelease).toBe(true);
          expect.soft(graph.requests.map(({ key }) => key)).not.toContain("retired-graph-next");
          expect.soft(oldResult).toMatchObject({ ok: false });
          expect(newResult).toMatchObject({
            ok: true,
            data: { message: { transport: "imap", uid: 42, subject: "OAuth fixture" }, sync: { transport: "imap" } },
          });
        } finally {
          release.resolve();
          graph.state.beforeDelta = undefined;
        }
      } else {
        const recipient = "reauthorized-recipient@example.invalid";
        const draftId = randomUUID();
        const { revision } = await call<{ revision: string }>("mail.drafts.save", {
          draftId,
          expectedRevision: null,
          draft: { accountId, to: [recipient], cc: [], bcc: [], subject: "Receive-only during Graph MIME build", body: { type: "doc", content: [{ type: "paragraph" }] } },
        });
        const attachment = Buffer.from("Synthetic attachment for the paused MIME build");
        const attachmentPath = path.join(root, "reauthorize.txt");
        writeFileSync(attachmentPath, attachment);
        const attached = await engine.addMailDraftAttachment(
          {
            type: "mail-attachment:add",
            vaultId: engine.vault.id,
            draftId,
            expectedRevision: revision,
            file: { path: attachmentPath, name: "reauthorize.txt", size: attachment.length, fingerprint: selectedFileFingerprint(statSync(attachmentPath, { bigint: true })) },
          },
          new AbortController().signal,
        );
        assert(attached.status === "attached");
        const release = Promise.withResolvers<void>();
        let building = false;
        const compile = MailComposer.prototype.compile;
        const gate = vi.spyOn(MailComposer.prototype, "compile").mockImplementation(function (this: MailComposer) {
          const mime = compile.call(this);
          const build = mime.build.bind(mime);
          vi.spyOn(mime, "build").mockImplementation(async () => {
            building = true;
            await release.promise;
            return build();
          });
          return mime;
        });
        const input = { draftId, expectedRevision: attached.draft.revision };
        const posts = () => graph.requests.filter(({ path }) => path === "/sendMail");
        try {
          const { operationId } = await call<{ operationId: string }>("mail.outbox.submit", input);
          await expect.poll(() => building).toBe(true);
          expect(posts()).toHaveLength(0);
          expect(await call("mail.outbox.status", { operationId })).toMatchObject({ state: "sending" });
          const current = (await list()).accounts.find((account) => account.accountId === accountId);
          assert(current && graphAccess);
          previousGraphAccess = graphAccess;
          expect(await authorizeOutlook(false, { accountId, expectedRevision: current.revision })).toBe(accountId);
          expect(graphAccess).not.toBe(previousGraphAccess);
          expect(graphExchanges.at(-1)).toEqual({ email: outlook, scope: graphScopes.split(" ")[0]! });
          expect((await list()).accounts.find((account) => account.accountId === accountId)).toMatchObject({
            definition: { oauth: { route: "graph" }, settings: { smtpEnabled: false } },
          });
          release.resolve();
          const delivery = () => call<{ state: string }>("mail.outbox.status", { operationId });
          await expect.poll(async () => (await delivery()).state).not.toBe("sending");
          expect.soft(posts()).toHaveLength(0);
          expect.soft(await delivery()).toMatchObject({ state: "not-delivered", recipients: [{ address: recipient, state: "not-delivered" }] });
          expect(await call("mail.outbox.submit", input)).toMatchObject({ operationId });
          expect(posts()).toHaveLength(0);
          if (audit === "retry-feedback") {
            expect.soft(await delivery()).toMatchObject({ reason: "graph-send-permission" });
            const receiveOnly = (await list()).accounts.find((account) => account.accountId === accountId);
            assert(receiveOnly);
            expect(await authorizeOutlook(true, { accountId, expectedRevision: receiveOnly.revision })).toBe(accountId);
            expect(await delivery()).toMatchObject({ state: "not-delivered", retryableRecipients: [recipient] });
          }
        } finally {
          release.resolve();
          gate.mockRestore();
        }
      }
      return;
    }
    engine = await boot({ vaultPath, desktopUserData, create: true });
    expect(await call("mail.oauth.availability")).toMatchObject({ gmail: false, outlook: false });
    expect(await request("mail.oauth.begin", { provider: "gmail", email: google })).toMatchObject({ ok: false, error: { details: { reason: "not-configured" } } });
    expect(await request("mail.oauth.begin", { provider: "gmail", email: google }, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData, webAssetsDir, mailOAuth: runtime });

    const { addresses } = await call<{ addresses: { url: string }[] }>("web.share.start", { mode: "local" });
    const origin = addresses[0]!.url;
    const { links } = await call<{ links: string[] }>("web.invitations.create");
    const invite = new URLSearchParams(new URL(links[0]!).hash.slice(1)).get("invite");
    assert(invite);
    async function join() {
      const response = await fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${invite}` } });
      expect(response.status).toBe(204);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert(cookie);
      return async (capability: string, input: unknown = {}) => {
        const result = await fetch(`${origin}/api/v1/call`, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
        });
        return CapabilityResultSchema.parse(await result.json());
      };
    }
    const web = await join();
    const stranger = await join();
    const first = await web("mail.oauth.begin", { provider: "gmail", email: google });
    assert(first.ok);
    const googleSession = { slot: first.data as Status, url: opened.at(-1)! };
    expect(googleSession.slot).toMatchObject({ host: "Fixture Engine", phase: "waiting" });
    expect(googleSession.url.origin).toBe(base);
    expect(googleSession.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(googleSession.url.searchParams.get("login_hint")).toBe(google);
    expect(await stranger("mail.oauth.cancel", { sessionId: googleSession.slot.sessionId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const googleCode = ticketFor(googleSession, "gmail", google);
    expect((await callback(googleSession.url, { state: "bad", code: googleCode })).status).toBe(400);
    expect(exchangeCount).toBe(0);
    expect(await request("mail.oauth.status", { sessionId: googleSession.slot.sessionId }, "web:other")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await callback(googleSession.url, { code: googleCode })).status).toBe(200);
    await expect.poll(async () => (await status(googleSession.slot)).phase).not.toMatch(/^(waiting|finishing)$/);
    const configured = await status(googleSession.slot);
    expect(configured, JSON.stringify(configured)).toMatchObject({ phase: "configured", route: "imap", smtp: true });
    expect(await web("mail.oauth.status", { sessionId: googleSession.slot.sessionId })).toMatchObject({ ok: true, data: { phase: "configured", accountId: configured.accountId } });
    expect(
      await callback(googleSession.url, { code: googleCode }).then(
        (reply) => reply.status,
        () => "closed",
      ),
    ).not.toBe(200);
    expect(exchangeCount).toBe(1);
    const googleAccount = (await list()).accounts[0]!;
    const mbox = { accountId: googleAccount.accountId, folder: "INBOX" };
    await call("safe.setup", { password: "fixture-only-mail-safe" });
    await call("safe.lock");
    expect(await call("safe.status")).toMatchObject({ initialized: true, locked: true });
    expect(await call("mail.sync.refresh", mbox)).toMatchObject({ message: { subject: "OAuth fixture" } });
    expect(imap.commands).toContain("AUTHENTICATE");
    expect(imap.commands).not.toContain("LOGIN");

    const discoveryBeforeGraph = imap.listRequests.length;
    for (const [scopes, reason] of [
      ["Mail.ReadBasic", "wrong-resource"],
      ["https://graph.microsoft.com/Mail.Read", "wrong-resource"],
      ["openid email", "permission-missing"],
    ] as const) {
      const session = await begin("outlook", outlook);
      await callback(session.url, { code: ticketFor(session, "outlook", outlook, scopes) });
      await expect.poll(() => status(session.slot)).toMatchObject({ phase: "failed", reason });
    }
    expect(imap.listRequests).toHaveLength(discoveryBeforeGraph);
    expect((await list()).accounts.some(({ definition }) => definition.settings.provider === "outlook")).toBe(false);
    const exchange = await begin("outlook", outlook);
    expect(exchange.url.searchParams.get("scope")).not.toContain("graph");
    await callback(exchange.url, { code: ticketFor(exchange, "outlook", outlook, "IMAP.AccessAsUser.All") });
    await expect.poll(() => status(exchange.slot)).toMatchObject({ phase: "configured", route: "imap", smtp: false });
    const outlookAccount = (await list()).accounts.find(({ definition }) => definition.settings.provider === "outlook")!;
    expect(outlookAccount.definition.oauth?.personal).toBe(true);
    const outlookInbox = { accountId: outlookAccount.accountId, folder: "INBOX" };
    const readOnlyMessage = await call<{ message: { localMessageId: string } }>("mail.sync.refresh", outlookInbox);
    expect(readOnlyMessage).toMatchObject({ message: { transport: "imap", uid: 42 }, sync: { transport: "imap", range: "folder" } });
    expect(await call("mail.messages.loadBody", { ...outlookInbox, localMessageId: readOnlyMessage.message.localMessageId })).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Fixture body") } });
    expect(smtp.counts.data).toBe(0);
    const addSmtp = await begin("outlook", outlook, { accountId: outlookAccount.accountId, expectedRevision: outlookAccount.revision });
    await callback(addSmtp.url, { code: ticketFor(addSmtp, "outlook", outlook) });
    await expect.poll(() => status(addSmtp.slot)).toMatchObject({ phase: "configured", route: "imap", smtp: true, accountId: outlookAccount.accountId });
    const disabled = await begin("outlook", "protocol-disabled@example.invalid");
    await callback(disabled.url, { code: ticketFor(disabled, "outlook", "protocol-disabled@example.invalid") });
    await expect.poll(() => status(disabled.slot)).toMatchObject({ phase: "failed", reason: "protocol-unavailable" });

    for (const [email, override, reason] of [
      ["wrong@example.invalid", undefined, "address-mismatch"],
      [google, "nonce", "identity-invalid"],
      [google, "signature", "identity-invalid"],
      [google, "audience", "identity-invalid"],
      [google, "subject", "account-changed"],
    ] as const) {
      const session = await begin("gmail", google, { accountId: googleAccount.accountId, expectedRevision: googleAccount.revision });
      await callback(session.url, { code: ticketFor(session, "gmail", email, googleScopes, override ? { override } : {}) });
      await expect.poll(() => status(session.slot)).toMatchObject({ phase: "failed", reason });
      expect((await list()).accounts.find(({ accountId }) => accountId === googleAccount.accountId)?.revision).toBe(googleAccount.revision);
    }
    expect(await call("mail.sync.refresh", mbox)).toMatchObject({ message: { uid: 42 } });

    const rejected = await begin("gmail", "denied@example.invalid");
    await callback(rejected.url, { error: "access_denied" });
    expect(await status(rejected.slot)).toMatchObject({ phase: "failed", reason: "denied" });
    runtime.ttlMs = 100;
    const expired = await begin("gmail", "expired@example.invalid");
    await expect.poll(() => status(expired.slot)).toMatchObject({ phase: "expired" });
    delete runtime.ttlMs;
    const cancelled = await begin("gmail", "cancelled@example.invalid");
    const stopped = await call<Status>("mail.oauth.cancel", { sessionId: cancelled.slot.sessionId });
    expect(stopped.phase).toBe("cancelled");
    expect(
      await callback(cancelled.url, { code: "late" }).then(
        (reply) => reply.status,
        () => "closed",
      ),
    ).not.toBe(200);

    const repair = await begin("gmail", google, { accountId: googleAccount.accountId, expectedRevision: googleAccount.revision });
    await callback(repair.url, { code: ticketFor(repair, "gmail", google) });
    await expect.poll(() => status(repair.slot)).toMatchObject({ phase: "configured", accountId: googleAccount.accountId });
    assert(engine.moduleCredentialHost);
    const owner = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault }, undefined, undefined, runtime);
    const sendCredential = () => owner.withSmtpCredentials(googleAccount.accountId, async (_settings, token) => authMatches(google, token));
    now += 100_000;
    expect(await Promise.all([sendCredential(), sendCredential()])).toEqual([true, true]);
    expect(refreshes).toHaveLength(1);
    const rotated = credentials.get(google)!.refresh;
    const switchKey = randomUUID();
    const beforeSwitch = await begin("gmail", "switch@example.invalid", undefined, switchKey);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    blockEntered = entered.resolve;
    await callback(beforeSwitch.url, { code: ticketFor(beforeSwitch, "gmail", "switch@example.invalid", googleScopes, { hold: release.promise }) });
    await entered.promise;
    await engine.shutdown();
    release.resolve();
    const other = path.join(root, "other");
    mkdirSync(other);
    engine = await boot({ vaultPath: other, desktopUserData, create: true, mailOAuth: runtime });
    expect(await request("mail.oauth.status", { sessionId: beforeSwitch.slot.sessionId })).toMatchObject({ ok: false });
    expect((await list()).accounts).toHaveLength(0);
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
    expect((await list()).accounts).toHaveLength(2);
    expect(await status(beforeSwitch.slot)).toMatchObject({ sessionId: beforeSwitch.slot.sessionId, phase: "unknown", reason: "commit-unconfirmed" });
    expect(await request("mail.oauth.begin", { provider: "gmail", email: "switch@example.invalid" }, "desktop", switchKey)).toMatchObject({ ok: true, data: { sessionId: beforeSwitch.slot.sessionId, phase: "unknown" } });
    expect(await status(rejected.slot)).toMatchObject({ phase: "failed", reason: "denied" });
    expect(await status(expired.slot)).toMatchObject({ phase: "expired", reason: "expired" });
    now += 100_000;
    expect(await call("mail.sync.refresh", mbox)).toMatchObject({ message: { uid: 42 } });
    expect(refreshes[1]).toBe(rotated);

    for (const { accountId } of [googleAccount, outlookAccount]) {
      const draftId = randomUUID();
      const draft = await call<{ revision: string }>("mail.drafts.save", {
        draftId,
        expectedRevision: null,
        draft: { accountId, to: ["recipient@example.invalid"], cc: [], bcc: [], subject: "Synthetic OAuth send", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Loopback only" }] }] } },
      });
      const sent = await call<{ operationId: string }>("mail.outbox.submit", { draftId, expectedRevision: draft.revision });
      await expect.poll(() => call("mail.outbox.status", { operationId: sent.operationId })).toMatchObject({ state: "accepted" });
    }
    expect(smtp.counts).toMatchObject({ authenticated: 2, data: 2 });
    issuers.gmail.gmailApi = `${base}${gmail.basePath}`;
    await verifyGmailHistory(
      gmail,
      googleAccount.accountId,
      call,
      async () => {
        await engine?.shutdown();
        engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
      },
      notices,
      () => {
        lostNoticeAcknowledgement = true;
      },
      imap,
    );
    expect(delivered).toEqual([notices.list()[0]?.id, notices.list()[0]?.id]);
    expect(smtp.counts).toMatchObject({ authenticated: 3, data: 3 });
    expect(smtp.messages[2]).toMatchObject({ sender: google, recipients: ["reader@example.invalid"], wire: expect.stringContaining("In-Reply-To: <42-new@example.invalid>") });

    const beforeOutlook = { api: requests.length, imap: imap.fetchRequests.length, auth: imap.commands.filter((verb) => verb === "AUTHENTICATE").length, smtp: smtp.counts.data };
    inbox.messages.push({
      uidValidity: 99,
      uid: 43,
      subject: "Exchange arrival",
      source: `From: Exchange Sender <exchange-reader@example.invalid>\r\nTo: ${outlook}\r\nBcc: outlook-blind@example.invalid\r\nMessage-ID: <exchange.43@example.invalid>\r\nSubject: Exchange arrival\r\n\r\nExchange IMAP body\r\n`,
    });
    interruptExchange = true;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false });
    expect(await call("mail.messages.latest", outlookInbox)).toMatchObject({ message: { transport: "imap", uid: 42 } });
    const restored = await call<{ message: { localMessageId: string } }>("mail.sync.refresh", outlookInbox);
    expect(restored).toMatchObject({ message: { transport: "imap", uid: 43, uidValidity: "99" }, sync: { transport: "imap", range: "folder", limit: 200 } });
    expect(await call("mail.sync.status", outlookInbox)).toEqual({ transport: "imap", range: "folder", limit: 200 });
    const exchangeKey = { ...outlookInbox, localMessageId: restored.message.localMessageId };
    expect(await call("mail.conversations.loadBody", exchangeKey)).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Exchange IMAP body") } });
    expect(await call("mail.messages.markRead", exchangeKey)).toEqual({ state: "synced", remoteSynced: true });
    expect(imap.storeRequests.at(-1)).toMatch(/UID STORE 43/i);
    const exchangeReply = await sendFixtureReply(call, exchangeKey);
    expect(exchangeReply).toMatchObject({ to: ["exchange-reader@example.invalid"], cc: [], reply: { inReplyTo: "<exchange.43@example.invalid>" } });
    expect(JSON.stringify(exchangeReply)).not.toContain("outlook-blind@example.invalid");
    expect(smtp.messages[3]).toMatchObject({ sender: outlook, recipients: ["exchange-reader@example.invalid"], wire: expect.stringContaining("In-Reply-To: <exchange.43@example.invalid>") });
    expect(smtp.counts.data - beforeOutlook.smtp).toBe(1);
    expect(requests).toHaveLength(beforeOutlook.api);
    expect(await call("mail.messages.latest", mbox)).toMatchObject({ message: { transport: "gmail", nativeId: "42-gap" } });
    console.info(
      JSON.stringify({
        scenario: "outlook-exchange",
        imapRequests: imap.fetchRequests.length - beforeOutlook.imap,
        imapAuth: imap.commands.filter((verb) => verb === "AUTHENTICATE").length - beforeOutlook.auth,
        httpRequests: requests.length - beforeOutlook.api,
        smtpData: smtp.counts.data - beforeOutlook.smtp,
      }),
    );

    const callbackFirst = "callback-first@example.invalid";
    const browserFirst = "browser-first@example.invalid";
    const ack = Promise.withResolvers<void>();
    const exchangeEntered = Promise.withResolvers<void>();
    const finishExchange = Promise.withResolvers<void>();
    const startCount = opened.length;
    const codeCount = exchangeCount;
    browserAck = ack.promise;
    blockEntered = exchangeEntered.resolve;
    const completionKey = randomUUID();
    const completionInput = { provider: "gmail", email: callbackFirst };
    const start = request("mail.oauth.begin", completionInput, "desktop", completionKey);
    let configuredSlot: Status | undefined;
    await expect.poll(() => opened.length).toBe(startCount + 1);
    const target = opened.at(-1)!;
    const tokenCode = `fixture-code-${randomUUID()}`;
    codes.set(tokenCode, { url: target, provider: "gmail", email: callbackFirst, scopes: googleScopes, hold: finishExchange.promise });
    try {
      expect((await callback(target, { code: tokenCode })).status).toBe(200);
      await exchangeEntered.promise;
      ack.reject(new Error("fixture lost the browser acknowledgement"));
      const openedSession = await start;
      assert(openedSession.ok);
      const slot = openedSession.data as Status;
      expect(await status(slot)).toMatchObject({ phase: "finishing" });
      expect(await request("mail.oauth.begin", { provider: "gmail", email: callbackFirst })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(opened).toHaveLength(startCount + 1);
      finishExchange.resolve();
      await expect.poll(() => status(slot)).toMatchObject({ phase: "configured" });
      configuredSlot = await status(slot);
      expect(await request("mail.oauth.begin", completionInput, "desktop", completionKey)).toMatchObject({ ok: true, data: { phase: "configured", sessionId: slot.sessionId } });
      expect((await list()).accounts.filter(({ definition }) => definition.settings.email === callbackFirst)).toHaveLength(1);
      expect(exchangeCount - codeCount).toBe(1);
    } finally {
      ack.resolve();
      finishExchange.resolve();
      browserAck = undefined;
      blockEntered = undefined;
    }

    const refuse = Promise.withResolvers<void>();
    browserAck = refuse.promise;
    const deniedBrowser = call<Status>("mail.oauth.begin", { provider: "gmail", email: browserFirst });
    await expect.poll(() => opened.length).toBe(startCount + 2);
    refuse.reject(new Error("fixture refused to launch the browser"));
    const deniedBrowserSlot = await deniedBrowser;
    await expect.poll(() => status(deniedBrowserSlot)).toMatchObject({ phase: "failed", reason: "browser-unavailable" });
    const late = await callback(opened.at(-1)!, { code: "late" }).then(
      (response) => response.status,
      () => "closed",
    );
    expect(late).not.toBe(200);
    expect(exchangeCount - codeCount).toBe(1);
    browserAck = undefined;

    const http = async (token: string, capability: string, input: unknown, key?: string, claimedSubject?: string) => {
      assert(engine);
      const reply = await oauthHttp(engine.port, token, capability, input, key, claimedSubject);
      expect(reply.status).toBe(200);
      return CapabilityResultSchema.parse(await reply.json());
    };
    const statusOf = async (...args: Parameters<typeof http>) => {
      const result = await http(...args);
      assert(result.ok, JSON.stringify(result));
      return result.data as Status;
    };
    for (const capability of ["mail.oauth.begin", "mail.oauth.status", "mail.oauth.cancel"]) await call("gateway.update", { capability, exposed: true });
    const a = await call<{ id: string; token: string }>("gateway.tokens.create", { name: "Mail test A" });
    const b = await call<{ id: string; token: string }>("gateway.tokens.create", { name: "Mail test B" });
    const sharedKey = randomUUID();
    const inputA = { provider: "gmail", email: "lost-reply@example.invalid" };
    const inputB = { provider: "gmail", email: "second-token@example.invalid" };
    const beforeReplay = opened.length;
    const pendingBrowser = Promise.withResolvers<void>();
    browserAck = pendingBrowser.promise;
    assert(engine);
    await dropBeginAcknowledgement(engine, a.token, inputA, sharedKey);
    const startA = await statusOf(a.token, "mail.oauth.begin", inputA, sharedKey);
    expect(startA).toMatchObject({ phase: "waiting" });
    expect(opened).toHaveLength(beforeReplay + 1);
    expect(await http(a.token, "mail.oauth.begin", inputB, sharedKey)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    const sessionA = { sessionId: startA.sessionId };
    expect(await http(b.token, "mail.oauth.status", sessionA, undefined, a.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const cancelKey = randomUUID();
    expect(await http(b.token, "mail.oauth.cancel", sessionA, cancelKey, a.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await status(startA)).toMatchObject({ phase: "waiting" });
    const targetA = opened.at(-1)!;
    pendingBrowser.resolve();
    browserAck = undefined;
    const startB = await statusOf(b.token, "mail.oauth.begin", inputB, sharedKey);
    const sessionB = { sessionId: startB.sessionId };
    expect(startB.sessionId).not.toBe(startA.sessionId);
    expect(opened).toHaveLength(beforeReplay + 2);
    expect(await status(startB)).toMatchObject({ phase: "waiting" });
    expect(await call("mail.oauth.cancel", sessionB)).toMatchObject({ phase: "cancelled" });

    const cancelEntered = Promise.withResolvers<void>();
    const cancelledExchange = Promise.withResolvers<void>();
    blockEntered = cancelEntered.resolve;
    const codeA = `fixture-code-${randomUUID()}`;
    codes.set(codeA, { url: targetA, provider: "gmail", email: inputA.email, scopes: googleScopes, hold: cancelledExchange.promise });
    try {
      expect((await callback(targetA, { code: codeA })).status).toBe(200);
      await cancelEntered.promise;
      expect(await statusOf(a.token, "mail.oauth.begin", inputA, sharedKey)).toMatchObject({ phase: "finishing", sessionId: startA.sessionId });
      expect(await statusOf(a.token, "mail.oauth.cancel", sessionA, cancelKey)).toMatchObject({ phase: "finishing" });
      await expect.poll(() => status(startA)).toMatchObject({ phase: "cancelled" });
      expect(await statusOf(a.token, "mail.oauth.cancel", sessionA, cancelKey)).toMatchObject({ phase: "cancelled" });
      expect(await statusOf(a.token, "mail.oauth.begin", inputA, sharedKey)).toMatchObject({ phase: "cancelled" });
      expect(await http(a.token, "mail.oauth.cancel", sessionB, cancelKey)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    } finally {
      cancelledExchange.resolve();
      blockEntered = undefined;
    }
    const privateIntents = readFileSync(path.join(engine.vault.runtimeDir, "mail-oauth-intents.ndjson"), "utf8");
    expect(privateIntents).toContain(startA.sessionId);
    expect([sharedKey, codeA, inputA.email, a.id, a.token, targetA.searchParams.get("state"), targetA.searchParams.get("nonce")].some((value) => value && privateIntents.includes(value))).toBe(false);
    expect((await list()).accounts.some(({ definition }) => definition.settings.email === inputA.email)).toBe(false);

    await engine.shutdown();
    engine = await boot({ vaultPath: other, desktopUserData, mailOAuth: runtime });
    expect(await request("mail.oauth.status", sessionA)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect((await oauthHttp(engine.port, a.token, "mail.oauth.begin", inputA, sharedKey)).status).toBe(401);
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
    expect(await statusOf(a.token, "mail.oauth.begin", inputA, sharedKey)).toMatchObject({ ...sessionA, phase: "cancelled", reason: "cancelled" });
    expect(await statusOf(a.token, "mail.oauth.cancel", sessionA, cancelKey)).toMatchObject({ ...sessionA, phase: "cancelled", reason: "cancelled" });
    expect(await statusOf(b.token, "mail.oauth.begin", inputB, sharedKey)).toMatchObject({ ...sessionB, phase: "cancelled", reason: "cancelled" });
    expect(await http(b.token, "mail.oauth.status", sessionA)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await status(startA)).toMatchObject({ ...sessionA, phase: "cancelled" });
    assert(configuredSlot?.accountId);
    expect(await status(configuredSlot)).toEqual(configuredSlot);
    expect(await request("mail.oauth.begin", completionInput, "desktop", completionKey)).toEqual({ ok: true, data: configuredSlot });
    expect(opened).toHaveLength(beforeReplay + 2);

    const generationKey = randomUUID();
    const [generation, concurrentReplay] = await Promise.all([statusOf(a.token, "mail.oauth.begin", inputA, generationKey), statusOf(a.token, "mail.oauth.begin", inputA, generationKey)]);
    expect(generation.phase).toBe("waiting");
    expect(concurrentReplay).toEqual(generation);
    expect(opened).toHaveLength(beforeReplay + 3);
    const oldListener = opened.at(-1)!;
    expect(await call("plugins.setEnabled", { id: "mail", enabled: false })).toMatchObject({ state: "disabled" });
    expect(await http(a.token, "mail.oauth.begin", inputA, generationKey)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call("plugins.setEnabled", { id: "mail", enabled: true })).toMatchObject({ state: "active" });
    expect(await statusOf(a.token, "mail.oauth.begin", inputA, generationKey)).toMatchObject({ sessionId: generation.sessionId, phase: "cancelled", reason: "cancelled" });
    expect(await status(configuredSlot)).toEqual(configuredSlot);
    expect(
      await callback(oldListener, { code: "late" }).then(
        (response) => response.status,
        () => "closed",
      ),
    ).not.toBe(200);
    expect(opened).toHaveLength(beforeReplay + 3);

    const gapEmail = "receipt-gap@example.invalid";
    const gapKey = randomUUID();
    const gap = await begin("gmail", gapEmail, undefined, gapKey);
    const complete = OperationReceipts.prototype.complete;
    const crashGap = vi.spyOn(OperationReceipts.prototype, "complete").mockImplementation(function (this: OperationReceipts, entry, state, result) {
      if (entry.operationId === gap.slot.sessionId) throw new Error("fixture interrupted after credential commit");
      return complete.call(this, entry, state, result);
    });
    let committed: Status;
    try {
      expect((await callback(gap.url, { code: ticketFor(gap, "gmail", gapEmail) })).status).toBe(200);
      await expect.poll(() => status(gap.slot)).toMatchObject({ phase: "configured" });
      committed = await status(gap.slot);
      expect(
        readFileSync(path.join(engine.vault.runtimeDir, "mail-oauth-intents.ndjson"), "utf8")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { operationId: string; phase: string })
          .filter(({ operationId }) => operationId === gap.slot.sessionId),
      ).toMatchObject([{ phase: "accepted" }]);
    } finally {
      crashGap.mockRestore();
    }
    const finishCounters = { browsers: opened.length, exchanges: exchangeCount };
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
    expect(await status(gap.slot)).toEqual(committed);
    expect(await request("mail.oauth.begin", { provider: "gmail", email: gapEmail }, "desktop", gapKey)).toEqual({ ok: true, data: committed });
    expect({ browsers: opened.length, exchanges: exchangeCount }).toEqual(finishCounters);

    const sameAccount = (await list()).accounts.find(({ accountId }) => accountId === committed.accountId);
    assert(sameAccount);
    const failedKey = randomUUID();
    const repairInput = { accountId: sameAccount.accountId, expectedRevision: sameAccount.revision };
    const precommit = await begin("gmail", gapEmail, repairInput, failedKey);
    const write = engine.vault.files.write.bind(engine.vault.files);
    const crashBefore = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
      if (args[0].startsWith(".huhu/module-credentials/")) throw new Error("fixture denied credential publication");
      return write(...args);
    });
    try {
      expect((await callback(precommit.url, { code: ticketFor(precommit, "gmail", gapEmail) })).status).toBe(200);
      await expect.poll(() => status(precommit.slot)).toMatchObject({ phase: "unknown", reason: "commit-unconfirmed" });
      expect((await list()).accounts.find(({ accountId }) => accountId === sameAccount.accountId)?.revision).toBe(sameAccount.revision);
    } finally {
      crashBefore.mockRestore();
    }
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData, mailOAuth: runtime });
    expect(await status(precommit.slot)).toMatchObject({ sessionId: precommit.slot.sessionId, phase: "unknown", reason: "commit-unconfirmed" });
    expect(await request("mail.oauth.begin", { provider: "gmail", email: gapEmail, repair: repairInput }, "desktop", failedKey)).toMatchObject({ ok: true, data: { sessionId: precommit.slot.sessionId, phase: "unknown" } });

    const evicted = await begin("gmail", "evicted-outcome@example.invalid", undefined, gapKey + "-evict");
    expect((await callback(evicted.url, { code: ticketFor(evicted, "gmail", "evicted-outcome@example.invalid") })).status).toBe(200);
    await expect.poll(() => status(evicted.slot)).toMatchObject({ phase: "configured" });
    const evictedResult = await status(evicted.slot);
    for (let i = 0; i < 32; i++) {
      const idle = await begin("gmail", `slot-${i}@example.invalid`);
      await call("mail.oauth.cancel", { sessionId: idle.slot.sessionId });
    }
    expect(await status(evicted.slot)).toEqual(evictedResult);
    expect(await request("mail.oauth.begin", { provider: "gmail", email: "evicted-outcome@example.invalid" }, "desktop", gapKey + "-evict")).toEqual({ ok: true, data: evictedResult });

    assert(engine.moduleCredentialHost);
    const unrelatedAccount = randomUUID();
    const accountStore = new ModuleCredentials({ ...engine.moduleCredentialHost, vault: engine.vault, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings, oauth }) => accountTargets(settings, oauth) });
    await accountStore.save({
      entityId: unrelatedAccount,
      expectedRevision: null,
      definition: { ...sameAccount.definition, settings: { ...sameAccount.definition.settings, email: "switch@example.invalid" } },
      actions: [{ purpose: accountPasswordPurpose, action: "clear" }],
    });
    expect(await status(beforeSwitch.slot)).toMatchObject({ sessionId: beforeSwitch.slot.sessionId, phase: "unknown" });

    const copiedVault = path.join(root, "copied-outcomes");
    mkdirSync(path.join(copiedVault, ".huhu"), { recursive: true });
    writeFileSync(path.join(copiedVault, ".huhu", "vault.json"), readFileSync(path.join(vaultPath, ".huhu", "vault.json")));
    const runtimeCopy = path.join(copiedVault, path.relative(vaultPath, engine.vault.runtimeDir));
    mkdirSync(runtimeCopy, { recursive: true });
    writeFileSync(path.join(runtimeCopy, "mail-oauth-intents.ndjson"), readFileSync(path.join(engine.vault.runtimeDir, "mail-oauth-intents.ndjson")));
    const clone = await boot({ vaultPath: copiedVault, desktopUserData, mailOAuth: runtime });
    try {
      const response = await oauthHttp(clone.port, clone.rendererToken, "mail.oauth.status", { sessionId: gap.slot.sessionId });
      expect(CapabilityResultSchema.parse(await response.json())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    } finally {
      await clone.shutdown();
    }

    const restoredAddress = "restore-during-oauth@example.invalid";
    const restoredAccount = randomUUID();
    const waiting = await begin("gmail", restoredAddress);
    const archiveVault = path.join(root, "archive-source");
    mkdirSync(archiveVault);
    const archiveSource = await boot({ vaultPath: archiveVault, desktopUserData, create: true, mailOAuth: runtime });
    let content: string;
    try {
      assert(archiveSource.moduleCredentialHost);
      await openMailAccounts({ ...archiveSource.moduleCredentialHost, vault: archiveSource.vault }).restoreDefinition(
        restoredAccount,
        { ...googleAccount.definition, settings: { ...googleAccount.definition.settings, email: restoredAddress } },
        new AbortController().signal,
        false,
        new Set<string>(),
      );
      const exported = await archiveSource.dispatcher.call("desktop", { capability: "mail.subset.create", input: { accountIds: [restoredAccount] }, requestId: randomUUID(), idempotencyKey: randomUUID() });
      assert(exported.ok, JSON.stringify(exported));
      content = (exported.data as { content: string }).content;
    } finally {
      await archiveSource.shutdown();
    }
    const { previewId } = await call<{ previewId: string }>("mail.subset.preview", { content });
    await call("mail.subset.restore", { previewId, accountIds: [restoredAccount], confirm: true });
    expect((await callback(waiting.url, { code: ticketFor(waiting, "gmail", restoredAddress) })).status).toBe(200);
    await expect.poll(() => status(waiting.slot)).toMatchObject({ phase: "failed", reason: "account-changed" });
    expect((await list()).accounts.filter(({ definition }) => definition.settings.email === restoredAddress)).toEqual([expect.objectContaining({ accountId: restoredAccount, authState: { "account-password": "unconfigured" } })]);

    const firstGraph = "43-native+A=";
    const secondGraph = "43-native+B=";
    const initial = graph.add(firstGraph, outlook, 1);
    const firstCursor = "round+1/opaque=";
    graph.pages.set("initial", { value: [initial], cursor: firstCursor });
    const repairOutlook = async (route: "graph" | "imap", send = true) => {
      const current = (await list()).accounts.find(({ accountId }) => accountId === outlookInbox.accountId)!;
      const session = await begin("outlook", outlook, { accountId: current.accountId, expectedRevision: current.revision }, undefined, send);
      const scopes = send ? microsoftScopes : microsoftScopes.split(" ")[0]!;
      expect(session.url.searchParams.get("prompt")).toBeNull();
      expect(session.url.searchParams.get("scope")).toContain(scopes);
      if (!send) expect(session.url.searchParams.get("scope")).not.toContain("SMTP.Send");
      expect(session.url.searchParams.get("scope")).not.toContain("graph.microsoft.com");
      await callback(session.url, { code: ticketFor(session, "outlook", outlook, scopes) });
      await expect.poll(() => status(session.slot)).toMatchObject({ phase: "configured", route, accountId: current.accountId });
      return session;
    };
    approvedGraph.add(outlook);
    for (const returnedScope of ["Mail.ReadBasic", microsoftScopes]) {
      upgradeReceipt = returnedScope;
      const before = graph.requests.length;
      await repairOutlook("imap");
      expect(graph.requests).toHaveLength(before);
    }
    upgradeReceipt = undefined;
    graph.state.probeStatus = 403;
    await repairOutlook("imap");
    expect((await list()).accounts.find(({ accountId }) => accountId === outlookInbox.accountId)?.definition.oauth).toMatchObject({ route: "imap", graphFallback: "graph-api-permission" });
    expect(await call("mail.sync.refresh", outlookInbox)).toMatchObject({ message: { transport: "imap", uid: 43 } });
    graph.state.probeStatus = 200;
    const manuallyDisabled = randomUUID();
    const disabledDraft = await call<{ revision: string }>("mail.drafts.save", {
      draftId: manuallyDisabled,
      expectedRevision: null,
      draft: { accountId: outlookInbox.accountId, to: ["recipient@example.invalid"], cc: [], bcc: [], subject: "Manual receive only", body: { type: "doc", content: [{ type: "paragraph" }] } },
    });
    const receiveOnly = await repairOutlook("graph", false);
    expect(await status(receiveOnly.slot)).toMatchObject({ smtp: false });
    expect(graphExchanges.at(-1)?.scope).toBe("https://graph.microsoft.com/Mail.Read");
    expect(await request("mail.outbox.submit", { draftId: manuallyDisabled, expectedRevision: disabledDraft.revision })).toMatchObject({ ok: false, error: { details: { reason: "sender-not-available" } } });
    graph.requests.length = 0;
    await repairOutlook("graph");
    expect(graphAccess).toMatch(/^opaque-graph-[^.]+$/);
    const exchangeOnlyEmail = "exchange-only@example.invalid";
    const exchangeOnlySession = await begin("outlook", exchangeOnlyEmail);
    expect(exchangeOnlySession.url.searchParams.get("prompt")).toBeNull();
    await callback(exchangeOnlySession.url, { code: ticketFor(exchangeOnlySession, "outlook", exchangeOnlyEmail) });
    await expect.poll(() => status(exchangeOnlySession.slot)).toMatchObject({ phase: "configured", route: "imap", smtp: true });
    expect(graphExchanges).toContainEqual({ email: exchangeOnlyEmail, scope: graphScopes });
    const exchangeOnlyInbox = { accountId: (await status(exchangeOnlySession.slot)).accountId!, folder: "INBOX" };
    const exchangeOnlyResult = await call<{ message: { localMessageId: string } }>("mail.sync.refresh", exchangeOnlyInbox);
    expect(exchangeOnlyResult).toMatchObject({ message: { transport: "imap", uid: 43 } });
    await sendFixtureReply(call, { ...exchangeOnlyInbox, localMessageId: exchangeOnlyResult.message.localMessageId });
    const imapBeforeGraph = imap.fetchRequests.length;
    const imapAuthBeforeGraph = imap.commands.filter((verb) => verb === "AUTHENTICATE").length;
    const smtpBeforeGraph = smtp.counts.data;
    const graphRefresh = async (id: string) => {
      const refreshed = await call<{ message: { localMessageId: string } }>("mail.sync.refresh", outlookInbox);
      expect(refreshed).toMatchObject({ message: { transport: "graph", nativeId: id }, sync: { transport: "graph", range: "inbox", limit: 200 } });
      return { ...outlookInbox, localMessageId: refreshed.message.localMessageId };
    };
    const expectGraphNotice = async (since: number, nativeId: string) => {
      const arrivals = delivered.slice(since);
      expect(arrivals).toHaveLength(1);
      expect(await call("mail.notifications.target", { id: arrivals[0] })).toMatchObject({ ...outlookInbox, source: "graph", nativeId });
    };
    const beforeInitialNotice = delivered.length;
    const graphKey = await graphRefresh(firstGraph);
    expect(delivered).toHaveLength(beforeInitialNotice);
    expect(graphKey.localMessageId).not.toBe(exchangeKey.localMessageId);
    expect(graph.requests.map(({ path }) => path)).toEqual(["/mailFolders/inbox", "/mailFolders/inbox/messages/delta", `/mailFolders/inbox/messages/${encodeURIComponent(firstGraph)}/$value`]);
    expect(await call("mail.messages.loadBody", graphKey)).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Graph body 1"), attachments: [{ name: "graph-note.txt", mediaType: "text/plain" }] } });
    const graphMime = await call<{ source: string }>("mail.messages.loadSource", graphKey);
    expect(Buffer.from(graphMime.source, "base64").toString("utf8")).toContain("Fixture attachment");
    expect(await call("mail.conversations.search", { text: "Graph body 1", accountId: outlookInbox.accountId })).toMatchObject({ hits: [{ target: { source: "graph", nativeId: firstGraph } }] });
    expect(await call("mail.messages.markRead", graphKey)).toEqual({ state: "local", remoteSynced: false });
    const graphReply = await sendFixtureReply(call, graphKey);
    expect(graphReply).toMatchObject({ to: ["graph-reader@example.invalid"], reply: { inReplyTo: "<graph.1@example.invalid>" } });
    expect(graph.sent).toHaveLength(1);
    expect(graph.sent[0]).toContain("To: graph-reader@example.invalid");
    expect(graph.sent[0]).toContain("In-Reply-To: <graph.1@example.invalid>");
    expect(graph.sent[0]).not.toContain("graph-blind@example.invalid");

    const second = graph.add(secondGraph, outlook, 2);
    for (const [origin, folder] of [
      ["https://untrusted.example.invalid", "inbox"],
      [base, "different-inbox"],
    ]) {
      graph.pages.set(firstCursor, { value: [], nextLink: `${origin}${graph.endpoint}/mailFolders('${folder}')/messages/delta?$skiptoken=untrusted` });
      const before = graph.requests.length;
      expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
      expect(graph.requests.slice(before).map(({ key }) => key)).toEqual([firstCursor]);
    }
    const secondPage = "page+2/opaque=";
    const removedFirst = { id: firstGraph, "@removed": { reason: "deleted" } };
    graph.pages.set(firstCursor, { value: [second], next: secondPage });
    graph.pages.set(secondPage, { value: [removedFirst], next: "stale-read" });
    graph.pages.set("stale-read", { value: [{ id: firstGraph, isRead: true }], cursor: "round-2" });
    graph.inbox.delete(firstGraph);
    graph.state.failKey = secondPage;
    const beforeFailure = graph.requests.length;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
    expect(graph.requests.slice(beforeFailure).map(({ key }) => key)).toEqual([firstCursor, secondPage]);
    expect(graph.requests[beforeFailure]?.resource).toContain("$deltatoken=round%2B1%2Fopaque%3D");
    expect(graph.requests[beforeFailure + 1]?.resource).toContain("$skiptoken=page%2B2%2Fopaque%3D");
    expect(await call("mail.messages.latest", outlookInbox)).toMatchObject({ message: { nativeId: firstGraph, readState: "local" } });
    graph.state.status = 403;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({
      ok: false,
      error: { message: "Microsoft Graph 拒绝访问收件箱，已同步邮件仍可查看。", details: { reason: "graph-api-permission" } },
    });
    expect(await call("mail.messages.latest", outlookInbox)).toMatchObject({ message: { nativeId: firstGraph } });
    graph.state.failKey = "";
    const secondKey = await graphRefresh(secondGraph);
    expect(await call("mail.messages.loadBody", graphKey)).toEqual({ state: "needs-refresh" });

    graph.inbox.set(firstGraph, { ...initial, isRead: true });
    graph.pages.set("round-2", { value: [removedFirst], next: "moved-back" });
    graph.pages.set("moved-back", { value: [{ id: firstGraph, isRead: false }], cursor: "round-2-returned" });
    await graphRefresh(secondGraph);
    expect(await call("mail.messages.loadBody", graphKey)).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Graph body 1") } });
    graph.inbox.delete(firstGraph);

    graph.state.failKey = "round-2-returned";
    graph.state.status = 410;
    graph.pages.delete("initial");
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
    expect(await call("mail.messages.latest", outlookInbox)).toMatchObject({ message: { nativeId: secondGraph } });
    const moved = graph.add("outside-inbox", outlook, 3);
    graph.inbox.delete(moved.id);
    graph.pages.set("initial", { value: [second, moved], next: "recovery-1" });
    for (let page = 1; page < 20; page++) graph.pages.set(`recovery-${page}`, { value: [], next: `recovery-${page + 1}` });
    graph.pages.set("recovery-20", {
      value: [
        { id: secondGraph, isRead: true },
        { ...moved, parentFolderId: "elsewhere" },
      ],
      cursor: "round-3",
    });
    graph.inbox.set(secondGraph, { ...second, isRead: true });
    const beforeRecovery = graph.requests.length;
    expect(await call("mail.sync.refresh", outlookInbox)).toMatchObject({ message: { nativeId: secondGraph, readState: "unread" } });
    expect(graph.requests.slice(beforeRecovery).map(({ key }) => key)).toEqual(["round-2-returned", null, ...Array.from({ length: 19 }, (_, i) => `recovery-${i + 1}`)]);
    const beforeResume = graph.requests.length;
    await graphRefresh(secondGraph);
    expect(graph.requests.slice(beforeResume).map(({ path }) => path)).toEqual([
      expect.stringMatching(/\/messages\/delta$/),
      `/messages/${encodeURIComponent(secondGraph)}`,
      "/messages/outside-inbox",
      "/mailFolders/inbox/messages",
      `/mailFolders/inbox/messages/${encodeURIComponent(secondGraph)}/$value`,
    ]);
    expect(await call("mail.messages.latest", outlookInbox)).toMatchObject({ message: { nativeId: secondGraph, readState: "synced" } });
    expect(await call("mail.sync.status", outlookInbox)).toMatchObject({ transport: "graph", recovery: "delta-expired" });
    expect(imap.fetchRequests).toHaveLength(imapBeforeGraph);
    expect(imap.commands.filter((verb) => verb === "AUTHENTICATE")).toHaveLength(imapAuthBeforeGraph);
    expect(smtp.counts.data).toBe(smtpBeforeGraph);

    const seed = await call<ReplySeed>("mail.messages.prepareReply", { ...secondKey, mode: "reply" });
    const draftId = randomUUID();
    const body = { type: "doc", content: [{ type: "paragraph" }] };
    const blindRecipient = "actual-blind-recipient@example.invalid";
    const { revision } = await call<{ revision: string }>("mail.drafts.save", { draftId, expectedRevision: null, draft: { ...seed, bcc: [blindRecipient], body } });
    const attachmentPath = path.join(root, "graph-outbound.bin");
    const attachmentBytes = Buffer.from([0, 1, 254, 255, 128, 4]);
    writeFileSync(attachmentPath, attachmentBytes);
    const attached = await engine!.addMailDraftAttachment(
      {
        type: "mail-attachment:add",
        vaultId: engine!.vault.id,
        draftId,
        expectedRevision: revision,
        file: { path: attachmentPath, name: "graph-outbound.bin", size: attachmentBytes.length, fingerprint: selectedFileFingerprint(statSync(attachmentPath, { bigint: true })) },
      },
      new AbortController().signal,
    );
    assert(attached.status === "attached");
    const submit = { draftId, expectedRevision: attached.draft.revision };
    graph.state.loseSendAck = true;
    const { operationId: graphUnknown } = await call<{ operationId: string }>("mail.outbox.submit", submit);
    await expect.poll(() => call("mail.outbox.status", { operationId: graphUnknown })).toMatchObject({ state: "unknown", retryableRecipients: [] });
    expect(await call("mail.outbox.submit", submit)).toMatchObject({ operationId: graphUnknown });
    expect(graph.sent).toHaveLength(2);
    expect(graph.sent[1]).toContain(`Bcc: ${blindRecipient}`);
    expect(graph.sent[1]).toMatch(/filename="?graph-outbound\.bin"?/);
    expect(graph.sent[1]).toContain(attachmentBytes.toString("base64"));

    graph.state.loseSendAck = false;
    graph.state.sendStatus = 403;
    const forbiddenDraft = randomUUID();
    const forbidden = await call<{ revision: string }>("mail.drafts.save", { draftId: forbiddenDraft, expectedRevision: null, draft: { ...seed, bcc: [], body } });
    const forbiddenSend = await call<{ operationId: string }>("mail.outbox.submit", { draftId: forbiddenDraft, expectedRevision: forbidden.revision });
    await expect.poll(() => call("mail.outbox.status", { operationId: forbiddenSend.operationId })).toMatchObject({ state: "not-delivered", graphStatus: 403, graphErrorCode: "ErrorAccessDenied" });
    expect(await call("mail.outbox.status", { operationId: forbiddenSend.operationId })).not.toHaveProperty("reason");
    graph.state.sendStatus = 202;

    graph.state.failKey = "";
    graph.pages.set("round-3", { value: [], cursor: "round-4" });
    now += 100_000;
    graphRefreshFailure = "disconnect";
    const beforeDisconnect = graphExchanges.length;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "network" } } });
    expect(graphExchanges.slice(beforeDisconnect)).toEqual([{ email: outlook, scope: graphScopes }]);

    graphRefreshFailure = "invalid_scope";
    const beforeDowngrade = graphExchanges.length;
    const permissions = vi.fn();
    const unsubscribePermissions = engine!.events.subscribe((event) => {
      if (event.type !== "entity.changed" || !("op" in event.payload) || event.payload.kind !== "mail-account" || event.payload.id !== outlookInbox.accountId) return;
      const saved = ModuleCredentials.readPortableDefinition(engine!.vault.files, "mail", mailAccountDefinitionSchema, outlookInbox.accountId);
      permissions(event.payload.op, saved?.definition.oauth?.graphSend, saved?.definition.settings.smtpEnabled);
    });
    const previousAccess = graphAccess;
    try {
      await graphRefresh(secondGraph);
      expect(graphExchanges.slice(beforeDowngrade)).toEqual([
        { email: outlook, scope: graphScopes },
        { email: outlook, scope: "https://graph.microsoft.com/Mail.Read" },
      ]);
      expect(graphAccess).toMatch(/^opaque-graph-[^.]+$/);
      expect(graphAccess).not.toBe(previousAccess);
      expect(permissions).toHaveBeenCalledExactlyOnceWith("updated", false, false);
    } finally {
      unsubscribePermissions();
    }
    expect((await list()).accounts.find(({ accountId }) => accountId === outlookInbox.accountId)?.definition).toMatchObject({ oauth: { graphSend: false }, settings: { smtpEnabled: false } });
    const receiveOnlyId = randomUUID();
    const { revision: receiveOnlyRevision } = await call<{ revision: string }>("mail.drafts.save", { draftId: receiveOnlyId, expectedRevision: null, draft: { ...seed, bcc: [], body } });
    expect(await request("mail.outbox.submit", { draftId: receiveOnlyId, expectedRevision: receiveOnlyRevision })).toMatchObject({ ok: false, error: { details: { reason: "graph-send-permission" } } });
    expect(graph.sent).toHaveLength(2);

    const padding = `${"p".repeat(896)}\r\n`.repeat(1600);
    const bulk = Array.from({ length: 10 }, (_, i) => graph.add(`bulk-${i}`, outlook, 10 + i, padding));
    graph.pages.set("round-4", { value: bulk, cursor: "round-5" });
    graph.pages.set("round-5", { value: [], deltaLink: `${base}${graph.endpoint}/mailFolders/inbox/messages/delta?$deltatoken=round-6` });
    const cacheKey = createHash("sha256")
      .update(JSON.stringify([outlookInbox.accountId, "INBOX"]))
      .digest("hex");
    const cachePath = `.huhu/cache/mail/${cacheKey}.json`;
    const cache = () =>
      JSON.parse(engine!.vault.files.read(cachePath)!.bytes.toString("utf8")).graph as {
        cursor: string;
        pending?: { id: string }[];
        progress?: { reconcile: boolean };
        awaitingDelta?: string[];
        history: { summary: { nativeId: string; localMessageId: string; readState: string } }[];
      };
    await graphRefresh("bulk-9");
    expect(cache().cursor).toContain("round-5");
    expect(cache().pending?.map(({ id }) => id)).toContain("bulk-0");
    const beforeMimes = graph.requests.length;
    await graphRefresh("bulk-9");
    expect(graph.requests.slice(beforeMimes).every(({ path }) => path.endsWith("/$value"))).toBe(true);
    expect(cache().pending).toBeUndefined();
    expect(cache().history.map(({ summary }) => summary.nativeId)).toContain("bulk-0");
    await graphRefresh("bulk-9");
    expect(cache().cursor).toContain("round-6");

    graph.pages.set("round-6", { value: [{ id: "bulk-9", isRead: true }], cursor: "round-after-abort" });
    const files = engine!.vault.files;
    const rawWrite = files.write.bind(files);
    for (const shared of [false, true]) {
      const caller = new AbortController();
      const reachedWrite = Promise.withResolvers<void>();
      const previousVersion = files.currentVersion(cachePath);
      const beforeNotices = delivered.length;
      const events = vi.fn();
      const unsubscribe = engine!.events.subscribe(({ type, payload }) => {
        if (type === "entity.changed" && "kind" in payload && payload.kind === "mail-message" && payload.id === outlookInbox.accountId) events();
      });
      const abortAtWrite = vi.spyOn(files, "write").mockImplementation((relative, bytes, options) => {
        if (relative !== cachePath) return rawWrite(relative, bytes, options);
        return rawWrite(relative, bytes, {
          ...options,
          beforeCommit: () => {
            reachedWrite.resolve();
            caller.abort();
            options?.beforeCommit?.();
          },
        });
      });
      try {
        const beforeRequests = graph.requests.length;
        const cancelled = request("mail.sync.refresh", outlookInbox, "desktop", randomUUID(), caller.signal);
        const survivor = shared ? request("mail.sync.refresh", outlookInbox) : undefined;
        expect(await Promise.race([reachedWrite.promise.then(() => "write"), cancelled])).toBe("write");
        expect(await cancelled).toMatchObject({ ok: false });
        expect(graph.requests.slice(beforeRequests).map(({ key }) => key)).toEqual(["round-6"]);
        expect(delivered).toHaveLength(beforeNotices);
        if (survivor) {
          expect(await survivor).toMatchObject({ ok: true, data: { message: { nativeId: "bulk-9", readState: "synced" } } });
          expect(cache().cursor).toContain("round-after-abort");
          expect(events).toHaveBeenCalledTimes(1);
        } else {
          expect(files.currentVersion(cachePath)).toBe(previousVersion);
          expect(cache().cursor).toContain("round-6");
          expect(events).not.toHaveBeenCalled();
        }
      } finally {
        abortAtWrite.mockRestore();
        unsubscribe();
      }
    }
    graph.inbox.set("bulk-9", { ...bulk[9]!, isRead: true });

    const windowMail = Array.from({ length: 201 }, (_, i) => {
      const message = graph.add(`window-${i}`, outlook, 30 + i);
      message.isRead = i !== 0;
      return message;
    });
    const beforeWindowNotice = delivered.length;
    graph.pages.set("round-after-abort", { value: windowMail.slice(101), next: "window-1" });
    graph.pages.set("window-1", { value: windowMail.slice(1, 101), next: "window-2" });
    graph.pages.set("window-2", { value: windowMail.slice(0, 1), next: "window-3" });
    for (let i = 3; i < 20; i++) graph.pages.set(`window-${i}`, { value: [], next: `window-${i + 1}` });
    graph.inbox.delete("window-200");
    graph.staleListEntries.set("window-200", windowMail[200]!);
    graph.pages.set("window-20", { value: [{ id: "window-200", "@removed": {} }], cursor: "round-window" });
    await graphRefresh("bulk-9");
    expect(cache().progress).toMatchObject({ reconcile: true });
    const checkpointVersion = files.currentVersion(cachePath);
    graph.state.failingInboxOffset = 200;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
    expect(graph.requests.at(-1)?.resource).toContain("?$skip=200");
    expect(files.currentVersion(cachePath)).toBe(checkpointVersion);
    expect(cache().cursor).toContain("round-after-abort");
    expect(delivered).toHaveLength(beforeWindowNotice);
    graph.state.failingInboxOffset = null;
    const beforeWindowRetry = graph.requests.length;
    await graphRefresh("window-199");
    expect(graph.requests[beforeWindowRetry]?.key).toBe("window-20");
    graph.staleListEntries.delete("window-200");
    expect(cache().cursor).toContain("round-window");
    expect(cache().progress).toBeUndefined();
    expect(cache().pending).toBeUndefined();
    expect(cache().history).toHaveLength(199);
    const oldest = cache().history.find(({ summary }) => summary.nativeId === "window-0");
    assert(oldest);
    expect(await call("mail.messages.loadBody", { ...outlookInbox, localMessageId: oldest.summary.localMessageId })).toMatchObject({
      state: "ready",
      body: { text: expect.stringContaining("Graph body 30") },
    });
    await expectGraphNotice(beforeWindowNotice, "window-0");

    graph.pages.set("round-window", { value: [], cursor: "round-window-empty" });
    await graphRefresh("window-199");
    expect(cache().history.map(({ summary }) => summary.nativeId)).toContain("window-0");

    const early = graph.add("between-delta-and-list", outlook, 235);
    const historical = graph.add("history-backfill", outlook, 90);
    graph.inbox.set("window-196", { ...windowMail[196]!, isRead: false });
    graph.omittedFromList.add("window-197");
    // The Inbox list still contains window-198 and the old window-199 read state.
    graph.pages.set("round-window-empty", {
      value: [
        { id: "window-198", "@removed": {} },
        { id: "window-199", isRead: false },
        { id: "window-197", isRead: false },
        { id: "window-196", isRead: false },
        { id: "window-195", isRead: true },
      ],
      next: "read-replays",
    });
    graph.pages.set("read-replays", {
      value: [
        { id: "window-196", isRead: true },
        { id: "window-195", isRead: false },
      ],
      cursor: "round-list-ahead",
    });
    const beforeReconcile = delivered.length;
    const beforeLookupFailure = files.currentVersion(cachePath);
    graph.state.lookupStatus = 500;
    expect(await request("mail.sync.refresh", outlookInbox)).toMatchObject({ ok: false, error: { details: { reason: "graph-api-unavailable" } } });
    expect(files.currentVersion(cachePath)).toBe(beforeLookupFailure);
    expect(cache().cursor).toContain("round-window-empty");
    graph.state.lookupStatus = 200;
    const beforeLookup = graph.requests.length;
    await graphRefresh(early.id);
    expect(
      graph.requests
        .slice(beforeLookup)
        .filter(({ path }) => path.startsWith("/messages/"))
        .map(({ path }) => path),
    ).toEqual(["/messages/window-196", "/messages/window-195"]);
    const states = new Map(cache().history.map(({ summary }) => [summary.nativeId, summary.readState]));
    expect(states.get("window-199")).toBe("unread");
    expect(states.has("window-198")).toBe(false);
    expect(states.get("window-197")).toBe("unread");
    expect(states.get("window-196")).toBe("unread");
    expect(states.get("window-195")).toBe("synced");
    expect(states.get(historical.id)).toBe("unread");
    expect(cache().awaitingDelta).toEqual([early.id]);
    expect(delivered).toHaveLength(beforeReconcile);

    graph.pages.set("round-list-ahead", { value: [early, historical], cursor: "round-arrival-confirmed" });
    await graphRefresh(early.id);
    await expectGraphNotice(beforeReconcile, early.id);
    expect(cache().awaitingDelta).toBeUndefined();
    graph.pages.set("round-arrival-confirmed", { value: [early], cursor: "round-arrival-replayed" });
    await graphRefresh(early.id);
    expect(delivered).toHaveLength(beforeReconcile + 1);

    const lateGraphMessage = graph.add("late-old-generation", outlook, 240);
    graph.pages.set("round-arrival-replayed", { value: [lateGraphMessage], cursor: "round-7" });
    const blocked = Promise.withResolvers<unknown>();
    const releaseOldWrite = Promise.withResolvers<void>();
    const previousCache = files.currentVersion(cachePath);
    const writeBarrier = vi.spyOn(files, "write").mockImplementation(async (relative, bytes, options) => {
      if (relative === cachePath) {
        blocked.resolve(options?.beforeCommit);
        await releaseOldWrite.promise;
      }
      return rawWrite(relative, bytes, options);
    });
    const lateEvents = vi.fn();
    const unsubscribeLate = engine!.events.subscribe((event) => {
      if (event.type === "entity.changed" && "op" in event.payload && ["mail-mailbox", "mail-message"].includes(event.payload.kind) && event.payload.id === outlookInbox.accountId) lateEvents();
    });
    const beforeNotices = delivered.length;
    const refreshing = request("mail.sync.refresh", outlookInbox);
    try {
      expect(await Promise.race([blocked.promise, refreshing])).toBeTypeOf("function");
      approvedGraph.delete(outlook);
      await repairOutlook("imap");
      releaseOldWrite.resolve();
      expect(await refreshing).toMatchObject({ ok: false, error: { details: { reason: "mailbox-changed" } } });
      expect(files.currentVersion(cachePath)).toBe(previousCache);
      expect(lateEvents).not.toHaveBeenCalled();
      expect(delivered).toHaveLength(beforeNotices);
    } finally {
      releaseOldWrite.resolve();
      writeBarrier.mockRestore();
      unsubscribeLate();
    }
    const beforeReturn = graph.requests.length;
    expect(await call("mail.sync.refresh", outlookInbox)).toMatchObject({ message: { transport: "imap", uid: 43, localMessageId: exchangeKey.localMessageId }, sync: { transport: "imap" } });
    expect(graph.requests).toHaveLength(beforeReturn);
    expect(await call("mail.messages.loadBody", secondKey)).toEqual({ state: "needs-refresh" });
    await sendFixtureReply(call, exchangeKey);
    expect(smtp.counts.data).toBe(smtpBeforeGraph + 1);

    rejectRefresh = true;
    now += 100_000;
    expect(await request("mail.sync.refresh", mbox)).toMatchObject({ ok: false, error: { details: { reason: "oauth-reauthorize" } } });
    expect((await list()).accounts.find(({ accountId }) => accountId === googleAccount.accountId)?.authState["account-password"]).toBe("needs-reconfiguration");
    const publicData = Buffer.from(JSON.stringify([await list(), await call("mail.oauth.availability")]));
    const persisted = readdirSync(path.join(vaultPath, ".huhu"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(path.join(entry.parentPath, entry.name)));
    expect(materials.some((value) => publicData.includes(value) || persisted.some((content) => content.includes(value)))).toBe(false);
  } finally {
    guard.mockRestore();
    injection.options = undefined;
    await engine?.shutdown();
    await imap.close();
    await smtp.close();
    issuer.closeAllConnections();
    await new Promise<void>((resolve) => issuer.close(() => resolve()));
    if (path.dirname(root) === tmpdir() && path.basename(root).startsWith("huhu-mail-oauth-")) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
};

engineTest("OAuth uses the real dispatcher, callback, module credentials, IMAP and SMTP with isolated issuers", () => exerciseOAuthEngine(), 120_000);
engineTest("Graph backfills past a stale listing entry after 201 uncached deletions", () => exerciseOAuthEngine("deletions"), 30_000);
engineTest("Graph resumes conflicting message verification across the round budget and Engine restart", () => exerciseOAuthEngine("verification"), 30_000);
engineTest("Graph records no delivery when reauthorization disables sending during MIME build", () => exerciseOAuthEngine("send"), 30_000);
engineTest("Outlook reauthorization cancels the old Graph page and immediately refreshes through Exchange", () => exerciseOAuthEngine("route-change"), 30_000);
engineTest("Graph records the revoked send permission and keeps the recipient eligible after reauthorization", () => exerciseOAuthEngine("retry-feedback"), 30_000);
