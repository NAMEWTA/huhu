import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, type CapabilityContext, type HuhuApi, type OperationReceipts } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { MailOAuthError, oauthProvider, requestOAuthToken, verifyOAuthIdentity, type MailOAuthRuntime, type OAuthIssue } from "./oauth-provider.js";

import { mailRequestId, mailTool, requireMailCaller } from "./tool-access.js";

const callbackPath = "/mail/oauth/callback";
const id = z.uuidv4();
const sessionKey = z.strictObject({ sessionId: id });
const beginInput = z.strictObject({
  provider: oauthProvider,
  requestId: mailRequestId,
  email: z.string().trim().pipe(z.email()),
  label: z.string().trim().max(80).default(""),
  smtp: z.boolean().default(true),
  repair: z.strictObject({ accountId: id, expectedRevision: id }).optional(),
});
const phase = z.enum(["waiting", "finishing", "configured", "failed", "cancelled", "expired", "unknown"]);
const sessionOutput = z.strictObject({ sessionId: id, host: z.string(), phase, reason: z.string().optional(), accountId: id.optional(), route: z.literal("imap").optional(), smtp: z.boolean().optional() });
const storedStatus = sessionOutput.omit({ host: true });
const sessionIndex = z.strictObject({ actor: z.hash("sha256", { enc: "hex" }), accountId: id });
export const mailOAuthCapabilityDescriptors = {
  availability: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.oauth.availability",
    title: "查看邮箱授权配置",
    description: "查看当前 Engine 主机已配置的邮箱授权提供商。",
    risk: "normal",
    scope: "read",
    input: z.strictObject({}),
    output: z.strictObject({ host: z.string(), gmail: z.boolean(), outlook: z.boolean() }),
  }),
  begin: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.oauth.begin",
    title: "发起邮箱授权",
    description: "在 Engine 主机的系统浏览器为当前 Vault 发起邮箱授权或重新授权。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: beginInput,
    output: sessionOutput,
  }),
  status: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.oauth.status",
    title: "读取邮箱授权状态",
    description: "读取当前 Vault 中可管理的邮箱授权会话状态。",
    risk: "normal",
    scope: "read",
    input: sessionKey,
    output: sessionOutput,
  }),
  cancel: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.oauth.cancel",
    title: "取消邮箱授权",
    description: "请求取消当前 Vault 中可管理的邮箱授权会话并读取其状态。",
    risk: "normal",
    scope: "write",
    idempotency: "handler",
    input: sessionKey.extend({ requestId: mailRequestId }),
    output: sessionOutput,
  }),
};
type Status = z.infer<typeof sessionOutput>;

type Receipt = NonNullable<ReturnType<OperationReceipts["lookup"]>>;
type Accepted = Extract<Receipt, { phase: "accepted" }>;
type Session = { status: Status; actor: string; receipt: Accepted; key: string; controller: AbortController; close: () => void; stop?: "cancelled" | "expired" | "unknown" };
type IntentStore = { ledger: OperationReceipts; vaultInstance: string };
type Intent = { owner: string; capability: "mail.oauth.begin" | "mail.oauth.cancel"; key: string };
const random = () => randomBytes(32).toString("base64url");
const live = (s: Session) => s.status.phase === "waiting" || s.status.phase === "finishing";
function equalState(expected: string, supplied: string | null) {
  return supplied !== null && /^[\w-]{43}$/.test(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function reasonOf(error: unknown): OAuthIssue {
  if (error instanceof MailOAuthError) return error.reason;
  if ((error instanceof HuhuError && (error.code === "NOT_FOUND" || error.code === "VERSION_CONFLICT")) || (error instanceof CredentialError && error.code === "conflict")) return "account-changed";
  return "exchange-failed";
}

/** Session secrets and callback listeners are scoped to this one Vault/plugin lifetime. */
export function registerMailOAuth(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, runtime: MailOAuthRuntime | undefined, lifetime: AbortSignal, intents: IntentStore | undefined) {
  const sessions = new Map<string, Session>();
  const pending = new Set<Promise<void>>();
  const now = runtime?.now ?? Date.now;
  const host = runtime?.hostLabel ?? "当前 Engine 主机";
  const ledger = intents?.ledger;
  const indexOwner = createHash("sha256")
    .update(JSON.stringify([intents?.vaultInstance, "mail.oauth.session-index"]))
    .digest("hex");

  function persist(receipt: Accepted, status: Status) {
    if (status.phase === "unknown" || ledger?.lookup(receipt.owner, { operationId: receipt.operationId })?.phase !== "accepted") return;
    try {
      const { host: _host, ...data } = status;
      ledger.complete(receipt, "completed", { ok: true, data: storedStatus.parse(data) });
    } catch {
      // The begin claim still prevents a replay. A configured account can be reconciled from its protected generation.
    }
  }

  function end(session: Session, state: Status["phase"], reason?: OAuthIssue, configured?: { accountId: string; smtp: boolean }) {
    session.status = { sessionId: session.status.sessionId, host, phase: state, ...(reason && { reason }), ...(configured && { ...configured, route: "imap" as const }) };
    session.close();
    persist(session.receipt, session.status);
  }

  function stop(session: Session, reason: "cancelled" | "expired" | "unknown") {
    if (!live(session) || session.stop) return;
    session.stop = reason;
    session.controller.abort();
    session.close();
    if (session.status.phase === "waiting") end(session, reason, reason === "unknown" ? "commit-unconfirmed" : reason);
  }

  function actorOf({ caller, subject }: CapabilityContext) {
    requireMailCaller(caller, "mail.oauth");
    if (!subject || (caller === "http" && subject === caller)) throw errors.permissionDenied("mail.oauth");
    return createHash("sha256")
      .update(JSON.stringify([intents?.vaultInstance, caller, subject]))
      .digest("hex");
  }

  function getActive(context: CapabilityContext, sessionId: string) {
    const session = sessions.get(sessionId);
    if (session && session.actor !== actorOf(context) && context.caller !== "desktop") throw errors.notFound("授权会话已不存在。");
    return session;
  }

  function intentOf(context: CapabilityContext, capability: Intent["capability"], requestId?: string): Intent {
    if (!requestId && (context.caller === "cli" || context.caller === "mcp" || context.session)) throw errors.invalidInput("邮件授权操作需要固定的 requestId。");
    const key = requestId ?? context.idempotencyKey;
    if (!key) throw errors.invalidInput("邮件授权操作需要幂等键。");
    return { owner: actorOf(context), capability, key };
  }

  function claim(intent: Intent, input: unknown) {
    if (!ledger) throw errors.invalidInput("此 Vault 的本机授权操作存储不可用。");
    const { entry, mismatch } = ledger.claim(intent.owner, intent.capability, intent.key, input);
    if (mismatch) throw errors.idempotencyMismatch();
    return entry;
  }

  function replay(intent: Intent, input: unknown) {
    if (ledger?.lookup(intent.owner, { capability: intent.capability, intentKey: intent.key })) return claim(intent, input);
  }

  async function resumedStatus(context: CapabilityContext, sessionId: string): Promise<Status> {
    const active = getActive(context, sessionId);
    if (active && active.status.phase !== "unknown") return active.status;
    const lookup = ledger?.lookup(indexOwner, { capability: "mail.oauth.session-index", intentKey: sessionId });
    const indexed = lookup?.phase === "completed" && lookup.result.ok ? sessionIndex.safeParse(lookup.result.data) : undefined;
    const metadata = indexed?.success ? indexed.data : undefined;
    const actor = actorOf(context);
    const receipt = ledger?.lookup(context.caller === "desktop" ? (metadata?.actor ?? actor) : actor, { operationId: sessionId });
    if (!receipt || receipt.capability !== "mail.oauth.begin") throw errors.notFound("授权会话已不存在。");
    const unknown: Status = { sessionId, host, phase: "unknown", reason: "commit-unconfirmed" };
    if (receipt.phase === "completed" && receipt.result.ok) {
      const outcome = storedStatus.safeParse(receipt.result.data);
      return outcome.success && outcome.data.sessionId === sessionId ? { ...outcome.data, host } : unknown;
    }
    if (receipt.phase !== "accepted" || !metadata) return unknown;
    if (!ledger?.lookup(indexOwner, { capability: "mail.oauth.exchange", intentKey: sessionId })) return ledger?.available ? { sessionId, host, phase: "expired", reason: "expired" } : unknown;
    const proof = await accounts?.confirmOAuthCommit(metadata.accountId, sessionId);
    if (!proof) return unknown;
    const configured = { sessionId, host, phase: "configured", accountId: metadata.accountId, route: "imap", smtp: proof.smtp } as const;
    persist(receipt, configured);
    if (active) active.status = configured;
    return configured;
  }

  api.defineCapability(
    bindCapability(mailOAuthCapabilityDescriptors.availability, () => ({ host: runtime?.hostLabel ?? "当前 Engine 主机", gmail: Boolean(accounts && runtime?.issuers.gmail), outlook: Boolean(accounts && runtime?.issuers.outlook) })),
  );
  api.defineCapability(
    bindCapability(mailOAuthCapabilityDescriptors.begin, async (context, input) => {
      const { signal } = context;
      api.vault.files.assertWritable();
      signal.throwIfAborted();
      lifetime.throwIfAborted();
      const intent = intentOf(context, "mail.oauth.begin", input.requestId);
      const prior = replay(intent, input);
      if (prior) return resumedStatus(context, prior.operationId);
      const issuer = runtime?.issuers[input.provider];
      if (!runtime || !issuer || !accounts || !ledger) throw new HuhuError("INVALID_INPUT", "当前 Engine 主机尚未配置此邮件授权客户端。", { details: { reason: "not-configured" } });
      const previous = input.repair ? accounts.readDefinition(input.repair.accountId) : undefined;
      if (
        input.repair &&
        (!previous ||
          previous.revision !== input.repair.expectedRevision ||
          previous.definition.settings.provider !== input.provider ||
          previous.definition.settings.auth !== "oauth2" ||
          previous.definition.settings.email.toLowerCase() !== input.email.toLowerCase())
      ) {
        throw new HuhuError("VERSION_CONFLICT", "邮箱账号已变化，请重新打开授权。", { details: { reason: "account-changed" } });
      }
      const current = (await accounts.list()).find(({ definition }) => definition.settings.provider === input.provider && definition.settings.email.toLowerCase() === input.email.toLowerCase());
      signal.throwIfAborted();
      lifetime.throwIfAborted();
      const concurrent = replay(intent, input);
      if (concurrent) return resumedStatus(context, concurrent.operationId);
      if (!input.repair && current) throw new HuhuError("VERSION_CONFLICT", "该邮箱已存在，请使用重新授权。", { details: { reason: "account-changed" } });
      const key = `${input.provider}:${input.email.toLowerCase()}`;
      if ([...sessions.values()].some((session) => session.key === key && live(session))) throw errors.invalidInput("此邮箱已有在途授权。");
      for (const [key, session] of sessions) if (sessions.size >= 32 && !live(session)) sessions.delete(key);
      if (sessions.size >= 32) throw errors.invalidInput("在途邮箱授权过多。");
      // The persisted claim ID identifies the session. Only live process state holds its authorization material.
      const receipt = claim(intent, input);
      const sessionId = receipt.operationId;
      if (receipt.phase !== "accepted") return resumedStatus(context, sessionId);
      const accountId = input.repair?.accountId ?? randomUUID();
      const index = ledger.claim(indexOwner, "mail.oauth.session-index", sessionId, {}).entry;
      if (index.phase === "accepted") ledger.complete(index, "completed", { ok: true, data: sessionIndex.parse({ actor: intent.owner, accountId }) });
      const controller = new AbortController();
      const active = AbortSignal.any([lifetime, controller.signal, ...(input.repair ? [accounts.signal(input.repair.accountId)] : [])]);
      const state = random();
      const nonce = random();
      const verifier = random();
      let redirect: URL | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const server = createServer((request, response) => {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        const fail = () => {
          response.writeHead(400).end("This authorization response is invalid or has already been used.");
        };
        if (!redirect || request.method !== "GET" || request.headers.host !== redirect.host || !request.url?.startsWith("/") || request.url.startsWith("//") || active.aborted || session.status.phase !== "waiting") return fail();
        let incoming: URL;
        try {
          incoming = new URL(request.url, redirect);
        } catch {
          return fail();
        }
        const values = incoming.searchParams;
        if (incoming.origin !== redirect.origin || incoming.pathname !== callbackPath || values.getAll("state").length !== 1 || !equalState(state, values.get("state"))) return fail();
        const code = values.get("code");
        const refused = values.get("error");
        if (refused && !code && values.getAll("error").length === 1) {
          response.writeHead(200).end("Authorization ended. Return to Huhu.");
          end(session, "failed", refused === "access_denied" ? "denied" : "exchange-failed");
          return;
        }
        if (refused || !code || values.getAll("code").length !== 1 || !/^[\x21-\x7e]{1,8192}$/.test(code)) return fail();
        try {
          ledger.claim(indexOwner, "mail.oauth.exchange", sessionId, {});
        } catch {
          end(session, "unknown", "commit-unconfirmed");
          response.writeHead(503).end("Unable to confirm authorization. Return to Huhu.");
          return;
        }
        session.status = { ...session.status, phase: "finishing" };
        response.writeHead(200).end("Response received. Return to Huhu to check the result.");
        const redirectUri = redirect.href;
        const work = (async () => {
          try {
            const { bundle, idToken } = await requestOAuthToken(issuer, input.provider, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }, active, now());
            const identity = await verifyOAuthIdentity(issuer, input.provider, idToken, nonce, input.email, active, now());
            active.throwIfAborted();
            const saved = await accounts.saveOAuth(
              { sessionId, accountId, expectedRevision: input.repair?.expectedRevision ?? null, provider: input.provider, email: input.email, label: previous?.definition.settings.label ?? input.label, smtp: input.smtp },
              identity,
              bundle,
              active,
            );
            end(session, "configured", undefined, { accountId: saved.accountId, smtp: saved.definition.settings.smtpEnabled });
            if (!lifetime.aborted) api.events.publish("entity.changed", { kind: "mail-account", id: saved.accountId, op: input.repair ? "updated" : "created" });
          } catch (error) {
            if (session.status.phase === "configured") return;
            const cancellation = session.stop ?? (active.aborted ? "unknown" : undefined);
            const uncertain = cancellation === "unknown" || (error instanceof CredentialError && error.code === "storage-failed");
            if (uncertain) end(session, "unknown", "commit-unconfirmed");
            else end(session, cancellation ?? "failed", cancellation ?? reasonOf(error));
          }
        })();
        pending.add(work);
        void work.then(() => pending.delete(work));
      });
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        active.removeEventListener("abort", aborted);
        server.close();
        server.closeIdleConnections();
      };
      const aborted = () => stop(session, session.status.phase === "waiting" ? "cancelled" : "unknown");
      const session: Session = { status: { sessionId, host, phase: "waiting" }, actor: intent.owner, receipt, key, controller, close };
      sessions.set(sessionId, session);
      active.addEventListener("abort", aborted, { once: true });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => {
            if (closed) server.close();
            resolve();
          });
        });
        signal.throwIfAborted();
        active.throwIfAborted();
        const address = server.address();
        if (!address || typeof address === "string") throw new Error();
        redirect = new URL(`http://${issuer.callbackHost}:${address.port}${callbackPath}`);
        timer = setTimeout(() => stop(session, "expired"), runtime.ttlMs ?? 5 * 60_000);
        timer.unref();
        const auth = new URL(issuer.authorize);
        const scopes = input.smtp || input.provider !== "outlook" ? issuer.scopes : issuer.scopes.filter((scope) => !scope.endsWith("/SMTP.Send"));
        const parameters = new URLSearchParams({
          client_id: issuer.clientId,
          redirect_uri: redirect.href,
          response_type: "code",
          scope: scopes.join(" "),
          state,
          nonce,
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
          code_challenge_method: "S256",
          login_hint: input.email,
        });
        if (input.provider === "gmail") {
          parameters.set("access_type", "offline");
          parameters.set("prompt", "consent");
        } else parameters.set("response_mode", "query");
        auth.search = parameters.toString();
        // After launch the listener belongs to the session, even if the RPC response is lost.
        void runtime.openBrowser(auth.href).catch(() => {
          if (session.status.phase === "waiting") end(session, "failed", "browser-unavailable");
        });
      } catch {
        if (session.status.phase === "waiting") {
          if (signal.aborted || active.aborted) stop(session, "cancelled");
          else end(session, "failed", "browser-unavailable");
        }
      }
      return session.status;
    }),
  );
  api.defineCapability(bindCapability(mailOAuthCapabilityDescriptors.status, (context, { sessionId }) => resumedStatus(context, sessionId)));
  api.defineCapability(
    bindCapability(mailOAuthCapabilityDescriptors.cancel, async (context, input) => {
      api.vault.files.assertWritable();
      context.signal.throwIfAborted();
      lifetime.throwIfAborted();
      const intent = intentOf(context, "mail.oauth.cancel", input.requestId);
      const { sessionId } = input;
      if (replay(intent, input)) return resumedStatus(context, sessionId);
      const session = getActive(context, sessionId);
      const previous = session ? session.status : await resumedStatus(context, sessionId);
      lifetime.throwIfAborted();
      context.signal.throwIfAborted();
      claim(intent, input);
      if (session) stop(session, "cancelled");
      return session?.status ?? previous;
    }),
  );
  return async () => {
    for (const session of sessions.values()) stop(session, session.status.phase === "waiting" ? "cancelled" : "unknown");
    await Promise.allSettled(pending);
    sessions.clear();
  };
}
