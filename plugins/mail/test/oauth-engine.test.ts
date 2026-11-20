import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { openMailAccounts, type MailAccount } from "../src/engine/accounts.js";
import { createMailOAuth, oauthMailEndpoints, type MailOAuthIssuer, type MailOAuthRuntime, type OAuthProvider } from "../src/engine/oauth-provider.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

const injection = vi.hoisted(() => ({ runtime: undefined as MailOAuthRuntime | undefined }));
vi.mock("../src/engine/registration.js", async (original) => {
  const module = await original<typeof import("../src/engine/registration.js")>();
  return { ...module, apply: (...[ctx, api, owner, transport, options]: Parameters<typeof module.apply>) => module.apply(ctx, api, owner, transport, options, injection.runtime) };
});

type Status = { sessionId: string; host: string; phase: string; reason?: string; accountId?: string; route?: string; smtp?: boolean };
type Code = { url: URL; email: string; provider: OAuthProvider; scopes: string; override?: "nonce" | "signature" | "audience" | "subject"; hold?: Promise<void> };
const google = "oauth-google@example.invalid";
const outlook = "oauth-outlook@example.invalid";
const microsoftScopes = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";
const googleScopes = "https://mail.google.com/";

test("production OAuth service addresses distinguish personal Outlook and Exchange Online", () => {
  expect(oauthMailEndpoints("outlook", outlook, true)).toEqual({ imap: { host: "outlook.office365.com", port: 993, security: "tls" }, smtp: { host: "smtp-mail.outlook.com", port: 587, security: "starttls" } });
  expect(oauthMailEndpoints("outlook", outlook, false).smtp.host).toBe("smtp.office365.com");
  expect(oauthMailEndpoints("gmail", google, false).smtp.host).toBe("smtp.gmail.com");
});

test.skipIf(process.platform !== "win32" || process.arch !== "x64")(
  "OAuth uses the real dispatcher, callback, module credentials, IMAP and SMTP with isolated issuers",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-oauth-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "app");
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    let engine: RunningEngine | undefined;
    let now = Date.now();
    let exchangeCount = 0;
    const refreshes: string[] = [];
    let rejectRefresh = false;
    let blockEntered: (() => void) | undefined;
    const credentials = new Map<string, { access: string; refresh: string; provider: OAuthProvider }>();
    const materials: string[] = [];
    const authMatches = (email: string, value: string) => email !== "protocol-disabled@example.invalid" && credentials.get(email)?.access === value;
    const imap = await openImapFixture({ acceptOAuth: authMatches, message: { uidValidity: 99, subject: "OAuth fixture", source: "Subject: OAuth fixture\r\n\r\nFixture body\r\n" } });
    const smtp = await loopbackSmtp("unused", authMatches);
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "fixture", use: "sig" };
    const codes = new Map<string, Code>();
    const issuers = {} as Record<OAuthProvider, MailOAuthIssuer>;
    const clientNames = { gmail: "synthetic-google-client", outlook: "synthetic-microsoft-client" };
    const newToken = (email: string, provider: OAuthProvider, accept = true) => {
      const access = `access-${randomUUID()}`;
      const refresh = `refresh-${randomUUID()}`;
      if (accept) credentials.set(email, { access, refresh, provider });
      materials.push(access, refresh);
      return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 120 };
    };
    const issuer = createServer(async (req, res) => {
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
        refreshes.push(refresh);
        const existing = [...credentials].find(([, value]) => value.refresh === refresh && value.provider === provider);
        if (!existing || rejectRefresh || (provider === "outlook" && fields.get("scope") !== microsoftScopes)) return json(400, { error: "invalid_grant" });
        return json(200, { ...newToken(existing[0], provider), scope: provider === "gmail" ? googleScopes : microsoftScopes });
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
    try {
      await new Promise<void>((resolve) => issuer.listen(0, "127.0.0.1", resolve));
      const port = issuer.address();
      assert(port && typeof port !== "string");
      const base = `http://127.0.0.1:${port.port}`;
      const exposed = createMailOAuth({ google: { clientId: clientNames.gmail }, microsoft: { clientId: clientNames.outlook } }, { hostLabel: "Fixture Engine", openBrowser: async () => undefined });
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
      const opened: URL[] = [];
      const runtime: MailOAuthRuntime = {
        issuers,
        hostLabel: "Fixture Engine",
        now: () => now,
        openBrowser: async (url) => {
          opened.push(new URL(url));
        },
      };
      const request = (capability: string, input: unknown = {}, caller: "desktop" | "web:other" | "cli" = "desktop") => {
        assert(engine);
        return engine.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      };
      const call = async <T>(capability: string, input: unknown = {}) => {
        const result = await request(capability, input);
        assert(result.ok, JSON.stringify(result));
        return result.data as T;
      };
      const status = (slot: Status) => call<Status>("mail.oauth.status", { sessionId: slot.sessionId });
      const begin = async (provider: OAuthProvider, email: string, repair?: { accountId: string; expectedRevision: string }) => {
        const slot = await call<Status>("mail.oauth.begin", { provider, email, ...(repair && { repair }) });
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
      engine = await boot({ vaultPath, desktopUserData, create: true });
      expect(await call("mail.oauth.availability")).toMatchObject({ gmail: false, outlook: false });
      expect(await request("mail.oauth.begin", { provider: "gmail", email: google })).toMatchObject({ ok: false, error: { details: { reason: "not-configured" } } });
      expect(await request("mail.oauth.begin", { provider: "gmail", email: google }, "cli")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await engine.shutdown();
      injection.runtime = runtime;
      engine = await boot({ vaultPath, desktopUserData });

      const googleSession = await begin("gmail", google);
      const googleCode = ticketFor(googleSession, "gmail", google);
      expect((await callback(googleSession.url, { state: "bad", code: googleCode })).status).toBe(400);
      expect(exchangeCount).toBe(0);
      expect(await request("mail.oauth.status", { sessionId: googleSession.slot.sessionId }, "web:other")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect((await callback(googleSession.url, { code: googleCode })).status).toBe(200);
      await expect.poll(() => status(googleSession.slot)).toMatchObject({ phase: "configured", route: "imap", smtp: true });
      expect(
        await callback(googleSession.url, { code: googleCode }).then(
          (reply) => reply.status,
          () => "closed",
        ),
      ).not.toBe(200);
      expect(exchangeCount).toBe(1);
      const googleAccount = (await list()).accounts[0]!;
      const mbox = { accountId: googleAccount.accountId, folder: "INBOX" };
      expect(await call("mail.sync.refresh", mbox)).toMatchObject({ message: { subject: "OAuth fixture" } });
      expect(imap.commands).toContain("AUTHENTICATE");
      expect(imap.commands).not.toContain("LOGIN");

      for (const [scopes, reason] of [
        ["Mail.ReadBasic", "graph-metadata-only"],
        ["https://graph.microsoft.com/Mail.Read", "wrong-resource"],
        ["openid email", "permission-missing"],
      ] as const) {
        const session = await begin("outlook", outlook);
        await callback(session.url, { code: ticketFor(session, "outlook", outlook, scopes) });
        await expect.poll(() => status(session.slot)).toMatchObject({ phase: "failed", reason });
      }
      const exchange = await begin("outlook", outlook);
      expect(exchange.url.searchParams.get("scope")).not.toContain("graph");
      await callback(exchange.url, { code: ticketFor(exchange, "outlook", outlook, "IMAP.AccessAsUser.All") });
      await expect.poll(() => status(exchange.slot)).toMatchObject({ phase: "configured", route: "imap", smtp: false });
      const outlookAccount = (await list()).accounts.find(({ definition }) => definition.settings.provider === "outlook")!;
      expect(outlookAccount.definition.oauth?.personal).toBe(true);
      expect(await call("mail.sync.refresh", { accountId: outlookAccount.accountId, folder: "INBOX" })).toMatchObject({ message: { subject: "OAuth fixture" } });
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
      const beforeSwitch = await begin("gmail", "switch@example.invalid");
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      blockEntered = entered.resolve;
      await callback(beforeSwitch.url, { code: ticketFor(beforeSwitch, "gmail", "switch@example.invalid", googleScopes, { hold: release.promise }) });
      await entered.promise;
      await engine.shutdown();
      release.resolve();
      const other = path.join(root, "other");
      mkdirSync(other);
      engine = await boot({ vaultPath: other, desktopUserData, create: true });
      expect(await request("mail.oauth.status", { sessionId: beforeSwitch.slot.sessionId })).toMatchObject({ ok: false });
      expect((await list()).accounts).toHaveLength(0);
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      expect((await list()).accounts).toHaveLength(2);
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
      injection.runtime = undefined;
      await engine?.shutdown();
      await imap.close();
      await smtp.close();
      issuer.closeAllConnections();
      await new Promise<void>((resolve) => issuer.close(() => resolve()));
      if (path.dirname(root) === tmpdir() && path.basename(root).startsWith("huhu-mail-oauth-")) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  120_000,
);
